import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, buyGear, equipGear, seededRand } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { fight, fighterOf, creatureFighter, winChance, dangerOf } from '../js/combat.js';
import { ALL_HEXES, hexKey, hexDist, newWorld, isLair, threatAt, tripMins, injuredLeft, exploreProblem } from '../js/world.js';
import { CREATURES, BIOMES, INJURY_MINS, HEAL_MINS, LAIR_MIN_DIST } from '../js/config.js';

const T0 = 1_000_000_000_000;
const genes = n => ({ str: n, agi: n, vit: n, res: n });
const dino = (id, g, type = 'rex') => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed: 30, lastFed: T0, genes: genes(g), equip: {} });
function game(...babies) {
  const s = freshState();
  s.world = newWorld(42);
  s.hatched.push(...babies);
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  return s;
}
// sends a dinosaur to a hex and brings it back
function trip(s, id, key) {
  const r = applyAction(s, 'explore', { babyId: id, hex: key }, T0);
  assert.equal(r.ok, true, r.reason);
  return applyAction(s, 'collectTrip', { id: r.expedition.id }, T0 + tripMins(key) * 60000);
}

test('a fight is decided by the stats and replays the same with the same rolls', () => {
  const strong = fighterOf(dino('a', 100)), weak = creatureFighter('compy_pack', 1);
  const one = fight(strong, weak, seededRand('x')), two = fight(strong, weak, seededRand('x'));
  assert.deepEqual(one, two);
  assert.equal(one.win, true);
  assert.equal(one.hpB, 0);
  // the log adds up: every hit lowers the target's health to "left"
  let hp = { a: one.maxA, b: one.maxB };
  for (const blow of one.log) if (!blow.miss) { const t = blow.by === 'a' ? 'b' : 'a'; hp[t] = Math.max(0, hp[t] - blow.dmg); assert.equal(blow.left, hp[t]); }
  assert.equal(winChance(strong, weak), 1);
  assert.equal(dangerOf(1), 'Easy');
  assert.equal(dangerOf(0.1), 'Deadly');
});

test('every biome has a creature, stronger farther out and strongest in a lair', () => {
  for (const b of Object.values(BIOMES)) assert.ok(CREATURES[b.creature]);
  for (const id of Object.keys(CREATURES)) {
    assert.ok(creatureFighter(id, 5).power > creatureFighter(id, 2).power);
    assert.ok(creatureFighter(id, 5, true).power > creatureFighter(id, 5).power);
    assert.match(creatureFighter(id, 5, true).name, /^Alpha /);
  }
  const lairs = ALL_HEXES.filter(h => isLair(42, h));
  assert.ok(lairs.length > 0);
  for (const h of lairs) { assert.ok(hexDist(h) >= LAIR_MIN_DIST); assert.equal(threatAt(42, h).chance, 1); }
});

// the lairs on the map, weakest creature first
const lairs = seed => ALL_HEXES.filter(h => isLair(seed, h)).sort((x, y) => threatAt(seed, x).foe.power - threatAt(seed, y).foe.power).map(h => hexKey(...h));

test('beating a creature brings its loot and coins on top of the hex', () => {
  const s = game(dino('champ', 100));
  const key = lairs(42)[0];
  const r = trip(s, 'champ', key);
  assert.equal(r.battle.win, true);
  assert.equal(r.battle.lair, true);
  const cLoot = CREATURES[r.battle.creature].loot.map(l => l[0]);
  assert.ok(r.loot.some(l => cLoot.includes(l.id)));
  assert.ok(r.coins > 0);
  assert.equal(injuredLeft(s.hatched[0], T0 + tripMins(key) * 60000) >= 0, true);
});

test('losing brings nothing, still maps the land, and leaves the dinosaur injured', () => {
  const s = game(dino('runt', 1, 'proto'));
  const key = lairs(42).at(-1);
  const coins = s.coins;
  const back = T0 + tripMins(key) * 60000;
  const r = trip(s, 'runt', key);
  assert.equal(r.battle.win, false);
  assert.deepEqual(r.loot, []);
  assert.equal(r.coins, 0);
  assert.equal(s.coins, coins);
  assert.equal(s.world.visited.includes(key), false);
  assert.equal(injuredLeft(s.hatched[0], back), INJURY_MINS * 60000);
  s.hatched[0].lastFed = back;
  assert.equal(exploreProblem(s, 'runt', '1,0', back), 'injured');
});

test('a Healing Herb heals 10 minutes sooner', () => {
  const s = game(dino('a', 50));
  const b = s.hatched[0];
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).reason, 'not-injured');
  b.injuredUntil = T0 + 15 * 60000;
  const herbs = countItem(s, 'herb');
  if (herbs) assert.fail('starts with no herbs');
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).reason, 'no-herb');
  addItem(s, 'herb', 2);
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).left, (15 - HEAL_MINS) * 60000);
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).left, 0);
  assert.equal(b.injuredUntil, undefined);
  assert.equal(countItem(s, 'herb'), 0);
});

test('equipment cannot change while the dinosaur is away', () => {
  const s = game(dino('a', 50));
  s.coins = 1000;
  buyGear(s, 'leather_vest');
  applyAction(s, 'explore', { babyId: 'a', hex: '1,0' }, T0);
  const slot = s.inv.findIndex(x => x && x.id === 'leather_vest');
  assert.equal(equipGear(s, 'a', slot).reason, 'away');
});
