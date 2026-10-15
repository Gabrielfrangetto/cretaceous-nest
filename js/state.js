// The player's save: loading, versioned migrations, local persistence, export/import codes,
// and a tiny change feed the UI modules subscribe to.
import { SPECIES, ITEMS, STARTER, SLOTS, BASE_SLOTS, ROW, EGG_TRAY_SIZE, GEAR_SLOTS, OUTFITS } from './config.js';
import { addItem, wildGenes, seededRand, cleanGenes, maxStack, isGear, outfitFits } from './economy.js';
import { newWorld, seedFor, cleanWorld } from './world.js';

export const SAVE_VERSION = 9;
const KEY = 'cretaceous-nest';
const LEGACY_KEY = 'ninho-cretaceo';   // saves from the Portuguese prototype
const CODE_PREFIX = 'CNEST1:';

export function freshState() {
  const s = {
    saveVersion: SAVE_VERSION, owner: null, current: null, hatched: [], coins: 0, inv: Array(SLOTS).fill(null), invSize: BASE_SLOTS,
    daily: { last: null, streak: 0, best: 0 }, stats: { coinsEarned: 0, meals: 0, purchases: 0, eggsLaid: 0 }, achievements: {},
    eggs: [], breeding: null, wardrobe: [], updatedAt: 0,
    starter: false,   // the starter baby is not picked yet
    // a new map for every new game
    world: newWorld(Math.floor(Math.random() * 2147483646) + 1),
  };
  for (const [id, n] of STARTER) addItem(s, id, n);
  return s;
}

// ---------- migrations ----------
// MIGRATIONS[v] turns a version v save into a version v + 1 save.
const LEGACY_ITEM = { samambaia: 'leaf', carne: 'meat', casca: 'shell', casca_dourada: 'golden_shell', ambar: 'amber' };
const MIGRATIONS = {
  // v1: the single-file prototype. Item ids were Portuguese, early saves had no coins or inventory,
  // and the inventory once had all 100 slots open.
  1: s => {
    if (typeof s.coins !== 'number') s.coins = 0;
    if (!Array.isArray(s.inv) || s.inv.length !== SLOTS) {
      const fresh = freshState();
      s.inv = fresh.inv;
      s.invSize = BASE_SLOTS;
    }
    s.inv = s.inv.map(slot => slot ? { id: LEGACY_ITEM[slot.id] || slot.id, n: slot.n } : null);
    return s;
  },
  // v2: before daily rewards and achievements. Meals come from what each baby already ate, and the
  // coins on hand stand in for coins earned so far.
  2: s => {
    s.daily = { last: null, streak: 0, best: 0 };
    s.stats = { coinsEarned: Math.max(0, Number(s.coins) || 0), meals: s.hatched.reduce((t, b) => t + (Number(b && b.fed) || 0), 0), purchases: 0 };
    s.achievements = {};
    return s;
  },
  // v3: before stats and breeding. Every baby gets genes rolled from its own id, so the browser and
  // the server give it the same ones.
  3: s => {
    s.hatched = s.hatched.map(b => b && SPECIES[b.type] ? { ...b, genes: wildGenes(seededRand('stats:' + b.id)), gen: 1 } : b);
    s.eggs = [];
    s.breeding = null;
    return s;
  },
  // v4: one number per stat, which included a +10 bonus in the species' strong stat. Those numbers
  // become genes without the bonus, since each species' base now plays that part.
  4: s => {
    const OLD_BONUS = { proto: { res: 10 }, hypa: { vit: 10 }, raptor: { agi: 10 }, rex: { str: 10 } };
    const toGenes = (thing) => {
      if (!thing || !thing.stats || thing.genes) return thing;
      const { stats, ...rest } = thing;
      const bonus = OLD_BONUS[thing.type] || {};
      return { ...rest, genes: Object.fromEntries(Object.entries(stats).map(([id, v]) => [id, Math.max(1, v - (bonus[id] || 0))])) };
    };
    s.hatched = s.hatched.map(toGenes);
    s.eggs = (s.eggs || []).map(toGenes);
    if (s.current) s.current = toGenes(s.current);
    return s;
  },
  // v5: before equipment
  5: s => {
    s.hatched = s.hatched.map(b => b ? { ...b, equip: {} } : b);
    return s;
  },
  // v6: before outfits
  6: s => {
    s.wardrobe = [];
    return s;
  },
  // v7: before the world map
  7: s => {
    s.world = newWorld(seedFor(s));
    return s;
  },
  // v8: before starters; games that already exist are past that point
  8: s => {
    s.starter = true;
    return s;
  },
};

// keeps a loaded save inside the rules whatever produced it
function sanitize(s) {
  s.coins = Math.max(0, Math.floor(Number(s.coins) || 0));
  s.invSize = Math.min(SLOTS, Math.max(BASE_SLOTS, Math.floor((s.invSize || BASE_SLOTS) / ROW) * ROW));
  s.inv = Array.from({ length: SLOTS }, (_, i) => {
    const slot = s.inv[i];
    return slot && ITEMS[slot.id] && slot.n > 0 ? { id: slot.id, n: Math.min(maxStack(slot.id), Math.floor(slot.n)) } : null;
  });
  // anything outside the unlocked rows moves back in where it fits
  for (let i = s.invSize; i < SLOTS; i++) {
    const slot = s.inv[i];
    if (slot) { s.inv[i] = null; addItem(s, slot.id, slot.n); }
  }
  // a baby's stage is worked out from its meals; an old stored one is dropped
  s.hatched = s.hatched.filter(b => b && SPECIES[b.type] && b.id).map(({ stats, stage, ...b }) => ({
    ...b,
    genes: cleanGenes(b.genes, 'stats:' + b.id),
    gen: Math.max(1, Math.floor(Number(b.gen) || 1)),
    ...(Number(b.injuredUntil) > 0 ? { injuredUntil: Number(b.injuredUntil) } : { injuredUntil: undefined }),
    // only real equipment, each in its own slot
    equip: Object.fromEntries(GEAR_SLOTS.map(({ id }) => [id, b.equip && b.equip[id]]).filter(([slot, item]) => isGear(item) && ITEMS[item].slot === slot)),
  }));
  s.eggs = (Array.isArray(s.eggs) ? s.eggs : []).filter(e => e && SPECIES[e.type] && e.id).slice(0, EGG_TRAY_SIZE).map(e => ({
    id: e.id, type: e.type, genes: cleanGenes(e.genes, 'stats:' + e.id),
    gen: Math.max(1, Math.floor(Number(e.gen) || 1)), parents: Array.isArray(e.parents) ? e.parents.slice(0, 2) : [], laidAt: Number(e.laidAt) || 0,
  }));
  const br = s.breeding;
  s.breeding = br && SPECIES[br.type] && br.maleId && br.femaleId
    ? { type: br.type, maleId: br.maleId, femaleId: br.femaleId, startedAt: Number(br.startedAt) || 0, readyAt: Number(br.readyAt) || 0 }
    : null;
  if (s.current && !SPECIES[s.current.type]) s.current = null;
  // outfits: only real ones, owned, on a baby of their species
  s.wardrobe = [...new Set((Array.isArray(s.wardrobe) ? s.wardrobe : []).filter(id => OUTFITS[id]))];
  s.hatched = s.hatched.map(b => {
    if (b.outfit == null) return b;
    if (s.wardrobe.includes(b.outfit) && outfitFits(b.outfit, b)) return b;
    const { outfit, ...rest } = b;
    return rest;
  });
  if (s.current && s.current.genes) s.current.genes = cleanGenes(s.current.genes, 'stats:egg');
  s.world = cleanWorld(s.world, s);
  s.starter = s.starter === true || s.hatched.length > 0;
  s.updatedAt = Number(s.updatedAt) || 0;
  s.owner = typeof s.owner === 'string' ? s.owner : null;   // account id, or null for a guest game
  const d = s.daily || {};
  s.daily = { last: Number.isInteger(d.last) ? d.last : null, streak: Math.max(0, Math.floor(Number(d.streak) || 0)), best: Math.max(0, Math.floor(Number(d.best) || 0)) };
  const st = s.stats || {};
  const count = n => Math.max(0, Math.floor(Number(n) || 0));
  s.stats = { coinsEarned: count(st.coinsEarned), meals: count(st.meals), purchases: count(st.purchases), eggsLaid: count(st.eggsLaid) };
  s.achievements = s.achievements && typeof s.achievements === 'object' && !Array.isArray(s.achievements) ? s.achievements : {};
  return s;
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.hatched)) throw new Error('This is not a Cretaceous Nest save.');
  let s = JSON.parse(JSON.stringify(raw));
  let v = Number(s.saveVersion) || 1;
  if (v > SAVE_VERSION) throw new Error('This save comes from a newer version of the game. Reload the page and try again.');
  while (v < SAVE_VERSION) { s = MIGRATIONS[v](s); v++; }
  s.saveVersion = SAVE_VERSION;
  return sanitize(s);
}

// ---------- export / import ----------
export function exportCode(s) {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return CODE_PREFIX + btoa(bin);
}

export function parseCode(code) {
  const body = String(code).trim().replace(/\s+/g, '');
  if (!body.startsWith(CODE_PREFIX)) throw new Error('This code is not a Cretaceous Nest save. Copy the whole code, starting with ' + CODE_PREFIX);
  let raw;
  try {
    const bin = atob(body.slice(CODE_PREFIX.length));
    raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  } catch (e) {
    throw new Error('This code is incomplete or damaged. Copy it again and paste the whole thing.');
  }
  return migrate(raw);
}

// ---------- live state ----------
export let S = freshState();
const listeners = new Set();

// fn(kind, source): kind is 'change' after an action or 'reset' when the whole save was replaced;
// source is 'cloud' when the account sync made the change, so it is not uploaded straight back
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify(kind, source) { for (const fn of listeners) fn(kind, source); }

function storage() { try { return globalThis.localStorage || null; } catch (e) { return null; } }

export function persist() {
  try { storage()?.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode or storage full */ }
}

export function load() {
  let raw = null;
  try { const st = storage(); raw = JSON.parse(st?.getItem(KEY) || st?.getItem(LEGACY_KEY) || 'null'); } catch (e) {}
  try { S = raw ? migrate(raw) : freshState(); } catch (e) { S = freshState(); }
}

// call after every action that changed S
export function commit() {
  S.updatedAt = Date.now();
  persist();
  notify('change', 'local');
}

export function replaceState(next, source = 'local') {
  S = next;
  if (source !== 'cloud') S.updatedAt = Date.now();
  persist();
  notify('reset', source);
}

// takes the server's copy after an action without tearing down screens that are still valid;
// only a different egg in the incubator (or none) needs the full redraw a reset gives
export function adoptState(next) {
  const view = s => s.current ? s.current.type + ':' + s.current.startedAt : '';
  const changedView = view(S) !== view(next);
  S = next;
  persist();
  notify(changedView ? 'reset' : 'change', 'cloud');
}
