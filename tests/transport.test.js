// The maglev on a timetable, suborbital rockets, and dinosaurs sent ahead without the player
// (docs/TRANSPORT.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { newWorld, citiesOf } from '../js/world.js';
import { partyOf, trainTrip, rocketTrip, nextDeparture, trainsAt, timetableOf, trainMins, cleanParties, restLeft, rideAt, progressOf, trainsFrom, rideTrip } from '../js/journey.js';
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

test('departures every so many minutes, the same for everyone; rings through every city, trains keep their way, never two the same way standing at a station', () => {
  assert.equal(nextDeparture(T0, 5) % (5 * 60000), 0);
  assert.ok(nextDeparture(T0, 5) >= T0 && nextDeparture(T0, 5) - T0 < 5 * 60000);
  assert.equal(nextDeparture(nextDeparture(T0, 5), 5), nextDeparture(T0, 5));
  assert.equal((nextDeparture(T0, 20, 3) - 3 * 60000) % (20 * 60000), 0);
  const s = game();
  const trains = trainsAt(s, T0), tt = timetableOf(42);
  for (const t of trains) assert.ok(t.i >= 0 && t.i < t.path.length - 1 && t.f >= 0 && t.f <= 1 && ['cw', 'ccw'].includes(t.way));
  // as many each way
  assert.equal(trains.filter(t => t.way === 'cw').length, trains.filter(t => t.way === 'ccw').length);
  // the lines make rings through every station: every station on one, every line on one, none ends at a station
  const { lines, stations, rings } = railsOf(42);
  assert.deepEqual([...new Set(rings.flat())].sort(), [...stations].sort());
  for (const l of lines) assert.ok(rings.some(r => r.some((k, i) => [l.a, l.b].includes(k) && [l.a, l.b].includes(r[(i + 1) % r.length]))));
  for (const k of stations) assert.ok(lines.filter(l => l.a === k || l.b === k).length >= 2, `a line ends at ${k}`);
  // the nest and Highfen, near each other, have a line straight between them
  assert.ok(lines.some(l => [l.a, l.b].includes('0,0') && [l.a, l.b].includes('-11,30')));
  // all through a round: each train keeps its way, and at no station do two leaving onto the same line stand at once
  let before = trains;
  const round = Math.max(...tt.map(r => r.round));
  for (let sec = 1; sec < round * 60; sec += 1) {
    const now = trainsAt(s, T0 + sec * 1000);
    const standing = now.filter(t => t.standing).map(t => t.at + '>' + t.to);
    assert.equal(new Set(standing).size, standing.length, `two trains standing at once, ${sec} s in`);
    for (const t of now) {
      const was = before.find(b => b.id === t.id);
      assert.ok(t.along >= was.along || was.along - t.along > MAGLEV.every, `${t.id} went back`);
    }
    before = now;
  }
  // trains come into every station at even times: a train every half beat (5 min), a quarter beat where rings meet
  const came = new Map(), was = new Map();
  for (let sec = 0; sec < 2 * round * 60; sec += 1) for (const t of trainsAt(s, T0 + sec * 1000)) {
    if (t.standing && !was.get(t.id)) { if (!came.has(t.at)) came.set(t.at, []); came.get(t.at).push(sec); }
    was.set(t.id, t.standing);
  }
  for (const [k, secs] of came) {
    const gaps = new Set(secs.slice(1).map((x, i) => x - secs[i])), meets = rings.filter(r => r.includes(k)).length;
    // (about that: each train early or late by up to MAGLEV.late)
    const want = MAGLEV.every * 60 / 2 / meets;
    for (const g of gaps) assert.ok(Math.abs(g - want) <= 2 * MAGLEV.late * 60 + 2, `uneven at ${k}: ${g} s`);
    assert.ok(gaps.size > 1, `too regular at ${k}`);
  }
  // (the same at the same time; on later)
  assert.deepEqual(trainsAt(s, T0), trains);
  assert.notDeepEqual(trainsAt(s, T0 + 60000), trains);
  // a ride leaves within a cycle and takes at least a run
  const [a] = cities(), trip = trainTrip(s, ['x'], '0,0', a, T0);
  assert.ok(trip.departAt >= T0 && trip.departAt - T0 < MAGLEV.every * 60000);
  assert.ok(trip.mins >= trainMins(trip.route.hexes));
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
  assert.equal(p.leg.startedAt, trainTrip(s, ['ad', 'baby'], '0,0', city, T0).departAt);
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

test('everyone rides the same train: its doors close 10 s before it leaves; a party rides inside its train', () => {
  const s = game(dino('ad', 30), dino('b2', 30));
  const city = cities()[0], first = trainTrip(s, ['ad'], '0,0', city, T0);
  // (booked up to the doors closing, the same train for all; a moment later, only the next)
  const late = first.departAt - MAGLEV.board * 1000;
  assert.equal(trainTrip(s, ['b2'], '0,0', city, late - 1000).departAt, first.departAt);
  assert.equal(trainTrip(s, ['b2'], '0,0', city, late).departAt, first.departAt);
  assert.ok(trainTrip(s, ['b2'], '0,0', city, late + 1000).departAt > first.departAt);
  // (the train chosen, refused once its doors have closed)
  assert.equal(applyAction(s, 'explore', { team: dinos('b2'), hex: city, train: true, departAt: first.departAt }, late + 1000).reason, 'train-gone');
  const r = applyAction(s, 'explore', { team: dinos('ad'), hex: city, train: true, departAt: first.departAt }, T0);
  assert.equal(r.ok, true, r.reason);
  const p = partyOf(s, r.expedition.id);
  // on the platform until it leaves; then aboard: where its train is, all the way
  assert.deepEqual(rideAt(s, p.leg, first.departAt - 1000).at, '0,0');
  for (let t = first.departAt + 1000; t < p.leg.arriveAt; t += 7000) {
    const ride = rideAt(s, p.leg, t);
    if (ride.at) continue;
    const train = trainsAt(s, t).find(x => x.id === ride.train);
    assert.ok(train, 'its train runs');
    // (the same hex as its train, the train's line being part of the ride's way)
    const g = progressOf(s, p, t), here = g.i < 0 ? p.leg.from : p.leg.path[g.i];
    assert.ok(Math.abs(g.f - train.f) < 1e-6 || here === train.path[train.i] || here === train.path[train.i + 1] || train.standing, `apart at ${t}`);
    assert.equal(train.path[train.i + (train.f > 0.5 ? 1 : 0)], g.f > 0.5 ? p.leg.path[g.i + 1] : here);
  }
});

test('boarding one chosen train to a station on its way; getting off until its doors close', () => {
  const s = game(dino('ad', 30), dino('b2', 30));
  const trains = trainsFrom(s, '0,0', T0);
  assert.ok(trains.length >= 2 && trains.every(t => t.departAt >= T0 + MAGLEV.board * 1000 && t.stops.length >= 2));
  const tr = trains[0], to = tr.stops[1].at, coins = s.coins;
  // (its stops in order, each later than the one before)
  for (let i = 1; i < tr.stops.length; i++) assert.ok(tr.stops[i].arriveAt > tr.stops[i - 1].arriveAt);
  const ride = { ri: tr.ri, way: tr.way, j: tr.j };
  const trip = rideTrip(s, ['ad'], '0,0', ride, to, T0);
  assert.equal(trip.arriveAt, tr.stops[1].arriveAt);
  const r = applyAction(s, 'explore', { team: dinos('ad'), hex: to, train: true, ride }, T0);
  assert.equal(r.ok, true, r.reason);
  const p = partyOf(s, r.expedition.id);
  assert.deepEqual(p.leg.ride, ride);
  assert.equal(p.leg.arriveAt, tr.stops[1].arriveAt);
  // (aboard the very train chosen, stop after stop)
  const mid = Math.round((tr.departAt + tr.stops[0].arriveAt) / 2), here = rideAt(s, p.leg, mid);
  assert.ok(here.train && here.train.endsWith(String(((tr.j % timetableOf(42)[tr.ri].trains) + timetableOf(42)[tr.ri].trains) % timetableOf(42)[tr.ri].trains)));
  // (a saved game keeps the train)
  assert.deepEqual(cleanParties(s, s.world)[0].leg.ride, ride);
  // getting off: until the doors close, the fare back and everyone home
  assert.equal(applyAction(s, 'alight', { id: p.id }, tr.departAt - MAGLEV.board * 1000 + 1).reason, 'doors-closed');
  assert.equal(applyAction(s, 'alight', { id: p.id }, tr.departAt - MAGLEV.board * 1000 - 1).ok, true);
  assert.equal(s.coins, coins);
  assert.equal(s.world.expeditions.length, 0);
  // (a train whose doors have closed can't be boarded)
  assert.equal(applyAction(s, 'explore', { team: dinos('b2'), hex: to, train: true, ride }, tr.departAt - 5000).reason, 'train-gone');
});
