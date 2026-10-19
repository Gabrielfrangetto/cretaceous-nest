import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gameDay, nextDayAt, dailyStatus, claimDaily, achievementList, claimAchievement, claimableCount,
  countItem, addItem, startEgg, hatchEgg, feedBaby, hungerEvery, applyAction,
} from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { DAILY_REWARDS, ACHIEVEMENTS, SPECIES, HATCH_COINS, FEED_COINS } from '../js/config.js';

const PROTO = SPECIES.proto.mins * 60000;   // how long a Protoceratops egg takes

const HOUR = 3600000, DAY = 24 * HOUR;
// 2026-10-14 10:00 in Brasília (UTC-3)
const MORNING = Date.UTC(2026, 9, 14, 13, 0);

test('the game day turns at midnight in Brasília', () => {
  const lateEvening = Date.UTC(2026, 9, 15, 2, 59);   // 23:59 on the 14th in Brasília
  const midnight = Date.UTC(2026, 9, 15, 3, 0);       // 00:00 on the 15th in Brasília
  assert.equal(gameDay(lateEvening), gameDay(MORNING));
  assert.equal(gameDay(midnight), gameDay(MORNING) + 1);
  assert.equal(nextDayAt(MORNING), midnight);
});

test('the daily reward can be claimed once per day', () => {
  const s = freshState();
  const first = claimDaily(s, MORNING);
  assert.equal(first.ok, true);
  assert.equal(s.coins, DAILY_REWARDS[0].coins);
  assert.equal(claimDaily(s, MORNING + 5 * HOUR).reason, 'claimed');
  assert.equal(dailyStatus(s, MORNING + 5 * HOUR).claimedToday, true);
});

test('claiming on consecutive days grows the streak and the reward', () => {
  const s = freshState();
  for (let d = 0; d < 7; d++) claimDaily(s, MORNING + d * DAY);
  assert.equal(s.daily.streak, 7);
  assert.equal(s.daily.best, 7);
  assert.equal(s.coins, DAILY_REWARDS.reduce((t, r) => t + r.coins, 0));
  assert.equal(countItem(s, 'amber'), 1 + 1);          // starter amber + day 7
  assert.equal(dailyStatus(s, MORNING + 7 * DAY).index, 0);   // day 8 starts the cycle again
});

test('missing a day starts the streak over, but keeps the best streak', () => {
  const s = freshState();
  claimDaily(s, MORNING);
  claimDaily(s, MORNING + DAY);
  assert.equal(dailyStatus(s, MORNING + 3 * DAY).streak, 0);
  claimDaily(s, MORNING + 3 * DAY);
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.best, 2);
});

test('reward items that do not fit are reported as lost', () => {
  const s = freshState();
  for (let i = 0; i < s.invSize; i++) s.inv[i] = { id: 'amber', n: 99 };
  claimDaily(s, MORNING);
  const r = claimDaily(s, MORNING + DAY);                // day 2 gives 3 leaves
  assert.deepEqual(r.lost, { leaf: 3 });
});

test('achievements unlock from progress and pay once', () => {
  const s = freshState();
  assert.equal(claimAchievement(s, 'first_hatch', MORNING).reason, 'not-done');
  startEgg(s, 'proto', 0);
  hatchEgg(s, PROTO);
  const before = s.coins;
  const r = claimAchievement(s, 'first_hatch', MORNING);
  assert.equal(r.ok, true);
  assert.equal(s.coins, before + ACHIEVEMENTS.find(a => a.id === 'first_hatch').coins);
  assert.equal(claimAchievement(s, 'first_hatch', MORNING).reason, 'claimed');
  assert.equal(claimAchievement(s, 'made_up', MORNING).reason, 'unknown-achievement');
});

test('growth capsules, pairs and coins earned are counted for achievements', () => {
  const s = freshState();
  startEgg(s, 'proto', 0, { sex: 'm' }); hatchEgg(s, PROTO);   // male
  startEgg(s, 'proto', 0, { sex: 'f' }); hatchEgg(s, PROTO);   // female
  const baby = s.hatched[0];
  addItem(s, 'capsule', 1);
  feedBaby(s, baby.id, baby.at + hungerEvery(baby));
  const list = Object.fromEntries(achievementList(s).map(a => [a.id, a]));
  assert.equal(list.pair.done, true);
  assert.equal(list.meals_25.progress, 1);
  assert.equal(list.coins_1000.progress, HATCH_COINS.proto * 2 + FEED_COINS);
});

test('the Rewards badge counts the daily reward and finished achievements', () => {
  const s = freshState();
  assert.equal(claimableCount(s, MORNING), 1);
  startEgg(s, 'proto', 0); hatchEgg(s, PROTO);
  assert.equal(claimableCount(s, MORNING), 2);
  applyAction(s, 'claimDaily', {}, MORNING);
  applyAction(s, 'claimAchievement', { id: 'first_hatch' }, MORNING);
  assert.equal(claimableCount(s, MORNING), 0);
});

test('a version 2 save gets a streak, totals and achievements', () => {
  const old = freshState();
  delete old.daily; delete old.stats; delete old.achievements;
  old.saveVersion = 2;
  old.coins = 80;
  old.hatched.push({ id: 'b1', type: 'proto', sex: 'f', name: 'P', at: 1, fed: 6 });
  const s = migrate(old);
  assert.equal(s.saveVersion, SAVE_VERSION);
  assert.deepEqual(s.daily, { last: null, streak: 0, best: 0 });
  assert.deepEqual(s.stats, { coinsEarned: 80, meals: 6, purchases: 0, eggsLaid: 0 });
  assert.deepEqual(s.achievements, {});
});
