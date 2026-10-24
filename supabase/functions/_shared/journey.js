// Journeys: a party out in the world. It sets out from the nest to a hex (a leg), waits there for
// orders, goes on to another hex or comes home (each one more leg, with the same dangers on the way).
// What happens on a leg is told when the player collects it, hex by hex, stopping at each event for
// the player's decision. Like economy.js these only work on the state passed in, so the browser and
// the server share them, and every roll is seeded so both roll the same.
//
// A party, in s.world.expeditions:
// { id, team, members, at: the hex it is at (or set out from), leg, health: { id: share of its health
//   left }, down: [ids too hurt to fight, carried by the rest], hurt: [ids that come home injured
//   whatever their health], dead: [{ id, name, type }], carry: { items: { id: n }, coins, eggs: [] },
//   pending: the event waiting for the player's decision, or null,
//   hex, trip, startedAt, returnAt: the leg's destination, number, start and arrival, for the screens }
// leg: { n, from, to, path: [the hexes walked, from excluded], step: the next one to tell, startedAt,
//   arriveAt, recalled: called back mid-way (it ends where it was and turns for home) } | null: waiting
import {
  TRAVEL, RUNNER, INTERCEPT, WITNESS, NEST_CALM, PLAYER_ID, SPECIES, ITEMS, DEATH, CRITICAL_MINS, INJURY_MINS, BRUISE_MINS, TOUGH,
  LOOT_PER_HEX, FRENZY_DROPS, GEAR_DROP, EGG_STEP, EGG_CHANCE, EGG_GENES, EGG_TRAY_SIZE, STATS, SCOUT,
  EXPEDITION_SLOTS, TEAM_SLOTS, HAZARDS, HAZARD_MAX, HAZARD_WOUND, HAZARD_FLOOR, SIZE_ORDER, PLAYER_SIZE, SURVIVAL, PLAYER_DIET, TRAIN, MAGLEV, ROCKET, LONG_NECK, CAMP, VIA_MAX, BIOMES, FORAGE, NEST, AGES, VISIBILITY, FOOD, UNIT_HOURS, CRECHE, RESCUE, AIRLIFT, TRIP_CARE, SCARS, WOUNDS, GORE,
} from './config.js';
import { addItem, removeItem, countItem, earn, bill, hungerEvery, isHungry as isHungryNow, seededRand, eggSex, dailyKg, massOf, statSheet, stageOf } from './economy.js';
import { teamFight, unitOf, wildFighter, fears } from './combat.js';
import { travelPath, routeCost, stepCost, cellAt, trainRoute, isStation, wayAround, railsOf } from './map.js';
import { skyAt, placeOf } from './sun.js';
import {
  hexKey, parseKey, hexDist, nearOf, cityAt, inWorld, neighbors, biomeAt, watery, isWater, threatAt, explorerOf, teamFrom, exploreProblem, teamUnits,
  teamSlow, allRunners, hasScout, teamHaul, bodyOf, encounterChance, keepsAway, passesBy, sailBackOff, huntOdds, scatterOf, runOf,
  runnersSpot, eyesChance, standsGround, standoffOf, chaseOf, witnessAt, interveneOptions, lootTable, eggKinds, pickWeighted, bury,
  teamVisibility, catchChance, caughtDeath, landed as hasLanded, injuredLeft, isFreight,
} from './world.js';

export const HOME = '0,0';
const W = s => s.world;
const isAttacker = foe => (foe.members[0].role || 'attacker') === 'attacker';

// ---------- the party ----------
export const partyOf = (s, id) => W(s).expeditions.find(p => p.id === id) || null;
export const healthOf = (p, id) => (p.health && p.health[id] != null ? p.health[id] : 1);
export const isDown = (p, id) => (p.down || []).includes(id);
// the units still on their feet (those down are carried, and don't fight)
export const standingUnits = (s, p) => p.team
  .map(u => ({ ...u, members: u.members.filter(id => explorerOf(s, id) && !isDown(p, id)) }))
  .filter(u => u.members.length);
const anyStanding = (s, p) => standingUnits(s, p).length > 0;
// minutes for a leg from one hex to another, the easiest way: half a trip there and back (TRAVEL),
// at the pace of the slowest (BODY slow), twice as fast for a team of runners (RUNNER)
// (via: the waypoints of a route the player traced, walked in order)
export const legMins = (s, members, from, to, via = []) =>
  Math.max(1, Math.round(viaCost(W(s).seed, from, to, via) * TRAVEL.mins / 2 * teamSlow(s, members) * (allRunners(s, members) ? RUNNER.trip : 1)));
// the stops of a route: from, the waypoints, to
const stopsOf = (from, to, via) => [from, ...via.filter(k => k !== from && k !== to), to];
const viaCost = (seed, from, to, via) => (via.length ? pathCosts(seed, from, routePath(seed, from, to, via)).reduce((t, c) => t + c, 0) : routeCost(seed, parseKey(from), parseKey(to)));
// The hexes walked on a route, from excluded, to last: the easiest way from each stop to the next. A
// journey never sets foot twice on the same hex: a way that would is worked out again around the hexes
// already walked (a stop that can't be reached so is left out), and the destination, never crossed on
// the way, is always the last hex reached.
export function routePath(seed, from, to, via = []) {
  const st = stopsOf(from, to, via), path = [], used = new Set([from]);
  let at = from;
  for (let i = 1; i < st.length; i++) {
    const stop = st[i], last = i === st.length - 1;
    if (!last && used.has(stop)) continue;
    let seg = travelPath(seed, parseKey(stop), parseKey(at)).map(h => hexKey(...h));
    if (seg.some(k => used.has(k) || (!last && k === to))) {
      const blocked = new Set(used);
      if (!last) blocked.add(to);
      seg = wayAround(seed, parseKey(stop), parseKey(at), blocked).map(h => hexKey(...h));
    }
    if (!seg.length) { if (last) return []; continue; }
    for (const k of seg) used.add(k);
    path.push(...seg);
    at = stop;
  }
  return path;
}
// the cost of each hex walked (a river crossed when stepped into, not along its bank)
const pathCosts = (seed, from, path) => path.map((k, i) => stepCost(cellAt(seed, parseKey(k)), cellAt(seed, parseKey(i ? path[i - 1] : from))));
// waypoints kept to land a team can walk to, at most VIA_MAX
export const cleanVia = (s, via) => (Array.isArray(via) ? via : []).map(String).filter(k => { const h = parseKey(k); return h && inWorld(h) && !isWater(W(s).seed, h) && routeCost(W(s).seed, [0, 0], h) < Infinity; }).slice(0, VIA_MAX);

function startLeg(s, p, to, at, via = []) {
  const w = W(s);
  w.trips += 1;
  const path = routePath(w.seed, p.at, to, via);
  // (the land's dangers on the way may cost it time: a storm sat out, a river waited on)
  const lost = hazardsOf(w.seed, w.trips, path).reduce((t, z) => t + z.mins, 0);
  p.leg = { n: w.trips, from: p.at, to, path, step: 0, startedAt: at, arriveAt: at + (legMins(s, p.members, p.at, to, via) + lost) * 60000, ...(via.length ? { via } : {}) };
  Object.assign(p, { hex: to, trip: w.trips, startedAt: at, returnAt: p.leg.arriveAt });
}

// ---------- the maglev and the rockets ----------
// Both run on timetables worked out from the clock (docs/TRANSPORT.md): a party waits at its station
// for the next departure, then rides; it may be dinosaurs alone, sent ahead without the player.
const seatsOf = (s, members) => members.reduce((t, id) => t + (TRAIN.seats[id === PLAYER_ID ? PLAYER_SIZE : bodyOf(s, id).size] || 1), 0);
export const trainFare = (s, members, hexes) => Math.round(TRAIN.fare.base + TRAIN.fare.perHex * hexes * seatsOf(s, members));
// the time a ride takes once aboard: its hexes at speed, and the stations stood at on the way
export const trainMins = (hexes, stops = 2) => Math.max(1, Math.round(MAGLEV.minsPerHex * hexes + MAGLEV.stand * Math.max(0, stops - 2)));
// the next departure from a station at or after a time, every so many minutes
export const nextDeparture = (at, every) => Math.ceil(at / (every * 60000)) * every * 60000;
// a ride from one station to another, or why not: { route, fare, mins, departAt } | { reason }
export function trainTrip(s, members, from, to, now = 0) {
  const route = trainRoute(W(s).seed, from, to);
  if (!route) return { reason: isStation(W(s).seed, to) ? 'no-line' : 'no-station' };
  return { route, fare: trainFare(s, members, route.hexes), mins: trainMins(route.hexes, route.stops.length), departAt: nextDeparture(now, MAGLEV.every) };
}
// why one of a party can't fly, or null: babies, colossal and long-necked dinosaurs stay on the ground
export function flyProblem(s, id) {
  if (id === PLAYER_ID) return null;
  const b = explorerOf(s, id);
  if (!b) return 'missing';
  if (stageOf(b).id === 'baby') return 'baby-fly';
  if (bodyOf(s, id).size === 'colossal' || LONG_NECK.includes(b.type)) return 'cant-fly';
  return null;
}
const partyKg = (s, members) => members.reduce((t, id) => t + massOf(explorerOf(s, id) || { id: PLAYER_ID }), 0);
// a flight from one station to another, or why not: { fare, mins, departAt, kg } | { reason }
export function rocketTrip(s, members, from, to, now = 0) {
  const seed = W(s).seed;
  if (!isStation(seed, from) || !isStation(seed, to)) return { reason: 'no-station' };
  if (from === to) return { reason: 'there' };
  for (const id of members) { const why = flyProblem(s, id); if (why) return { reason: why, id }; }
  const kg = partyKg(s, members);
  if (kg > ROCKET.load) return { reason: 'too-heavy', kg };
  const d = hexDist([parseKey(to)[0] - parseKey(from)[0], parseKey(to)[1] - parseKey(from)[1]]);
  const mins = Math.round(ROCKET.mins[0] + (ROCKET.mins[1] - ROCKET.mins[0]) * Math.min(1, d / ROCKET.far));
  return { fare: Math.round(ROCKET.base + ROCKET.perTonne * kg / 1000), mins, departAt: nextDeparture(now, ROCKET.every), kg };
}
// the party boards at its station (the fare paid): the maglev (by its lines) or a rocket (straight there)
function startRide(s, p, to, at, rocket = false) {
  const w = W(s), trip = rocket ? rocketTrip(s, p.members, p.at, to, at) : trainTrip(s, p.members, p.at, to, at);
  if (trip.reason) return { ok: false, reason: trip.reason };
  if (s.coins < trip.fare) return { ok: false, reason: 'coins' };
  s.coins -= trip.fare;
  w.trips += 1;
  // (it waits at the station until it leaves: startedAt is the departure)
  p.leg = { n: w.trips, from: p.at, to, path: rocket ? [to] : trip.route.path, step: 0, boardedAt: at, startedAt: trip.departAt, arriveAt: trip.departAt + trip.mins * 60000, ...(rocket ? { rocket: true } : { train: true }) };
  Object.assign(p, { hex: to, trip: w.trips, startedAt: at, returnAt: p.leg.arriveAt });
  return { ok: true, expedition: p, fare: trip.fare, departAt: trip.departAt };
}
// how long one of the team still rests after a flight
export const restLeft = (b, now) => Math.max(0, (b && b.restUntil || 0) - now);

// Where every maglev train is now (for the map): each line's trains, `every` minutes apart, run to its
// far end, stand, and come back. [{ line, path, i, f }]: the hex index along the line's path it last
// passed and how far on to the next
export function trainsAt(s, now) {
  const out = [], mins = now / 60000;
  for (const [li, l] of railsOf(W(s).seed).lines.entries()) {
    const n = l.path.length - 1, run = MAGLEV.minsPerHex * n, period = 2 * (run + MAGLEV.stand);
    for (let k = 0; k * MAGLEV.every < period; k++) {
      let t = ((mins - k * MAGLEV.every) % period + period) % period;
      // (out, stood at the far end, back, stood at the near end)
      let x;
      if (t < run) x = t / run;
      else if (t < run + MAGLEV.stand) x = 1;
      else if (t < 2 * run + MAGLEV.stand) x = 1 - (t - run - MAGLEV.stand) / run;
      else x = 0;
      const at = x * n, i = Math.min(n - 1, Math.floor(at));
      out.push({ line: li, path: l.path, i, f: at - i });
    }
  }
  return out;
}

// a new party sets out from the nest to a hex (on foot), or to a city's station by maglev or rocket
// (then it may be dinosaurs alone, sent ahead without the player)
export function startExpedition(s, team, key, now, train = false, via = [], rocket = false) {
  via = train || rocket ? [] : cleanVia(s, via);
  const problem = exploreProblem(s, team, key, now, train ? 'maglev' : rocket ? 'rocket' : null);
  if (problem) return { ok: false, reason: problem };
  const w = W(s);
  const units = teamFrom(s, team), members = units.flatMap(u => u.members);
  if (train || rocket) {
    const trip = rocket ? rocketTrip(s, members, HOME, key, now) : trainTrip(s, members, HOME, key, now);
    if (trip.reason) return { ok: false, reason: trip.reason };
    if (s.coins < trip.fare) return { ok: false, reason: 'coins' };
  }
  const p = { id: `t${w.trips + 1}`, team: units, members, at: HOME, leg: null, health: {}, hunger: {}, thirst: {}, down: [], hurt: [], dead: [], carry: { items: {}, coins: 0, eggs: [] }, supplies: packOf(s, members), pending: null };
  for (const [id, n] of Object.entries(p.supplies)) if (ITEMS[id] && n) removeItem(s, id, n);
  if (train || rocket) startRide(s, p, key, now, rocket);
  else startLeg(s, p, key, now, via);
  w.expeditions.push(p);
  return { ok: true, expedition: p };
}

// What a team packs from the inventory when it sets out (SURVIVAL.pack): water flasks, filled at the
// nest's trough, and the player's rations (only with the player along). { water_skin, ration, water:
// the drinks in the flasks }
export function packOf(s, members) {
  const n = id => Math.min(SURVIVAL.pack[id], countItem(s, id));
  const skins = n('water_skin');
  return { water_skin: skins, ration: members.includes(PLAYER_ID) ? n('ration') : 0, water: skins * SURVIVAL.skin, herb: n('herb'), transfusion: n('transfusion') };
}

// where a party on a leg is by now: the index of the last hex of its path it reached (-1: still leaving)
export function positionOf(s, p, now) {
  const leg = p.leg;
  if (!leg) return null;
  const seed = W(s).seed, costs = pathCosts(seed, leg.from, leg.path);
  const total = costs.reduce((t, c) => t + c, 0) || 1;
  const done = Math.min(1, Math.max(0, (now - leg.startedAt) / Math.max(1, leg.arriveAt - leg.startedAt))) * total;
  let i = -1, sum = 0;
  while (i + 1 < costs.length && sum + costs[i + 1] <= done) sum += costs[++i];
  return i;
}
// where a party on its way is right now, between hexes: { i: the last hex reached (as positionOf),
// f: how far it is toward the next one, 0 to 1 }
export function progressOf(s, p, now) {
  const leg = p.leg;
  if (!leg) return null;
  // (stopped for the player: where it stopped)
  const stop = leg.pausedAt != null ? { at: leg.pausedAt } : stopOf(s, p);
  if (stop && now > stop.at) now = stop.at;
  const seed = W(s).seed, costs = pathCosts(seed, leg.from, leg.path);
  const total = costs.reduce((t, c) => t + c, 0) || 1;
  const done = Math.min(1, Math.max(0, (now - leg.startedAt) / Math.max(1, leg.arriveAt - leg.startedAt))) * total;
  let i = -1, sum = 0;
  while (i + 1 < costs.length && sum + costs[i + 1] <= done) sum += costs[++i];
  const next = costs[i + 1];
  return { i, f: next ? Math.min(1, (done - sum) / next) : 0 };
}
// when a leg reached the hex at index i of its path
function timeAt(s, leg, i) {
  const seed = W(s).seed, costs = pathCosts(seed, leg.from, leg.path);
  const total = costs.reduce((t, c) => t + c, 0) || 1;
  const sum = costs.slice(0, i + 1).reduce((t, c) => t + c, 0);
  return Math.round(leg.startedAt + (leg.arriveAt - leg.startedAt) * sum / total);
}

// a party waiting at a hex is sent on: to another hex, or home (HOME); from a station, by train to
// another (train)
export function orderParty(s, id, to, now, train = false, via = [], rocket = false) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (p.leg) return { ok: false, reason: 'on-the-way' };
  if (p.camp) return { ok: false, reason: 'camping' };
  if (train || rocket) return to === p.at ? { ok: false, reason: 'there' } : startRide(s, p, to, now, rocket);
  // (on foot only with the player, and never with a baby)
  if (isFreight(p)) return { ok: false, reason: 'no-player' };
  if (p.members.some(m => m !== PLAYER_ID && stageOf(explorerOf(s, m) || {}).id === 'baby')) return { ok: false, reason: 'too-young' };
  for (const m of p.members) if (restLeft(explorerOf(s, m), now)) return { ok: false, reason: 'resting' };
  const h = parseKey(to);
  if (!h || !inWorld(h)) return { ok: false, reason: 'out-of-map' };
  if (to === p.at) return { ok: false, reason: 'there' };
  if (isWater(W(s).seed, h)) return { ok: false, reason: 'water' };
  if (routeCost(W(s).seed, parseKey(p.at), h) === Infinity) return { ok: false, reason: 'unreachable' };
  // with nobody on their feet, the only way is home
  if (to !== HOME && !anyStanding(s, p)) return { ok: false, reason: 'nobody-standing' };
  startLeg(s, p, to, now, cleanVia(s, via));
  return { ok: true, expedition: p };
}

// Two parties waiting at the same station join into one (dinosaurs sent ahead and the team that came
// for them), up to TEAM_SLOTS places
export function joinParty(s, id, into, now) {
  const p = partyOf(s, id), q = partyOf(s, into);
  if (!p || !q || p === q) return { ok: false, reason: 'no-expedition' };
  if (p.leg || q.leg || p.camp || q.camp) return { ok: false, reason: 'on-the-way' };
  if (p.at !== q.at) return { ok: false, reason: 'not-together' };
  if (p.team.length + q.team.length > TEAM_SLOTS) return { ok: false, reason: 'team-full' };
  q.team.push(...p.team);
  q.members.push(...p.members);
  for (const k of ['health', 'hunger', 'thirst']) q[k] = { ...(p[k] || {}), ...(q[k] || {}) };
  for (const k of ['down', 'hurt', 'dead']) q[k] = [...(q[k] || []), ...(p[k] || [])];
  for (const [k, n] of Object.entries(p.supplies || {})) q.supplies[k] = (q.supplies[k] || 0) + n;
  for (const [k, n] of Object.entries(p.carry.items || {})) q.carry.items[k] = (q.carry.items[k] || 0) + n;
  q.carry.coins += p.carry.coins || 0;
  q.carry.eggs.push(...(p.carry.eggs || []));
  W(s).expeditions = W(s).expeditions.filter(x => x !== p);
  return { ok: true, expedition: q };
}

// ---------- making camp ----------
// A team waiting out in the wild makes camp (CAMP) to look for water and food and to rest
export function makeCamp(s, id, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (p.leg) return { ok: false, reason: 'on-the-way' };
  if (p.camp) return { ok: false, reason: 'camping' };
  if (p.at === HOME || cityAt(W(s).seed, parseKey(p.at))) return { ok: false, reason: 'settled' };
  p.camp = { startedAt: now, endsAt: now + CAMP.mins * 60000 };
  return { ok: true, expedition: p };
}
// Breaking camp: what the camp found once it has had its time (CAMP), nothing if broken early.
// { ok, story: [{ kind: 'camp', water, fed: [ids], meat, early }], expedition }
export function breakCamp(s, id, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (!p.camp) return { ok: false, reason: 'no-camp' };
  const w = W(s), h = parseKey(p.at), cell = cellAt(w.seed, h), biome = cell.biome;
  const early = now < p.camp.endsAt;
  const rand = seededRand(`camp:${w.seed}:${p.id}:${p.camp.startedAt}`);
  p.camp = null;
  const told = { kind: 'camp', hex: p.at, idx: 0, biome, early, water: false, fed: [], meat: 0 };
  if (!early) {
    const fresh = freshWater(w.seed, h) || neighbors(h).some(n => freshWater(w.seed, n));
    told.water = fresh;
    const up = p.members.filter(id => !isDown(p, id));
    // (a forager along: the whole team finds food and water more easily)
    const boost = foragersOf(s, up).length ? FORAGE.camp : { food: 1, water: 1 };
    if (!fresh) told.water = rand() < (CAMP.water[biome] || 0) * boost.water;
    const hunted = up.some(id => dietOf(s, id).includes('meat')) && rand() < CAMP.hunt * (BIOMES[biome].density || 0);
    const foraged = rand() < (CAMP.forage[biome] || 0) * boost.food;
    for (const id of up) {
      const sp = id === PLAYER_ID ? {} : bodyOf(s, id), diet = dietOf(s, id);
      const ate = (diet.includes('leaf') && SURVIVAL.green.includes(biome)) || (diet.includes('meat') && hunted) || (id === PLAYER_ID && foraged) || (sp.fishing && fresh) || sp.selfFeed;
      if (ate) { setLevel(p, 'hunger', id, 0); told.fed.push(id); }
      p.health[id] = Math.min(1, Math.round((healthOf(p, id) + CAMP.rest) * 1000) / 1000);
    }
    if (hunted) { told.meat = 1 + Math.floor(rand() * 2); carryItem(p, 'meat', told.meat); }
    if (told.water) refreshWater(p);
    // the hours in camp, without water found
    for (const id of p.members) {
      if (!told.water) setLevel(p, 'thirst', id, levelOf(p, 'thirst', id) + SURVIVAL.thirst * CAMP.cost);
      if (!told.fed.includes(id)) setLevel(p, 'hunger', id, levelOf(p, 'hunger', id) + SURVIVAL.hunger * CAMP.cost);
    }
  }
  return { ok: true, story: [told], expedition: p };
}

// Calling a party back: one waiting somewhere sets out for home; one on its way out stops where it is
// by now and turns for home (what it met before then is still told). Not one already heading home.
export function recallParty(s, id, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (!p.leg) return orderParty(s, id, HOME, now);
  const leg = p.leg;
  if (leg.train || leg.rocket) return { ok: false, reason: 'on-the-train' };
  if (leg.to === HOME || leg.recalled) return { ok: false, reason: 'homeward' };
  if (now >= leg.arriveAt) return { ok: false, reason: 'arrived' };
  // stopped for the player: that is to be seen first
  const stop = stopOf(s, p);
  if (p.pending || (stop && now >= stop.at)) return { ok: false, reason: 'untold' };
  const i = Math.max(leg.step - 1, positionOf(s, p, now));
  if (i < 0) {
    // it hadn't left yet: straight back, nothing happened
    if (leg.from === HOME) { W(s).expeditions = W(s).expeditions.filter(x => x !== p); return { ok: true, home: true }; }
    p.at = leg.from; p.leg = null;
    startLeg(s, p, HOME, now);
    return { ok: true, expedition: p };
  }
  Object.assign(leg, { path: leg.path.slice(0, i + 1), to: leg.path[i], arriveAt: now, recalled: true });
  Object.assign(p, { hex: leg.to, returnAt: now });
  return { ok: true, expedition: p };
}

// ---------- telling a leg ----------
// Tells what happened on a party's leg up to the next decision: { ok, story: what happened, in order
// (each with the hex, the index in its leg's path where it happened, and the leg's n), legs: the legs
// told ({ n, from, to, path, step: where the telling began }), leg: the last of them, pending: the decision waiting (pendingView), expedition: the party (null once home or
// lost) }. choice answers the decision waiting: { fight }, { flee }, { hunt }, { back }, or
// { witness: { act: 'prey' | 'predator', hunter } }.
export function journeyStep(s, id, choice = {}, now, dry = false) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (!p.leg) return { ok: false, reason: 'waiting' };
  // on its way it is told only once it has stopped for something (stopOf), or arrived
  if (!dry && !p.pending && now < p.leg.arriveAt) {
    const stop = stopOf(s, p);
    if (!stop || now < stop.at) return { ok: false, reason: 'not-back' };
  }
  const ctx = { s, p, now, story: [], legs: [], n: p.leg.n, dry };
  // (every event is told with the leg it happened on, n)
  ctx.story.push = (...xs) => Array.prototype.push.apply(ctx.story, xs.map(x => ({ n: ctx.n, ...x })));
  // (step: the next hex to tell when the telling began)
  const snap = () => ({ n: p.leg.n, from: p.leg.from, to: p.leg.to, path: [...p.leg.path], step: p.leg.step, startedAt: p.leg.startedAt, arriveAt: p.leg.arriveAt });
  ctx.legs.push(snap());
  if (p.pending) {
    const ev = p.pending;
    p.pending = null;
    if (ev.kind === 'go-on') { if (choice && choice.back) turnBack(ctx, ev.idx); }
    else if (ev.kind === 'airlift') { airlift(ctx, ev, choice || {}); if (!ctx.gone && !p.pending) afterEvent(ctx, ev); }
    else if (run(ctx, ev, choice || {}) && !ctx.gone && !p.pending && !offerAirlift(ctx, ev.idx)) afterEvent(ctx, ev);
    if (!ctx.gone && playerDown(p)) rescue(ctx, ev.idx);
    // (the way went on all the while, the player not knowing: it is told up to now, or the next stop)
    if (!ctx.gone && p.leg && !p.pending) delete p.leg.pausedAt;
  }
  walk(ctx);
  // a decision waiting: the party stands where it came to it until the player answers
  if (!ctx.gone && p.pending && p.leg && p.leg.pausedAt == null && !dry) p.leg.pausedAt = timeAt(s, p.leg, p.pending.idx);
  return {
    ok: true, story: ctx.story, legs: ctx.legs, leg: ctx.legs[ctx.legs.length - 1],
    pending: !ctx.gone && p.pending ? pendingView(s, p) : null, expedition: ctx.gone ? null : p, stop: ctx.stop || null,
  };

  function walk(c) {
    while (!c.gone && p.leg && !p.pending) {
      const leg = p.leg;
      c.n = leg.n;
      if (c.legs[c.legs.length - 1].n !== leg.n) c.legs.push(snap());
      // on its way: as far as it has got by now
      if (now < leg.arriveAt && (leg.train || leg.rocket || leg.air || leg.step >= leg.path.length || timeAt(s, leg, leg.step) > now)) break;
      // (on the train or a rocket nothing happens on the way)
      if (leg.train || leg.rocket || leg.air) leg.step = leg.path.length;
      if (leg.step >= leg.path.length) { if (c.dry) break; arrive(c); continue; }
      const idx = leg.step, key = leg.path[idx];
      leg.step += 1;
      reveal(s, [key]);
      if (p.news) { for (const x of p.news) x.walk += 1; tellNews(c, idx); }
      const z = hazardsOf(W(s).seed, leg.n, leg.path).find(x => x.idx === idx);
      if (z) suffer(c, z);
      if (!c.gone) survive(c, idx);
      if (c.gone) { if (c.dry) c.stop = { idx, at: timeAt(s, leg, idx) }; break; }
      // (the player down: flown home from here, and nothing more happens on the way)
      if (playerDown(p)) { rescue(c, idx); if (c.dry) { c.stop = { idx, at: timeAt(s, leg, idx) }; break; } continue; }
      // a nest noticed there comes first (and is all that happens at that hex)
      const nest = nestAt(s, p, idx) ? { kind: 'nest', idx, hex: key } : null;
      const ev = nest || (idx === leg.path.length - 1 && !leg.recalled ? endEvent(c, idx) : wayEvent(c, idx));
      if (ev && run(c, ev, null) && !c.gone && !p.pending && !offerAirlift(c, idx)) afterEvent(c, ev);
      if (!c.gone && playerDown(p)) { rescue(c, idx); if (c.dry) { c.stop = { idx, at: timeAt(s, leg, idx) }; break; } continue; }
      if (!c.gone && !p.pending) offerAirlift(c, idx);
      // (looking ahead: the first hex where the journey stops for the player)
      if (c.dry && (c.gone || p.pending || p.leg !== leg)) { c.stop = { idx, at: timeAt(s, leg, idx) }; break; }
    }
  }
}

// Where a party on its way will stop for the player, as things stand: the first hex of its leg where a
// decision waits, a fight or a fall ends the walk, or the team is lost ({ idx, at: when it gets
// there }), or null (it walks on to the end). Found by telling the leg ahead on a copy; the same every
// time, since a journey is told from its seeds.
const stops = new Map();
export function stopOf(s, p) {
  const leg = p.leg;
  if (!leg || leg.train || leg.air || p.pending || leg.step >= leg.path.length) return null;
  const key = [W(s).seed, p.id, leg.n, leg.step, leg.path.length, leg.startedAt, leg.arriveAt, p.members.join()].join('|');
  if (stops.has(key)) return stops.get(key);
  const copy = JSON.parse(JSON.stringify(s));
  const r = journeyStep(copy, p.id, {}, leg.arriveAt, true);
  const stop = r.ok ? r.stop : null;
  if (stops.size > 200) stops.clear();
  stops.set(key, stop);
  return stop;
}

// ---------- air rescue (AIRLIFT) ----------
// what flying these home from a hex costs: an aircraft for every load kg of them (small ones share
// one), each perHex coins a hex from the nest
export const airliftFare = (s, ids, hex) => (ids.length ? Math.ceil(ids.reduce((t, id) => t + massOf(explorerOf(s, id)), 0) / AIRLIFT.load)
  * Math.max(1, hexDist(parseKey(hex))) * AIRLIFT.perHex : 0);
// one's care at the nest: for the health lost, and more for one down
export const careOf = (health, grave) => Math.round(AIRLIFT.lost * (1 - health)) + (grave ? AIRLIFT.grave : 0);
// the hours one gravely injured stays in the hospital: by its size, fewer the tougher it is
export function hospitalHours(b) {
  const st = statSheet(b).stats;
  return Math.round(AIRLIFT.hospital[b.size || SPECIES[b.type].size] * Math.min(2, Math.max(0.5, AIRLIFT.ref / ((st.vit + st.res) || 1))) * 10) / 10;
}
// the flight home from a hex, as fast as the maglev
// (an aircraft home: quick, 2 min to board and 3 s a hex, as the old maglev was)
export const flightMins = hex => Math.max(1, Math.round((2 + 0.05 * hexDist(parseKey(hex))) * AIRLIFT.pace));
// the hexes flown over from a hex to the nest, in a straight line
export function airPath(from) {
  const [q, r] = parseKey(from), n = hexDist([q, r]), out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = q * (1 - t), z = r * (1 - t), y = -x - z;
    let rx = Math.round(x), rz = Math.round(z);
    const ry = Math.round(y), dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dz >= dy) rz = -rx - ry;
    out.push(hexKey(rx, rz));
  }
  return out.length ? out : [HOME];
}
// a party takes off from where it is for the nest (an aircraft), from the moment at
function startFlight(s, p, at) {
  const w = W(s);
  w.trips += 1;
  p.leg = { n: w.trips, from: p.at, to: HOME, path: airPath(p.at), step: 0, startedAt: at, arriveAt: at + flightMins(p.at) * 60000, air: true };
  Object.assign(p, { hex: HOME, trip: w.trips, startedAt: at, returnAt: p.leg.arriveAt });
}
// the hex at idx of the leg, and when the team was there
const whereWhen = (ctx, idx) => (ctx.p.leg ? { hex: ctx.p.leg.path[Math.max(0, idx)], at: timeAt(ctx.s, ctx.p.leg, Math.max(0, idx)) } : { hex: ctx.p.at, at: ctx.now });
// dinosaurs flown home land when the flight is over; one down goes on to the hospital
function land(s, b, lands, grave) {
  if (!b || !grave) return null;
  const hours = hospitalHours(b);
  b.injuredUntil = lands + hours * 3600000;
  b.hospital = true;
  delete b.critical;
  // (its wounds seen to there, fresh: the cuts sewn up, the bites left open to drain; they close
  // over its stay)
  if (b.wound) {
    b.wound = { ...b.wound, open: 1, at: lands, until: b.injuredUntil, stitched: true };
    // (and the scar each leaves is the hospital's, until a later wound there heals on its own)
    b.sewn = SCARS.parts.filter(pt => (b.sewn || []).includes(pt) || b.wound.parts.includes(pt));
  }
  return { id: b.id, name: b.name, hours };
}

// Dinosaurs of the team down since the last offer: the player, on their feet, may call in an aircraft
// for any of them (a pending 'airlift'). Returns whether it was offered.
function offerAirlift(ctx, idx) {
  const { p } = ctx;
  if (ctx.gone || p.pending || !p.leg || p.leg.air || p.down.includes(PLAYER_ID)) return false;
  const ids = p.down.filter(id => id !== PLAYER_ID && !(p.offered || []).includes(id));
  if (!ids.length) return false;
  p.offered = [...(p.offered || []), ...ids];
  p.pending = { kind: 'airlift', idx, hex: p.leg.path[idx], ids };
  return true;
}
// the player's answer: choice.airlift, the ones to fly home (none: they are carried on)
function airlift(ctx, ev, choice) {
  const { s, p, story } = ctx;
  const ids = [...new Set(Array.isArray(choice.airlift) ? choice.airlift : [])].filter(id => (ev.ids || []).includes(id) && p.members.includes(id));
  // (one gored deep and not flown home dies of it on the way: GORE)
  const left = (ev.ids || []).filter(id => p.members.includes(id) && !ids.includes(id));
  for (const id of left.filter(id => (p.gored || []).includes(id))) { story.push({ kind: 'goreDied', hex: ev.hex, idx: ev.idx, who: { id, name: (explorerOf(s, id) || {}).name || '?' } }); die(ctx, id); }
  p.gored = (p.gored || []).filter(id => p.members.includes(id) && !ids.includes(id));
  if (!p.gored.length) delete p.gored;
  if (ctx.gone) return;
  const carried = left.filter(id => p.members.includes(id));
  if (!ids.length) { if (carried.length) story.push({ kind: 'carried', hex: ev.hex, idx: ev.idx, who: carried }); return; }
  const { hex, at } = whereWhen(ctx, ev.idx), lands = at + flightMins(hex) * 60000;
  const fare = airliftFare(s, ids, hex), care = ids.reduce((t, id) => t + careOf(healthOf(p, id), isDown(p, id)), 0);
  // they fly home in a party of their own, as they were
  const q = {
    id: `a${W(s).trips + 1}`, air: true, team: ids.map(id => ({ kind: 'dino', id, members: [id] })), members: ids, at: hex, leg: null,
    health: Object.fromEntries(ids.map(id => [id, healthOf(p, id)])), hunger: {}, thirst: {}, down: ids.filter(id => isDown(p, id)), hurt: ids.filter(id => p.hurt.includes(id)),
    dead: [], carry: { items: {}, coins: 0, eggs: [] }, supplies: { water_skin: 0, ration: 0, water: 0 }, pending: null,
  };
  for (const id of ids) leave(ctx, id);
  startFlight(s, q, at);
  // (to the hospital as soon as it lands: nothing happens in the air)
  for (const id of q.down) land(s, explorerOf(s, id), q.leg.arriveAt, true);
  doomFlown(ctx, ids, ev.idx, q.leg.arriveAt);
  W(s).expeditions.push(q);
  bill(s, fare + care);
  story.push({ kind: 'airlift', hex, idx: ev.idx, who: ids, fare, care, lands });
  // (nobody left to walk on: the news is waiting at the nest)
  if (!p.members.length && p.news) tellNews(ctx, ev.idx, true);
}
// Those flown to the hospital gored deep (GORE): flown of them die of it there even so, and the team
// hears only later (tellNews); kept in the hospital till then
function doomFlown(ctx, ids, idx, lands) {
  const { s, p } = ctx;
  for (const id of ids.filter(x => (p.gored || []).includes(x))) {
    const b = explorerOf(s, id), sev = severity(b, b && b.wound && b.wound.by);
    const dies = Math.max(GORE.flownMin, Math.min(GORE.flownMax, GORE.flown * sev * sev));
    if (seededRand(`goreFlown:${W(s).seed}:${p.leg ? p.leg.n : 0}:${idx}:${id}`)() >= dies) continue;
    if (b && lands != null) b.injuredUntil = Math.max(b.injuredUntil || 0, lands + 30 * 86400000);
    p.news = [...(p.news || []), { id, name: b ? b.name : '?', walk: 0 }];
  }
  p.gored = (p.gored || []).filter(id => !ids.includes(id));
  if (!p.gored.length) delete p.gored;
}
// News from the hospital of one flown there gored, who died of it: told once the team has walked on
// GORE.news hexes, or at once on reaching a city or home (all), and only then is it gone from the nest
function tellNews(ctx, idx, all = false) {
  const { s, p, story } = ctx;
  if (!p.news) return;
  const told = p.news.filter(x => all || x.walk >= GORE.news);
  for (const x of told) {
    if (p.members.includes(x.id)) leave(ctx, x.id);
    bury(s, x.id);
    for (const e of W(s).expeditions) if (e !== p && e.members.includes(x.id)) { e.members = e.members.filter(m => m !== x.id); e.team = e.team.map(u => ({ ...u, members: u.members.filter(m => m !== x.id) })).filter(u => u.members.length); }
    story.push({ kind: 'goreLost', hex: idx >= 0 && p.leg ? p.leg.path[idx] : p.at, idx, who: { id: x.id, name: x.name } });
  }
  p.news = p.news.filter(x => !told.includes(x));
  if (!p.news.length) delete p.news;
}
// one leaves the team (flown home)
function leave(ctx, id) {
  const { p } = ctx;
  p.team = p.team.map(u => ({ ...u, members: u.members.filter(m => m !== id) })).filter(u => u.members.length);
  p.members = p.members.filter(m => m !== id);
  p.down = p.down.filter(m => m !== id);
  p.hurt = p.hurt.filter(m => m !== id);
  delete p.health[id];
}

// the player down and not yet in the air: to be rescued
const playerDown = p => p.down.includes(PLAYER_ID) && !(p.leg && p.leg.air);
// gravely injured (down) or badly hurt: flown and cared for on credit (AIRLIFT.bad)
const hurtBadly = (p, id) => isDown(p, id) || healthOf(p, id) <= AIRLIFT.bad;
// What flying the whole team home from a hex costs: { now: paid then and there, later: billed (the share
// of the flight for the badly hurt, and their care) }. The player down is RESCUE's care.
export function flightBill(s, p, hex) {
  const all = airliftFare(s, p.members, hex), fit = airliftFare(s, p.members.filter(id => !hurtBadly(p, id)), hex);
  const care = p.members.filter(id => hurtBadly(p, id)).reduce((t, id) => t + (id === PLAYER_ID && isDown(p, id) ? RESCUE.coins : careOf(healthOf(p, id), isDown(p, id))), 0);
  return { now: fit, later: all - fit + care, fare: all, care };
}
// The whole team flown home from the hex at idx (or where it waits) with all it carries, the journey
// over: rescued (the player down: all of it billed) or called (the fit's share of the flight paid
// already: paid)
function flyParty(ctx, idx, kind, paid = 0, when = null) {
  tellNews(ctx, idx, true);
  doomFlown(ctx, ctx.p.members, idx, null);
  const { s, p, story } = ctx;
  const { hex, at } = kind === 'rescued' ? whereWhen(ctx, idx) : { hex: p.leg ? p.leg.path[Math.max(0, idx)] : p.at, at: when == null ? ctx.now : when };
  // (down at the nest's door: home already)
  if (hex === HOME) { p.at = HOME; p.leg = null; p.pending = null; comeHome(ctx); return; }
  const lands = at + flightMins(hex) * 60000;
  const cost = flightBill(s, p, hex), later = Math.max(0, cost.fare - paid) + cost.care;
  p.at = hex; p.leg = null; p.pending = null; p.camp = null;
  story.push({ kind, hex, idx, fare: cost.fare, paid, later, care: cost.care, lands });
  bill(s, later);
  startFlight(s, p, at);
  for (const id of p.down.filter(x => x !== PLAYER_ID)) land(s, explorerOf(s, id), p.leg.arriveAt, true);
}
// landed at the nest: home, and the gravely injured to the hospital
// (home since it landed, its report read only now: its wounds are counted from the landing)
function landed(ctx) {
  const { s, p, story } = ctx, leg = p.leg, down = p.down.filter(id => id !== PLAYER_ID);
  p.at = HOME;
  comeHome({ ...ctx, now: leg.arriveAt, story });
  ctx.gone = true;
  const hospital = down.map(id => land(s, explorerOf(s, id), leg.arriveAt, true)).filter(Boolean);
  if (hospital.length) story.push({ kind: 'hospital', hex: HOME, idx: -1, hospital });
}
// The player down (RESCUE): the whole team flown home, all of it billed (less what a flight called for
// already paid)
const rescue = (ctx, idx) => flyParty(ctx, idx, 'rescued', (ctx.p.leg && ctx.p.leg.fly) || 0);

// The player calls an aircraft for the whole team, wherever it is: waiting, at a decision, or on its way
// (it stops where it is by now: what happened until then is told first, then it flies). The fit's share
// of the flight is paid now, or there is none; the badly hurt's, and their care, billed.
export function flyHome(s, id, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  const leg = p.leg;
  if (leg && leg.train) return { ok: false, reason: 'on-the-train' };
  if (leg && (leg.fly != null || leg.air)) return { ok: false, reason: 'called' };
  if (leg && !p.pending && (now >= leg.arriveAt || (stopOf(s, p) && now >= stopOf(s, p).at))) return { ok: false, reason: 'untold' };
  const walking = leg && !p.pending;
  const i = walking ? Math.max(leg.step - 1, positionOf(s, p, now)) : -1;
  const hex = p.pending ? p.pending.hex : !leg ? p.at : i >= 0 ? leg.path[i] : leg.from;
  if (hex === HOME) return { ok: false, reason: 'home' };
  const cost = flightBill(s, p, hex);
  if (s.coins < cost.now) return { ok: false, reason: 'coins', cost };
  s.coins -= cost.now;
  if (walking && i >= 0) {
    // it stops where it is: the way so far is told, then the aircraft comes
    Object.assign(leg, { path: leg.path.slice(0, i + 1), to: leg.path[i], arriveAt: now, recalled: true, fly: cost.now });
    Object.assign(p, { hex: leg.to, returnAt: now });
    return { ok: true, expedition: p, cost };
  }
  if (walking) { p.at = leg.from; p.leg = null; }
  const ctx = { s, p, now, story: [], legs: [], n: leg ? leg.n : 0 };
  flyParty(ctx, p.pending ? p.pending.idx : leg ? leg.path.length - 1 : -1, 'flown', cost.now);
  return { ok: true, story: ctx.story, cost, expedition: p };
}

// After an event on the way out: go on, or turn back (nobody on their feet: they turn back)
function afterEvent(ctx, ev) {
  const { s, p } = ctx, leg = p.leg;
  if (!leg || leg.to === HOME || ev.idx >= leg.path.length - 1) return;
  if (!anyStanding(s, p)) { turnBack(ctx, ev.idx); return; }
  p.pending = { kind: 'go-on', idx: ev.idx, hex: leg.path[ev.idx] };
}
// the leg ends at the hex at index i, and the party heads home from there, from when it was there
function turnBack(ctx, i) {
  const { s, p, story } = ctx, leg = p.leg;
  const at = timeAt(s, leg, i);
  p.at = leg.path[i];
  p.leg = null;
  story.push({ kind: 'turned', hex: p.at, idx: i });
  if (p.at === HOME) { comeHome(ctx); return; }
  startLeg(s, p, HOME, at);
}

// the end of a leg: at home the party breaks up and brings everything in; elsewhere it waits there
// (having looked around: gather); a leg called back turns for home where it stopped
function arrive(ctx) {
  const { s, p, story } = ctx, leg = p.leg, w = W(s);
  // an aircraft called for: it flies home from where it stopped; one landing at the nest
  if (leg.fly != null) { flyParty(ctx, leg.path.length - 1, 'flown', leg.fly, leg.arriveAt); return; }
  if (leg.air) { landed(ctx); return; }
  p.at = leg.to;
  // what the team gathered of the common kinds as it walked, told at once
  if (p.gathered && Object.keys(p.gathered).length) {
    story.push({ kind: 'gathered', hex: leg.to, idx: Math.max(0, leg.path.length - 1), found: Object.entries(p.gathered).map(([id, n]) => ({ id, n })) });
    p.gathered = {};
  }
  // the train: everyone fed and watered aboard, the flasks filled at the station
  if (leg.train || leg.rocket) {
    tellNews(ctx, leg.path.length - 1, true);
    story.push(leg.rocket ? { kind: 'rocket', hex: leg.to, idx: 0, from: leg.from, to: leg.to } : { kind: 'train', hex: leg.to, idx: leg.path.length - 1, from: leg.from, to: leg.to, stops: trainRoute(w.seed, leg.from, leg.to)?.stops || [leg.from, leg.to] });
    // (after a flight: a rest before setting out again)
    if (leg.rocket) for (const m of p.members) { const b = m !== PLAYER_ID && explorerOf(s, m); if (b) b.restUntil = leg.arriveAt + ROCKET.rest * 60000; }
    refresh(p);
    if (leg.to === HOME) { comeHome(ctx); return; }
    p.leg = null;
    Object.assign(p, { hex: p.at, returnAt: leg.arriveAt });
    return;
  }
  // a city on foot: its people give the team food and water, and there is nothing to gather
  const city = leg.to !== HOME && cityAt(w.seed, parseKey(leg.to));
  if (city && !leg.recalled) {
    refresh(p);
    p.leg = null;
    story.push({ kind: 'city', hex: leg.to, idx: leg.path.length - 1, name: city });
    tellNews(ctx, leg.path.length - 1, true);
    Object.assign(p, { hex: p.at, returnAt: leg.arriveAt });
    return;
  }
  if (leg.to === HOME) { comeHome(ctx); return; }
  if (leg.recalled) {
    const at = leg.arriveAt;
    p.leg = null;
    story.push({ kind: 'turned', hex: p.at, idx: leg.path.length - 1, recalled: true });
    startLeg(s, p, HOME, at);
    return;
  }
  p.leg = null;
  gather(ctx, leg);
  Object.assign(p, { hex: p.at, returnAt: leg.arriveAt });
}

const reveal = (s, keys) => {
  const w = W(s);
  for (const k of keys) if (!w.revealed.includes(k)) w.revealed.push(k);
};

// ---------- the land's own dangers ----------
// The dangers of the land a leg crosses (HAZARDS), rolled once per hex of the leg (none in the calm
// around a settlement), at most HAZARD_MAX: [{ idx, kind, mins: minutes lost, wound: who it wears down }]
export function hazardsOf(seed, n, path) {
  const out = [];
  for (let idx = 0; idx < path.length && out.length < HAZARD_MAX; idx++) {
    const h = parseKey(path[idx]), cell = cellAt(seed, h);
    if (!cell || nearOf(seed, h) <= NEST_CALM) continue;
    const rand = seededRand(`haz:${seed}:${n}:${idx}`);
    for (const z of HAZARDS[cell.biome] || []) {
      if ((z.river && !cell.river) || (z.cold != null && !(cell.heat < z.cold))) continue;
      if (rand() >= z.chance * (z.lava && cell.lava ? z.lava : 1)) continue;
      out.push({ idx, kind: z.kind, mins: z.delay ? z.delay[0] + Math.floor(rand() * (z.delay[1] - z.delay[0] + 1)) : 0, wound: z.wound || null });
      break;
    }
  }
  return out;
}
// A danger of the land met at a hex: the time it cost is already in the leg; someone of those on their
// feet may be worn down by it (never brought down). Told unless nothing came of it.
function suffer(ctx, z) {
  const { s, p, story } = ctx, w = W(s), key = p.leg.path[z.idx];
  const rand = seededRand(`hurt:${w.seed}:${p.leg.n}:${z.idx}`);
  const members = standingUnits(s, p).flatMap(u => u.members);
  const size = id => SIZE_ORDER.indexOf(bodyOf(s, id).size || PLAYER_SIZE);
  const pool = !z.wound ? [] : z.wound === 'heavy' ? members.filter(id => size(id) >= SIZE_ORDER.indexOf('large'))
    : z.wound === 'cold' ? members.filter(id => id !== PLAYER_ID && size(id) <= SIZE_ORDER.indexOf('small')) : members;
  const who = pool.length ? pool[Math.floor(rand() * pool.length)] : null;
  if (!z.mins && !who) return;
  if (who) {
    const cut = HAZARD_WOUND[0] + rand() * (HAZARD_WOUND[1] - HAZARD_WOUND[0]);
    p.health[who] = Math.round(Math.max(Math.min(HAZARD_FLOOR, healthOf(p, who)), healthOf(p, who) - cut) * 1000) / 1000;
  }
  const b = who && who !== PLAYER_ID ? explorerOf(s, who) : null;
  story.push({ kind: 'hazard', hazard: z.kind, hex: key, idx: z.idx, biome: biomeAt(w.seed, parseKey(key)), mins: z.mins, ...(who ? { who: { id: who, name: who === PLAYER_ID ? 'You' : b ? b.name : '?' } } : {}) });
}

// ---------- hunger and thirst ----------
// fed and watered (at a city, on the train), the flasks filled
function refresh(p) {
  for (const id of p.members) setLevel(p, 'hunger', id, 0);
  refreshWater(p);
}
// everyone watered, the flasks filled
function refreshWater(p) {
  for (const id of p.members) setLevel(p, 'thirst', id, 0);
  if (p.supplies) p.supplies.water = p.supplies.water_skin * SURVIVAL.skin;
}
export const levelOf = (p, kind, id) => (p[kind] && p[kind][id]) || 0;
// one of the team eats what the team carries (the player's rations first; eggs are never eaten on the
// way): as much as it takes to fill it up, as far as there is (CLOCK: the days its hunger stands for, at
// its day's food). Returns what it ate ({ food, n }) or null.
function eatOnTrip(s, p, id) {
  const level = levelOf(p, 'hunger', id), sup = p.supplies || {};
  if (level <= 0 || SURVIVAL.hunger <= 0) return null;
  const food = id === PLAYER_ID && sup.ration > 0 ? 'ration' : dietOf(s, id).find(x => x !== 'raw_egg' && (p.carry.items[x] || 0) > 0);
  if (!food) return null;
  const who = explorerOf(s, id), day = dailyKg(who, food), each = ITEMS[food].kg || 1;
  const days = level / SURVIVAL.hunger * UNIT_HOURS / 24;
  const have = food === 'ration' ? sup.ration : p.carry.items[food];
  const n = Math.min(have, Math.max(1, Math.ceil(days * day / each)));
  if (food === 'ration') sup.ration -= n;
  else if (!(p.carry.items[food] -= n)) delete p.carry.items[food];
  setLevel(p, 'hunger', id, level - n * each / day * 24 / UNIT_HOURS * SURVIVAL.hunger);
  return { food, n };
}
// what the team carries of one kind: in its packs (supplies) and found on the way (carry)
const carried = (p, id) => ((p.supplies || {})[id] || 0) + ((p.carry && p.carry.items[id]) || 0);
function useCarried(p, id) {
  if ((p.supplies || {})[id] > 0) p.supplies[id] -= 1;
  else if (!(p.carry.items[id] -= 1)) delete p.carry.items[id];
}

// At a stop on the way (a decision waiting), the player can tend to the team with what it carries:
// a Healing Herb (TRIP_CARE.herb of one's health back), a Blood Transfusion (one down back on its
// feet, at TRIP_CARE.revive), a meal, or a drink from the flasks (as many as it takes).
export function tripCare(s, id, member, what) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (!p.pending || !p.leg) return { ok: false, reason: 'not-stopped' };
  if (!p.members.includes(member)) return { ok: false, reason: 'missing' };
  const down = isDown(p, member), health = healthOf(p, member);
  if (what === 'herb') {
    if (down) return { ok: false, reason: 'down' };
    if (health >= 1) return { ok: false, reason: 'unhurt' };
    if (!carried(p, 'herb')) return { ok: false, reason: 'none' };
    useCarried(p, 'herb');
    p.health[member] = Math.min(1, Math.round((health + TRIP_CARE.herb) * 1000) / 1000);
    return { ok: true, health: p.health[member] };
  }
  if (what === 'transfusion') {
    if (!down || member === PLAYER_ID) return { ok: false, reason: 'not-down' };
    if (!carried(p, 'transfusion')) return { ok: false, reason: 'none' };
    useCarried(p, 'transfusion');
    p.down = p.down.filter(x => x !== member);
    p.health[member] = TRIP_CARE.revive;
    return { ok: true, health: p.health[member] };
  }
  if (what === 'eat') {
    if (levelOf(p, 'hunger', member) <= 0) return { ok: false, reason: 'full' };
    const ate = eatOnTrip(s, p, member);
    return ate ? { ok: true, ...ate } : { ok: false, reason: 'none' };
  }
  if (what === 'drink') {
    const sup = p.supplies || {}, need = SURVIVAL.drinks[member === PLAYER_ID ? PLAYER_SIZE : bodyOf(s, member).size] || 1;
    if (levelOf(p, 'thirst', member) <= 0) return { ok: false, reason: 'full' };
    if ((sup.water || 0) < need) return { ok: false, reason: 'none' };
    while (levelOf(p, 'thirst', member) > 0 && sup.water >= need) { sup.water -= need; setLevel(p, 'thirst', member, levelOf(p, 'thirst', member) - SURVIVAL.drink); }
    return { ok: true };
  }
  return { ok: false, reason: 'bad-item' };
}
const setLevel = (p, kind, id, v) => { p[kind] = p[kind] || {}; p[kind][id] = Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000; };
const dietOf = (s, id) => (id === PLAYER_ID ? PLAYER_DIET : bodyOf(s, id).diet || []);
// fresh water at a hex: a river, a lake beside it, a swamp or a floodplain (the sea is salt)
export const freshWater = (seed, h) => {
  const c = cellAt(seed, h);
  return !!c && (c.river || c.biome === 'swamp' || c.biome === 'floodplain' || neighbors(h).some(n => (cellAt(seed, n) || {}).terrain === 'lake'));
};
// The longest stretch of the way from one hex to another with no fresh water: { hexes, thirst: how
// thirsty it would leave one who set out watered }
export function dryStretch(seed, from, to, via = []) {
  let best = { hexes: 0, thirst: 0 }, run = { hexes: 0, thirst: 0 };
  const path = routePath(seed, from, to, via), costs = pathCosts(seed, from, path);
  for (let i = 0; i < path.length; i++) {
    const h = parseKey(path[i]);
    if (freshWater(seed, h)) { run = { hexes: 0, thirst: 0 }; continue; }
    const c = cellAt(seed, h);
    run = { hexes: run.hexes + 1, thirst: run.thirst + SURVIVAL.thirst * costs[i] * (SURVIVAL.dry[c.biome] || 1) };
    if (run.thirst > best.thirst) best = run;
  }
  return best;
}
// what a level of hunger or thirst is called (SURVIVAL.words)
export const needWord = (kind, v) => SURVIVAL.words[kind].find(([max]) => v < max)[1];
// how worn down one is by hunger or thirst, as stat mods for a fight (SURVIVAL weak, faint, worn)
export function wornMods(p, id) {
  const worst = Math.max(levelOf(p, 'hunger', id), levelOf(p, 'thirst', id));
  const k = worst >= SURVIVAL.faint ? SURVIVAL.worn[1] : worst >= SURVIVAL.weak ? SURVIVAL.worn[0] : 1;
  return k < 1 ? [{ stat: 'str', type: 'more', value: k }, { stat: 'agi', type: 'more', value: k }] : [];
}
// Every step of the way: hunger and thirst rise (SURVIVAL); fresh water waters everyone and fills the
// flasks, a plant eater grazes on green land, a fisher fishes at fresh water, a small hunter feeds
// itself; past SURVIVAL.at one drinks from the flasks and eats what the team carries; at the end of
// one's strength the health drains: a dinosaur dies of it, the player collapses.
function survive(ctx, idx) {
  const { s, p, story } = ctx, w = W(s), key = p.leg.path[idx], h = parseKey(key), cell = cellAt(w.seed, h);
  if (!cell) return;
  const cost = stepCost(cell, cellAt(w.seed, parseKey(idx ? p.leg.path[idx - 1] : p.leg.from))), fresh = freshWater(w.seed, h);
  const tell = x => story.push({ hex: key, idx, biome: cell.biome, ...x });
  const sup = p.supplies || (p.supplies = { water_skin: 0, ration: 0, water: 0 });
  const nameOf = id => (id === PLAYER_ID ? 'You' : (explorerOf(s, id) || { name: '?' }).name);
  const before = Object.fromEntries(p.members.map(id => [id, Math.max(levelOf(p, 'hunger', id), levelOf(p, 'thirst', id))]));
  const thirsty = p.members.some(id => levelOf(p, 'thirst', id) >= SURVIVAL.at);
  for (const id of p.members) {
    const sp = id === PLAYER_ID ? {} : bodyOf(s, id), up = !isDown(p, id);
    let t = levelOf(p, 'thirst', id) + SURVIVAL.thirst * cost * (SURVIVAL.dry[cell.biome] || 1);
    // (gizzard stones, or a Psittacosaurus creche's strong stomach: hungry more slowly)
    const slow = (sp.digest || 1) * (id !== PLAYER_ID && explorerOf(s, id).stomach ? CRECHE.stomach : 1);
    let f = levelOf(p, 'hunger', id) + SURVIVAL.hunger * cost / slow;
    if (up && sp.selfFeed) f = 0;
    else if (up && dietOf(s, id).includes('leaf') && SURVIVAL.green.includes(cell.biome)) f -= SURVIVAL.graze;
    if (fresh) { t = 0; if (up && sp.fishing) f = 0; }
    setLevel(p, 'thirst', id, t);
    setLevel(p, 'hunger', id, f);
  }
  if (fresh) {
    sup.water = sup.water_skin * SURVIVAL.skin;
    if (thirsty) tell({ kind: 'water' });
  } else if (sup.water > 0) {
    // the flasks, the thirstiest first
    for (const id of [...p.members].sort((a, b) => levelOf(p, 'thirst', b) - levelOf(p, 'thirst', a))) {
      if (levelOf(p, 'thirst', id) < SURVIVAL.at) break;
      const need = SURVIVAL.drinks[id === PLAYER_ID ? PLAYER_SIZE : bodyOf(s, id).size] || 1;
      if (sup.water < need) continue;
      sup.water -= need;
      setLevel(p, 'thirst', id, levelOf(p, 'thirst', id) - SURVIVAL.drink);
    }
    if (sup.water <= 0) tell({ kind: 'dry' });
  }
  // what the land gives as the team walks (foragers find their kinds more easily)
  forage(ctx, idx, cell, h);
  // a meal of what the team carries (the player's rations first; eggs are never eaten on the way): as
  // much as it takes to fill one up, as far as there is (CLOCK: the days its hunger stands for, at its
  // day's food)
  for (const id of p.members) if (levelOf(p, 'hunger', id) >= SURVIVAL.at) eatOnTrip(s, p, id);
  // at the end of one's strength
  for (const id of [...p.members]) {
    const hunger = levelOf(p, 'hunger', id), thirst = levelOf(p, 'thirst', id), worst = Math.max(hunger, thirst);
    const need = thirst >= hunger ? 'thirst' : 'hunger';
    if (worst < SURVIVAL.faint) continue;
    if (before[id] < SURVIVAL.faint) tell({ kind: 'faint', need, who: { id, name: nameOf(id) } });
    if (healthOf(p, id) <= 0) continue;
    const left = healthOf(p, id) - SURVIVAL.drain[need] * cost;
    if (left > 0) { p.health[id] = Math.round(left * 1000) / 1000; continue; }
    const name = nameOf(id);
    if (id === PLAYER_ID) { fall(ctx, id, false); tell({ kind: 'collapse', need, who: { id, name } }); continue; }
    tell({ kind: 'perished', need, who: { id, name } });
    die(ctx, id);
    if (ctx.gone) return;
  }
}

// The foragers along (ROLES, FORAGE.by): the team members whose kinds of finds come more easily
const foragersOf = (s, members) => members.filter(id => id !== PLAYER_ID && FORAGE.by[(explorerOf(s, id) || {}).type]);
// What the land gives at a hex as the team walks it (FORAGE.way): a handful of seeds, stones, leaves,
// fruit, insects or herbs, carried; a forager finds its own kinds more easily (FORAGE.more)
function forage(ctx, idx, cell, h) {
  const { s, p, story } = ctx, w = W(s);
  if (nearOf(w.seed, h) <= NEST_CALM) return;
  const up = foragersOf(s, p.members.filter(id => !isDown(p, id)));
  if (!p.members.some(id => !isDown(p, id))) return;
  const rand = seededRand(`forage:${w.seed}:${p.leg.n}:${idx}`);
  const found = [], by = new Set();
  for (const [item, lands] of Object.entries(FORAGE.way)) {
    let chance = Math.max(lands[cell.biome] || 0, cell.river ? lands.river || 0 : 0);
    if (!chance) continue;
    const who = up.find(id => FORAGE.by[explorerOf(s, id).type].includes(item));
    // (a forager makes a find likelier; where it is found every time, it gathers more of it)
    const boost = who ? FORAGE.more : 1, sure = chance >= 1;
    if (rand() >= Math.min(1, chance * boost)) continue;
    const n = (FORAGE.min + Math.floor(rand() * (FORAGE.max - FORAGE.min + 1))) * (sure ? boost : 1);
    const got = carryItem(p, item, n);
    // (the common kinds are tallied, and told when the leg ends)
    if (FORAGE.common.includes(item)) { p.gathered = p.gathered || {}; p.gathered[item] = (p.gathered[item] || 0) + n; continue; }
    found.push(got);
    if (who) by.add(explorerOf(s, who).name);
  }
  if (found.length) story.push({ kind: 'forage', hex: p.leg.path[idx], idx, biome: cell.biome, found, by: [...by] });
}

// ---------- nests ----------
// the species nesting at a hex walked on a leg, and how (NEST): { species, kind } or null. At most one nest
// a leg: the first hex where one is noticed (a Gallimimus along notices them twice as often)
const gallis = (s, p) => foragersOf(s, p.members.filter(id => !isDown(p, id))).some(id => FORAGE.by[explorerOf(s, id).type].includes('nest'));
// The species nesting in a land, each with its share of the nests found there (NEST): [[species, share]]
const shares = new Map();
export function nestShares(biome) {
  if (shares.has(biome)) return shares.get(biome);
  const here = NEST.where[biome] || {};
  const weight = Object.fromEntries(Object.entries(here).map(([sp, wt]) => {
    const best = Math.max(...Object.values(NEST.where).map(x => x[sp] || 0)), kind = NEST.kind[sp];
    return [sp, NEST.sees[kind] * (kind === 'buried' ? 1 : NEST.rarity[SPECIES[sp].rarity]) * wt / best];
  }));
  const total = Object.values(weight).reduce((t, x) => t + x, 0) || 1;
  let out = Object.entries(weight).map(([sp, x]) => [sp, x / total]);
  // (a legendary is never more than NEST.legendary of them, the rest sharing what it gives up)
  const capped = out.filter(([sp, x]) => SPECIES[sp].rarity === 'Legendary' && x > NEST.legendary);
  if (capped.length && capped.length < out.length) {
    const freed = capped.reduce((t, [, x]) => t + x - NEST.legendary, 0), rest = out.filter(([sp]) => !capped.some(([c]) => c === sp)).reduce((t, [, x]) => t + x, 0);
    out = out.map(([sp, x]) => [sp, capped.some(([c]) => c === sp) ? NEST.legendary : x + freed * x / rest]);
  }
  shares.set(biome, out);
  return out;
}
function nestRoll(s, p, idx) {
  const w = W(s), h = parseKey(p.leg.path[idx]), cell = cellAt(w.seed, h);
  if (!cell || nearOf(w.seed, h) <= NEST_CALM || p.leg.train) return null;
  // (a Gallimimus notices nests twice as often, a scout sniffs them out too: SCOUT.egg)
  const here = nestShares(cell.biome), rand = seededRand(`nest:${w.seed}:${p.leg.n}:${idx}`);
  if (!here.length) return null;
  const more = (gallis(s, p) ? FORAGE.more : 1) * (hasScout(s, p.members.filter(id => !isDown(p, id))) ? SCOUT.egg : 1);
  const kinds = new Set(here.map(([sp]) => NEST.kind[sp]));
  const chance = 1 - [...kinds].reduce((t, k) => t * (1 - NEST.find[k]), 1);
  if (rand() >= Math.min(1, chance * more)) return null;
  let r = rand();
  for (const [sp, x] of here) if ((r -= x) <= 0) return { species: sp, kind: NEST.kind[sp] };
  const [sp] = here.at(-1);
  return { species: sp, kind: NEST.kind[sp] };
}
// a nest noticed at the hex at idx of the leg: none within NEST.gap hexes of the last one
function nestAt(s, p, idx) {
  let last = -Infinity;
  for (let i = 0; i < idx; i++) if (i - last >= NEST.gap && nestRoll(s, p, i)) last = i;
  return idx - last >= NEST.gap ? nestRoll(s, p, idx) : null;
}
// A nest's clutch: how many eggs (NEST.clutch, even for a theropod: laid in pairs) and which are fertile
export function clutchOf(seed, n, idx, species) {
  const rand = seededRand(`nest-clutch:${seed}:${n}:${idx}`), [lo, hi] = NEST.clutch[species] || [10, 20];
  let size = lo + Math.floor(rand() * (hi - lo + 1));
  if (SPECIES[species].build === 'theropod' && size % 2) size += size < hi ? 1 : -1;
  return { size, fertile: Array.from({ length: size }, () => rand() < NEST.fertile) };
}
// whether the player knows a species' eggs (and so its nest): a starter's, or one they have hatched
export const knows = (s, species) => SPECIES[species].rarity === 'Starter' || (s.known || []).includes(species) || s.hatched.some(b => b.type === species);
// the eggs of a hatched nest left behind: those that never hatched (one at least)
const leftoversOf = c => Math.max(1, c.fertile.filter(f => !f).length);
// the chance the parent of an empty nest comes back while the team holds its looks-th egg to the light
const candleChance = (kind, looks) => { const [a, b] = NEST.candle[kind] || NEST.candle.brooded; return Math.min(0.9, a + b * looks); };
// The nest as the team finds it: { species, name, nest: how it nests (NEST.kind), state: 'hatched' (the
// young gone, the eggs that never hatched left: leftovers), 'alone' (left, or a parent away to feed:
// empty), 'empty', 'watched' (a parent close by, watching), 'colony', 'unseen' (a parent on it that hasn't
// seen the team), 'seen' (a parent on it warning the team off), foe: the parent (or colony adults),
// clutch: how many eggs, eggs: how many the team carries, full: it can carry no more, decoys: the quick
// ones that could lure the parent away [{ id, name, chance }], sneak / wait: their chances }. Mid-way
// through (the decision waiting is this nest's): phase ('empty': the parent away, eggs held to the light
// one by one; 'dud': the last one held up would never hatch; 'duds': looked over in calm, these would
// never hatch), left: the eggs not yet looked at, chance: that the parent comes back at the next look }
export function nestView(s, p, idx) {
  const w = W(s), nest = nestAt(s, p, idx);
  if (!nest) return null;
  const { species, kind } = nest, rand = seededRand(`nest-state:${w.seed}:${p.leg.n}:${idx}`);
  const units = standingUnits(s, p), team = teamUnits(s, units), biome = biomeAt(w.seed, parseKey(p.leg.path[idx]));
  const seen = Math.min(0.9, NEST.seen * teamVisibility(team, biome) / VISIBILITY.base);
  const clutch = clutchOf(w.seed, p.leg.n, idx, species);
  const r = rand();
  const hatched = seededRand(`nest-hatched:${w.seed}:${p.leg.n}:${idx}`)() < NEST.hatched;
  const state = hatched ? 'hatched' : kind === 'buried' ? 'alone' : kind === 'colony' ? 'colony' : kind === 'creche' ? 'watched'
    : kind === 'watched' ? (r < NEST.watched ? 'watched' : 'alone')
    : r < NEST.empty[kind] ? 'empty' : rand() < seen ? 'seen' : 'unseen';
  const n = kind === 'colony' ? NEST.colony[0] + Math.floor(rand() * (NEST.colony[1] - NEST.colony[0] + 1)) : 1;
  const sp = SPECIES[species];
  // (each its own, the same however often this nest is looked at. A colony has no alpha: the nest's two
  // parents defend it to the end, and the nearest neighbors join in, giving up once badly hurt)
  const foeRand = seededRand(`nest-foe:${w.seed}:${p.leg.n}:${idx}`);
  const adults = Array.from({ length: n }, (_, i) => ({ ...wildFighter(species, AGES.prime.step, false, foeRand), ...(n > 1 && i >= 2 ? { neighbor: true } : {}) }));
  const foe = unitOf(n > 1 ? `${sp.species} colony (${n})` : `Nesting ${sp.species}`, adults, n > 1);
  const parent = foe.members[0];
  // (bait: one of the team that would run from the parent anyway; its speed against the parent's)
  const lone = state === 'unseen' || state === 'seen' || state === 'watched';
  const decoys = !lone ? [] : team.flatMap((u, i) => (fears(u, foe) || (u.members[0].role || 'attacker') === 'noncombatant' ? u.members.map((f, j) => ({ id: units[i].members[j], f })) : []))
    .filter(({ id }) => id !== PLAYER_ID).map(({ id, f }) => ({ id, name: f.name, chance: f.agi / (f.agi + parent.agi) }));
  const pe = p.pending && p.pending.kind === 'nest' && p.pending.idx === idx && p.pending.phase ? p.pending : null;
  const looked = pe ? pe.looked || 0 : 0;
  return {
    species, name: sp.species, nest: kind, state, foe, clutch: clutch.size, leftovers: leftoversOf(clutch),
    eggs: p.carry.eggs.length, full: p.carry.eggs.length >= NEST.carry, decoys, sneak: 1 - seen, volcano: biome === 'volcano',
    // (no parent about: whose it is, only known for a species the player has hatched)
    known: ['watched', 'colony', 'unseen', 'seen'].includes(state) || knows(s, species),
    phase: pe ? pe.phase : null, left: clutch.size - looked, duds: pe ? pe.duds || 0 : 0, chance: candleChance(kind, pe ? pe.looks || 0 : 0),
  };
}
// the i-th egg of a nest of a species, carried home (unseen: grabbed without looking, a dud if it would
// never hatch; that shows once home)
function takeEgg(ctx, species, idx, i, unseen = null) {
  const { s, p, now } = ctx, w = W(s), rand = seededRand(`egg:${w.seed}:${p.leg.n}:${idx}:${i}`);
  const [lo, hi] = EGG_GENES(EGG_STEP, false);
  // (its genes and sex are what they are from the moment it is taken: nothing rerolls them at hatching)
  const egg = { id: `egg-${w.seed}-${p.leg.n}-${idx}-${i}`, type: species, gen: 1, parents: [], laidAt: now, genes: Object.fromEntries(STATS.map(({ id: st }) => [st, lo + Math.floor(rand() * (hi - lo + 1))])) };
  egg.sex = rand() < 0.5 ? 'm' : 'f';
  if (unseen) { egg.unseen = true; if (unseen.dud) egg.dud = true; }
  p.carry.eggs.push(egg);
  return egg;
}
// eggs that would never hatch, kept as food
function keepDuds(p, n) { if (n > 0) p.carry.items.raw_egg = (p.carry.items.raw_egg || 0) + n; }
// time spent at a nest (digging, waiting): hunger and thirst as NEST.cost units of travel
function linger(p) {
  for (const id of p.members) {
    setLevel(p, 'thirst', id, levelOf(p, 'thirst', id) + SURVIVAL.thirst * NEST.cost);
    setLevel(p, 'hunger', id, levelOf(p, 'hunger', id) + SURVIVAL.hunger * NEST.cost);
  }
}
// A nest on the way: the decision waits for the player, and may lead to another (ev.phase). First
// (choice.nest): 'keep' (a hatched nest: take the eggs left), 'take' (a nest alone: dig it out and look
// the eggs over; an empty one: snatch an egg and go), 'candle' (an empty one: hold an egg to the light),
// 'sneak', 'lure' (with choice.decoy), 'fight', or anything else: leave it. Then, phase 'empty':
// 'candle' again, 'take' (one more, unseen, and go) or leave; 'dud': 'keep' it as food or put it back;
// 'duds': 'keep' them as food or leave them.
function nestEvent(ctx, ev, choice) {
  const { s, p, story } = ctx, w = W(s), h = parseKey(ev.hex), v = nestView(s, p, ev.idx);
  if (!v || !standingUnits(s, p).length) return false;
  if (choice === null) { p.pending = { kind: 'nest', idx: ev.idx, hex: ev.hex }; return true; }
  const step = ev.step || 0, rand = seededRand(`nest-act:${w.seed}:${p.leg.n}:${ev.idx}:${step}`);
  const clutch = clutchOf(w.seed, p.leg.n, ev.idx, v.species);
  let looked = ev.looked || 0, looks = ev.looks || 0;
  const told = { kind: 'nest', hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), species: v.species, name: v.name, nest: v.nest, state: v.state, clutch: v.clutch, known: v.known, act: 'leave', eggs: [] };
  const as = { foe: v.foe, entry: { species: v.species, loot: [['meat', 2, 4], ['bone', 1, 2]] }, step: AGES.prime.step, id: v.species };
  const next = (phase, extra = {}) => { p.pending = { kind: 'nest', idx: ev.idx, hex: ev.hex, phase, looked, looks, step: step + 1, ...extra }; };
  const space = () => NEST.carry - p.carry.eggs.length;
  // one egg grabbed without a look
  const grab = () => { if (looked < clutch.size && space() > 0) { told.eggs.push(takeEgg(ctx, v.species, ev.idx, looked, { dud: !clutch.fertile[looked] })); told.unseen = true; looked++; } };
  // with time and calm, every egg left held to the light: the fertile taken, as many as fit, the rest asked
  const calm = () => {
    let duds = 0, fertile = 0;
    told.looked = clutch.size - looked;
    for (; looked < clutch.size; looked++) {
      if (!clutch.fertile[looked]) duds++;
      else if (fertile++, space() > 0) told.eggs.push(takeEgg(ctx, v.species, ev.idx, looked));
      else told.full = true;
    }
    told.duds = duds; told.fertile = fertile;
    if (duds) next('duds', { duds });
  };
  // the parent away: hold the next egg to the light; it may come back meanwhile
  const candle = () => {
    told.act = 'candle';
    if (rand() < candleChance(v.nest, looks)) { told.back = true; battle(); return; }
    looks++;
    const i = looked++;
    if (clutch.fertile[i]) { told.fertile = true; told.eggs.push(takeEgg(ctx, v.species, ev.idx, i)); goOn(); } else { told.fertile = false; next('dud'); }
  };
  // on looking, while there is room and eggs left (none: told why)
  const goOn = () => { if (looked >= clutch.size) told.none = true; else if (space() <= 0) told.full = true; else next('empty'); };
  // a fight with the parent (never running): won, the nest is the team's, but at a colony the others close in
  const battle = () => {
    const b = fight(ctx, ev, rand, { as, defend: true, guard: true, silent: true });
    told.battle = b;
    if (!b.win || ctx.gone) return;
    if (v.state === 'colony') grab(); else calm();
  };
  const act = choice.nest;
  if (ev.phase === 'dud') {
    told.act = act === 'keep' ? 'keep' : 'putback';
    if (act === 'keep') keepDuds(p, 1);
    goOn();
  } else if (ev.phase === 'duds') {
    told.act = act === 'keep' ? 'keep' : 'leave';
    told.duds = ev.duds || 0;
    if (act === 'keep') keepDuds(p, told.duds);
  } else if (ev.phase === 'empty') {
    if (act === 'candle') candle();
    else if (act === 'take') { told.act = 'take'; grab(); }
    else told.act = 'went';
  } else {
    const can = {
      keep: v.state === 'hatched', take: !v.full && ['alone', 'empty'].includes(v.state), candle: !v.full && v.state === 'empty',
      fight: !v.full && v.state !== 'hatched' && v.state !== 'alone' && v.state !== 'empty',
      sneak: !v.full && v.state === 'unseen', lure: !v.full && v.decoys.length > 0,
    };
    if (act && can[act]) {
      told.act = act;
      if (act === 'keep') { told.duds = v.leftovers; keepDuds(p, v.leftovers); }
      else if (act === 'take' && v.state === 'empty') grab();
      else if (act === 'take') {
        linger(p);
        // a hot spring's fumes, while digging
        if (v.volcano && rand() < NEST.fumes) { const up = p.members.filter(id => !isDown(p, id)); const who = up[Math.floor(rand() * up.length)]; if (who) { p.health[who] = Math.max(HAZARD_FLOOR, healthOf(p, who) - HAZARD_WOUND[0]); told.fumes = who; } }
        calm();
      } else if (act === 'candle') candle();
      else if (act === 'sneak') {
        if (rand() < v.sneak) grab();
        else { told.spotted = true; battle(); }
      } else if (act === 'lure') {
        const d = v.decoys.find(x => x.id === choice.decoy) || v.decoys[0];
        told.decoy = { id: d.id, name: d.name };
        // outrun, it comes back to the team once the egg is taken; caught, it is killed
        if (rand() < d.chance) grab();
        else { told.caught = { id: d.id, name: d.name, died: true }; die(ctx, d.id); if (ctx.gone) { story.push(told); return true; } }
      } else if (act === 'fight') battle();
    }
  }
  story.push(told);
  return true;
}

// the species (or creature) a threat is, for the pictures: its id
const spOf = threat => (threat && threat.entry ? threat.entry.species || threat.entry.creature || null : null);

// ---------- what happens on the way ----------
// At a hex on the way (past the calm around the nest): now and then a hunt, wild against wild, the
// team watches; otherwise what lives there may notice the team (INTERCEPT): what holds a lair often,
// anything else by how much the team stands out
function wayEvent(ctx, idx) {
  const { s, p } = ctx, w = W(s), key = p.leg.path[idx], h = parseKey(key);
  if (nearOf(w.seed, h) <= NEST_CALM) return null;
  const units = standingUnits(s, p);
  if (!units.length) return null;
  const rand = seededRand(`way:${w.seed}:${p.leg.n}:${idx}`);
  if (rand() < WITNESS.way && witnessOf(s, p, idx)) return { kind: 'witness', idx, hex: key };
  const t = metAt(s, p, idx), team = teamUnits(s, units);
  if (isAttacker(t.foe) && keepsAway(t, team) && !huntOdds(team, t.foe.members[0])) return null;
  const sun = sunAt(s, p, idx);
  const chance = t.lair ? INTERCEPT.lair : encounterChance(t, team, biomeAt(w.seed, h), hasScout(s, p.members), sun) * INTERCEPT.share;
  return rand() < chance ? { kind: 'meet', idx, hex: key, sun } : null;
}
// At the journey's end: a hunt the team watches (WITNESS), or what lives there, met as often as it
// would be (encounterChance)
function endEvent(ctx, idx) {
  const { s, p } = ctx, w = W(s), key = p.leg.path[idx], h = parseKey(key);
  const units = standingUnits(s, p);
  if (!units.length) return null;
  const rand = seededRand(`end:${w.seed}:${p.leg.n}`);
  if (rand() < WITNESS.chance && witnessOf(s, p, idx)) return { kind: 'witness', idx, hex: key };
  const t = metAt(s, p, idx), sun = sunAt(s, p, idx);
  return rand() < encounterChance(t, teamUnits(s, units), biomeAt(w.seed, h), hasScout(s, p.members), sun) ? { kind: 'meet', idx, hex: key, sun } : null;
}
// day or night at the hex at idx of the leg when the team got there (sun.js)
const sunAt = (s, p, idx) => skyAt(timeAt(s, p.leg, idx), placeOf(parseKey(p.leg.path[idx]))).phase;
// what lives at the hex at idx of the leg, the very animals met there this time (each wild one its own)
const metAt = (s, p, idx) => threatAt(W(s).seed, parseKey(p.leg.path[idx]), seededRand(`met:${W(s).seed}:${p.leg.n}:${idx}`));
const witnessOf = (s, p, idx) => witnessAt(W(s).seed, parseKey(p.leg.path[idx]), seededRand(`wit:${W(s).seed}:${p.leg.n}:${idx}`));

// Plays an event: one waiting for a decision is left pending (choice null) or played with it. Returns
// whether anything happened the player is told of.
function run(ctx, ev, choice) {
  const { s, p, story, now } = ctx, w = W(s), h = parseKey(ev.hex);
  const rand = seededRand(`ev:${w.seed}:${p.leg.n}:${ev.idx}:${ev.kind}`);
  const units = standingUnits(s, p), team = teamUnits(s, units);
  const threat = metAt(s, p, ev.idx);
  const tell = x => story.push({ hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), ...x });
  const ask = kind => { p.pending = { kind, idx: ev.idx, hex: ev.hex }; return true; };
  if (!units.length) return false;

  if (ev.kind === 'meet') {
    if (keepsAway(threat, team)) {
      // it keeps away from the team, but may be spotted at a distance, and hunted
      return huntOdds(team, threat.foe.members[0]) ? ask('sighting') : false;
    }
    const back = sailBackOff(threat, team, watery(w.seed, h));
    if (back && rand() < back) {
      // a rival as big as the team's Spinosaurus sized up its sail and backed off
      const sail = team.flatMap(u => u.members).filter(m => m.type && SPECIES[m.type].sail).reduce((a, m) => (m.power > a.power ? m : a));
      tell({ kind: 'backedOff', sp: spOf(threat), name: threat.foe.name, count: threat.foe.members.length, by: sail.name });
      return true;
    }
    // the player was along and some ran: the player decides
    if (scatterOf(s, units, threat)) return ask('scatter');
    if (!standsGround(threat.foe) && runnersSpot(s, p.members, rand, biomeAt(w.seed, h))) {
      // runners (Gallimimus) saw the predator first: the team runs, and it gives chase to the slowest
      const chased = chaseOf(team, threat.foe, biomeAt(w.seed, h));
      let caught = null;
      if (chased && rand() < chased.chance) caught = fall(ctx, units[chased.unit].members[chased.member], rand() < chased.death);
      tell({ kind: 'chase', sp: spOf(threat), name: threat.foe.name, count: threat.foe.members.length, spotted: 'runners', caught });
      return true;
    }
    const eyes = eyesChance(s, p.members, biomeAt(w.seed, h));
    if (!standsGround(threat.foe) && eyes && rand() < eyes) {
      // watchful ones (Hypsilophodon) saw it first: the team scatters in zigzags, nobody is caught
      tell({ kind: 'chase', sp: spOf(threat), name: threat.foe.name, count: threat.foe.members.length, spotted: 'eyes', caught: null, scattered: true });
      return true;
    }
    if (standsGround(threat.foe)) return ask('standoff');
    fight(ctx, ev, rand);
    return true;
  }
  if (ev.kind === 'scatter') {
    const sc = scatterOf(s, units, threat);
    if (!sc) { fight(ctx, ev, rand); return true; }
    if (choice === null) return ask('scatter');
    if (!choice.flee) { fight(ctx, ev, rand, { thrown: sc.mounted, scatter: sc }); return true; }
    const r = runOf(s, units, threat, sc, biomeAt(w.seed, h));
    const safe = !!(r && r.safe && rand() < r.safe);
    if (r && !safe && rand() < r.chance) {
      // caught: the player (or one who'd fight) turns to fight; one of those who ran may not survive
      if (r.fights) { fight(ctx, ev, rand, { forced: r.id, scatter: sc }); return true; }
      tell({ kind: 'chase', sp: spOf(threat), name: threat.foe.name, count: threat.foe.members.length, scatter: scatterView(sc), caught: fall(ctx, r.id, rand() < r.death) });
    } else tell({ kind: 'chase', sp: spOf(threat), name: threat.foe.name, count: threat.foe.members.length, scatter: scatterView(sc), caught: null, ...(safe ? { scattered: true } : {}) });
    return true;
  }
  if (ev.kind === 'standoff') {
    if (choice === null) return ask('standoff');
    if (choice.fight) fight(ctx, ev, rand, { standoff: true });
    else tell({ kind: 'standoff', sp: spOf(threat), ...standoffOf(threat), fought: false });
    return true;
  }
  if (ev.kind === 'sighting') {
    const odds = huntOdds(team, threat.foe.members[0]);
    if (!odds) return false;
    if (choice === null) return ask('sighting');
    const base = { kind: 'sighting', sp: spOf(threat), name: threat.foe.name, species: threat.entry.species, count: threat.foe.members.length, hunter: odds.hunter };
    if (!choice.hunt) { tell({ ...base, hunted: false }); return true; }
    const caught = rand() < odds.chance;
    const got = caught ? carcass(ctx, threat.entry, threat.step, rand, [threat.foe.members[0]]) : [];
    // (no coins: an animal has none; what it gives is sold at home)
    tell({ ...base, hunted: true, caught, loot: got });
    return true;
  }
  if (ev.kind === 'nest') return nestEvent(ctx, ev, choice);
  if (ev.kind === 'witness') {
    const wt = witnessOf(s, p, ev.idx);
    if (!wt) return false;
    if (choice === null) return ask('witness');
    const told = { kind: 'witness', hunter: wt.hunter, prey: wt.prey, outcome: wt.outcome, act: 'none', loot: [] };
    const want = choice.witness && typeof choice.witness === 'object' ? choice.witness : null;
    const opt = want && interveneOptions(s, { team: units }, wt).find(o => o.id === want.hunter);
    const act = want && want.act, go = opt && (act === 'prey' ? opt.prey : act === 'predator' ? opt.predator : null);
    if (go && go.ok) {
      const by = units.find(u => u.id === opt.id), me = units.filter(u => u.kind === 'player');
      Object.assign(told, { act, by: opt.name });
      const step = threat.step;
      const hunterAs = { foe: wt.hunterFoe, entry: wt.hunter.entry, step, name: wt.hunter.name };
      if (act === 'prey') {
        told.caught = rand() < go.chance;
        if (told.caught && go.backsOff) told.loot.push(...carcass(ctx, wt.prey.entry, step, rand, [wt.preyFoe.members[0]]));
        else if (told.caught) {
          // the hunter comes for the kill: the player and the one who ran it down fight it for it
          told.contested = true;
          const b = fight(ctx, ev, rand, { as: hunterAs, units: [...me, by], defend: true, silent: true });
          told.battle = b;
          if (b.win) told.loot.push(...carcass(ctx, wt.prey.entry, step, rand, [wt.preyFoe.members[0]]));
        } else if (!passesBy({ entry: wt.hunter.entry, foe: wt.hunterFoe }, team)) {
          // its meal got away: it turns on the team, if anything in it is on its menu
          told.turned = true;
          told.battle = fight(ctx, ev, rand, { as: hunterAs, silent: true });
        }
      } else if (go.chase) {
        // it runs from this hunter, and the prey runs too
        told.caught = rand() < go.chance;
        if (told.caught) told.loot.push(...carcass(ctx, wt.hunter.entry, step, rand, [wt.hunterFoe.members[0]]));
      } else told.battle = fight(ctx, ev, rand, { as: hunterAs, units: [...me, by], defend: true, silent: true });
    }
    tell(told);
    return true;
  }
  return false;
}

const scatterView = sc => ({ name: sc.name, prey: sc.prey, mounted: sc.mounted, alone: sc.alone });

// the carcass of what the team brought down: its loot, more the stronger it was (AGES), carried home
// What a kill brings home: its meat by weight (the edible share of the ones brought down, kills, as much
// as the team can still carry: FOOD), and the rest of what it leaves (its loot, more the farther out)
function carcass(ctx, entry, step, rand, kills = []) {
  const mult = 1 + (step - 1) * LOOT_PER_HEX, got = [];
  const meat = Math.min(Math.round(kills.reduce((t, k) => t + (k.kg || 0), 0) * FOOD.edible), haulRoom(ctx.s, ctx.p));
  if (meat > 0) got.push(carryItem(ctx.p, 'meat', meat));
  for (const [item, min, max] of entry.loot || []) {
    if (item === 'meat' && kills.length) continue;
    const lo = Math.round(min * mult), hi = Math.round(max * mult);
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    if (n > 0) got.push(carryItem(ctx.p, item, n));
  }
  // the meat eaters eat their fill of it there and then
  for (const id of ctx.p.members) if (dietOf(ctx.s, id).includes('meat')) setLevel(ctx.p, 'hunger', id, 0);
  return got;
}
// how many more kg of food the team can carry: each standing one haul of its weight, the player playerHaul
function haulRoom(s, p) {
  const cap = p.members.filter(id => !isDown(p, id)).reduce((t, id) => t + (id === PLAYER_ID ? FOOD.playerHaul : massOf(explorerOf(s, id)) * FOOD.haul), 0);
  const held = Object.entries(p.carry.items).reduce((t, [id, n]) => t + n * ((ITEMS[id] && ITEMS[id].kg) || 0), 0);
  return Math.max(0, Math.floor(cap - held));
}
function carryItem(p, item, n) {
  if (!ITEMS[item] || n <= 0) return { id: item, n: 0 };
  p.carry.items[item] = (p.carry.items[item] || 0) + n;
  return { id: item, n };
}

// One of the party caught or brought down: it dies (buried at once: gone from the nest), or it is
// down, carried by the rest. Returns { id, name, died }.
function fall(ctx, id, dies) {
  const { s, p } = ctx;
  const b = explorerOf(s, id), name = b ? b.name : '?';
  if (dies && id !== PLAYER_ID) { die(ctx, id); return { id, name, died: true }; }
  p.health[id] = 0;
  if (!p.down.includes(id)) p.down.push(id);
  return { id, name, died: false };
}
function die(ctx, id) {
  const { s, p } = ctx;
  const gone = bury(s, id);
  if (gone) p.dead.push(gone);
  p.team = p.team.map(u => ({ ...u, members: u.members.filter(m => m !== id) })).filter(u => u.members.length);
  p.members = p.members.filter(m => m !== id);
  p.down = p.down.filter(m => m !== id);
  p.hurt = p.hurt.filter(m => m !== id);
  delete p.health[id];
  if (!p.members.length) {
    // nobody left: the party is lost, and all it carried
    W(s).expeditions = W(s).expeditions.filter(x => x !== p);
    ctx.gone = true;
    const idx = p.leg ? Math.max(0, p.leg.step - 1) : -1;
    ctx.story.push({ kind: 'lost', hex: p.leg ? p.leg.path[idx] : p.at, idx });
  }
}

// The party fights what lives at the event's hex (or how.as: { foe, entry, step, name }, a hunter it
// stepped in on), with the health it has left. how.units: who fights (those on their feet by default);
// how.defend: the team went for it, so it defends itself whatever it would hunt; how.thrown: the player
// came off its mount; how.forced: the one caught running turned to fight. A win carries home the
// carcass (unless it got away badly hurt) and coins. Returns the battle, for the replay.
// The health one of the player's dinosaurs lost in a fight, counted on the parts of its body the foe's
// blows fell on (SCARS: as the foe fights), and on its legs if it was lamed; each part it struck
// remembers who gave it
export function scarStyle(entry) {
  if (!entry) return 'any';
  if (entry.creature) return entry.creature === 'deinosuchus' ? 'croc' : 'any';
  const sp = SPECIES[entry.species] || {};
  if (sp.claw) return 'claw';
  if (sp.build === 'theropod') return ['large', 'huge', 'colossal'].includes(sp.size) ? 'bigBite' : 'bite';
  // (only a Triceratops gores with horns; the small ceratopsians had none, and bit with their beaks;
  // a Stegosaurus drives the spikes of its tail in; the other armoured ones club)
  if (entry.species === 'trike') return 'horns';
  if (sp.build === 'ceratopsian') return 'bite';
  if (entry.species === 'stego') return 'spikes';
  if (sp.build === 'armored') return 'club';
  if (sp.build === 'sauropod') return 'stomp';
  return 'butt';
}
function scar(ctx, ev, id, lost, lame, entry, young = false) {
  const b = explorerOf(ctx.s, id);
  if (!b || (lost <= 0 && !lame)) return null;
  const rand = seededRand(`scar:${W(ctx.s).seed}:${ctx.p.leg ? ctx.p.leg.n : 0}:${ev.idx}:${id}`);
  const weights = Object.entries(SCARS.style[scarStyle(entry)]), total = weights.reduce((t, [, w]) => t + w, 0);
  const got = {};
  // (its loss in three parts, each falling where the foe struck)
  for (let k = 0; k < 3 && lost > 0; k++) {
    let r = rand() * total, part = weights[0][0];
    for (const [pt, w] of weights) { if ((r -= w) < 0) { part = pt; break; } }
    got[part] = (got[part] || 0) + lost / 3;
  }
  if (lame) got.legs = (got.legs || 0) + SCARS.lame;
  const who = entry && (entry.species || entry.creature);
  // (and its wounds, open while it is hurt: WOUNDS)
  const open = b.wound && !b.wound.until ? b.wound.parts : [], wasDeep = (b.wound && !b.wound.until && b.wound.deep) || [];
  // (a horn in the flank or the neck goes deep as often as it reaches far into the body, whatever the
  // harm: GORE)
  const horn = ['horns', 'spikes'].includes(scarStyle(entry)), sev = horn ? severity(b, who) : 0;
  const gored = horn ? GORE.parts.filter(pt => got[pt] && rand() < Math.min(1, GORE.deep * sev)) : [];
  const deep = SCARS.parts.filter(pt => wasDeep.includes(pt) || gored.includes(pt) || (!(horn && GORE.parts.includes(pt)) && (got[pt] || 0) >= WOUNDS.deep) || (lame && pt === 'legs'));
  // (a blunt blow that went no deeper than a bruise leaves nothing to see: CRUSH)
  if (SCARS.crush.includes(scarStyle(entry))) for (const pt of Object.keys(got)) if (!deep.includes(pt)) delete got[pt];
  b.scars = b.scars || {};
  for (const [part, n] of Object.entries(got)) b.scars[part] = Math.round(((b.scars[part] || 0) + n) * 1000) / 1000;
  // (each part it struck carries its mark: who gave the scars there last)
  // (and whether a young one gave them, juvenile, not grown: its scars the smaller)
  if (who && Object.keys(got).length) {
    const was = (b.scarBy && b.scarBy.young) || [], youngNow = SCARS.parts.filter(pt => got[pt] ? young : was.includes(pt));
    const { young: _, ...by } = b.scarBy || {};
    b.scarBy = { ...by, ...Object.fromEntries(Object.keys(got).map(pt => [pt, who])), ...(youngNow.length ? { young: youngNow } : {}) };
  }
  if (b.sewn) { b.sewn = b.sewn.filter(pt => !got[pt]); if (!b.sewn.length) delete b.sewn; }
  const parts = SCARS.parts.filter(pt => got[pt] || open.includes(pt));
  if (parts.length) b.wound = { parts, ...(deep.length ? { deep } : {}), ...(who || (b.wound && b.wound.by) ? { by: who || b.wound.by } : {}), ...((who ? young : b.wound && b.wound.young) ? { young: true } : {}) };
  // (and each wound leaves its scar however little it took: a deep one a deep scar)
  for (const pt of Object.keys(got)) b.scars[pt] = Math.max(b.scars[pt], deep.includes(pt) ? SCARS.deep : SCARS.marked);
  return gored.length ? { part: gored[0], sev } : null;
}
// how far a horn or spike reaches into a body against how thick it is (1: right through the middle;
// more: through it): GORE
export function severity(b, by) {
  const reach = GORE.reach[by] || 0;
  if (!b || !reach) return 0;
  const armor = (SPECIES[b.type] || {}).armor;
  return reach * (armor ? GORE.armor[armor] || 1 : 1) / (GORE.torso * Math.cbrt(massOf(b)));
}
// How open each wound is, from 1 (just given) to 0 (closed): on a journey, as hurt as the dinosaur
// is; at home, closing as it heals. Returns { parts: { part: how open }, by, deep (the parts deeply
// wounded), stitched (seen to in the hospital) }, or null once all closed.
export function woundsOf(s, b, now) {
  const w = b && b.wound;
  if (!w || !w.parts || !w.parts.length) return null;
  const id = b === s.player ? PLAYER_ID : b.id, p = W(s).expeditions.find(e => e.members.includes(id));
  let open;
  if (!w.until) open = p && !hasLanded(p, now) ? (isDown(p, id) ? 1 : 1 - healthOf(p, id)) : injuredLeft(b, now) > 0 ? 1 : 0;
  else open = w.until > w.at ? w.open * Math.max(0, Math.min(1, (w.until - now) / (w.until - w.at))) : 0;
  open = Math.round(open * 100) / 100;
  return open > 0 ? { parts: Object.fromEntries(w.parts.map(pt => [pt, open])), by: w.by || null, deep: w.deep || [], ...(w.stitched ? { stitched: true } : {}), ...(w.young ? { young: true } : {}) } : null;
}
// how scarred each part is: 0 none, 1 marked, 2 deep
export const scarLevels = b => Object.fromEntries(SCARS.parts.map(pt => {
  const n = (b && b.scars && b.scars[pt]) || 0;
  return [pt, n >= SCARS.deep ? 2 : n >= SCARS.marked ? 1 : 0];
}));

function fight(ctx, ev, rand, how = {}) {
  const { s, p, story } = ctx, w = W(s), h = parseKey(ev.hex);
  const threat = metAt(s, p, ev.idx);
  const as = how.as || { foe: threat.foe, entry: threat.entry, step: threat.step, lair: threat.lair, id: threat.id };
  const foe = as.foe;
  const fought = how.units || standingUnits(s, p);
  const team = teamUnits(s, fought, id => wornMods(p, id));
  const opts = { swamp: watery(w.seed, h), biome: biomeAt(w.seed, h), hp: fought.map(u => u.members.map(id => healthOf(p, id))), ...(how.defend ? { defend: true } : {}), ...(how.guard ? { guard: true } : {}) };
  const result = teamFight(team, foe, rand, opts);
  const frenzyCount = p.members.filter(id => { const b = id !== PLAYER_ID && explorerOf(s, id); return b && SPECIES[b.type].rival; }).length;
  // everyone ran from a predator: it gives chase, and may catch the slowest
  const chased = result.escaped ? chaseOf(team, foe, opts.biome) : null;
  let caught = null;
  if (chased && rand() < chased.chance) caught = fall(ctx, fought[chased.unit].members[chased.member], rand() < chased.death);
  const died = [];
  const downed = [];
  const gores = [];
  // health carries on: brought down, it may be killed (slain outright, or by its resistance), or is
  // down; a lamed leg or a lost fight means coming home injured whatever its health
  fought.forEach((u, i) => !result.fled.includes(i) && u.members.forEach((id, j) => {
    const left = Math.max(0, result.hp[i][j] / result.teamHps[i][j]);
    const lame = result.lamed.some(([a, b]) => a === i && b === j);
    // (the scars it will carry, if it lives)
    const gored = id !== PLAYER_ID ? scar(ctx, ev, id, opts.hp[i][j] - left, lame, as.entry, !!(foe.members[0] && foe.members[0].young)) : null;
    // (gored deep in the flank or the neck: it may die of it there and then, more the less tough it is
    // and the more hurt it was; if not it is down, for the hospital or death: GORE)
    if (gored) {
      const res = team[i].members[j].res, tough = Math.min(DEATH.max, Math.max(DEATH.min, res / (res + DEATH.resBase)));
      // (right through it: dead; otherwise the graver, the less tough and the more hurt, the likelier)
      const killed = gored.sev >= 1 || rand() < gored.sev * gored.sev * (1 - GORE.kill * tough * (0.5 + 0.5 * opts.hp[i][j]));
      gores.push({ id, part: gored.part, killed });
      if (killed) { died.push(id); return; }
      fall(ctx, id, false);
      downed.push(id);
      p.gored = [...new Set([...(p.gored || []), id])];
      return;
    }
    if (left <= 0) {
      if (id !== PLAYER_ID) {
        const slain = result.slain.some(([a, b]) => a === i && b === j);
        const res = team[i].members[j].res;
        const lives = Math.min(DEATH.max, Math.max(DEATH.min, res / (res + DEATH.resBase)));
        if (slain || rand() >= lives) { died.push(id); return; }
      }
      fall(ctx, id, false);
      downed.push(id);
      return;
    }
    p.health[id] = Math.round(left * 1000) / 1000;
    if ((lame || (!result.win && !result.foeWent)) && !p.hurt.includes(id)) p.hurt.push(id);
    // a frill keeps the damage it took until it is mended
    const f = result.frill[i] && result.frill[i][j];
    if (f !== null && f !== undefined) explorerOf(s, id).frill = f;
  }));
  const names = Object.fromEntries(p.members.map(id => [id, (explorerOf(s, id) || {}).name]));
  const battle = {
    creature: as.id || (as.entry.species || as.entry.creature), lair: !!as.lair,
    foe: { name: foe.name, power: as.lair !== undefined ? threat.power : foe.members.reduce((t, m) => t + m.power, 0), hp: result.foeMax, count: foe.members.length, pack: foe.pack },
    team: team.map((t, i) => ({ name: t.name, kind: fought[i].kind, members: fought[i].members, hp: result.teamHps[i], power: t.members.reduce((x, m) => x + m.power, 0),
      start: opts.hp[i], ...(t.members.some(m => m.frill !== undefined) ? { frill: t.members.map(m => m.frill ?? null) } : {}) })),
    ...result, frenzyCount, downed, ...(caught ? { caught } : {}), ...(how.thrown ? { thrown: true } : {}), ...(how.forced ? { forced: how.forced } : {}),
  };
  battle.died = died.map(id => ({ id, name: names[id] }));
  // the spoils of a win
  if (result.win) {
    battle.loot = as.entry && !result.foeFled ? carcass(ctx, as.entry, as.step, rand, foe.members.filter((_, k) => (result.foeHps[k] ?? 0) <= 0)) : [];
    if (result.frenzy.length) for (const drop of FRENZY_DROPS) if (rand() < drop.chance(frenzyCount)) {
      const lo = drop.min(frenzyCount), hi = drop.max(frenzyCount);
      battle.loot.push(carryItem(p, drop.id, lo + Math.floor(rand() * (hi - lo + 1))));
    }
    // equipment that drops is the kind sold in the Shop
    if (rand() < GEAR_DROP(as.step, !!as.lair)) {
      const gear = Object.keys(ITEMS).filter(id => ITEMS[id].kind === 'gear' && ITEMS[id].price);
      battle.loot.push(carryItem(p, gear[Math.floor(rand() * gear.length)], 1));
    }
  }
  if (ev.idx === (p.leg ? p.leg.path.length - 1 : -1)) ctx.endBattle = battle;
  if (!how.silent) {
    story.push({
      hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), kind: 'fight', battle, ...(ev.sun === 'night' ? { night: true } : {}),
      ...(how.standoff ? { standoff: standoffOf(threat) } : {}), ...(how.scatter ? { scatter: { ...scatterView(how.scatter), choice: 'fight' } } : {}),
    });
  }
  for (const g of gores) story.push({ hex: ev.hex, idx: ev.idx, kind: 'gored', who: g.id, part: g.part, killed: g.killed });
  // (the dead are buried once the fight is told)
  for (const id of died) die(ctx, id);
  return battle;
}

// Looking around the journey's end (a team beaten there brings nothing away): what the hex has, more
// with a hauler; fish for a fisher by the water; plants for a forager; maybe an egg; coins for a first
// visit. All of it carried home.
function gather(ctx, leg) {
  const { s, p, story, now } = ctx, w = W(s), key = leg.to, h = parseKey(key);
  const rand = seededRand(`loot:${w.seed}:${leg.n}`);
  const b = ctx.endBattle;
  const beaten = b && !b.win && !b.escaped && !b.foeWent;
  const found = [];
  let egg = null, discovered = false;
  const roll = ({ min, max }) => min + Math.floor(rand() * (max - min + 1));
  const standing = standingUnits(s, p).flatMap(u => u.members);
  if (!beaten && standing.length) {
    const haul = teamHaul(s, standing);
    // (a forager along finds its own kinds more easily: FORAGE)
    const finds = new Set(foragersOf(s, standing).flatMap(id => FORAGE.by[explorerOf(s, id).type]));
    for (const l of lootTable(s, key)) if (rand() < l.chance * (finds.has(l.id) ? FORAGE.more : 1)) found.push(carryItem(p, l.id, Math.round(roll(l) * haul)));
    if (watery(w.seed, h)) for (const id of standing) {
      const f = bodyOf(s, id).fishing;
      if (f) found.push(carryItem(p, 'fish', f[0] + Math.floor(rand() * (f[1] - f[0] + 1))));
    }
    for (const id of standing) for (const [item, min, max, chance = 1] of bodyOf(s, id).forage || []) {
      if (rand() < chance) found.push(carryItem(p, item, min + Math.floor(rand() * (max - min + 1))));
    }
    // (eggs are found in nests on the way: nestEvent)
    discovered = !w.visited.includes(key);
    if (discovered) w.visited.push(key);
  }
  // even a beaten team saw the land around it
  reveal(s, neighbors(h).map(n => hexKey(...n)));
  ctx.endBattle = null;
  story.push({ kind: 'arrived', hex: key, idx: leg.path.length - 1, biome: biomeAt(w.seed, h), found: found.filter(x => x.n > 0), egg, discovered, beaten: !!beaten });
}

// Home: what was carried is brought in, wounds become injuries (down: critical; a lost fight or a lamed
// leg: injured; under half health: bruised), everyone is hungry but a small hunter (Compsognathus) that
// fed itself on the way, and the party breaks up
function comeHome(ctx) {
  tellNews(ctx, -1, true);
  const { s, p, story, now } = ctx, w = W(s);
  const loot = [];
  // the eggs grabbed without a look are held to the light at the nest: those that would never hatch are food
  const duds = p.carry.eggs.filter(g => g.dud);
  if (duds.length) p.carry.items.raw_egg = (p.carry.items.raw_egg || 0) + duds.length;
  for (const [item, n] of Object.entries(p.carry.items)) if (n > 0) loot.push({ id: item, n, lost: addItem(s, item, n) });
  if (p.carry.coins) earn(s, p.carry.coins);
  const eggs = p.carry.eggs.filter(g => !g.dud).map(({ unseen, ...egg }) => {
    s.eggs = s.eggs || [];
    if (s.eggs.length < EGG_TRAY_SIZE) { s.eggs.push(egg); return egg; }
    return { ...egg, lost: true };
  });
  const injured = [], hungry = [];
  for (const id of p.members) {
    const b = explorerOf(s, id);
    if (!b) continue;
    const left = healthOf(p, id), down = isDown(p, id), me = id === PLAYER_ID;
    const critical = down && !me;
    let mins = critical ? CRITICAL_MINS : down || p.hurt.includes(id) ? INJURY_MINS : left < 0.5 ? Math.round(BRUISE_MINS * (1 - left * 2)) : 0;
    if (mins) {
      // a tough one (Dilophosaurus) heals in half the time, a critical injury aside
      if (!critical && b.type && SPECIES[b.type].tough) mins = Math.max(1, Math.round(mins * TOUGH.heal));
      b.injuredUntil = now + mins * 60000;
      if (critical) b.critical = true; else delete b.critical;
      injured.push({ id, mins, ...(critical ? { critical } : {}) });
    }
    // its wounds close from here: as long as its injury, or as bad as they are of WOUNDS.mins
    if (b.wound && !b.wound.until) {
      const open = down ? 1 : Math.max(0, 1 - left);
      if (open > 0) b.wound = { ...b.wound, open, at: now, until: now + Math.max(mins, open * WOUNDS.mins) * 60000 };
      else delete b.wound;
    }
    // (at home the keepers feed the dinosaurs; the player comes home as hungry as the journey left
    // them: past SURVIVAL.at they need a meal at once)
    if (!me) continue;
    const f = levelOf(p, 'hunger', id), every = hungerEvery(b);
    b.lastFed = now - (f >= SURVIVAL.at ? every : Math.round(every * f / SURVIVAL.at));
    if (isHungryNow(b, now)) hungry.push(id);
  }
  // the flasks and the rations left go back in the inventory
  const sup = p.supplies || {};
  for (const id of ['water_skin', 'ration', 'herb', 'transfusion']) if (sup[id] > 0) addItem(s, id, sup[id]);
  w.expeditions = w.expeditions.filter(x => x !== p);
  p.leg = null;
  ctx.gone = true;
  story.push({ kind: 'home', hex: HOME, idx: -1, loot, coins: p.carry.coins, eggs, duds: duds.map(g => g.type), injured, hungry, died: p.dead, team: p.team, members: p.members });
}

// ---------- the decision waiting, for the screens ----------
// { kind, hex, idx, biome, ... }: 'scatter' (the player's group scattered from a predator: fight or
// flee) { name, count, prey, mounted, alone, run, units }; 'standoff' (a group stood its ground: fight
// or leave) { ...standoffOf, foe }; 'sighting' (spotted at a distance: hunt or let be) { name, species,
// count, hunter, chance }; 'witness' (a hunt watched: step in or not) { hunter, prey, outcome, options,
// hunterFoe, preyFoe }; 'go-on' (after an event on the way out: go on to the destination, or turn back)
// { to, standing, down: the ids of those down }. foe and units are fighters, for the odds.
export function pendingView(s, p) {
  const ev = p.pending;
  if (!ev || !p.leg) return null;
  const w = W(s), h = parseKey(ev.hex), units = standingUnits(s, p), team = teamUnits(s, units);
  const threat = metAt(s, p, ev.idx);
  const base = { kind: ev.kind, hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), swamp: watery(w.seed, h), units: team, hp: units.map(u => u.members.map(id => healthOf(p, id))), sp: spOf(threat) };
  if (ev.kind === 'scatter') {
    const sc = scatterOf(s, units, threat);
    return { ...base, ...(sc ? scatterView(sc) : { name: threat.foe.name }), count: threat.foe.members.length, foe: threat.foe, run: sc && runOf(s, units, threat, sc, base.biome) };
  }
  if (ev.kind === 'standoff') return { ...base, ...standoffOf(threat), foe: threat.foe };
  if (ev.kind === 'sighting') {
    const odds = huntOdds(team, threat.foe.members[0]);
    return { ...base, name: threat.foe.name, species: threat.entry.species, count: threat.foe.members.length, hunter: odds && odds.hunter, chance: odds ? odds.chance : 0 };
  }
  if (ev.kind === 'witness') {
    const wt = witnessOf(s, p, ev.idx);
    return { ...base, ...wt, options: wt ? interveneOptions(s, { team: units }, wt) : [] };
  }
  if (ev.kind === 'nest') return { ...base, ...nestView(s, p, ev.idx) };
  if (ev.kind === 'airlift') {
    const who = (ev.ids || []).filter(id => p.members.includes(id)).map(id => ({ id, name: explorerOf(s, id).name, health: healthOf(p, id), care: careOf(healthOf(p, id), isDown(p, id)) }));
    return { ...base, who, mins: flightMins(ev.hex) };
  }
  return { ...base, to: p.leg.to, standing: units.length > 0, down: [...p.down] };
}

// Plays a party's whole leg with a fixed answer to every decision (for tests and quick play): fight
// what stands its ground, flee nothing, hunt nothing, step into nothing, and go on (back: turn back
// at the first chance). Returns every step's result.
export function journeyAll(s, id, now, answers = {}) {
  const steps = [];
  for (let i = 0; i < 200; i++) {
    const r = journeyStep(s, id, answers, now);
    steps.push(r);
    if (!r.ok || !r.pending) break;
  }
  return steps;
}


// ---------- loaded saves ----------
const PENDING = ['scatter', 'standoff', 'sighting', 'witness', 'go-on', 'nest', 'airlift'];
const NEST_PHASES = ['empty', 'dud', 'duds'];
// a nest's decision part-way through can only be one the nest led to: eggs looked at one by one with the
// parent away (gone to feed, or waited out), the last one a dud, or duds left after a calm look
function nestPhaseFits(s, p) {
  const pe = p.pending, w = W(s), v = nestView(s, p, pe.idx);
  if (!v) return false;
  const c = clutchOf(w.seed, p.leg.n, pe.idx, v.species), duds = c.fertile.filter(f => !f).length;
  if (pe.looked > c.size) return false;
  const away = v.state === 'empty';
  if (pe.phase === 'empty') return away && pe.looked < c.size;
  if (pe.phase === 'dud') return away && pe.looked > 0 && !c.fertile[pe.looked - 1];
  return !['colony', 'hatched'].includes(v.state) && pe.duds <= duds;
}
// keeps the parties of a loaded world inside the rules whatever produced them: real explorers each out
// once, legs along the real way and never quicker than it takes, carried things that exist. A trip
// from before journeys becomes a leg from the nest to its hex.
export function cleanParties(s, w) {
  const ids = new Set([PLAYER_ID, ...s.hatched.map(b => b.id)]), seen = new Set();
  const land = k => { const h = parseKey(k); return !!h && inWorld(h) && (k === HOME || !isWater(w.seed, h)); };
  const num = (x, lo = 0) => Math.max(lo, Number(x) || 0);
  const int = (x, lo = 0) => Math.floor(num(x, lo));
  const UNITS = ['dino', 'player', 'pack'];
  const [, geneMax] = EGG_GENES(EGG_STEP, true);
  const out = [];
  for (const e of Array.isArray(w.expeditions) ? w.expeditions : []) {
    // (one flown home by air takes no team's place)
    if (!e || typeof e !== 'object' || (e.air !== true && out.filter(x => !x.air).length >= EXPEDITION_SLOTS)) continue;
    const team = (Array.isArray(e.team) ? e.team : e.babyId ? [{ kind: e.babyId === PLAYER_ID ? 'player' : 'dino', id: e.babyId, members: [e.babyId] }] : [])
      .filter(u => u && UNITS.includes(u.kind))
      .map(u => ({ kind: u.kind, id: String(u.id), members: (Array.isArray(u.members) ? u.members : [u.id]).filter(id => ids.has(id) && !seen.has(id) && seen.add(id)) }))
      .filter(u => u.members.length)
      .slice(0, TEAM_SLOTS);
    if (!team.length) continue;
    const members = team.flatMap(u => u.members);
    const old = !('at' in e);
    const at = old ? HOME : String(e.at);
    const L = old ? { n: e.trip, from: HOME, to: e.hex, startedAt: e.startedAt } : e.leg;
    let leg = null;
    if (L && typeof L === 'object') {
      const from = String(L.from), to = String(L.to);
      if (!land(from) || !land(to) || from === to || from !== at) continue;
      const air = L.air === true && to === HOME;
      const train = !air && L.train === true && trainRoute(w.seed, from, to);
      const rocket = !air && !train && L.rocket === true && isStation(w.seed, from) && isStation(w.seed, to);
      const via = train || air || rocket ? [] : cleanVia(s, L.via);
      const path = air ? airPath(from) : train ? train.path : rocket ? [to] : routePath(w.seed, from, to, via);
      if (!path.length) continue;
      const startedAt = num(L.startedAt), recalled = !train && !rocket && L.recalled === true;
      leg = {
        n: int(L.n, 1), from, to, path, step: Math.min(path.length, int(L.step)), startedAt,
        arriveAt: recalled ? Math.max(num(L.arriveAt), startedAt) : Math.max(num(L.arriveAt), startedAt + (air ? flightMins(from) : train ? trainMins(train.hexes, train.stops.length) : rocket ? ROCKET.mins[0] : legMins(s, members, from, to, via)) * 60000),
        ...(air ? { air: true } : {}),
        ...(recalled ? { recalled } : {}), ...(recalled && Number.isFinite(L.fly) ? { fly: int(L.fly) } : {}), ...(train ? { train: true } : {}), ...(rocket ? { rocket: true } : {}), ...(Number.isFinite(L.boardedAt) ? { boardedAt: num(L.boardedAt) } : {}), ...(via.length && !recalled ? { via } : {}),
        // (standing where a decision waits for the player, since then)
        ...(e.pending && Number.isFinite(L.pausedAt) ? { pausedAt: num(L.pausedAt) } : {}),
      };
    }
    // a party with nowhere to go is one at home: it broke up
    if (!land(at) || (!leg && at === HOME)) continue;
    const pe = leg && e.pending && typeof e.pending === 'object' ? e.pending : null;
    const pidx = pe ? Math.floor(Number(pe.idx)) : -1;
    let pending = pe && PENDING.includes(pe.kind) && pidx >= 0 && pidx < leg.step ? { kind: pe.kind, idx: pidx, hex: leg.path[pidx] } : null;
    if (pending && pending.kind === 'nest' && NEST_PHASES.includes(pe.phase)) pending = { ...pending, phase: pe.phase, looked: int(pe.looked), looks: int(pe.looks), step: int(pe.step, 1), ...(pe.phase === 'duds' ? { duds: int(pe.duds, 1) } : {}) };
    if (pending && pending.kind === 'airlift') {
      const ids = (Array.isArray(pe.ids) ? pe.ids : []).filter(id => id !== PLAYER_ID && members.includes(id));
      pending = ids.length ? { ...pending, ids } : null;
    }
    const health = {};
    for (const id of members) if (e.health && e.health[id] != null) health[id] = Math.max(0, Math.min(1, Number(e.health[id]) || 0));
    const inParty = list => [...new Set((Array.isArray(list) ? list : []).filter(id => members.includes(id)))];
    const c = e.carry && typeof e.carry === 'object' ? e.carry : {};
    const items = {};
    for (const [id, n] of Object.entries(c.items && typeof c.items === 'object' ? c.items : {})) if (ITEMS[id] && int(n) > 0) items[id] = int(n);
    const eggs = (Array.isArray(c.eggs) ? c.eggs : []).filter(g => g && SPECIES[g.type]).slice(0, 3).map(g => ({
      id: String(g.id), type: g.type, sex: eggSex(g), gen: 1, parents: [], laidAt: num(g.laidAt), ...(g.unseen === true ? { unseen: true, ...(g.dud === true ? { dud: true } : {}) } : {}),
      genes: Object.fromEntries(STATS.map(({ id }) => [id, Math.min(geneMax, int(g.genes && g.genes[id]))])),
    }));
    const level = src => Object.fromEntries(members.filter(id => src && src[id] != null).map(id => [id, Math.max(0, Math.min(1, Number(src[id]) || 0))]));
    const sp = e.supplies && typeof e.supplies === 'object' ? e.supplies : {};
    const skins = Math.min(SURVIVAL.pack.water_skin, int(sp.water_skin));
    const supplies = { water_skin: skins, ration: Math.min(SURVIVAL.pack.ration, int(sp.ration)), water: Math.min(skins * SURVIVAL.skin, int(sp.water)),
      herb: Math.min(SURVIVAL.pack.herb, int(sp.herb)), transfusion: Math.min(SURVIVAL.pack.transfusion, int(sp.transfusion)) };
    out.push({
      id: String(e.id), team, members, at, leg, ...(e.air === true && leg && leg.air ? { air: true } : {}), health, hunger: level(e.hunger), thirst: level(e.thirst), supplies,
      gathered: Object.fromEntries(Object.entries(e.gathered && typeof e.gathered === 'object' ? e.gathered : {}).filter(([id, n]) => ITEMS[id] && int(n) > 0).map(([id, n]) => [id, int(n)])),
      camp: !leg && e.camp && typeof e.camp === 'object' && at !== HOME ? { startedAt: num(e.camp.startedAt), endsAt: Math.max(num(e.camp.endsAt), num(e.camp.startedAt)) } : null, down: inParty(e.down), hurt: inParty(e.hurt), offered: inParty(e.offered), ...(inParty(e.gored).length ? { gored: inParty(e.gored) } : {}), ...(Array.isArray(e.news) && e.news.length ? { news: e.news.filter(x => x && typeof x.id === 'string').map(x => ({ id: x.id, name: String(x.name || '?'), walk: Math.max(0, Math.floor(Number(x.walk) || 0)) })) } : {}),
      dead: (Array.isArray(e.dead) ? e.dead : []).filter(d => d && typeof d === 'object').slice(0, 12).map(d => ({ id: String(d.id), name: String(d.name || '').slice(0, 24), type: SPECIES[d.type] ? d.type : null })),
      carry: { items, coins: int(c.coins), eggs }, pending,
      hex: leg ? leg.to : at, trip: leg ? leg.n : int(e.trip, 1), startedAt: leg ? leg.startedAt : num(e.startedAt), returnAt: leg ? leg.arriveAt : num(e.returnAt),
    });
    const q = out[out.length - 1];
    if (pending && pending.phase && !nestPhaseFits(s, q)) q.pending = { kind: 'nest', idx: pending.idx, hex: pending.hex };
  }
  return out;
}
