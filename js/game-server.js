// What the `game` Edge Function does with each request, written against a small storage interface
// so the same code runs on the server and in the Node tests.
//
// store.load(userId)  -> { data, revision } | null
// store.write(userId, revision, data, action, change) -> new revision, or null when another request
//   wrote first (revision null means "create"; change is { coins, items } for the ledger)
import { applyAction } from './economy.js';
import { migrate, freshState } from './state.js';
import { capGuestSave } from './sync.js';

const RETRIES = 3;

function itemTotals(s) {
  const totals = {};
  for (const slot of s.inv || []) if (slot) totals[slot.id] = (totals[slot.id] || 0) + slot.n;
  return totals;
}

// coins and items gained (+) or spent (-) by one action, for the ledger
export function changeBetween(before, after) {
  const a = itemTotals(before), b = itemTotals(after);
  const items = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = (b[id] || 0) - (a[id] || 0);
    if (d) items[id] = d;
  }
  return { coins: (after.coins || 0) - (before.coins || 0), items };
}

export async function handleGame(store, userId, body, { now = Date.now, rand = Math.random } = {}) {
  const action = body && typeof body.action === 'string' ? body.action : '';
  const args = body && body.args && typeof body.args === 'object' ? body.args : {};

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const t = now();
    const row = await store.load(userId);
    const saved = row ? migrate(row.data) : null;
    if (saved) saved.owner = userId;
    const revision = row ? row.revision : null;

    if (action === 'load') return { status: 200, body: { ok: true, state: saved, now: t } };

    if (action === 'claim') {
      // first sign-in: bring the browser's guest game along, within plausible limits
      if (saved && !args.replace) return { status: 200, body: { ok: true, state: saved, now: t } };
      let next;
      try {
        next = args.fresh || !args.save ? freshState() : migrate(capGuestSave(migrate(args.save), t));
      } catch (e) {
        next = freshState();
      }
      next.owner = userId;
      next.updatedAt = t;
      const before = saved || { coins: 0, inv: [] };
      if (await store.write(userId, revision, next, 'claim', changeBetween(before, next)) == null) continue;
      return { status: 200, body: { ok: true, state: next, now: t } };
    }

    const state = saved || Object.assign(freshState(), { owner: userId });
    const before = JSON.parse(JSON.stringify(state));
    const result = applyAction(state, action, args, t, rand);
    if (!result.ok) return { status: 200, body: { ok: false, reason: result.reason, state: before, now: t } };
    state.updatedAt = t;
    if (await store.write(userId, revision, state, action, changeBetween(before, state)) == null) continue;
    return { status: 200, body: { ok: true, result, state, now: t } };
  }
  return { status: 409, body: { ok: false, reason: 'busy', now: now() } };
}
