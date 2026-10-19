import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wildGenes, WILD_GENES_MAX, inheritGenes, seededRand, genesTotal, breedProblem, startBreeding, collectEgg,
  startEgg, hatchEgg, applyAction, achievementList,
} from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { capGuestSave } from '../js/sync.js';
import { STATS, GENES_MAX, WILD_GENES, BREED_MINS, EGG_TRAY_SIZE, SPECIES, CAPSULES } from '../js/config.js';

const MIN = 60000;
const ids = STATS.map(s => s.id);
// adults (30 meals), since only adults breed
const baby = (id, type, sex, genes, gen = 1) => ({ id, type, sex, name: id, at: 0, genes, gen, fed: 999 });
const flat = n => Object.fromEntries(ids.map(id => [id, n]));

test('free-egg babies roll genes in the wild range', () => {
  for (let i = 0; i < 200; i++) {
    const g = wildGenes(seededRand('r' + i));
    for (const id of ids) assert.ok(g[id] >= WILD_GENES[0] && g[id] <= WILD_GENES[1]);
  }
  assert.deepEqual(WILD_GENES_MAX, flat(WILD_GENES[1]));
});

test('seeded dice give the same genes every time', () => {
  assert.deepEqual(wildGenes(seededRand('abc')), wildGenes(seededRand('abc')));
});

test('a bred baby lands between its parents, give or take a little, and never above the maximum', () => {
  for (let i = 0; i < 300; i++) {
    const g = inheritGenes(flat(40), flat(60), seededRand('x' + i));
    for (const id of ids) assert.ok(g[id] >= 38 && g[id] <= 65, `${id}=${g[id]}`);
  }
  const top = inheritGenes(flat(100), flat(100), () => 0.99);
  assert.ok(ids.every(id => top[id] === GENES_MAX));
});

test('breeding over generations improves the best line', () => {
  let m = flat(45), f = flat(45);
  const rand = seededRand('generations');
  for (let g = 0; g < 20; g++) { m = inheritGenes(m, f, rand); f = inheritGenes(m, f, rand); }
  assert.ok(genesTotal(m) > genesTotal(flat(45)));
});

test('only a male and a female of the same species can breed', () => {
  const s = freshState();
  s.hatched.push(baby('m1', 'proto', 'm', flat(30)), baby('f1', 'proto', 'f', flat(30)), baby('f2', 'rex', 'f', flat(30)), baby('m2', 'proto', 'm', flat(30)));
  assert.equal(breedProblem(s, 'm1', 'f2'), 'different-species');
  assert.equal(breedProblem(s, 'm1', 'm2'), 'not-a-pair');
  assert.equal(breedProblem(s, 'nobody', 'f1'), 'missing');
  assert.equal(breedProblem(s, 'm1', 'f1'), null);
});

test('a pair lays an egg of its species after the breeding time, and it hatches with the inherited genes', () => {
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
  const { baby: kid } = hatchEgg(s, SPECIES.hypa.mins * MIN);
  assert.deepEqual(kid.genes, r.egg.genes);
  assert.equal(kid.gen, 4);
  assert.deepEqual(kid.parents, ['m1', 'f1']);
  assert.equal(achievementList(s).find(a => a.id === 'proud_parents').done, true);
});

test('the egg tray holds at most 10 eggs', () => {
  const s = freshState();
  s.hatched.push(baby('m1', 'proto', 'm', flat(30)), baby('f1', 'proto', 'f', flat(30)));
  s.eggs = Array.from({ length: EGG_TRAY_SIZE }, (_, i) => ({ id: 'e' + i, type: 'proto', genes: flat(30), gen: 2, parents: [], laidAt: 0 }));
  assert.equal(startBreeding(s, 'm1', 'f1', 0).reason, 'tray-full');
});

test('free eggs still hatch with rolled genes', () => {
  const s = freshState();
  startEgg(s, 'raptor', 0);
  const { baby: b } = hatchEgg(s, SPECIES.raptor.mins * MIN);
  assert.equal(b.gen, 1);
  assert.ok(ids.every(id => b.genes[id] >= 1 && b.genes[id] <= GENES_MAX));
});

test('a version 3 save gives each baby fixed genes, the same on every device', () => {
  const old = freshState();
  old.saveVersion = 3;
  delete old.eggs; delete old.breeding;
  old.hatched.push({ id: 'b1', type: 'raptor', sex: 'm', name: 'S', at: 1 });
  const a = migrate(old), b = migrate(old);
  assert.deepEqual(a.hatched[0].genes, b.hatched[0].genes);
  assert.equal(a.hatched[0].gen, 1);
  assert.deepEqual(a.eggs, []);
  assert.equal(a.breeding, null);
});

test('genes in a guest save cannot beat what a free egg gives', () => {
  const s = freshState();
  s.hatched.push(baby('b1', 'rex', 'm', flat(100), 9));
  s.eggs = [{ id: 'e1', type: 'proto', genes: flat(99), gen: 5, parents: [], laidAt: 0 }];
  s.current = { type: 'hypa', startedAt: 0, duration: 1, bonus: 0, genes: flat(95), gen: 4 };
  const c = capGuestSave(s, Date.now());
  assert.deepEqual(c.hatched[0].genes, WILD_GENES_MAX);
  assert.equal(c.hatched[0].gen, 1);
  assert.deepEqual(c.eggs[0].genes, WILD_GENES_MAX);
  assert.deepEqual(c.current.genes, WILD_GENES_MAX);   // a bred egg in the incubator keeps (capped) genes
});

test('only adults breed', () => {
  const s = freshState();
  s.hatched.push(baby('m1', 'proto', 'm', flat(30)), { ...baby('f1', 'proto', 'f', flat(30)), fed: CAPSULES.proto.adult - 1 });
  assert.equal(breedProblem(s, 'm1', 'f1'), 'not-adult');
  s.hatched[1].fed = CAPSULES.proto.adult;
  assert.equal(breedProblem(s, 'm1', 'f1'), null);
});
