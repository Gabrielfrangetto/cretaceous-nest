// World map rules: a hex map around the nest, hidden under fog, and the expeditions that reveal it.
// Like economy.js these only work on the state passed in, so the browser and the server share them.
//
// Hexes use axial coordinates (q, r) with the nest at 0,0, and are stored as "q,r" keys.
// s.world = { seed, revealed: [key], visited: [key], trips, expeditions: [{ id, babyId, hex, trip, startedAt, returnAt }] }
import {
  BIOMES, WORLD_RADIUS, TRIP_MINS_PER_HEX, EXPEDITION_SLOTS, JUVENILE_RANGE, DISCOVERY_COINS_PER_HEX, LOOT_PER_HEX,
} from './config.js';
import { addItem, earn, stageOf, isHungry, hungerEvery, seededRand } from './economy.js';
import { hashId } from './util.js';

// ---------- hex geometry ----------
export const hexKey = (q, r) => `${q},${r}`;
export function parseKey(key) {
  const m = /^(-?\d+),(-?\d+)$/.exec(String(key));
  return m ? [Number(m[1]), Number(m[2])] : null;
}
export const hexDist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const inWorld = h => !!h && hexDist(h) <= WORLD_RADIUS;
export const neighbors = ([q, r]) => DIRS.map(([dq, dr]) => [q + dq, r + dr]).filter(inWorld);

// every hex of the map, nest first
export const ALL_HEXES = (() => {
  const out = [];
  for (let q = -WORLD_RADIUS; q <= WORLD_RADIUS; q++)
    for (let r = -WORLD_RADIUS; r <= WORLD_RADIUS; r++) if (inWorld([q, r])) out.push([q, r]);
  return out.sort((a, b) => hexDist(a) - hexDist(b));
})();

// ---------- generation ----------
// A smooth random field: each hex's own value blended with the hexes up to two steps away, so
// biomes form patches instead of noise.
function mix(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
const cell = (seed, salt, q, r) => mix(mix(mix(seed + salt) + q * 73856093) + r * 19349663) / 4294967296;
function field(seed, salt, [q, r]) {
  let total = 0, weight = 0;
  for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) {
    const d = hexDist([dq, dr]);
    if (d > 2) continue;
    const w = 3 - d;
    total += cell(seed, salt, q + dq, r + dr) * w; weight += w;
  }
  return total / weight;
}

// Biomes are shared out by rank, so every map gets a similar mix: the hottest hexes become volcano
// (only far from the nest; nearer, badlands), the next hottest and dry ones badlands, then the
// wettest swamp, the next forest, and the rest meadow. The nest's surroundings are always meadow.
const SHARE = { hot: 0.16, dry: 0.12, swamp: 0.22, forest: 0.3 };
const maps = new Map();
function biomeMap(seed) {
  if (maps.has(seed)) return maps.get(seed);
  const hexes = ALL_HEXES.filter(h => hexDist(h) > 1).map(h => ({ h, wet: field(seed, 0x9e3779b9, h), heat: field(seed, 0x85ebca6b, h) }));
  const out = new Map(ALL_HEXES.map(h => [hexKey(...h), 'meadow']));
  const n = hexes.length, take = (list, share) => list.slice(0, Math.round(n * share));
  const byHeat = [...hexes].sort((a, b) => b.heat - a.heat);
  for (const x of take(byHeat, SHARE.hot)) out.set(hexKey(...x.h), hexDist(x.h) >= 4 ? 'volcano' : 'badlands');
  const left = () => hexes.filter(x => out.get(hexKey(...x.h)) === 'meadow');
  for (const x of take(left().sort((a, b) => (b.heat - b.wet) - (a.heat - a.wet)), SHARE.dry)) out.set(hexKey(...x.h), 'badlands');
  const byWet = left().sort((a, b) => b.wet - a.wet);
  for (const x of take(byWet, SHARE.swamp)) out.set(hexKey(...x.h), 'swamp');
  for (const x of take(byWet.slice(Math.round(n * SHARE.swamp)), SHARE.forest)) out.set(hexKey(...x.h), 'forest');
  if (maps.size > 50) maps.clear();
  maps.set(seed, out);
  return out;
}
export const biomeAt = (seed, h) => biomeMap(seed).get(hexKey(...h)) || 'meadow';

export function newWorld(seed) {
  const home = [0, 0];
  return { seed, revealed: [hexKey(0, 0), ...neighbors(home).map(h => hexKey(...h))], visited: [hexKey(0, 0)], trips: 0, expeditions: [] };
}

// a seed for saves made before the world existed: taken from the save itself, so the browser and
// the server come up with the same one
export const seedFor = s => hashId('world:' + ((s.hatched || []).map(b => b && b.id).join('|') || s.updatedAt || 'nest')) || 1;

// ---------- what the player can see and reach ----------
const W = s => s.world;
export const isRevealed = (s, key) => W(s).revealed.includes(key);
// hexes an expedition can go to: revealed ones and the fog right next to them (not the nest itself)
export function canReach(s, key) {
  const h = parseKey(key);
  if (!inWorld(h) || hexDist(h) === 0) return false;
  return isRevealed(s, key) || neighbors(h).some(n => isRevealed(s, hexKey(...n)));
}
// minutes for a trip there and back
export const tripMins = key => hexDist(parseKey(key)) * TRIP_MINS_PER_HEX;

export const expeditionOf = (s, babyId) => W(s).expeditions.find(e => e.babyId === babyId) || null;
export const isAway = (s, babyId) => !!expeditionOf(s, babyId);

// the items a hex can give, with quantities already scaled by its distance
export function lootTable(s, key) {
  const h = parseKey(key);
  const mult = 1 + (hexDist(h) - 1) * LOOT_PER_HEX;
  return BIOMES[biomeAt(W(s).seed, h)].loot.map(([id, min, max, chance = 1]) =>
    ({ id, min: Math.max(1, Math.round(min * mult)), max: Math.max(1, Math.round(max * mult)), chance }));
}

// why this baby can't go to this hex now, or null when it can
export function exploreProblem(s, babyId, key, now) {
  const b = s.hatched.find(x => x.id === babyId);
  if (!b) return 'missing';
  const h = parseKey(key);
  if (!inWorld(h)) return 'out-of-map';
  if (hexDist(h) === 0) return 'home';
  if (!canReach(s, key)) return 'unreachable';
  const stage = stageOf(b).id;
  if (stage === 'baby') return 'too-young';
  if (stage === 'juvenile' && hexDist(h) > JUVENILE_RANGE) return 'too-far';
  if (isAway(s, babyId)) return 'away';
  if (s.breeding && (s.breeding.maleId === babyId || s.breeding.femaleId === babyId)) return 'breeding';
  if (isHungry(b, now)) return 'hungry';
  if (W(s).expeditions.length >= EXPEDITION_SLOTS) return 'no-slot';
  return null;
}

export function startExpedition(s, babyId, key, now) {
  const problem = exploreProblem(s, babyId, key, now);
  if (problem) return { ok: false, reason: problem };
  const w = W(s);
  w.trips += 1;
  // the trip number seeds the loot, so the browser and the server roll the same things
  const exp = { id: `t${w.trips}`, babyId, hex: key, trip: w.trips, startedAt: now, returnAt: now + tripMins(key) * 60000 };
  w.expeditions.push(exp);
  return { ok: true, expedition: exp };
}

// calls the dinosaur back early: no loot, no new map, but it is free again right away
export function recallExpedition(s, id) {
  const w = W(s);
  if (!w.expeditions.some(e => e.id === id)) return { ok: false, reason: 'no-expedition' };
  w.expeditions = w.expeditions.filter(e => e.id !== id);
  return { ok: true };
}

// the dinosaur is back: the hex and its neighbours are revealed, the loot goes to the inventory
// (what does not fit is lost), a first visit pays discovery coins, and the trip leaves it hungry
export function collectExpedition(s, id, now) {
  const w = W(s);
  const exp = w.expeditions.find(e => e.id === id);
  if (!exp) return { ok: false, reason: 'no-expedition' };
  if (now < exp.returnAt) return { ok: false, reason: 'not-back' };
  const h = parseKey(exp.hex);
  const rand = seededRand(`trip:${w.seed}:${exp.trip}`);
  const loot = [];
  for (const { id: item, min, max, chance } of lootTable(s, exp.hex)) {
    if (rand() >= chance) continue;
    const n = min + Math.floor(rand() * (max - min + 1));
    const lost = addItem(s, item, n);
    loot.push({ id: item, n, lost });
  }
  const discovered = !w.visited.includes(exp.hex);
  const coins = discovered ? hexDist(h) * DISCOVERY_COINS_PER_HEX : 0;
  if (coins) earn(s, coins);
  if (discovered) w.visited.push(exp.hex);
  const newly = [exp.hex, ...neighbors(h).map(n => hexKey(...n))].filter(k => !w.revealed.includes(k));
  w.revealed.push(...newly);
  w.expeditions = w.expeditions.filter(e => e.id !== id);
  const b = s.hatched.find(x => x.id === exp.babyId);
  if (b) b.lastFed = now - hungerEvery(b);
  return { ok: true, hex: exp.hex, biome: biomeAt(w.seed, h), babyId: exp.babyId, loot, coins, discovered, revealed: newly.length };
}

// keeps a loaded world inside the rules whatever produced it
export function cleanWorld(world, s) {
  const w = world && typeof world === 'object' ? world : newWorld(seedFor(s));
  const keys = list => [...new Set((Array.isArray(list) ? list : []).filter(k => inWorld(parseKey(k))))];
  const home = newWorld(1);
  const ids = new Set(s.hatched.map(b => b.id));
  const seen = new Set();
  return {
    seed: Number.isInteger(w.seed) && w.seed > 0 ? w.seed : seedFor(s),
    revealed: keys([...home.revealed, ...keys(w.revealed)]),
    visited: keys([...home.visited, ...keys(w.visited)]),
    trips: Math.max(0, Math.floor(Number(w.trips) || 0)),
    expeditions: (Array.isArray(w.expeditions) ? w.expeditions : [])
      .filter(e => e && ids.has(e.babyId) && !seen.has(e.babyId) && seen.add(e.babyId) && inWorld(parseKey(e.hex)) && hexDist(parseKey(e.hex)) > 0)
      .slice(0, EXPEDITION_SLOTS)
      .map(e => ({
        id: String(e.id), babyId: e.babyId, hex: e.hex, trip: Math.max(1, Math.floor(Number(e.trip) || 1)),
        startedAt: Number(e.startedAt) || 0,
        // never sooner than the trip really takes
        returnAt: Math.max(Number(e.returnAt) || 0, (Number(e.startedAt) || 0) + tripMins(e.hex) * 60000),
      })),
  };
}
