import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, isAdult } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { newWorld } from '../js/world.js';
import { RECIPES, ITEMS, BIOMES, EGG_GENES, STARTERS, DIET, STATS } from '../js/config.js';

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
  for (const rec of RECIPES) assert.ok(['gear', 'arms'].includes(ITEMS[rec.id].kind));
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

test('a new game starts by picking one of four starter babies, once', () => {
  const s = game();
  assert.equal(s.starter, false);
  assert.equal(STARTERS.length, 4);
  assert.deepEqual(STARTERS.map(t => DIET[t]).sort(), ['leaf', 'leaf', 'meat', 'meat']);
  assert.equal(applyAction(s, 'pickStarter', { type: 'rex' }, T0).reason, 'unknown-species');
  const r = applyAction(s, 'pickStarter', { type: 'psitta' }, T0);
  assert.equal(r.ok, true);
  assert.equal(s.hatched.length, 1);
  assert.equal(s.hatched[0].type, 'psitta');
  assert.equal(applyAction(s, 'pickStarter', { type: 'compy' }, T0).reason, 'picked');
  // the same save offers the same baby in the browser and on the server
  const twin = game();
  applyAction(twin, 'pickStarter', { type: 'psitta' }, T0);
  assert.deepEqual([twin.hatched[0].sex, twin.hatched[0].genes], [s.hatched[0].sex, s.hatched[0].genes]);
  // games from before starters have already started
  const old = game(); delete old.starter; old.saveVersion = 8;
  assert.equal(migrate(old).starter, true);
});

test('each starter is led by a different stat: two meat eaters (STR, AGI), two plant eaters (RES, VIT)', async () => {
  const { SPECIES_BASE } = await import('../js/config.js');
  const top = t => Object.entries(SPECIES_BASE[t]).sort((a, b) => b[1] - a[1])[0][0];
  assert.deepEqual(STARTERS.map(t => [t, DIET[t], top(t)]), [
    ['dilo', 'meat', 'str'], ['compy', 'meat', 'agi'], ['scelido', 'leaf', 'res'], ['psitta', 'leaf', 'vit'],
  ]);
});
