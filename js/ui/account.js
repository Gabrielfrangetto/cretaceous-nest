// Account button in the header, the account panel (username, name, password, sign out, delete) and
// the save status line. Signing in happens on the sign-in screen (ui/gate.js) before the game shows;
// back from a password-reset link, the panel opens by itself to choose the new password.
import { cloudState, onCloudChange, signOut, saveDisplayName, deleteAccount, setNewPassword, claimUsername, usernameAvailable, USERNAME, PASSWORD_MIN, passwordProblem } from '../cloud.js';
import { rulesList, watchRules } from './gate.js';
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
const keyOf = ({ user, profile, recovering }) => [user?.id, profile?.display_name, profile?.username, recovering].join('|');
let changingPassword = false;
const passwordForm = (title, hint) => `<form id="passForm" class="account-form">
      ${title ? `<h3>${title}</h3>` : ''}${hint ? `<p class="hint">${hint}</p>` : ''}
      <div class="field"><label for="newPass">New password</label>
      <input type="password" id="newPass" autocomplete="new-password" required minlength="${PASSWORD_MIN}" aria-describedby="newPassRules"></div>
      ${rulesList('newPassRules')}
      <div class="field"><label for="newPass2">New password again</label>
      <input type="password" id="newPass2" autocomplete="new-password" required minlength="${PASSWORD_MIN}"></div>
      <div class="row"><button class="btn" type="submit">Save password</button></div>
    </form>`;

function render() {
  renderStatus();
  const state = cloudState();
  panelKey = keyOf(state);
  const { user, profile, recovering } = state;
  const note = message ? `<p class="account-msg ${messageIsError ? 'error' : ''}" role="status">${esc(message)}</p>` : '';
  const legal = '<p class="hint legal"><a href="privacy.html">Privacy policy</a> · <a href="terms.html">Terms of use</a></p>';
  if (!user) { body.innerHTML = ''; return; }

  if (recovering) {
    body.innerHTML = `<h2 id="accountTitle">Choose a new password</h2>
      <p class="hint">Signed in as <strong>${esc(user.email || '')}</strong> from the reset link. Pick the password you'll log in with from now on.</p>
      ${passwordForm('', '')}${note}`;
    bindPassword();
    return;
  }
  // (an account made before usernames: one to pick, once)
  const nameRow = profile?.username ? `<p class="hint">Username: <strong>${esc(profile.username)}</strong></p>`
    : profile && 'username' in profile ? `<form id="claimForm" class="account-form">
      <div class="field"><label for="claimName">Choose your username</label>
      <input type="text" id="claimName" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" placeholder="3 to 20 letters, numbers or _"></div>
      <div class="row"><button class="ghost" type="submit">Save username</button></div>
    </form>` : '';
  body.innerHTML = `
    <h2 id="accountTitle">Your account</h2>
    <p class="hint">Signed in as <strong>${esc(user.email || '')}</strong></p>
    ${nameRow}
    <form id="nameForm2" class="account-form">
      <div class="field"><label for="displayName">Display name</label>
      <input type="text" id="displayName" maxlength="32" autocomplete="nickname" value="${esc(profile?.display_name || '')}" placeholder="How other players will see you"></div>
      <div class="row"><button class="ghost" type="submit">Save name</button></div>
    </form>
    ${changingPassword ? passwordForm('Change password', '') : ''}
    <div class="row">
      ${changingPassword ? '' : '<button class="ghost" type="button" id="passBtn">Change password</button>'}
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
  const passBtn = document.getElementById('passBtn');
  if (passBtn) passBtn.addEventListener('click', () => { changingPassword = true; message = ''; render(); document.getElementById('newPass').focus(); });
  if (changingPassword) bindPassword();
  const claim = document.getElementById('claimForm');
  if (claim) claim.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('claimName').value.trim();
    if (!USERNAME.test(name)) { say('A username is 3 to 20 letters, numbers or _ (no spaces).', true); return; }
    if (!(await usernameAvailable(name))) { say(`“${name}” is taken. Try another username.`, true); return; }
    try { await claimUsername(name); say('Username saved.'); }
    catch (err) { say('Could not save the username. Try another one.', true); }
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

// the new password (back from a reset link, or changed from the panel)
function bindPassword() {
  document.getElementById('passForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pass = document.getElementById('newPass').value;
    if (passwordProblem(pass)) { say(passwordProblem(pass), true); return; }
    if (pass !== document.getElementById('newPass2').value) { say("The two passwords don't match.", true); return; }
    try { await setNewPassword(pass); changingPassword = false; say('Password saved. Use it to log in from now on.'); }
    catch (err) { say(/should be|weak/i.test(err.message || '') ? 'That password is too weak. Use upper and lower case letters, a number and a symbol.' : 'Could not save the password. Try again.', true); }
  });
  watchRules(document.getElementById('newPass'), document.getElementById('newPassRules'));
}

export function initAccount() {
  const btn = document.getElementById('accountBtn');
  btn.hidden = devMode();
  btn.addEventListener('click', () => { message = ''; changingPassword = false; render(); dialog.showModal(); });
  document.getElementById('accountClose').addEventListener('click', () => dialog.close());
  onCloudChange(() => {
    // signing out brings the sign-in screen back; the panel closes with it
    if (!cloudState().user && dialog.open) dialog.close();
    // (back from a password-reset link, once the game shows: the new password to choose)
    if (cloudState().recovering && cloudState().loaded && !dialog.open) { message = ''; render(); dialog.showModal(); }
    if (keyOf(cloudState()) !== panelKey) render(); else renderStatus();
  });
  render();
}
