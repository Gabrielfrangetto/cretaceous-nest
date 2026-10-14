// Account button in the header, the sign-in / account panel, and the save status line.
import { GOOGLE_SIGN_IN } from '../cloud-config.js';
import {
  cloudEnabled, cloudState, onCloudChange, resolveChoice,
  sendSignInLink, signInWithGoogle, signOut, saveDisplayName, deleteAccount,
} from '../cloud.js';
import { esc } from '../util.js';

const STATUS_TEXT = {
  local: 'Progress saved in this browser',
  unavailable: 'Accounts are unavailable right now. Progress is saved in this browser',
  loading: 'Loading your account…',
  choose: 'Choose which progress to keep',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved to your account',
  error: "Couldn't reach your account. Progress is kept in this browser",
};

const dialog = document.getElementById('accountDialog');
const body = document.getElementById('accountBody');
let sentTo = '';           // email a sign-in link was sent to
let typedEmail = '';       // kept so an error does not wipe what the player typed
let message = '', messageIsError = false;
let confirmDelete = false, deleteTimer = null;

function say(text, isError = false) { message = text; messageIsError = isError; render(); }

// network failures come back as raw browser messages such as 'Failed to fetch'
function friendly(err, fallback) {
  const text = err && err.message || '';
  if (!text || /fetch|network|load failed/i.test(text)) return "Couldn't reach the sign-in service. Check your connection and try again.";
  if (/rate limit|too many/i.test(text)) return 'Too many sign-in emails were sent. Wait a few minutes and try again.';
  return text || fallback;
}

function renderStatus() {
  const { user, status } = cloudState();
  document.getElementById('syncStatus').textContent = STATUS_TEXT[status] || STATUS_TEXT.local;
  document.getElementById('accountBtn').textContent = user ? 'Account' : 'Sign in';
}

// the panel is redrawn only when what it shows changes, so typing in it is never interrupted by a save
let panelKey = '';
const keyOf = ({ ready, user, profile, status, choice }) =>
  [ready, user?.id, profile?.display_name, !!choice, status === 'unavailable'].join('|');

function render() {
  renderStatus();
  const state = cloudState();
  panelKey = keyOf(state);
  const { ready, user, profile, status, choice } = state;

  const note = message ? `<p class="account-msg ${messageIsError ? 'error' : ''}" role="status">${esc(message)}</p>` : '';
  const legal = '<p class="hint legal"><a href="privacy.html">Privacy policy</a> · <a href="terms.html">Terms of use</a></p>';

  if (!ready) {
    body.innerHTML = `<h2 id="accountTitle">Accounts</h2><p class="hint">${status === 'unavailable'
      ? 'Accounts could not load. Check your connection and reload the page. Your progress is still saved in this browser.'
      : 'Loading…'}</p>`;
    return;
  }

  if (choice) {
    body.innerHTML = `
      <h2 id="accountTitle">Which progress do you want to keep?</h2>
      <p class="hint">Your account already has a saved game, and this browser has a game played without signing in.</p>
      <div class="choice">
        <button class="choice-card" type="button" id="keepCloud"><strong>Your account</strong><span>${esc(choice.remote)}</span></button>
        <button class="choice-card" type="button" id="keepLocal"><strong>This browser</strong><span>${esc(choice.local)}</span></button>
      </div>
      <p class="hint">The other one is replaced. To keep a copy first, close this panel and use “Back up or move your progress” at the bottom of the page.</p>`;
    document.getElementById('keepCloud').addEventListener('click', () => resolveChoice(true));
    document.getElementById('keepLocal').addEventListener('click', () => resolveChoice(false));
    return;
  }

  if (!user) {
    body.innerHTML = sentTo ? `
      <h2 id="accountTitle">Check your email</h2>
      <p>We sent a sign-in link to <strong>${esc(sentTo)}</strong>. Open it to finish signing in. You will be signed in on the browser where you open it.</p>
      <p class="hint">No email after a few minutes? Check your spam folder or send it again.</p>
      <div class="row"><button class="ghost" type="button" id="again">Use a different email</button></div>
      ${note}` : `
      <h2 id="accountTitle">Save your progress</h2>
      <p class="hint">A free account keeps your nest safe and lets you play on any device. The game you have in this browser moves to your account.</p>
      <form id="signInForm" class="account-form">
        <div class="field"><label for="signInEmail">Email</label>
        <input type="email" id="signInEmail" autocomplete="email" required placeholder="you@example.com" value="${esc(typedEmail)}"></div>
        <div class="row"><button class="btn" type="submit">Email me a sign-in link</button></div>
      </form>
      ${GOOGLE_SIGN_IN ? '<div class="row"><button class="ghost google" type="button" id="googleBtn">Continue with Google</button></div>' : ''}
      ${note}${legal}`;
    if (sentTo) {
      document.getElementById('again').addEventListener('click', () => { sentTo = ''; message = ''; render(); });
      return;
    }
    document.getElementById('signInForm').addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('signInEmail').value.trim();
      typedEmail = email;
      const button = e.submitter || e.target.querySelector('button');
      button.disabled = true;
      try { await sendSignInLink(email); sentTo = email; message = ''; render(); }
      catch (err) { button.disabled = false; say(friendly(err, 'Could not send the link. Try again in a minute.'), true); }
    });
    const google = document.getElementById('googleBtn');
    if (google) google.addEventListener('click', async () => {
      try { await signInWithGoogle(); } catch (err) { say(friendly(err, 'Google sign-in failed. Try again.'), true); }
    });
    return;
  }

  body.innerHTML = `
    <h2 id="accountTitle">Your account</h2>
    <p class="hint">Signed in as <strong>${esc(user.email || '')}</strong></p>
    <form id="nameForm2" class="account-form">
      <div class="field"><label for="displayName">Display name</label>
      <input type="text" id="displayName" maxlength="32" autocomplete="nickname" value="${esc(profile?.display_name || '')}" placeholder="How other players will see you"></div>
      <div class="row"><button class="ghost" type="submit">Save name</button></div>
    </form>
    <div class="row">
      <button class="ghost" type="button" id="signOutBtn">Sign out</button>
      <button class="ghost ${confirmDelete ? 'warn' : ''}" type="button" id="deleteBtn">${confirmDelete ? 'Tap again to delete your account and progress for good' : 'Delete account'}</button>
    </div>
    <p class="hint">Signing out leaves your progress in your account and starts a new game in this browser.</p>
    ${note}${legal}`;
  document.getElementById('nameForm2').addEventListener('submit', async e => {
    e.preventDefault();
    try { await saveDisplayName(document.getElementById('displayName').value); say('Name saved.'); }
    catch (err) { say('Could not save the name. Try again.', true); }
  });
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    try { await signOut(); message = ''; dialog.close(); }
    catch (err) { say('Could not sign out. Try again.', true); }
  });
  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!confirmDelete) {
      confirmDelete = true; render();
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => { confirmDelete = false; render(); }, 6000);
      return;
    }
    clearTimeout(deleteTimer); confirmDelete = false;
    try { await deleteAccount(); say('Your account and its progress were deleted.'); }
    catch (err) { say('Could not delete the account. Try again.', true); }
  });
}

export function initAccount() {
  const btn = document.getElementById('accountBtn');
  if (!cloudEnabled) { btn.hidden = true; render(); return; }
  btn.hidden = false;
  btn.addEventListener('click', () => { message = ''; render(); dialog.showModal(); });
  document.getElementById('accountClose').addEventListener('click', () => dialog.close());
  // after a sign-in the panel must stay open for the player to pick a save
  onCloudChange(() => {
    if (cloudState().status === 'choose' && !dialog.open) dialog.showModal();
    if (cloudState().user) sentTo = '';
    if (keyOf(cloudState()) !== panelKey) render(); else renderStatus();
  });
  render();
}
