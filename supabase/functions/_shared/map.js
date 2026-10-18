// The world map, made from the world's seed alone (so the browser and the server make the same one): a
// supercontinent on a rectangle of hexes (MAP), shaped by height, latitude and wind like a planet's.
//
// Hexes use axial coordinates (q, r) with the nest at 0,0, pointy-top: rows run west to east, r grows
// to the south. Every hex is { biome, terrain, river, lat, heat, wet }: terrain 'flat', 'hill',
// 'mountain', 'volcano', 'lake' or 'ocean' (the last two water, no one goes there); river: a river runs
// through it (then flow: how many stretches of river it carries, down: the way it flows on, 0-5 as
// DIRS, -1 where it ends; from: the way to the lake it flows out of); lat in degrees (north +); heat
// and wet from 0 to 1.
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
  // the sea is what joins the open water at the map's edges; a hollow below it inland is not the sea: a
  // great lake if it is big, low ground otherwise
  const edges = [];
  for (let i = 0; i < N; i++) { const col = i % MAP.cols, row = Math.floor(i / MAP.cols); if (terrain[i] === OCEAN && (col === 0 || row === 0 || col === MAP.cols - 1 || row === MAP.rows - 1)) edges.push(i); }
  const open = spread(edges, n => terrain[n] === OCEAN);
  const pocket = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== OCEAN || open[i] >= 0 || pocket[i] >= 0) continue;
    const members = [], queue = [i];
    pocket[i] = i;
    while (queue.length) {
      const c = queue.pop();
      members.push(c);
      for (let k = 0; k < 6; k++) { const n = NB[c * 6 + k]; if (n >= 0 && terrain[n] === OCEAN && open[n] < 0 && pocket[n] < 0) { pocket[n] = i; queue.push(n); } }
    }
    for (const c of members) {
      if (members.length >= MAP.greatLake) terrain[c] = LAKE;
      else { terrain[c] = FLAT; height[c] = sea + (low - sea) * 0.2; }
    }
  }
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
  // rivers: from springs high up and wet, down to the sea or a lake, or into another river. down: the
  // way (0-5, as DIRS) each stretch flows on to the next (-1: it ends there)
  const springs = [];
  for (let i = 0; i < N; i++) if ((terrain[i] === HILL || terrain[i] === MOUNTAIN) && wet[i] > 0.4) springs.push(i);
  const rand2 = randOf(seed, 0x1f83d9ab);
  const seen = new Int32Array(N).fill(-1), down = new Int8Array(N).fill(-1), outlet = new Int8Array(N).fill(-1);
  const wayTo = (c, n) => { for (let k = 0; k < 6; k++) if (NB[c * 6 + k] === n) return k; return -1; };
  // A lake filling a pit from hex c: the lowest ground around it is drowned, hex by hex, until the water
  // would run downhill out of it (or it reaches MAP.lakeMax hexes). Returns { out: the hex it
  // overflows into (-1: none), from: the lake's hex beside it }, or null when no lake forms.
  const fillLake = (c, s) => {
    const lake = [c], inLake = new Set([c]);
    let level = height[c];
    for (;;) {
      let best = -1, by = -1;
      for (const l of lake) for (let k = 0; k < 6; k++) {
        const n = NB[l * 6 + k];
        // (the rivers flowing in are its banks, not a way out)
        if (n >= 0 && !inLake.has(n) && !river[n] && (best < 0 || height[n] < height[best])) { best = n; by = l; }
      }
      // the lowest ground around is lower than the water, or is water, mountains or the nest's calm: the
      // lake spills there
      const floodable = best >= 0 && (terrain[best] === FLAT || terrain[best] === HILL) && D[best] > MAP.calm + 1;
      if (best < 0 || height[best] < level || !floodable || lake.length >= MAP.lakeMax) {
        for (const l of lake) { terrain[l] = LAKE; river[l] = 0; seen[l] = s; }
        return { out: best, from: by };
      }
      lake.push(best); inLake.add(best);
      level = height[best];
    }
  };
  for (let s = 0; s < MAP.rivers && springs.length; s++) {
    let c = springs.splice(Math.floor(rand2() * springs.length), 1)[0];
    // (a spring on a river already running: nothing new starts there)
    if (river[c]) continue;
    for (let step = 0; step < 400; step++) {
      seen[c] = s;
      if (terrain[c] !== MOUNTAIN && terrain[c] !== VOLCANO) river[c] = 1;
      let next = -1;
      for (let k = 0; k < 6; k++) { const n = NB[c * 6 + k]; if (n >= 0 && seen[n] !== s && (next < 0 || height[n] < height[next])) next = n; }
      if (next < 0) break;
      // into the sea or a lake, or joining a river: it ends there, flowing into it
      if (water(terrain[next]) || river[next]) { down[c] = wayTo(c, next); break; }
      if (height[next] > height[c] && rand2() < 0.25) {
        // a pit with no way down: the water fills it into a lake (never by the nest); otherwise it
        // finds a way over
        if (D[c] <= MAP.calm + 1 || terrain[c] !== FLAT) break;
        const lake = fillLake(c, s);
        if (!lake) break;
        // in dry lands the lake keeps its water (a salt lake); elsewhere it overflows at its lowest
        // edge, and a river runs on from there
        if (wet[c] < 0.3 || lake.out < 0 || water(terrain[lake.out]) || river[lake.out]) break;
        outlet[lake.out] = wayTo(lake.out, lake.from);
        c = lake.out;
        continue;
      }
      down[c] = wayTo(c, next);
      c = next;
    }
  }
  // how much water each stretch carries: itself and every stretch flowing into it (wider downstream)
  const flow = new Float64Array(N), feeds = new Int32Array(N);
  const into = i => { const n = down[i] >= 0 ? NB[i * 6 + down[i]] : -1; return n >= 0 && river[n] ? n : -1; };
  for (let i = 0; i < N; i++) if (river[i]) { flow[i] = 1; const n = into(i); if (n >= 0) feeds[n]++; }
  const ready = [];
  for (let i = 0; i < N; i++) if (river[i] && !feeds[i]) ready.push(i);
  while (ready.length) {
    const i = ready.pop(), n = into(i);
    if (n < 0) continue;
    flow[n] += flow[i];
    if (--feeds[n] === 0) ready.push(n);
  }
  // biomes, by heat and rain (and water close by); around volcanoes, their slopes
  const volcanoes = [];
  for (let i = 0; i < N; i++) if (terrain[i] === VOLCANO) volcanoes.push(i);
  const fromVolcano = spread(volcanoes);
  // how far each hex is from a river on flat ground, over flat ground (the floodplains)
  const riverFlats = [];
  for (let i = 0; i < N; i++) if (river[i] && terrain[i] === FLAT) riverFlats.push(i);
  const fromRiver = spread(riverFlats, n => terrain[n] === FLAT);
  const biome = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    if (water(terrain[i])) continue;
    let byWater = !!river[i];
    for (let k = 0; k < 6 && !byWater; k++) { const n = NB[i * 6 + k]; if (n >= 0 && water(terrain[n])) byWater = true; }
    const w = Math.min(1, wet[i] + (byWater ? 0.2 : 0));
    const lowland = terrain[i] === FLAT && height[i] < low;
    // a strip of flat ground along a river, or along the sea's shore (not cold lands: forest there)
    const byRiver = fromRiver[i] >= 0 && fromRiver[i] <= MAP.floodplain, bySea = coast[i] >= 1 && coast[i] <= MAP.shore;
    const mild = heat[i] >= 0.42;
    biome[i] = fromVolcano[i] >= 0 && fromVolcano[i] <= 2 ? 'volcano'
      : lowland && w > 0.6 && heat[i] > 0.45 ? 'swamp'
      : terrain[i] === FLAT && mild && byRiver ? 'floodplain'
      : terrain[i] === FLAT && mild && bySea ? 'coast'
      : w < 0.18 && heat[i] > 0.55 ? 'desert'
      : w < 0.3 ? 'scrub'
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
    cells[i] = { biome: biome[i], terrain: TERRAINS[terrain[i]], river: !!river[i], ...(river[i] ? { flow: flow[i], down: down[i], ...(outlet[i] >= 0 ? { from: outlet[i] } : {}) } : {}), lat: lat[i], heat: Math.round(heat[i] * 100) / 100, wet: Math.round(wet[i] * 100) / 100, near: near[i],
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
