import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, isAdult } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { newWorld } from '../js/world.js';
import { RECIPES, ITEMS, BIOMES, EGG_GENES, STARTERS, ROLES, DIET, STATS } from '../js/config.js';

const T0 = 1_000_000_000_000;
function game() {
  const s = freshState();
  s.world = newWorld(42);
  return s;
}

test('the Forge turns materials into equipment the Shop does not sell', () => {
  const s = game();
  const r = RECIPES.find(x => x.id === 'clay_plate');
  assert.equal(ITEMS.clay_plate.price, undefined);
  assert.equal(applyAction(s, 'craft', { id: 'clay_plate' }, T0).reason, 'materials');
  for (const [item, n] of Object.entries(r.needs)) addItem(s, item, n);
  assert.equal(applyAction(s, 'craft', { id: 'clay_plate' }, T0).ok, true);
  assert.equal(countItem(s, 'clay_plate'), 1);
  for (const item of Object.keys(r.needs)) assert.equal(countItem(s, item), 0);
  assert.equal(applyAction(s, 'craft', { id: 'nothing' }, T0).reason, 'unknown-recipe');
  // equipment, or a remedy
  for (const rec of RECIPES) assert.ok(['gear', 'arms'].includes(ITEMS[rec.id].kind) || rec.id === 'transfusion');
});

test('trips that come home can find an egg of the biome, with genes for its distance', async () => {
  const { ALL_HEXES, hexKey, hexDist, biomeAt, tripMins } = await import('../js/world.js');
  const s = game();
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  const champ = { id: 'c', type: 'rex', sex: 'm', name: 'C', at: 0, gen: 1, fed: 30, lastFed: T0, genes: { str: 100, agi: 100, vit: 100, res: 100 }, equip: {} };
  s.hatched.push(champ);
  const far = ALL_HEXES.find(h => hexDist(h) === 4 && biomeAt(42, h) === 'forest');
  const key = hexKey(...far);
  let egg = null, t = T0;
  for (let i = 0; i < 60 && !egg; i++) {
    champ.lastFed = t; delete champ.injuredUntil;
    const r = applyAction(s, 'explore', { babyId: 'c', hex: key }, t);
    assert.equal(r.ok, true, r.reason);
    t += tripMins(key) * 60000;
    egg = applyAction(s, 'collectTrip', { id: r.expedition.id }, t).egg;
  }
  assert.ok(egg, 'an egg within 60 trips');
  assert.ok(BIOMES.forest.eggs.includes(egg.type));
  const [lo, hi] = EGG_GENES(4, false);
  for (const { id } of STATS) assert.ok(egg.genes[id] >= lo && egg.genes[id] <= hi);
  assert.ok(s.eggs.some(e => e.id === egg.id));
  // and it hatches in the incubator like any other egg
  assert.equal(applyAction(s, 'startEgg', { eggId: egg.id }, t).ok, true);
  assert.equal(s.current.type, egg.type);
});

test('the incubator only hatches eggs you have', () => {
  const s = game();
  assert.equal(applyAction(s, 'startEgg', { type: 'rex' }, T0).reason, 'unknown-egg');
  assert.equal(s.current, null);
});

test('a new game starts by picking one of four starter babies, a fighter or an explorer of each diet, once', () => {
  const s = game();
  assert.equal(s.starter, false);
  assert.deepEqual(STARTERS, ['dilo', 'proto', 'compy', 'hypsi']);
  assert.deepEqual(STARTERS.map(t => [ROLES[t].role, DIET[t][0]]), [['Fighter', 'meat'], ['Fighter', 'leaf'], ['Explorer', 'meat'], ['Explorer', 'leaf']]);
  assert.equal(applyAction(s, 'pickStarter', { type: 'psitta' }, T0).reason, 'unknown-species');
  assert.equal(applyAction(s, 'pickStarter', { type: 'rex' }, T0).reason, 'unknown-species');
  const r = applyAction(s, 'pickStarter', { type: 'dilo' }, T0);
  assert.equal(r.ok, true);
  assert.equal(s.hatched.length, 1);
  assert.equal(s.hatched[0].type, 'dilo');
  assert.equal(applyAction(s, 'pickStarter', { type: 'compy' }, T0).reason, 'picked');
  // the same save offers the same baby in the browser and on the server
  const twin = game();
  applyAction(twin, 'pickStarter', { type: 'dilo' }, T0);
  assert.deepEqual([twin.hatched[0].sex, twin.hatched[0].genes], [s.hatched[0].sex, s.hatched[0].genes]);
  // games from before starters have already started
  const old = game(); delete old.starter; old.saveVersion = 8;
  assert.equal(migrate(old).starter, true);
});

test('one fighter hits harder and the other is tougher; one explorer is quicker and the other balanced', async () => {
  const { SPECIES_BASE: B } = await import('../js/config.js');
  assert.ok(B.dilo.str > B.dilo.res && B.proto.res > B.proto.str);
  assert.ok(B.compy.agi > B.hypsi.agi + 20 && B.compy.agi === Math.max(...STARTERS.map(t => B[t].agi)));
  const h = Object.values(B.hypsi);
  assert.ok(Math.max(...h) - Math.min(...h) <= 10);
  assert.deepEqual(STARTERS.map(t => DIET[t][0]), ['meat', 'leaf', 'meat', 'leaf']);
});

test('rarer species have higher base totals, and every species has a diet and eggs somewhere', async () => {
  const { SPECIES, SPECIES_BASE, RARITIES } = await import('../js/config.js');
  const TOTAL = { Starter: 200, Common: 200, Uncommon: 230, Rare: 260, Epic: 285, Legendary: 310 };
  assert.equal(Object.keys(SPECIES).length, 20);
  for (const [k, sp] of Object.entries(SPECIES)) {
    assert.equal(Object.values(SPECIES_BASE[k]).reduce((a, b) => a + b, 0), TOTAL[sp.rarity], k);
    assert.ok(RARITIES[sp.rarity] && DIET[k].length && DIET[k].every(f => ITEMS[f]), k);
    assert.ok(Object.values(BIOMES).some(b => b.eggs.includes(k)), k + ' has eggs somewhere');
  }
});

test('eggs near the nest are common; rare ones need distance; legendaries only lairs', async () => {
  const { eggKinds } = await import('../js/world.js');
  const { SPECIES } = await import('../js/config.js');
  const rarities = (b, d, lair) => [...new Set(eggKinds(b, d, lair).map(k => SPECIES[k.type].rarity))].sort();
  assert.deepEqual(rarities('meadow', 1, false), ['Common', 'Starter']);
  assert.deepEqual(rarities('forest', 2, false), ['Common', 'Starter']);
  assert.ok(rarities('forest', 5, false).includes('Rare'));
  assert.ok(!rarities('volcano', 7, false).includes('Legendary'));
  assert.ok(rarities('volcano', 5, true).includes('Legendary'));
});

test('a meal uses the favourite food in the inventory; omnivores eat almost anything', async () => {
  const { mealFor, dietLabel, addItem, removeItem, countItem } = await import('../js/economy.js');
  const s = game();
  removeItem(s, 'leaf', countItem(s, 'leaf'));
  removeItem(s, 'meat', countItem(s, 'meat'));
  assert.equal(mealFor(s, 'galli'), null);
  addItem(s, 'raw_egg', 1);
  assert.equal(mealFor(s, 'galli'), 'raw_egg');
  addItem(s, 'leaf', 1);
  assert.equal(mealFor(s, 'galli'), 'leaf');
  addItem(s, 'meat', 1);
  assert.equal(mealFor(s, 'bary'), 'meat');
  addItem(s, 'fish', 1);
  assert.equal(mealFor(s, 'bary'), 'fish');
  assert.deepEqual(['dilo', 'psitta', 'galli', 'bary'].map(dietLabel), ['Meat eater', 'Plant eater', 'Omnivore', 'Fish eater']);
});
