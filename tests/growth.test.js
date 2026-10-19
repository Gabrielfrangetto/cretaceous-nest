import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageOf, nextStage, isAdult, feedBaby, hungerEvery, needsCapsule, isHungry, ageOf, addItem, removeItem, countItem } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { STAGES, CAPSULES, CAPSULE, LIFE, PACE, SPECIES, BREED_MINS } from '../js/config.js';
import { ageLabel } from '../js/util.js';

const baby = fed => ({ id: 'g1', type: 'proto', sex: 'f', name: 'Pop', at: 0, gen: 1, fed, equip: {} });

test('a young one grows on growth capsules, as many as its species takes in the wild at PACE', () => {
  const { juvenile, adult } = CAPSULES.proto;
  // a Protoceratops full grown at about 8, a fifth of the way a juvenile: a capsule works 4 h for a
  // baby, 6 h for a juvenile
  const hours = LIFE.proto[1] * 365 * 24 / PACE;
  assert.equal(juvenile, Math.ceil(hours * 0.2 / CAPSULE.every.baby));
  assert.equal(adult, juvenile + Math.ceil(hours * 0.8 / CAPSULE.every.juvenile));
  assert.equal(stageOf(baby(0)).id, 'baby');
  assert.equal(stageOf(baby(juvenile - 1)).id, 'baby');
  assert.equal(stageOf(baby(juvenile)).id, 'juvenile');
  assert.equal(stageOf(baby(adult - 1)).id, 'juvenile');
  assert.equal(stageOf(baby(adult)).id, 'adult');
  assert.equal(stageOf({ id: 'x' }).id, 'baby');
  assert.equal(isAdult(baby(adult)), true);
  assert.equal(isAdult(baby(adult - 1)), false);
  // the bigger and slower-growing, the more it takes: a Tyrannosaurus about a month's worth
  assert.ok(CAPSULES.rex.adult > CAPSULES.proto.adult && CAPSULES.proto.adult > CAPSULES.coelo.adult);
  const rexDays = (CAPSULES.rex.juvenile * CAPSULE.every.baby + (CAPSULES.rex.adult - CAPSULES.rex.juvenile) * CAPSULE.every.juvenile) / 24;
  assert.ok(rexDays > 28 && rexDays < 35);
});

test('the next stage says how many capsules are left', () => {
  const { juvenile, adult } = CAPSULES.proto;
  assert.deepEqual(nextStage(baby(4)), { stage: STAGES[1], mealsLeft: juvenile - 4 });
  assert.deepEqual(nextStage(baby(juvenile + 2)), { stage: STAGES[2], mealsLeft: adult - juvenile - 2 });
  assert.equal(nextStage(baby(adult)), null);
});

test('a capsule as soon as it hatches, the next once it wears off; the one that crosses a threshold reports the growth', () => {
  const s = freshState();
  const b = baby(CAPSULES.proto.juvenile - 1);
  s.hatched.push(b);
  removeItem(s, 'capsule', 99);
  assert.equal(feedBaby(s, 'g1', 0).reason, 'no-food');
  addItem(s, 'capsule', 5);
  // no food is any good: only a capsule
  addItem(s, 'leaf', 50);
  const leaves = countItem(s, 'leaf');
  let t = 0;
  const r = feedBaby(s, 'g1', t);
  assert.equal(r.ok, true);
  assert.equal(r.grewTo, 'juvenile');
  assert.equal(countItem(s, 'capsule'), 4);
  assert.equal(countItem(s, 'leaf'), leaves);
  // a juvenile's works 6 h
  assert.equal(hungerEvery(b), CAPSULE.every.juvenile * 3600000);
  assert.equal(feedBaby(s, 'g1', t + hungerEvery(b) - 1).reason, 'full');
  t += hungerEvery(b);
  assert.equal(feedBaby(s, 'g1', t).grewTo, null);
  // an adult takes none
  b.fed = CAPSULES.proto.adult;
  assert.equal(feedBaby(s, 'g1', t + 1e9).reason, 'grown');
  assert.equal(needsCapsule(b, t + 1e9), false);
});

test('a dinosaur at home is never hungry: the keepers feed it', () => {
  const b = baby(CAPSULES.proto.adult);
  assert.equal(isHungry({ ...b, lastFed: 0 }, 1e12), false);
});

test('its age is ours: a year of it a year of the clock', () => {
  const b = baby(0);
  assert.equal(ageOf(b, 86400000 * 3), 86400000 * 3);
  assert.equal(ageLabel(ageOf(b, 86400000 * 3)), '3 days old');
  assert.equal(ageLabel(86400000 * 400), '1 year old');
  assert.equal(ageLabel(86400000 * 61), '2 months old');
  assert.equal(ageLabel(3600000), 'less than a day old');
});

test('eggs hatch and pairs lay at PACE: a Tyrannosaurus egg in 18 h, a Protoceratops in about 8', () => {
  assert.equal(SPECIES.rex.mins, 18 * 60);
  assert.equal(SPECIES.proto.mins, Math.round(83 * 24 * 60 / PACE));
  assert.equal(BREED_MINS.rex, 3 * 60);
});

test('an old save keeps how far each one was through its stage', () => {
  const s = freshState();
  s.saveVersion = 12;
  s.hatched.push({ ...baby(30), id: 'a' }, { ...baby(10), id: 'j' }, { ...baby(20), id: 'h' }, { ...baby(5), id: 'b' }, { ...baby(20), id: 'y', type: 'hypa' });
  const loaded = migrate(JSON.parse(JSON.stringify(s)));
  const fed = id => loaded.hatched.find(b => b.id === id).fed, c = CAPSULES.proto;
  assert.equal(fed('a'), c.adult);
  assert.equal(fed('j'), c.juvenile);
  assert.equal(fed('h'), c.juvenile + Math.floor((c.adult - c.juvenile) / 2));
  assert.equal(fed('b'), Math.floor(c.juvenile / 2));
  // (a Hypacrosaurus was grown at 20 meals)
  assert.equal(fed('y'), CAPSULES.hypa.adult);
});

test('the stage is worked out from meals; a stored one is ignored', () => {
  const s = freshState();
  s.hatched.push({ ...baby(3), stage: 'adult' });
  const loaded = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(loaded.hatched[0].stage, undefined);
  assert.equal(stageOf(loaded.hatched[0]).id, 'baby');
});

test('Hypacrosaurus nurses the eggs and raises stronger hatchlings', async () => {
  const { startEgg, hatchEgg, statSheet } = await import('../js/economy.js');
  const { NURSE } = await import('../js/config.js');
  // an adult Hypacrosaurus in the nest: the egg hatches 25% sooner
  const s = freshState();
  const genes = { str: 80, agi: 80, vit: 80, res: 80 };
  startEgg(s, 'dilo', 0);
  const plain = s.current.duration;
  s.hatched.push({ id: 'n1', type: 'hypa', sex: 'f', name: 'n1', at: 0, gen: 1, fed: 999, genes, equip: {} });
  startEgg(s, 'dilo', 0);
  assert.equal(s.current.duration, Math.round(plain * (1 - NURSE.hatch)));
  // every Hypacrosaurus at home gives the hatchling 1% more of every stat, up to 10%
  for (let i = 2; i <= 12; i++) s.hatched.push({ id: 'n' + i, type: 'hypa', sex: 'm', name: 'n' + i, at: 0, gen: 1, fed: 1, genes, equip: {} });
  const r = hatchEgg(s, s.current.duration, () => 0.5);
  assert.equal(r.baby.care, NURSE.max);
  const raised = statSheet({ ...r.baby, genes, equip: {} }), bare = statSheet({ ...r.baby, care: undefined, genes, equip: {} });
  assert.ok(raised.stats.str > bare.stats.str);
});

test('a baby raised with an adult Psittacosaurus in the nest gets a strong stomach', async () => {
  const { startEgg, hatchEgg } = await import('../js/economy.js');
  const { freshState } = await import('../js/state.js');
  const genes = { str: 80, agi: 80, vit: 80, res: 80 };
  const s = freshState();
  startEgg(s, 'dilo', 0);
  const plain = hatchEgg(s, s.current.duration, () => 0.5).baby;
  assert.equal(plain.stomach, undefined);
  s.hatched.push({ id: 'ps', type: 'psitta', sex: 'f', name: 'ps', at: 0, gen: 1, fed: 999, genes, equip: {} });
  startEgg(s, 'dilo', 0);
  const raised = hatchEgg(s, s.current.duration, () => 0.5).baby;
  assert.equal(raised.stomach, true);
  // (it gets hungry more slowly on a journey: see the journey's hunger)
});
