import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, exportCode, parseCode, freshState, SAVE_VERSION } from '../js/state.js';
import { countItem } from '../js/economy.js';
import { SLOTS } from '../js/config.js';

test('a save from the Portuguese prototype is upgraded', () => {
  const inv = Array(SLOTS).fill(null);
  inv[0] = { id: 'samambaia', n: 7 };
  inv[1] = { id: 'carne', n: 3 };
  inv[42] = { id: 'casca_dourada', n: 1 };    // outside the unlocked row
  const old = { v: 1, current: null, hatched: [{ id: 'abc', type: 'proto', name: 'Pipoca', at: 1 }], coins: 40, inv, invSize: 10 };

  const s = migrate(old);
  assert.equal(s.saveVersion, SAVE_VERSION);
  assert.equal(countItem(s, 'leaf'), 7);
  assert.equal(countItem(s, 'meat'), 3);
  assert.equal(countItem(s, 'golden_shell'), 1);
  assert.equal(s.inv[42], null);
  assert.equal(s.coins, 40);
});

test('a save from before the inventory existed gets the starter items', () => {
  const s = migrate({ current: null, hatched: [], updatedAt: 5 });
  assert.equal(s.invSize, 10);
  assert.equal(countItem(s, 'leaf'), 20);
  assert.equal(s.coins, 0);
});

test('saves from a newer version or with junk are refused', () => {
  assert.throws(() => migrate({ saveVersion: SAVE_VERSION + 1, hatched: [] }), /newer version/);
  assert.throws(() => migrate({ hello: 'world' }), /not a Cretaceous Nest save/);
});

test('unknown items, species and impossible numbers are cleaned up', () => {
  const s = freshState();
  s.inv[0] = { id: 'diamond', n: 5 };
  s.inv[1] = { id: 'leaf', n: 500 };
  s.coins = -20;
  s.hatched.push({ id: 'x', type: 'dragon', at: 1 });
  const clean = migrate(s);
  assert.equal(clean.inv[0], null);
  assert.equal(clean.inv[1].n, 99);
  assert.equal(clean.coins, 0);
  assert.equal(clean.hatched.length, 0);
});

test('a save code round-trips, names with accents included', () => {
  const s = freshState();
  s.coins = 123;
  s.hatched.push({ id: 'b1', type: 'rex', sex: 'f', name: 'Pipoca Ñandú 🦖', at: 99 });
  const back = parseCode(exportCode(s));
  assert.equal(back.coins, 123);
  assert.equal(back.hatched[0].name, 'Pipoca Ñandú 🦖');
});

test('a damaged code gives a clear error', () => {
  const code = exportCode(freshState());
  assert.throws(() => parseCode(code.slice(0, 40)), /incomplete or damaged/);
  assert.throws(() => parseCode('hello'), /not a Cretaceous Nest save/);
});
