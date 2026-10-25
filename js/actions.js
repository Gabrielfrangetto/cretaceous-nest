// The one way the screens change the game. Each action is applied right away in the browser so the
// game feels instant; for signed-in players it is also sent to the server, whose answer wins.
import { applyAction } from './economy.js';
import { S, commit } from './state.js';
import { accountActive, sendAction } from './cloud.js';
import { now } from './clock.js';

export function act(name, args = {}) {
  const result = applyAction(S, name, args, now());
  if (!result.ok) return result;
  commit();
  // (the server's answer wins: when it turns down what was done here, the game goes back to how the
  // server has it, and the player is told why rather than seeing it quietly undone)
  if (accountActive()) sendAction(name, args).then(res => { if (res && res.ok === false) notice(`The server didn't accept that (${res.reason || 'no reason given'}), so it was undone.`); });
  return result;
}

// A short notice at the bottom of the screen, gone after a while or when tapped
export function notice(text) {
  let el = document.getElementById('notice');
  if (!el) {
    el = Object.assign(document.createElement('div'), { id: 'notice', className: 'notice' });
    el.setAttribute('role', 'alert');
    el.addEventListener('click', () => { el.hidden = true; });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = false;
  clearTimeout(el.timer);
  el.timer = setTimeout(() => { el.hidden = true; }, 9000);
}

// Hatching rolls the baby's sex, so for signed-in players the server rolls it and the browser waits.
export async function hatch() {
  if (!accountActive()) {
    const result = applyAction(S, 'hatch', {}, now());
    if (result.ok) commit();
    return result;
  }
  const res = await sendAction('hatch');
  if (!res) return { ok: false, reason: 'offline' };
  return res.ok ? { ok: true, ...res.result } : { ok: false, reason: res.reason };
}

// An event code: for signed-in players only the server knows whether it went in, so its answer is waited for
export async function redeem(code) {
  if (!accountActive()) return act('redeem', { code });
  const res = await sendAction('redeem', { code });
  if (!res) return { ok: false, reason: 'offline' };
  return res.ok ? { ok: true, ...res.result } : { ok: false, reason: res.reason };
}
