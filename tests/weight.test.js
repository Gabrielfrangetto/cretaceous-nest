import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, buyGear, carryCapacity, carriedWeight, loadFactor, statSheet } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { ITEMS, SPECIES, CARRY, LOAD_AGI_LOSS, PLAYER_ID } from '../js/config.js';

const dino = (id, type, g = 50) => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed: 30, lastFed: 0, genes: { str: g, agi: g, vit: g, res: g }, equip: {} });
function game(...babies) {
  const s = freshState();
  s.coins = 5000;
  s.hatched.push(...babies);
  return s;
}
const slotOf = (s, id) => s.inv.findIndex(x => x && x.id === id);

test('every piece of equipment weighs something and every species has a size', () => {
  for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'gear' || it.kind === 'arms') assert.ok(it.weight > 0, id);
  for (const [k, sp] of Object.entries(SPECIES)) assert.ok(CARRY[sp.size] > 0, k);
});

test('bigger and stronger dinosaurs carry more', () => {
  assert.ok(carryCapacity(dino('a', 'rex')) > carryCapacity(dino('b', 'raptor')));
  assert.ok(carryCapacity(dino('b', 'raptor')) > carryCapacity(dino('c', 'compy')));
  assert.ok(carryCapacity(dino('d', 'rex', 100)) > carryCapacity(dino('e', 'rex', 0)));
});

test('a Compsognathus cannot wear heavy armor; a Tyrannosaurus can', () => {
  const s = game(dino('compy', 'compy'), dino('rex', 'rex'));
  buyGear(s, 'heavy_armor');
  assert.equal(applyAction(s, 'equip', { babyId: 'compy', index: slotOf(s, 'heavy_armor') }, 0).reason, 'too-heavy');
  assert.equal(applyAction(s, 'equip', { babyId: 'rex', index: slotOf(s, 'heavy_armor') }, 0).ok, true);
});

test('a light load costs nothing; a heavy one slows the dinosaur down', () => {
  const s = game(dino('c', 'compy'));
  const c = s.hatched[0];
  const free = statSheet(c).stats.agi;
  buyGear(s, 'feather_scarf');
  applyAction(s, 'equip', { babyId: 'c', index: slotOf(s, 'feather_scarf') }, 0);
  assert.equal(loadFactor(c), 1);
  buyGear(s, 'leather_vest');
  assert.equal(applyAction(s, 'equip', { babyId: 'c', index: slotOf(s, 'leather_vest') }, 0).ok, true);
  assert.ok(carriedWeight(c) > carryCapacity(c) / 2);
  assert.ok(loadFactor(c) < 1 && loadFactor(c) >= 1 - LOAD_AGI_LOSS);
  // the vest's own bonus is resistance, so agility only drops for the load
  assert.ok(statSheet(c).stats.agi < free * 1.12);
});

test('the player carries weight too', () => {
  const s = game();
  for (const id of ['wooden_club', 'wooden_shield', 'hide_tunic', 'hide_cap', 'sandals']) {
    buyGear(s, id);
    assert.equal(applyAction(s, 'equipArms', { index: slotOf(s, id) }, 0).ok, true, id);
  }
  assert.ok(carriedWeight(s.player) <= carryCapacity(s.player));
  assert.equal(s.player.id, PLAYER_ID);
});
