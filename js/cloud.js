// Accounts and the server-side game. When js/cloud-config.js is empty this module stays off and the
// game keeps its save in the browser only.
//
// Signed-in players never write their save directly: every action goes to the `game` Edge Function,
// which applies the same rules (js/economy.js) with the server's clock and stores the result.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './cloud-config.js';
import { S, replaceState, adoptState, migrate, freshState } from './state.js';
import { chooseSave, summarize } from './sync.js';
import { setServerTime } from './clock.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client = null;
let user = null;
let profile = null;
// local | loading | choose | saving | saved | error | unavailable
let status = 'local';
let choice = null;          // { local, remote, remoteSave } while the player picks a save

const listeners = new Set();
export const onCloudChange = fn => listeners.add(fn);
const emit = () => { for (const fn of listeners) fn(); };
const setStatus = s => { status = s; emit(); };

export const cloudState = () => ({ enabled: cloudEnabled, ready: !!client, user, profile, status, choice });

// true when actions should go to the server
export const accountActive = () => !!(client && user && !choice && status !== 'loading');

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
  // coming back to the tab picks up anything done on another device meanwhile
  document.addEventListener('visibilitychange', () => { if (!document.hidden && accountActive() && !pending.length && !working) resync(); });
  emit();
}

async function callGame(action, args = {}) {
  const { data, error } = await client.functions.invoke('game', { body: { action, args } });
  if (error) throw error;
  if (data && data.now) setServerTime(data.now);
  return data;
}

function adopt(state, fullReset) {
  const next = migrate(state);
  next.owner = user.id;
  if (fullReset) replaceState(next, 'cloud');
  else if (JSON.stringify({ ...next, updatedAt: 0 }) !== JSON.stringify({ ...S, updatedAt: 0 })) adoptState(next);
}

async function handleSession(session) {
  const next = session?.user || null;
  if ((next?.id || null) === (user?.id || null)) {
    if (next) user = next;    // token refresh: same player
    emit();
    return;
  }
  if (!next) {
    // signed out: the account's progress stays on the server and this browser starts a guest game
    user = null; profile = null; choice = null;
    pending.length = 0;
    replaceState(freshState(), 'cloud');
    setStatus('local');
    return;
  }
  user = next;
  setStatus('loading');
  let res;
  try {
    res = await callGame('load');
    loadProfile();
  } catch (e) {
    setStatus('error');
    return;
  }
  const remote = res.state ? migrate(res.state) : null;
  const decision = chooseSave(S, remote, user.id);
  if (decision === 'ask') {
    choice = { local: summarize(S), remote: summarize(remote), remoteSave: remote };
    setStatus('choose');
    return;
  }
  apply(decision, remote);
}

async function apply(decision, remote) {
  if (decision === 'use-remote') {
    adopt(remote, true);
    setStatus('saved');
    return;
  }
  setStatus('saving');
  try {
    const res = await callGame('claim', decision === 'start-fresh' ? { fresh: true } : { save: S, replace: !!remote });
    adopt(res.state, true);
    setStatus('saved');
  } catch (e) {
    setStatus('error');
  }
}

// the player picked a save after signing in with progress on both sides
export function resolveChoice(useCloud) {
  if (!choice) return;
  const remote = choice.remoteSave;
  choice = null;
  apply(useCloud ? 'use-remote' : 'claim', remote);
}

// ---------- action queue ----------
// Actions are sent one at a time, in order. Taps on the egg that pile up while a request is in
// flight are merged into one request. The server's copy is adopted once the queue is empty.
const pending = [];
let working = false;

export function sendAction(name, args = {}) {
  return new Promise(resolve => {
    const last = pending[pending.length - 1];
    if (name === 'warmEgg' && last && last.name === 'warmEgg') {
      last.args.taps += args.taps || 1;
      last.resolvers.push(resolve);
    } else {
      pending.push({ name, args: { ...args }, resolvers: [resolve] });
    }
    if (status !== 'saving') setStatus('saving');
    work();
  });
}

async function work() {
  if (working) return;
  working = true;
  let failed = false;
  while (pending.length) {
    const item = pending.shift();
    let res = null;
    try { res = await callGame(item.name, item.args); } catch (e) { failed = true; }
    if (res && res.state && !pending.length && user) adopt(res.state, false);
    for (const resolve of item.resolvers) resolve(res);
  }
  working = false;
  if (failed) { setStatus('error'); resync(); }
  else if (user) setStatus('saved');
}

async function resync() {
  if (!user) return;
  try {
    const res = await callGame('load');
    if (res.state) adopt(res.state, false);
    setStatus('saved');
  } catch (e) {
    setStatus('error');
  }
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

// the code printed in the sign-in email; signs in on this browser wherever the email was read
export async function verifySignInCode(email, code) {
  const { error } = await client.auth.verifyOtp({ email, token: code.replace(/\s+/g, ''), type: 'email' });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
  if (error) throw error;
}

export async function signOut() {
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
  pending.length = 0;
  const { error } = await client.rpc('delete_account');
  if (error) throw error;
  // the user no longer exists on the server, so only the local session is cleared
  await client.auth.signOut({ scope: 'local' });
}
