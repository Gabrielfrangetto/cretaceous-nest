// The world map, made from the world's seed alone (so the browser and the server make the same one): a
// supercontinent on a rectangle of hexes (MAP), shaped by height, latitude and wind like a planet's.
//
// Hexes use axial coordinates (q, r) with the nest at 0,0, pointy-top: rows run west to east, r grows
// to the south. Every hex is { biome, terrain, river, lat, heat, wet }: terrain 'flat', 'hill',
// 'mountain', 'volcano', 'lake' or 'ocean' (the last two water, no one goes there); river: a river runs
// through it; lat in degrees (north +); heat and wet from 0 to 1.
//
// How it is made:
//   height: a few octaves of smooth noise and an oval falloff around the continent's middle, plus
//     ridges for the mountain ranges; the lowest share is sea, and land not joined to the nest's sinks.
//   heat: the equator hottest, the poles coolest (the Cretaceous had no ice caps: polar forests grew
//     there), and cooler the higher up.
//   wet: the planet's rain belts (wet at the equator and around 60 degrees, dry around 30 where the
//     great deserts are), drier far from the sea, and drier still in a mountain range's rain shadow
//     (the wind blows from the east in the tropics and near the poles, from the west in between).
//   rivers: springs high up where it is wet, running down to the sea or a lake (a pit with no way down).
//   biomes: around volcanoes Volcanic Slopes; dry Badlands; wet lowlands Swamp; wet or cool Conifer
//     Forest; the rest Fern Meadow (no grass yet in the Cretaceous: ferns covered the open ground).
//   the nest: always in a calm lowland of ferns, a few hexes across.
import { MAP, TRAVEL } from './config.js';

const key = (q, r) => `${q},${r}`;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const dist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
// offset (column, row) from the nest, rows shifted every other one
const colOf = ([q, r]) => q + Math.floor(r / 2);
export const inMap = h => {
  if (!h) return false;
  const c = colOf(h), r = h[1];
  return r >= -MAP.north && r < MAP.rows - MAP.north && c >= -MAP.west && c < MAP.cols - MAP.west;
};
export const mapNeighbors = ([q, r]) => DIRS.map(([dq, dr]) => [q + dq, r + dr]).filter(inMap);
// every hex of the map, nearest the nest first
export const MAP_HEXES = (() => {
  const out = [];
  for (let r = -MAP.north; r < MAP.rows - MAP.north; r++)
    for (let c = -MAP.west; c < MAP.cols - MAP.west; c++) out.push([c - Math.floor(r / 2), r]);
  return out.sort((a, b) => dist(a) - dist(b));
})();
// where a hex sits, in hex radii (for noise and shapes)
const xy = ([q, r]) => [Math.sqrt(3) * (q + r / 2), 1.5 * r];
export const latOf = ([, r]) => 90 - ((r + MAP.north + 0.5) / MAP.rows) * 180;

// ---------- noise ----------
function mix(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
const hash = (seed, salt, i, j) => mix(mix(mix(seed + salt) + Math.imul(i, 73856093)) + Math.imul(j, 19349663)) / 4294967296;
const smooth = t => t * t * (3 - 2 * t);
function vnoise(seed, salt, x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
  const a = hash(seed, salt, i, j), b = hash(seed, salt, i + 1, j), c = hash(seed, salt, i, j + 1), d = hash(seed, salt, i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(seed, salt, x, y, scale, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let o = 0; o < octaves; o++) { sum += vnoise(seed, salt + o * 7919, x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
// a seeded random sequence, for picking springs and hot spots
function randOf(seed, salt) {
  let x = mix(seed + salt) || 1;
  return () => (x = mix(x + 0x9e3779b9)) / 4294967296;
}
const quantile = (list, share) => { const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * share)))]; };

const cache = new Map();
export function worldMap(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const rand = randOf(seed, 0x51ed270b);
  const W = Math.sqrt(3) * MAP.cols, H = 1.5 * MAP.rows;
  const [x0, y0] = xy([-MAP.west - Math.floor(-MAP.north / 2), -MAP.north]);
  // the continent's middle, somewhere around the map's middle
  const cx = x0 + W * (0.4 + rand() * 0.2), cy = y0 + H * (0.42 + rand() * 0.16);
  const cells = new Map();
  for (const h of MAP_HEXES) {
    const [x, y] = xy(h);
    const fall = 1 - Math.hypot((x - cx) / (W * 0.46), (y - cy) / (H * 0.5));
    // the sea all around the edges
    const col = colOf(h) + MAP.west, row = h[1] + MAP.north;
    const edge = Math.min(col, MAP.cols - 1 - col, row, MAP.rows - 1 - row);
    const ridge = 1 - Math.abs(2 * fbm(seed, 0x2c1b3c6d, x, y, 22, 3) - 1);
    const height = 0.55 * fbm(seed, 0x6a09e667, x, y, 26) + 0.55 * fall + 0.3 * ridge ** 3 - (edge < 4 ? (4 - edge) * 0.08 : 0);
    cells.set(key(...h), { h, height });
  }
  const all = [...cells.values()];
  const sea = quantile(all.map(c => c.height), 1 - MAP.land);
  // the nest's surroundings: always a calm lowland, low enough to be flat and high enough to be land
  const landHeights = all.filter(c => c.height > sea).map(c => c.height);
  const hill = quantile(landHeights, 1 - MAP.hills - MAP.mountains), mountain = quantile(landHeights, 1 - MAP.mountains);
  const low = quantile(landHeights, 0.3);
  for (const c of all) {
    const d = dist(c.h);
    if (d <= MAP.calm + 2) {
      const pull = d <= MAP.calm ? 1 : 0.5;
      c.height = c.height + (Math.min(Math.max(c.height, sea + (low - sea) * 0.4), (sea + low) / 2 + (hill - low) * 0.3) - c.height) * pull;
    }
  }
  // land: what is joined to the nest's (islands sink)
  for (const c of all) c.terrain = c.height > sea ? 'flat' : 'ocean';
  const joined = new Set([key(0, 0)]), queue = [[0, 0]];
  while (queue.length) for (const n of mapNeighbors(queue.shift())) {
    const k = key(...n);
    if (!joined.has(k) && cells.get(k).terrain !== 'ocean') { joined.add(k); queue.push(n); }
  }
  for (const c of all) if (!joined.has(key(...c.h))) c.terrain = 'ocean';
  const land = all.filter(c => c.terrain !== 'ocean');
  for (const c of land) c.terrain = c.height >= mountain ? 'mountain' : c.height >= hill ? 'hill' : 'flat';
  // hot spots: volcanoes on the high ground, away from the nest
  const high = land.filter(c => c.terrain !== 'flat' && dist(c.h) > MAP.calm + 6);
  for (let i = 0; i < MAP.volcanoes && high.length; i++) {
    const c = high.splice(Math.floor(rand() * high.length), 1)[0];
    c.terrain = 'volcano';
  }
  // how far each land hex is from the sea, for the rain that comes in from it
  const coast = new Map(), wave = all.filter(c => c.terrain === 'ocean').map(c => c.h);
  for (const h of wave) coast.set(key(...h), 0);
  while (wave.length) {
    const h = wave.shift(), d = coast.get(key(...h));
    for (const n of mapNeighbors(h)) if (!coast.has(key(...n))) { coast.set(key(...n), d + 1); wave.push(n); }
  }
  // heat and rain
  for (const c of all) {
    const lat = latOf(c.h), a = Math.abs(lat);
    const up = c.terrain === 'ocean' ? 0 : Math.max(0, (c.height - sea) / (1 - sea));
    c.lat = Math.round(lat * 10) / 10;
    c.heat = Math.max(0, Math.min(1, 1 - 0.72 * (a / 90) ** 1.3 - 0.35 * up));
    const belt = a <= 60 ? 0.62 + 0.3 * Math.cos(a * Math.PI / 30) : 0.62 + 0.3 * (1 - (a - 60) / 30) * 0.4;
    // the wind: from the east in the tropics and near the poles, from the west in between
    const [dq] = a < 30 || a > 60 ? [1] : [-1];
    let shadow = 1;
    for (let k = 1; k <= 6; k++) {
      const up2 = cells.get(key(c.h[0] + dq * k, c.h[1]));
      if (!up2) break;
      if (up2.terrain === 'mountain' || up2.terrain === 'volcano') { shadow = Math.min(shadow, 0.45); break; }
      if (up2.terrain === 'hill') shadow = Math.min(shadow, 0.8);
    }
    const near = Math.exp(-(coast.get(key(...c.h)) || 0) / 12);
    c.wet = Math.max(0, Math.min(1, belt * (0.6 + 0.4 * near) * shadow + (fbm(seed, 0x3c6ef372, ...xy(c.h), 14, 3) - 0.5) * 0.5));
  }
  // rivers: from springs high up and wet, down to the sea or a lake
  const springs = land.filter(c => (c.terrain === 'hill' || c.terrain === 'mountain') && c.wet > 0.4);
  const rand2 = randOf(seed, 0x1f83d9ab);
  for (let i = 0; i < MAP.rivers && springs.length; i++) {
    let c = springs.splice(Math.floor(rand2() * springs.length), 1)[0];
    const seen = new Set();
    for (let step = 0; step < 200; step++) {
      seen.add(key(...c.h));
      if (c.terrain !== 'mountain' && c.terrain !== 'volcano') c.river = true;
      const next = mapNeighbors(c.h).map(n => cells.get(key(...n))).filter(n => !seen.has(key(...n.h)))
        .sort((a, b) => a.height - b.height)[0];
      if (!next || next.terrain === 'ocean' || next.terrain === 'lake') break;
      if (next.river && step > 0) break;
      if (next.height > c.height && rand2() < 0.25) {
        // a pit with no way down: a lake (never at the nest); otherwise the water finds a way over
        if (dist(c.h) > MAP.calm && c.terrain === 'flat') { c.terrain = 'lake'; c.river = false; }
        break;
      }
      c = next;
    }
  }
  // a few more lakes in wet hollows
  const hollows = land.filter(c => c.terrain === 'flat' && !c.river && dist(c.h) > MAP.calm + 2 && c.wet > 0.6 && mapNeighbors(c.h).every(n => cells.get(key(...n)).height >= c.height));
  for (let i = 0; i < MAP.lakes && hollows.length; i++) hollows.splice(Math.floor(rand2() * hollows.length), 1)[0].terrain = 'lake';
  // biomes, by heat and rain (and water close by)
  const volcanic = new Set();
  for (const c of all) if (c.terrain === 'volcano') for (const h of [c.h, ...mapNeighbors(c.h), ...mapNeighbors(c.h).flatMap(mapNeighbors)]) volcanic.add(key(...h));
  for (const c of all) {
    if (c.terrain === 'ocean' || c.terrain === 'lake') { c.biome = null; continue; }
    const water = c.river || mapNeighbors(c.h).some(n => ['lake', 'ocean'].includes(cells.get(key(...n)).terrain));
    const wet = Math.min(1, c.wet + (water ? 0.2 : 0));
    const lowland = c.terrain === 'flat' && c.height < low;
    c.biome = volcanic.has(key(...c.h)) ? 'volcano'
      : wet < 0.3 ? 'badlands'
      : lowland && wet > 0.6 && c.heat > 0.45 ? 'swamp'
      : wet > 0.58 || c.heat < 0.42 ? 'forest'
      : 'meadow';
    if (dist(c.h) <= MAP.calm) { c.biome = 'meadow'; if (c.terrain !== 'flat') c.terrain = 'flat'; }
  }
  const out = new Map(all.map(c => [key(...c.h), { biome: c.biome, terrain: c.terrain, river: !!c.river, lat: c.lat, heat: Math.round(c.heat * 100) / 100, wet: Math.round(c.wet * 100) / 100 }]));
  if (cache.size > 8) cache.clear();
  cache.set(seed, out);
  return out;
}
export const cellAt = (seed, h) => worldMap(seed).get(key(...h)) || null;
export const isWater = (seed, h) => { const c = cellAt(seed, h); return !c || c.terrain === 'ocean' || c.terrain === 'lake'; };

// How hard it is to get to each land hex from the nest, the easiest way (TRAVEL): a hex's cost is its
// terrain's or its biome's, whichever is more, plus a river to cross. Water can't be crossed.
const costs = new Map();
export const stepCost = c => Math.max(TRAVEL.terrain[c.terrain] || 1, TRAVEL.biome[c.biome] || 1) + (c.river ? TRAVEL.river : 0);
// { best: cost to each hex, prev: the hex it is reached from }
function routes(seed) {
  if (costs.has(seed)) return costs.get(seed);
  const map = worldMap(seed), best = new Map([[key(0, 0), 0]]), prev = new Map();
  // a small binary heap of [cost, hex]
  const heap = [[0, [0, 0]]];
  const push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [c, h] = pop();
    if (c > best.get(key(...h))) continue;
    for (const n of mapNeighbors(h)) {
      const cell = map.get(key(...n));
      if (!cell || cell.terrain === 'ocean' || cell.terrain === 'lake') continue;
      const nc = c + stepCost(cell);
      if (nc < (best.get(key(...n)) ?? Infinity)) { best.set(key(...n), nc); prev.set(key(...n), h); push([nc, n]); }
    }
  }
  if (costs.size > 8) costs.clear();
  const out = { best, prev };
  costs.set(seed, out);
  return out;
}
export const travelCosts = seed => routes(seed).best;
// the cost of the easiest way from the nest to a hex (Infinity: there is none)
export const travelCost = (seed, h) => routes(seed).best.get(key(...h)) ?? Infinity;
// the easiest way from the nest to a hex: the hexes crossed, the hex itself last (not the nest)
export function travelPath(seed, h) {
  const { prev } = routes(seed), path = [];
  if (!prev.has(key(...h))) return [];
  for (let x = h; x && key(...x) !== key(0, 0); x = prev.get(key(...x))) path.unshift(x);
  return path;
}
