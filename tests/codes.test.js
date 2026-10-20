import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { PROMO_CODES, PROMO_SALT, EGG_TRAY_SIZE } from '../js/config.js';
import { sha256 } from '../js/util.js';

const T0 = 1_700_000_000_000;

test('event codes: kept only as hashes, each redeemed once per game for its egg', () => {
  // the table never holds a code itself
  for (const p of Object.values(PROMO_CODES)) assert.match(p.hash, /^[0-9a-f]{64}$/);
  assert.ok(PROMO_CODES['rex-egg'] && PROMO_CODES['rex-egg'].reward.egg === 'rex');
  PROMO_CODES.test = { hash: sha256(PROMO_SALT + 'TESTCODE1'), reward: { egg: 'proto' } };
  try {
    const s = freshState();
    assert.equal(applyAction(s, 'redeem', { code: 'NOPE' }, T0).reason, 'invalid');
    // capitals, spaces and hyphens don't matter
    assert.equal(applyAction(freshState(), 'redeem', { code: 'testcode1' }, T0).ok, true);
    const r = applyAction(s, 'redeem', { code: ' test-code-1 ' }, T0);
    assert.equal(r.ok, true, r.reason);
    assert.equal(s.eggs.length, 1);
    assert.equal(s.eggs[0].type, 'proto');
    assert.ok(['m', 'f'].includes(s.eggs[0].sex));
    assert.equal(applyAction(s, 'redeem', { code: 'TEST-CODE-1' }, T0).reason, 'used');
    // remembered in the save
    const back = migrate(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(back.redeemed, ['test']);
    assert.equal(applyAction(back, 'redeem', { code: 'TEST-CODE-1' }, T0).reason, 'used');
    // a full tray: nothing redeemed, the code still good
    const full = freshState();
    full.eggs = Array.from({ length: EGG_TRAY_SIZE }, (_, i) => ({ id: `e${i}`, type: 'proto', gen: 1, parents: [], laidAt: 0, genes: { str: 50, agi: 50, vit: 50, res: 50 } }));
    assert.equal(applyAction(full, 'redeem', { code: 'TEST-CODE-1' }, T0).reason, 'tray-full');
    assert.ok(!(full.redeemed || []).includes('test'));
    // past its last day
    PROMO_CODES.test.until = T0 - 1;
    assert.equal(applyAction(freshState(), 'redeem', { code: 'TEST-CODE-1' }, T0).reason, 'expired');
  } finally { delete PROMO_CODES.test; }
});

test('a code can be switched off, and one can give a dinosaur already grown, straight in the nest', async () => {
  const { stageOf } = await import('../js/economy.js');
  assert.equal(PROMO_CODES['rex-egg'].off, true);
  assert.equal(PROMO_CODES['rex-adult'].reward.dino, 'rex');
  PROMO_CODES.test2 = { hash: sha256(PROMO_SALT + 'TESTCODE2'), reward: { dino: 'rex', stage: 'adult' } };
  PROMO_CODES.test3 = { hash: sha256(PROMO_SALT + 'TESTCODE3'), reward: { egg: 'proto' }, off: true };
  try {
    const s = freshState();
    assert.equal(applyAction(s, 'redeem', { code: 'TESTCODE3' }, T0).reason, 'expired');
    const r = applyAction(s, 'redeem', { code: 'TESTCODE2' }, T0);
    assert.equal(r.ok, true, r.reason);
    const rex = s.hatched.find(b => b.type === 'rex');
    assert.ok(rex && stageOf(rex).id === 'adult');
    assert.ok(s.known.includes('rex'));
    assert.equal(s.eggs.length, 0);
    assert.equal(applyAction(s, 'redeem', { code: 'TESTCODE2' }, T0).reason, 'used');
    // it stays grown in the save
    assert.equal(stageOf(migrate(JSON.parse(JSON.stringify(s))).hatched.find(b => b.type === 'rex')).id, 'adult');
  } finally { delete PROMO_CODES.test2; delete PROMO_CODES.test3; }
});
