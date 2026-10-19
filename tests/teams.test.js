import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { TEAM_PRESETS, TEAM_SLOTS } from '../js/config.js';
import { cleanTeams, PRESET_SLOTS } from '../js/teams.js';

const T0 = 1_700_000_000_000;
const dino = (id, fed, type) => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed, lastFed: T0, genes: { str: 50, agi: 50, vit: 50, res: 50 }, equip: {} });

test('team presets: places for dinosaurs old enough and packs, the player always along besides', () => {
  const s = freshState();
  s.hatched.push(dino('a', 30, 'galli'), dino('b', 30, 'trike'), dino('baby', 0, 'proto'));
  const presets = cleanTeams(s);
  assert.equal(presets.length, TEAM_PRESETS);
  assert.equal(PRESET_SLOTS, TEAM_SLOTS - 1);
  assert.ok(presets.every(t => t.slots.length === PRESET_SLOTS && t.slots.every(x => x === null)));
  assert.equal(applyAction(s, 'setTeamSlot', { team: 0, slot: 0, unit: { kind: 'dino', id: 'a' } }, T0).ok, true);
  assert.equal(applyAction(s, 'setTeamSlot', { team: 0, slot: 2, unit: { kind: 'dino', id: 'b' } }, T0).ok, true);
  assert.deepEqual(s.teams[0].slots, [{ kind: 'dino', id: 'a' }, null, { kind: 'dino', id: 'b' }, null]);
  // babies stay home, the player is never a place of its own, nothing unknown
  assert.equal(applyAction(s, 'setTeamSlot', { team: 0, slot: 1, unit: { kind: 'dino', id: 'baby' } }, T0).reason, 'too-young');
  assert.equal(applyAction(s, 'setTeamSlot', { team: 0, slot: 1, unit: { kind: 'player', id: 'player' } }, T0).ok, false);
  assert.equal(applyAction(s, 'setTeamSlot', { team: 9, slot: 1, unit: { kind: 'dino', id: 'a' } }, T0).ok, false);
  // one already in the team moves to the new place
  applyAction(s, 'setTeamSlot', { team: 0, slot: 3, unit: { kind: 'dino', id: 'a' } }, T0);
  assert.deepEqual(s.teams[0].slots, [null, null, { kind: 'dino', id: 'b' }, { kind: 'dino', id: 'a' }]);
  // emptied, renamed
  applyAction(s, 'setTeamSlot', { team: 0, slot: 2, unit: null }, T0);
  assert.equal(s.teams[0].slots[2], null);
  applyAction(s, 'renameTeam', { team: 0, name: '  Scouts  ' }, T0);
  assert.equal(s.teams[0].name, 'Scouts');
  applyAction(s, 'renameTeam', { team: 0, name: '' }, T0);
  assert.equal(s.teams[0].name, 'Team 1');
  // a dinosaur gone leaves its place empty when the save is loaded
  s.teams[1].slots[0] = { kind: 'dino', id: 'b' };
  s.hatched = s.hatched.filter(b => b.id !== 'b');
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(back.teams[1].slots[0], null);
  assert.deepEqual(back.teams[0].slots[3], { kind: 'dino', id: 'a' });
});
