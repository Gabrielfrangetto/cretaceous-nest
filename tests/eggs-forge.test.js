import { test } from 'node:test';
import { collect } from './journey-helper.js';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, isAdult } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { newWorld, landHexes } from '../js/world.js';
import { RECIPES, ITEMS, BIOMES, EGG_GENES, STARTERS, ROLES, DIET, STATS, SPECIES } from '../js/config.js';

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
  for (const rec of RECIPES) assert.ok(['gear', 'arms'].includes(ITEMS[rec.id].kind) || rec.id === 'transfusion' || rec.id === 'water_skin');
});

test('eggs are taken from nests found on the way: of a species that nests there, with its genes', async () => {
  const { ALL_HEXES, hexKey, hexDist } = await import('../js/world.js');
  const { NEST: N } = await import('../js/config.js');
  const s = game();
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  const champ = { id: 'c', type: 'rex', sex: 'm', name: 'C', at: 0, gen: 1, fed: 30, lastFed: T0, genes: { str: 100, agi: 100, vit: 100, res: 100 }, equip: {} };
  s.hatched.push(champ);
  const far = landHexes(42).filter(h => hexDist(h) >= 14 && hexDist(h) <= 20);
  let egg = null, t = T0, nests = 0;
  for (let i = 0; i < 120 && !egg; i++) {
    champ.lastFed = t; delete champ.injuredUntil; delete champ.critical;
    if (!s.hatched.includes(champ)) s.hatched.push(champ);
    const r = applyAction(s, 'explore', { babyId: 'c', hex: hexKey(...far[i % far.length]) }, t);
    assert.equal(r.ok, true, r.reason);
    t = r.expedition.leg.arriveAt;
    const c = collect(s, { id: r.expedition.id, nest: 'fight' }, t);
    nests += c.story.filter(e => e.kind === 'nest').length;
    egg = c.story.flatMap(e => (e.kind === 'nest' && !e.unseen ? e.eggs || [] : [])).find(Boolean) || null;
    t += 1e7;
  }
  assert.ok(nests > 0 && egg, 'a nest raided within 120 trips');
  assert.ok(Object.values(N.where).some(w => w[egg.type]));
  const { EGG_STEP } = await import('../js/config.js');
  const [lo, hi] = EGG_GENES(EGG_STEP, false);
  for (const { id } of STATS) assert.ok(egg.genes[id] >= lo && egg.genes[id] <= hi);
  assert.ok(s.eggs.some(e => e.id === egg.id));
  // and it hatches in the incubator like any other egg
  assert.equal(applyAction(s, 'startEgg', { eggId: egg.id }, t).ok, true);
  assert.equal(s.current.type, egg.type);
  // whose it is, no one knows until it hatches (a starter's, or one already hatched, aside)
  const { knows } = await import('../js/journey.js');
  const { hatchEgg } = await import('../js/economy.js');
  assert.equal(knows(s, egg.type), SPECIES[egg.type].rarity === 'Starter' || egg.type === 'rex');
  // its sex was settled when it was taken: whatever the dice at hatching, the baby is that sex
  assert.ok(['m', 'f'].includes(egg.sex));
  const h = hatchEgg(s, t + 1e10, () => (egg.sex === 'm' ? 0.99 : 0));
  assert.equal(h.baby.sex, egg.sex);
  assert.deepEqual(h.baby.genes, egg.genes);
  assert.ok(knows(s, egg.type) && s.known.includes(egg.type));
});

test('the incubator only hatches eggs you have', () => {
  const s = game();
  assert.equal(applyAction(s, 'startEgg', { type: 'rex' }, T0).reason, 'unknown-egg');
  assert.equal(s.current, null);
});

test('a new game starts by picking one of four starter babies, a fighter or an explorer of each diet, once', () => {
  const s = game();
  assert.equal(s.starter, false);
  // common in the fossil record and small: two meat eaters and two plant eaters
  assert.deepEqual(STARTERS, ['coelo', 'raptor', 'psitta', 'proto']);
  assert.deepEqual(STARTERS.map(t => DIET[t][0]), ['meat', 'meat', 'leaf', 'leaf']);
  for (const t of STARTERS) assert.ok(ROLES[t] && ROLES[t].role, t);
  assert.equal(applyAction(s, 'pickStarter', { type: 'dilo' }, T0).reason, 'unknown-species');
  assert.equal(applyAction(s, 'pickStarter', { type: 'rex' }, T0).reason, 'unknown-species');
  const r = applyAction(s, 'pickStarter', { type: 'coelo' }, T0);
  assert.equal(r.ok, true);
  assert.equal(s.hatched.length, 1);
  assert.equal(s.hatched[0].type, 'coelo');
  assert.equal(applyAction(s, 'pickStarter', { type: 'raptor' }, T0).reason, 'picked');
  // the same save offers the same baby in the browser and on the server
  const twin = game();
  applyAction(twin, 'pickStarter', { type: 'coelo' }, T0);
  assert.deepEqual([twin.hatched[0].sex, twin.hatched[0].genes], [s.hatched[0].sex, s.hatched[0].genes]);
  // games from before starters have already started
  const old = game(); delete old.starter; old.saveVersion = 8;
  assert.equal(migrate(old).starter, true);
});

test('the starters each stand out: the quickest hunter, the hardest-hitting one, the toughest and the sturdiest forager', async () => {
  const { SPECIES_BASE: B } = await import('../js/config.js');
  // Velociraptor the quickest of them, Coelophysis hits harder than it, Protoceratops the toughest,
  // Psittacosaurus the most vital
  assert.equal(B.raptor.agi, Math.max(...STARTERS.map(t => B[t].agi)));
  assert.ok(B.coelo.str > B.raptor.str);
  assert.equal(B.proto.res, Math.max(...STARTERS.map(t => B[t].res)));
  assert.equal(B.psitta.vit, Math.max(...STARTERS.map(t => B[t].vit)));
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

test("eggs come by their biome and rarity, wherever they are found; legendaries only in lairs", async () => {
  const { eggKinds } = await import('../js/world.js');
  const { SPECIES, RARITIES } = await import('../js/config.js');
  const rarities = (b, lair) => [...new Set(eggKinds(b, 0, lair).map(k => SPECIES[k.type].rarity))].sort();
  assert.ok(rarities('forest', false).includes('Rare'));
  assert.ok(!rarities('volcano', false).includes('Legendary'));
  assert.ok(rarities('volcano', true).includes('Legendary'));
  // rarer kinds are just rarer
  const w = Object.fromEntries(eggKinds('forest', 0, false).map(k => [SPECIES[k.type].rarity, k.weight]));
  assert.ok(w.Common > w.Rare && RARITIES.Common.weight > RARITIES.Rare.weight);
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
