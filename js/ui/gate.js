// The sign-in screen. Every game needs an account, so this covers the game until the player is signed
// in and their save has loaded: sign in by email (code or link) or Google, pick which progress to keep
// when an old browser game meets an account save, or retry when the server can't be reached.
import { GOOGLE_SIGN_IN } from '../cloud-config.js';
import {
  cloudState, onCloudChange, inGame, resolveChoice, loadAccount,
  sendSignInLink, verifySignInCode, signInWithGoogle, signOut,
} from '../cloud.js';
import { devMode } from '../state.js';
import { esc } from '../util.js';

const gate = document.getElementById('gate');
const body = document.getElementById('gateBody');
const game = document.getElementById('game');
let sentTo = '';           // email a sign-in link was sent to
let typedEmail = '';       // kept so an error does not wipe what the player typed
let message = '', messageIsError = false;
let shownKey = '';

const EGG = '<svg class="gate-egg" viewBox="0 0 100 130" aria-hidden="true"><path d="M50 4 C78 4 96 52 96 80 C96 108 76 126 50 126 C24 126 4 108 4 80 C4 52 22 4 50 4 Z" fill="#f0cd68" stroke="#b48114" stroke-width="3"/><path d="M60 18 L55 30 L62 38 L56 50" fill="none" stroke="#2b2416" stroke-width="3" stroke-linecap="round" opacity=".7"/><ellipse cx="50" cy="110" rx="40" ry="14" fill="#b48114" opacity=".3"/></svg>';
const LEGAL = '<p class="hint legal"><a href="privacy.html">Privacy policy</a> · <a href="terms.html">Terms of use</a></p>';

function say(text, isError = false) { message = text; messageIsError = isError; render(true); }

// network failures come back as raw browser messages such as 'Failed to fetch'
function friendly(err, fallback) {
  const text = err && err.message || '';
  if (!text || /fetch|network|load failed/i.test(text)) return "Couldn't reach the sign-in service. Check your connection and try again.";
  if (/rate limit|too many/i.test(text)) return 'Too many sign-in emails were sent. Wait a few minutes and try again.';
  if (/expired|invalid/i.test(text)) return 'That code is wrong or expired. Check the latest email, or send a new one.';
  return text || fallback;
}

function show(open) {
  gate.hidden = !open;
  game.hidden = open;
}

function render(force = false) {
  if (devMode()) { show(false); return; }
  const st = cloudState();
  if (inGame()) { show(false); return; }
  show(true);
  // redrawn only when what it shows changes, so typing is never interrupted
  const key = [st.status, !!st.user, !!st.choice, sentTo, message].join('|');
  if (key === shownKey && !force) return;
  shownKey = key;
  const note = message ? `<p class="account-msg ${messageIsError ? 'error' : ''}" role="status">${esc(message)}</p>` : '';
  const head = `${EGG}<h1 id="gateTitle">Cretaceous Nest</h1>
    <p class="sub">Hatch dinosaurs, raise them, and explore the wild land around your nest.</p>`;

  if (st.status === 'unavailable' || (st.status === 'error' && !st.user)) {
    body.innerHTML = `${head}<p class="hint">The game can't reach its server right now. Check your connection and try again.</p>
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
  body.innerHTML = sentTo ? `${head}
    <h2>Check your email</h2>
    <p>We sent a sign-in email to <strong>${esc(sentTo)}</strong>.</p>
    <form id="codeForm" class="account-form">
      <div class="field"><label for="signInCode">Type the code from the email</label>
      <input type="text" id="signInCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required placeholder="123456" class="code-input"></div>
      <div class="row"><button class="btn" type="submit">Sign in</button></div>
    </form>
    <p class="hint">Or open the link in the email. The link signs you in on the browser where you open it, so on a phone it signs in the phone.</p>
    <p class="hint">No email after a few minutes? Check your spam folder.</p>
    <div class="row"><button class="ghost" type="button" id="again">Send again or use a different email</button></div>
    ${note}` : `${head}
    <h2>Sign in to play</h2>
    <p class="hint">A free account keeps your nest safe on our server, so you can play on any device and never lose progress. New here? Signing in creates your account.</p>
    <form id="signInForm" class="account-form">
      <div class="field"><label for="signInEmail">Email</label>
      <input type="email" id="signInEmail" autocomplete="email" required placeholder="you@example.com" value="${esc(typedEmail)}"></div>
      <div class="row"><button class="btn" type="submit">Email me a sign-in code</button></div>
    </form>
    ${GOOGLE_SIGN_IN ? '<div class="row"><button class="ghost google" type="button" id="googleBtn">Continue with Google</button></div>' : ''}
    ${note}${LEGAL}`;
  if (sentTo) {
    document.getElementById('again').addEventListener('click', () => { sentTo = ''; message = ''; render(true); });
    document.getElementById('codeForm').addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.submitter || e.target.querySelector('button');
      button.disabled = true;
      try { await verifySignInCode(sentTo, document.getElementById('signInCode').value); message = ''; }
      catch (err) { button.disabled = false; say(friendly(err, 'Could not sign in with that code.'), true); }
    });
    document.getElementById('signInCode').focus();
    return;
  }
  document.getElementById('signInForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('signInEmail').value.trim();
    typedEmail = email;
    const button = e.submitter || e.target.querySelector('button');
    button.disabled = true;
    try { await sendSignInLink(email); sentTo = email; message = ''; render(true); }
    catch (err) { button.disabled = false; say(friendly(err, 'Could not send the email. Try again in a minute.'), true); }
  });
  const google = document.getElementById('googleBtn');
  if (google) google.addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (err) { say(friendly(err, 'Google sign-in failed. Try again.'), true); }
  });
}

export function initGate() {
  onCloudChange(() => {
    if (cloudState().user) { sentTo = ''; message = ''; }
    render();
  });
  render();
}
