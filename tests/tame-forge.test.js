import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, isAdult } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import { newWorld } from '../js/world.js';
import { RECIPES, ITEMS, CREATURES, TAME_FOOD, TAME_OFFERS, TAME_GENES, STATS } from '../js/config.js';

const T0 = 1_000_000_000_000;
const offer = (n, extra = {}) => ({ id: 'o' + n, creature: 'wild_raptor', type: 'raptor', sex: 'f', genes: { str: 60, agi: 60, vit: 60, res: 60 }, lair: false, dist: 6, at: T0, ...extra });
function game() {
  const s = freshState();
  s.world = newWorld(42);
  return s;
}

test('a tamed creature joins the nest as an adult with its genes, paid for with food', () => {
  const s = game();
  s.world.offers.push(offer(1));
  const meat = countItem(s, 'meat');
  const r = applyAction(s, 'tame', { id: 'o1' }, T0);
  assert.equal(r.ok, true);
  assert.equal(countItem(s, 'meat'), meat - TAME_FOOD);
  const b = s.hatched[0];
  assert.equal(b.type, 'raptor');
  assert.equal(b.tamed, true);
  assert.equal(isAdult(b), true);
  assert.deepEqual(b.genes, { str: 60, agi: 60, vit: 60, res: 60 });
  assert.equal(s.world.offers.length, 0);
  assert.equal(applyAction(s, 'tame', { id: 'o1' }, T0).reason, 'no-offer');
});

test('taming needs enough food; releasing just lets it go', () => {
  const s = game();
  s.world.offers.push(offer(1, { type: 'proto', creature: 'angry_protos' }));
  const leaves = countItem(s, 'leaf');
  applyAction(s, 'sort', {}, T0);
  for (let i = 0; i < leaves; i++) applyAction(s, 'discard', { i: s.inv.findIndex(x => x && x.id === 'leaf') }, T0);
  assert.equal(applyAction(s, 'tame', { id: 'o1' }, T0).reason, 'no-food');
  assert.equal(applyAction(s, 'release', { id: 'o1' }, T0).ok, true);
  assert.equal(s.world.offers.length, 0);
});

test('only creatures of our species can be tamed, and loaded offers stay within their genes', () => {
  const tameable = Object.values(CREATURES).filter(c => c.tame).length;
  assert.ok(tameable >= 3);
  const s = game();
  s.world.offers.push(offer(1, { genes: { str: 100, agi: 100, vit: 100, res: 100 } }), offer(2, { creature: 'compy_pack' }), offer(3), offer(4), offer(5));
  const w = migrate(s).world;
  assert.equal(w.offers.length, TAME_OFFERS);
  assert.ok(!w.offers.some(o => o.creature === 'compy_pack'));
  const [, hi] = TAME_GENES(6, false);
  for (const o of w.offers) for (const { id } of STATS) assert.ok(o.genes[id] <= hi);
  assert.equal(capGuestSave(migrate(s), T0).world.offers.length, 0);
});

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
  for (const rec of RECIPES) assert.equal(ITEMS[rec.id].kind, 'gear');
});

test('beating a creature of our species can bring it home, with genes for its distance', async () => {
  const { ALL_HEXES, hexKey, hexDist, threatAt, tripMins } = await import('../js/world.js');
  const s = game();
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  const champ = { id: 'c', type: 'rex', sex: 'm', name: 'C', at: 0, gen: 1, fed: 30, lastFed: T0, genes: { str: 100, agi: 100, vit: 100, res: 100 }, equip: {} };
  s.hatched.push(champ);
  const forest = ALL_HEXES.find(h => threatAt(42, h).id === 'wild_raptor' && threatAt(42, h).lair);
  const key = hexKey(...forest);
  let got = null, t = T0;
  for (let i = 0; i < 40 && !got; i++) {
    champ.lastFed = t; delete champ.injuredUntil;
    const r = applyAction(s, 'explore', { babyId: 'c', hex: key }, t);
    assert.equal(r.ok, true, r.reason);
    t += tripMins(key) * 60000;
    got = applyAction(s, 'collectTrip', { id: r.expedition.id }, t).battle.offer;
  }
  assert.ok(got, 'an offer within 40 lair wins');
  assert.equal(got.type, 'raptor');
  const [lo, hi] = TAME_GENES(hexDist(forest), true);
  for (const { id } of STATS) assert.ok(got.genes[id] >= lo && got.genes[id] <= hi);
  assert.ok(s.world.offers.some(o => o.id === got.id));
});
