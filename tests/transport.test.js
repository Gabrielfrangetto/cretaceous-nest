// The maglev on a timetable, suborbital rockets, and dinosaurs sent ahead without the player
// (docs/TRANSPORT.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { newWorld, citiesOf } from '../js/world.js';
import { partyOf, trainTrip, rocketTrip, nextDeparture, trainsAt, cleanParties, restLeft } from '../js/journey.js';
import { railsOf } from '../js/map.js';
import { CAPSULES, MAGLEV, ROCKET, PLAYER_ID } from '../js/config.js';

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
const dinos = (...ids) => ids.map(id => ({ kind: 'dino', id }));
const cities = () => citiesOf(42).map(c => c.key);

test('departures every so many minutes, the same for everyone; trains run their lines both ways', () => {
  assert.equal(nextDeparture(T0, 5) % (5 * 60000), 0);
  assert.ok(nextDeparture(T0, 5) >= T0 && nextDeparture(T0, 5) - T0 < 5 * 60000);
  assert.equal(nextDeparture(nextDeparture(T0, 5), 5), nextDeparture(T0, 5));
  const s = game();
  const lines = railsOf(42).lines, trains = trainsAt(s, T0);
  // every line has its trains, one every MAGLEV.every minutes each way
  for (const [li, l] of lines.entries()) {
    const n = trains.filter(t => t.line === li).length, period = 2 * (MAGLEV.minsPerHex * (l.path.length - 1) + MAGLEV.stand);
    assert.equal(n, Math.ceil(period / MAGLEV.every));
  }
  for (const t of trains) assert.ok(t.i >= 0 && t.i < t.path.length - 1 && t.f >= 0 && t.f <= 1);
  // (the same at the same time; on later)
  assert.deepEqual(trainsAt(s, T0), trains);
  assert.notDeepEqual(trainsAt(s, T0 + 60000), trains);
});

test('dinosaurs sent ahead alone by maglev, a baby too; they wait in the city and take no expedition slot', () => {
  const s = game(dino('ad', 30), dino('baby', 0));
  const city = cities()[0];
  // never to explore without the player
  assert.equal(applyAction(s, 'explore', { team: dinos('ad'), hex: city }, T0).reason, 'no-player');
  // by maglev, alone, with the baby
  const r = applyAction(s, 'explore', { team: dinos('ad', 'baby'), hex: city, train: true }, T0);
  assert.equal(r.ok, true, r.reason);
  const p = partyOf(s, r.expedition.id);
  assert.ok(!p.members.includes(PLAYER_ID));
  // (it waits for the next train)
  assert.equal(p.leg.startedAt, nextDeparture(T0, MAGLEV.every));
  applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.equal(p.at, city);
  // in the city's stables: no walking on without the player, but on by maglev or home
  assert.equal(applyAction(s, 'order', { id: p.id, hex: '0,0' }, T0 + 1e7).reason, 'no-player');
  // the player still has both expedition slots
  const me = applyAction(s, 'explore', { team: [{ kind: 'player', id: PLAYER_ID }], hex: city, train: true }, T0 + 1e7);
  assert.equal(me.ok, true, me.reason);
  const q = partyOf(s, me.expedition.id);
  applyAction(s, 'journey', { id: q.id }, q.leg.arriveAt);
  // the player meets them there: the two parties join
  assert.equal(applyAction(s, 'join', { id: p.id, into: q.id }, q.leg ? q.leg.arriveAt : T0 + 2e7).ok, true);
  assert.equal(s.world.expeditions.length, 1);
  assert.deepEqual([...q.members].sort(), ['ad', 'baby', PLAYER_ID].sort());
  // with a baby along, no walking out into the wild
  assert.equal(applyAction(s, 'order', { id: q.id, hex: '0,0' }, T0 + 2e7).reason, 'too-young');
});

test('rockets: straight from station to station, quick, dear by weight; no babies, giants or long necks; a rest on landing', () => {
  const s = game(dino('ad', 30), dino('baby', 0), dino('giant', 30, 'argent'), dino('rex', 30, 'rex'));
  const [a, b] = cities();
  assert.equal(rocketTrip(s, ['baby'], '0,0', a).reason, 'baby-fly');
  assert.equal(rocketTrip(s, ['giant'], '0,0', a).reason, 'cant-fly');
  assert.equal(applyAction(s, 'explore', { team: dinos('baby'), hex: a, rocket: true }, T0).reason, 'baby-fly');
  const light = rocketTrip(s, ['ad'], '0,0', a, T0), heavy = rocketTrip(s, ['rex'], '0,0', a, T0);
  assert.ok(heavy.fare > light.fare);
  assert.ok(light.mins >= ROCKET.mins[0] && light.mins <= ROCKET.mins[1]);
  assert.equal(light.departAt, nextDeparture(T0, ROCKET.every));
  // quicker than the maglev
  assert.ok(light.mins < trainTrip(s, ['ad'], '0,0', a).mins);
  const r = applyAction(s, 'explore', { team: dinos('ad'), hex: a, rocket: true }, T0);
  assert.equal(r.ok, true, r.reason);
  const p = partyOf(s, r.expedition.id);
  assert.deepEqual(p.leg.path, [a]);
  assert.equal(applyAction(s, 'recall', { id: p.id }, T0 + 1000).reason, 'on-the-train');
  // (a saved game keeps the flight)
  assert.ok(cleanParties(s, s.world)[0].leg.rocket);
  const step = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.deepEqual(step.story.map(e => e.kind), ['rocket']);
  assert.equal(p.at, a);
  const ad = s.hatched.find(x => x.id === 'ad');
  assert.equal(restLeft(ad, p.returnAt), ROCKET.rest * 60000);
  // on to another city by rocket, then home
  assert.equal(applyAction(s, 'order', { id: p.id, hex: b, rocket: true }, p.returnAt).ok, true);
  applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.equal(p.at, b);
  assert.equal(applyAction(s, 'order', { id: p.id, hex: '0,0', rocket: true }, p.returnAt).ok, true);
  const home = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.ok(home.story.some(e => e.kind === 'home'));
  assert.equal(s.world.expeditions.length, 0);
});
