import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setOutfit, applyAction } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import { OUTFITS, DRAWN_SLOTS } from '../js/config.js';

// a test outfit, so these run before the first real one ships
OUTFITS.test_rex = { name: 'Test', species: 'rex', sprites: { m: 'x-m.png', f: 'x-f.png' } };

const genes = n => ({ str: n, agi: n, vit: n, res: n });
function withBabies() {
  const s = freshState();
  s.hatched.push({ id: 'r1', type: 'rex', sex: 'm', name: 'Rex', at: 0, gen: 1, genes: genes(50), equip: {} });
  s.hatched.push({ id: 'p1', type: 'proto', sex: 'f', name: 'Pip', at: 0, gen: 1, genes: genes(50), equip: {} });
  return s;
}

test('only head and neck pieces are drawn', () => {
  assert.deepEqual(DRAWN_SLOTS, ['head', 'neck']);
});

test('an outfit is worn only when owned and made for the species', () => {
  const s = withBabies();
  assert.equal(setOutfit(s, 'r1', 'test_rex').reason, 'not-owned');
  s.wardrobe.push('test_rex');
  assert.equal(setOutfit(s, 'p1', 'test_rex').reason, 'wrong-species');
  assert.equal(setOutfit(s, 'r1', 'test_rex').ok, true);
  assert.equal(s.hatched[0].outfit, 'test_rex');
  assert.equal(applyAction(s, 'setOutfit', { babyId: 'r1' }).ok, true);
  assert.equal(s.hatched[0].outfit, undefined);
});

test('old saves get an empty wardrobe', () => {
  const s = withBabies();
  delete s.wardrobe;
  s.saveVersion = 6;
  const m = migrate(s);
  assert.equal(m.saveVersion, SAVE_VERSION);
  assert.deepEqual(m.wardrobe, []);
});

test('guest saves keep no outfits', () => {
  const s = withBabies();
  s.wardrobe.push('test_rex');
  s.hatched[0].outfit = 'test_rex';
  const g = capGuestSave(s);
  assert.deepEqual(g.wardrobe, []);
  assert.equal(g.hatched.find(b => b.id === 'r1').outfit, undefined);
});
