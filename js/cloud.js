// Accounts and the server-side game. Every game needs an account: until the player is signed in and
// their save has loaded, the sign-in screen (ui/gate.js) covers the game.
//
// Players never write their save directly: every action goes to the `game` Edge Function, which
// applies the same rules (js/economy.js) with the server's clock and stores the result.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './cloud-config.js';
import { S, replaceState, adoptState, migrate, freshState, legacySave, clearLegacySave } from './state.js';
import { chooseSave, summarize } from './sync.js';
import { setServerTime } from './clock.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client = null;
let user = null;
let profile = null;
// starting | signed-out | loading | choose | saving | saved | error | unavailable
let status = 'starting';
let loaded = false;         // the signed-in player's save has arrived from the server
let choice = null;          // { local, remote, remoteSave, localSave } while the player picks a save
let recovering = false;     // signed in by a password-reset link: a new password is to be chosen

const listeners = new Set();
export const onCloudChange = fn => listeners.add(fn);
const emit = () => { for (const fn of listeners) fn(); };
const setStatus = s => { status = s; emit(); };

export const cloudState = () => ({ enabled: cloudEnabled, ready: !!client, user, profile, status, choice, loaded, recovering });
// the game can be shown: signed in, save loaded, nothing left to choose
export const inGame = () => !!(user && loaded && !choice);

// true when actions should go to the server
export const accountActive = () => !!(client && user && !choice && status !== 'loading');

export async function initCloud() {
  if (!cloudEnabled) { setStatus('unavailable'); return; }
  try {
    const { createClient } = await import(SDK_URL);
    // implicit flow: an emailed link (confirming a new account, or resetting a password) signs the
    // player in on whatever browser opens it, which matters when it is asked for on a computer and
    // opened in a phone's mail app
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
    });
  } catch (e) {
    setStatus('unavailable');
    return;
  }
  // supabase-js asks not to await its own calls inside this callback, so the work runs right after it
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    setTimeout(() => handleSession(session), 0);
  });
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
    if (!next && status === 'starting') { setStatus('signed-out'); return; }   // nobody signed in on this browser
    emit();
    return;
  }
  if (!next) {
    // signed out: the progress stays on the server and the sign-in screen comes back
    user = null; profile = null; choice = null; loaded = false; recovering = false;
    pending.length = 0;
    replaceState(freshState(), 'cloud');
    setStatus('signed-out');
    return;
  }
  user = next;
  loaded = false;
  setStatus('loading');
  await loadAccount();
}

// loads the signed-in player's save; also the retry after a failed load
export async function loadAccount() {
  if (!user) return;
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
  // a game played in this browser before accounts were required moves into the account once
  const local = legacySave() || freshState();
  const decision = chooseSave(local, remote, user.id);
  if (decision === 'ask') {
    choice = { local: summarize(local), remote: summarize(remote), remoteSave: remote, localSave: local };
    setStatus('choose');
    return;
  }
  apply(decision, remote, local);
}

async function apply(decision, remote, local) {
  if (decision === 'use-remote') {
    adopt(remote, true);
    clearLegacySave();
    loaded = true;
    setStatus('saved');
    return;
  }
  setStatus('saving');
  try {
    const fresh = decision === 'start-fresh' || !local.hatched.length && !local.current && !local.coins;
    const res = await callGame('claim', fresh ? { fresh: true } : { save: local, replace: !!remote });
    adopt(res.state, true);
    clearLegacySave();
    loaded = true;
    setStatus('saved');
  } catch (e) {
    setStatus('error');
  }
}

// the player picked a save after signing in with progress on both sides
export function resolveChoice(useCloud) {
  if (!choice) return;
  const { remoteSave, localSave } = choice;
  choice = null;
  apply(useCloud ? 'use-remote' : 'claim', remoteSave, localSave);
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
  let { data, error } = await client.from('profiles').select('display_name, username').eq('id', user.id).maybeSingle();
  // (a database not yet given usernames)
  if (error) ({ data } = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle());
  profile = data || { display_name: null };
  emit();
}

// ---------- actions for the account panel ----------
const redirectUrl = () => location.origin + location.pathname;

// a username as the game takes it: 3 to 20 letters, digits or underscores
export const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
// what a password needs (the same as Supabase > Authentication > Email > Password requirements)
export const PASSWORD_RULES = [
  { text: `At least ${PASSWORD_MIN} characters`, ok: p => p.length >= PASSWORD_MIN },
  { text: 'An uppercase letter', ok: p => /[A-Z]/.test(p) },
  { text: 'A lowercase letter', ok: p => /[a-z]/.test(p) },
  { text: 'A number', ok: p => /[0-9]/.test(p) },
  { text: 'A symbol, such as ! ? @ # $ %', ok: p => /[^A-Za-z0-9\s]/.test(p) },
];
// what a password still lacks, as a sentence ('' when it has everything)
export function passwordProblem(p) {
  const missing = PASSWORD_RULES.filter(r => !r.ok(p)).map(r => r.text.toLowerCase().replace(/, such as.*/, ''));
  return missing.length ? `The password needs ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : '';
}

// whether a username can still be had (true when the server can't tell: the sign-up then decides)
export async function usernameAvailable(name) {
  const { data, error } = await client.rpc('username_available', { name });
  return error ? true : !!data;
}

// a new account: nothing to play with until the email is confirmed (by the link or the code in the
// email the server sends). 'exists' when the email already has an account.
export async function signUp(username, email, password) {
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: redirectUrl() } });
  if (error) throw error;
  // (an email already signed up comes back as an account with no ways in, so as not to tell anyone
  // which emails have accounts)
  if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) return 'exists';
  return data.session ? 'signed-in' : 'confirm';
}

// the code printed in the confirmation email; confirms and signs in on this browser wherever the
// email was read
export async function confirmSignUp(email, code) {
  const { error } = await client.auth.verifyOtp({ email, token: code.replace(/\s+/g, ''), type: 'signup' });
  if (error) throw error;
}

export async function resendConfirmation(email) {
  const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw error;
}

export async function logIn(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// a forgotten password: the emailed link signs the player in to choose a new one (recovering)
export async function sendPasswordReset(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) throw error;
}

export async function setNewPassword(password) {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
  recovering = false;
  emit();
}

// an account made before usernames picks one, once
export async function claimUsername(name) {
  const { error } = await client.rpc('claim_username', { name });
  if (error) throw error;
  profile = { ...profile, username: name, display_name: profile?.display_name || name };
  emit();
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
