// Land vehicles (docs/VEHICLES.md): bought or rented at a station, parked on a hex, driven from one hex
// to another by the player with whoever fits aboard. A vehicle: { id, kind, at: hex key where it is
// parked (or will be, once there), charge: hexes of open land left in its battery, owned: true, or
// until: when its rental ends }. Driving itself is a party's leg (journey.js startDrive).
import { VEHICLES, DRIVE, COMPARTMENTS, PLAYER_ID, PLAYER_SIZE, worldMins } from './config.js';
import { cellAt, isStation } from './map.js';
import { parseKey, hexKey, hexDist, neighbors, bodyOf, expeditionOf } from './world.js';

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
// real minutes a drive of so many hours at the wheel takes (DRIVE.day hours of it a day of the world)
export const driveMins = hours => worldMins(hours * 24 / DRIVE.day);

// the player's vehicles, rentals that have run out let go
export function vehiclesOf(s, now) {
  const w = W(s);
  w.vehicles = (w.vehicles || []).filter(v => v.owned || (now != null && v.until > now) || (now == null));
  return w.vehicles;
}
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

// Renting or buying a vehicle at the station the player stands at: it waits there
export function getVehicle(s, kind, now, days = null) {
  const spec = VEHICLES[kind], at = playerAt(s, now);
  if (!spec) return { ok: false, reason: 'no-vehicle' };
  if (!at || !isStation(W(s).seed, at)) return { ok: false, reason: 'no-station' };
  const rent = days != null;
  if (rent && !DRIVE.days.includes(days)) return { ok: false, reason: 'days' };
  const cost = rent ? spec.rent * days : spec.price;
  if (s.coins < cost) return { ok: false, reason: 'coins' };
  s.coins -= cost;
  const list = vehiclesOf(s, now), n = list.reduce((m, v) => Math.max(m, Number(String(v.id).slice(1)) || 0), 0) + 1;
  const v = { id: `v${n}`, kind, at, charge: spec.range, ...(rent ? { until: now + worldMins(days * 24) * 60000 } : { owned: true }) };
  list.push(v);
  return { ok: true, vehicle: v, cost };
}

// whether a team fits a vehicle's compartments (the player in a seat, each dinosaur in one that takes
// its size), or why not
export function fitProblem(s, kind, members) {
  const free = {};
  for (const car of VEHICLES[kind].cars) free[car.kind] = (free[car.kind] || 0) + car.places;
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
  return (Array.isArray(list) ? list : []).filter(v => v && VEHICLES[v.kind] && typeof v.at === 'string' && land(v.at)).map(v => ({
    id: String(v.id), kind: v.kind, at: v.at, charge: Math.max(0, Math.min(VEHICLES[v.kind].range, Number(v.charge) || 0)),
    ...(v.owned === true ? { owned: true } : { until: Number(v.until) || 0 }),
  })).filter((v, i, all) => all.findIndex(x => x.id === v.id) === i);
}
