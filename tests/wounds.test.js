import { test } from 'node:test';
import assert from 'node:assert/strict';
import { woundsOf } from '../js/journey.js';
import { WOUNDS } from '../js/config.js';

const T = Date.parse('2026-10-20T12:00:00Z');
const world = (expeditions = []) => ({ player: {}, world: { expeditions } });

test('a wound on a journey is as open as the dinosaur is hurt', () => {
  const b = { id: 'a', wound: { parts: ['body', 'legs'], by: 'raptor' } };
  const p = { members: ['a'], health: { a: 0.3 }, down: [] };
  assert.deepEqual(woundsOf(world([p]), b, T), { parts: { body: 0.7, legs: 0.7 }, by: 'raptor', deep: [] });
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
  assert.deepEqual(woundsOf(world(), b, T + 1800000), { parts: { body: 0.5 }, by: 'raptor', deep: [], stitched: true });
});

test('a wound keeps which parts were deeply wounded, so they gape and heal into a deep scar', () => {
  const b = { id: 'a', wound: { parts: ['body', 'tail'], deep: ['body'], by: 'raptor', open: 1, at: T, until: T + 3600000 } };
  assert.deepEqual(woundsOf(world(), b, T).deep, ['body']);
  assert.deepEqual(woundsOf(world(), { id: 'c', wound: { parts: ['head'], open: 1, at: T, until: T + 3600000 } }, T).deep, []);
});

test('the parts sewn up in the hospital are kept with the save', async () => {
  const { migrate, freshState } = await import('../js/state.js');
  const s = freshState();
  s.hatched.push({ id: 'a', type: 'rex', sex: 'm', name: 'King', at: T, gen: 1, sewn: ['body', 'nonsense', 'legs'] });
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))).hatched.find(b => b.id === 'a').sewn, ['body', 'legs']);
});

test('the eye a dinosaur lost is kept with the save, one only', async () => {
  const { migrate, freshState } = await import('../js/state.js');
  const s = freshState();
  s.hatched.push({ id: 'a', type: 'rex', sex: 'm', name: 'King', at: T, gen: 1, blind: 'right' }, { id: 'b', type: 'rex', sex: 'f', name: 'Queen', at: T, gen: 1, blind: 'both' });
  const out = migrate(JSON.parse(JSON.stringify(s))).hatched;
  assert.equal(out.find(b => b.id === 'a').blind, 'right');
  assert.equal(out.find(b => b.id === 'b').blind, undefined);
});

test('a horn driven deep into the flank or neck: the hospital there and then, or death', async () => {
  const { freshState } = await import('../js/state.js');
  const { newWorld, threatAt, landHexes, hexKey } = await import('../js/world.js');
  const { applyAction } = await import('../js/economy.js');
  const { collect } = await import('./journey-helper.js');
  const { GORE } = await import('../js/config.js');
  const dino = id => ({ id, type: 'rex', sex: 'm', name: id, at: 0, gen: 1, fed: 999, lastFed: T, genes: { str: 70, agi: 70, vit: 70, res: 70 }, equip: {} });
  const hexes = landHexes(42).filter(h => threatAt(42, h).id === 'trike').slice(0, 40);
  const outcome = fly => {
    for (const h of hexes) for (let r = 0; r < 4; r++) {
      const s = freshState(); s.world = newWorld(42); s.coins = 1e6;
      s.hatched.push(dino('rx'));
      if (!applyAction(s, 'explore', { team: [{ kind: 'dino', id: 'rx' }], hex: hexKey(...h) }, T + r * 997).ok) continue;
      const p = s.world.expeditions.at(-1);
      const story = collect(s, { id: p.id, fight: true, hunt: true, ...(fly ? { airlift: ['rx'] } : {}) }, p.leg.arriveAt).story;
      const gore = story.find(e => e.kind === 'gored' && !e.killed);
      if (gore) return { gore, story, s };
    }
    return null;
  };
  const left = outcome(false), flown = outcome(true);
  assert.ok(left && flown, 'a Triceratops gores deep now and then');
  assert.ok(GORE.parts.includes(left.gore.part));
  // carried on, it dies of it; flown home, it lands at the hospital
  assert.ok(left.story.some(e => e.kind === 'goreDied'));
  assert.ok(!left.s.hatched.some(b => b.id === 'rx'));
  assert.ok(flown.story.some(e => e.kind === 'airlift' && e.who.includes('rx')));
  assert.ok(flown.s.hatched.find(b => b.id === 'rx').hospital);
});
