import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, statSheet, cleanPlayer } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { LOOK } from '../js/config.js';

test('the explorer is made within the choices; a build gives a little of one stat for a little of another', () => {
  const s = freshState();
  assert.equal(s.player.look, undefined);
  const plain = statSheet(s.player).stats;
  assert.equal(applyAction(s, 'setLook', { look: { sex: 'alien', build: 'slim' } }, 1).reason, 'bad-look');
  assert.equal(applyAction(s, 'setLook', { look: { sex: 'female', build: 'muscular', skin: 'green' }, name: '  Ana  ' }, 1).ok, true);
  // (a skin not among the choices: the usual one)
  assert.deepEqual(s.player.look, { sex: 'female', build: 'muscular', skin: 'light', hair: 'none', hairColor: 'brown' });
  assert.equal(applyAction(s, 'setLook', { look: { sex: 'male', build: 'slim', hair: 'curly', hairColor: 'ginger' } }, 1).ok, true);
  assert.equal(s.player.look.hair, 'curly');
  // (a style that sex has none of: bald)
  assert.equal(applyAction(s, 'setLook', { look: { sex: 'female', build: 'slim', hair: 'undercut' } }, 1).ok, true);
  assert.equal(s.player.look.hair, 'none');
  assert.equal(applyAction(s, 'setLook', { look: { sex: 'male', build: 'muscular', skin: 'dark' } }, 1).ok, true);
  assert.equal(s.player.look.skin, 'dark');
  assert.equal(s.player.name, 'Ana');
  const strong = statSheet(s.player).stats;
  assert.ok(strong.str > plain.str && strong.agi < plain.agi && strong.vit === plain.vit);
  // kept through a save
  assert.deepEqual(cleanPlayer(JSON.parse(JSON.stringify(s.player))).look, s.player.look);
  assert.equal(cleanPlayer({ look: { sex: 'male', build: 'giant' } }).look, undefined);
});
