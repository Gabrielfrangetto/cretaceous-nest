import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyGear, equipGear, unequipGear, statSheet, gearMods, countItem, addItem, applyAction, roomFor } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import { ITEMS, SPECIES_BASE } from '../js/config.js';

const genes = n => ({ str: n, agi: n, vit: n, res: n });
function withRex(coins = 1000) {
  const s = freshState();
  s.coins = coins;
  s.hatched.push({ id: 'r1', type: 'rex', sex: 'm', name: 'Rex', at: 0, gen: 1, genes: genes(100), equip: {} });
  return s;
}
const slotOf = (s, id) => s.inv.findIndex(x => x && x.id === id);

test('equipment is bought with coins and takes a slot of its own', () => {
  const s = withRex(500);
  assert.equal(buyGear(s, 'heavy_armor').ok, true);
  assert.equal(buyGear(s, 'heavy_armor').ok, true);
  assert.equal(s.coins, 500 - 2 * ITEMS.heavy_armor.price);
  assert.equal(countItem(s, 'heavy_armor'), 2);
  assert.equal(s.inv.filter(x => x && x.id === 'heavy_armor').length, 2);   // two slots, not a stack of 2
  assert.equal(buyGear(s, 'leaf').reason, 'unknown-item');
  assert.equal(buyGear(withRex(10), 'heavy_armor').reason, 'coins');
});

test('wearing heavy armor raises resistance and lowers agility', () => {
  const s = withRex();
  buyGear(s, 'heavy_armor');
  const before = statSheet(s.hatched[0]).stats;
  assert.equal(equipGear(s, 'r1', slotOf(s, 'heavy_armor')).ok, true);
  const after = statSheet(s.hatched[0]).stats;
  assert.equal(after.res, SPECIES_BASE.rex.res + 30);
  assert.equal(after.agi, Math.round(SPECIES_BASE.rex.agi * 0.75));
  assert.equal(after.str, before.str);
  assert.equal(countItem(s, 'heavy_armor'), 0);
});

test('equipping over a worn item puts the old one back in the bag', () => {
  const s = withRex();
  buyGear(s, 'leather_vest'); buyGear(s, 'heavy_armor');
  equipGear(s, 'r1', slotOf(s, 'leather_vest'));
  const r = equipGear(s, 'r1', slotOf(s, 'heavy_armor'));
  assert.equal(r.removed, 'leather_vest');
  assert.equal(s.hatched[0].equip.body, 'heavy_armor');
  assert.equal(countItem(s, 'leather_vest'), 1);
});

test('one item per slot, and bonuses from different slots stack', () => {
  const s = withRex();
  for (const id of ['bone_helmet', 'spiked_collar', 'heavy_armor', 'swift_cape']) { buyGear(s, id); equipGear(s, 'r1', slotOf(s, id)); }
  assert.deepEqual(s.hatched[0].equip, { head: 'bone_helmet', neck: 'spiked_collar', body: 'heavy_armor', back: 'swift_cape' });
  assert.equal(gearMods(s.hatched[0]).length, 3 + 1 + 2 + 1);
  // agility: -5% (helmet) -25% (armor) +15% (cape) add up to -15%
  assert.equal(statSheet(s.hatched[0]).stats.agi, Math.round(40 * 0.85));
});

test('taking equipment off needs room in the bag', () => {
  const s = withRex();
  buyGear(s, 'swift_cape');
  equipGear(s, 'r1', slotOf(s, 'swift_cape'));
  for (let i = 0; i < s.invSize; i++) if (!s.inv[i]) s.inv[i] = { id: 'amber', n: 99 };
  assert.equal(roomFor(s, 'swift_cape'), 0);
  assert.equal(unequipGear(s, 'r1', 'back').reason, 'room');
  s.inv[0] = null;
  assert.equal(unequipGear(s, 'r1', 'back').ok, true);
  assert.deepEqual(s.hatched[0].equip, {});
  assert.equal(unequipGear(s, 'r1', 'back').reason, 'empty');
});

test('only equipment can be worn', () => {
  const s = withRex();
  assert.equal(equipGear(s, 'r1', slotOf(s, 'leaf')).reason, 'not-gear');
  assert.equal(equipGear(s, 'nobody', 0).reason, 'missing');
  assert.equal(applyAction(s, 'equip', { babyId: 'r1', index: 77 }, 0).reason, 'bad-slot');
});

test('a version 5 save gets empty equipment, and junk in it is dropped', () => {
  const old = freshState();
  old.saveVersion = 5;
  old.hatched.push({ id: 'b1', type: 'rex', sex: 'm', name: 'R', at: 1, gen: 1, genes: genes(40) });
  assert.deepEqual(migrate(old).hatched[0].equip, {});
  assert.equal(migrate(old).saveVersion, SAVE_VERSION);

  const bad = freshState();
  bad.hatched.push({ id: 'b1', type: 'rex', sex: 'm', name: 'R', at: 1, gen: 1, genes: genes(40), equip: { head: 'heavy_armor', body: 'heavy_armor', neck: 'leaf', back: 'swift_cape' } });
  assert.deepEqual(migrate(bad).hatched[0].equip, { body: 'heavy_armor', back: 'swift_cape' });
});

test('a guest save keeps at most one of each piece of equipment', () => {
  const s = withRex();
  s.hatched.push({ id: 'r2', type: 'rex', sex: 'f', name: 'Ruby', at: 0, gen: 1, genes: genes(40), equip: { body: 'heavy_armor' } });
  s.hatched[0].equip = { body: 'heavy_armor', back: 'swift_cape' };
  addItem(s, 'heavy_armor', 3); addItem(s, 'spiked_collar', 2);
  const c = capGuestSave(s, Date.now());
  assert.deepEqual(c.hatched[0].equip, { body: 'heavy_armor', back: 'swift_cape' });
  assert.deepEqual(c.hatched[1].equip, {});
  assert.equal(countItem(c, 'heavy_armor'), 0);
  assert.equal(countItem(c, 'spiked_collar'), 1);
});
