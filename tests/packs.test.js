import { test } from 'node:test';
import { collect } from './journey-helper.js';
import { legMins } from '../js/journey.js';
import assert from 'node:assert/strict';
import { applyAction, seededRand } from '../js/economy.js';
import { freshState, migrate } from '../js/state.js';
import { fighterOf, creatureFighter, wildFighter, teamFight, teamWinChance, unitOf, sizeEdge, hitOf } from '../js/combat.js';
import { ALL_HEXES, hexKey, hexDist, newWorld, tripMins, isAway, exploreProblem, expeditionOf, injuredLeft, threatAt, parseKey, landHexes } from '../js/world.js';
import { packOf } from '../js/packs.js';
import { PACK_LIMITS, PACK_MIN, TEAM_SLOTS, INJURY_MINS, SPECIES, SCOUT } from '../js/config.js';

const T0 = 1_000_000_000_000;
const genes = n => ({ str: n, agi: n, vit: n, res: n });
const dino = (id, type = 'compy', g = 50, fed = 30) => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed, lastFed: T0, genes: genes(g), equip: {} });
// a herd of up to 10 (Hypacrosaurus)
const compys = (n, g = 50) => Array.from({ length: n }, (_, i) => dino(`c${i}`, 'hypa', g));
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
  const s = game(...compys(12), dino('rex1', 'rex'), dino('tiny', 'hypa', 50, 0));
  assert.equal(applyAction(s, 'formPack', { type: 'rex', members: ['rex1'] }).reason, 'not-pack-species');
  assert.equal(applyAction(s, 'formPack', { type: 'hypa', members: ['c0'] }).reason, 'too-few');
  assert.equal(applyAction(s, 'formPack', { type: 'hypa', members: s.hatched.slice(0, 11).map(b => b.id) }).reason, 'too-many');
  assert.equal(applyAction(s, 'formPack', { type: 'hypa', members: ['c0', 'tiny'] }).reason, 'too-young');
  assert.equal(applyAction(s, 'formPack', { type: 'hypa', members: ['c0', 'rex1'] }).reason, 'bad-members');
  const r = applyAction(s, 'formPack', { type: 'hypa', members: ['c0', 'c1', 'c2'], name: '  Biters ' });
  assert.equal(r.ok, true);
  assert.equal(r.pack.name, 'Biters');
  assert.equal(packOf(s, 'c1').id, r.pack.id);
  assert.equal(applyAction(s, 'formPack', { type: 'hypa', members: ['c2', 'c3'] }).reason, 'in-other-pack');
  assert.equal(applyAction(s, 'setPackMembers', { id: r.pack.id, members: ['c0', 'c1', 'c2', 'c3'] }).ok, true);
  // fewer than the minimum breaks it up
  assert.equal(applyAction(s, 'setPackMembers', { id: r.pack.id, members: ['c0'] }).disbanded, true);
  assert.equal(s.packs.length, 0);
  assert.ok(PACK_MIN === 2 && PACK_LIMITS.hypa === 10);
  // a Compsognathus lived alone: no packs of it
  assert.equal(applyAction(s, 'formPack', { type: 'compy', members: ['x', 'y'] }).reason, 'not-pack-species');
});

test('a team of up to 5 places goes out together; a pack takes one place', () => {
  const s = game(...compys(10), dino('r1', 'raptor'), dino('r2', 'raptor'), dino('d1', 'dilo'), dino('d2', 'dilo'), dino('d3', 'dilo'), dino('d4', 'dilo'));
  const p = applyAction(s, 'formPack', { type: 'hypa', members: compys(10).map(b => b.id) }).pack;
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

test('a team comes home together: as hungry as the journey left it, the downed ones injured', () => {
  const s = game(...compys(3, 10));
  const p = applyAction(s, 'formPack', { type: 'hypa', members: ['c0', 'c1', 'c2'] }).pack;
  // a far hex with a fight the small pack loses
  const key = '7,0';
  const r = applyAction(s, 'explore', { team: [{ kind: 'pack', id: p.id }], hex: key }, T0);
  assert.equal(r.ok, true, r.reason);
  const back = T0 + tripMins(key, 42) * 60000;
  const c = collect(s, { id: r.expedition.id }, back);
  assert.equal(c.ok, true);
  if (c.battle) {
    assert.equal(c.battle.team.length, 1);
    if (!c.battle.win) for (const b of s.hatched) assert.ok(injuredLeft(b, back) >= INJURY_MINS * 60000);
  }
  for (const b of s.hatched) assert.ok(b.lastFed <= back);
  assert.equal(s.world.expeditions.length, 0);
});

test('team fights replay the same and a pack loses at most one member per blow', () => {
  const foe = wildFighter('rex', 6);
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

test('no pack of Compsognathus can hurt a Tyrannosaurus: its hide stops even a perfect bite', () => {
  const worstRex = fighterOf(dino('rex', 'rex', 0));
  const perfect = fighterOf({ ...dino('c', 'compy', 100), equip: {} });
  assert.ok(perfect.damage * 1.25 > SPECIES.compy.bite);       // the jaws hold it back, not its strength
  assert.equal(hitOf(perfect, worstRex, 1.25), 0);
  assert.equal(teamWinChance([pack('compy', 10, 100)], worstRex), 0);
  const r = teamFight([pack('compy', 10, 100)], worstRex, seededRand('bite'));
  for (const e of r.log) if (e.by === 0 && !e.miss) assert.equal(e.dmg, 0);
  // nor can a turkey-sized Velociraptor; an Allosaurus bites through
  assert.equal(hitOf(fighterOf(dino('r', 'raptor', 100)), worstRex, 1.25), 0);
  assert.ok(hitOf(fighterOf(dino('a', 'allo', 50)), worstRex, 1) > 0);
  assert.ok(sizeEdge(worstRex, perfect) > 1);
});

test('older saves turn a one-explorer trip into a team of one', () => {
  const s = game(dino('a', 'dilo'));
  // (on everyone's continent: a save on another is started over)
  s.world = newWorld();
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

test('a Compsognathus scouts for its team: fewer fights, more nests found', () => {
  // a hex where grown raptors wait (they hunt a Protoceratops; other theropods aren't on their menu,
  // and young ones only take smaller prey)
  const key = landHexes(42).map(h => hexKey(...h)).find(k => {
    const t = threatAt(42, parseKey(k));
    return hexDist(parseKey(k)) > 4 && !t.lair && t.id === 'raptor' && ['adult', 'prime'].includes(t.age);
  });
  const trips = (team, g) => {
    const s = game(dino('d1', 'proto', g), dino('c1', 'compy', g));
    let fights = 0, eggs = 0, mins = 0;
    for (let i = 0; i < 300; i++) {
      s.world.expeditions = [];
      // (one that died comes back for the next try)
      for (const [id, t] of [['d1', 'proto'], ['c1', 'compy']]) if (!s.hatched.some(b => b.id === id)) s.hatched.push(dino(id, t, g));
      s.hatched.forEach(b => { b.lastFed = T0; delete b.injuredUntil; delete b.critical; });
      const r = applyAction(s, 'explore', { team: team.map(id => ({ kind: 'dino', id })), hex: key }, T0);
      assert.equal(r.ok, true, r.reason);
      mins = (r.expedition.returnAt - T0) / 60000;
      const c = collect(s, { id: r.expedition.id }, r.expedition.returnAt);
      if (c.battle) fights++;
      eggs += c.story.filter(e => e.kind === 'nest').length;
      s.eggs = [];
    }
    return { fights, eggs, mins };
  };
  const without = trips(['d1'], 100), led = trips(['d1', 'c1'], 100);
  assert.equal(without.mins, legMins(game(dino('d1', 'proto', 1)), ['d1'], '0,0', key));
  // too small to ride: no shorter trip
  assert.equal(led.mins, without.mins);
  assert.ok(led.fights < without.fights * 0.75, `${led.fights} vs ${without.fights}`);
  assert.ok(led.eggs > without.eggs, `${led.eggs} vs ${without.eggs}`);
});

test('Allosaurus hunt alone: no packs, and two in one team may turn on each other and go into a frenzy', () => {
  const s = game(dino('a1', 'allo'), dino('a2', 'allo'));
  assert.equal(applyAction(s, 'formPack', { type: 'allo', members: ['a1', 'a2'] }).reason, 'not-pack-species');
  const foe = wildFighter('rex', 7);
  // (made to stand their ground: they would run from a bigger predator)
  const pair = () => [unitOf('a1', [{ ...fighterOf(dino('a1', 'allo')), fear: undefined }]), unitOf('a2', [{ ...fighterOf(dino('a2', 'allo')), fear: undefined }])];
  let clashes = 0;
  for (let i = 0; i < 60; i++) {
    const r = teamFight(pair(), foe, seededRand('rivals' + i));
    const first = r.log.findIndex(e => e.clash);
    if (first < 0) { assert.equal(r.log.some(e => e.frenzy || e.ally !== undefined), false); continue; }
    clashes++;
    const c = r.log[first];
    assert.ok(c.ally !== c.by && c.dmg > 0);
    assert.deepEqual([...r.frenzy].sort(), [0, 1]);
    // nothing frenzied before the clash, and only the two of them after it
    assert.ok(r.log.slice(0, first).every(e => !e.frenzy));
    assert.ok(r.log.filter(e => e.frenzy).every(e => r.frenzy.includes(e.by)));
  }
  assert.ok(clashes > 10, `${clashes} clashes`);
  // with a Triceratops along: it is only bitten once a single Allosaurus is left standing
  let lastOnes = 0;
  for (let i = 0; i < 200; i++) {
    const team = [...pair(), unitOf('t1', [fighterOf(dino('t1', 'trike'))])];
    const r = teamFight(team, foe, seededRand('ffa' + i));
    const hp = team.map(u => u.members.map(m => m.hp));
    for (const e of r.log) {
      if (e.ally === 2) {
        assert.ok(hp[0][0] <= 0 || hp[1][0] <= 0, 'the Triceratops is bitten only when one Allosaurus is down');
        lastOnes++;
      }
      if (e.ally !== undefined) hp[e.ally][e.member] = e.left;
      else if (e.by === 'foe' && !e.miss && e.to !== undefined && e.left !== undefined) hp[e.to][e.member] = e.left;
    }
  }
  assert.ok(lastOnes > 0, 'the last Allosaurus standing bites its friends');
  // a lone Allosaurus, or two raptors, never turn on anyone
  for (const team of [[pair()[0]], [unitOf('r1', [fighterOf(dino('r1', 'raptor'))]), unitOf('r2', [fighterOf(dino('r2', 'raptor'))])]])
    assert.equal(teamFight(team, foe, seededRand('calm')).log.some(e => e.ally !== undefined), false);
});

test('only a won fight that went into a frenzy drops Allosaurus teeth and blood, more with more Allosaurus', () => {
  // the nearest lair of an Allosaurus (one goes for its own kind)
  const key = landHexes(42).map(h => hexKey(...h)).find(k => threatAt(42, parseKey(k)).lair && threatAt(42, parseKey(k)).id === 'allo');
  const haul = n => {
    const ids = Array.from({ length: n }, (_, i) => 'a' + i);
    const s = game(...ids.map(id => dino(id, 'allo', 80)));
    const got = { allo_tooth: 0, allo_blood: 0, frenzyWins: 0 };
    for (let i = 0; i < 150; i++) {
      s.world.expeditions = [];
      // (one that died comes back for the next try)
      for (const id of ids) if (!s.hatched.some(b => b.id === id)) s.hatched.push(dino(id, 'allo', 80));
      s.hatched.forEach(b => { b.lastFed = T0; delete b.injuredUntil; delete b.critical; });
      const r = applyAction(s, 'explore', { team: ids.map(id => ({ kind: 'dino', id })), hex: key }, T0);
      assert.equal(r.ok, true, r.reason);
      const c = collect(s, { id: r.expedition.id }, r.expedition.returnAt);
      // (something met on the way instead)
      if (c.intercepted) continue;
      const drops = c.loot.filter(l => l.id in got);
      if (!c.battle || !c.battle.win || !c.battle.frenzy.length) assert.deepEqual(drops, []);
      else got.frenzyWins++;
      for (const l of drops) got[l.id] += l.n;
    }
    return got;
  };
  const one = haul(1), two = haul(2), three = haul(3);
  assert.equal(one.allo_tooth + one.allo_blood, 0);
  assert.ok(two.allo_blood > 0 && three.frenzyWins > 0);
  assert.ok(three.allo_blood / three.frenzyWins > two.allo_blood / two.frenzyWins, JSON.stringify({ two, three }));
});

test('a full Coelophysis pack (the biggest of all) fights with more of every stat', async () => {
  const { fullPackMods } = await import('../js/world.js');
  assert.equal(PACK_LIMITS.coelo, Math.max(...Object.values(PACK_LIMITS)));
  assert.deepEqual(fullPackMods('coelo', PACK_LIMITS.coelo - 1), []);
  assert.equal(fullPackMods('coelo', PACK_LIMITS.coelo).length, 4);
  assert.deepEqual(fullPackMods('hypa', PACK_LIMITS.hypa), []);
  const b = dino('c', 'coelo');
  const plain = fighterOf(b), full = fighterOf(b, fullPackMods('coelo', PACK_LIMITS.coelo));
  assert.ok(full.hp > plain.hp && full.damage > plain.damage && full.agi > plain.agi);
});

test('only so many fit around a foe, a much bigger foe catches several at once, and bigger bodies have more health', async () => {
  const { hpForMass } = await import('../js/economy.js');
  const { REACH_SLOTS, KG, MASS } = await import('../js/config.js');
  const coelos = n => unitOf('p', Array.from({ length: n }, (_, i) => fighterOf(dino('c' + i, 'coelo'))), true);
  // every Coelophysis strikes as itself on the pack's turn, but only REACH_SLOTS.small fit around a small foe
  const small = wildFighter('hypsi', 5);
  const r1 = teamFight([coelos(15)], small, seededRand('reach'));
  const firstFoe = r1.log.findIndex(e => e.by === 'foe');
  const blows = r1.log.slice(0, firstFoe < 0 ? r1.log.length : firstFoe).filter(e => e.by === 0);
  assert.ok(blows.length > 1 && blows.length <= REACH_SLOTS.small);
  assert.equal(new Set(blows.map(e => e.at)).size, blows.length);
  // a Tyrannosaurus blow on a pack of compys catches more than one
  const r = teamFight([coelos(6)], wildFighter('rex', 6), seededRand('stomp'));
  assert.ok(r.fled.length || r.log.some(e => e.by === 'foe' && e.also && e.also.length));
  // health grows with the weight, not as fast: a 350 kg body as it is
  assert.equal(hpForMass(500, MASS.ref), 500);
  assert.ok(hpForMass(500, KG.rex) > hpForMass(500, KG.dilo) && hpForMass(500, KG.dilo) > hpForMass(500, KG.coelo));
  assert.ok(hpForMass(500, KG.rex) / hpForMass(500, KG.coelo) < KG.rex / KG.coelo);
});

test('a pack or herd that loses half its members runs off', () => {
  const ROUT_RUNS = 40;
  for (let i = 0; i < ROUT_RUNS; i++) {
    // a wild herd: once half of it is down the rest run and the team wins
    const herd = unitOf('herd', Array.from({ length: 3 }, (_, k) => wildFighter('proto', 4)), true);
    const r = teamFight([pack('coelo', 15, 50)], herd, seededRand('rout' + i));
    const down = r.foeHps.filter(h => h <= 0).length;
    if (r.foeRouted) {
      assert.ok(r.win);
      assert.ok(down >= 2 && down < 3);
      assert.deepEqual(r.log.at(-1), { by: 'foe', rout: true });
    }
    // our pack: it runs once half of it is down, and stays out of the rest of the fight
    for (const u of r.routed) {
      const at = r.log.findIndex(e => e.by === u && e.rout);
      assert.ok(at >= 0);
      assert.ok(r.hp[u].filter(h => h <= 0).length >= r.hp[u].length / 2);
      assert.ok(!r.log.slice(at + 1).some(e => e.by === u || (e.by === 'foe' && e.to === u)));
    }
  }
  // four Velociraptors against a grown herd: sometimes they are the ones that break
  let broke = 0;
  for (let i = 0; i < ROUT_RUNS; i++) {
    const herd = unitOf('herd', Array.from({ length: 3 }, () => wildFighter('proto', 8)), true);
    const r = teamFight([pack('raptor', 4, 50)], herd, seededRand('break' + i));
    if (!r.routed.length) continue;
    broke++;
    assert.equal(r.win, false);
    // it breaks at the first turn after half of it is down (a herd's charge can take more at once)
    assert.ok(r.hp[0].filter(h => h <= 0).length >= 2);
  }
  assert.ok(broke > 0);
  // a lone animal has no pack to lose
  const lone = teamFight([pack('coelo', 15, 50)], wildFighter('proto', 4), seededRand('lone'));
  assert.equal(lone.foeRouted, false);
});

test('Parasaurolophus can be formed into a herd of up to six', () => {
  assert.equal(PACK_LIMITS.para, 6);
});
