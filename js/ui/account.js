// Account button in the header, the account panel (name, sign out, delete) and the save status line.
// Signing in happens on the sign-in screen (ui/gate.js) before the game shows.
import { cloudState, onCloudChange, signOut, saveDisplayName, deleteAccount } from '../cloud.js';
import { devMode } from '../state.js';
import { esc } from '../util.js';

const STATUS_TEXT = {
  loading: 'Loading your nest…',
  saving: 'Saving…',
  saved: 'Saved to your account',
  error: "Couldn't reach the server. Retrying…",
};

const dialog = document.getElementById('accountDialog');
const body = document.getElementById('accountBody');
let message = '', messageIsError = false;
let confirmDelete = false, deleteTimer = null;

function say(text, isError = false) { message = text; messageIsError = isError; render(); }

function renderStatus() {
  const { status } = cloudState();
  document.getElementById('syncStatus').textContent = devMode() ? 'Dev mode: saved in this browser only' : STATUS_TEXT[status] || '';
}

// the panel is redrawn only when what it shows changes, so typing in it is never interrupted by a save
let panelKey = '';
const keyOf = ({ user, profile }) => [user?.id, profile?.display_name].join('|');

function render() {
  renderStatus();
  const state = cloudState();
  panelKey = keyOf(state);
  const { user, profile } = state;
  const note = message ? `<p class="account-msg ${messageIsError ? 'error' : ''}" role="status">${esc(message)}</p>` : '';
  const legal = '<p class="hint legal"><a href="privacy.html">Privacy policy</a> · <a href="terms.html">Terms of use</a></p>';
  if (!user) { body.innerHTML = ''; return; }

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
    <p class="hint">Your progress stays in your account when you sign out.</p>
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
  btn.hidden = devMode();
  btn.addEventListener('click', () => { message = ''; render(); dialog.showModal(); });
  document.getElementById('accountClose').addEventListener('click', () => dialog.close());
  onCloudChange(() => {
    // signing out brings the sign-in screen back; the panel closes with it
    if (!cloudState().user && dialog.open) dialog.close();
    if (keyOf(cloudState()) !== panelKey) render(); else renderStatus();
  });
  render();
}
