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
  if (accountActive()) sendAction(name, args);
  return result;
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
