import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, hungerEvery, feedBaby, breedProblem } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import {
  ALL_HEXES, biomeAt, hexDist, hexKey, newWorld, canReach, exploreProblem, tripMins, lootTable, isAway,
} from '../js/world.js';
import { WORLD_RADIUS, BIOMES, EXPEDITION_SLOTS, JUVENILE_RANGE, TRIP_MINS_PER_HEX } from '../js/config.js';

const T0 = 1_000_000_000_000;
const dino = (id, fed, sex = 'm', type = 'rex') => ({ id, type, sex, name: id, at: 0, gen: 1, fed, lastFed: T0, genes: { str: 50, agi: 50, vit: 50, res: 50 }, equip: {} });
function game(...babies) {
  const s = freshState();
  s.world = newWorld(42);
  s.hatched.push(...babies);
  return s;
}

test('the map is a hex disc around the nest, the same for the same seed', () => {
  assert.equal(ALL_HEXES.length, 1 + 3 * WORLD_RADIUS * (WORLD_RADIUS + 1));
  assert.deepEqual(ALL_HEXES[0], [0, 0]);
  const a = ALL_HEXES.map(h => biomeAt(42, h)), b = ALL_HEXES.map(h => biomeAt(42, h));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, ALL_HEXES.map(h => biomeAt(43, h)));
});

test('every map has every biome, meadow around the nest and volcanoes only far out', () => {
  for (const seed of [1, 7, 42, 1234, 99999]) {
    const seen = new Set(ALL_HEXES.map(h => biomeAt(seed, h)));
    assert.deepEqual([...seen].sort(), Object.keys(BIOMES).sort(), 'seed ' + seed);
    for (const h of ALL_HEXES) {
      if (hexDist(h) <= 1) assert.equal(biomeAt(seed, h), 'meadow');
      if (biomeAt(seed, h) === 'volcano') assert.ok(hexDist(h) >= 4);
    }
  }
});

test('a new world shows the nest and its neighbours; expeditions reach one hex into the fog', () => {
  const s = game();
  assert.equal(s.world.revealed.length, 7);
  assert.equal(canReach(s, '0,0'), false);
  assert.equal(canReach(s, '2,0'), true);    // fog next to a revealed hex
  assert.equal(canReach(s, '3,0'), false);   // deeper fog
  assert.equal(canReach(s, '99,0'), false);
  assert.equal(tripMins('2,-1'), 2 * TRIP_MINS_PER_HEX);
});

test('who can explore: juveniles nearby, adults anywhere, never babies, hungry or busy ones', () => {
  const s = game(dino('baby', 0), dino('juv', 10), dino('ad', 30), dino('ad2', 30, 'f'), dino('ad3', 30));
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  const far = hexKey(JUVENILE_RANGE + 1, 0);
  assert.equal(exploreProblem(s, 'baby', '1,0', T0), 'too-young');
  assert.equal(exploreProblem(s, 'juv', far, T0), 'too-far');
  assert.equal(exploreProblem(s, 'juv', '1,0', T0), null);
  assert.equal(exploreProblem(s, 'ad', far, T0), null);
  assert.equal(exploreProblem(s, 'ad', '0,0', T0), 'home');
  assert.equal(exploreProblem(s, 'ad', '50,0', T0), 'out-of-map');
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

test('coming back reveals the map, brings loot and discovery coins, and leaves it hungry', () => {
  const s = game(dino('ad', 30));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: '2,0' }, T0);
  const id = r.expedition.id;
  assert.equal(applyAction(s, 'collectTrip', { id }, T0 + 60000).reason, 'not-back');
  const back = T0 + tripMins('2,0') * 60000;
  const before = s.coins, leaves = countItem(s, 'leaf');
  const done = applyAction(s, 'collectTrip', { id }, back);
  assert.equal(done.ok, true);
  assert.equal(done.discovered, true);
  assert.equal(done.coins, 10);
  assert.equal(s.coins, before + 10);
  assert.ok(done.loot.length > 0);
  for (const { id: item, n } of done.loot) assert.ok(n >= 1 && BIOMES[done.biome].loot.some(l => l[0] === item));
  if (done.loot.some(l => l.id === 'leaf')) assert.ok(countItem(s, 'leaf') > leaves);
  assert.ok(s.world.revealed.includes('3,0'));
  assert.equal(canReach(s, '4,0'), true);
  assert.equal(s.world.expeditions.length, 0);
  assert.equal(s.hatched[0].lastFed, back - hungerEvery(s.hatched[0]));
  // a second visit pays no discovery coins
  s.hatched[0].lastFed = back;
  const again = applyAction(s, 'explore', { babyId: 'ad', hex: '2,0' }, back);
  assert.equal(applyAction(s, 'collectTrip', { id: again.expedition.id }, back + tripMins('2,0') * 60000).coins, 0);
});

test('the loot of a trip is the same in the browser and on the server', () => {
  const a = game(dino('ad', 30)), b = game(dino('ad', 30));
  for (const s of [a, b]) applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0);
  const back = T0 + tripMins('1,0') * 60000;
  assert.deepEqual(applyAction(a, 'collectTrip', { id: 't1' }, back).loot, applyAction(b, 'collectTrip', { id: 't1' }, back).loot);
});

test('farther hexes bring more', () => {
  const s = game();
  const near = ALL_HEXES.find(h => hexDist(h) === 2 && biomeAt(42, h) === 'meadow');
  const far = ALL_HEXES.find(h => hexDist(h) === 7 && biomeAt(42, h) === 'meadow');
  assert.ok(near && far);
  assert.ok(lootTable(s, hexKey(...far))[0].max > lootTable(s, hexKey(...near))[0].max);
});

test('recalling brings the dinosaur home with nothing', () => {
  const s = game(dino('ad', 30));
  const r = applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0);
  assert.equal(applyAction(s, 'recall', { id: r.expedition.id }, T0).ok, true);
  assert.equal(isAway(s, 'ad'), false);
  assert.equal(s.world.revealed.length, 7);
});

test('older saves get a world from their own contents, and loaded worlds are cleaned', () => {
  const old = freshState();
  delete old.world;
  old.saveVersion = 7;
  old.hatched.push(dino('ad', 30));
  const a = migrate(old), b = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(a.saveVersion, SAVE_VERSION);
  assert.equal(a.world.seed, b.world.seed);
  assert.equal(a.world.revealed.length, 7);

  const s = game(dino('ad', 30));
  s.world.revealed.push('99,99', 'junk');
  s.world.expeditions.push({ id: 'x', babyId: 'ghost', hex: '1,0', trip: 1, startedAt: T0, returnAt: T0 });
  s.world.expeditions.push({ id: 'y', babyId: 'ad', hex: '1,0', trip: 1, startedAt: T0, returnAt: T0 });
  const clean = migrate(s);
  assert.ok(!clean.world.revealed.includes('99,99') && !clean.world.revealed.includes('junk'));
  assert.equal(clean.world.expeditions.length, 1);
  // a trip can't be made shorter than it really is
  assert.equal(clean.world.expeditions[0].returnAt, T0 + tripMins('1,0') * 60000);
});

test('a guest game brought into an account loses trips in progress', () => {
  const s = game(dino('ad', 30));
  applyAction(s, 'explore', { babyId: 'ad', hex: '1,0' }, T0);
  assert.equal(capGuestSave(migrate(s), T0).world.expeditions.length, 0);
});
