import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { GUIDE } from '../js/config.js';

test('a new game has seen no tips; a tip read is recorded once', () => {
  const s = freshState();
  assert.deepEqual(s.tutorial, { seen: [] });
  assert.equal(applyAction(s, 'seeGuide', { id: 'welcome' }, 0).ok, true);
  assert.deepEqual(s.tutorial.seen, ['welcome']);
  assert.equal(applyAction(s, 'seeGuide', { id: 'welcome' }, 0).reason, 'seen');
  assert.equal(applyAction(s, 'seeGuide', { id: 'nope' }, 0).reason, 'unknown-tip');
});

test('games already under way skip the welcome; loaded tips are cleaned', () => {
  const old = freshState();
  delete old.tutorial; old.saveVersion = 10; old.starter = true;
  assert.deepEqual(migrate(old).tutorial.seen, ['welcome']);
  const s = freshState();
  s.tutorial = { seen: ['welcome', 'welcome', 'junk'] };
  assert.deepEqual(migrate(s).tutorial.seen, ['welcome']);
});

test('every tip has something to say', () => {
  for (const tip of Object.values(GUIDE)) assert.ok(tip.pages.length > 0 && tip.pages.every(p => p.length > 10));
});
