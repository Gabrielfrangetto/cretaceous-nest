import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSheet, deriveCombat, geneGrade, genesPercent } from '../js/economy.js';
import { freshState, migrate, SAVE_VERSION } from '../js/state.js';
import { SPECIES_BASE } from '../js/config.js';

const genes = n => ({ str: n, agi: n, vit: n, res: n });
const rex = g => ({ type: 'rex', genes: typeof g === 'number' ? genes(g) : g });
const B = SPECIES_BASE.rex;   // the numbers below follow the Tyrannosaurus' base stats

test('genes scale the species base from 70% to 100%, as real animals of one species differ', () => {
  assert.deepEqual(statSheet(rex(100)).stats, SPECIES_BASE.rex);
  assert.equal(statSheet(rex(50)).stats.str, Math.round(B.str * 0.85));
  assert.equal(statSheet(rex(0)).stats.str, Math.round(B.str * 0.7));
});

test('the species shapes the stats more than the genes do', () => {
  const averageRex = statSheet(rex(50)).stats.str;
  const perfectProto = statSheet({ type: 'proto', genes: genes(100) }).stats.str;
  assert.ok(averageRex > perfectProto);
  const averageRaptor = statSheet({ type: 'raptor', genes: genes(50) }).stats.agi;
  assert.ok(averageRaptor > statSheet(rex(100)).stats.agi);
});

test('equipment stacks flat, then increased (added together), then more (multiplied)', () => {
  // the example from the design: Rex with Strength genes 80 and four items
  const b = rex({ str: 80, agi: 80, vit: 50, res: 50 });
  const mods = [
    { stat: 'str', type: 'flat', value: 5 },          // Bone Helmet
    { stat: 'str', type: 'increased', value: 0.10 },  // Spiked Collar
    { stat: 'res', type: 'flat', value: 30 },         // Heavy Armor
    { stat: 'agi', type: 'increased', value: -0.25 }, //   ...which slows you down
    { stat: 'str', type: 'more', value: 1.10 },       // Rage Charm
  ];
  const sheet = statSheet(b, mods);
  assert.equal(sheet.stats.str, Math.round((B.str * 0.94 + 5) * 1.10 * 1.10));
  assert.equal(sheet.stats.agi, Math.round(B.agi * 0.94 * 0.75));
  assert.equal(sheet.stats.res, Math.round(B.res * 0.85 + 30));
});

test('increased bonuses add up, more bonuses multiply', () => {
  const two = (type, value) => [{ stat: 'str', type, value }, { stat: 'str', type, value }];
  assert.equal(statSheet(rex(100), two('increased', 0.10)).stats.str, Math.round(B.str * 1.20));
  assert.equal(statSheet(rex(100), two('more', 1.10)).stats.str, Math.round(B.str * 1.21));
});

test('a stat never drops below 1, even with huge penalties', () => {
  assert.equal(statSheet(rex(1), [{ stat: 'agi', type: 'increased', value: -5 }]).stats.agi, 1);
});

test('combat stats come from the final stats, with diminishing returns', () => {
  const d = deriveCombat({ str: 80, agi: 100, vit: 70, res: 300 });
  assert.equal(d.hp, 50 + 70 * 10);
  assert.equal(d.damage, 120);
  assert.equal(d.dodge, 0.5);
  assert.equal(d.reduction, 0.75);
  assert.ok(deriveCombat({ str: 1, agi: 100000, vit: 1, res: 1 }).dodge < 1);
});

test('gene grades and the overall percentage', () => {
  assert.deepEqual([95, 80, 60, 40, 10].map(geneGrade), ['S', 'A', 'B', 'C', 'D']);
  assert.equal(genesPercent(genes(50)), 50);
});

test('power is the sum of the final stats', () => {
  const sheet = statSheet(rex(100));
  assert.equal(sheet.power, B.str + B.agi + B.vit + B.res);
});

test('a version 4 save turns its stats into genes, taking off the old species bonus', () => {
  const old = freshState();
  old.saveVersion = 4;
  old.hatched.push({ id: 'b1', type: 'rex', sex: 'm', name: 'R', at: 1, gen: 2, stats: { str: 60, agi: 30, vit: 45, res: 40 } });
  old.eggs = [{ id: 'e1', type: 'raptor', gen: 3, parents: [], laidAt: 0, stats: { str: 20, agi: 55, vit: 30, res: 30 } }];
  const s = migrate(old);
  assert.equal(s.saveVersion, SAVE_VERSION);
  assert.deepEqual(s.hatched[0].genes, { str: 50, agi: 30, vit: 45, res: 40 });
  assert.equal(s.hatched[0].stats, undefined);
  assert.deepEqual(s.eggs[0].genes, { str: 20, agi: 45, vit: 30, res: 30 });
  assert.equal(s.hatched[0].gen, 2);
});
