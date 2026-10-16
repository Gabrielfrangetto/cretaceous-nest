import { test } from 'node:test';
import { collect } from './journey-helper.js';
import assert from 'node:assert/strict';
import { applyAction, statSheet, buyGear, countItem, addItem } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { fighterOf } from '../js/combat.js';
import { newWorld, exploreProblem, tripMins, isAway, injuredLeft, ALL_HEXES, hexKey } from '../js/world.js';
import { PLAYER_ID, PLAYER_BASE, PLAYER_SLOTS, ITEMS, WORLD_RADIUS } from '../js/config.js';

const T0 = 1_000_000_000_000;
function game() {
  const s = freshState();
  s.world = newWorld(42);
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  s.coins = 1000;
  return s;
}
const slotOf = (s, id) => s.inv.findIndex(x => x && x.id === id);

test('every game has the player, with their own base stats', () => {
  const s = freshState();
  assert.equal(s.player.id, PLAYER_ID);
  assert.deepEqual(statSheet(s.player).stats, PLAYER_BASE);
  const old = freshState(); delete old.player; old.saveVersion = 9;
  const m = migrate(old);
  assert.equal(m.saveVersion, SAVE_VERSION);
  assert.equal(m.player.name, 'You');
});

test('the player explores anywhere without a dinosaur and never gets hungry', () => {
  const s = game();
  const far = hexKey(WORLD_RADIUS, 0);
  assert.equal(exploreProblem(s, PLAYER_ID, far, T0 + 1e9), null);
  const r = applyAction(s, 'explore', { babyId: PLAYER_ID, hex: '1,0' }, T0);
  assert.equal(r.ok, true);
  assert.equal(isAway(s, PLAYER_ID), true);
  const back = collect(s, { id: r.expedition.id }, T0 + tripMins('1,0') * 60000);
  assert.equal(back.ok, true);
  assert.equal(s.player.lastFed, undefined);
});

test('weapons and armor go on the player, one per slot, and raise its stats', () => {
  const s = game();
  for (const id of ['wooden_club', 'hide_tunic']) assert.equal(buyGear(s, id).ok, true);
  const before = statSheet(s.player).stats;
  assert.equal(applyAction(s, 'equipArms', { index: slotOf(s, 'wooden_club') }, T0).ok, true);
  assert.equal(applyAction(s, 'equipArms', { index: slotOf(s, 'hide_tunic') }, T0).ok, true);
  assert.deepEqual(s.player.equip, { weapon: 'wooden_club', body: 'hide_tunic' });
  const after = statSheet(s.player).stats;
  assert.equal(after.str, before.str + 8);
  assert.equal(after.res, before.res + 8);
  assert.ok(fighterOf(s.player).damage > 0);
  // dinosaur equipment does not fit the player, and the player's does not fit dinosaurs
  buyGear(s, 'leather_vest');
  assert.equal(applyAction(s, 'equipArms', { index: slotOf(s, 'leather_vest') }, T0).reason, 'not-arms');
  assert.equal(applyAction(s, 'unequipArms', { slot: 'weapon' }, T0).ok, true);
  assert.equal(countItem(s, 'wooden_club'), 1);
  for (const { id } of PLAYER_SLOTS) assert.ok(Object.values(ITEMS).some(it => it.kind === 'arms' && it.slot === id), id);
});

test('arms cannot change while the player is away, and the player can be hurt and healed', () => {
  const s = game();
  buyGear(s, 'sandals');
  applyAction(s, 'explore', { babyId: PLAYER_ID, hex: '1,0' }, T0);
  assert.equal(applyAction(s, 'equipArms', { index: slotOf(s, 'sandals') }, T0).reason, 'away');
  s.player.injuredUntil = T0 + 15 * 60000;
  addItem(s, 'herb', 1);
  assert.equal(applyAction(s, 'heal', { babyId: PLAYER_ID }, T0).ok, true);
  assert.equal(injuredLeft(s.player, T0), 5 * 60000);
});

test('loaded players are cleaned', () => {
  const s = game();
  s.player = { name: '   ', equip: { weapon: 'leather_vest', head: 'hide_cap', feet: 'nonsense' }, injuredUntil: 'x' };
  const p = migrate(s).player;
  assert.deepEqual(p, { id: PLAYER_ID, name: 'You', equip: { head: 'hide_cap' } });
});
