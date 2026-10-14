import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wildStats, wildMax, inheritStats, seededRand, statTotal, breedProblem, startBreeding, collectEgg,
  startEgg, hatchEgg, applyAction, achievementList,
} from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import { STATS, STAT_MAX, WILD_STAT_RANGE, BREED_MINS, EGG_TRAY_SIZE } from '../js/config.js';

const MIN = 60000;
const ids = STATS.map(s => s.id);
const baby = (id, type, sex, stats, gen = 1) => ({ id, type, sex, name: id, at: 0, stats, gen });
const flat = n => Object.fromEntries(ids.map(id => [id, n]));

test('free-egg babies roll stats in the wild range, with the species bonus', () => {
  for (let i = 0; i < 200; i++) {
    const st = wildStats('rex', seededRand('r' + i));
    for (const id of ids) assert.ok(st[id] >= WILD_STAT_RANGE[0] && st[id] <= wildMax('rex')[id]);
  }
  assert.equal(wildMax('rex').str, WILD_STAT_RANGE[1] + 10);
  assert.equal(wildMax('rex').agi, WILD_STAT_RANGE[1]);
});

test('seeded dice give the same stats every time', () => {
  assert.deepEqual(wildStats('proto', seededRand('abc')), wildStats('proto', seededRand('abc')));
});

test('a bred baby lands between its parents, give or take a little, and never above the maximum', () => {
  const a = flat(40), b = flat(60);
  for (let i = 0; i < 300; i++) {
    const st = inheritStats(a, b, seededRand('x' + i));
    for (const id of ids) assert.ok(st[id] >= 38 && st[id] <= 65, `${id}=${st[id]}`);
  }
  const top = inheritStats(flat(100), flat(100), () => 0.99);
  assert.ok(ids.every(id => top[id] === STAT_MAX));
});

test('breeding over generations improves the best line', () => {
  let m = flat(45), f = flat(45);
  const rand = seededRand('generations');
  for (let g = 0; g < 20; g++) { const kid = inheritStats(m, f, rand); m = kid; f = inheritStats(m, f, rand); }
  assert.ok(statTotal(m) > statTotal(flat(45)));
});

test('only a male and a female of the same species can breed', () => {
  const s = freshState();
  s.hatched.push(baby('m1', 'proto', 'm', flat(30)), baby('f1', 'proto', 'f', flat(30)), baby('f2', 'rex', 'f', flat(30)), baby('m2', 'proto', 'm', flat(30)));
  assert.equal(breedProblem(s, 'm1', 'f2'), 'different-species');
  assert.equal(breedProblem(s, 'm1', 'm2'), 'not-a-pair');
  assert.equal(breedProblem(s, 'nobody', 'f1'), 'missing');
  assert.equal(breedProblem(s, 'm1', 'f1'), null);
});

test('a pair lays an egg of its species after the breeding time, and it hatches with the inherited stats', () => {
  const s = freshState();
  s.hatched.push(baby('m1', 'hypa', 'm', flat(70), 2), baby('f1', 'hypa', 'f', flat(80), 3));
  assert.equal(startBreeding(s, 'm1', 'f1', 0).ok, true);
  assert.equal(startBreeding(s, 'm1', 'f1', 0).reason, 'busy');
  assert.equal(collectEgg(s, BREED_MINS.hypa * MIN - 1).reason, 'not-ready');

  const r = collectEgg(s, BREED_MINS.hypa * MIN, seededRand('egg'));
  assert.equal(r.ok, true);
  assert.equal(r.egg.type, 'hypa');
  assert.equal(r.egg.gen, 4);
  assert.deepEqual(r.egg.parents, ['m1', 'f1']);
  assert.equal(s.breeding, null);
  assert.equal(s.eggs.length, 1);

  assert.equal(applyAction(s, 'startEgg', { eggId: r.egg.id }, 0).ok, true);
  assert.equal(s.eggs.length, 0);
  const { baby: kid } = hatchEgg(s, 5 * MIN);
  assert.deepEqual(kid.stats, r.egg.stats);
  assert.equal(kid.gen, 4);
  assert.deepEqual(kid.parents, ['m1', 'f1']);
  assert.equal(achievementList(s).find(a => a.id === 'proud_parents').done, true);
});

test('the egg tray holds at most 10 eggs', () => {
  const s = freshState();
  s.hatched.push(baby('m1', 'proto', 'm', flat(30)), baby('f1', 'proto', 'f', flat(30)));
  s.eggs = Array.from({ length: EGG_TRAY_SIZE }, (_, i) => ({ id: 'e' + i, type: 'proto', stats: flat(30), gen: 2, parents: [], laidAt: 0 }));
  assert.equal(startBreeding(s, 'm1', 'f1', 0).reason, 'tray-full');
});

test('free eggs still hatch with rolled stats', () => {
  const s = freshState();
  startEgg(s, 'raptor', 0);
  const { baby: b } = hatchEgg(s, 15 * MIN);
  assert.equal(b.gen, 1);
  assert.ok(ids.every(id => b.stats[id] >= 1 && b.stats[id] <= STAT_MAX));
});

test('a version 3 save gives each baby fixed stats, the same on every device', () => {
  const old = freshState();
  old.saveVersion = 3;
  delete old.eggs; delete old.breeding;
  old.hatched.push({ id: 'b1', type: 'raptor', sex: 'm', name: 'S', at: 1 });
  const a = migrate(old), b = migrate(old);
  assert.deepEqual(a.hatched[0].stats, b.hatched[0].stats);
  assert.equal(a.hatched[0].gen, 1);
  assert.deepEqual(a.eggs, []);
  assert.equal(a.breeding, null);
});

test('stats in a guest save cannot beat what a free egg gives', () => {
  const s = freshState();
  s.hatched.push(baby('b1', 'rex', 'm', flat(100), 9));
  s.eggs = [{ id: 'e1', type: 'proto', stats: flat(99), gen: 5, parents: [], laidAt: 0 }];
  const c = capGuestSave(s, Date.now());
  assert.deepEqual(c.hatched[0].stats, wildMax('rex'));
  assert.equal(c.hatched[0].gen, 1);
  assert.deepEqual(c.eggs[0].stats, wildMax('proto'));
});
