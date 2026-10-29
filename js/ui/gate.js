// What comes before the game. Every game needs an account, so until the player is signed in and their
// save has loaded the game stays hidden:
//   - signed out: the landing page (index.html #landing, ui/landing.js), whose Play buttons open the
//     sign-in window: log in with email and password, or create an account (username, email,
//     password; activated from the email it is sent), a forgotten password, Google when enabled;
//   - signing in, loading, a failed load, or picking which progress to keep: a simple card (#gate).
import { GOOGLE_SIGN_IN } from '../cloud-config.js';
import {
  cloudState, onCloudChange, inGame, resolveChoice, loadAccount,
  signInWithGoogle, signOut, logIn, signUp, confirmSignUp, resendConfirmation, sendPasswordReset,
  usernameAvailable, USERNAME, PASSWORD_MIN, PASSWORD_RULES, passwordProblem,
} from '../cloud.js';
import { devMode } from '../state.js';
import { esc } from '../util.js';

const landing = document.getElementById('landing');
const gate = document.getElementById('gate');
const body = document.getElementById('gateBody');
const game = document.getElementById('game');
const signIn = document.getElementById('signInDialog');
const signInBody = document.getElementById('signInBody');
// login | signup | confirm (the new account's email) | forgot | reset-sent
let view = 'login';
const typed = { email: '', username: '' };   // kept so an error does not wipe what the player typed
let message = '', messageIsError = false;
let shownKey = '';

const EGG = '<svg class="gate-egg" viewBox="0 0 100 130" aria-hidden="true"><path d="M50 4 C78 4 96 52 96 80 C96 108 76 126 50 126 C24 126 4 108 4 80 C4 52 22 4 50 4 Z" fill="#f0cd68" stroke="#b48114" stroke-width="3"/><path d="M60 18 L55 30 L62 38 L56 50" fill="none" stroke="#2b2416" stroke-width="3" stroke-linecap="round" opacity=".7"/><ellipse cx="50" cy="110" rx="40" ry="14" fill="#b48114" opacity=".3"/></svg>';
const LEGAL = '<p class="hint legal"><a href="privacy.html">Privacy policy</a> · <a href="terms.html">Terms of use</a></p>';

function say(text, isError = false) { message = text; messageIsError = isError; render(true); }

// network failures come back as raw browser messages such as 'Failed to fetch'
function friendly(err, fallback) {
  const text = err && err.message || '';
  if (!text || /fetch|network|load failed/i.test(text)) return "Couldn't reach the sign-in service. Check your connection and try again.";
  if (/rate limit|too many/i.test(text)) return 'Too many emails were sent. Wait a few minutes and try again.';
  if (/invalid login credentials/i.test(text)) return 'Wrong email or password.';
  if (/database error saving new user/i.test(text)) return 'That username was just taken. Try another one.';
  if (/password should be|weak password/i.test(text)) return 'That password is too weak. Use upper and lower case letters, a number and a symbol.';
  if (/expired|invalid/i.test(text)) return 'That code is wrong or expired. Check the latest email, or send a new one.';
  return text || fallback;
}

// 'game' | 'landing' | 'gate'
function modeOf(st) {
  if (devMode() || inGame()) return 'game';
  // the landing page also shows while the session is checked, since most visitors are signed out
  if (!st.user && ['starting', 'signed-out', 'unavailable', 'error'].includes(st.status)) return 'landing';
  return 'gate';
}

function show(mode) {
  landing.hidden = mode !== 'landing';
  gate.hidden = mode !== 'gate';
  game.hidden = mode !== 'game';
  if (mode !== 'landing' && signIn.open) signIn.close();
  document.body.classList.toggle('on-landing', mode === 'landing');
}

// the landing page's Play buttons: logging in, or (view 'signup') making an account
export function openSignIn(next = 'login') {
  if (next === 'login' || next === 'signup') { view = next; message = ''; }
  render(true);
  if (!signIn.open) signIn.showModal();
  focusFirst();
}

function render(force = false) {
  const st = cloudState();
  const mode = modeOf(st);
  show(mode);
  if (mode === 'game') return;
  // redrawn only when what it shows changes, so typing is never interrupted
  const key = [mode, st.status, !!st.user, !!st.choice, view, message].join('|');
  if (key === shownKey && !force) return;
  shownKey = key;
  const note = message ? `<p class="account-msg ${messageIsError ? 'error' : ''}" role="status">${esc(message)}</p>` : '';
  // the sign-in window sits on the landing page, which already shows the title
  const target = mode === 'landing' ? signInBody : body;
  const head = mode === 'landing' ? EGG : `${EGG}<h1 id="gateTitle">Cretaceous Nest</h1>
    <p class="sub">Hatch dinosaurs, raise them, and explore the wild land around your nest.</p>`;

  if (st.status === 'unavailable' || (st.status === 'error' && !st.user)) {
    target.innerHTML = `${head}<p class="hint">The game can't reach its server right now. Check your connection and try again.</p>
      <div class="row"><button class="btn" type="button" id="gateRetry">Try again</button></div>`;
    document.getElementById('gateRetry').addEventListener('click', () => location.reload());
    return;
  }
  if (st.user && st.status === 'error') {
    body.innerHTML = `${head}<p class="hint">Signed in as <strong>${esc(st.user.email || '')}</strong>, but your nest couldn't be loaded.</p>
      <div class="row"><button class="btn" type="button" id="gateRetry">Try again</button><button class="ghost" type="button" id="gateOut">Sign out</button></div>`;
    document.getElementById('gateRetry').addEventListener('click', () => loadAccount());
    document.getElementById('gateOut').addEventListener('click', () => signOut());
    return;
  }
  if (st.choice) {
    body.innerHTML = `${head}
      <h2>Which progress do you want to keep?</h2>
      <p class="hint">Your account already has a saved game, and this browser still has a game played before accounts were needed. Games are only kept in accounts now, so pick one; the other is replaced.</p>
      <div class="choice">
        <button class="choice-card" type="button" id="keepCloud"><strong>Your account</strong><span>${esc(st.choice.remote)}</span></button>
        <button class="choice-card" type="button" id="keepLocal"><strong>This browser</strong><span>${esc(st.choice.local)}</span></button>
      </div>`;
    document.getElementById('keepCloud').addEventListener('click', () => resolveChoice(true));
    document.getElementById('keepLocal').addEventListener('click', () => resolveChoice(false));
    return;
  }
  if (st.user || st.status === 'starting' || st.status === 'loading' || st.status === 'saving') {
    body.innerHTML = `${head}<p class="hint gate-wait" role="status">${st.user ? 'Loading your nest…' : 'Loading…'}</p>`;
    return;
  }

  // signed out
  target.innerHTML = `${head}${signedOutView()}${note}`;
  bindSignedOut(target);
}

// ---------- signed out: log in, create an account, confirm its email, a forgotten password ----------
const field = (id, label, type, attrs = '') => `<div class="field"><label for="${id}">${label}</label>
  <input type="${type}" id="${id}" ${attrs}></div>`;
const tabs = () => `<div class="auth-tabs" role="tablist">
  <button type="button" role="tab" class="${view === 'login' ? 'on' : ''}" aria-selected="${view === 'login'}" data-view="login">Log in</button>
  <button type="button" role="tab" class="${view === 'signup' ? 'on' : ''}" aria-selected="${view === 'signup'}" data-view="signup">Create account</button>
</div>`;
const googleRow = () => GOOGLE_SIGN_IN ? '<div class="row"><button class="ghost google" type="button" id="googleBtn">Continue with Google</button></div>' : '';

function signedOutView() {
  if (view === 'confirm') return `<h2 id="signInTitle">Confirm your email</h2>
    <p>We sent an email to <strong>${esc(typed.email)}</strong>. Open the link in it, or type its code here, to activate your account.</p>
    <form id="codeForm" class="account-form">
      ${field('signInCode', 'Code from the email', 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="10" required placeholder="123456" class="code-input"')}
      <div class="row"><button class="btn" type="submit">Activate account</button></div>
    </form>
    <p class="hint">The link signs you in on the browser where you open it, so on a phone it signs in the phone. No email after a few minutes? Check your spam folder.</p>
    <div class="row"><button class="ghost" type="button" id="resendBtn">Send the email again</button><button class="ghost" type="button" data-view="login">Back to log in</button></div>`;
  if (view === 'forgot') return `<h2 id="signInTitle">Forgot your password?</h2>
    <p class="hint">Type your account's email and we'll send you a link to choose a new password.</p>
    <form id="forgotForm" class="account-form">
      ${field('signInEmail', 'Email', 'email', `autocomplete="email" required placeholder="you@example.com" value="${esc(typed.email)}"`)}
      <div class="row"><button class="btn" type="submit">Send the link</button><button class="ghost" type="button" data-view="login">Back to log in</button></div>
    </form>`;
  if (view === 'reset-sent') return `<h2 id="signInTitle">Check your email</h2>
    <p>If <strong>${esc(typed.email)}</strong> has an account, an email is on its way with a link to choose a new password. Open it on the device you want to play on.</p>
    <div class="row"><button class="ghost" type="button" data-view="login">Back to log in</button></div>`;
  if (view === 'signup') return `${tabs()}
    <p class="hint">A free account keeps your nest safe on our server, so you can play on any device and never lose progress.</p>
    <form id="signUpForm" class="account-form">
      ${field('signUpName', 'Username', 'text', `autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" placeholder="3 to 20 letters, numbers or _" value="${esc(typed.username)}"`)}
      ${field('signInEmail', 'Email', 'email', `autocomplete="email" required placeholder="you@example.com" value="${esc(typed.email)}"`)}
      ${field('signUpPass', 'Password', 'password', `autocomplete="new-password" required minlength="${PASSWORD_MIN}" aria-describedby="signUpRules"`)}
      ${rulesList('signUpRules')}
      ${field('signUpPass2', 'Password again', 'password', `autocomplete="new-password" required minlength="${PASSWORD_MIN}"`)}
      <div class="row"><button class="btn" type="submit">Create account</button></div>
    </form>
    ${googleRow()}${LEGAL}`;
  return `${tabs()}
    <form id="logInForm" class="account-form">
      ${field('signInEmail', 'Email', 'email', `autocomplete="email" required placeholder="you@example.com" value="${esc(typed.email)}"`)}
      ${field('logInPass', 'Password', 'password', 'autocomplete="current-password" required')}
      <div class="row"><button class="btn" type="submit">Log in</button><button class="ghost" type="button" data-view="forgot">Forgot password?</button></div>
    </form>
    <p class="hint">Played before with an emailed code? Use “Forgot password?” to give your account a password.</p>
    ${googleRow()}${LEGAL}`;
}

// what a new password needs, each ticked as it is typed (watchRules)
export const rulesList = id => `<ul class="pass-rules" id="${id}">${PASSWORD_RULES.map(r => `<li>${r.text}</li>`).join('')}</ul>`;
export function watchRules(input, list) {
  const tick = () => [...list.children].forEach((li, i) => li.classList.toggle('ok', PASSWORD_RULES[i].ok(input.value)));
  input.addEventListener('input', tick);
  tick();
}

function go(next) { view = next; message = ''; render(true); focusFirst(); }
function focusFirst() { const f = (signIn.open ? signInBody : body).querySelector('input'); if (f) f.focus(); }
// the form's button held down while the request is out, and the answer (or what went wrong) shown
async function busy(e, work, fallback) {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try { await work(); }
  catch (err) { if (button) button.disabled = false; say(friendly(err, fallback), true); }
}
const value = id => (document.getElementById(id)?.value || '');

function bindSignedOut(root) {
  root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  const remember = () => { typed.email = value('signInEmail').trim() || typed.email; typed.username = value('signUpName').trim() || typed.username; };
  root.querySelectorAll('input').forEach(i => i.addEventListener('input', remember));
  const pass = document.getElementById('signUpPass');
  if (pass) watchRules(pass, document.getElementById('signUpRules'));
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('submit', fn); };
  on('logInForm', e => busy(e, async () => {
    typed.email = value('signInEmail').trim();
    try { await logIn(typed.email, value('logInPass')); message = ''; }
    catch (err) {
      // (an account whose email is not confirmed yet: straight to confirming it)
      if (/not confirmed/i.test(err.message || '')) { view = 'confirm'; say('Your email is not confirmed yet. Open the link we sent, or type its code below.', true); return; }
      throw err;
    }
  }, 'Could not log in. Try again.'));
  on('signUpForm', e => busy(e, async () => {
    const username = value('signUpName').trim(), email = value('signInEmail').trim(), pass = value('signUpPass');
    typed.username = username; typed.email = email;
    if (!USERNAME.test(username)) throw new Error('A username is 3 to 20 letters, numbers or _ (no spaces).');
    if (passwordProblem(pass)) throw new Error(passwordProblem(pass));
    if (pass !== value('signUpPass2')) throw new Error("The two passwords don't match.");
    if (!(await usernameAvailable(username))) throw new Error(`“${username}” is taken. Try another username.`);
    const r = await signUp(username, email, pass);
    if (r === 'exists') { view = 'login'; say('That email already has an account. Log in, or use “Forgot password?”.', true); return; }
    if (r === 'confirm') { view = 'confirm'; message = ''; render(true); focusFirst(); }
  }, 'Could not create the account. Try again.'));
  on('codeForm', e => busy(e, async () => { await confirmSignUp(typed.email, value('signInCode')); message = ''; }, 'Could not activate with that code.'));
  on('forgotForm', e => busy(e, async () => {
    typed.email = value('signInEmail').trim();
    await sendPasswordReset(typed.email);
    go('reset-sent');
  }, 'Could not send the email. Try again in a minute.'));
  const resend = document.getElementById('resendBtn');
  if (resend) resend.addEventListener('click', async () => {
    resend.disabled = true;
    try { await resendConfirmation(typed.email); say('Sent again. Check your inbox (and spam).'); }
    catch (err) { resend.disabled = false; say(friendly(err, 'Could not send the email. Try again in a minute.'), true); }
  });
  const google = document.getElementById('googleBtn');
  if (google) google.addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (err) { say(friendly(err, 'Google sign-in failed. Try again.'), true); }
  });
}

export function initGate() {
  document.getElementById('signInClose').addEventListener('click', () => signIn.close());
  // a click on the dimmed backdrop closes the window too
  signIn.addEventListener('click', e => { if (e.target === signIn) signIn.close(); });
  onCloudChange(() => {
    if (cloudState().user) { view = 'login'; message = ''; }
    render();
  });
  render();
}
