import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSave, hasProgress, summarize } from '../js/sync.js';
import { freshState, migrate } from '../js/state.js';

const played = (owner, updatedAt = 100) => {
  const s = freshState();
  s.owner = owner; s.updatedAt = updatedAt; s.coins = 30;
  s.hatched.push({ id: 'b1', type: 'proto', sex: 'f', name: 'Popcorn', at: 1 });
  return s;
};

test('first sign-in takes the guest game to the new account', () => {
  assert.equal(chooseSave(played(null), null, 'u1'), 'upload-local');
  assert.equal(chooseSave(freshState(), null, 'u1'), 'upload-local');
});

test("a save left in the browser by another account is not uploaded to this one", () => {
  assert.equal(chooseSave(played('someone-else'), null, 'u1'), 'start-fresh');
  assert.equal(chooseSave(played('someone-else'), played('u1'), 'u1'), 'use-remote');
});

test('for the same account the newer save wins', () => {
  assert.equal(chooseSave(played('u1', 200), played('u1', 100), 'u1'), 'upload-local');
  assert.equal(chooseSave(played('u1', 100), played('u1', 200), 'u1'), 'use-remote');
  assert.equal(chooseSave(played('u1', 100), played('u1', 100), 'u1'), 'use-remote');
});

test('a guest game with progress and an account save with progress asks the player', () => {
  assert.equal(chooseSave(played(null), played('u1'), 'u1'), 'ask');
});

test('an empty guest game simply loads the account save', () => {
  assert.equal(hasProgress(freshState()), false);
  assert.equal(chooseSave(freshState(), played('u1'), 'u1'), 'use-remote');
});

test('summaries describe a save in a few words', () => {
  const s = played('u1');
  s.current = { type: 'rex', startedAt: 0, duration: 1, bonus: 0 };
  assert.equal(summarize(s), '1 baby, 30 coins, an egg in the incubator');
});

test('the owner survives loading and junk owners are dropped', () => {
  assert.equal(migrate(played('u1')).owner, 'u1');
  const s = played(null); s.owner = 42;
  assert.equal(migrate(s).owner, null);
});
