// Game rules. Every function works on a state object passed in and touches no DOM or storage,
// so the same rules can be tested in Node and later run on a server.
import {
  SPECIES, ITEMS, TAP_MS, TAP_CAP, SLOTS, BASE_SLOTS, ROW, MAX_STACK, DIET, HUNGER_MIN_S, HUNGER_SPREAD_S,
  FEED_COINS, HATCH_COINS, HATCH_LOOT, FOOD_PACKS, ROW_PRICE,
} from './config.js';
import { hashId, newId } from './util.js';

// ---------- inventory ----------
export const countItem = (s, id) =>
  s.inv.reduce((t, slot, i) => t + (slot && slot.id === id && i < s.invSize ? slot.n : 0), 0);

// how many more of an item fit in the unlocked slots
export const roomFor = (s, id) =>
  s.inv.reduce((t, slot, i) => i >= s.invSize ? t : t + (!slot ? MAX_STACK : slot.id === id ? MAX_STACK - slot.n : 0), 0);

// fills matching stacks first, then empty slots; returns how many did not fit
export function addItem(s, id, n) {
  let left = n;
  for (let i = 0; i < s.invSize && left; i++) {
    const slot = s.inv[i];
    if (slot && slot.id === id && slot.n < MAX_STACK) { const k = Math.min(left, MAX_STACK - slot.n); slot.n += k; left -= k; }
  }
  for (let i = 0; i < s.invSize && left; i++) {
    if (!s.inv[i]) { const k = Math.min(left, MAX_STACK); s.inv[i] = { id, n: k }; left -= k; }
  }
  return left;
}

// takes from the smallest stacks first so big stacks stay together; returns how many were removed
export function removeItem(s, id, n) {
  const stacks = s.inv.map((slot, i) => [slot, i])
    .filter(([slot, i]) => slot && slot.id === id && i < s.invSize)
    .sort((a, b) => a[0].n - b[0].n);
  let removed = 0;
  for (const [slot, i] of stacks) {
    if (removed === n) break;
    const k = Math.min(n - removed, slot.n);
    slot.n -= k; removed += k;
    if (!slot.n) s.inv[i] = null;
  }
  return removed;
}

// drop slot a onto slot b: move into an empty slot, merge the same item up to 99, otherwise swap
export function moveSlot(s, a, b) {
  const A = s.inv[a], B = s.inv[b];
  if (!A || a === b) return false;
  if (!B) { s.inv[b] = A; s.inv[a] = null; }
  else if (B.id === A.id) {
    const k = Math.min(A.n, MAX_STACK - B.n);
    B.n += k; A.n -= k;
    if (!A.n) s.inv[a] = null;
    else if (!k) { s.inv[a] = B; s.inv[b] = A; }
  } else { s.inv[a] = B; s.inv[b] = A; }
  return true;
}

// merges repeated stacks and orders items by their order in ITEMS
export function sortInventory(s, itemOrder = Object.keys(ITEMS)) {
  const totals = {};
  for (const slot of s.inv) if (slot) totals[slot.id] = (totals[slot.id] || 0) + slot.n;
  s.inv = Array(SLOTS).fill(null);
  for (const id of itemOrder) if (totals[id]) addItem(s, id, totals[id]);
}

// moves half of a stack into the first empty slot; returns that slot or -1
export function splitStack(s, i) {
  const slot = s.inv[i];
  if (!slot || slot.n < 2) return -1;
  const j = s.inv.findIndex((x, k) => !x && k < s.invSize);
  if (j < 0) return -1;
  const half = Math.floor(slot.n / 2);
  slot.n -= half;
  s.inv[j] = { id: slot.id, n: half };
  return j;
}

export function discardOne(s, i) {
  const slot = s.inv[i];
  if (!slot) return false;
  slot.n -= 1;
  if (!slot.n) s.inv[i] = null;
  return true;
}

// ---------- eggs ----------
export function startEgg(s, type, now) {
  s.current = { type, startedAt: now, duration: SPECIES[type].mins * 60000, bonus: 0 };
}

export function eggProgress(egg, now) {
  const elapsed = now - egg.startedAt + (egg.bonus || 0);
  return { frac: Math.min(1, elapsed / egg.duration), left: Math.max(0, egg.duration - elapsed) };
}

// returns true when the tap actually saved time (taps stop counting at TAP_CAP)
export function warmEgg(s) {
  const egg = s.current;
  if (!egg) return false;
  const before = egg.bonus || 0;
  egg.bonus = Math.min(egg.duration * TAP_CAP, before + TAP_MS);
  return egg.bonus > before;
}

export function suggestName(s, type) {
  const count = s.hatched.filter(b => b.type === type).length;
  return count ? SPECIES[type].nick + ' ' + (count + 1) : SPECIES[type].nick;
}

// hatches the current egg if it is ready; the baby gets a default name it can be renamed from
export function hatchEgg(s, now, rand = Math.random) {
  const egg = s.current;
  if (!egg || eggProgress(egg, now).frac < 1) return null;
  const type = egg.type;
  const baby = { id: newId(), type, sex: rand() < 0.5 ? 'm' : 'f', name: suggestName(s, type), at: now };
  s.hatched.unshift(baby);
  const lootId = HATCH_LOOT[type];
  const lost = addItem(s, lootId, 1) > 0;
  s.coins += HATCH_COINS[type];
  s.current = null;
  return { baby, coins: HATCH_COINS[type], lootId, lost };
}

// ---------- babies ----------
// babies from before sexes existed get a stable one from their id
export const sexOf = b => b.sex === 'm' || b.sex === 'f' ? b.sex : (hashId(b.id) % 2 ? 'm' : 'f');

export const hungerEvery = b => (HUNGER_MIN_S + hashId(b.id) % HUNGER_SPREAD_S) * 1000;
export const isHungry = (b, now) => now - (b.lastFed || b.at) >= hungerEvery(b);

export function feedBaby(s, id, now) {
  const b = s.hatched.find(x => x.id === id);
  if (!b) return { ok: false, reason: 'missing' };
  if (!isHungry(b, now)) return { ok: false, reason: 'full' };
  const food = DIET[b.type];
  if (countItem(s, food) < 1) return { ok: false, reason: 'no-food', food };
  removeItem(s, food, 1);
  b.lastFed = now;
  b.fed = (b.fed || 0) + 1;
  s.coins += FEED_COINS;
  return { ok: true, food, coins: FEED_COINS };
}

// ---------- shop ----------
export const rowPrice = s => ROW_PRICE * ((s.invSize - BASE_SLOTS) / ROW + 1);

export function buyRow(s) {
  if (s.invSize >= SLOTS) return { ok: false, reason: 'maxed' };
  const price = rowPrice(s);
  if (s.coins < price) return { ok: false, reason: 'coins' };
  s.coins -= price;
  s.invSize += ROW;
  return { ok: true, price };
}

export function buyPack(s, k) {
  const pack = FOOD_PACKS[k];
  if (!pack) return { ok: false, reason: 'missing' };
  if (roomFor(s, pack.id) < pack.qty) return { ok: false, reason: 'room' };
  if (s.coins < pack.price) return { ok: false, reason: 'coins' };
  s.coins -= pack.price;
  addItem(s, pack.id, pack.qty);
  return { ok: true, pack };
}

// ---------- actions ----------
// Every change a player can make, by name. The browser applies these for instant feedback and the
// server applies the very same functions to decide what really happened, so the rules live once.
// Each returns { ok: true, ...details } or { ok: false, reason }.
const fail = reason => ({ ok: false, reason });
const slotIndex = (s, i) => Number.isInteger(i) && i >= 0 && i < s.invSize;
const MAX_TAPS_PER_REQUEST = 600;

export const ACTIONS = {
  startEgg(s, { type }, now) {
    if (s.current) return fail('busy');
    if (!SPECIES[type]) return fail('unknown-egg');
    startEgg(s, type, now);
    return { ok: true };
  },
  warmEgg(s, { taps = 1 }) {
    let saved = 0;
    const n = Math.min(MAX_TAPS_PER_REQUEST, Math.max(1, Math.floor(Number(taps) || 1)));
    for (let i = 0; i < n && warmEgg(s); i++) saved++;
    return saved ? { ok: true, saved } : fail('warm');
  },
  giveUpEgg(s) {
    if (!s.current) return fail('no-egg');
    s.current = null;
    return { ok: true };
  },
  hatch(s, args, now, rand) {
    const result = hatchEgg(s, now, rand);
    return result ? { ok: true, ...result } : fail('not-ready');
  },
  rename(s, { id, name }) {
    const baby = s.hatched.find(b => b.id === id);
    const clean = String(name ?? '').trim().slice(0, 24);
    if (!baby) return fail('missing');
    if (!clean) return fail('empty-name');
    baby.name = clean;
    return { ok: true };
  },
  feed(s, { id }, now) {
    return feedBaby(s, id, now);
  },
  move(s, { a, b }) {
    if (!slotIndex(s, a) || !slotIndex(s, b)) return fail('bad-slot');
    return moveSlot(s, a, b) ? { ok: true } : fail('empty-slot');
  },
  sort(s) {
    sortInventory(s);
    return { ok: true };
  },
  split(s, { i }) {
    if (!slotIndex(s, i)) return fail('bad-slot');
    const j = splitStack(s, i);
    return j >= 0 ? { ok: true, to: j } : fail('cannot-split');
  },
  discard(s, { i }) {
    if (!slotIndex(s, i)) return fail('bad-slot');
    return discardOne(s, i) ? { ok: true } : fail('empty-slot');
  },
  buyRow(s) {
    return buyRow(s);
  },
  buyPack(s, { k }) {
    return buyPack(s, k);
  },
};

export function applyAction(s, name, args, now, rand = Math.random) {
  const fn = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null;
  if (!fn) return fail('unknown-action');
  return fn(s, args && typeof args === 'object' ? args : {}, now, rand);
}
