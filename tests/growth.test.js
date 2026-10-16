import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageOf, nextStage, isAdult, feedBaby, hungerEvery } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { STAGES } from '../js/config.js';

const baby = fed => ({ id: 'g1', type: 'proto', sex: 'f', name: 'Pop', at: 0, gen: 1, fed, equip: {} });

test('a baby grows from its meals: juvenile at 10, adult at 30', () => {
  assert.deepEqual(STAGES.map(s => s.meals), [0, 10, 30]);
  assert.equal(stageOf(baby(0)).id, 'baby');
  assert.equal(stageOf(baby(9)).id, 'baby');
  assert.equal(stageOf(baby(10)).id, 'juvenile');
  assert.equal(stageOf(baby(29)).id, 'juvenile');
  assert.equal(stageOf(baby(30)).id, 'adult');
  assert.equal(stageOf({ id: 'x' }).id, 'baby');
  assert.equal(isAdult(baby(30)), true);
  assert.equal(isAdult(baby(29)), false);
});

test('the next stage says how many meals are left', () => {
  assert.deepEqual(nextStage(baby(4)), { stage: STAGES[1], mealsLeft: 6 });
  assert.deepEqual(nextStage(baby(12)), { stage: STAGES[2], mealsLeft: 18 });
  assert.equal(nextStage(baby(30)), null);
});

test('the meal that crosses a threshold reports the growth', () => {
  const s = freshState();
  const b = baby(9);
  s.hatched.push(b);
  let t = hungerEvery(b);
  const r = feedBaby(s, 'g1', t);
  assert.equal(r.ok, true);
  assert.equal(r.grewTo, 'juvenile');
  t += hungerEvery(b);
  assert.equal(feedBaby(s, 'g1', t).grewTo, null);
});

test('the stage is worked out from meals; a stored one is ignored', () => {
  const s = freshState();
  s.hatched.push({ ...baby(3), stage: 'adult' });
  const loaded = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(loaded.hatched[0].stage, undefined);
  assert.equal(stageOf(loaded.hatched[0]).id, 'baby');
});

test('Hypacrosaurus grows up half again as fast, nurses the eggs and raises stronger hatchlings', async () => {
  const { stageOf, mealsFor, startEgg, hatchEgg, statSheet } = await import('../js/economy.js');
  const { STAGES, NURSE, SPECIES } = await import('../js/config.js');
  const { freshState } = await import('../js/state.js');
  // juvenile after 7 meals and adult after 20, where others need 10 and 30
  const hypa = { id: 'h', type: 'hypa', fed: 7 }, other = { id: 'o', type: 'dilo', fed: 7 };
  assert.equal(mealsFor(hypa, STAGES[1]), 7);
  assert.equal(mealsFor(hypa, STAGES[2]), 20);
  assert.equal(stageOf(hypa).id, 'juvenile');
  assert.equal(stageOf(other).id, 'baby');
  // an adult Hypacrosaurus in the nest: the egg hatches 25% sooner
  const s = freshState();
  const genes = { str: 80, agi: 80, vit: 80, res: 80 };
  startEgg(s, 'dilo', 0);
  const plain = s.current.duration;
  s.hatched.push({ id: 'n1', type: 'hypa', sex: 'f', name: 'n1', at: 0, gen: 1, fed: 20, genes, equip: {} });
  startEgg(s, 'dilo', 0);
  assert.equal(s.current.duration, Math.round(plain * (1 - NURSE.hatch)));
  // every Hypacrosaurus at home gives the hatchling 1% more of every stat, up to 10%
  for (let i = 2; i <= 12; i++) s.hatched.push({ id: 'n' + i, type: 'hypa', sex: 'm', name: 'n' + i, at: 0, gen: 1, fed: 1, genes, equip: {} });
  const r = hatchEgg(s, s.current.duration, () => 0.5);
  assert.equal(r.baby.care, NURSE.max);
  const raised = statSheet({ ...r.baby, genes, equip: {} }), bare = statSheet({ ...r.baby, care: undefined, genes, equip: {} });
  assert.ok(raised.stats.str > bare.stats.str);
  assert.ok(SPECIES.hypa.growth > 1);
});
