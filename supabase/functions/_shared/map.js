// The world map, made from the world's seed alone (so the browser and the server make the same one): a
// continent on a rectangle of hexes (MAP), shaped by height, latitude and wind like a planet's. The
// sanctuary's planet was chosen for its climate, Earth's own today: the continent lies where the United
// States would on Earth (MAP.lat, from north to south), and its weather is what that land has.
//
// Hexes use axial coordinates (q, r) with the nest at 0,0, pointy-top: rows run west to east, r grows
// to the south. Every hex is { biome, terrain, river, lat, heat, wet }: terrain 'flat',
// 'mountain', 'volcano', 'lake' or 'ocean' (the last two water, no one goes there); river: a river runs
// through it (then flow: how many stretches of river it carries, down: the way it flows on, 0-5 as
// DIRS, -1 where it ends; from: the way to the lake it flows out of); lava: a lava flow cooled there (on
// Volcanic Slopes); lat in degrees (north +); heat
// and wet from 0 to 1.
//
// How it is made:
//   height: a few octaves of smooth noise and an oval falloff around the continent's middle, plus
//     ridges for the mountain ranges; the lowest share is sea, and land not joined to the nest's sinks.
//   heat: hot in the south, cold winters in the north (CLIMATE), and cooler the higher up.
//   wet: dry under the high pressure around 30 degrees, wetter northwards; the rain comes in with the
//     wind from the sea upwind (the trade winds from the east in the south, the westerlies from the west
//     further north), so the subtropics' eastern shores are wet and a range's lee lies in a rain shadow;
//     the warm sea's air drifts north over the land's eastern half (as the Gulf's does up the
//     Mississippi). The rain is spread over a few hexes, then varied with noise.
//   rivers: springs high up where it is wet, running down to the sea or a lake (a pit with no way down).
//   volcanoes: in groups along the ranges (a lone cone or a field of vents), each of its own size, with
//     lava flows running downhill from them.
//   biomes: around volcanoes Volcanic Slopes, as far as each one's size and its lava reach; wet lowlands
//     Swamp; flat ground along rivers River Floodplain, along the sea Coast & Lagoons; the driest and
//     hottest Desert Dunes, the dry Dry Scrubland; hot and wet Subtropical Forest; wet or cool Conifer
//     Forest; the rest Fern Meadow (the ferns and cycads the colonists replanted for the dinosaurs, among
//     the planet's own grasses).
//   the nest: always in a calm lowland of ferns, a few hexes across.
//   cities: the other colonists' settlements (MAP.cities), on fern lowlands far apart, each in its calm.
//   near: how far each hex is from the nearest settlement, the nest or a city.
//
// Everything is kept in arrays by a hex's index (its row and column), so a continent of tens of
// thousands of hexes is made in a moment.
import { MAP, TRAVEL, CITY_NAMES, CLIMATE } from './config.js';

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
// The uncharted north (MAP.wilds rows above the map): the continent runs on there, drawn with its
// land and climate, but it isn't part of the sanctuary yet: nobody goes there (it has no cell in the
// map; wildsAt gives what it looks like).
export const inWilds = h => {
  if (!h) return false;
  const c = colOf(h), r = h[1];
  return r >= -MAP.north - MAP.wilds && r < -MAP.north && c >= -MAP.west && c < MAP.cols - MAP.west;
};
const NW = MAP.cols * MAP.wilds;
const wildsIndex = h => (inWilds(h) ? (h[1] + MAP.north + MAP.wilds) * MAP.cols + colOf(h) + MAP.west : -1);
const wildsHex = i => { const r = Math.floor(i / MAP.cols) - MAP.north - MAP.wilds, c = (i % MAP.cols) - MAP.west; return [c - Math.floor(r / 2), r]; };
export const WILDS_HEXES = Array.from({ length: NW }, (_, i) => wildsHex(i));
export const latOf = ([, r]) => MAP.lat[0] - ((r + MAP.north + 0.5) / MAP.rows) * (MAP.lat[0] - MAP.lat[1]);
// its longitude (east +), west to east across the map: the sanctuary's planet counts them from the
// meridian through the nest, so the nest's sun time is the game's clock, UTC
export const lonOf = h => colOf(h) / MAP.cols * MAP.lonSpan;

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
const OCEAN = 0, FLAT = 1, UPLAND = 2, MOUNTAIN = 3, VOLCANO = 4, LAKE = 5;
// (the uplands, the higher ground below the mountains, are flat to cross: their rise shows in the light
// of the land alone)
const TERRAINS = ['ocean', 'flat', 'flat', 'mountain', 'volcano', 'lake'];
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
  // how high the ground is: the land falls into the sea to the west, the east and the south; to the north
  // it runs on, past the map, into the uncharted north
  const heightAt = h => {
    const [x, y] = xy(h);
    const fall = 1 - Math.hypot((x - cx) / (W * 0.46), (y - cy) / (H * (y < cy ? CLIMATE.northFall : 0.5)));
    const col = colOf(h) + MAP.west, row = h[1] + MAP.north;
    const edge = Math.min(col, MAP.cols - 1 - col, MAP.rows - 1 - row);
    const ridge = 1 - Math.abs(2 * fbm(seed, 0x2c1b3c6d, x, y, 22 * S, 4) - 1);
    return 0.55 * fbm(seed, 0x6a09e667, x, y, 26 * S, 5) + 0.55 * fall + 0.3 * ridge ** 3 - (edge < 4 ? (4 - edge) * 0.08 : 0);
  };
  for (let i = 0; i < N; i++) {
    const h = HX[i] = hexOf(i);
    D[i] = dist(h);
    height[i] = heightAt(h);
  }
  const sea = quantile(height, 1 - MAP.land);
  // the nest's surroundings: always a calm lowland, low enough to be flat and high enough to be land
  const landHeights = height.filter(v => v > sea);
  const upland = quantile(landHeights, 1 - MAP.uplands - MAP.mountains), mountain = quantile(landHeights, 1 - MAP.mountains);
  const low = quantile(landHeights, 0.3);
  const calmLow = h => Math.min(Math.max(h, sea + (low - sea) * 0.4), (sea + low) / 2 + (upland - low) * 0.3);
  for (let i = 0; i < N; i++) if (D[i] <= MAP.calm + 2) height[i] += (calmLow(height[i]) - height[i]) * (D[i] <= MAP.calm ? 1 : 0.5);
  // land: what is joined to the nest's (islands sink)
  const joined = spread([nest], n => height[n] > sea);
  for (let i = 0; i < N; i++) terrain[i] = joined[i] < 0 ? OCEAN : height[i] >= mountain ? MOUNTAIN : height[i] >= upland ? UPLAND : FLAT;
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
  // hot spots: groups of volcanoes on the high ground, away from the nest (a lone cone, or a field of a
  // few vents along a range), each vent of its own size
  const high = [];
  for (let i = 0; i < N; i++) if ((terrain[i] === UPLAND || terrain[i] === MOUNTAIN) && D[i] > MAP.calm + 8) high.push(i);
  const vents = [];
  const hexDistI = (a, b) => dist([HX[a][0] - HX[b][0], HX[a][1] - HX[b][1]]);
  for (let g = 0; g < MAP.volcanoes && high.length; g++) {
    const c = high[Math.floor(rand() * high.length)];
    const count = 1 + Math.floor(rand() ** 1.5 * 4);
    const near = high.filter(i => i !== c && hexDistI(i, c) >= 2 && hexDistI(i, c) <= 5);
    for (const v of [c, ...Array.from({ length: count - 1 }, () => near.splice(Math.floor(rand() * near.length), 1)[0]).filter(v => v !== undefined)]) {
      terrain[v] = VOLCANO;
      vents.push({ i: v, size: 0.8 + rand() * 2.2 });
    }
  }
  // lava flows: tongues of dark rock running down from a vent, the longer the bigger it is
  const lava = new Uint8Array(N);
  for (const v of vents) for (let f = 0, flows = 1 + Math.floor(rand() * 2); f < flows; f++) {
    let c = v.i;
    const steps = Math.round(2 + v.size * 2 + rand() * 2), past = new Set([c]);
    for (let s = 0; s < steps; s++) {
      let next = -1;
      for (let k = 0; k < 6; k++) { const n = NB[c * 6 + k]; if (n >= 0 && !past.has(n) && (next < 0 || height[n] + rand() * 0.01 < height[next])) next = n; }
      if (next < 0 || water(terrain[next]) || D[next] <= MAP.calm + 4) break;
      past.add(next);
      if (terrain[next] !== VOLCANO) lava[next] = 1;
      c = next;
    }
  }
  // how far each land hex is from the sea, for the rain that comes in from it
  const seaHexes = [];
  for (let i = 0; i < N; i++) if (terrain[i] === OCEAN) seaHexes.push(i);
  const coast = spread(seaHexes);
  // heat and rain, as on Earth today at these latitudes: hot in the south, cold winters in the north
  for (let i = 0; i < N; i++) {
    const h = HX[i], a = latOf(h);
    const up = terrain[i] === OCEAN ? 0 : Math.max(0, (height[i] - sea) / (1 - sea));
    lat[i] = Math.round(a * 10) / 10;
    heat[i] = Math.max(0, Math.min(1, 1 - CLIMATE.cooling * (a - MAP.lat[1]) / (MAP.lat[0] - MAP.lat[1]) - CLIMATE.lapse * up ** 2));
    // the rain belts: dry under the high pressure around 30 degrees, wetter towards 60
    const belt = 0.62 + 0.3 * Math.cos(a * Math.PI / 30);
    // the wind: the trade winds from the east south of 30 degrees, the westerlies from the west north of it
    const dq = a < 30 ? 1 : -1;
    let shadow = 1, fetch = CLIMATE.fetch;
    for (let k = 1; k <= CLIMATE.fetch; k++) {
      const j = indexOf([h[0] + dq * k, h[1]]);
      if (j < 0) break;
      if (terrain[j] === OCEAN) { fetch = k; break; }
      if (k > CLIMATE.shadow) continue;
      if (terrain[j] === MOUNTAIN || terrain[j] === VOLCANO) shadow = Math.min(shadow, 0.45);
      else if (terrain[j] === UPLAND) shadow = Math.min(shadow, 0.8);
    }
    // rain comes in with the wind from the sea upwind, and some from any sea nearby; on the subtropics'
    // eastern shores the warm sea's air makes it wet (Florida, the Gulf), not dry, and that warm wet air
    // drifts north over the land's eastern half (as the Gulf's does up the Mississippi)
    const near = Math.exp(-Math.max(0, coast[i]) / (CLIMATE.near * S)), upwind = Math.exp(-fetch / (CLIMATE.reach * S));
    const east = (i % MAP.cols) / MAP.cols;
    const humid = (a < CLIMATE.humidTo && dq > 0 ? CLIMATE.humid * upwind : 0) + CLIMATE.gulf * Math.max(0, east - 0.45) / 0.55;
    wet[i] = (belt * (CLIMATE.base + 0.25 * near + 0.3 * upwind) + humid) * shadow;
  }
  // the air mixes: the rain spreads out over a few hexes (no hard lines along the wind), then varies
  for (let pass = 0; pass < CLIMATE.blur; pass++) {
    const prev = wet.slice();
    for (let i = 0; i < N; i++) {
      let t = prev[i], n = 1;
      for (let k = 0; k < 6; k++) { const j = NB[i * 6 + k]; if (j >= 0) { t += prev[j]; n++; } }
      wet[i] = t / n;
    }
  }
  for (let i = 0; i < N; i++) wet[i] = Math.max(0, Math.min(1, wet[i] + (fbm(seed, 0x3c6ef372, ...xy(HX[i]), 14 * S, 3) - 0.5) * 0.5));
  // rivers: from springs high up and wet, down to the sea or a lake, or into another river. down: the
  // way (0-5, as DIRS) each stretch flows on to the next (-1: it ends there)
  const springs = [];
  for (let i = 0; i < N; i++) if ((terrain[i] === UPLAND || terrain[i] === MOUNTAIN) && wet[i] > 0.4) springs.push(i);
  const rand2 = randOf(seed, 0x1f83d9ab);
  const seen = new Int32Array(N).fill(-1), down = new Int8Array(N).fill(-1), outlet = new Int8Array(N).fill(-1);
  const wayTo = (c, n) => { for (let k = 0; k < 6; k++) if (NB[c * 6 + k] === n) return k; return -1; };
  // A lake filling a pit from hex c: the lowest ground around it is drowned, hex by hex, until the water
  // would run downhill out of it (or it reaches MAP.lakeMax hexes). Returns { out: the hex it
  // overflows into (-1: none), from: the lake's hex beside it }, or null when no lake forms (a pit of
  // a single hex).
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
      const floodable = best >= 0 && (terrain[best] === FLAT || terrain[best] === UPLAND) && D[best] > MAP.calm + 1;
      if (best < 0 || height[best] < level || !floodable || lake.length >= MAP.lakeMax) {
        // (a pit of a single hex is no lake: the river finds its way over it)
        if (lake.length < 2) return null;
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
        if (!lake) { down[c] = wayTo(c, next); c = next; continue; }
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
  // the volcanic slopes: around each vent as far as its size reaches, ragged at the edge, and wherever
  // lava ran
  const volcanic = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (water(terrain[i]) || fromVolcano[i] < 0 || fromVolcano[i] > 5) continue;
    if (lava[i] || terrain[i] === VOLCANO) { volcanic[i] = 1; continue; }
    const rag = 0.6 + 0.8 * fbm(seed, 0x5be0cd19, ...xy(HX[i]), 3, 2);
    for (const v of vents) if (hexDistI(i, v.i) <= v.size * rag) { volcanic[i] = 1; break; }
  }
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
    biome[i] = volcanic[i] ? 'volcano'
      : lowland && w > 0.6 && heat[i] > 0.45 ? 'swamp'
      : terrain[i] === FLAT && mild && byRiver ? 'floodplain'
      : terrain[i] === FLAT && mild && bySea ? 'coast'
      : w < CLIMATE.desert.wet && heat[i] > CLIMATE.desert.heat ? 'desert'
      : w < 0.3 ? 'scrub'
      : heat[i] > CLIMATE.subtropical.heat && w > CLIMATE.subtropical.wet ? 'subtropical'
      : w > 0.58 || (heat[i] < 0.42 && w > CLIMATE.prairie) ? 'forest'
      : 'meadow';
  }
  // the other colonists' settlements: fern lowlands, mild and far from volcanoes, far from the nest and from
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
    cells[i] = { biome: biome[i], terrain: TERRAINS[terrain[i]], ...(lava[i] && biome[i] === 'volcano' ? { lava: true } : {}), river: !!river[i], ...(river[i] ? { flow: flow[i], down: down[i], ...(outlet[i] >= 0 ? { from: outlet[i] } : {}) } : {}), lat: lat[i], heat: Math.round(heat[i] * 100) / 100, wet: Math.round(wet[i] * 100) / 100, near: near[i],
      ...(cityOf.has(i) ? { city: CITY_NAMES[cityOf.get(i) % CITY_NAMES.length] } : {}) };
  }
  let top = sea;
  for (let i = 0; i < N; i++) if (!water(terrain[i])) top = Math.max(top, height[i]);
  const up = Float32Array.from({ length: N }, (_, i) => upOf(height[i], terrain[i], sea, upland, mountain, top));
  const out = { cells, cities: cities.map(c => ({ h: HX[c], key: key(...HX[c]), name: cells[c].city })), up, wilds: null, wildsUp: null };
  // the uncharted north, made only when it is drawn
  let wilds = null;
  const north = () => wilds || (wilds = wildsOf(seed, { heightAt, sea, upland, mountain, top, terrain }));
  Object.defineProperty(out, 'wilds', { get: () => north().cells });
  Object.defineProperty(out, 'wildsUp', { get: () => north().up });
  if (cache.size > 4) cache.clear();
  cache.set(seed, out);
  return out;
}
// The uncharted north: its ground from the same heights as the map's, water that joins the sea at its
// edges (or the map's sea) is sea and the rest lakes, and many more lakes on the cold flat ground (the
// lake country scraped out by old ice); its climate carries on to the north: Boreal Forest, then Tundra
// where it is coldest, prairie where it is dry. [cell by wildsIndex]
function wildsOf(seed, { heightAt, sea, upland, mountain, top, terrain: mapTerrain }) {
  const S = MAP.scale, t = new Uint8Array(NW), up = new Float64Array(NW), hx = WILDS_HEXES;
  const nb = (i, k) => { const [q, r] = hx[i], [dq, dr] = DIRS[k]; return wildsIndex([q + dq, r + dr]); };
  for (let i = 0; i < NW; i++) {
    const v = heightAt(hx[i]);
    up[i] = Math.max(0, (v - sea) / (1 - sea));
    t[i] = v <= sea ? OCEAN : v >= mountain ? MOUNTAIN : v >= upland ? UPLAND : FLAT;
  }
  // the sea: low ground joined to the edges, or to the map's sea below
  const open = new Uint8Array(NW), queue = [];
  for (let i = 0; i < NW; i++) {
    if (t[i] !== OCEAN) continue;
    const [q, r] = hx[i], col = colOf(hx[i]) + MAP.west;
    const below = [[0, 1], [-1, 1]].some(([dq, dr]) => { const j = indexOf([q + dq, r + dr]); return j >= 0 && mapTerrain[j] === OCEAN; });
    if (r === -MAP.north - MAP.wilds || col === 0 || col === MAP.cols - 1 || below) { open[i] = 1; queue.push(i); }
  }
  while (queue.length) { const c = queue.pop(); for (let k = 0; k < 6; k++) { const n = nb(c, k); if (n >= 0 && t[n] === OCEAN && !open[n]) { open[n] = 1; queue.push(n); } } }
  // how far from the sea, for its rain
  const coast = new Int32Array(NW).fill(-1), q2 = [];
  for (let i = 0; i < NW; i++) if (open[i]) { coast[i] = 0; q2.push(i); }
  for (let h = 0; h < q2.length; h++) { const c = q2[h]; for (let k = 0; k < 6; k++) { const n = nb(c, k); if (n >= 0 && coast[n] < 0) { coast[n] = coast[c] + 1; q2.push(n); } } }
  const cells = new Array(NW);
  for (let i = 0; i < NW; i++) {
    const h = hx[i], [x, y] = xy(h), a = latOf(h);
    const heat = Math.max(0, Math.min(1, 1 - CLIMATE.cooling * (a - MAP.lat[1]) / (MAP.lat[0] - MAP.lat[1]) - CLIMATE.lapse * up[i] ** 2));
    const near = Math.exp(-Math.max(0, coast[i]) / (CLIMATE.near * S));
    const wet = Math.max(0, Math.min(1, (0.62 + 0.3 * Math.cos(a * Math.PI / 30)) * (CLIMATE.base + 0.25 * near) + (fbm(seed, 0x3c6ef372, x, y, 14 * S, 3) - 0.5) * 0.5));
    let terrain = t[i] === OCEAN ? (open[i] ? 'ocean' : 'lake') : TERRAINS[t[i]];
    if (terrain === 'flat' && heat < CLIMATE.wilds.lakes && fbm(seed, 0x5bd1e995, x, y, 4 * S, 3) > CLIMATE.wilds.lakeNoise) terrain = 'lake';
    const biome = terrain === 'ocean' || terrain === 'lake' ? null
      : heat < CLIMATE.wilds.tundra ? 'tundra' : heat < CLIMATE.wilds.taiga ? 'taiga' : wet < 0.3 ? 'meadow' : 'forest';
    cells[i] = { biome, terrain, river: false, lat: Math.round(a * 10) / 10, wilds: true };
  }
  return { cells, up: Float32Array.from({ length: NW }, (_, i) => cells[i].biome ? upOf(heightAt(hx[i]), t[i], sea, upland, mountain, top) : 0) };
}
export const wildsAt = (seed, h) => { const i = wildsIndex(h); return i < 0 ? null : worldMap(seed).wilds[i]; };
// How high a hex stands, for drawing its relief: 0 at the sea, 1 the map's highest peak; water is 0. It is
// the height the land was made from, kept within its terrain's band (flat ground below the uplands, uplands
// below the mountains), so the relief drawn agrees with the terrain.
export const upAt = (seed, h) => {
  let i = indexOf(h);
  if (i >= 0) return worldMap(seed).up[i];
  i = wildsIndex(h);
  return i < 0 ? 0 : worldMap(seed).wildsUp[i];
};
function upOf(v, t, sea, upland, mountain, top) {
  if (t === OCEAN || t === LAKE) return 0;
  const at = x => Math.max(0, (x - sea) / (top - sea)), u = Math.min(1, at(v)), uh = at(upland), um = at(mountain);
  return t === FLAT ? Math.min(u, uh) : t === UPLAND ? Math.min(Math.max(u, uh), um) : Math.max(u, um);
}
export const cellAt = (seed, h) => { const i = indexOf(h); return i < 0 ? null : worldMap(seed).cells[i]; };
export const isWater = (seed, h) => { const c = cellAt(seed, h); return !c || c.terrain === 'ocean' || c.terrain === 'lake'; };
// the other colonists' settlements: [{ h, key, name }]
export const citiesOf = seed => worldMap(seed).cities;

// How hard it is to get to each land hex from a hex (the nest by default), the easiest way (TRAVEL): a
// hex's cost is its terrain's or its biome's, whichever is more, plus a river to cross. Water can't be
// crossed.
const costs = new Map();
// (a river takes crossing when the way steps into it; along its bank, from river hex to river hex, it
// doesn't: from is the hex the way comes from)
export const stepCost = (c, from = null) => Math.max(TRAVEL.terrain[c.terrain] || 1, TRAVEL.biome[c.biome] || 1) + (c.river && !(from && from.river) ? TRAVEL.river : 0);
// { best: cost to each hex by index, prev: the hex (index) it is reached from } (avoid: a hex the ways
// go around, by index)
function routes(seed, from = [0, 0], avoid = -1) {
  const start = indexOf(from), id = `${seed}|${start}|${avoid}`;
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
      if (n < 0 || n === avoid) continue;
      const cell = cells[n];
      if (cell.terrain === 'ocean' || cell.terrain === 'lake') continue;
      const nc = c + stepCost(cell, cells[i]);
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
// last (not the one it starts from); [] when there is none. around: a hex the way goes around
export function travelPath(seed, h, from = [0, 0], around = null) {
  const { prev, start } = routes(seed, from, around ? indexOf(around) : -1), end = indexOf(h), path = [];
  if (end < 0 || end === start || (prev[end] < 0)) return [];
  for (let i = end; i >= 0 && i !== start; i = prev[i]) path.unshift(hexOf(i));
  return path;
}
// The easiest way from one hex to another that never steps on the hexes kept out (blocked: hex keys):
// the hexes crossed, the hex itself last; [] when there is none
export function wayAround(seed, h, from, blocked) {
  const { cells } = worldMap(seed), start = indexOf(from), end = indexOf(h);
  if (start < 0 || end < 0 || start === end) return [];
  const out = new Set([...blocked].map(k => indexOf(parse(k))));
  out.delete(start);
  const best = new Map([[start, 0]]), prev = new Map(), open = [[0, start]];
  // (a binary heap of [cost, hex] by cost)
  const push = e => { let k = open.push(e) - 1; while (k > 0) { const q = (k - 1) >> 1; if (open[q][0] <= open[k][0]) break; [open[q], open[k]] = [open[k], open[q]]; k = q; } };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) {
      open[0] = last;
      for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; }
    }
    return top;
  };
  while (open.length) {
    const [c, i] = pop();
    if (c > best.get(i)) continue;
    if (i === end) break;
    for (let k = 0; k < 6; k++) {
      const n = NB[i * 6 + k];
      if (n < 0 || out.has(n)) continue;
      const cell = cells[n];
      if (cell.terrain === 'ocean' || cell.terrain === 'lake') continue;
      const nc = c + stepCost(cell, cells[i]);
      if (!best.has(n) || nc < best.get(n)) { best.set(n, nc); prev.set(n, i); push([nc, n]); }
    }
  }
  if (!prev.has(end)) return [];
  const path = [];
  for (let i = end; i !== start; i = prev.get(i)) path.unshift(hexOf(i));
  return path;
}
// the cost of the easiest way from one hex to another (Infinity: there is none)
export const routeCost = (seed, from, to) => { const i = indexOf(to); return i < 0 ? Infinity : routes(seed, from).best[i]; };

// ---------- the colonists' maglev ----------
// Stations at the nest and every city on rings of line, so every train runs on from city to city and
// never ends its way at one: first one ring through them all (the shortest that never crosses itself),
// then a few straight links across it where two stations near each other are far apart round it, each
// cutting its ring in two that share it. Each line is laid as straight as it can go between its two
// stations over land, around the mountains (never over water or volcanoes; through a mountain only
// where there is no other way). { stations: [keys], lines: [{ a, b, path: [hex keys, a to b] }], rings: [[the
// station keys round each ring, in order]], at: Map(hex key -> [the hex keys the line runs on to]) }
const rails = new Map();
const parse = k => k.split(',').map(Number);
// (what a step onto each ground costs a line; Infinity: never)
const RAIL_GROUND = { flat: 1, mountain: 30, volcano: Infinity, ocean: Infinity, lake: Infinity };
// the straightest way over easy land from one hex to another: each step costs its ground, and more the
// farther it strays from the straight line between them. The hexes, from first to last; [] when none
function railPath(seed, from, to) {
  const { cells } = worldMap(seed), start = indexOf(from), end = indexOf(to);
  const [ax, ay] = xy(from), [bx, by] = xy(to), len = Math.hypot(bx - ax, by - ay) || 1;
  const off = h => { const [x, y] = xy(h); return Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / len / Math.sqrt(3); };
  const best = new Map([[start, 0]]), prev = new Map(), open = [[dist([to[0] - from[0], to[1] - from[1]]), start]];
  // (a binary heap of [cost, hex] by cost)
  const push = e => { let k = open.push(e) - 1; while (k > 0) { const q = (k - 1) >> 1; if (open[q][0] <= open[k][0]) break; [open[q], open[k]] = [open[k], open[q]]; k = q; } };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) {
      open[0] = last;
      for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; }
    }
    return top;
  };
  const done = new Set();
  while (open.length) {
    const [, i] = pop();
    if (done.has(i)) continue;
    done.add(i);
    if (i === end) break;
    for (let k = 0; k < 6; k++) {
      const n = NB[i * 6 + k];
      // (a station is reached whatever its ground)
      const ground = n === end ? 1 : RAIL_GROUND[cells[n]?.terrain] ?? 1;
      if (n < 0 || ground === Infinity) continue;
      const h = hexOf(n), d = off(h), nc = best.get(i) + ground + 0.04 * d * d;
      if (!best.has(n) || nc < best.get(n)) { best.set(n, nc); prev.set(n, i); push([nc + dist([to[0] - h[0], to[1] - h[1]]), n]); }
    }
  }
  if (!prev.has(end)) return [];
  const path = [];
  for (let i = end; i !== start; i = prev.get(i)) path.unshift(hexOf(i));
  path.unshift(from);
  // (what it costs to build: its ground, hex by hex)
  path.cost = path.reduce((t, h, i) => t + (i ? RAIL_GROUND[cells[indexOf(h)].terrain] ?? 1 : 0), 0);
  return path;
}
// (two straight stretches between stations cross, not counting a shared end)
const crosses = (a, b, c, d) => {
  if (a === c || a === d || b === c || b === d) return false;
  const [p, q, r, t] = [a, b, c, d].map(k => xy(parse(k)));
  const side = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
  return side(p, q, r) !== side(p, q, t) && side(r, t, p) !== side(r, t, q);
};
// a link across a ring only where the way round is at least this many times as far as straight across
const LINK_DETOUR = 2.5, LINKS = 3;
export function railsOf(seed) {
  if (rails.has(seed)) return rails.get(seed);
  const all = [key(0, 0), ...citiesOf(seed).map(c => c.key)];
  // (the line each two stations would have, and what it costs to build: Infinity where none can be)
  const paths = new Map(), lineOf = (a, b) => {
    const id = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!paths.has(id)) { const p = railPath(seed, parse(a), parse(b)).map(h => key(...h)); paths.set(id, { a, p, cost: p.length ? railPath(seed, parse(a), parse(b)).cost : Infinity }); }
    const l = paths.get(id);
    return l.a === a ? l.p : [...l.p].reverse();
  };
  const far = (a, b) => { lineOf(a, b); return paths.get(a < b ? `${a}|${b}` : `${b}|${a}`).cost; };
  // (only the stations the nest can reach)
  const stations = all.filter(k => k === all[0] || far(all[0], k) < Infinity);
  // the ring: nearest first, then untangled (any two lines that cross swapped for two that don't)
  const ring = [stations[0]], left = new Set(stations.slice(1));
  while (left.size) {
    let n = null;
    for (const k of left) if (n === null || far(ring[ring.length - 1], k) < far(ring[ring.length - 1], n)) n = k;
    ring.push(n);
    left.delete(n);
  }
  const len = r => r.reduce((t, k, i) => t + far(k, r[(i + 1) % r.length]), 0);
  for (let better = true; better;) {
    better = false;
    for (let i = 1; i < ring.length - 1; i++) for (let j = i + 1; j < ring.length; j++) {
      const r = [...ring.slice(0, i), ...ring.slice(i, j + 1).reverse(), ...ring.slice(j + 1)];
      if (len(r) < len(ring) - 1e-9) { ring.splice(0, ring.length, ...r); better = true; }
    }
  }
  // the links across: each time, the one that saves the most, cutting its ring in two
  const rings = ring.length > 2 ? [ring] : [];
  const edges = () => { const e = []; for (const r of rings) r.forEach((k, i) => { const b = r[(i + 1) % r.length]; if (!e.some(([x, y]) => (x === k && y === b) || (x === b && y === k))) e.push([k, b]); }); return e; };
  const around = (a, b) => {
    // (the shortest way on the lines so far, straight stretch by stretch)
    const d = new Map([[a, 0]]), todo = new Set(stations), es = edges();
    while (todo.size) {
      let u = null;
      for (const k of todo) if (d.has(k) && (u === null || d.get(k) < d.get(u))) u = k;
      if (u === null) break;
      todo.delete(u);
      for (const [x, y] of es) if (x === u || y === u) { const v = x === u ? y : x, nd = d.get(u) + far(x, y); if (!d.has(v) || nd < d.get(v)) d.set(v, nd); }
    }
    return d.get(b) ?? Infinity;
  };
  for (let n = 0; n < LINKS; n++) {
    let pick = null;
    for (const [ri, r] of rings.entries()) for (let i = 0; i < r.length; i++) for (let j = i + 2; j < r.length; j++) {
      if (i === 0 && j === r.length - 1) continue;
      const a = r[i], b = r[j], gain = around(a, b) / far(a, b);
      if (gain < LINK_DETOUR || (pick && gain <= pick.gain)) continue;
      if (edges().some(([x, y]) => crosses(a, b, x, y))) continue;
      pick = { ri, i, j, gain };
    }
    if (!pick) break;
    const r = rings[pick.ri];
    rings.splice(pick.ri, 1, r.slice(pick.i, pick.j + 1), [...r.slice(pick.j), ...r.slice(0, pick.i + 1)]);
  }
  const lines = (rings.length ? edges() : stations.length === 2 ? [stations] : []).map(([a, b]) => ({ a, b, path: lineOf(a, b) }));
  const at = new Map();
  const link = (x, y) => { if (!at.has(x)) at.set(x, []); if (!at.get(x).includes(y)) at.get(x).push(y); };
  for (const l of lines) for (let i = 1; i < l.path.length; i++) { link(l.path[i - 1], l.path[i]); link(l.path[i], l.path[i - 1]); }
  const out = { stations, lines, rings, at };
  if (rails.size > 4) rails.clear();
  rails.set(seed, out);
  return out;
}
export const isStation = (seed, k) => railsOf(seed).stations.includes(k);
// The train between two stations, changing at others on the way: { stops: [station keys, from first],
// path: [the hex keys ridden, from excluded], hexes } or null when no line joins them
export function trainRoute(seed, from, to) {
  const { stations, lines } = railsOf(seed);
  if (from === to || !stations.includes(from) || !stations.includes(to)) return null;
  const dist = new Map([[from, 0]]), prev = new Map(), left = new Set(stations);
  while (left.size) {
    let u = null;
    for (const k of left) if (dist.has(k) && (u === null || dist.get(k) < dist.get(u))) u = k;
    if (u === null || u === to) break;
    left.delete(u);
    for (const l of lines) {
      if (l.a !== u && l.b !== u) continue;
      const v = l.a === u ? l.b : l.a, d = dist.get(u) + l.path.length - 1;
      if (!dist.has(v) || d < dist.get(v)) { dist.set(v, d); prev.set(v, { u, l }); }
    }
  }
  if (!dist.has(to)) return null;
  const stops = [to], path = [];
  for (let k = to; k !== from; k = prev.get(k).u) {
    const { u, l } = prev.get(k);
    const seg = l.a === u ? l.path : [...l.path].reverse();
    path.unshift(...seg.slice(1));
    stops.unshift(u);
  }
  return { stops, path, hexes: path.length };
}
