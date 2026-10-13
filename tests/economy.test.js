import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem, removeItem, countItem, roomFor, moveSlot, sortInventory, splitStack,
  startEgg, eggProgress, warmEgg, hatchEgg, feedBaby, hungerEvery, buyRow, buyPack, rowPrice,
} from '../js/economy.js';
import { freshState } from '../js/state.js';
import { ITEMS, SLOTS, MAX_STACK, FEED_COINS, HATCH_COINS } from '../js/config.js';

const MIN = 60000;

function emptyState(invSize = 10) {
  const s = freshState();
  s.inv = Array(SLOTS).fill(null);
  s.invSize = invSize;
  return s;
}

test('a new player starts with one row and the starter items', () => {
  const s = freshState();
  assert.equal(s.invSize, 10);
  assert.equal(s.coins, 0);
  assert.equal(countItem(s, 'leaf'), 20);
  assert.equal(countItem(s, 'meat'), 12);
  assert.equal(countItem(s, 'amber'), 1);
});

test('addItem fills stacks up to 99, spills into empty slots and reports what did not fit', () => {
  const s = emptyState(2);
  assert.equal(addItem(s, 'leaf', 150), 0);
  assert.deepEqual(s.inv.slice(0, 2), [{ id: 'leaf', n: 99 }, { id: 'leaf', n: 51 }]);
  assert.equal(addItem(s, 'leaf', 60), 12);           // only 48 more fit in the second stack
  assert.equal(addItem(s, 'meat', 1), 1);             // no free slot left
  assert.equal(s.inv[2], null);                        // locked slots stay empty
});

test('removeItem takes from the smallest stack first', () => {
  const s = emptyState();
  s.inv[0] = { id: 'leaf', n: 50 };
  s.inv[1] = { id: 'leaf', n: 3 };
  assert.equal(removeItem(s, 'leaf', 4), 4);
  assert.equal(s.inv[1], null);
  assert.equal(s.inv[0].n, 49);
});

test('moveSlot moves, merges up to 99 and swaps', () => {
  const s = emptyState();
  s.inv[0] = { id: 'leaf', n: 60 };
  moveSlot(s, 0, 5);
  assert.equal(s.inv[0], null);
  assert.equal(s.inv[5].n, 60);

  s.inv[1] = { id: 'leaf', n: 60 };
  moveSlot(s, 1, 5);
  assert.equal(s.inv[5].n, MAX_STACK);
  assert.equal(s.inv[1].n, 21);

  s.inv[2] = { id: 'meat', n: 1 };
  moveSlot(s, 2, 5);
  assert.equal(s.inv[2].id, 'leaf');
  assert.equal(s.inv[5].id, 'meat');
});

test('sortInventory merges stacks in item order', () => {
  const s = emptyState();
  s.inv[3] = { id: 'meat', n: 2 };
  s.inv[7] = { id: 'leaf', n: 5 };
  s.inv[9] = { id: 'leaf', n: 5 };
  sortInventory(s, Object.keys(ITEMS));
  assert.deepEqual(s.inv.slice(0, 3), [{ id: 'leaf', n: 10 }, { id: 'meat', n: 2 }, null]);
});

test('splitStack moves half into the first empty slot', () => {
  const s = emptyState();
  s.inv[4] = { id: 'leaf', n: 9 };
  assert.equal(splitStack(s, 4), 0);
  assert.deepEqual([s.inv[0].n, s.inv[4].n], [4, 5]);
});

test('an egg hatches only when its time is up, and pays coins and a shell', () => {
  const s = freshState();
  startEgg(s, 'proto', 0);
  assert.equal(hatchEgg(s, 30 * 1000), null);
  const r = hatchEgg(s, MIN, () => 0.1);
  assert.equal(r.baby.type, 'proto');
  assert.equal(r.baby.sex, 'm');
  assert.equal(r.baby.name, 'Popcorn');
  assert.equal(s.coins, HATCH_COINS.proto);
  assert.equal(countItem(s, 'shell'), 1);
  assert.equal(s.current, null);
});

test('the second baby of a species gets a numbered name', () => {
  const s = freshState();
  for (let i = 0; i < 2; i++) { startEgg(s, 'hypa', 0); hatchEgg(s, 5 * MIN); }
  assert.deepEqual(s.hatched.map(b => b.name), ['Sprout 2', 'Sprout']);
});

test('warming can cut at most half of the hatch time', () => {
  const s = freshState();
  startEgg(s, 'proto', 0);
  let saved = 0;
  while (warmEgg(s)) saved++;
  assert.equal(saved, 30);
  assert.equal(eggProgress(s.current, 30 * 1000).frac, 1);
});

test('feeding needs a hungry baby and the right food', () => {
  const s = freshState();
  startEgg(s, 'rex', 0);
  const { baby } = hatchEgg(s, 60 * MIN);
  const hungryAt = baby.at + hungerEvery(baby);

  assert.equal(feedBaby(s, baby.id, baby.at + 1000).reason, 'full');

  const meat = countItem(s, 'meat'), coins = s.coins;
  assert.equal(feedBaby(s, baby.id, hungryAt).ok, true);
  assert.equal(countItem(s, 'meat'), meat - 1);
  assert.equal(s.coins, coins + FEED_COINS);

  removeItem(s, 'meat', 99);
  const later = hungryAt + hungerEvery(baby);
  assert.equal(feedBaby(s, baby.id, later).reason, 'no-food');
});

test('backpack rows cost 50, 100, 150 ... and stop at 100 slots', () => {
  const s = freshState();
  s.coins = 10000;
  const prices = [];
  while (buyRow(s).ok) prices.push(s.invSize);
  assert.equal(s.invSize, 100);
  assert.equal(s.coins, 10000 - 2250);
  assert.equal(buyRow(s).reason, 'maxed');
  const t = freshState();
  assert.equal(rowPrice(t), 50);
});

test('food packs need coins and room', () => {
  const s = freshState();
  assert.equal(buyPack(s, 0).reason, 'coins');
  s.coins = 100;
  for (let i = 0; i < s.invSize; i++) s.inv[i] = { id: 'amber', n: 99 };
  assert.equal(roomFor(s, 'leaf'), 0);
  assert.equal(buyPack(s, 0).reason, 'room');
});
