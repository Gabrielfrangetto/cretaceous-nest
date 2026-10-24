// Land vehicles (docs/VEHICLES.md): bought at a station, parked on a hex, driven from one hex to another
// by the player with whoever fits aboard. A vehicle: { id, kind, at: hex key where it is parked (or will
// be, once there), charge: hexes of open land left in its battery, owned: true }. Driving itself is a
// party's leg (journey.js startDrive). And the science teams' trucks, on their timetable (SCIENCE).
import { VEHICLES, DRIVE, COMPARTMENTS, SCIENCE, MAGLEV, PLAYER_ID, PLAYER_SIZE, worldMins } from './config.js';
import { cellAt, isStation, railsOf } from './map.js';
import { parseKey, hexKey, hexDist, neighbors, bodyOf, expeditionOf, isWater } from './world.js';

const W = s => s.world;
// a hex a vehicle can't enter, or what a hex takes to drive into: { hours (of the world), charge }
const blocked = c => !c || DRIVE.never.terrain.includes(c.terrain) || DRIVE.never.biome.includes(c.biome);
function hexDrive(c, from) {
  const open = DRIVE.open.includes(c.biome) && c.terrain === 'flat';
  const river = c.river && !(from && from.river);
  return { hours: (open ? DRIVE.hours.open : DRIVE.hours.rough) + (river ? DRIVE.hours.river : 0), charge: open ? 1 : DRIVE.rough };
}
// The way a vehicle drives from one hex to another, the quickest over land it can cross: { path: hex
// keys (from excluded), hours of the world at the wheel, charge (hexes of battery) } or null
const ways = new Map();
export function drivePath(seed, from, to) {
  const id = `${seed}|${from}|${to}`;
  if (ways.has(id)) return ways.get(id);
  const start = parseKey(from), end = parseKey(to);
  if (from === to || blocked(cellAt(seed, end)) && !isStation(seed, to)) return null;
  const best = new Map([[from, 0]]), prev = new Map(), open = [[hexDist([end[0] - start[0], end[1] - start[1]]) * DRIVE.hours.open, from]];
  const done = new Set();
  // (a binary heap of [cost, key] by cost)
  const push = e => { let k = open.push(e) - 1; while (k > 0) { const q = (k - 1) >> 1; if (open[q][0] <= open[k][0]) break; [open[q], open[k]] = [open[k], open[q]]; k = q; } };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) { open[0] = last; for (let k = 0; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } }
    return top;
  };
  let steps = 0;
  while (open.length && steps++ < 200000) {
    const [, k] = pop();
    if (done.has(k)) continue;
    done.add(k);
    if (k === to) break;
    const h = parseKey(k), here = cellAt(seed, h);
    for (const n of neighbors(h)) {
      const nk = hexKey(...n), c = cellAt(seed, n);
      if (blocked(c) && nk !== to) continue;
      const nc = best.get(k) + hexDrive(c || here, here).hours;
      if (!best.has(nk) || nc < best.get(nk)) { best.set(nk, nc); prev.set(nk, k); push([nc + hexDist([end[0] - n[0], end[1] - n[1]]) * DRIVE.hours.open, nk]); }
    }
  }
  if (!prev.has(to)) { ways.set(id, null); return null; }
  const path = [];
  for (let k = to; k !== from; k = prev.get(k)) path.unshift(k);
  let hours = 0, charge = 0, last = cellAt(seed, start);
  for (const k of path) { const c = cellAt(seed, parseKey(k)), d = hexDrive(c, last); hours += d.hours; charge += d.charge; last = c; }
  const out = { path, hours, charge: Math.ceil(charge) };
  if (ways.size > 300) ways.clear();
  ways.set(id, out);
  return out;
}
// real minutes a drive of so many hours at the wheel takes: DRIVE.day hours at the wheel a day, a night's
// rest after each whole day of it
export const driveMins = hours => worldMins(hours + Math.floor(hours / DRIVE.day) * (24 - DRIVE.day));

// the player's vehicles
export const vehiclesOf = s => (W(s).vehicles = W(s).vehicles || []);
export const vehicleOf = (s, id) => (W(s).vehicles || []).find(v => v.id === id) || null;
// the party driving a vehicle now, if any
export const driverOf = (s, v, now) => W(s).expeditions.find(e => e.leg && e.leg.drive === v.id && now < e.leg.arriveAt) || null;
// where the player is, standing (not on the way): the nest, or the hex their party waits at; null on the way
export function playerAt(s, now) {
  const p = expeditionOf(s, PLAYER_ID);
  if (!p) return '0,0';
  return p.leg && now < p.leg.arriveAt ? null : p.leg ? p.leg.to : p.at;
}
// its battery, full again at a station
export const chargeOf = (s, v) => (isStation(W(s).seed, v.at) ? VEHICLES[v.kind].range : v.charge);

// Buying a vehicle at the station the player stands at: it waits there
export function getVehicle(s, kind, now) {
  const spec = VEHICLES[kind], at = playerAt(s, now);
  if (!spec) return { ok: false, reason: 'no-vehicle' };
  if (!at || !isStation(W(s).seed, at)) return { ok: false, reason: 'no-station' };
  if (s.coins < spec.price) return { ok: false, reason: 'coins' };
  s.coins -= spec.price;
  const list = vehiclesOf(s), n = list.reduce((m, v) => Math.max(m, Number(String(v.id).slice(1)) || 0), 0) + 1;
  const v = { id: `v${n}`, kind, at, charge: spec.range, owned: true };
  list.push(v);
  return { ok: true, vehicle: v, cost: spec.price };
}

// ---------- the science teams ----------
// Where a station's teams may go: the hexes near to radius hexes off that a truck can reach and come
// back from, by a way not much longer than the distance. [{ to, out, back }] (drivePath's)
const targets = new Map();
export function scienceTargets(seed, station) {
  const id = `${seed}|${station}`;
  if (targets.has(id)) return targets.get(id);
  const [q0, r0] = parseKey(station), out = [];
  for (let dq = -SCIENCE.radius; dq <= SCIENCE.radius; dq++) for (let dr = -SCIENCE.radius; dr <= SCIENCE.radius; dr++) {
    const d = hexDist([dq, dr]);
    if (d < SCIENCE.near || d > SCIENCE.radius) continue;
    const k = hexKey(q0 + dq, r0 + dr);
    if (isWater(seed, parseKey(k)) || isStation(seed, k)) continue;
    const go = drivePath(seed, station, k), back = go && drivePath(seed, k, station);
    if (go && back && go.path.length <= d * 2) out.push({ to: k, out: go, back });
  }
  targets.set(id, out);
  return out;
}
const hash = str => { let h = 2166136261; for (const c of str) { h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 13; } return (h >>> 0) / 4294967296; };
// a station's timetable: its teams set out every SCIENCE.every minutes, from a time of their own
const phaseOf = (seed, station) => hash(`sci:${seed}:${station}`) * SCIENCE.every;
// The k-th team to set out from a station: { station, k, to, out, back, departAt, arriveAt (there),
// backAt (sets out back), homeAt (back at the station) } (real instants), or null where none can go
export function scienceTrip(seed, station, k) {
  const list = scienceTargets(seed, station);
  if (!list.length) return null;
  const t = list[Math.floor(hash(`sci:${seed}:${station}:${k}`) * list.length)];
  const departAt = Math.round((phaseOf(seed, station) + k * SCIENCE.every) * 60000);
  const arriveAt = departAt + Math.round(driveMins(t.out.hours) * 60000), backAt = arriveAt + Math.round(SCIENCE.stay * 60000);
  return { station, k, to: t.to, out: t.out, back: t.back, departAt, arriveAt, backAt, homeAt: backAt + Math.round(driveMins(t.back.hours) * 60000) };
}
const doorsOpen = (at, now) => at >= now + MAGLEV.board * 1000;
// the next teams setting out from a station whose doors are still open
export function scienceFrom(seed, station, now, count = 3) {
  const k0 = Math.ceil((now / 60000 - phaseOf(seed, station)) / SCIENCE.every) - 1, out = [];
  for (let k = k0; out.length < count && k < k0 + count + 2; k++) { const t = scienceTrip(seed, station, k); if (t && doorsOpen(t.departAt, now)) out.push(t); }
  return out;
}
// the teams at work or on their way now (for the map), and those studying a hex (to ride back with)
export function scienceAt(seed, now) {
  const out = [], span = (SCIENCE.stay + 2 * driveMins(SCIENCE.radius * 2 * DRIVE.hours.rough)) * 60000;
  for (const station of railsOf(seed).stations) {
    const p = phaseOf(seed, station), k1 = Math.floor((now / 60000 - p) / SCIENCE.every), k0 = Math.floor(((now - span) / 60000 - p) / SCIENCE.every);
    for (let k = k0; k <= k1; k++) { const t = scienceTrip(seed, station, k); if (t && t.departAt <= now && now < t.homeAt) out.push(t); }
  }
  return out;
}
export const scienceBackFrom = (seed, hex, now) => scienceAt(seed, now).filter(t => t.to === hex && doorsOpen(t.backAt, now));

// whether a team fits a vehicle's compartments (the player in a seat, each dinosaur in one that takes
// its size), or why not
export function fitProblem(s, kind, members) {
  const free = {};
  for (const car of (Array.isArray(kind) ? kind : VEHICLES[kind].cars)) free[car.kind] = (free[car.kind] || 0) + car.places;
  // (the biggest first, each in the snuggest compartment that takes it)
  const sizeOf = id => (id === PLAYER_ID ? 'player' : bodyOf(s, id).size || PLAYER_SIZE);
  const order = ['player', 'colossal', 'huge', 'large', 'medium', 'small', 'tiny'];
  for (const id of [...members].sort((a, b) => order.indexOf(sizeOf(a)) - order.indexOf(sizeOf(b)))) {
    const kinds = Object.keys(COMPARTMENTS).filter(k => COMPARTMENTS[k].includes(sizeOf(id)) && free[k] > 0);
    if (!kinds.length) return 'no-room';
    const k = kinds.sort((a, b) => COMPARTMENTS[a].length - COMPARTMENTS[b].length)[0];
    free[k]--;
  }
  return null;
}

// the vehicles as saved, checked
export function cleanVehicles(list, land) {
  // (rentals, from before the science teams, are gone)
  return (Array.isArray(list) ? list : []).filter(v => v && VEHICLES[v.kind] && v.owned === true && typeof v.at === 'string' && land(v.at)).map(v => ({
    id: String(v.id), kind: v.kind, at: v.at, charge: Math.max(0, Math.min(VEHICLES[v.kind].range, Number(v.charge) || 0)), owned: true,
  })).filter((v, i, all) => all.findIndex(x => x.id === v.id) === i);
}
