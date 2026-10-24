// Land vehicles: bought at a station, and rides with the science teams; driven by the player from hex to hex with whoever fits
// aboard, a battery for so many hexes (docs/VEHICLES.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { newWorld, hexKey, parseKey, hexDist } from '../js/world.js';
import { partyOf, cleanParties } from '../js/journey.js';
import { drivePath, driveMins, vehiclesOf, fitProblem, scienceFrom, scienceBackFrom } from '../js/vehicles.js';
import { cellAt } from '../js/map.js';
import { CAPSULES, VEHICLES, DRIVE, SCIENCE, PLAYER_ID, worldMins } from '../js/config.js';

const T0 = 1_000_000_000_000;
const grown = (fed, type) => fed >= 30 ? CAPSULES[type].adult : fed >= 10 ? CAPSULES[type].juvenile : fed;
const dino = (id, fed, type = 'raptor') => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed: grown(fed, type), lastFed: T0, genes: { str: 50, agi: 50, vit: 50, res: 50 }, equip: {} });
function game(...babies) {
  const s = freshState();
  s.world = newWorld(42);
  s.hatched.push(...babies);
  s.coins = 100000;
  return s;
}
const me = { kind: 'player', id: PLAYER_ID }, dinos = (...ids) => ids.map(id => ({ kind: 'dino', id }));
// a hex of open land a few hexes off, that a vehicle can reach
const near = (() => { for (const k of ['3,2', '4,0', '2,3', '-3,4', '0,4']) if (drivePath(42, '0,0', k)) return k; return null; })();

test('buy at a station, where the player stands; it waits there', () => {
  const s = game();
  assert.equal(applyAction(s, 'vehicle', { kind: 'tank' }, T0).reason, 'no-vehicle');
  const coins = s.coins;
  const b = applyAction(s, 'vehicle', { kind: 'hauler' }, T0);
  assert.equal(b.ok && b.vehicle.owned, true);
  assert.equal(s.coins, coins - VEHICLES.hauler.price);
  assert.equal(b.vehicle.at, '0,0');
  // (out with the team, not at a station: no garage)
  const r = applyAction(s, 'drive', { vehicle: b.vehicle.id, to: near, team: [me] }, T0);
  const there = r.expedition.leg.arriveAt;
  applyAction(s, 'journey', { id: r.expedition.id }, there);
  assert.equal(applyAction(s, 'vehicle', { kind: 'rover' }, there).reason, 'no-station');
  assert.deepEqual(vehiclesOf(s).map(v => v.kind), ['hauler']);
});

test('science teams: out on a timetable to a hex near the station, studying, back; a free ride, out or back', () => {
  const s = game(dino('a', 30), dino('rex', 30, 'rex'));
  const trips = scienceFrom(42, '0,0', T0);
  assert.equal(trips.length, 3);
  for (const t of trips) {
    const [q, r] = parseKey(t.to);
    assert.ok(hexDist([q, r]) >= SCIENCE.near && hexDist([q, r]) <= SCIENCE.radius);
    assert.ok(t.departAt >= T0 && t.arriveAt > t.departAt && t.backAt - t.arriveAt === Math.round(SCIENCE.stay * 60000) && t.homeAt > t.backAt);
  }
  // (the same for everyone: the timetable from the clock alone)
  assert.deepEqual(scienceFrom(42, '0,0', T0), trips);
  const t = trips[0], coins = s.coins;
  assert.equal(applyAction(s, 'science', { station: '0,0', k: t.k, team: dinos('a') }, T0).reason, 'no-player');
  const r = applyAction(s, 'science', { station: '0,0', k: t.k, team: [me, ...dinos('a', 'rex')] }, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.coins, coins);
  const p = partyOf(s, r.expedition.id);
  assert.equal(p.leg.startedAt, t.departAt);
  assert.equal(p.leg.arriveAt, t.arriveAt);
  // (a saved game keeps the ride)
  assert.deepEqual(cleanParties(s, s.world)[0].leg.sci, { station: '0,0', k: t.k });
  // getting off before the doors close: home again
  assert.equal(applyAction(s, 'alight', { id: p.id }, T0).ok, true);
  assert.equal(s.world.expeditions.length, 0);
  // on again, there, and back with the same team before it drives home
  const again = applyAction(s, 'science', { station: '0,0', k: t.k, team: [me, ...dinos('a')] }, T0);
  const q = partyOf(s, again.expedition.id);
  applyAction(s, 'journey', { id: q.id }, t.arriveAt);
  assert.equal(q.at, t.to);
  assert.ok(scienceBackFrom(42, t.to, t.arriveAt).some(x => x.k === t.k));
  const home = applyAction(s, 'science', { station: '0,0', k: t.k, back: true, id: q.id }, t.arriveAt);
  assert.equal(home.ok, true, home.reason);
  applyAction(s, 'journey', { id: q.id }, t.homeAt);
  assert.equal(s.world.expeditions.length, 0);
  // (its doors closed: too late)
  assert.equal(applyAction(s, 'science', { station: '0,0', k: t.k, team: [me] }, t.departAt - 1000).reason, 'train-gone');
});

test('a drive: quicker than walking, safe, parked where it went; the battery, the room aboard, the player at the wheel', () => {
  assert.ok(near, 'a hex to drive to');
  const s = game(dino('a', 30), dino('b', 30), dino('c', 30), dino('rex', 30, 'rex'));
  const v = applyAction(s, 'vehicle', { kind: 'rover' }, T0).vehicle;
  // no driver, too big, too many for a rover
  assert.equal(applyAction(s, 'drive', { vehicle: v.id, to: near, team: dinos('a') }, T0).reason, 'no-driver');
  assert.equal(fitProblem(s, 'rover', [PLAYER_ID, 'rex']), 'no-room');
  assert.equal(applyAction(s, 'drive', { vehicle: v.id, to: near, team: [me, ...dinos('a', 'b', 'c')] }, T0).reason, 'no-room');
  const route = drivePath(42, '0,0', near);
  const r = applyAction(s, 'drive', { vehicle: v.id, to: near, team: [me, ...dinos('a', 'b')] }, T0);
  assert.equal(r.ok, true, r.reason);
  const p = partyOf(s, r.expedition.id);
  assert.equal(p.leg.drive, v.id);
  assert.equal(p.leg.arriveAt, T0 + Math.round(driveMins(route.hours) * 60000));
  assert.equal(v.at, near);
  assert.equal(v.charge, VEHICLES.rover.range - route.charge);
  // (it can't be called back, nor driven twice at once)
  assert.equal(applyAction(s, 'recall', { id: p.id }, T0 + 1000).reason, 'driving');
  // (a saved game keeps the drive)
  assert.equal(cleanParties(s, s.world)[0].leg.drive, v.id);
  // there: parked, nothing happened on the way; the team waits at the hex
  const step = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.deepEqual(step.story.map(e => e.kind), ['drive']);
  assert.equal(p.at, near);
  assert.equal(p.leg, null);
  assert.ok(s.world.revealed.includes(near));
  // (a flat battery goes nowhere)
  const charge = v.charge;
  v.charge = 0;
  assert.equal(applyAction(s, 'drive', { vehicle: v.id, to: '0,0', id: p.id }, p.returnAt + 1000).reason, 'battery');
  v.charge = charge;
  // and home again with the party, the battery full at the nest's station
  const back = applyAction(s, 'drive', { vehicle: v.id, to: '0,0', id: p.id }, p.returnAt + 1000);
  assert.equal(back.ok, true, back.reason);
  applyAction(s, 'journey', { id: p.id }, back.expedition.leg.arriveAt);
  assert.equal(s.world.expeditions.length, 0);
  assert.equal(v.at, '0,0');
});

test("no vehicle crosses swamps, mountains or water, nor drives farther than its battery", () => {
  const s = game();
  const v = applyAction(s, 'vehicle', { kind: 'hauler' }, T0).vehicle;
  const way = drivePath(42, '0,0', near);
  for (const k of way.path) {
    const c = cellAt(42, parseKey(k));
    assert.ok(!DRIVE.never.terrain.includes(c.terrain) && !DRIVE.never.biome.includes(c.biome), k);
  }
  v.at = near; v.charge = 0;
  const far = way.path[0] === near ? '0,0' : way.path[0];
  assert.equal(applyAction(s, 'drive', { vehicle: v.id, to: far, team: [me] }, T0).reason, 'not-there');
});
