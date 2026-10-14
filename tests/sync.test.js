import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSave, hasProgress, summarize, capGuestSave, GUEST_LIMITS } from '../js/sync.js';
import { freshState, migrate } from '../js/state.js';
import { countItem, addItem } from '../js/economy.js';

const played = (owner, updatedAt = 100) => {
  const s = freshState();
  s.owner = owner; s.updatedAt = updatedAt; s.coins = 30;
  s.hatched.push({ id: 'b1', type: 'proto', sex: 'f', name: 'Popcorn', at: 1 });
  return s;
};

test('first sign-in takes the guest game to the new account', () => {
  assert.equal(chooseSave(played(null), null, 'u1'), 'claim');
  assert.equal(chooseSave(freshState(), null, 'u1'), 'claim');
});

test('a save left in the browser by another account is not uploaded to this one', () => {
  assert.equal(chooseSave(played('someone-else'), null, 'u1'), 'start-fresh');
  assert.equal(chooseSave(played('someone-else'), played('u1'), 'u1'), 'use-remote');
});

test("the server's copy always wins for the account's owner", () => {
  assert.equal(chooseSave(played('u1', 200), played('u1', 100), 'u1'), 'use-remote');
  assert.equal(chooseSave(played('u1', 100), played('u1', 200), 'u1'), 'use-remote');
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

test('a guest save brought into an account is held to plausible limits', () => {
  const now = 1_000_000;
  const s = freshState();
  s.coins = 999999;
  s.invSize = 100;
  addItem(s, 'leaf', 500);
  addItem(s, 'amber', 50);
  addItem(s, 'golden_shell', 5);
  for (let i = 0; i < 60; i++) s.hatched.push({ id: 'b' + i, type: 'proto', sex: 'f', name: 'x', at: now + 99999, fed: 3 });
  s.current = { type: 'rex', startedAt: now + 5000, duration: 1, bonus: 99999999 };

  const c = capGuestSave(s, now);
  assert.equal(c.coins, GUEST_LIMITS.coins);
  assert.equal(c.invSize, GUEST_LIMITS.invSize);
  assert.equal(c.hatched.length, GUEST_LIMITS.babies);
  assert.ok(c.hatched.every(b => b.at <= now));
  assert.ok(countItem(c, 'leaf') <= GUEST_LIMITS.items.leaf);
  assert.equal(countItem(c, 'amber'), 1);
  assert.equal(countItem(c, 'golden_shell'), 0);     // no Tyrannosaurus hatched, so no golden shells
  assert.equal(c.current.duration, 60 * 60000);      // the real Golden Egg time, whatever the save said
  assert.equal(c.current.startedAt, now);
  assert.equal(c.current.bonus, 30 * 60000);
});

test('an honest guest save keeps its babies, coins and items', () => {
  const s = played(null);
  const c = capGuestSave(JSON.parse(JSON.stringify(s)), Date.now());
  assert.equal(c.coins, s.coins);
  assert.deepEqual(c.hatched.map(b => b.id), ['b1']);
  assert.deepEqual(c.inv, s.inv);
});
