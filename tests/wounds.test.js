import { test } from 'node:test';
import assert from 'node:assert/strict';
import { woundsOf } from '../js/journey.js';
import { WOUNDS } from '../js/config.js';

const T = Date.parse('2026-10-20T12:00:00Z');
const world = (expeditions = []) => ({ player: {}, world: { expeditions } });

test('a wound on a journey is as open as the dinosaur is hurt', () => {
  const b = { id: 'a', wound: { parts: ['body', 'legs'], by: 'raptor' } };
  const p = { members: ['a'], health: { a: 0.3 }, down: [] };
  assert.deepEqual(woundsOf(world([p]), b, T), { parts: { body: 0.7, legs: 0.7 }, by: 'raptor' });
  p.down = ['a'];
  assert.equal(woundsOf(world([p]), b, T).parts.body, 1);
});

test('at home a wound closes over its time, then only the scar is left', () => {
  const b = { id: 'a', wound: { parts: ['head'], open: 0.8, at: T, until: T + WOUNDS.mins * 60000 } };
  assert.equal(woundsOf(world(), b, T).parts.head, 0.8);
  assert.equal(woundsOf(world(), b, T + WOUNDS.mins * 30000).parts.head, 0.4);
  assert.equal(woundsOf(world(), b, T + WOUNDS.mins * 60000), null);
  assert.equal(woundsOf(world(), { id: 'b' }, T), null);
});

test('in the hospital its wounds are seen to: sewn up, and closing over its stay', () => {
  const b = { id: 'a', wound: { parts: ['body'], by: 'raptor', open: 1, at: T, until: T + 3600000, stitched: true } };
  assert.deepEqual(woundsOf(world(), b, T + 1800000), { parts: { body: 0.5 }, by: 'raptor', stitched: true });
});
