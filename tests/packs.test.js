import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, seededRand } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { fighterOf, creatureFighter, teamFight, teamWinChance, unitOf, sizeEdge } from '../js/combat.js';
import { ALL_HEXES, hexKey, newWorld, tripMins, isAway, exploreProblem, expeditionOf, injuredLeft } from '../js/world.js';
import { packOf } from '../js/packs.js';
import { PACK_LIMITS, PACK_MIN, TEAM_SLOTS, INJURY_MINS } from '../js/config.js';

const T0 = 1_000_000_000_000;
const genes = n => ({ str: n, agi: n, vit: n, res: n });
const dino = (id, type = 'compy', g = 50, fed = 30) => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed, lastFed: T0, genes: genes(g), equip: {} });
const compys = (n, g = 50) => Array.from({ length: n }, (_, i) => dino(`c${i}`, 'compy', g));
function game(...babies) {
  const s = freshState();
  s.world = newWorld(42);
  s.hatched.push(...babies);
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  return s;
}
const pack = (type, n, g) => unitOf('pack', Array.from({ length: n }, (_, i) => fighterOf(dino(`${type}${i}`, type, g))), true);
const solo = (type, g = 50) => unitOf(type, [fighterOf(dino(type, type, g))]);

test('only pack species form packs, from 2 up to their limit, one pack each, never babies', () => {
  const s = game(...compys(12), dino('rex1', 'rex'), dino('tiny', 'compy', 50, 0));
  assert.equal(applyAction(s, 'formPack', { type: 'rex', members: ['rex1'] }).reason, 'not-pack-species');
  assert.equal(applyAction(s, 'formPack', { type: 'compy', members: ['c0'] }).reason, 'too-few');
  assert.equal(applyAction(s, 'formPack', { type: 'compy', members: s.hatched.slice(0, 11).map(b => b.id) }).reason, 'too-many');
  assert.equal(applyAction(s, 'formPack', { type: 'compy', members: ['c0', 'tiny'] }).reason, 'too-young');
  assert.equal(applyAction(s, 'formPack', { type: 'compy', members: ['c0', 'rex1'] }).reason, 'bad-members');
  const r = applyAction(s, 'formPack', { type: 'compy', members: ['c0', 'c1', 'c2'], name: '  Biters ' });
  assert.equal(r.ok, true);
  assert.equal(r.pack.name, 'Biters');
  assert.equal(packOf(s, 'c1').id, r.pack.id);
  assert.equal(applyAction(s, 'formPack', { type: 'compy', members: ['c2', 'c3'] }).reason, 'in-other-pack');
  assert.equal(applyAction(s, 'setPackMembers', { id: r.pack.id, members: ['c0', 'c1', 'c2', 'c3'] }).ok, true);
  // fewer than the minimum breaks it up
  assert.equal(applyAction(s, 'setPackMembers', { id: r.pack.id, members: ['c0'] }).disbanded, true);
  assert.equal(s.packs.length, 0);
  assert.ok(PACK_MIN === 2 && PACK_LIMITS.compy === 10);
});

test('a team of up to 5 places goes out together; a pack takes one place', () => {
  const s = game(...compys(10), dino('r1', 'raptor'), dino('r2', 'raptor'), dino('d1', 'dilo'), dino('d2', 'dilo'), dino('d3', 'dilo'), dino('d4', 'dilo'));
  const p = applyAction(s, 'formPack', { type: 'compy', members: compys(10).map(b => b.id) }).pack;
  const team = [{ kind: 'pack', id: p.id }, { kind: 'player' }, { kind: 'dino', id: 'd1' }, { kind: 'dino', id: 'd2' }, { kind: 'dino', id: 'd3' }];
  assert.equal(exploreProblem(s, [...team, { kind: 'dino', id: 'd4' }], '1,0', T0), 'team-full');
  assert.equal(exploreProblem(s, [{ kind: 'pack', id: p.id }, { kind: 'dino', id: 'c3' }], '1,0', T0), 'twice');
  assert.equal(exploreProblem(s, [], '1,0', T0), 'no-team');
  const r = applyAction(s, 'explore', { team, hex: '1,0' }, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.expedition.members.length, 10 + 1 + 3);
  assert.ok(TEAM_SLOTS === 5 && isAway(s, 'c7') && isAway(s, 'player'));
  assert.equal(expeditionOf(s, 'd2').id, r.expedition.id);
  // a pack out can't change
  assert.equal(applyAction(s, 'disbandPack', { id: p.id }).reason, 'away');
  // a hungry or injured member keeps the whole team home
  s.hatched.find(b => b.id === 'r2').injuredUntil = T0 + 60000;
  assert.equal(exploreProblem(s, [{ kind: 'dino', id: 'r1' }, { kind: 'dino', id: 'r2' }], '1,0', T0), 'injured');
  // one explorer's id still works
  assert.equal(applyAction(s, 'explore', { babyId: 'r1', hex: '0,1' }, T0).ok, true);
});

test('a team comes home together: everyone hungry, the downed ones injured', () => {
  const s = game(...compys(3, 10));
  const p = applyAction(s, 'formPack', { type: 'compy', members: ['c0', 'c1', 'c2'] }).pack;
  // a far hex with a fight the small pack loses
  const key = '7,0';
  const r = applyAction(s, 'explore', { team: [{ kind: 'pack', id: p.id }], hex: key }, T0);
  assert.equal(r.ok, true, r.reason);
  const back = T0 + tripMins(key) * 60000;
  const c = applyAction(s, 'collectTrip', { id: r.expedition.id }, back);
  assert.equal(c.ok, true);
  if (c.battle) {
    assert.equal(c.battle.team.length, 1);
    if (!c.battle.win) for (const b of s.hatched) assert.equal(injuredLeft(b, back), INJURY_MINS * 60000);
  }
  for (const b of s.hatched) assert.ok(b.lastFed < back);
  assert.equal(s.world.expeditions.length, 0);
});

test('team fights replay the same and a pack loses at most one member per blow', () => {
  const foe = creatureFighter('old_tyrant', 6);
  const units = [pack('compy', 10, 50)];
  const a = teamFight(units, foe, seededRand('x')), b = teamFight(units, foe, seededRand('x'));
  assert.deepEqual(a, b);
  for (const e of a.log) if (e.by === 'foe' && !e.miss) assert.ok(e.dmg > 0 && e.left >= 0);
  // members can only go down one at a time: each foe blow leaves at most one more member at 0
  const hp = units[0].members.map(m => m.hp);
  for (const e of a.log) if (e.by === 'foe' && !e.miss) {
    const before = hp.filter(h => h <= 0).length;
    hp[e.member] = e.left;
    assert.ok(hp.filter(h => h <= 0).length - before <= 1);
  }
});

test('a Tyrannosaurus beats a Compsognathus, but a big trained pack can bring one down', () => {
  const rex = fighterOf(dino('rex', 'rex', 50));
  assert.ok(sizeEdge(rex, fighterOf(dino('c', 'compy'))) > 1);
  assert.equal(teamWinChance([solo('compy', 90)], rex), 0);
  assert.ok(teamWinChance([pack('compy', 3, 90)], rex) < 0.05);
  assert.ok(teamWinChance([pack('compy', 10, 90)], rex) > 0.8);
});

test('older saves turn a one-explorer trip into a team of one', () => {
  const s = game(dino('a', 'dilo'));
  s.saveVersion = 11;
  delete s.packs;
  s.world.expeditions = [{ id: 't1', babyId: 'a', hex: '1,0', trip: 1, startedAt: T0, returnAt: T0 + tripMins('1,0') * 60000 }];
  s.world.trips = 1;
  const m = migrate(s);
  assert.deepEqual(m.packs, []);
  assert.deepEqual(m.world.expeditions[0].members, ['a']);
  assert.equal(m.world.expeditions[0].team[0].kind, 'dino');
  assert.equal(isAway(m, 'a'), true);
});
