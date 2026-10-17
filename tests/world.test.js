import { test } from 'node:test';
import { collect } from './journey-helper.js';
import { legMins } from '../js/journey.js';
import assert from 'node:assert/strict';
import { applyAction, countItem, hungerEvery, feedBaby, breedProblem } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import {
  ALL_HEXES, biomeAt, hexDist, hexKey, newWorld, canReach, exploreProblem, tripMins, lootTable, isAway, isWater, cellAt, travelCost, travelPath, landHexes, threatAt, parseKey,
} from '../js/world.js';
import { MAP, WORLD_SEED, BIOMES, EXPEDITION_SLOTS, AGES, NEST_CALM, NEST_FAR, SPECIES } from '../js/config.js';

const T0 = 1_000_000_000_000;
const dino = (id, fed, sex = 'm', type = 'rex') => ({ id, type, sex, name: id, at: 0, gen: 1, fed, lastFed: T0, genes: { str: 50, agi: 50, vit: 50, res: 50 }, equip: {} });
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
    // warmer toward the equator, cooler toward the poles
    const heat = band => { const c = cells.filter(c => c.terrain !== 'ocean' && band(Math.abs(c.lat))); return c.reduce((t, x) => t + x.heat, 0) / c.length; };
    assert.ok(heat(a => a < 20) > heat(a => a > 55), 'seed ' + seed);
  }
});

test("the other tribes' cities: far apart and from the nest, each in a calm of ferns where no predator hunts, not a place to explore", async () => {
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
  assert.equal(exploreProblem(s, 'ad', hexKey(...cities[0].h), T0), 'city');
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
  assert.equal(exploreProblem(s, 'ad', '1,0', T0 + 10 * 60000), 'hungry');
  s.breeding = { type: 'rex', maleId: 'ad', femaleId: 'ad2', startedAt: T0, readyAt: T0 + 1 };
  assert.equal(exploreProblem(s, 'ad', '1,0', T0), 'breeding');
  s.breeding = null;
  assert.equal(applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0).ok, true);
  assert.equal(exploreProblem(s, 'ad', '1,0', T0), 'away');
  assert.equal(EXPEDITION_SLOTS, 2);
  assert.equal(applyAction(s, 'explore', { babyId: 'ad2', hex: '1,0' }, T0).ok, true);
  assert.equal(exploreProblem(s, 'ad3', '1,0', T0), 'no-slot');
});

test('a dinosaur away can be neither fed nor paired', () => {
  const s = game(dino('ad', 30), dino('ad2', 30, 'f'));
  applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0);
  assert.equal(isAway(s, 'ad'), true);
  assert.equal(feedBaby(s, 'ad', T0 + 1e9).reason, 'away');
  assert.equal(breedProblem(s, 'ad', 'ad2'), 'away');
});

test('a journey: out to a hex where the party waits, everything carried until it comes home hungry', () => {
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
  assert.equal(arrived.coins, 10);
  assert.ok(arrived.found.length > 0);
  for (const { id: item, n } of arrived.found) assert.ok(n >= 1 && BIOMES[arrived.biome].loot.some(l => l[0] === item));
  // it waits there, carrying what it found; nothing is home yet
  const p = s.world.expeditions[0];
  assert.equal(p.at, '2,0');
  assert.equal(p.leg, null);
  assert.equal(p.carry.coins, 10);
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
  assert.ok(home.coins >= 10 + 15);
  if (home.loot.some(l => l.id === 'leaf')) assert.ok(countItem(s, 'leaf') > leaves);
  assert.equal(s.hatched[0].lastFed, t3 - hungerEvery(s.hatched[0]));
  // a second visit pays no discovery coins
  s.hatched[0].lastFed = t3;
  const again = applyAction(s, 'explore', { babyId: 'ad', hex: '2,0' }, t3);
  const second = collect(s, { id: again.expedition.id }, again.expedition.returnAt);
  assert.equal(second.story.find(e => e.kind === 'arrived').coins, 0);
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
      // heading home from where it turned, from when it was there: sooner than the whole way
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
  const half = Math.round((leg.startedAt + leg.arriveAt) / 2);
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

test("what lives in a hex is of an age: young, old, adult or in its prime (a lair's Alpha the strongest); no predators near the nest", () => {
  const land = landHexes(42);
  const ages = new Set(land.map(h => threatAt(42, h).age));
  for (const a of [...Object.keys(AGES), 'alpha']) assert.ok(ages.has(a), a);
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
