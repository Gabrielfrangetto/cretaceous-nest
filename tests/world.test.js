import { test } from 'node:test';
import { collect } from './journey-helper.js';
import { legMins, HOME, partyOf, stopOf, progressOf, airliftFare, careOf, hospitalHours, flightMins, trainMins } from '../js/journey.js';
import assert from 'node:assert/strict';
import { applyAction, countItem, feedBaby, breedProblem, bill, earn, addItem } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import {
  ALL_HEXES, biomeAt, hexDist, hexKey, newWorld, canReach, exploreProblem, tripMins, lootTable, isAway, isWater, cellAt, travelCost, travelPath, landHexes, threatAt, parseKey,
} from '../js/world.js';
import { MAP, WORLD_SEED, BIOMES, EXPEDITION_SLOTS, AGES, NEST_CALM, NEST_FAR, SPECIES, CLOCK, UNIT_HOURS, TRAVEL, CAPSULES, RESCUE, AIRLIFT, TRIP_CARE, SURVIVAL, MAGLEV, ROCKET } from '../js/config.js';

const T0 = 1_000_000_000_000;
// (fed as in meals before growth capsules: 10 a juvenile, 30 an adult)
const grown = (fed, type) => fed >= 30 ? CAPSULES[type].adult : fed >= 10 ? CAPSULES[type].juvenile : fed;
const dino = (id, fed, sex = 'm', type = 'rex') => ({ id, type, sex, name: id, at: 0, gen: 1, fed: grown(fed, type), lastFed: T0, genes: { str: 50, agi: 50, vit: 50, res: 50 }, equip: {} });
function game(...babies) {
  const s = freshState();
  s.world = newWorld(42);
  s.hatched.push(...babies);
  return s;
}

test('the map is a supercontinent around the nest, the same for the same seed', () => {
  assert.equal(ALL_HEXES.length, MAP.cols * MAP.rows);
  assert.deepEqual(ALL_HEXES[0], [0, 0]);
  const a = ALL_HEXES.map(h => biomeAt(42, h)), b = ALL_HEXES.map(h => biomeAt(42, h));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, ALL_HEXES.map(h => biomeAt(43, h)));
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const land = landHexes(seed);
    // about the share of land asked for, all of it one continent the nest can reach, sea at the edges
    assert.ok(Math.abs(land.length / ALL_HEXES.length - MAP.land) < 0.06, `seed ${seed}: ${land.length}`);
    for (const h of land) assert.ok(travelCost(seed, h) < Infinity);
    assert.equal(isWater(seed, [-MAP.west - Math.floor(-MAP.north / 2), -MAP.north]), true);
  }
});

test("every map has every biome, a calm meadow around the nest, rivers and lakes, and a planet's climate", () => {
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const land = landHexes(seed);
    const seen = new Set(land.map(h => biomeAt(seed, h)));
    assert.deepEqual([...seen].sort(), Object.keys(BIOMES).sort(), 'seed ' + seed);
    for (const h of land) {
      if (hexDist(h) <= MAP.calm) { assert.equal(biomeAt(seed, h), 'meadow'); assert.equal(cellAt(seed, h).terrain, 'flat'); }
      if (biomeAt(seed, h) === 'volcano') assert.ok(hexDist(h) > MAP.calm + 3);
    }
    const cells = ALL_HEXES.map(h => cellAt(seed, h));
    assert.ok(cells.some(c => c.river) && cells.some(c => c.terrain === 'lake') && cells.some(c => c.terrain === 'mountain'));
    // where the United States would be on Earth, with its climate: hot in the south, cool in the north,
    // the subtropical forest in the warm south
    assert.ok(cells.every(c => c.lat >= MAP.lat[1] && c.lat <= MAP.lat[0]));
    const heat = band => { const c = cells.filter(c => c.terrain !== 'ocean' && band(c.lat)); return c.reduce((t, x) => t + x.heat, 0) / c.length; };
    assert.ok(heat(a => a < 30) > heat(a => a > 45) + 0.3, 'seed ' + seed);
    const sub = cells.filter(c => c.biome === 'subtropical');
    assert.ok(sub.reduce((t, c) => t + c.lat, 0) / sub.length < 32, 'seed ' + seed);
  }
});

test('rivers run on from hex to hex, down to the sea, a lake or a bigger river, wider as they go', () => {
  const STEPS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  let joined = 0, mouths = 0;
  for (const h of ALL_HEXES) {
    const c = cellAt(WORLD_SEED, h);
    if (!c.river) continue;
    assert.ok(c.flow >= 1);
    if (c.down < 0) continue;
    const n = cellAt(WORLD_SEED, [h[0] + STEPS[c.down][0], h[1] + STEPS[c.down][1]]);
    if (n.river) { joined++; assert.ok(n.flow > c.flow, 'wider downstream'); }
    else if (n.terrain === 'ocean' || n.terrain === 'lake') mouths++;
  }
  assert.ok(joined > 500 && mouths > 20, JSON.stringify({ joined, mouths }));
});

test('the sea is only open water reaching the edges; lakes fill hollows, fed by rivers, and most overflow into one', async () => {
  const { mapNeighbors } = await import('../js/map.js');
  const water = k => ALL_HEXES.filter(h => cellAt(WORLD_SEED, h).terrain === k);
  const groups = kind => {
    const left = new Set(water(kind).map(h => hexKey(...h))), out = [];
    while (left.size) {
      const first = left.values().next().value, queue = [parseKey(first)], g = [];
      left.delete(first);
      while (queue.length) { const h = queue.pop(); g.push(h); for (const n of mapNeighbors(h)) if (left.delete(hexKey(...n))) queue.push(n); }
      out.push(g);
    }
    return out;
  };
  // no sea shut inside the land: all of it open water reaching the map's edges (the land runs on past
  // the top edge, into the uncharted north, so a bay may join the rest only beyond it)
  const { inMap } = await import('../js/map.js');
  for (const g of groups('ocean')) assert.ok(g.some(h => mapNeighbors(h).length < 6 || !inMap([h[0], h[1] - 1])), 'a sea inland');
  const lakes = groups('lake');
  assert.ok(lakes.length > 20);
  for (const g of lakes) assert.ok(g.length >= 2, 'no lake of a single hex');
  // rivers flow out of lakes too
  assert.ok(ALL_HEXES.filter(h => cellAt(WORLD_SEED, h).from >= 0).length > 10);
});

test("the other colonists' settlements: far apart and from the nest, each in a calm of ferns where no predator hunts, a place a team can stop at", async () => {
  const { citiesOf, cityAt, nearOf } = await import('../js/world.js');
  const cities = citiesOf(WORLD_SEED);
  assert.equal(cities.length, MAP.cities);
  assert.equal(new Set(cities.map(c => c.name)).size, cities.length);
  for (const c of cities) {
    assert.ok(hexDist(c.h) >= MAP.cityFromNest, c.name);
    for (const o of cities) if (o !== c) assert.ok(hexDist([c.h[0] - o.h[0], c.h[1] - o.h[1]]) >= MAP.citySpacing);
    assert.equal(cityAt(WORLD_SEED, c.h), c.name);
    assert.equal(travelCost(WORLD_SEED, c.h) < Infinity, true);
    for (const h of landHexes(WORLD_SEED).filter(h => hexDist([h[0] - c.h[0], h[1] - c.h[1]]) <= MAP.calm)) {
      assert.equal(biomeAt(WORLD_SEED, h), 'meadow');
      assert.ok(nearOf(WORLD_SEED, h) <= MAP.calm);
      const th = threatAt(WORLD_SEED, h);
      assert.equal(th.lair, false);
      assert.notEqual(th.entry.species && SPECIES[th.entry.species].role, 'attacker');
    }
  }
  const s = game(dino('ad', 30));
  s.world = newWorld();
  assert.equal(exploreProblem(s, 'ad', hexKey(...cities[0].h), T0), null);
});

test('an open world: what lives around the nest is known, and any land can be explored, by the easiest way', () => {
  const s = game();
  assert.equal(s.world.revealed.length, 7);
  assert.equal(canReach(s, '0,0'), false);
  assert.equal(canReach(s, '2,0'), true);
  // however far: the danger is the player's to weigh
  const far = landHexes(42).at(-1);
  assert.equal(canReach(s, hexKey(...far)), true);
  assert.equal(canReach(s, '400,0'), false);
  // a trip takes as long as the way there is hard: farther, longer
  assert.ok(tripMins('1,0', 42) >= 1 && tripMins('3,0', 42) > tripMins('1,0', 42));
  // open water: no one goes there
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  s.hatched.push(dino('ad', 30));
  const sea = ALL_HEXES.find(h => isWater(42, h));
  assert.equal(exploreProblem(s, 'ad', hexKey(...sea), T0), 'water');
  assert.equal(canReach(s, hexKey(...sea)), false);
});

test('who can explore: juveniles and adults anywhere, never babies, hungry or busy ones', () => {
  const s = game(dino('baby', 0), dino('juv', 10), dino('ad', 30), dino('ad2', 30, 'f'), dino('ad3', 30));
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  const far = hexKey(...landHexes(42).at(-1));
  assert.equal(exploreProblem(s, 'baby', '1,0', T0), 'too-young');
  assert.equal(exploreProblem(s, 'juv', far, T0), null);
  assert.equal(exploreProblem(s, 'juv', '1,0', T0), null);
  assert.equal(exploreProblem(s, 'ad', far, T0), null);
  assert.equal(exploreProblem(s, 'ad', '0,0', T0), 'home');
  assert.equal(exploreProblem(s, 'ad', '400,0', T0), 'out-of-map');
  // (the keepers feed the dinosaurs at home: none is ever too hungry to go)
  assert.equal(exploreProblem(s, 'ad', '1,0', T0 + 60 * 60000), null);
  s.breeding = { type: 'rex', maleId: 'ad', femaleId: 'ad2', startedAt: T0, readyAt: T0 + 1 };
  assert.equal(exploreProblem(s, 'ad', '1,0', T0), 'breeding');
  s.breeding = null;
  assert.equal(applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0).ok, true);
  assert.equal(exploreProblem(s, 'ad', '1,0', T0), 'away');
  assert.equal(EXPEDITION_SLOTS, 2);
  assert.equal(applyAction(s, 'explore', { babyId: 'ad2', hex: '1,0' }, T0).ok, true);
  assert.equal(exploreProblem(s, 'ad3', '1,0', T0), 'no-slot');
});

test('a dinosaur away can\'t be paired', () => {
  const s = game(dino('ad', 30), dino('ad2', 30, 'f'));
  applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0);
  assert.equal(isAway(s, 'ad'), true);
  assert.equal(breedProblem(s, 'ad', 'ad2'), 'away');
});

test('a journey: out to a hex where the party waits, everything carried until it comes home', () => {
  const s = game(dino('ad', 30));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: '2,0' }, T0);
  const id = r.expedition.id;
  assert.equal(applyAction(s, 'journey', { id }, T0 + 1000).reason, 'not-back');
  // a leg is half a trip there and back
  const there = T0 + legMins(s, ['ad'], '0,0', '2,0') * 60000;
  assert.equal(r.expedition.returnAt, there);
  assert.ok(legMins(s, ['ad'], '0,0', '3,0') > legMins(s, ['ad'], '0,0', '1,0'));
  const before = s.coins, leaves = countItem(s, 'leaf');
  const out = applyAction(s, 'journey', { id }, there);
  assert.equal(out.ok, true);
  assert.equal(out.pending, null);
  const arrived = out.story.find(e => e.kind === 'arrived');
  assert.equal(arrived.discovered, true);
  // (exploring pays no coins: they come from what is sold)
  assert.equal(arrived.coins, undefined);
  assert.ok(arrived.found.length > 0);
  for (const { id: item, n } of arrived.found) assert.ok(n >= 1 && BIOMES[arrived.biome].loot.some(l => l[0] === item));
  // it waits there, carrying what it found; nothing is home yet
  const p = s.world.expeditions[0];
  assert.equal(p.at, '2,0');
  assert.equal(p.leg, null);
  assert.equal(p.carry.coins, 0);
  assert.equal(s.coins, before);
  assert.equal(countItem(s, 'leaf'), leaves);
  assert.equal(isAway(s, 'ad'), true);
  assert.ok(s.world.revealed.includes('3,0'));
  assert.equal(applyAction(s, 'journey', { id }, there).reason, 'waiting');
  // sent on to another hex, then home
  assert.equal(applyAction(s, 'order', { id, hex: '2,0' }, there).reason, 'there');
  assert.equal(applyAction(s, 'order', { id, hex: '3,0' }, there).ok, true);
  assert.equal(applyAction(s, 'order', { id, hex: '0,0' }, there).reason, 'on-the-way');
  const t2 = p.leg.arriveAt;
  assert.equal(t2, there + legMins(s, ['ad'], '2,0', '3,0') * 60000);
  applyAction(s, 'journey', { id }, t2);
  assert.equal(p.at, '3,0');
  assert.equal(applyAction(s, 'order', { id, hex: '0,0' }, t2).ok, true);
  const t3 = p.leg.arriveAt;
  let home = null;
  for (let i = 0; i < 20 && !home; i++) {
    const step = applyAction(s, 'journey', { id }, t3);
    home = step.story.find(e => e.kind === 'home');
  }
  assert.ok(home);
  assert.equal(s.world.expeditions.length, 0);
  assert.equal(s.coins, before + home.coins);
  if (home.loot.some(l => l.id === 'leaf')) assert.ok(countItem(s, 'leaf') > leaves);
  // (fed by the keepers at home: a journey leaves a dinosaur's growth capsules as they were)
  assert.equal(s.hatched[0].lastFed, T0);
  // a second visit is no discovery
  const again = applyAction(s, 'explore', { babyId: 'ad', hex: '2,0' }, t3);
  const second = collect(s, { id: again.expedition.id }, again.expedition.returnAt);
  assert.equal(second.story.find(e => e.kind === 'arrived').discovered, false);
});

test('after something on the way out the player may go on or turn back; the way back has its dangers too', () => {
  const far = hexKey(...landHexes(42).filter(h => threatAt(42, h).id === 'rex').at(-1));
  let turned = 0;
  for (let trip = 0; trip < 40 && !turned; trip++) {
    const s = game(dino('p', 60, 'proto'));
    s.world.trips = trip;
    const r = applyAction(s, 'explore', { babyId: 'p', hex: far }, T0);
    const id = r.expedition.id, leg = { ...r.expedition.leg };
    let step = applyAction(s, 'journey', { id }, leg.arriveAt);
    // answer anything but the choice to go on (leave it be, fight what stands)
    while (step.pending && step.pending.kind !== 'go-on') step = applyAction(s, 'journey', { id, fight: true }, leg.arriveAt);
    if (!step.pending || !s.hatched.length) continue;
    assert.ok(step.pending.idx < leg.path.length - 1);
    const at = step.pending.hex;
    const back = applyAction(s, 'journey', { id, back: true }, leg.arriveAt);
    assert.ok(back.story.some(e => e.kind === 'turned' && e.hex === at));
    const p = s.world.expeditions[0];
    if (p) {
      // heading home from where it turned, from when it was there: the way went on meanwhile
      assert.equal(p.leg.from, at);
      assert.equal(p.leg.to, '0,0');
      assert.ok(p.leg.startedAt < leg.arriveAt && p.leg.startedAt > leg.startedAt);
    }
    turned++;
  }
  assert.ok(turned);
});

test('calling a party back: from its way out it turns home from where it is by now', () => {
  const far = hexKey(...landHexes(42).filter(h => hexDist(h) > 12).at(-1));
  const s = game(dino('ad', 30));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: far }, T0);
  const leg = { ...r.expedition.leg, path: [...r.expedition.leg.path] };
  // (before anything on the way stops it for the player)
  const stop = stopOf(s, s.world.expeditions[0]);
  const half = Math.min(Math.round((leg.startedAt + leg.arriveAt) / 2), stop ? stop.at - 1 : Infinity);
  assert.equal(applyAction(s, 'recall', { id: r.expedition.id }, half).ok, true);
  const p = s.world.expeditions[0];
  assert.ok(p.leg.recalled && p.leg.path.length < leg.path.length && p.leg.arriveAt === half);
  assert.equal(applyAction(s, 'recall', { id: r.expedition.id }, half).reason, 'homeward');
  // one called back before it left is simply home, with nothing
  const s2 = game(dino('ad', 30));
  const r2 = applyAction(s2, 'explore', { babyId: 'ad', hex: far }, T0);
  assert.equal(applyAction(s2, 'recall', { id: r2.expedition.id }, T0).ok, true);
  assert.equal(isAway(s2, 'ad'), false);
  assert.equal(s2.world.revealed.length, 7);
});

test('wounds carry from one fight to the next: one down is carried and does not fight', async () => {
  const { teamFight, unitOf, fighterOf, encounterUnit } = await import('../js/combat.js');
  const { seededRand } = await import('../js/economy.js');
  const me = () => unitOf('d', [fighterOf(dino('d', 30))]);
  const foe = encounterUnit({ species: 'raptor', pack: [2, 2], loot: [] }, 6);
  const full = teamFight([me()], foe, seededRand('w'));
  const hurt = teamFight([me()], foe, seededRand('w'), { hp: [[0.2]] });
  assert.equal(full.teamHps[0][0], hurt.teamHps[0][0]);
  assert.ok(hurt.teamLeft <= full.teamLeft);
  const { standingUnits } = await import('../js/journey.js');
  const s = game(dino('a', 30), dino('b', 30));
  const p = { team: [{ kind: 'dino', id: 'a', members: ['a'] }, { kind: 'dino', id: 'b', members: ['b'] }], down: ['b'] };
  assert.deepEqual(standingUnits(s, p).map(u => u.id), ['a']);
});

test('the same journey is told the same in the browser and on the server', () => {
  const far = hexKey(...landHexes(42).filter(h => hexDist(h) > 8)[5]);
  const a = game(dino('ad', 30)), b = game(dino('ad', 30));
  const tell = s => {
    const r = applyAction(s, 'explore', { babyId: 'ad', hex: far }, T0);
    return collect(s, { id: r.expedition.id, fight: true }, r.expedition.returnAt).story;
  };
  assert.deepEqual(tell(a), tell(b));
});

test("what lives in a hex is of an age: young, old, adult or in its prime (a lair's the strongest); no predators near the nest", () => {
  const land = landHexes(42);
  const ages = new Set(land.map(h => threatAt(42, h).age));
  for (const a of [...Object.keys(AGES), 'lair']) assert.ok(ages.has(a), a);
  const power = age => { const t = land.map(h => threatAt(42, h)).filter(t => t.age === age); return t.reduce((x, y) => x + y.power / y.foe.members.length, 0) / t.length; };
  assert.ok(power('prime') > power('adult') && power('adult') > power('young'));
  // no big predator nearer than NEST_FAR: a newcomer doesn't run into a Tyrannosaurus by chance
  for (const h of land) if (hexDist(h) <= NEST_FAR) {
    const t = threatAt(42, h), size = t.foe.members[0].size;
    if ((t.foe.members[0].role || 'attacker') === 'attacker') assert.ok(['tiny', 'small', 'medium'].includes(size), `${t.foe.name} at ${hexDist(h)}`);
  }
  for (const h of land) if (hexDist(h) <= NEST_CALM) {
    const t = threatAt(42, h);
    assert.notEqual(t.entry.species && SPECIES[t.entry.species].role, 'attacker');
    assert.equal(t.lair, false);
  }
  // the hex's own loot no longer grows with distance
  const s = game();
  const meadows = land.filter(h => biomeAt(42, h) === 'meadow');
  assert.deepEqual(lootTable(s, hexKey(...meadows[0])), lootTable(s, hexKey(...meadows.at(-1))));
});

test("everyone explores the same continent: older saves and saves on another one start over on it, and loaded worlds are cleaned", () => {
  const old = freshState();
  delete old.world;
  old.saveVersion = 7;
  old.hatched.push(dino('ad', 30));
  const a = migrate(old);
  assert.equal(a.saveVersion, SAVE_VERSION);
  assert.equal(a.world.seed, WORLD_SEED);
  assert.equal(a.world.revealed.length, 7);
  assert.equal(freshState().world.seed, WORLD_SEED);
  // a world on another continent, or an older map, is everyone's continent unexplored
  const other = game(dino('ad', 30));
  other.world.revealed.push('3,0');
  other.world.trips = 9;
  const moved = migrate(other).world;
  assert.deepEqual([moved.seed, moved.revealed.length, moved.trips], [WORLD_SEED, 7, 9]);

  const s = game(dino('ad', 30));
  s.world = newWorld();
  s.world.revealed.push('999,999', 'junk');
  s.world.expeditions.push({ id: 'x', babyId: 'ghost', hex: '1,0', trip: 1, startedAt: T0, returnAt: T0 });
  s.world.expeditions.push({ id: 'y', babyId: 'ad', hex: '3,0', trip: 1, startedAt: T0, returnAt: T0 });
  const clean = migrate(s);
  assert.ok(!clean.world.revealed.includes('999,999') && !clean.world.revealed.includes('junk'));
  assert.equal(clean.world.expeditions.length, 1);
  // a trip from before journeys is a leg from the nest, never shorter than it really is
  const p = clean.world.expeditions[0];
  assert.deepEqual([p.at, p.leg.from, p.leg.to, p.leg.step], ['0,0', '0,0', '3,0', 0]);
  assert.equal(p.leg.arriveAt, T0 + legMins(clean, ['ad'], '0,0', '3,0') * 60000);
  assert.deepEqual(p.leg.path, travelPath(WORLD_SEED, [3, 0]).map(h => hexKey(...h)));
  // what a party carries must exist, and its decision belongs to its leg
  s.world = clean.world;
  Object.assign(p, { carry: { items: { leaf: 3, junk: 9 }, coins: -5, eggs: [{ type: 'nope' }] }, pending: { kind: 'go-on', idx: 5 }, health: { ad: 7 } });
  const again = migrate(s).world.expeditions[0];
  assert.deepEqual(again.carry, { items: { leaf: 3 }, coins: 0, eggs: [] });
  assert.equal(again.pending, null);
  assert.equal(again.health.ad, 1);
});

test('a guest game brought into an account loses trips in progress', () => {
  const s = game(dino('ad', 30));
  s.world = newWorld();
  applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0);
  assert.equal(migrate(s).world.expeditions.length, 1);
  assert.equal(capGuestSave(migrate(s), T0).world.expeditions.length, 0);
});

test('in the thick Subtropical Forest a predator gets close unseen: harder to see coming, harder to outrun', async () => {
  const { catchChance } = await import('../js/world.js');
  const foe = { members: [{ agi: 80, size: 'large' }] }, prey = { agi: 60, size: 'medium' };
  assert.ok(BIOMES.subtropical.ambush && !BIOMES.forest.ambush);
  assert.ok(catchChance(foe, prey, 'subtropical') > catchChance(foe, prey, 'forest'));
  assert.equal(catchChance(foe, prey, 'forest'), catchChance(foe, prey));
});

test('the uncharted north: the continent runs on past the top of the map, colder, but nobody goes there', async () => {
  const { wildsAt, WILDS_HEXES, inMap, inWilds } = await import('../js/map.js');
  const cells = WILDS_HEXES.map(h => wildsAt(WORLD_SEED, h));
  assert.ok(WILDS_HEXES.every(h => !inMap(h) && inWilds(h) && cellAt(WORLD_SEED, h) === null));
  assert.ok(cells.every(c => c.wilds && c.lat > MAP.lat[0]));
  const land = cells.filter(c => c.biome);
  assert.ok(land.length > cells.length * 0.3);
  assert.ok(land.some(c => c.biome === 'taiga') && land.some(c => c.biome === 'tundra'));
  assert.ok(cells.some(c => c.terrain === 'lake'));
});

test("the land's own dangers: a storm costs a leg its time, the heat wears someone down but never brings them down", async () => {
  const { hazardsOf, partyOf } = await import('../js/journey.js');
  const { HAZARD_FLOOR, NEST_CALM: CALM } = await import('../js/config.js');
  const { nearOf } = await import('../js/world.js');
  const SEED = 42;
  const far = landHexes(SEED).filter(h => biomeAt(SEED, h) === 'desert').sort((a, b) => hexDist(a) - hexDist(b));
  // none in the calm around a settlement, never more than two on a leg, the same every time
  for (const h of far.slice(0, 20)) {
    const path = travelPath(SEED, h).map(x => hexKey(...x));
    for (let n = 1; n < 40; n++) {
      const z = hazardsOf(SEED, n, path);
      assert.ok(z.length <= 2);
      assert.deepEqual(z, hazardsOf(SEED, n, path));
      for (const x of z) assert.ok(nearOf(SEED, parseKey(path[x.idx])) > CALM);
    }
  }
  // a leg that meets a sandstorm, and one that meets the heat
  const find = kind => {
    for (const h of far) {
      const path = travelPath(SEED, h).map(x => hexKey(...x));
      for (let n = 1; n < 300; n++) { const z = hazardsOf(SEED, n, path); if (z.some(x => x.kind === kind)) return { key: hexKey(...h), n, z }; }
    }
    return null;
  };
  const storm = find('sandstorm');
  assert.ok(storm);
  let s = game(dino('ad', 30));
  s.world.trips = storm.n - 1;
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: storm.key }, T0);
  const lost = storm.z.reduce((t, x) => t + x.mins, 0);
  assert.ok(lost > 0);
  assert.equal(r.expedition.leg.arriveAt, T0 + (legMins(s, ['ad'], '0,0', storm.key) + lost) * 60000);
  const told = collect(s, { id: r.expedition.id, flee: true }, r.expedition.leg.arriveAt).story.find(e => e.kind === 'hazard' && e.hazard === 'sandstorm');
  assert.ok(told && told.mins > 0 && told.biome === 'desert');
  const heat = find('heat');
  assert.ok(heat);
  s = game(dino('ad', 30));
  s.world.trips = heat.n - 1;
  const r2 = applyAction(s, 'explore', { babyId: 'ad', hex: heat.key }, T0);
  const id = r2.expedition.id, at = r2.expedition.leg.arriveAt;
  let hurt = null;
  for (let i = 0; i < 100 && !hurt; i++) {
    const step = applyAction(s, 'journey', { id, flee: true }, at);
    if (!step.ok) break;
    hurt = step.story.find(e => e.kind === 'hazard' && e.hazard === 'heat');
    if (!step.pending) break;
  }
  // (a fight on the way may have come first and ended the journey early)
  if (hurt) {
    const p = partyOf(s, id);
    assert.equal(hurt.who.id, 'ad');
    assert.ok(p.health.ad >= Math.min(HAZARD_FLOOR, 1) - 1e-9 && p.health.ad < 1);
    assert.ok(!p.down.includes('ad'));
  }
});

test('hunger and thirst on a journey: flasks packed and brought back, fresh water, and the end of one\'s strength', async () => {
  const { partyOf, freshWater, levelOf } = await import('../js/journey.js');
  const { SURVIVAL, PLAYER_ID: ME } = await import('../js/config.js');
  const { addItem: give } = await import('../js/economy.js');
  // a hex whose way out crosses dry land (dryAt: the first dry hex of it)
  const dryStart = landHexes(42).filter(h => hexDist(h) >= 6 && hexDist(h) <= 20).map(h => hexKey(...h))
    .find(k => travelPath(42, parseKey(k)).some(h => !freshWater(42, h)));
  assert.ok(dryStart);
  const dryAt = travelPath(42, parseKey(dryStart)).findIndex(h => !freshWater(42, h));
  // the team packs what it can carry of flasks and rations, and brings back what is left
  let s = game(dino('ad', 30));
  give(s, 'water_skin', 5 - countItem(s, 'water_skin')); give(s, 'ration', 5);
  let r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }, { kind: 'player', id: ME }], hex: dryStart }, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(countItem(s, 'water_skin'), 5 - SURVIVAL.pack.water_skin);
  assert.equal(countItem(s, 'ration'), 5 - SURVIVAL.pack.ration);
  assert.deepEqual(r.expedition.supplies, { water_skin: 3, ration: 3, water: 3 * SURVIVAL.skin, herb: 0, transfusion: 0 });
  collect(s, { id: r.expedition.id, flee: true }, r.expedition.leg.arriveAt);
  assert.equal(countItem(s, 'water_skin'), 5);
  assert.ok(countItem(s, 'ration') <= 5 && countItem(s, 'ration') >= 5 - SURVIVAL.pack.ration);
  // at the end of its strength, with nothing to drink, a dinosaur dies of thirst
  s = game(dino('ad', 30));
  r = applyAction(s, 'explore', { babyId: 'ad', hex: dryStart }, T0);
  let p = partyOf(s, r.expedition.id);
  p.thirst = { ad: 1 }; p.health = { ad: 0.01 }; p.leg.step = dryAt; p.supplies.water = 0;
  let step = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.ok(step.story.some(e => e.kind === 'perished' && e.need === 'thirst' && e.who.id === 'ad'));
  assert.equal(s.hatched.length, 0);
  // the player collapses instead, and is flown home with the team and what it carries; the journey is
  // over, and the flight and the care are billed
  s = game(dino('ad', 30));
  s.coins = 80;
  r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }, { kind: 'player', id: ME }], hex: dryStart }, T0);
  p = partyOf(s, r.expedition.id);
  p.hunger = { [ME]: 1 }; p.health = { [ME]: 0.01 }; p.leg.step = dryAt;
  p.carry.items.bone = 3;
  const bones = countItem(s, 'bone');
  step = applyAction(s, 'journey', { id: p.id, flee: true }, p.leg.arriveAt);
  const kinds = step.story.map(e => e.kind);
  assert.ok(step.story.some(e => e.kind === 'collapse' && e.need === 'hunger'));
  assert.ok(kinds.indexOf('rescued') > kinds.indexOf('collapse') && kinds.indexOf('home') > kinds.indexOf('rescued'));
  const rescued = step.story.find(e => e.kind === 'rescued');
  // (a Tyrannosaurus and the player: 16 aircraft loads, at the hex's distance)
  assert.equal(rescued.fare, Math.ceil((8000 + 75) / AIRLIFT.load) * hexDist(parseKey(rescued.hex)) * AIRLIFT.perHex);
  assert.equal(rescued.care, RESCUE.coins);
  assert.equal(s.coins, 80);
  assert.equal(s.debt, rescued.fare + rescued.care);
  assert.equal(s.world.expeditions.length, 0);
  assert.equal(countItem(s, 'bone'), bones + 3);
  assert.ok(!isAway(s, 'ad') && !isAway(s, ME));
  // (it had landed by now: a quarter faster than the maglev, straight to the nest)
  assert.equal(flightMins(rescued.hex), Math.max(1, Math.round((2 + 0.05 * hexDist(parseKey(rescued.hex))) * AIRLIFT.pace)));
  // fresh water waters everyone and fills the flasks
  const wet = landHexes(42).map(h => hexKey(...h)).find(k => hexDist(parseKey(k)) <= 8 && travelPath(42, parseKey(k)).length && freshWater(42, travelPath(42, parseKey(k))[0]));
  if (wet) {
    s = game(dino('ad', 30));
    give(s, 'water_skin', 1);
    r = applyAction(s, 'explore', { babyId: 'ad', hex: wet }, T0);
    p = partyOf(s, r.expedition.id);
    p.thirst = { ad: 0.9 }; p.supplies.water = 0;
    applyAction(s, 'journey', { id: p.id, flee: true }, p.leg.arriveAt);
    if (partyOf(s, p.id)) assert.ok(levelOf(p, 'thirst', 'ad') < 0.9);
  }
});

test('at home the player never goes hungry: never kept from setting out, nothing to eat', async () => {
  const { PLAYER_ID: ME, PLAYER_DIET } = await import('../js/config.js');
  const s = game();
  s.player.lastFed = T0;
  const much = T0 + 30 * 24 * 3600000;
  assert.equal(exploreProblem(s, ME, '1,0', much), null);
  assert.equal(applyAction(s, 'feed', { id: ME }, much).reason, 'full');
  assert.ok(PLAYER_DIET.length);
});

test('the maglev: stations at the nest and every city, a ride for a fare, safe, fed and watered aboard', async () => {
  const { railsOf, trainRoute } = await import('../js/map.js');
  const { partyOf, trainTrip, cleanParties, levelOf } = await import('../js/journey.js');
  const { citiesOf } = await import('../js/world.js');
  const rails = railsOf(42), cities = citiesOf(42).map(c => c.key);
  assert.deepEqual(rails.stations, ['0,0', ...cities]);
  // every station reached from the nest, the lines over land, hex to hex
  for (const c of cities) {
    const r = trainRoute(42, '0,0', c);
    assert.ok(r && r.hexes > 0 && r.path.at(-1) === c && r.stops[0] === '0,0' && r.stops.at(-1) === c);
    for (const k of r.path) assert.equal(isWater(42, parseKey(k)), false);
  }
  for (const l of rails.lines) for (let i = 1; i < l.path.length; i++) assert.equal(hexDist([parseKey(l.path[i])[0] - parseKey(l.path[i - 1])[0], parseKey(l.path[i])[1] - parseKey(l.path[i - 1])[1]]), 1);
  assert.equal(trainRoute(42, '0,0', '1,0'), null);
  // a ride to a city: the fare paid, there soon, everyone fed and watered
  const s = game(dino('ad', 30));
  const city = cities[0], trip = trainTrip(s, ['ad'], '0,0', city, T0);
  s.coins = trip.fare - 1;
  assert.equal(applyAction(s, 'explore', { babyId: 'ad', hex: city, train: true }, T0).reason, 'coins');
  s.coins = trip.fare + 100;
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: city, train: true }, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.coins, 100);
  const p = partyOf(s, r.expedition.id);
  // (it waits at the station for the next train, then rides: much quicker than walking)
  assert.ok(p.leg.train && p.leg.startedAt === trip.departAt && trip.departAt >= T0 && trip.departAt - T0 < (MAGLEV.every + MAGLEV.late) * 60000 + MAGLEV.board * 1000);
  assert.equal(p.leg.arriveAt, trip.arriveAt);
  assert.ok(trip.mins < legMins(s, ['ad'], '0,0', city));
  assert.equal(applyAction(s, 'recall', { id: p.id }, T0 + 1000).reason, 'on-the-train');
  // (a saved game keeps the ride)
  const kept = cleanParties(s, s.world)[0];
  assert.ok(kept.leg.train && kept.leg.path.length === p.leg.path.length);
  p.thirst = { ad: 0.6 }; p.hunger = { ad: 0.6 };
  const step = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.deepEqual(step.story.map(e => e.kind), ['train']);
  assert.equal(p.at, city);
  assert.equal(levelOf(p, 'thirst', 'ad'), 0);
  assert.equal(levelOf(p, 'hunger', 'ad'), 0);
  // on from the city by train to another, then home
  s.coins = 10000;
  assert.equal(applyAction(s, 'order', { id: p.id, hex: cities[1], train: true }, p.leg ? p.leg.arriveAt : T0 + 1e7).ok, true);
  applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.equal(p.at, cities[1]);
  assert.equal(applyAction(s, 'order', { id: p.id, hex: '0,0', train: true }, p.leg ? 0 : T0 + 2e7).ok, true);
  const home = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.ok(home.story.some(e => e.kind === 'home'));
  assert.equal(s.world.expeditions.length, 0);
});

test('a route traced through waypoints: the team walks it stop by stop; along a river bank the river takes no crossing', async () => {
  const { routePath, partyOf, cleanParties } = await import('../js/journey.js');
  const { stepCost } = await import('../js/map.js');
  // a river crossed when stepped into, not along its bank
  const river = cellAt(42, landHexes(42).find(h => cellAt(42, h).river && cellAt(42, h).terrain === 'flat'));
  const dry = { terrain: 'flat', biome: river.biome, river: false };
  assert.equal(stepCost(river, dry), stepCost(river, river) + 1);
  // a route through two waypoints
  const land = landHexes(42).filter(h => hexDist(h) >= 4 && hexDist(h) <= 8).map(h => hexKey(...h));
  const [a, b, to] = [land[0], land[Math.floor(land.length / 2)], land.at(-1)];
  const path = routePath(42, '0,0', to, [a, b]);
  assert.ok(path.includes(a) && path.includes(b) && path.at(-1) === to);
  assert.ok(path.indexOf(a) < path.indexOf(b));
  for (let i = 1; i < path.length; i++) { const [p, q] = [parseKey(path[i - 1]), parseKey(path[i])]; assert.equal(hexDist([q[0] - p[0], q[1] - p[1]]), 1); }
  const s = game(dino('ad', 30));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: to, via: [a, b, 'nonsense', '9999,9999'] }, T0);
  assert.equal(r.ok, true, r.reason);
  const p = partyOf(s, r.expedition.id);
  assert.deepEqual(p.leg.via, [a, b]);
  assert.deepEqual(p.leg.path, path);
  assert.ok(p.leg.arriveAt - T0 >= legMins(s, ['ad'], '0,0', to) * 60000);
  assert.deepEqual(cleanParties(s, s.world)[0].leg.path, path);
});

test('making camp: water found where there is water to find, the hungry fed, everyone rested; nothing if broken early', async () => {
  const { partyOf, freshWater, levelOf } = await import('../js/journey.js');
  const { CAMP } = await import('../js/config.js');
  const wet = landHexes(42).map(h => hexKey(...h)).find(k => hexDist(parseKey(k)) >= 6 && hexDist(parseKey(k)) <= 12 && freshWater(42, parseKey(k)) && biomeAt(42, parseKey(k)) !== 'desert');
  const s = game(dino('ad', 30, 'm', 'hypsi'));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: wet }, T0);
  const p = partyOf(s, r.expedition.id);
  for (let i = 0; i < 50 && p.leg; i++) applyAction(s, 'journey', { id: p.id, flee: true }, p.leg.arriveAt);
  if (!partyOf(s, p.id) || p.at !== wet) return;
  const t = p.returnAt + 1000;
  assert.equal(applyAction(s, 'breakCamp', { id: p.id }, t).reason, 'no-camp');
  assert.equal(applyAction(s, 'camp', { id: p.id }, t).ok, true);
  assert.equal(applyAction(s, 'camp', { id: p.id }, t).reason, 'camping');
  assert.equal(applyAction(s, 'order', { id: p.id, hex: '0,0' }, t).reason, 'camping');
  // broken early: nothing found
  p.thirst = { ad: 0.6 }; p.hunger = { ad: 0.6 }; p.health = { ad: 0.5 };
  let c = applyAction(s, 'breakCamp', { id: p.id }, t + 1000);
  assert.equal(c.story[0].early, true);
  assert.equal(levelOf(p, 'thirst', 'ad'), 0.6);
  // a full camp by fresh water: watered, a plant eater fed on green land, rested
  applyAction(s, 'camp', { id: p.id }, t);
  c = applyAction(s, 'breakCamp', { id: p.id }, t + CAMP.mins * 60000);
  assert.equal(c.ok, true);
  assert.equal(c.story[0].water, true);
  assert.equal(levelOf(p, 'thirst', 'ad'), 0);
  assert.ok(p.health.ad > 0.5);
  if (['meadow', 'forest', 'scrub', 'floodplain', 'subtropical', 'swamp', 'coast'].includes(biomeAt(42, parseKey(wet)))) assert.equal(levelOf(p, 'hunger', 'ad'), 0);
  // no camp at home or in a city
  assert.equal(applyAction(s, 'order', { id: p.id, hex: '0,0' }, t + CAMP.mins * 60000).ok, true);
});

test('the destination is always the last hex a route reaches: a way to a point beyond it goes around it', async () => {
  const { routePath } = await import('../js/journey.js');
  // a straight way east, then a point dragged just past the destination
  const land = k => !isWater(42, parseKey(k));
  for (const [to, past] of [['4,0', '5,0'], ['5,1', '6,1'], ['3,3', '3,4']]) {
    if (!land(to) || !land(past)) continue;
    const path = routePath(42, '0,0', to, [past]);
    assert.ok(path.length);
    assert.equal(path.indexOf(to), path.length - 1, `${to} via ${past}: ${path.join(' ')}`);
    assert.ok(path.includes(past));
  }
});

test('a journey never sets foot twice on the same hex: a way that would is worked out again around the hexes walked', async () => {
  const { routePath } = await import('../js/journey.js');
  const land = landHexes(42).filter(h => hexDist(h) <= 6).map(h => hexKey(...h));
  let tried = 0;
  for (const to of land.slice(0, 12)) for (const pin of land.slice(-8)) {
    if (pin === to) continue;
    const path = routePath(42, '0,0', to, [pin]);
    if (!path.length) continue;
    tried++;
    assert.equal(new Set(path).size, path.length, `${to} via ${pin}: ${path.join(' ')}`);
    assert.ok(!path.includes('0,0'));
    assert.equal(path.indexOf(to), path.length - 1);
    for (let i = 1; i < path.length; i++) { const [p, q] = [parseKey(path[i - 1]), parseKey(path[i])]; assert.equal(hexDist([q[0] - p[0], q[1] - p[1]]), 1); }
  }
  assert.ok(tried > 20);
});

test('the warning before setting off weighs the way planned, not the easiest one', async () => {
  const { routeRisk, teamUnits } = await import('../js/world.js');
  const { routePath } = await import('../js/journey.js');
  const s = game(dino('ad', 30, 'm', 'hypsi'));
  const team = teamUnits(s, [{ kind: 'dino', id: 'ad', members: ['ad'] }]);
  const to = hexKey(...landHexes(42).filter(h => hexDist(h) === 8)[0]);
  const easy = routeRisk(s, team, to);
  assert.deepEqual(routeRisk(s, team, to, routePath(42, '0,0', to).map(parseKey)), easy);
  // a long way round crosses more land, so more could notice the team
  const far = landHexes(42).filter(h => hexDist(h) === 12).map(h => hexKey(...h)).find(k => !routePath(42, '0,0', to).includes(k));
  const round = routeRisk(s, team, to, routePath(42, '0,0', to, [far]).map(parseKey));
  assert.ok(round.stopped >= easy.stopped);
});

test('foragers: a Psittacosaurus along finds seeds and gizzard stones more often; eggs are never eaten on the way', async () => {
  const { FORAGE: F } = await import('../js/config.js');
  // the same legs walked with and without a forager: the forager's kinds turn up more often
  const count = (type, kinds) => {
    let n = 0;
    for (let trip = 0; trip < 30; trip++) {
      const s = game(dino('ad', 30, 'm', type));
      s.world.trips = trip * 7;
      const to = hexKey(...landHexes(42).filter(h => hexDist(h) >= 15 && hexDist(h) <= 25)[trip * 3]);
      const r = applyAction(s, 'explore', { babyId: 'ad', hex: to }, T0);
      if (!r.ok) continue;
      const c = collect(s, { id: r.expedition.id, flee: true }, r.expedition.leg.arriveAt);
      for (const e of c.story.filter(e => e.kind === 'forage')) for (const f of e.found) if (kinds.includes(f.id)) n += 1;
    }
    return n;
  };
  assert.ok(count('psitta', F.by.psitta) > count('scelido', F.by.psitta));
  // a hungry omnivore carrying only eggs goes hungry rather than eat them
  const { partyOf, levelOf } = await import('../js/journey.js');
  const s = game(dino('ad', 30, 'm', 'galli'));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: hexKey(...landHexes(42).filter(h => hexDist(h) === 6)[0]) }, T0);
  const p = partyOf(s, r.expedition.id);
  p.hunger = { ad: 0.6 }; p.carry.items = { raw_egg: 3 };
  applyAction(s, 'journey', { id: p.id, flee: true }, p.leg.arriveAt);
  assert.ok((p.carry.items.raw_egg || 0) === 3 || !partyOf(s, p.id));
});

test('nests on the way: each kind found as it nests (buried left alone, colonies always guarded, parents on or off their nests), eggs taken or fought for', async () => {
  const { reach } = await import('./journey-helper.js');
  const { pendingView, partyOf } = await import('../js/journey.js');
  const { NEST: N } = await import('../js/config.js');
  const states = {};
  const far = landHexes(42).filter(h => hexDist(h) >= 16 && hexDist(h) <= 24).map(h => hexKey(...h));
  let took = 0, colonyFoes = 0, tried = 0;
  for (let i = 0; i < 400 && tried < 60; i++) {
    const s = game(dino('ad', 30, 'm', 'galli'));
    s.world.trips = i * 3;
    const r = applyAction(s, 'explore', { babyId: 'ad', hex: far[i % far.length] }, T0);
    if (!r.ok) continue;
    const pend = reach(s, r.expedition.id, r.expedition.leg.arriveAt, v => v.kind === 'nest');
    if (!pend) continue;
    tried++;
    const p = partyOf(s, r.expedition.id), v = pendingView(s, p);
    (states[v.nest] = states[v.nest] || []).push(v.state);
    if (v.nest === 'colony') { assert.ok(v.foe.members.length >= N.colony[0] && v.foe.members.length <= N.colony[1]); colonyFoes++; }
    // a whole clutch of the species' size; left alone, every fertile egg held to the light and taken (as
    // many as fit), then those that would never hatch, kept as food if wanted
    const [lo, hi] = N.clutch[v.species];
    assert.ok(v.clutch >= lo && v.clutch <= hi, `${v.species} ${v.clutch}`);
    if (v.state === 'alone') {
      const step = applyAction(s, 'journey', { id: p.id, nest: 'take' }, r.expedition.leg.arriveAt);
      const told = step.story.find(e => e.kind === 'nest');
      assert.ok(told.eggs.length >= 1 && told.eggs.every(g => g.type === v.species && !g.unseen) && p.carry.eggs.length === told.eggs.length);
      if (told.duds) {
        const w2 = pendingView(s, p);
        assert.equal(w2.phase, 'duds');
        applyAction(s, 'journey', { id: p.id, nest: 'keep' }, r.expedition.leg.arriveAt);
        assert.equal(p.carry.items.raw_egg, told.duds);
      }
      took++;
    }
    // hatched: only the eggs that never hatched, free
    if (v.state === 'hatched') {
      applyAction(s, 'journey', { id: p.id, nest: 'keep' }, r.expedition.leg.arriveAt);
      assert.equal(p.carry.items.raw_egg, v.leftovers);
      assert.equal(p.carry.eggs.length, 0);
    }
  }
  assert.ok(tried > 10, `${tried} nests`);
  for (const st of states.buried || []) assert.ok(['alone', 'hatched'].includes(st));
  for (const st of states.colony || []) assert.ok(['colony', 'hatched'].includes(st));
  for (const st of states.creche || []) assert.ok(['watched', 'hatched'].includes(st));
  for (const st of states.watched || []) assert.ok(['watched', 'alone', 'hatched'].includes(st));
  for (const k of ['brooded', 'guarded']) for (const st of states[k] || []) assert.ok(['empty', 'seen', 'unseen', 'hatched'].includes(st));
  // a team carrying three eggs can take no more
  const s = game(dino('ad', 30, 'm', 'galli'));
  for (let i = 0; i < 300; i++) {
    s.world.expeditions = []; s.hatched[0].lastFed = T0; delete s.hatched[0].injuredUntil;
    s.world.trips = i * 5;
    const r = applyAction(s, 'explore', { babyId: 'ad', hex: far[i % far.length] }, T0);
    if (!r.ok) continue;
    if (!reach(s, r.expedition.id, r.expedition.leg.arriveAt, v => v.kind === 'nest')) continue;
    const p = partyOf(s, r.expedition.id);
    p.carry.eggs = [1, 2, 3].map(n => ({ id: `e${n}`, type: 'proto', gen: 1, parents: [], laidAt: 0, genes: { str: 50, agi: 50, vit: 50, res: 50 } }));
    assert.equal(pendingView(s, p).full, true);
    applyAction(s, 'journey', { id: p.id, nest: 'take' }, r.expedition.leg.arriveAt);
    assert.equal(p.carry.eggs.length, 3);
    break;
  }
});

test('which nest is found: each species by how its nest shows, how rare it is and how much the land is its home; legendaries at most 2%', async () => {
  const { nestShares } = await import('../js/journey.js');
  const { NEST: N, SPECIES: SP } = await import('../js/config.js');
  for (const biome of Object.keys(N.where)) {
    const sh = nestShares(biome);
    assert.ok(Math.abs(sh.reduce((t, [, x]) => t + x, 0) - 1) < 1e-9, biome);
    for (const [sp, x] of sh) if (SP[sp].rarity === 'Legendary' && sh.length > 1) assert.ok(x <= N.legendary + 1e-9, `${sp} in ${biome}`);
  }
  // colonies show most: in the meadow the Hypacrosaurus colonies are the likeliest
  const meadow = nestShares('meadow');
  assert.equal(meadow.reduce((a, b) => (b[1] > a[1] ? b : a))[0], 'hypa');
});

test('bait: only one that would run from the parent can draw it off; outrun, it comes back with the egg taken, caught, it is killed', async () => {
  const { reach } = await import('./journey-helper.js');
  const { pendingView, partyOf } = await import('../js/journey.js');
  const { fears } = await import('../js/combat.js');
  const far = landHexes(42).filter(h => hexDist(h) >= 16 && hexDist(h) <= 24).map(h => hexKey(...h));
  let seen = 0;
  for (let i = 0; i < 400 && seen < 6; i++) {
    const s = game(dino('g', 30, 'f', 'galli'), dino('t', 30, 'm', 'trike'));
    s.world.trips = i * 3;
    const r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'g' }, { kind: 'dino', id: 't' }], hex: far[i % far.length] }, T0);
    if (!r.ok) continue;
    if (!reach(s, r.expedition.id, r.expedition.leg.arriveAt, v => v.kind === 'nest')) continue;
    const p = partyOf(s, r.expedition.id), v = pendingView(s, p);
    // the Triceratops never runs from anything that could be found nesting, so it is never bait
    assert.ok(!v.decoys.some(d => d.id === 't'));
    for (const d of v.decoys) assert.ok(d.chance > 0 && d.chance < 1);
    if (!v.decoys.length) continue;
    seen++;
    const step = applyAction(s, 'journey', { id: p.id, nest: 'lure', decoy: 'g' }, r.expedition.leg.arriveAt);
    const told = step.story.find(e => e.kind === 'nest');
    assert.equal(told.act, 'lure');
    // in the rush, one egg, grabbed without a look
    if (told.eggs.length) assert.ok(s.hatched.some(b => b.id === 'g') && told.eggs.length === 1 && told.eggs[0].unseen);
    else assert.ok(told.caught && told.caught.died && !s.hatched.some(b => b.id === 'g'));
  }
  assert.ok(seen > 0);
});

test("an empty nest: an egg snatched unseen, or held to the light one by one, the parent likelier back at each; an unseen dud shows once home", async () => {
  const { reach } = await import('./journey-helper.js');
  const { pendingView, partyOf } = await import('../js/journey.js');
  const { NEST: N } = await import('../js/config.js');
  const far = landHexes(42).filter(h => hexDist(h) >= 16 && hexDist(h) <= 24).map(h => hexKey(...h));
  let looked = 0, backs = 0, snatched = 0;
  for (let i = 0; i < 1500 && (looked < 4 || snatched < 2); i++) {
    const s = game(dino('ad', 30, 'm', 'galli'));
    s.world.trips = i * 3;
    const r = applyAction(s, 'explore', { babyId: 'ad', hex: far[i % far.length] }, T0);
    if (!r.ok) continue;
    if (!reach(s, r.expedition.id, r.expedition.leg.arriveAt, v => v.kind === 'nest')) continue;
    const p = partyOf(s, r.expedition.id), v = pendingView(s, p), t = r.expedition.leg.arriveAt;
    if (v.state !== 'empty') continue;
    if (snatched < 2) {
      snatched++;
      const told = applyAction(s, 'journey', { id: p.id, nest: 'take' }, t).story.find(e => e.kind === 'nest');
      assert.ok(told.eggs.length === 1 && told.eggs[0].unseen && p.carry.eggs.length === 1);
      // home: a dud goes to the food, a fertile one to the tray
      const dud = !!p.carry.eggs[0].dud;
      const { collect } = await import('./journey-helper.js');
      const { countItem } = await import('../js/economy.js');
      const home = collect(s, { id: p.id, back: true }, t + 1e8).story.find(e => e.kind === 'home');
      if (home) assert.ok(dud ? countItem(s, 'raw_egg') >= 1 && home.duds.length === 1 : s.eggs.some(g => g.id === told.eggs[0].id && !('unseen' in g)));
      continue;
    }
    looked++;
    // held up one by one: each look is likelier to bring the parent back
    // (the first look is safe, the parent likelier back at each one after)
    let w = v, prev = -1, n = 0;
    assert.equal(v.chance, N.candle[v.nest][0]);
    for (let k = 0; k < 40; k++) {
      const c = w.phase === 'dud' ? { nest: 'keep' } : { nest: 'candle' };
      if (c.nest === 'candle') { assert.ok(w.chance > prev); prev = w.chance; n++; }
      const told = applyAction(s, 'journey', { id: p.id, ...c }, t).story.find(e => e.kind === 'nest');
      if (told.back) { backs++; break; }
      w = pendingView(s, p);
      if (!w || w.kind !== 'nest') break;
    }
    assert.ok(p.carry.eggs.length <= N.carry && p.carry.eggs.every(g => !g.unseen));
  }
  assert.ok(looked >= 1 && snatched >= 1, `${looked} looked, ${snatched} snatched`);
});

test("whose a nest with no parent about is, the player only knows for eggs they have had: the starters' from the start", async () => {
  const { reach } = await import('./journey-helper.js');
  const { pendingView, partyOf, knows } = await import('../js/journey.js');
  const { SPECIES: SP } = await import('../js/config.js');
  const s0 = game();
  for (const [k, sp] of Object.entries(SP)) assert.equal(knows(s0, k), sp.rarity === 'Starter', k);
  const far = landHexes(42).filter(h => hexDist(h) >= 16 && hexDist(h) <= 24).map(h => hexKey(...h));
  let alone = 0, parent = 0;
  for (let i = 0; i < 600 && (alone < 3 || parent < 3); i++) {
    const s = game(dino('ad', 30, 'm', 'galli'));
    s.world.trips = i * 3;
    const r = applyAction(s, 'explore', { babyId: 'ad', hex: far[i % far.length] }, T0);
    if (!r.ok) continue;
    if (!reach(s, r.expedition.id, r.expedition.leg.arriveAt, v => v.kind === 'nest')) continue;
    const p = partyOf(s, r.expedition.id), v = pendingView(s, p);
    // the parent there: seen; none: known only by its eggs
    if (['watched', 'colony', 'unseen', 'seen'].includes(v.state)) { parent++; assert.equal(v.known, true); continue; }
    alone++;
    assert.equal(v.known, v.species === 'galli' || SP[v.species].rarity === 'Starter');
    s.known = [v.species];
    assert.equal(pendingView(s, p).known, true);
  }
  assert.ok(alone && parent);
});

test('a team whose last one dies on the way is lost, told at the hex where it fell', async () => {
  const { partyOf } = await import('../js/journey.js');
  const { SURVIVAL } = await import('../js/config.js');
  const { REAL_SURVIVAL } = await import('./journey-helper.js');
  const s = game(dino('ad', 30, 'm', 'galli'));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: hexKey(...landHexes(42).filter(h => hexDist(h) >= 10)[0]) }, T0);
  const p = partyOf(s, r.expedition.id);
  Object.assign(SURVIVAL, REAL_SURVIVAL);
  try {
    p.thirst = { ad: 1 }; p.health = { ad: 0.01 }; p.supplies = { water_skin: 0, ration: 0, water: 0 };
    const step = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
    const lost = step.story.find(e => e.kind === 'lost');
    assert.ok(lost, step.story.map(e => e.kind).join());
    assert.ok(Number.isInteger(lost.idx) && lost.idx >= 0 && lost.hex === p.leg.path[lost.idx]);
  } finally { SURVIVAL.thirst = 0; SURVIVAL.hunger = 0; }
});

test('dinosaurs never set out without the player', async () => {
  const { EXPEDITION } = await import('../js/config.js');
  EXPEDITION.needsPlayer = true;
  try {
    const to = hexKey(...landHexes(42).filter(h => hexDist(h) === 6)[0]);
    const s = game(dino('ad', 30, 'm', 'galli'));
    assert.equal(applyAction(s, 'explore', { babyId: 'ad', hex: to }, T0).reason, 'no-player');
    assert.equal(applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }], hex: to }, T0).reason, 'no-player');
    const r = applyAction(s, 'explore', { team: [{ kind: 'player' }, { kind: 'dino', id: 'ad' }], hex: to }, T0);
    assert.equal(r.ok, true, r.reason);
    assert.ok(r.expedition.members.includes('player'));
  } finally { EXPEDITION.needsPlayer = false; }
});

test('a team on its way is somewhere between two hexes, further along as time goes by', async () => {
  const { partyOf, progressOf, positionOf } = await import('../js/journey.js');
  const s = game(dino('ad', 30, 'm', 'galli'));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: hexKey(...landHexes(42).filter(h => hexDist(h) === 8)[0]) }, T0);
  const p = partyOf(s, r.expedition.id), { startedAt, arriveAt } = p.leg;
  let last = -2;
  for (let k = 0; k <= 40; k++) {
    const t = startedAt + (arriveAt - startedAt) * k / 40, g = progressOf(s, p, t);
    assert.equal(g.i, positionOf(s, p, t));
    assert.ok(g.f >= 0 && g.f <= 1);
    const at = g.i + g.f;
    assert.ok(at >= last - 1e-9, `${at} after ${last}`);
    last = at;
  }
  assert.equal(progressOf(s, p, arriveAt).i, p.leg.path.length - 1);
});

test('wild animals are rolled anew at every meeting, within their kind; the map tells of the kind as it is', async () => {
  const { seededRand } = await import('../js/economy.js');
  const h = landHexes(42).filter(x => hexDist(x) === 9)[0];
  const typical = threatAt(42, h), again = threatAt(42, h);
  assert.deepEqual(typical.foe.members.map(m => m.power), again.foe.members.map(m => m.power));
  const a = threatAt(42, h, seededRand('meet-a')), b = threatAt(42, h, seededRand('meet-b'));
  assert.equal(a.entry, b.entry);
  assert.equal(a.foe.members.length, b.foe.members.length);
  assert.notDeepEqual(a.foe.members.map(m => m.power), b.foe.members.map(m => m.power));
  for (const m of a.foe.members) assert.ok(Math.abs(m.power - typical.foe.members[0].power) <= typical.foe.members[0].power * 0.2);
});

test("the world's day is a day's march: a flat hex is about half a day, a day about 2.3 flat hexes", () => {
  assert.equal(UNIT_HOURS, CLOCK.walk * 24 / CLOCK.day);
  const hexDays = TRAVEL.terrain.flat * UNIT_HOURS / 24;
  assert.ok(hexDays > 0.4 && hexDays < 0.5);
  assert.ok(1 / hexDays > 2.2 && 1 / hexDays < 2.4);
});

test('a dinosaur of the team down: the player may call in an aircraft for it, billed by weight and distance, its care by its wounds', () => {
  const two = () => {
    const s = game(dino('ad', 30), dino('c', 30, 'f', 'compy'), dino('c2', 30, 'm', 'compy'));
    const far = hexKey(...landHexes(42).filter(h => hexDist(h) >= 8)[0]);
    const r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }, { kind: 'dino', id: 'c' }, { kind: 'dino', id: 'c2' }, { kind: 'player', id: 'player' }], hex: far }, T0);
    assert.equal(r.ok, true, r.reason);
    const p = partyOf(s, r.expedition.id);
    p.down = ['ad', 'c', 'c2']; p.health = { ad: 0, c: 0, c2: 0 };
    return { s, p };
  };
  let { s, p } = two();
  let step = applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  assert.equal(step.pending.kind, 'airlift');
  assert.deepEqual(step.pending.who.map(x => x.id), ['ad', 'c', 'c2']);
  // two small ones share an aircraft: as dear as one
  const hex = step.pending.hex;
  assert.equal(airliftFare(s, ['c', 'c2'], hex), airliftFare(s, ['c'], hex));
  assert.ok(airliftFare(s, ['ad'], hex) > airliftFare(s, ['c'], hex) * 10);
  step = applyAction(s, 'journey', { id: p.id, airlift: ['c', 'c2'] }, p.leg ? p.leg.arriveAt : T0);
  const told = step.story.find(e => e.kind === 'airlift');
  assert.deepEqual(told.who, ['c', 'c2']);
  assert.equal(told.fare, airliftFare(s, ['c'], hex));
  assert.equal(told.care, 2 * careOf(0, true));
  assert.equal(s.debt, told.fare + told.care);
  // they leave the team and fly home in a party of their own, taking no team's place; landed, they go to
  // the hospital
  assert.ok(!p.members.includes('c') && p.members.includes('ad'));
  const air = s.world.expeditions.find(x => x.air);
  assert.deepEqual(air.members, ['c', 'c2']);
  assert.equal(air.leg.arriveAt, told.lands);
  assert.equal(air.leg.to, HOME);
  assert.ok(isAway(s, 'c', told.lands - 1));
  // landed, it is home (in the hospital from the landing), though the report is to be read before it
  // can set out again
  const c = s.hatched.find(b => b.id === 'c');
  assert.ok(!isAway(s, 'c', told.lands));
  assert.equal(c.hospital, true);
  assert.equal(c.injuredUntil, told.lands + hospitalHours(c) * 3600000);
  assert.equal(exploreProblem(s, 'c', '1,0', told.lands + 1e9), 'report');
  const landing = applyAction(s, 'journey', { id: air.id }, told.lands + 5e6);
  assert.ok(landing.story.some(e => e.kind === 'home'));
  assert.ok(!isAway(s, 'c'));
  assert.equal(c.injuredUntil, told.lands + hospitalHours(c) * 3600000);
  assert.notEqual(exploreProblem(s, 'c', '1,0', told.lands + 1e9), 'report');
  // the tougher, the sooner out: a Tyrannosaurus is big, but hard to keep down
  assert.ok(hospitalHours(s.hatched.find(b => b.id === 'ad')) > hospitalHours(c));
  assert.equal(applyAction(s, 'heal', { babyId: 'c' }, told.lands + 1).reason, 'hospital');
  // the one left is carried on, and not asked about again
  assert.ok(!step.story.some(e => e.kind === 'airlift' && e.who.includes('ad')));
  assert.ok(p.down.includes('ad'));
});

test("the sanctuary's bills: paid when the player chooses, and every coin that comes in goes to them meanwhile", () => {
  const s = game();
  s.coins = 30;
  bill(s, 100);
  assert.equal(s.debt, 100);
  assert.equal(s.coins, 30);
  earn(s, 25);
  assert.equal(s.debt, 75);
  assert.equal(s.coins, 30);
  assert.deepEqual(applyAction(s, 'payDebt', {}, T0), { ok: true, paid: 30, left: 45 });
  assert.equal(s.coins, 0);
  assert.equal(applyAction(s, 'payDebt', {}, T0).reason, 'coins');
  earn(s, 60);
  assert.equal(s.debt, 0);
  assert.equal(s.coins, 15);
  assert.equal(applyAction(s, 'payDebt', {}, T0).reason, 'no-debt');
});

test('an aircraft home, called at any time: the fit paid for then and there, the badly hurt billed', () => {
  const out = () => {
    const s = game(dino('ad', 30), dino('c', 30, 'f', 'compy'));
    const far = hexKey(...landHexes(42).filter(h => hexDist(h) >= 8)[0]);
    const r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }, { kind: 'dino', id: 'c' }, { kind: 'player', id: 'player' }], hex: far }, T0);
    return { s, p: partyOf(s, r.expedition.id), far };
  };
  // waiting out there: no coins, no flight
  let { s, p, far } = out();
  applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  for (let i = 0; i < 20 && p.pending; i++) applyAction(s, 'journey', { id: p.id }, p.leg.arriveAt);
  if (p.leg) return;   // (the team turned back: nothing to test here)
  s.coins = 0;
  const t = T0 + 9e7;
  let r = applyAction(s, 'flyHome', { id: p.id }, t);
  assert.equal(r.reason, 'coins');
  const fare = airliftFare(s, p.members, p.at);
  assert.equal(r.cost.now, fare);
  s.coins = fare + 5;
  p.carry.items.bone = 2;
  r = applyAction(s, 'flyHome', { id: p.id }, t);
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.coins, 5);
  assert.equal(s.debt || 0, 0);
  // it flies home, nothing happening on the way, and is home once it lands with what it carried
  const flown = r.story.find(e => e.kind === 'flown');
  assert.equal(flown.lands, t + flightMins(far) * 60000);
  assert.ok(p.leg.air && p.leg.arriveAt === flown.lands);
  assert.equal(applyAction(s, 'journey', { id: p.id }, flown.lands - 1).reason, 'not-back');
  const bones = countItem(s, 'bone');
  assert.ok(applyAction(s, 'journey', { id: p.id }, flown.lands).story.some(e => e.kind === 'home'));
  assert.equal(s.world.expeditions.length, 0);
  assert.equal(countItem(s, 'bone'), bones + 2);
  // the badly hurt (a quarter of their health or less) fly on credit, their care billed too
  ({ s, p, far } = out());
  p.health = { ad: 0.2 };
  const mid = T0 + (p.leg.arriveAt - T0) / 2;
  s.coins = 0;
  r = applyAction(s, 'flyHome', { id: p.id }, mid);
  const bill = r.cost;
  // (only the fit's share is paid now: a Compsognathus and the player)
  assert.ok(bill.later > 0 && bill.now < bill.fare);
  assert.equal(bill.later, bill.fare - bill.now + careOf(0.2, false));
  if (bill.now) { assert.equal(r.reason, 'coins'); s.coins = bill.now; r = applyAction(s, 'flyHome', { id: p.id }, mid); }
  assert.equal(r.ok, true, r.reason);
  collect(s, { id: p.id }, mid);
  assert.equal(s.coins, 0);
  assert.equal(s.world.expeditions.length, 0);
  assert.ok(s.debt >= bill.later);
});

test('called on its way, a team stops where it is: the way so far is told, then it flies', () => {
  const s = game(dino('ad', 30));
  const far = hexKey(...landHexes(42).filter(h => hexDist(h) >= 8)[0]);
  const r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }, { kind: 'player', id: 'player' }], hex: far }, T0);
  const p = partyOf(s, r.expedition.id);
  s.coins = 10000;
  const mid = T0 + (p.leg.arriveAt - T0) / 2;
  const call = applyAction(s, 'flyHome', { id: p.id }, mid);
  assert.equal(call.ok, true, call.reason);
  assert.equal(p.leg.arriveAt, mid);
  assert.equal(applyAction(s, 'flyHome', { id: p.id }, mid).reason, 'called');
  const told = collect(s, { id: p.id }, mid);
  assert.equal(s.world.expeditions.length, 0);
  assert.equal(s.coins, 10000 - call.cost.now);
  assert.equal(s.debt || 0, 0);
  assert.ok(told);
});

test('what stops a journey happens as the team gets there; the way goes on unseen meanwhile, and is told up to then once the player has seen to it', () => {
  const far = hexKey(...landHexes(42).filter(h => threatAt(42, h).id === 'rex').at(-1));
  let seen = 0;
  for (let trip = 0; trip < 40 && !seen; trip++) {
    const s = game(dino('p', 60, 'proto'));
    s.world.trips = trip;
    const r = applyAction(s, 'explore', { babyId: 'p', hex: far }, T0);
    const p = partyOf(s, r.expedition.id), leg = { ...p.leg };
    const stop = stopOf(s, p);
    if (!stop || stop.idx >= leg.path.length - 3) continue;
    // not before it gets there
    assert.equal(applyAction(s, 'journey', { id: p.id }, stop.at - 1).reason, 'not-back');
    // seen a few hexes' walk later: told up to the stop, where it shows, the way not pushed back
    const late = stop.at + 4 * TRAVEL.mins * 60000;
    const step = applyAction(s, 'journey', { id: p.id }, late);
    if (!step.pending) continue;
    assert.equal(step.pending.idx, stop.idx);
    assert.deepEqual(progressOf(s, p, late), progressOf(s, p, stop.at));
    assert.equal(p.leg.arriveAt, leg.arriveAt);
    // seen to: the way is told on up to now (or the next stop)
    let next = step;
    while (next.pending && next.pending.kind !== 'go-on') next = applyAction(s, 'journey', { id: p.id, fight: true }, late);
    if (!next.pending || !p.leg || p.leg.n !== leg.n) continue;
    const before = p.leg.step;
    next = applyAction(s, 'journey', { id: p.id }, late);
    if (!p.leg || p.leg.n !== leg.n) continue;
    assert.equal(p.leg.arriveAt, leg.arriveAt);
    assert.ok(p.leg.step > before || next.pending);
    seen++;
  }
  assert.ok(seen);
});

test('at a stop the player tends to the team with what it carries: herbs, a transfusion, a meal, a drink', () => {
  const s = game(dino('ad', 30));
  addItem(s, 'herb', 5); addItem(s, 'transfusion', 1); addItem(s, 'water_skin', 2);
  const far = hexKey(...landHexes(42).filter(h => hexDist(h) >= 8)[0]);
  const r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'ad' }, { kind: 'player', id: 'player' }], hex: far }, T0);
  const p = partyOf(s, r.expedition.id);
  // packed: as many herbs and transfusions as go along
  assert.equal(p.supplies.herb, SURVIVAL.pack.herb);
  assert.equal(p.supplies.transfusion, 1);
  assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'ad', what: 'herb' }, T0).reason, 'not-stopped');
  p.pending = { kind: 'go-on', idx: 0, hex: p.leg.path[0] };
  p.health = { ad: 0.3, player: 0.5 }; p.thirst = { player: 0.6 }; p.hunger = { ad: 0.4 };
  p.carry.items.meat = 400;
  assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'ad', what: 'herb' }, T0).health, 0.3 + TRIP_CARE.herb);
  assert.equal(p.supplies.herb, SURVIVAL.pack.herb - 1);
  assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'player', what: 'drink' }, T0).ok, true);
  assert.equal(p.thirst.player, 0);
  if (SURVIVAL.hunger > 0) assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'ad', what: 'eat' }, T0).food, 'meat');
  // one down is back on its feet with a transfusion; not the player, who is flown home
  p.down = ['ad']; p.health.ad = 0;
  assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'ad', what: 'herb' }, T0).reason, 'down');
  assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'ad', what: 'transfusion' }, T0).health, TRIP_CARE.revive);
  assert.ok(!p.down.includes('ad'));
  assert.equal(applyAction(s, 'tripCare', { id: p.id, member: 'ad', what: 'transfusion' }, T0).reason, 'not-down');
});
