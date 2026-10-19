import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../js/config.js';
import { fighterOf, hitOf } from '../js/combat.js';

const at = (type, g) => fighterOf({ id: type, type, name: type, genes: { str: g, agi: g, vit: g, res: g }, equip: {}, fed: 999 });
// the hardest blow a perfect attacker can land on the weakest defender of a species
const best = (a, b) => hitOf(at(a, 100), at(b, 0), 1.25);

test('small animals can never hurt the giants, whatever their genes', () => {
  for (const small of ['compy', 'galli', 'hypsi', 'psitta', 'scelido'])
    for (const giant of ['rex', 'ankylo', 'argent']) assert.equal(best(small, giant), 0, `${small} vs ${giant}`);
  assert.equal(best('galli', 'trike'), 0);
});

test('the big hunters and the armed plant eaters hurt everyone', () => {
  for (const big of ['rex', 'spino', 'allo', 'trike', 'stego', 'ankylo'])
    for (const t of Object.keys(SPECIES)) assert.ok(best(big, t) > 0, `${big} vs ${t}`);
});

test('every species says what it fights with', () => {
  for (const sp of Object.values(SPECIES)) assert.ok(sp.weapon && sp.bite > 0 && sp.hide >= 0, sp.species);
});
