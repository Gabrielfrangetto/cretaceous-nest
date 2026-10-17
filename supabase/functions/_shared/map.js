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
//   cities: the other tribes' settlements (MAP.cities), on fern lowlands far apart, each in its calm.
//   near: how far each hex is from the nearest settlement, the nest or a city.
//
// Everything is kept in arrays by a hex's index (its row and column), so a continent of tens of
// thousands of hexes is made in a moment.
import { MAP, TRAVEL, CITY_NAMES } from './config.js';

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
// a hex's index in the arrays, and back (-1: off the map)
const N = MAP.cols * MAP.rows;
export const indexOf = h => (inMap(h) ? (h[1] + MAP.north) * MAP.cols + colOf(h) + MAP.west : -1);
const hexOf = i => { const r = Math.floor(i / MAP.cols) - MAP.north, c = (i % MAP.cols) - MAP.west; return [c - Math.floor(r / 2), r]; };
// each hex's neighbours by index (-1: off the map), six a hex
const NB = (() => {
  const nb = new Int32Array(N * 6);
  for (let i = 0; i < N; i++) { const [q, r] = hexOf(i); DIRS.forEach(([dq, dr], d) => { nb[i * 6 + d] = indexOf([q + dq, r + dr]); }); }
  return nb;
})();
// every hex of the map, nearest the nest first
export const MAP_HEXES = (() => {
  const out = [];
  for (let i = 0; i < N; i++) out.push(hexOf(i));
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
// a seeded random sequence, for picking springs, hot spots and city sites
function randOf(seed, salt) {
  let x = mix(seed + salt) || 1;
  return () => (x = mix(x + 0x9e3779b9)) / 4294967296;
}
const quantile = (list, share) => { const s = Float64Array.from(list).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * share)))]; };
// terrains by code
const OCEAN = 0, FLAT = 1, HILL = 2, MOUNTAIN = 3, VOLCANO = 4, LAKE = 5;
const TERRAINS = ['ocean', 'flat', 'hill', 'mountain', 'volcano', 'lake'];
const water = t => t === OCEAN || t === LAKE;
// a breadth-first spread from the given hexes over those pass(i) lets through: each hex's steps from the
// nearest start (-1: not reached)
function spread(starts, pass = () => true) {
  const d = new Int32Array(N).fill(-1), queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (const s of starts) if (d[s] < 0) { d[s] = 0; queue[tail++] = s; }
  while (head < tail) {
    const i = queue[head++];
    for (let k = 0; k < 6; k++) {
      const n = NB[i * 6 + k];
      if (n >= 0 && d[n] < 0 && pass(n)) { d[n] = d[i] + 1; queue[tail++] = n; }
    }
  }
  return d;
}

const cache = new Map();
// { cells: [cell by index], cities: [{ h, key, name }] }
export function worldMap(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const rand = randOf(seed, 0x51ed270b);
  const W = Math.sqrt(3) * MAP.cols, H = 1.5 * MAP.rows, S = MAP.scale;
  const [x0, y0] = xy([-MAP.west - Math.floor(-MAP.north / 2), -MAP.north]);
  // the continent's middle, somewhere around the map's middle
  const cx = x0 + W * (0.4 + rand() * 0.2), cy = y0 + H * (0.42 + rand() * 0.16);
  const nest = indexOf([0, 0]);
  const height = new Float64Array(N), terrain = new Uint8Array(N), river = new Uint8Array(N);
  const heat = new Float64Array(N), wet = new Float64Array(N), lat = new Float64Array(N), D = new Float64Array(N);
  const HX = new Array(N);
  for (let i = 0; i < N; i++) {
    const h = HX[i] = hexOf(i), [x, y] = xy(h);
    D[i] = dist(h);
    const fall = 1 - Math.hypot((x - cx) / (W * 0.46), (y - cy) / (H * 0.5));
    // the sea all around the edges
    const col = i % MAP.cols, row = Math.floor(i / MAP.cols);
    const edge = Math.min(col, MAP.cols - 1 - col, row, MAP.rows - 1 - row);
    const ridge = 1 - Math.abs(2 * fbm(seed, 0x2c1b3c6d, x, y, 22 * S, 4) - 1);
    height[i] = 0.55 * fbm(seed, 0x6a09e667, x, y, 26 * S, 5) + 0.55 * fall + 0.3 * ridge ** 3 - (edge < 4 ? (4 - edge) * 0.08 : 0);
  }
  const sea = quantile(height, 1 - MAP.land);
  // the nest's surroundings: always a calm lowland, low enough to be flat and high enough to be land
  const landHeights = height.filter(v => v > sea);
  const hill = quantile(landHeights, 1 - MAP.hills - MAP.mountains), mountain = quantile(landHeights, 1 - MAP.mountains);
  const low = quantile(landHeights, 0.3);
  const calmLow = h => Math.min(Math.max(h, sea + (low - sea) * 0.4), (sea + low) / 2 + (hill - low) * 0.3);
  for (let i = 0; i < N; i++) if (D[i] <= MAP.calm + 2) height[i] += (calmLow(height[i]) - height[i]) * (D[i] <= MAP.calm ? 1 : 0.5);
  // land: what is joined to the nest's (islands sink)
  const joined = spread([nest], n => height[n] > sea);
  for (let i = 0; i < N; i++) terrain[i] = joined[i] < 0 ? OCEAN : height[i] >= mountain ? MOUNTAIN : height[i] >= hill ? HILL : FLAT;
  // hot spots: volcanoes on the high ground, away from the nest
  const high = [];
  for (let i = 0; i < N; i++) if ((terrain[i] === HILL || terrain[i] === MOUNTAIN) && D[i] > MAP.calm + 6) high.push(i);
  for (let v = 0; v < MAP.volcanoes && high.length; v++) terrain[high.splice(Math.floor(rand() * high.length), 1)[0]] = VOLCANO;
  // how far each land hex is from the sea, for the rain that comes in from it
  const seaHexes = [];
  for (let i = 0; i < N; i++) if (terrain[i] === OCEAN) seaHexes.push(i);
  const coast = spread(seaHexes);
  // heat and rain
  for (let i = 0; i < N; i++) {
    const h = HX[i], la = latOf(h), a = Math.abs(la);
    const up = terrain[i] === OCEAN ? 0 : Math.max(0, (height[i] - sea) / (1 - sea));
    lat[i] = Math.round(la * 10) / 10;
    heat[i] = Math.max(0, Math.min(1, 1 - 0.72 * (a / 90) ** 1.3 - 0.35 * up));
    const belt = a <= 60 ? 0.62 + 0.3 * Math.cos(a * Math.PI / 30) : 0.62 + 0.3 * (1 - (a - 60) / 30) * 0.4;
    // the wind: from the east in the tropics and near the poles, from the west in between
    const dq = a < 30 || a > 60 ? 1 : -1;
    let shadow = 1;
    for (let k = 1; k <= 6; k++) {
      const j = indexOf([h[0] + dq * k, h[1]]);
      if (j < 0) break;
      if (terrain[j] === MOUNTAIN || terrain[j] === VOLCANO) { shadow = Math.min(shadow, 0.45); break; }
      if (terrain[j] === HILL) shadow = Math.min(shadow, 0.8);
    }
    const near = Math.exp(-Math.max(0, coast[i]) / (12 * S));
    wet[i] = Math.max(0, Math.min(1, belt * (0.6 + 0.4 * near) * shadow + (fbm(seed, 0x3c6ef372, ...xy(h), 14 * S, 3) - 0.5) * 0.5));
  }
  // rivers: from springs high up and wet, down to the sea or a lake
  const springs = [];
  for (let i = 0; i < N; i++) if ((terrain[i] === HILL || terrain[i] === MOUNTAIN) && wet[i] > 0.4) springs.push(i);
  const rand2 = randOf(seed, 0x1f83d9ab);
  const seen = new Int32Array(N).fill(-1);
  for (let s = 0; s < MAP.rivers && springs.length; s++) {
    let c = springs.splice(Math.floor(rand2() * springs.length), 1)[0];
    for (let step = 0; step < 400; step++) {
      seen[c] = s;
      if (terrain[c] !== MOUNTAIN && terrain[c] !== VOLCANO) river[c] = 1;
      let next = -1;
      for (let k = 0; k < 6; k++) { const n = NB[c * 6 + k]; if (n >= 0 && seen[n] !== s && (next < 0 || height[n] < height[next])) next = n; }
      if (next < 0 || water(terrain[next])) break;
      if (river[next] && step > 0) break;
      if (height[next] > height[c] && rand2() < 0.25) {
        // a pit with no way down: a lake (never at the nest); otherwise the water finds a way over
        if (D[c] > MAP.calm && terrain[c] === FLAT) { terrain[c] = LAKE; river[c] = 0; }
        break;
      }
      c = next;
    }
  }
  // a few more lakes in wet hollows
  const hollows = [];
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== FLAT || river[i] || D[i] <= MAP.calm + 2 || wet[i] <= 0.6) continue;
    let pit = true;
    for (let k = 0; k < 6; k++) { const n = NB[i * 6 + k]; if (n >= 0 && height[n] < height[i]) { pit = false; break; } }
    if (pit) hollows.push(i);
  }
  for (let l = 0; l < MAP.lakes && hollows.length; l++) terrain[hollows.splice(Math.floor(rand2() * hollows.length), 1)[0]] = LAKE;
  // biomes, by heat and rain (and water close by); around volcanoes, their slopes
  const volcanoes = [];
  for (let i = 0; i < N; i++) if (terrain[i] === VOLCANO) volcanoes.push(i);
  const fromVolcano = spread(volcanoes);
  const biome = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    if (water(terrain[i])) continue;
    let byWater = !!river[i];
    for (let k = 0; k < 6 && !byWater; k++) { const n = NB[i * 6 + k]; if (n >= 0 && water(terrain[n])) byWater = true; }
    const w = Math.min(1, wet[i] + (byWater ? 0.2 : 0));
    const lowland = terrain[i] === FLAT && height[i] < low;
    biome[i] = fromVolcano[i] >= 0 && fromVolcano[i] <= 2 ? 'volcano'
      : w < 0.3 ? 'badlands'
      : lowland && w > 0.6 && heat[i] > 0.45 ? 'swamp'
      : w > 0.58 || heat[i] < 0.42 ? 'forest'
      : 'meadow';
  }
  // the other tribes' cities: fern lowlands, mild and far from volcanoes, far from the nest and from
  // each other; each in a calm of ferns like the nest's
  const calmAround = c => { for (let i = 0; i < N; i++) if (!water(terrain[i]) && dist([HX[i][0] - HX[c][0], HX[i][1] - HX[c][1]]) <= MAP.calm) { biome[i] = 'meadow'; terrain[i] = FLAT; } };
  const sites = [];
  for (let i = 0; i < N; i++) if (biome[i] === 'meadow' && terrain[i] === FLAT && !river[i] && D[i] >= MAP.cityFromNest && (fromVolcano[i] < 0 || fromVolcano[i] > 8) && heat[i] > 0.35 && heat[i] < 0.85) sites.push(i);
  const rand3 = randOf(seed, 0x7a3d1c59), cities = [];
  while (cities.length < MAP.cities && sites.length) {
    const c = sites.splice(Math.floor(rand3() * sites.length), 1)[0];
    if (cities.some(o => dist([HX[c][0] - HX[o][0], HX[c][1] - HX[o][1]]) < MAP.citySpacing)) continue;
    cities.push(c);
  }
  for (const c of cities) calmAround(c);
  calmAround(nest);
  const near = spread([nest, ...cities]);
  const cityOf = new Map(cities.map((c, n) => [c, n]));
  const cells = new Array(N);
  for (let i = 0; i < N; i++) {
    cells[i] = { biome: biome[i], terrain: TERRAINS[terrain[i]], river: !!river[i], lat: lat[i], heat: Math.round(heat[i] * 100) / 100, wet: Math.round(wet[i] * 100) / 100, near: near[i],
      ...(cityOf.has(i) ? { city: CITY_NAMES[cityOf.get(i) % CITY_NAMES.length] } : {}) };
  }
  const out = { cells, cities: cities.map(c => ({ h: HX[c], key: key(...HX[c]), name: cells[c].city })) };
  if (cache.size > 4) cache.clear();
  cache.set(seed, out);
  return out;
}
export const cellAt = (seed, h) => { const i = indexOf(h); return i < 0 ? null : worldMap(seed).cells[i]; };
export const isWater = (seed, h) => { const c = cellAt(seed, h); return !c || c.terrain === 'ocean' || c.terrain === 'lake'; };
// the other tribes' cities: [{ h, key, name }]
export const citiesOf = seed => worldMap(seed).cities;

// How hard it is to get to each land hex from a hex (the nest by default), the easiest way (TRAVEL): a
// hex's cost is its terrain's or its biome's, whichever is more, plus a river to cross. Water can't be
// crossed.
const costs = new Map();
export const stepCost = c => Math.max(TRAVEL.terrain[c.terrain] || 1, TRAVEL.biome[c.biome] || 1) + (c.river ? TRAVEL.river : 0);
// { best: cost to each hex by index, prev: the hex (index) it is reached from }
function routes(seed, from = [0, 0]) {
  const start = indexOf(from), id = `${seed}|${start}`;
  if (costs.has(id)) return costs.get(id);
  const { cells } = worldMap(seed);
  const best = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  // a binary heap of hexes by cost
  const hc = [], hi = [];
  const push = (c, i) => {
    let k = hc.length; hc.push(c); hi.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hc[p] <= hc[k]) break; [hc[p], hc[k]] = [hc[k], hc[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; }
  };
  const pop = () => {
    const c = hc[0], i = hi[0], lc = hc.pop(), li = hi.pop();
    if (hc.length) {
      hc[0] = lc; hi[0] = li;
      for (let k = 0; ;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < hc.length && hc[l] < hc[m]) m = l;
        if (r < hc.length && hc[r] < hc[m]) m = r;
        if (m === k) break;
        [hc[m], hc[k]] = [hc[k], hc[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m;
      }
    }
    return [c, i];
  };
  if (start >= 0) { best[start] = 0; push(0, start); }
  while (hc.length) {
    const [c, i] = pop();
    if (c > best[i]) continue;
    for (let k = 0; k < 6; k++) {
      const n = NB[i * 6 + k];
      if (n < 0) continue;
      const cell = cells[n];
      if (cell.terrain === 'ocean' || cell.terrain === 'lake') continue;
      const nc = c + stepCost(cell);
      if (nc < best[n]) { best[n] = nc; prev[n] = i; push(nc, n); }
    }
  }
  if (costs.size > 12) costs.clear();
  const out = { best, prev, start };
  costs.set(id, out);
  return out;
}
// the cost of the easiest way from the nest to a hex (Infinity: there is none)
export const travelCost = (seed, h) => { const i = indexOf(h); return i < 0 ? Infinity : routes(seed).best[i]; };
// the easiest way from one hex to another (from the nest by default): the hexes crossed, the hex itself
// last (not the one it starts from); [] when there is none
export function travelPath(seed, h, from = [0, 0]) {
  const { prev, start } = routes(seed, from), end = indexOf(h), path = [];
  if (end < 0 || end === start || (prev[end] < 0)) return [];
  for (let i = end; i >= 0 && i !== start; i = prev[i]) path.unshift(hexOf(i));
  return path;
}
// the cost of the easiest way from one hex to another (Infinity: there is none)
export const routeCost = (seed, from, to) => { const i = indexOf(to); return i < 0 ? Infinity : routes(seed, from).best[i]; };
