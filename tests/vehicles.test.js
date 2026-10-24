// Land vehicles: bought or rented at a station, driven by the player from hex to hex with whoever fits
// aboard, a battery for so many hexes (docs/VEHICLES.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { newWorld, hexKey, parseKey } from '../js/world.js';
import { partyOf, cleanParties } from '../js/journey.js';
import { drivePath, driveMins, vehiclesOf, fitProblem } from '../js/vehicles.js';
import { cellAt } from '../js/map.js';
import { CAPSULES, VEHICLES, DRIVE, PLAYER_ID, worldMins } from '../js/config.js';

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

test('rent or buy at a station; a rental runs out; only where the player stands', () => {
  const s = game();
  assert.equal(applyAction(s, 'vehicle', { kind: 'tank' }, T0).reason, 'no-vehicle');
  const coins = s.coins;
  const r = applyAction(s, 'vehicle', { kind: 'rover', days: 3 }, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.coins, coins - VEHICLES.rover.rent * 3);
  assert.equal(r.vehicle.at, '0,0');
  const b = applyAction(s, 'vehicle', { kind: 'hauler' }, T0);
  assert.equal(b.ok && b.vehicle.owned, true);
  assert.equal(applyAction(s, 'vehicle', { kind: 'rover', days: 2 }, T0).reason, 'days');
  // (three days of the world later the rental has gone back; the one bought stays)
  const later = T0 + worldMins(3 * 24) * 60000 + 1;
  assert.deepEqual(vehiclesOf(s, later).map(v => v.kind), ['hauler']);
});

test('a drive: quicker than walking, safe, parked where it went; the battery, the room aboard, the player at the wheel', () => {
  assert.ok(near, 'a hex to drive to');
  const s = game(dino('a', 30), dino('b', 30), dino('c', 30), dino('rex', 30, 'rex'));
  const v = applyAction(s, 'vehicle', { kind: 'rover', days: 7 }, T0).vehicle;
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
