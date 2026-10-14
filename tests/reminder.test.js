import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, clampEvery, nextDue, isDue, snooze, addGlass, glassesToday, MAX_EVERY } from '../js/reminder.js';

const MIN = 60000;
const on = (every, lastAt) => ({ ...defaults(), on: true, babyId: 'b1', every, lastAt });

test('a reminder is due once its interval has passed', () => {
  const s = on(30, 0);
  assert.equal(isDue(s, 29 * MIN), false);
  assert.equal(isDue(s, 30 * MIN), true);
  assert.equal(nextDue(s), 30 * MIN);
});

test('nothing is due while switched off or without a baby', () => {
  assert.equal(isDue({ ...on(1, 0), on: false }, 99 * MIN), false);
  assert.equal(isDue({ ...on(1, 0), babyId: null }, 99 * MIN), false);
});

test('the interval stays between 1 minute and 8 hours', () => {
  assert.equal(clampEvery(0), 1);
  assert.equal(clampEvery(-5), 1);
  assert.equal(clampEvery(10000), MAX_EVERY);
  assert.equal(clampEvery('45'), 45);
  assert.equal(clampEvery('abc'), 30);
});

test('snoozing brings the reminder back in 5 minutes, whatever the interval', () => {
  const s = on(60, 0);
  snooze(s, 100 * MIN);
  assert.equal(isDue(s, 104 * MIN), false);
  assert.equal(isDue(s, 105 * MIN), true);
});

test('glasses are counted per day and start over the next day', () => {
  const s = defaults();
  const today = new Date(2026, 9, 14, 10, 0).getTime();
  const tomorrow = new Date(2026, 9, 15, 9, 0).getTime();
  addGlass(s, today); addGlass(s, today);
  assert.equal(glassesToday(s, today), 2);
  assert.equal(glassesToday(s, tomorrow), 0);
  addGlass(s, tomorrow);
  assert.equal(glassesToday(s, tomorrow), 1);
});
