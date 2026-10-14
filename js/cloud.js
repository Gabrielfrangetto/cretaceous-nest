// Accounts and cloud saves through Supabase. When js/cloud-config.js is empty this module stays
// off and the game keeps its save in the browser only.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './cloud-config.js';
import { S, subscribe, replaceState, persist, migrate, freshState, SAVE_VERSION } from './state.js';
import { chooseSave, summarize } from './sync.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const UPLOAD_DELAY_MS = 2000;

export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client = null;
let user = null;
let profile = null;
// local | loading | choose | pending | saving | saved | error | unavailable
let status = 'local';
let choice = null;          // { local, remote, remoteSave } while the player picks a save
let timer = null, uploading = false, uploadAgain = false;

const listeners = new Set();
export const onCloudChange = fn => listeners.add(fn);
const emit = () => { for (const fn of listeners) fn(); };
const setStatus = s => { status = s; emit(); };

export const cloudState = () => ({ enabled: cloudEnabled, ready: !!client, user, profile, status, choice });

export async function initCloud() {
  if (!cloudEnabled) return;
  try {
    const { createClient } = await import(SDK_URL);
    // implicit flow: the emailed link signs the player in on whatever browser opens it, which matters
    // when the link is requested on a computer and opened in a phone's mail app
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
    });
  } catch (e) {
    setStatus('unavailable');
    return;
  }
  // supabase-js asks not to await its own calls inside this callback, so the work runs right after it
  client.auth.onAuthStateChange((event, session) => { setTimeout(() => handleSession(session), 0); });
  subscribe((kind, source) => { if (user && !choice && source !== 'cloud') scheduleUpload(); });
  window.addEventListener('pagehide', () => { if (timer) uploadNow(); });
  emit();
}

async function handleSession(session) {
  const next = session?.user || null;
  if ((next?.id || null) === (user?.id || null)) {
    if (next) user = next;    // token refresh: same player
    emit();
    return;
  }
  if (!next) {
    // signed out: the account's progress stays in the cloud and this browser starts a guest game
    user = null; profile = null; choice = null;
    clearTimeout(timer); timer = null;
    replaceState(freshState(), 'cloud');
    setStatus('local');
    return;
  }
  user = next;
  setStatus('loading');
  let remote;
  try {
    remote = await fetchSave();
    loadProfile();
  } catch (e) {
    setStatus('error');
    return;
  }
  const decision = chooseSave(S, remote, user.id);
  if (decision === 'ask') {
    choice = { local: summarize(S), remote: summarize(remote), remoteSave: remote };
    setStatus('choose');
    return;
  }
  apply(decision, remote);
}

async function fetchSave() {
  const { data, error } = await client.from('saves').select('data').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? migrate(data.data) : null;
}

function apply(decision, remote) {
  if (decision === 'use-remote') {
    remote.owner = user.id;
    replaceState(remote, 'cloud');
    setStatus('saved');
  } else if (decision === 'start-fresh') {
    const fresh = freshState();
    fresh.owner = user.id;
    replaceState(fresh, 'cloud');
    uploadNow();
  } else {
    S.owner = user.id;
    persist();
    uploadNow();
  }
}

// the player picked a save after signing in with progress on both sides
export function resolveChoice(useCloud) {
  if (!choice) return;
  const remote = choice.remoteSave;
  choice = null;
  apply(useCloud ? 'use-remote' : 'upload-local', remote);
}

function scheduleUpload() {
  clearTimeout(timer);
  timer = setTimeout(uploadNow, UPLOAD_DELAY_MS);
  if (status !== 'saving') setStatus('pending');
}

async function uploadNow() {
  clearTimeout(timer); timer = null;
  if (!client || !user) return;
  if (uploading) { uploadAgain = true; return; }
  uploading = true;
  setStatus('saving');
  let ok = false;
  try {
    const { error } = await client.from('saves').upsert({
      user_id: user.id, data: S, save_version: SAVE_VERSION, updated_at: new Date().toISOString(),
    });
    ok = !error;
  } catch (e) { ok = false; }
  uploading = false;
  setStatus(ok ? 'saved' : 'error');
  if (uploadAgain) { uploadAgain = false; uploadNow(); }
}

async function loadProfile() {
  const { data } = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  profile = data || { display_name: null };
  emit();
}

// ---------- actions for the account panel ----------
const redirectUrl = () => location.origin + location.pathname;

export async function sendSignInLink(email) {
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
  if (error) throw error;
}

export async function signOut() {
  if (timer) await uploadNow();
  await client.auth.signOut();
}

export async function saveDisplayName(name) {
  const display_name = name.trim().slice(0, 32) || null;
  const { error } = await client.from('profiles').update({ display_name }).eq('id', user.id);
  if (error) throw error;
  profile = { display_name };
  emit();
}

export async function deleteAccount() {
  clearTimeout(timer); timer = null;
  const { error } = await client.rpc('delete_account');
  if (error) throw error;
  // the user no longer exists on the server, so only the local session is cleared
  await client.auth.signOut({ scope: 'local' });
}
