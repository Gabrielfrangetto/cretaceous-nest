// The player's save: versioned migrations, the in-memory copy the screens show, and a tiny change feed
// the UI modules subscribe to. The real save lives on the server (every game needs an account); the
// browser keeps nothing, except in the local dev mode and an old guest game waiting to be moved.
import { GUIDE, SPECIES, ITEMS, STARTER, SLOTS, BASE_SLOTS, ROW, EGG_TRAY_SIZE, GEAR_SLOTS, OUTFITS, FRILL, NURSE } from './config.js';
import { addItem, wildGenes, seededRand, cleanGenes, maxStack, isGear, outfitFits, newPlayer, cleanPlayer } from './economy.js';
import { newWorld, cleanWorld } from './world.js';
import { cleanParties } from './journey.js';
import { cleanPacks } from './packs.js';

export const SAVE_VERSION = 12;
const KEY = 'cretaceous-nest';
const LEGACY_KEY = 'ninho-cretaceo';   // saves from the Portuguese prototype
const DEV_KEY = 'cretaceous-nest:dev';

export function freshState() {
  const s = {
    saveVersion: SAVE_VERSION, owner: null, current: null, hatched: [], coins: 0, inv: Array(SLOTS).fill(null), invSize: BASE_SLOTS,
    daily: { last: null, streak: 0, best: 0 }, stats: { coinsEarned: 0, meals: 0, purchases: 0, eggsLaid: 0 }, achievements: {},
    eggs: [], breeding: null, wardrobe: [], updatedAt: 0,
    known: [],        // the species whose eggs the player has had (starters are known from the start: knows)
    starter: false,   // the starter baby is not picked yet
    player: newPlayer(),
    tutorial: { seen: [] },   // the guide's tips already shown
    packs: [],                 // groups of pack-hunting dinosaurs (packs.js)
    // a new map for every new game
    world: newWorld(),
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
    s.world = newWorld();
    return s;
  },
  // v8: before starters; games that already exist are past that point
  8: s => {
    s.starter = true;
    return s;
  },
  // v9: before the player's own explorer
  9: s => {
    s.player = newPlayer();
    return s;
  },
  // v10: before the guide; games already under way skip the welcome
  10: s => {
    s.tutorial = { seen: s.starter ? ['welcome'] : [] };
    return s;
  },
  // v11: before packs and teams; a trip out with one explorer becomes a team of one
  11: s => {
    s.packs = [];
    for (const e of (s.world && s.world.expeditions) || []) {
      e.team = [{ kind: e.babyId === 'player' ? 'player' : 'dino', id: e.babyId }];
      e.members = [e.babyId];
    }
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
    ...(Number(b.injuredUntil) > 0 ? { injuredUntil: Number(b.injuredUntil), critical: b.critical === true || undefined } : { injuredUntil: undefined, critical: undefined }),
    // raised among Hypacrosaurus: a share more of every stat (NURSE)
    care: Number(b.care) > 0 ? Math.min(NURSE.max, Number(b.care)) : undefined,
    // raised in a Psittacosaurus creche: it gets hungry more slowly (CRECHE)
    stomach: b.stomach === true || undefined,
    // a damaged frill (Triceratops), from 0 to just under whole
    frill: SPECIES[b.type].frill && Number.isInteger(b.frill) && b.frill >= 0 && b.frill < FRILL.hp ? b.frill : undefined,
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
  // the eggs had: the ones kept, and those of every baby and egg there is (older saves)
  s.known = [...new Set([...(Array.isArray(s.known) ? s.known : []), ...s.hatched.map(b => b.type), ...(s.eggs || []).map(e => e.type), ...(s.current ? [s.current.type] : [])].filter(t => SPECIES[t]))];
  s.player = cleanPlayer(s.player);
  s.tutorial = { seen: [...new Set((s.tutorial && Array.isArray(s.tutorial.seen) ? s.tutorial.seen : []).filter(id => GUIDE[id]))] };
  s.packs = cleanPacks(s.packs, s);
  s.world = cleanWorld(s.world, s);
  s.world.expeditions = cleanParties(s, s.world);
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

// ---------- live state ----------
export let S = freshState();
const listeners = new Set();

// fn(kind, source): kind is 'change' after an action or 'reset' when the whole save was replaced;
// source is 'cloud' when the account sync made the change, so it is not uploaded straight back
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify(kind, source) { for (const fn of listeners) fn(kind, source); }

function storage() { try { return globalThis.localStorage || null; } catch (e) { return null; } }

// Local dev mode (localhost with ?dev): the game runs without an account and keeps its save in this
// browser, so it can be tried and tested without the server. Never on the real site.
let dev = false;
export const devMode = () => dev;
export function enableDevMode() { dev = true; }

export function persist() {
  if (!dev) return;
  try { storage()?.setItem(DEV_KEY, JSON.stringify(S)); } catch (e) { /* private mode or storage full */ }
}

export function load() {
  S = freshState();
  if (!dev) return;
  try { const raw = JSON.parse(storage()?.getItem(DEV_KEY) || 'null'); if (raw) S = migrate(raw); } catch (e) {}
}

// a game played in this browser before accounts were required, to move into the account once
export function legacySave() {
  try {
    const st = storage();
    const raw = JSON.parse(st?.getItem(KEY) || st?.getItem(LEGACY_KEY) || 'null');
    return raw ? migrate(raw) : null;
  } catch (e) { return null; }
}
export function clearLegacySave() {
  try { const st = storage(); st?.removeItem(KEY); st?.removeItem(LEGACY_KEY); } catch (e) {}
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
