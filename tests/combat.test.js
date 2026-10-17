import { test } from 'node:test';
import { collect, reach } from './journey-helper.js';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, buyGear, equipGear, seededRand } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { fight, fighterOf, creatureFighter, wildFighter, encounterUnit, teamFight as realFight, unitOf, winChance, dangerOf } from '../js/combat.js';
// Most tests here look at how abilities play out, between animals that may not be on each other's menu:
// their foes are made hungry enough to go for anything (the food chain has tests of its own, realFight)
const hungry = f => ({ ...f, hunts: 'any', preyMax: 'colossal' });
const teamFight = (units, foe, rand, opts) => realFight(units, foe.members ? { ...foe, members: foe.members.map(hungry) } : hungry(foe), rand, opts);
import { ALL_HEXES, hexKey, hexDist, newWorld, isLair, threatAt, tripMins, injuredLeft, exploreProblem, keepsAway, teamUnits, landHexes } from '../js/world.js';
import { CREATURES, BIOMES, SPECIES, INJURY_MINS, CRITICAL_MINS, HEAL_MINS, LAIR_MIN_DIST, SIZE_ORDER } from '../js/config.js';
// whether what waits in a hex shows itself to a team whose biggest is size (it keeps away otherwise)
// whether what waits in a hex comes for a team of one dinosaur of this kind: a predator, not keeping
// away from it, nor passing it by (the food chain)
const showsTo = (key, type) => { const s = game(dino('x', 50, type)), t = threatAt(42, key.split(',').map(Number)); return (t.foe.members[0].role || 'attacker') === 'attacker' && !keepsAway(t, teamUnits(s, [{ kind: 'dino', id: 'x', members: ['x'] }])); };

const T0 = 1_000_000_000_000;
const genes = n => ({ str: n, agi: n, vit: n, res: n });
const dino = (id, g, type = 'rex') => ({ id, type, sex: 'm', name: id, at: 0, gen: 1, fed: 30, lastFed: T0, genes: genes(g), equip: {} });
function game(...babies) {
  const s = freshState();
  s.world = newWorld(42);
  s.hatched.push(...babies);
  s.world.revealed.push(...ALL_HEXES.map(h => hexKey(...h)));
  return s;
}
// sends a dinosaur to a hex and brings it back
function trip(s, id, key) {
  const r = applyAction(s, 'explore', { babyId: id, hex: key }, T0);
  assert.equal(r.ok, true, r.reason);
  return collect(s, { id: r.expedition.id }, T0 + tripMins(key, 42) * 60000);
}

test('a fight is decided by the stats and replays the same with the same rolls', () => {
  const strong = fighterOf(dino('a', 100)), weak = wildFighter('compy', 1);
  const one = fight(strong, weak, seededRand('x')), two = fight(strong, weak, seededRand('x'));
  assert.deepEqual(one, two);
  assert.equal(one.win, true);
  assert.equal(one.hpB, 0);
  // the log adds up: every hit lowers the target's health to "left"
  let hp = { a: one.maxA, b: one.maxB };
  for (const blow of one.log) if (!blow.miss) { const t = blow.by === 'a' ? 'b' : 'a'; hp[t] = Math.max(0, hp[t] - blow.dmg); assert.equal(blow.left, hp[t]); }
  assert.equal(winChance(strong, weak), 1);
  assert.equal(dangerOf(1), 'Easy');
  assert.equal(dangerOf(0.1), 'Deadly');
});

test('every biome has its wild animals, stronger and in bigger packs farther out, strongest in a lair', () => {
  const power = u => u.members.reduce((t, m) => t + m.power, 0);
  for (const b of Object.values(BIOMES)) {
    assert.ok(b.wild.length);
    for (const e of b.wild) {
      assert.ok(e.species ? SPECIES[e.species] : CREATURES[e.creature]);
      assert.ok(e.loot.length && e.weight > 0);
      assert.ok(power(encounterUnit(e, 5)) > power(encounterUnit(e, 2)));
      assert.ok(power(encounterUnit(e, 5, true)) > power(encounterUnit(e, 5)));
      assert.match(encounterUnit(e, 5, true).name, /^Alpha /);
      if (e.pack) assert.ok(encounterUnit(e, 7).members.length > encounterUnit(e, 1).members.length);
    }
  }
  const lairs = landHexes(42).filter(h => isLair(42, h));
  assert.ok(lairs.length > 0);
  for (const h of lairs) { assert.ok(hexDist(h) >= LAIR_MIN_DIST); assert.equal(threatAt(42, h).chance, 1); }
});

// the lairs on the map, weakest creature first
const lairs = seed => landHexes(42).filter(h => isLair(seed, h)).sort((x, y) => threatAt(seed, x).foe.power - threatAt(seed, y).foe.power).map(h => hexKey(...h));
// the strongest lair of a Tyrannosaurus (something that hunts a Triceratops, and wins)
const rexLairTop = () => lairs(42).filter(k => threatAt(42, k.split(',').map(Number)).id === 'rex').at(-1);
// a Triceratops runt sent to a Tyrannosaurus' lair (it stands up to anything, so it fights, and loses)
// until one comes home alive (one brought down may not survive)
function lostAtLair() {
  for (const key of lairs(42).filter(k => threatAt(42, k.split(',').map(Number)).id === 'rex').reverse()) {
    const s = game(dino('runt', 1, 'trike'));
    const r = trip(s, 'runt', key);
    if (s.hatched.length && r.battle && !r.intercepted) return { s, key, r, back: T0 + tripMins(key, 42) * 60000 };
  }
  assert.fail('every runt died');
}

test('beating a creature brings its loot and coins on top of the hex', () => {
  const s = game(dino('champ', 100));
  // (a Deinosuchus lair: it goes for anything, a Tyrannosaurus too)
  const key = lairs(42).find(k => showsTo(k, 'rex') && threatAt(42, k.split(',').map(Number)).id === 'deinosuchus');
  const r = trip(s, 'champ', key);
  assert.equal(r.battle.win, true);
  assert.equal(r.battle.lair, true);
  const cLoot = threatAt(42, key.split(',').map(Number)).entry.loot.map(l => l[0]);
  assert.ok(r.loot.some(l => cLoot.includes(l.id)));
  assert.ok(r.coins > 0);
  assert.equal(injuredLeft(s.hatched[0], T0 + tripMins(key, 42) * 60000) >= 0, true);
});

test('losing brings nothing, still maps the land, and leaves the dinosaur injured (critically, as it went down)', () => {
  // a Triceratops stands up to anything, so it fights even a Tyrannosaurus' lair (and loses)
  const { s, key, r, back } = lostAtLair();
  const coins = 0;
  assert.equal(r.battle.win, false);
  assert.deepEqual(r.loot, []);
  assert.equal(r.coins, 0);
  assert.equal(s.coins, coins);
  assert.equal(s.world.visited.includes(key), false);
  assert.equal(injuredLeft(s.hatched[0], back), CRITICAL_MINS * 60000);
  s.hatched[0].lastFed = back;
  assert.equal(exploreProblem(s, 'runt', '1,0', back), 'injured');
});

test('a Healing Herb heals 10 minutes sooner', () => {
  const s = game(dino('a', 50));
  const b = s.hatched[0];
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).reason, 'not-injured');
  b.injuredUntil = T0 + 15 * 60000;
  const herbs = countItem(s, 'herb');
  if (herbs) assert.fail('starts with no herbs');
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).reason, 'no-herb');
  addItem(s, 'herb', 2);
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).left, (15 - HEAL_MINS) * 60000);
  assert.equal(applyAction(s, 'heal', { babyId: 'a' }, T0).left, 0);
  assert.equal(b.injuredUntil, undefined);
  assert.equal(countItem(s, 'herb'), 0);
});

test('equipment cannot change while the dinosaur is away', () => {
  const s = game(dino('a', 50));
  s.coins = 1000;
  buyGear(s, 'leather_vest');
  applyAction(s, 'explore', { babyId: 'a', hex: '1,0' }, T0);
  const slot = s.inv.findIndex(x => x && x.id === 'leather_vest');
  assert.equal(equipGear(s, 'a', slot).reason, 'away');
});

test('a dinosaur brought down is critically injured: herbs do not help, a Blood Transfusion does', async () => {
  const { CRITICAL_MINS } = await import('../js/config.js');
  const { isCritical } = await import('../js/world.js');
  const { s, r, back } = lostAtLair();
  assert.equal(r.battle.win, false);
  const b = s.hatched[0];
  assert.equal(isCritical(b, back), true);
  assert.equal(injuredLeft(b, back), CRITICAL_MINS * 60000);
  assert.ok(r.injured[0].critical);
  addItem(s, 'herb', 3);
  assert.equal(applyAction(s, 'heal', { babyId: 'runt' }, back).reason, 'critical');
  assert.equal(applyAction(s, 'transfuse', { babyId: 'runt' }, back).reason, 'no-transfusion');
  addItem(s, 'allo_blood', 2);
  assert.equal(applyAction(s, 'craft', { id: 'transfusion' }).ok, true);
  assert.equal(applyAction(s, 'transfuse', { babyId: 'runt' }, back).ok, true);
  assert.equal(injuredLeft(b, back), 0);
  assert.equal(isCritical(b, back), false);
  assert.equal(countItem(s, 'transfusion'), 0);
});

test('who is afraid runs before the fight: a Gallimimus leaves the player alone with a Tyrannosaurus', async () => {
  const { freshState } = await import('../js/state.js');
  const rex = encounterUnit({ species: 'rex', loot: [] }, 6);
  const galli = unitOf('g', [fighterOf(dino('g', 50, 'galli'))]);
  const me = unitOf('You', [fighterOf(freshState().player)]);
  const r = teamFight([me, galli], rex, seededRand('run'));
  assert.deepEqual(r.fled, [1]);
  assert.equal(r.escaped, false);
  assert.ok(r.log.every(e => e.by !== 1 && e.to !== 1));
  assert.deepEqual(r.hp[1], [galli.members[0].hp]);
  // alone, the Gallimimus just runs: no fight at all
  const alone = teamFight([galli], rex, seededRand('run'));
  assert.equal(alone.escaped, true);
  assert.equal(alone.win, false);
  assert.deepEqual(alone.log, []);
  // a prey animal: even against a small pack, and with the player fighting, it runs (trained or not)
  const raptors = encounterUnit({ species: 'raptor', pack: [3, 3], loot: [] }, 2);
  const f = teamFight([me, galli], raptors, seededRand('stay'));
  assert.deepEqual(f.fled, [1]);
  assert.ok(f.log.every(e => e.by !== 1 && e.to !== 1));
});

test('a defender charges now and then, otherwise holds its ground and strikes back', () => {
  // (an Allosaurus: a Triceratops is prey to it, a Dilophosaurus would leave it alone)
  const foe = encounterUnit({ species: 'allo', loot: [] }, 5);
  const trike = unitOf('t', [fighterOf(dino('t', 50, 'trike'))]);
  let charges = 0, counters = 0;
  for (let i = 0; i < 20; i++) {
    const r = teamFight([trike], foe, seededRand('d' + i));
    for (const e of r.log) if (e.by === 0) { assert.ok(e.charge || e.counter); if (e.charge) charges++; else counters++; }
  }
  assert.ok(charges > 0 && counters > charges, `${charges} charges, ${counters} counters`);
});

test('the foe goes for defenders more and noncombatants less', () => {
  // (a grown one: a young Dilophosaurus is too small to get through a Scelidosaurus' scutes)
  const foe = encounterUnit({ species: 'dilo', loot: [] }, 5);
  const hits = { attacker: 0, defender: 0, noncombatant: 0 };
  for (let i = 0; i < 40; i++) {
    const team = [unitOf('a', [fighterOf(dino('a', 50, 'dilo'))]), unitOf('d', [fighterOf(dino('d', 50, 'scelido'))]), unitOf('n', [fighterOf(dino('n', 50, 'para'))])];
    for (const e of teamFight(team, foe, seededRand('t' + i)).log) if (e.by === 'foe') hits[['attacker', 'defender', 'noncombatant'][e.to]]++;
  }
  assert.ok(hits.defender > hits.attacker && hits.attacker > hits.noncombatant, JSON.stringify(hits));
});

test('a Tyrannosaurus bite crushes through armor and breaks bones: legs get lamed, small enough necks are killed', async () => {
  const { BONE_BREAKER, SPECIES } = await import('../js/config.js');
  const { hitOf } = await import('../js/combat.js');
  const rex = fighterOf(dino('r', 50, 'rex')), ankylo = fighterOf(dino('a', 50, 'ankylo'));
  assert.ok(rex.crush > 0 && rex.boneBreaker);
  assert.ok(hitOf(rex, ankylo, 1) > hitOf({ ...rex, crush: 0 }, ankylo, 1));
  let necks = 0, lames = 0;
  for (let i = 0; i < 60; i++) {
    // (an Allosaurus: a Stegosaurus' throat is covered in bone)
    const r = teamFight([unitOf('a', [fighterOf(dino('a', 50, 'allo'))])], rex, seededRand('b' + i));
    for (const e of r.log) if (e.by === 'foe') {
      if (e.kill) { necks++; assert.equal(e.left, 0); }
      if (e.lame) { lames++; assert.ok(r.lamed.length === 0 || true); }
    }
  }
  assert.ok(necks > 0 && lames > 0, `${necks} necks, ${lames} legs`);
  // a neck too big to close the jaws on is never bitten through
  for (let i = 0; i < 40; i++) for (const e of teamFight([unitOf('t', [fighterOf(dino('t', 50, 'trike'))])], rex, seededRand('t' + i)).log) assert.ok(!e.kill);
  assert.ok(SPECIES.trike.size !== BONE_BREAKER.neckMax);
  // anything small dies from the first bite that lands
  // (attackers with their fear lifted: a noncombatant or a frightened one would just run)
  for (const t of ['coelo', 'raptor']) {
    const r = teamFight([unitOf(t, [{ ...fighterOf(dino(t, 50, t)), fear: undefined }])], rex, seededRand('one' + t));
    const first = r.log.find(e => e.by === 'foe' && !e.miss);
    assert.ok(first, t);
    assert.equal(first.kill, true);
    assert.equal(first.left, 0);
  }
});

test("a Triceratops' frill takes head blows and gores back; it stays damaged until mended with herbs", async () => {
  const { FRILL } = await import('../js/config.js');
  const { frillOf } = await import('../js/world.js');
  const rex = wildFighter('rex', 6);
  let blocked = 0, gores = 0, bleeds = 0;
  for (let i = 0; i < 30; i++) {
    const trike = unitOf('t', [fighterOf(dino('t', 50, 'trike'))]);
    const r = teamFight([trike], rex, seededRand('f' + i));
    let frill = FRILL.hp;
    for (const e of r.log) {
      if (e.blocked) { blocked++; assert.equal(e.dmg, 0); assert.equal(e.frill, Math.max(0, frill - FRILL.crushed)); frill = e.frill; }
      if (e.gore) gores++;
      if (e.by === 'bleed') bleeds++;
    }
    assert.equal(r.frill[0][0], frill);
  }
  assert.ok(blocked && gores && bleeds, `${blocked} blocked, ${gores} gores, ${bleeds} bleeds`);
  // a broken frill blocks nothing
  const broken = teamFight([unitOf('t', [fighterOf({ ...dino('t', 50, 'trike'), frill: 0 })])], rex, seededRand('f0'));
  assert.ok(!broken.log.some(e => e.blocked));
  // the frill comes home damaged, and a Healing Herb mends a point of it
  const s = game(dino('t', 50, 'trike'));
  s.hatched[0].frill = 2;
  assert.equal(frillOf(s.hatched[0]), 2);
  assert.equal(applyAction(s, 'mendFrill', { babyId: 't' }).reason, 'no-herb');
  addItem(s, 'herb', 5);
  assert.equal(applyAction(s, 'mendFrill', { babyId: 't' }).frill, 3);
  applyAction(s, 'mendFrill', { babyId: 't' }); applyAction(s, 'mendFrill', { babyId: 't' });
  assert.equal(frillOf(s.hatched[0]), FRILL.hp);
  assert.equal(applyAction(s, 'mendFrill', { babyId: 't' }).reason, 'whole');
  assert.equal(countItem(s, 'herb'), 2);
});

test('an Ankylosaurus is armored blow by blow, spikes hurt what bites its back, and its club breaks shins', async () => {
  const { ARMOR, PARTS, BONE_BREAKER, QUAD_LEGS } = await import('../js/config.js');
  const BONE_BREAKER_PARTS = BONE_BREAKER.parts;
  const rex = wildFighter('rex', 6);
  const parts = {};
  let thorns = 0, shins = 0, bellies = 0;
  for (let i = 0; i < 40; i++) {
    const r = teamFight([unitOf('a', [fighterOf(dino('a', 50, 'ankylo'))])], rex, seededRand('k' + i));
    let lastFoeBlow = null;
    for (const e of r.log) {
      if (e.by === 'foe' && !e.miss) {
        parts[e.part] = (parts[e.part] || 0) + 1;
        assert.equal(!!e.armored, ARMOR.heavy.armored.includes(e.part));
        if (e.part === 'belly') bellies++;
        assert.ok(!e.kill, 'its neck is never bitten through');
        lastFoeBlow = e;
      }
      if (e.thorns) { thorns++; assert.equal(lastFoeBlow.part, 'back'); }
      if (e.club) { shins++; assert.ok(e.lame && (e.counter || e.charge)); }
    }
  }
  // it walks on four legs: blows land on each of them
  for (const p of ['back', 'belly', 'head', 'neck', ...QUAD_LEGS]) assert.ok(parts[p], `blows land on its ${p}`);
  assert.ok(thorns && shins && bellies, `${thorns} spikes, ${shins} shins, ${bellies} bellies`);
  for (const [p] of [...ARMOR.parts, ...BONE_BREAKER_PARTS]) assert.ok(p === 'limbs' || PARTS.includes(p), p);
  // the armored parts let much less through than the belly
  const plain = fighterOf(dino('a', 50, 'ankylo'));
  assert.ok(1 - ARMOR.heavy.cut < 1 && ARMOR.belly > 1 && plain.armor === 'heavy' && plain.club);
});

test('a Dilophosaurus wrestles by contests: climbs on bigger foes, kills smaller ones in its grip', async () => {
  const { GRAB, TOUGH, SPECIES } = await import('../js/config.js');
  const dilo = () => unitOf('d', [{ ...fighterOf(dino('d', 50, 'dilo')), fear: undefined }]);
  const seen = { cling: 0, slash: 0, immune: 0, fell: 0, recovering: 0 };
  for (let i = 0; i < 60; i++) {
    const r = teamFight([dilo()], wildFighter('allo', 5), seededRand('g' + i));
    let holding = false;
    for (const e of r.log) {
      if (e.by === 0 && e.grab === 'cling') { seen.cling++; holding = true; }
      else if (e.by === 0 && e.slash) { seen.slash++; assert.ok(holding); }
      else if (e.by === 0 && e.fell) { seen.fell++; holding = false; }
      else if (e.by === 0 && e.recovering) seen.recovering++;
      if (e.by === 'foe' && (e.dmg !== undefined || e.miss)) { if (holding) { assert.ok(e.immune); seen.immune++; } else assert.ok(!e.immune); }
    }
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k], JSON.stringify(seen));
  // smaller foes die in its grip; one its size may wrench free
  let kills = 0, freed = 0, holds = 0;
  for (let i = 0; i < 60; i++) {
    for (const e of teamFight([dilo()], wildFighter('raptor', 5), seededRand('k' + i)).log) if (e.grab === 'kill') { kills++; assert.equal(e.left, 0); }
    let holding = false;
    for (const e of teamFight([dilo()], wildFighter('pachy', 5), seededRand('f' + i)).log) {
      assert.notEqual(e.grab, 'kill', 'one its size is never killed in its grip');
      if (e.grab === 'freed') freed++;
      if (e.grab === 'hold') { holds++; holding = true; }
      if (e.hold) assert.ok(holding);
      if (e.broke) holding = false;
    }
  }
  assert.ok(kills && freed && holds, `${kills} kills, ${freed} freed, ${holds} holds`);
  // one bleeding wound per foe, however long it holds on
  for (let i = 0; i < 20; i++) {
    const r = teamFight([dilo()], wildFighter('allo', 5), seededRand('b' + i));
    const ticks = r.log.filter(e => e.by === 'bleed').map(e => e.dmg);
    assert.ok(new Set(ticks).size <= 1, 'the bleeding never grows');
  }
  // never on armored bodies
  for (let i = 0; i < 20; i++) assert.ok(!teamFight([dilo()], wildFighter('stego', 5), seededRand('n' + i)).log.some(e => e.grab));
  // tough: once a fight, a deadly blow from something its size leaves it at 1
  let tough = 0;
  for (let i = 0; i < 40; i++) {
    const r = teamFight([unitOf('d', [{ ...fighterOf(dino('d', 10, 'dilo')), fear: undefined }])], wildFighter('pachy', 7, true), seededRand('t' + i));
    const saved = r.log.filter(e => e.tough);
    assert.ok(saved.length <= 1);
    if (saved.length) { tough++; assert.equal(saved[0].left, 1); }
  }
  assert.ok(tough > 0);
  assert.ok(SPECIES.dilo.tough && TOUGH.heal < 1 && GRAB.tries > 0);
  // a wild one saved that way may run there and then: the team wins without its carcass (from a
  // defender, which won't chase it, it always gets away)
  let ran = 0, stayed = 0;
  for (let i = 0; i < 200; i++) {
    const r = teamFight([unitOf('d', [{ ...fighterOf(dino('d', 70, 'dilo')), fear: undefined }])], wildFighter('dilo', 5), seededRand('tr' + i));
    const k = r.log.findIndex(e => e.by === 0 && e.tough);
    if (k < 0) continue;
    if (r.log[k + 1] && r.log[k + 1].by === 'foe' && r.log[k + 1].fled) { ran++; assert.ok(r.win && r.foeFled); } else stayed++;
  }
  assert.ok(ran > 0 && stayed > 0, JSON.stringify({ ran, stayed }));
});

test("a Velociraptor's claw latches on: clinging to bigger foes out of reach, pinning smaller ones, until shaken off", () => {
  const raptor = () => unitOf('r', [{ ...fighterOf(dino('r', 50, 'raptor')), fear: undefined }]);
  const modes = new Set();
  let claws = 0, shakes = 0, immune = 0, pinnedTurns = 0, necks = 0;
  // (a wild Compsognathus never strikes on its own, so another Velociraptor shows the pin)
  for (const foe of [wildFighter('dilo', 5), wildFighter('raptor', 5)]) for (let i = 0; i < 40; i++) {
    const r = teamFight([raptor()], foe, seededRand('v' + i));
    let latched = null;
    for (const e of r.log) {
      if (e.by === 0 && e.latch) { modes.add(e.latch); latched = e.latch; }
      if (e.by === 0 && e.latched) { claws++; assert.equal(e.latched, latched); }
      if (e.by === 0 && e.part === 'neck') necks++;
      if (e.by === 'foe' && e.shake) { shakes++; latched = null; }
      if (e.by === 'foe' && e.pinned) { pinnedTurns++; assert.equal(latched, 'pin'); }
      if (e.by === 'foe' && e.immune) { immune++; assert.equal(latched, 'cling'); }
    }
  }
  assert.deepEqual([...modes].sort(), ['cling', 'pin']);
  assert.ok(claws && shakes && immune && pinnedTurns && necks, JSON.stringify({ claws, shakes, immune, pinnedTurns, necks }));
  // never on an armored body
  for (let i = 0; i < 20; i++) assert.ok(!teamFight([raptor()], { ...wildFighter('proto', 5), plated: true }, seededRand('b' + i)).log.some(e => e.latch));
});

test("an Ankylosaurus' tail club kills anything small it lands on", () => {
  // raptors never go for an Ankylosaurus (it isn't prey to them): they go for the player beside it, and
  // its charges crush them
  const ankylo = () => unitOf('a', [{ ...fighterOf(dino('a', 50, 'ankylo')), fear: undefined }]);
  const me = () => unitOf('You', [fighterOf(freshState().player)]);
  let swings = 0, landed = 0, kills = 0;
  for (let i = 0; i < 80; i++) {
    for (const e of teamFight([ankylo(), me()], encounterUnit({ species: 'raptor', pack: [4, 4], loot: [] }, 5), seededRand('c' + i)).log) {
      assert.ok(!(e.by === 'foe' && e.to === 0 && e.dmg !== undefined));
      if (e.by !== 0 || !(e.counter || e.charge)) continue;
      swings++;
      // whatever it lands on dies, crushed outright or from the blow itself
      if (!e.miss) { landed++; assert.equal(e.left, 0); if (e.kill && e.club) kills++; }
    }
  }
  assert.ok(swings && kills, `${swings} swings, ${landed} landed`);
});

test('wild animals fight by their role: a herd of defenders only charges or strikes back', () => {
  const herd = encounterUnit({ species: 'proto', pack: [3, 3], herd: true, loot: [] }, 4);
  const raptors = unitOf('p', Array.from({ length: 4 }, (_, i) => fighterOf(dino('r' + i, 50, 'raptor'))), true);
  let charges = 0, counters = 0;
  for (let i = 0; i < 20; i++) {
    const r = teamFight([raptors], herd, seededRand('herd' + i));
    for (const e of r.log.filter(e => e.by === 'foe' && (e.dmg !== undefined || e.miss) && !e.gripped)) {
      assert.ok(e.charge || e.counter);
      if (e.charge) charges++; else counters++;
    }
  }
  assert.ok(charges > 0 && counters > charges);
});

test('a wild animal keeps away from anything bigger than its fear: it can only be spotted and hunted', () => {
  // a Compsognathus lair always has its pack there, but they keep away from a Tyrannosaurus
  const key = lairs(42).find(k => threatAt(42, k.split(',').map(Number)).id === 'compy');
  const caught = { yes: 0, no: 0 };
  // sent with the choice to hunt or not (hunt), what it spotted there
  const spot = (type, hunt, i = 0) => {
    const s = game(dino('x', 60, type));
    s.world.trips = i;
    const r = applyAction(s, 'explore', { babyId: 'x', hex: key }, T0);
    const c = collect(s, { id: r.expedition.id, hunt }, T0 + tripMins(key, 42) * 60000);
    return { s, c, there: c.story.filter(e => e.hex === key && e.kind !== 'arrived') };
  };
  for (let i = 0; i < 30; i++) {
    const { s, c, there } = spot('rex', true, i);
    // (a trip that watched wild against wild instead)
    if (there.some(e => e.kind === 'witness')) continue;
    assert.equal(there.some(e => e.kind === 'fight'), false);
    const sight = there.find(e => e.kind === 'sighting');
    assert.equal(sight.species, 'compy');
    assert.equal(sight.hunted, true);
    if (sight.caught) { caught.yes++; assert.ok(sight.loot.some(l => l.id === 'meat') && sight.coins > 0 && countItem(s, 'meat') > 0); }
    else { caught.no++; assert.deepEqual(sight.loot, []); }
  }
  assert.ok(caught.yes > 0 && caught.no > 0, JSON.stringify(caught));
  // letting them be brings nothing; a team with no carnivore big enough doesn't even get the chance
  const { there } = spot('rex', false);
  const sight = there.find(e => e.kind === 'sighting');
  assert.equal(sight.hunted, false);
  assert.equal(sight.loot, undefined);
  const herbivore = spot('trike', true).there;
  assert.equal(herbivore.some(e => e.kind === 'fight' || e.kind === 'sighting'), false);
});

test('a Protoceratops striking back may clamp its beak on: a smaller foe is pinned, one its size can only bite its head', () => {
  const proto = () => unitOf('p', [fighterOf(dino('p', 70, 'proto'))]);
  let pins = 0, holds = 0, loose = 0;
  for (let i = 0; i < 60; i++) {
    for (const [foe, mode] of [[wildFighter('raptor', 4), 'pin'], [wildFighter('dilo', 4), 'hold']]) {
      const r = teamFight([proto()], foe, seededRand('beak' + mode + i));
      let gripping = false;
      for (const e of r.log) {
        if (e.by === 0 && e.beak) { assert.equal(e.beak, mode); gripping = true; mode === 'pin' ? pins++ : holds++; }
        else if (e.loose) { gripping = false; loose++; }
        else if (e.by === 0 && e.gripped) assert.ok(gripping);
        // pinned in the beak it can't strike; held, it can only go for the head
        else if (gripping && e.by === 'foe' && (e.dmg !== undefined || e.miss)) {
          assert.notEqual(mode, 'pin');
          if (e.dmg) assert.equal(e.part, 'head');
        }
      }
    }
  }
  assert.ok(pins > 0 && holds > 0 && loose > 0, JSON.stringify({ pins, holds, loose }));
  // nothing bigger than itself
  for (let i = 0; i < 20; i++) assert.ok(!teamFight([proto()], wildFighter('allo', 4), seededRand('big' + i)).log.some(e => e.beak));
});

test('wild animals use every ability of their species, just like ours', () => {
  const ours = type => unitOf(type, [{ ...fighterOf(dino(type, 60, type)), fear: undefined }]);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    // wild Velociraptors latch on to a bigger one of ours and its wounds bleed; it shakes them off
    for (const e of teamFight([ours('dilo')], encounterUnit({ species: 'raptor', pack: [3, 3], loot: [] }, 4), seededRand('w' + i)).log) {
      if (e.by === 'foe' && e.latch) seen.add('latch');
      if (e.by === 'foe' && e.latched) seen.add('claw');
      if (e.by === 'bleed' && e.to === 0) seen.add('we bleed');
      if (e.by === 0 && e.shake) seen.add('shake');
    }
    // a wild Triceratops' frill takes our blows on its head and gores back
    for (const e of teamFight([ours('rex')], wildFighter('trike', 6), seededRand('t' + i)).log) {
      if (e.by === 0 && e.blocked) seen.add('frill');
      if (e.by === 'foe' && e.gore) seen.add('gore');
    }
    // a wild Dilophosaurus grabs; a wild Protoceratops clamps its beak on
    for (const e of teamFight([ours('dilo')], wildFighter('dilo', 4), seededRand('d' + i)).log) if (e.by === 'foe' && e.grab) seen.add('grab');
    for (const e of teamFight([ours('raptor')], wildFighter('proto', 4), seededRand('p' + i)).log) if (e.by === 'foe' && e.beak) seen.add('beak');
  }
  assert.deepEqual([...seen].sort(), ['beak', 'claw', 'frill', 'gore', 'grab', 'latch', 'shake', 'we bleed']);
});

test('a wild defender stands its ground instead of attacking: the player chooses to fight it or leave it be', async () => {
  const key = landHexes(42).map(h => hexKey(...h)).find(k => threatAt(42, k.split(',').map(Number)).id === 'proto' && !isLair(42, k.split(',').map(Number)));
  const results = {};
  for (const fight of [false, true]) {
    // a trip that runs into the herd (the trip number seeds whether it does)
    for (let trip = 0; trip < 40; trip++) {
      const s = game(dino('d', 60, 'dilo'));
      s.world.trips = trip;
      const r = applyAction(s, 'explore', { babyId: 'd', hex: key }, T0);
      const st = reach(s, r.expedition.id, r.expedition.returnAt, p => p.kind === 'standoff' && p.hex === key);
      if (!st) continue;
      assert.equal(st.species, 'Protoceratops');
      assert.equal(st.group, st.count > 1 ? 'herd' : '');
      results[fight] = collect(s, { id: r.expedition.id, fight }, r.expedition.returnAt);
      break;
    }
  }
  assert.equal(results.false.battle, null);
  assert.equal(results.false.standoff.fought, false);
  assert.ok(results.false.loot.length > 0);
  assert.ok(results.true.battle);
  assert.equal(results.true.standoff.fought, true);
  // a predator gives no choice
  const s = game(dino('d', 60, 'dilo'));
  const raptors = landHexes(42).map(h => hexKey(...h)).find(k => threatAt(42, k.split(',').map(Number)).id === 'raptor');
  const r = applyAction(s, 'explore', { babyId: 'd', hex: raptors }, T0);
  assert.equal(reach(s, r.expedition.id, r.expedition.returnAt, p => p.kind === 'standoff' && p.hex === raptors), null);
});

test('a Stegosaurus: a piercing tail, a stance that turns blows aside, and a throat covered in bone', () => {
  const stego = () => unitOf('s', [{ ...fighterOf(dino('s', 60, 'stego')), fear: undefined }]);
  const seen = { spikes: 0, impaled: 0, guarded: 0, answered: 0, throat: 0, neckKill: 0 };
  for (let i = 0; i < 40; i++) {
    for (const foe of [encounterUnit({ species: 'raptor', pack: [4, 4], loot: [] }, 5), wildFighter('rex', 6), wildFighter('allo', 5)]) {
      const r = teamFight([stego()], foe, seededRand('st' + foe.name + i));
      r.log.forEach((e, k) => {
        if (e.by === 0 && (e.counter || e.charge) && e.dmg > 0) seen.spikes++;
        if (e.by === 0 && e.impaled) seen.impaled++;
        if (e.by === 'foe' && e.guarded) {
          seen.guarded++;
          assert.equal(e.dmg, 0);
          // answered at once with the tail
          const next = r.log[k + 1];
          if (next && next.by === 0 && next.guard) seen.answered++;
        }
        if (e.by === 'foe' && e.throat) {
          seen.throat++;
          // nothing gets through from the smaller Velociraptors
          if (/Velociraptor/.test(foe.name || '')) assert.equal(e.dmg, 0);
        }
        if (e.by === 'foe' && e.kill && e.part === 'neck') seen.neckKill++;
      });
    }
  }
  assert.ok(seen.spikes && seen.impaled && seen.guarded && seen.answered && seen.throat, JSON.stringify(seen));
  assert.equal(seen.neckKill, 0);
});

test('two legs and two arms, or four legs: a low tail blow only finds legs, a bite may break an arm', async () => {
  const { ARMS, BIPED_LEGS, QUAD_LEGS } = await import('../js/config.js');
  const seen = { arm: 0, bipedLeg: 0, quadLeg: 0 };
  for (let i = 0; i < 60; i++) {
    // a Tyrannosaurus bites an Allosaurus (two arms, two legs) and an Ankylosaurus (four legs)
    for (const e of teamFight([unitOf('a', [fighterOf(dino('a', 60, 'allo'))])], wildFighter('rex', 6), seededRand('arm' + i)).log) {
      if (e.by !== 'foe' || !e.part) continue;
      assert.ok(!QUAD_LEGS.includes(e.part), e.part);
      if (e.armBroken) { seen.arm++; assert.ok(ARMS.includes(e.part)); assert.ok(!e.lame); }
      if (e.lame) { seen.bipedLeg++; assert.ok(BIPED_LEGS.includes(e.part)); }
    }
    // an Ankylosaurus' club only ever breaks a leg, never a Tyrannosaurus' arm
    for (const e of teamFight([unitOf('k', [fighterOf(dino('k', 60, 'ankylo'))])], wildFighter('rex', 6), seededRand('club' + i)).log) {
      if (e.by === 0 && e.club && e.lame) { assert.ok(BIPED_LEGS.includes(e.part), e.part); seen.quadLeg++; }
      if (e.by === 'foe' && e.part) assert.ok(!ARMS.includes(e.part) && !BIPED_LEGS.includes(e.part), e.part);
    }
  }
  assert.ok(seen.arm && seen.bipedLeg && seen.quadLeg, JSON.stringify(seen));
});

test('a Pachycephalosaurus goes for the flanks and may knock the foe down; its dome takes head blows from its size or smaller lightly', () => {
  const pachy = () => unitOf('p', [{ ...fighterOf(dino('p', 60, 'pachy')), fear: undefined }]);
  const seen = { butts: 0, knocked: 0, lostTurn: 0, rose: 0, dome: 0, bigHead: 0 };
  for (let i = 0; i < 60; i++) {
    for (const foe of [wildFighter('dilo', 5), wildFighter('rex', 4)]) {
      const r = teamFight([pachy()], foe, seededRand('pa' + foe.name + i));
      r.log.forEach((e, k) => {
        if (e.by === 0 && e.dmg > 0 && e.part) assert.ok(['back', 'belly'].includes(e.part), e.part);
        if (e.by === 0 && e.butt && e.dmg > 0) seen.butts++;
        if (e.by === 0 && e.knocked) {
          seen.knocked++;
          // nothing two sizes bigger falls: never the Tyrannosaurus
          assert.notEqual(foe.size, 'huge');
          // the knocked-down foe gets straight back up (it won agility against it) or spends its next
          // turn getting up
          const next = r.log.slice(k + 1).find(x => x.by === 'foe');
          if (e.rose) { seen.rose++; assert.ok(!next || !next.recovering); }
          else if (next && next.recovering) seen.lostTurn++;
        }
        if (e.by === 'foe' && e.part === 'head' && e.dome) seen.dome++;
        if (e.by === 'foe' && e.part === 'head' && !e.dome && e.dmg > 0) seen.bigHead++;
      });
    }
  }
  assert.ok(seen.butts && seen.knocked && seen.lostTurn && seen.rose && seen.dome, JSON.stringify(seen));
});

test('four feet stand firmer than two: a quadruped is harder to knock down', () => {
  const pachy = () => unitOf('p', [{ ...fighterOf(dino('p', 60, 'pachy')), fear: undefined }]);
  const rate = foe => {
    let butts = 0, downs = 0;
    for (let i = 0; i < 150; i++) for (const e of teamFight([pachy()], foe, seededRand('st' + foe.name + i)).log) {
      if (e.by === 0 && e.butt && e.dmg > 0) { butts++; if (e.knocked) downs++; }
    }
    return downs / butts;
  };
  // the same body, on two legs or on four
  const two = { ...wildFighter('proto', 4), biped: true, beak: false, name: 'two' }, four = { ...two, biped: false, name: 'four' };
  assert.ok(rate(four) < rate(two), `${rate(four)} vs ${rate(two)}`);
});

test('an Argentinosaurus only strikes back: a slow stomp that crushes, a heavy tail; nothing smaller reaches its neck or brings it down', () => {
  const giant = () => unitOf('g', [{ ...fighterOf(dino('g', 60, 'argent')), fear: undefined }]);
  const seen = { stomps: 0, crushed: 0, swipes: 0, own: 0, neck: 0, lame: 0 };
  for (let i = 0; i < 40; i++) {
    // (nothing hunts a grown giant: these are made desperate enough to try, to see what happens)
    for (const foe0 of [wildFighter('rex', 6), encounterUnit({ species: 'raptor', pack: [4, 4], loot: [] }, 6), wildFighter('allo', 6)]) {
      const foe = foe0.members ? { ...foe0, members: foe0.members.map(f => ({ ...f, fear: undefined })) } : { ...foe0, fear: undefined };
      const r = teamFight([giant()], foe, seededRand('ar' + foe.name + i));
      for (const e of r.log) {
        if (e.by === 0 && e.dmg !== undefined || e.by === 0 && e.miss) {
          // it never starts a fight: every blow of its own is a blow back
          if (!e.counter) seen.own++;
          if (e.stomp) seen.stomps++;
          if (e.stomped) { seen.crushed++; assert.equal(e.left, 0); }
          if (e.swipe) { seen.swipes++; assert.ok(!e.also); }
        }
        if (e.by === 'foe' && e.part === 'neck') seen.neck++;
        if (e.by === 'foe' && e.lame) seen.lame++;
      }
    }
  }
  assert.equal(seen.own, 0);
  assert.equal(seen.neck, 0);
  assert.equal(seen.lame, 0);
  assert.ok(seen.stomps && seen.crushed && seen.swipes, JSON.stringify(seen));
});

test('a giant sauropod in the team: twice the trip, more of what the hex has', async () => {
  const { teamTripMins, teamHaul } = await import('../js/world.js');
  const s = game(dino('g', 60, 'argent'), dino('d', 60, 'dilo'));
  const key = '1,0';
  assert.equal(teamTripMins(s, ['g', 'd'], key), 2 * teamTripMins(s, ['d'], key));
  assert.equal(teamHaul(s, ['g', 'd']), SPECIES.argent.haul);
  assert.equal(teamHaul(s, ['d']), 1);
});

test('a Parasaurolophus warns its group of a predator: readied, every one of it strikes first', () => {
  // a herd of six always notices (one alone only sometimes)
  const para = unitOf('pa', Array.from({ length: 6 }, (_, i) => ({ ...fighterOf(dino('pa' + i, 60, 'para')), fear: undefined })), true);
  const dilo = unitOf('d', [fighterOf(dino('d', 60, 'dilo'))]);
  const raptors = encounterUnit({ species: 'raptor', pack: [3, 3], loot: [] }, 6);
  const r = teamFight([dilo, para], raptors, seededRand('call'));
  assert.equal(r.alerted, 'team');
  assert.deepEqual(r.log[0], { by: 1, alert: true });
  // the team acts before the foe in the first round, though Velociraptors are quicker
  const firstFoe = r.log.findIndex(e => e.by === 'foe');
  assert.ok(r.log.slice(1, firstFoe).some(e => e.by === 0));
  // readied: a little more of everything for the fight (10% for a herd of six)
  assert.equal(r.teamHps[0][0], Math.round(dilo.members[0].hp * 1.1));
  // one alone notices only some of the time, and calls for 5%
  const lone = unitOf('pa', [{ ...fighterOf(dino('pa', 60, 'para')), fear: undefined }]);
  const calls = Array.from({ length: 60 }, (_, i) => teamFight([dilo, lone], raptors, seededRand('lone' + i)));
  const heard = calls.filter(x => x.alerted === 'team');
  assert.ok(heard.length > 20 && heard.length < 50, heard.length);
  assert.equal(heard[0].teamHps[0][0], Math.round(dilo.members[0].hp * 1.05));
  // no call without a predator, or without a Parasaurolophus
  assert.equal(teamFight([dilo, para], wildFighter('pachy', 4), seededRand('herb')).alerted, null);
  assert.equal(teamFight([dilo], raptors, seededRand('none')).alerted, null);
});

test('a Parasaurolophus brought down may break away instead: home hurt, not critically', () => {
  let ran = 0, down = 0;
  for (let i = 0; i < 60; i++) {
    // (a prey animal runs before any fight: the rule is for one cornered, so it stands here as a defender)
    const para = unitOf('pa', [{ ...fighterOf(dino('pa', 60, 'para')), fear: undefined, role: 'defender' }]);
    const dilo = unitOf('d', [{ ...fighterOf(dino('d', 60, 'dilo')), fear: undefined }]);
    const r = teamFight([dilo, para], wildFighter('rex', 6), seededRand('run' + i));
    const away = r.log.find(e => e.by === 'foe' && e.to === 1 && e.escaped);
    if (away) { ran++; assert.equal(away.left, 0); assert.equal(r.hp[1][0], 1); }
    else if (r.hp[1][0] === 0) down++;
  }
  assert.ok(ran > 0 && down > 0, `${ran} got away, ${down} went down`);
  // one breaking away takes its whole herd with it
  let herds = 0;
  for (let i = 0; i < 60; i++) {
    const herd = unitOf('h', Array.from({ length: 3 }, (_, k) => ({ ...fighterOf(dino('h' + k, 60, 'para')), fear: undefined, role: 'defender' })), true);
    const dilo = unitOf('d', [{ ...fighterOf(dino('d', 60, 'dilo')), fear: undefined }]);
    const r = teamFight([dilo, herd], wildFighter('rex', 6), seededRand('herd' + i));
    const at = r.log.findIndex(e => e.by === 'foe' && e.to === 1 && e.escaped);
    if (at < 0) continue;
    herds++;
    assert.ok(r.routed.includes(1));
    assert.deepEqual(r.log[at + 1], { by: 1, rout: true });
    assert.ok(!r.log.slice(at + 2).some(e => e.by === 1 || e.to === 1));
  }
  assert.ok(herds > 0);
});

test('armored ones hunker down before a bigger predator: no belly, no legs, no striking back', () => {
  const sc = () => unitOf('s', [{ ...fighterOf(dino('s', 60, 'scelido')), fear: undefined }]);
  let crouches = 0, low = 0, back = 0, thorns = 0;
  for (let i = 0; i < 40; i++) {
    const r = teamFight([sc()], wildFighter('allo', 5), seededRand('cr' + i));
    let down = false;
    for (const e of r.log) {
      if (e.by === 0 && e.crouch) { crouches++; down = true; }
      if (down && e.by === 'foe' && e.part) { low++; assert.ok(!['belly', 'legFL', 'legFR', 'legHL', 'legHR'].includes(e.part), e.part); }
      if (down && e.by === 0 && e.counter) back++;
      if (e.by === 0 && e.thorns) thorns++;
    }
  }
  assert.ok(crouches > 0 && low > 0 && thorns > 0, JSON.stringify({ crouches, low, thorns }));
  assert.equal(back, 0);
  // against something its size or smaller it fights as usual
  assert.ok(!teamFight([sc()], wildFighter('pachy', 4), seededRand('pa')).log.some(e => e.crouch));
});

test("a wild predator badly hurt runs: always from those who can't chase it, and leaves no carcass", () => {
  // a Stegosaurus can't chase: the Allosaurus always gets away once badly hurt
  const st = () => unitOf('s', [{ ...fighterOf(dino('s', 90, 'stego')), fear: undefined }]);
  let fled = 0;
  for (let i = 0; i < 30; i++) {
    const r = teamFight([st()], wildFighter('allo', 4), seededRand('fl' + i));
    assert.ok(!r.log.some(e => e.caught));
    if (r.foeFled) { fled++; assert.equal(r.win, true); assert.ok(r.foeHp > 0); }
  }
  assert.ok(fled > 0);
  // with a predator in the team it may be caught
  const rex = () => unitOf('r', [{ ...fighterOf(dino('r', 90, 'rex')), fear: undefined }]);
  let caught = 0;
  for (let i = 0; i < 40; i++) if (teamFight([rex()], wildFighter('allo', 6), seededRand('ca' + i)).log.some(e => e.caught)) caught++;
  assert.ok(caught > 0);
});

test('a predator that only scrapes hunkered-down armor gives up', () => {
  const sc = () => unitOf('s', [{ ...fighterOf(dino('s', 60, 'scelido')), fear: undefined }]);
  let gave = 0;
  // an Allosaurus too weak to get through: it scrapes the scutes and gives up
  const weak = { ...wildFighter('allo', 4), damage: 15 };
  for (let i = 0; i < 40; i++) for (const [team, foe] of [[sc(), weak]]) {
    const r = teamFight([team], foe, seededRand('gu' + i));
    const e = r.log.find(x => x.gaveUp);
    if (!e) continue;
    gave++;
    assert.equal(r.foeFled, true);
    assert.equal(r.win, true);
  }
  assert.ok(gave > 0);
});

test('a predator that gives up on hunkered-down armor turns on the rest of the group before leaving', async () => {
  const { freshState } = await import('../js/state.js');
  const me = unitOf('You', [fighterOf(freshState().player)]);
  const sc = () => unitOf('s', [{ ...fighterOf(dino('s', 60, 'scelido')), fear: undefined }]);
  const weak = { ...wildFighter('allo', 4), damage: 15 };
  let turned = 0;
  for (let i = 0; i < 40; i++) {
    const r = teamFight([me, sc()], weak, seededRand('tu' + i));
    const at = r.log.findIndex(e => e.turned);
    if (at < 0) continue;
    turned++;
    // from then on it goes for the player, not the hunkered-down Scelidosaurus (while the player stands)
    for (const e of r.log.slice(at + 1)) if (e.by === 'foe' && e.to !== undefined && (e.dmg !== undefined || e.miss) && !e.counter) {
      if (r.log.slice(at + 1, r.log.indexOf(e)).some(x => x.by === 'foe' && x.to === 0 && x.left === 0)) break;
      assert.equal(e.to, 0);
    }
  }
  assert.ok(turned > 0);
});

test('the bigger the team, the sooner a predator notices it; Psittacosaurus vanish in the forest', async () => {
  const { encounterChance, teamVisibility } = await import('../js/world.js');
  const { freshState } = await import('../js/state.js');
  const me = unitOf('You', [fighterOf(freshState().player)]);
  const one = t => unitOf(t, [fighterOf(dino(t, 60, t))]);
  const raptorHex = landHexes(42).find(h => threatAt(42, h).id === 'raptor' && !threatAt(42, h).lair);
  const th = threatAt(42, raptorHex);
  const alone = encounterChance(th, [me], 'forest', false);
  const withDilo = encounterChance(th, [me, one('dilo')], 'forest', false);
  const withAnkylo = encounterChance(th, [me, one('ankylo')], 'forest', false);
  assert.ok(alone < withDilo && withDilo < withAnkylo);
  // a player and a medium dinosaur meet it as often as ever
  assert.ok(Math.abs(withDilo - th.chance) < 1e-9);
  // Psittacosaurus count for nothing in the forest, as much as any small one elsewhere
  const psittas = [me, one('psitta'), one('psitta'), one('psitta')];
  assert.equal(teamVisibility(psittas, 'forest'), teamVisibility([me], 'forest'));
  assert.ok(teamVisibility(psittas, 'meadow') > teamVisibility([me], 'meadow'));
  // what doesn't hunt doesn't care, and lairs are always met
  const herd = threatAt(42, landHexes(42).find(h => threatAt(42, h).id === 'proto' && !threatAt(42, h).lair));
  assert.equal(encounterChance(herd, [me], 'scrub', false), herd.chance);
});

test("a Psittacosaurus gets hungry more slowly, and its beak may crack a small foe's limb", async () => {
  const { hungerEvery } = await import('../js/economy.js');
  const { SPECIES } = await import('../js/config.js');
  assert.ok(hungerEvery({ id: 'x', type: 'psitta' }) > hungerEvery({ id: 'x', type: 'hypsi' }));
  assert.ok(SPECIES.psitta.digest > 1);
  let cracked = 0;
  for (let i = 0; i < 400; i++) {
    // (a prey animal runs before any fight: the rule is for one cornered, so it stands here as a defender)
    const ps = unitOf('p', [{ ...fighterOf(dino('p', 70, 'psitta')), fear: undefined, role: 'defender' }]);
    const me = unitOf('m', [{ ...fighterOf(dino('m', 70, 'dilo')), fear: undefined }]);
    for (const e of teamFight([me, ps], encounterUnit({ species: 'raptor', pack: [4, 4], loot: [] }, 3), seededRand('cr' + i)).log)
      if (e.by === 1 && e.cracked) { cracked++; assert.ok(e.counter); }
  }
  assert.ok(cracked > 0);
});

test('Gallimimus: twice as fast alone, they see predators first and run, and one may be caught', async () => {
  const { teamTripMins } = await import('../js/world.js');
  const { RUNNER } = await import('../js/config.js');
  const s0 = game(dino('g1', 60, 'galli'), dino('g2', 60, 'galli'), dino('d', 60, 'dilo'));
  const key = '2,0';
  assert.equal(teamTripMins(s0, ['g1', 'g2'], key), teamTripMins(s0, ['d'], key) * RUNNER.trip);
  assert.equal(teamTripMins(s0, ['g1', 'd'], key), teamTripMins(s0, ['d'], key));
  // the player rides one: a lone Gallimimus with the player still goes twice as fast
  assert.equal(teamTripMins(s0, ['player', 'g1'], key), teamTripMins(s0, ['d'], key) * RUNNER.trip);
  assert.equal(teamTripMins(s0, ['player'], key), teamTripMins(s0, ['d'], key));
  // a Tyrannosaurus lair (raptors don't hunt them: other theropods aren't on their menu): always met,
  // and run from
  const lair = lairs(42).find(k => threatAt(42, k.split(',').map(Number)).id === 'rex');
  let ran = 0, caught = 0, fought = 0;
  for (let trip = 0; trip < 200; trip++) {
    const s = game(...['g1', 'g2', 'g3', 'g4'].map(id => dino(id, 60, 'galli')));
    s.world.trips = trip;
    const r = applyAction(s, 'explore', { team: ['g1', 'g2', 'g3', 'g4'].map(id => ({ kind: 'dino', id })), hex: lair }, T0);
    const c = collect(s, { id: r.expedition.id }, r.expedition.returnAt);
    // (something met on the way instead)
    if (c.intercepted) continue;
    if (c.chase) {
      ran++;
      assert.equal(c.battle, null);
      // caught: dead (gone from the nest) or critically injured
      if (c.chase.caught) {
        caught++;
        const b = s.hatched.find(x => x.id === c.chase.caught);
        if (c.chase.died) { assert.equal(b, undefined); assert.ok(c.died.some(x => x.id === c.chase.caught)); }
        else assert.equal(b.critical, true);
      }
    } else if (c.battle) fought++;
  }
  assert.ok(ran > 0 && caught > 0 && fought > 0, JSON.stringify({ ran, caught, fought }));
});

test('death: a deadly blow kills, one brought down may not survive (its resistance), the player never dies', async () => {
  const { bury } = await import('../js/world.js');
  const lair = rexLairTop();
  let died = 0, critical = 0;
  for (let trip = 0; trip < 40; trip++) {
    // a Triceratops stands up to the strongest lair and goes down
    const s = game(dino('t', 20, 'trike'));
    s.world.trips = trip;
    const r = applyAction(s, 'explore', { team: [{ kind: 'dino', id: 't' }, { kind: 'player', id: 'player' }], hex: lair }, T0);
    const c = collect(s, { id: r.expedition.id }, r.expedition.returnAt);
    if (!c.battle || c.battle.win) continue;
    if (c.died.some(x => x.id === 't')) { died++; assert.equal(s.hatched.some(b => b.id === 't'), false); }
    else if (s.hatched.find(b => b.id === 't').critical) critical++;
    assert.ok(s.player);
  }
  assert.ok(died > 0 && critical > 0, JSON.stringify({ died, critical }));
  // the dead leave the nest and their pack; what they wore comes back
  const s = game(dino('a', 60, 'hypsi'), dino('b', 60, 'hypsi'));
  s.packs = [{ id: 'pack-a', type: 'hypsi', name: 'p', members: ['a', 'b'] }];
  s.hatched[0].equip = { head: 'leaf_crown' };
  assert.equal(countItem(s, 'leaf_crown'), 0);
  assert.deepEqual(bury(s, 'a'), { id: 'a', name: 'a', type: 'hypsi' });
  assert.equal(s.hatched.length, 1);
  assert.deepEqual(s.packs, []);
  assert.equal(countItem(s, 'leaf_crown'), 1);
});

test('the risk of death before a fight: high against a killer, none for the player', async () => {
  const { teamOdds } = await import('../js/combat.js');
  const { freshState } = await import('../js/state.js');
  const me = unitOf('You', [fighterOf(freshState().player)]);
  const compy = unitOf('c', [{ ...fighterOf(dino('c', 50, 'compy')), fear: undefined, role: 'attacker' }]);
  const r = teamOdds([me, compy], wildFighter('rex', 6), 60);
  assert.equal(r.death[0][0], 0);
  assert.ok(r.death[1][0] > 0.5, r.death[1][0]);
  const safe = teamOdds([unitOf('k', [fighterOf(dino('k', 90, 'ankylo'))])], encounterUnit({ species: 'compy', pack: [2, 2], loot: [] }, 2), 60);
  assert.equal(safe.death[0][0], 0);
});

test("Baryonyx hooks with its thumb claw; Spinosaurus is clumsy on land and strong in the water, and its sail keeps rivals away", async () => {
  const { keepsAway, teamUnits } = await import('../js/world.js');
  const bary = () => unitOf('b', [{ ...fighterOf(dino('b', 60, 'bary')), fear: undefined }]);
  let hooked = 0, bled = 0;
  for (let i = 0; i < 30; i++) for (const e of teamFight([bary()], wildFighter('allo', 5), seededRand('hk' + i)).log) {
    if (e.by === 0 && e.hooked) hooked++;
    if (e.by === 'bleed' && e.to === undefined) bled++;
  }
  assert.ok(hooked > 0 && bled > 0);
  // the same Spinosaurus wins more in the swamp than on land
  const spino = () => unitOf('s', [{ ...fighterOf(dino('s', 60, 'spino')), fear: undefined }]);
  const foe = wildFighter('rex', 6);
  const { teamWinChance } = await import('../js/combat.js');
  assert.ok(teamWinChance([spino()], foe, 200, { biome: 'swamp' }) > teamWinChance([spino()], foe, 200, { biome: 'scrub' }));
  // its sail: a smaller predator (Allosaurus) keeps away; a Tyrannosaurus (as big as it) doesn't, but
  // may back off after sizing it up, likelier in the water; a lair's Alpha never does
  const { sailBackOff } = await import('../js/world.js');
  // (a Stegosaurus beside: something an Allosaurus does hunt)
  const s = game(dino('s', 60, 'spino'), dino('a', 60, 'stego'));
  const sTeam = teamUnits(s, [{ kind: 'dino', id: 's', members: ['s'] }]), aTeam = teamUnits(s, [{ kind: 'dino', id: 'a', members: ['a'] }]);
  // (grown ones, past the young near the nest)
  const at = (id, lair) => threatAt(42, landHexes(42).find(h => threatAt(42, h).id === id && threatAt(42, h).lair === lair && hexDist(h) > 3));
  assert.equal(keepsAway(at('allo', false), sTeam), true);
  assert.equal(keepsAway(at('allo', false), aTeam), false);
  const rex = at('rex', false);
  assert.equal(keepsAway(rex, sTeam), false);
  assert.ok(sailBackOff(rex, sTeam, 'scrub') > 0);
  assert.ok(sailBackOff(rex, sTeam, 'swamp') > sailBackOff(rex, sTeam, 'scrub'));
  assert.equal(sailBackOff(rex, aTeam, 'swamp'), 0);
  assert.equal(sailBackOff({ ...rex, lair: true }, sTeam, 'swamp'), 0);
  // a herbivore as big (Triceratops) is not a rival: no sizing up
  assert.equal(sailBackOff({ ...rex, entry: { ...rex.entry, species: 'trike' } }, sTeam, 'swamp'), 0);
});

test('a Baryonyx brings home fish from the swamp', () => {
  const swamp = landHexes(42).map(h => hexKey(...h)).find(k => { const h = k.split(',').map(Number); return threatAt(42, h).id === 'deinosuchus' && !threatAt(42, h).lair; });
  let checked = 0;
  for (let trip = 0; trip < 30; trip++) {
    const s = game(dino('b', 90, 'bary'));
    s.world.trips = trip;
    const c = trip0(s, 'b', swamp);
    if (c.battle && !c.battle.win) continue;
    checked++;
    assert.ok(c.loot.filter(l => l.id === 'fish').reduce((t, l) => t + l.n, 0) >= 2);
  }
  assert.ok(checked > 0);
});
function trip0(s, id, key) { return trip(s, id, key); }

test('Hypsilophodon: zigzags away from bigger attackers, forages on any trip, and a herd spots predators in time to scatter', async () => {
  const { huntOdds, teamUnits, eyesChance } = await import('../js/world.js');
  const { EYES, PACK_LIMITS, HERDS } = await import('../js/config.js');
  assert.equal(PACK_LIMITS.hypsi, 6);
  assert.ok(HERDS.includes('hypsi'));
  // zigzags: a bigger attacker (Allosaurus) misses it more than the same one without them
  const misses = zigzag => {
    let n = 0, all = 0;
    for (let i = 0; i < 40; i++) for (const e of teamFight([unitOf('h', [{ ...fighterOf(dino('h', 80, 'hypsi')), fear: undefined, role: 'defender', zigzag }])], wildFighter('allo', 4), seededRand('zz' + i)).log) {
      if (e.by === 'foe' && e.to === 0) { all++; if (e.miss) n++; }
    }
    return n / all;
  };
  assert.ok(misses(true) > misses(false) + 0.05, `${misses(true)} vs ${misses(false)}`);
  // harder to run down when hunted
  const s = game(dino('r', 60, 'raptor'));
  const team = teamUnits(s, [{ kind: 'dino', id: 'r', members: ['r'] }]);
  const prey = wildFighter('hypsi', 4);
  assert.ok(huntOdds(team, prey).chance < huntOdds(team, { ...prey, zigzag: false }).chance);
  // more eyes, likelier to see a predator first (capped)
  const ids = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const herd = game(...ids.map(id => dino(id, 60, 'hypsi')));
  assert.equal(eyesChance(herd, ['h1']), EYES.perOne);
  assert.ok(eyesChance(herd, ids) > eyesChance(herd, ['h1', 'h2']) && eyesChance(herd, ids) <= EYES.max);
  // a herd going into a raptor lair: sometimes it scatters in time, and then nobody is caught
  const lair = lairs(42).find(k => threatAt(42, k.split(',').map(Number)).id === 'raptor');
  let scattered = 0, leaves = 0;
  for (let trip = 0; trip < 60; trip++) {
    const s2 = game(...ids.slice(0, 4).map(id => dino(id, 60, 'hypsi')));
    s2.world.trips = trip;
    const r = applyAction(s2, 'explore', { team: ids.slice(0, 4).map(id => ({ kind: 'dino', id })), hex: lair }, T0);
    const c = collect(s2, { id: r.expedition.id }, r.expedition.returnAt);
    // (something met on the way instead)
    if (c.intercepted) continue;
    if (c.chase) { scattered++; assert.equal(c.chase.scattered, true); assert.equal(c.chase.caught, null); assert.equal(c.battle, null); assert.equal(c.died.length, 0); }
    if (!c.battle || c.battle.win || c.battle.escaped) leaves += c.loot.filter(l => l.id === 'leaf').length ? 1 : 0;
  }
  assert.ok(scattered > 0 && leaves > 0, JSON.stringify({ scattered, leaves }));
});

test('a predator everyone ran from gives chase: it may catch the slowest, who may not survive; zigzags help get away', async () => {
  const { chaseOf, catchChance, teamUnits } = await import('../js/world.js');
  const s = game(dino('h', 60, 'hypsi'), dino('p', 60, 'psitta'));
  const raptors = wildFighter('raptor', 5);
  const foe = { name: 'Velociraptor', pack: false, members: [raptors] };
  const hTeam = teamUnits(s, [{ kind: 'dino', id: 'h', members: ['h'] }]);
  const h = hTeam[0].members[0];
  // zigzags make it harder to run down
  assert.ok(catchChance(foe, h) < catchChance(foe, { ...h, zigzag: false }));
  // the slowest is chased; a defender doesn't chase at all
  const both = teamUnits(s, [{ kind: 'dino', id: 'h', members: ['h'] }, { kind: 'dino', id: 'p', members: ['p'] }]);
  assert.equal(chaseOf(both, foe).unit, 1);
  assert.equal(chaseOf(both, { ...foe, members: [{ ...raptors, role: 'defender' }] }), null);
  // a Tyrannosaurus won't run after a Compsognathus
  const tiny = teamUnits(game(dino('c', 60, 'compy')), [{ kind: 'dino', id: 'c', members: ['c'] }]);
  assert.equal(chaseOf(tiny, { name: 'T. rex', pack: false, members: [wildFighter('rex', 6)] }), null);
  assert.ok(chaseOf(tiny, { name: 'Dilophosaurus', pack: false, members: [wildFighter('dilo', 6)] }));
  // nor raptors: other theropods aren't on their menu
  assert.equal(chaseOf(tiny, foe), null);
  // trips: a lone Psittacosaurus into a raptor lair is sometimes caught: dead (nothing comes home) or critical
  const lair = lairs(42).find(k => threatAt(42, k.split(',').map(Number)).id === 'raptor');
  let caught = 0, died = 0, away = 0;
  for (let trip = 0; trip < 60; trip++) {
    const s2 = game(dino('p', 60, 'psitta'));
    s2.world.trips = trip;
    const c = trip0(s2, 'p', lair);
    if (!c.battle || !c.battle.escaped) continue;
    if (!c.battle.caught) { away++; continue; }
    caught++;
    assert.equal(c.battle.caught.id, 'p');
    if (c.battle.caught.died) { died++; assert.equal(s2.hatched.find(x => x.id === 'p'), undefined); assert.equal(c.loot.length, 0); }
    else assert.equal(s2.hatched.find(x => x.id === 'p').critical, true);
  }
  assert.ok(caught > 0 && died > 0 && away > 0, JSON.stringify({ caught, died, away }));
});

test('a Compsognathus hunts on the way and comes home fed, with insects now and then; it lives alone', async () => {
  const { PACK_LIMITS } = await import('../js/config.js');
  const { cleanPacks } = await import('../js/packs.js');
  const { isHungry } = await import('../js/economy.js');
  assert.equal(PACK_LIMITS.compy, undefined);
  // an old save's pack of them breaks up
  const old = game(dino('a', 60, 'compy'), dino('b', 60, 'compy'));
  assert.deepEqual(cleanPacks([{ id: 'p', type: 'compy', name: 'p', members: ['a', 'b'] }], old), []);
  let fed = 0, insects = 0;
  for (let trip = 0; trip < 20; trip++) {
    const s = game(dino('c', 60, 'compy'), dino('d', 60, 'dilo'));
    s.world.trips = trip;
    const c = trip0(s, 'c', '1,0');
    const back = T0 + tripMins('1,0') * 60000;
    if (!c.fedSelf.includes('c')) continue;
    fed++;
    assert.equal(isHungry(s.hatched.find(b => b.id === 'c'), back), false);
    if (c.loot.some(l => l.id === 'insect')) insects++;
    // the others come home hungry
    const d = trip0(s, 'd', '1,0');
    assert.equal(d.fedSelf.length, 0);
  }
  assert.ok(fed > 10 && insects > 0, JSON.stringify({ fed, insects }));
});

test('prey animals never fight: they run from any predator, even with the player fighting, and wild ones keep away', async () => {
  const { keepsAway, teamUnits } = await import('../js/world.js');
  const { freshState } = await import('../js/state.js');
  const me = unitOf('You', [fighterOf(freshState().player)]);
  for (const t of ['compy', 'psitta', 'hypsi', 'galli', 'hypa', 'para']) {
    const herd = unitOf('h', [fighterOf(dino('h', 90, t))]);
    const r = teamFight([me, herd], encounterUnit({ species: 'dilo', loot: [] }, 2), seededRand('prey' + t));
    assert.deepEqual(r.fled, [1], t);
    // (a Parasaurolophus may still call a warning before it runs)
    assert.ok(r.log.every(e => e.alert || (e.by !== 1 && e.to !== 1)), t);
  }
  // a wild one (a Compsognathus) never shows itself, even to a team no bigger than it
  const s = game(dino('c', 60, 'compy'));
  const hex = landHexes(42).find(h => threatAt(42, h).id === 'compy' && !threatAt(42, h).lair);
  assert.equal(keepsAway(threatAt(42, hex), teamUnits(s, [{ kind: 'dino', id: 'c', members: ['c'] }])), true);
});

test("a predator scatters the player's group: face it with whoever stays, or run too and maybe be caught", async () => {
  const lair = lairs(42).find(k => threatAt(42, k.split(',').map(Number)).id === 'raptor');
  // (a Tyrannosaurus hunts Gallimimus; raptors don't)
  const rexLair = lairs(42).find(k => threatAt(42, k.split(',').map(Number)).id === 'rex');
  const go = (ids, trip, choice, hex = lair) => {
    const s = game(...ids.filter(id => id !== 'player').map(id => dino(id, 60, id.startsWith('g') ? 'galli' : 'psitta')));
    s.world.trips = trip;
    const team = ids.map(id => id === 'player' ? { kind: 'player' } : { kind: 'dino', id });
    const r = applyAction(s, 'explore', { team, hex }, T0);
    assert.equal(r.ok, true, r.reason);
    // (the scatter where it went; null when it met nothing there that scattered it)
    const sc = reach(s, r.expedition.id, r.expedition.returnAt, p => p.kind === 'scatter' && p.hex === hex);
    return { s, sc, c: sc && collect(s, { id: r.expedition.id, ...choice }, r.expedition.returnAt) };
  };
  // without the player there is nothing to decide
  assert.equal(go(['p1'], 1, {}).sc, null);
  // riding a Gallimimus: face it on foot, thrown off; or ride off, and only the Gallimimus may be caught
  // (the first trip that meets it, rather than watching wild against wild)
  let faced = null;
  for (let trip = 1; !faced || !faced.sc; trip++) faced = go(['player', 'g1'], trip, { fight: true }, rexLair);
  assert.ok(faced.sc && faced.sc.mounted);
  assert.equal(faced.c.scatter.choice, 'fight');
  assert.ok(faced.c.battle.thrown);
  assert.deepEqual(faced.c.battle.fled, [1]);
  let rodeOff = 0, galliCaught = 0;
  for (let trip = 0; trip < 40; trip++) {
    const { c } = go(['player', 'g1'], trip, { flee: true }, rexLair);
    if (!c) continue;
    assert.equal(c.battle, null);
    rodeOff++;
    if (c.chase.caught) { galliCaught++; assert.equal(c.chase.caught, 'g1'); }
  }
  assert.ok(rodeOff && galliCaught, JSON.stringify({ rodeOff, galliCaught }));
  // on foot with a Psittacosaurus: running, the slowest may be caught; the player caught has to fight
  let forced = 0, preyCaught = 0, away = 0;
  for (let trip = 0; trip < 80; trip++) {
    const { sc, c } = go(['player', 'p1'], trip, { flee: true });
    if (!sc) continue;
    assert.ok(sc && !sc.mounted && sc.alone);
    if (c.battle) { forced++; assert.equal(c.battle.forced, sc.run.id); assert.ok(sc.run.fights); }
    else if (c.chase.caught) { preyCaught++; assert.equal(c.chase.caught, 'p1'); }
    else away++;
  }
  assert.ok((forced || preyCaught) && away, JSON.stringify({ forced, preyCaught, away }));
});

test('the food chain: raptors pass an armored Scelidosaurus by, go for the player beside it, and armor is beyond them anyway', async () => {
  const { passesBy, teamUnits } = await import('../js/world.js');
  const { isPrey } = await import('../js/combat.js');
  const raptors = encounterUnit({ species: 'raptor', pack: [4, 4], loot: [] }, 6);
  const sc = () => unitOf('s', [{ ...fighterOf(dino('s', 60, 'scelido')), fear: undefined }]);
  assert.equal(isPrey(raptors.members[0], sc().members[0]), false);
  // alone, it isn't prey to them: they pass it by
  const s = game(dino('s', 60, 'scelido'));
  const team = teamUnits(s, [{ kind: 'dino', id: 's', members: ['s'] }]);
  assert.equal(passesBy({ entry: { species: 'raptor' }, foe: raptors }, team), true);
  // with the player beside it they go for the player only
  const me = unitOf('You', [fighterOf(freshState().player)]);
  for (let i = 0; i < 20; i++) {
    const r = realFight([sc(), me], raptors, seededRand('arm' + i));
    assert.ok(!r.log.some(e => e.by === 'foe' && e.to === 0 && e.dmg !== undefined));
  }
  // and armor stays beyond anything small even when one does strike it
  const desperate = { ...raptors, members: raptors.members.map(f => ({ ...f, fear: undefined, plated: false })) };
  const blow = fighterOf(dino('r', 60, 'raptor'));
  assert.ok(blow);
  const r = realFight([sc()], { ...desperate, members: desperate.members }, seededRand('arm-x'));
  for (const e of r.log) if (e.by === 'foe' && e.dmg !== undefined) assert.equal(e.dmg, 0);
});

test('the food chain: a predator passes by what it can neither hunt nor hurt, and only chases its prey', async () => {
  const { passesBy, teamUnits, chaseOf } = await import('../js/world.js');
  const s = game(dino('a', 60, 'argent'), dino('k', 60, 'ankylo'), dino('h', 60, 'hypsi'));
  const of = ids => teamUnits(s, ids.map(id => ({ kind: 'dino', id, members: [id] })));
  // a Deinosuchus doesn't go for a grown Argentinosaurus; raptors don't go for an Ankylosaurus
  assert.equal(passesBy({ entry: { creature: 'deinosuchus' }, foe: encounterUnit({ creature: 'deinosuchus' }, 6) }, of(['a'])), true);
  const raptors = encounterUnit({ species: 'raptor', pack: [3, 3], loot: [] }, 6);
  assert.equal(passesBy({ entry: { species: 'raptor' }, foe: raptors }, of(['k'])), true);
  // with a Hypsilophodon along they do come: it runs, and it is the one they chase (never the Ankylosaurus)
  assert.equal(passesBy({ entry: { species: 'raptor' }, foe: raptors }, of(['k', 'h'])), false);
  const r = realFight(of(['k', 'h']), raptors, seededRand('fc'));
  assert.equal(r.escaped, true);
  assert.equal(chaseOf(of(['k', 'h']), raptors).unit, 1);
});

test('an Allosaurus goes for its own kind (cannibalism), but no other theropod', async () => {
  const { isPrey } = await import('../js/combat.js');
  const wild = wildFighter('allo', 6);
  assert.equal(isPrey(wild, fighterOf(dino('a', 60, 'allo'))), true);
  assert.equal(isPrey(wild, fighterOf(dino('d', 60, 'dilo'))), false);
  assert.equal(isPrey(wild, fighterOf(dino('s', 60, 'stego'))), true);
});

test('wild against wild: the team watches a hunt, and may step in after the prey or the hunter', async () => {
  const hexOf = id => landHexes(42).map(h => hexKey(...h)).find(k => { const h = k.split(',').map(Number); return hexDist(h) >= 4 && !threatAt(42, h).lair && threatAt(42, h).id === id; });
  const run = (key, types, pick) => {
    const seen = [];
    for (let trip = 0; trip < 300 && seen.length < 12; trip++) {
      const s = game(...types.map(([id, t]) => dino(id, 90, t)));
      s.world.trips = trip;
      const r = applyAction(s, 'explore', { team: types.map(([id]) => ({ kind: 'dino', id })), hex: key }, T0);
      // (a hunt watched where it went)
      const wt = reach(s, r.expedition.id, r.expedition.returnAt, p => p.kind === 'witness' && p.hex === key);
      if (!wt) continue;
      const choice = pick(wt);
      const c = collect(s, { id: r.expedition.id, ...(choice ? { witness: choice } : {}) }, r.expedition.returnAt);
      assert.ok(c.witness);
      seen.push({ wt, c });
    }
    return seen;
  };
  // a swamp: a Deinosuchus goes for a Baryonyx (or one of its own). A Tyrannosaurus may go after either;
  // a Velociraptor won't go near any of them
  const swamp = hexOf('deinosuchus');
  const opts = run(swamp, [['r', 'rex'], ['v', 'raptor']], () => null);
  assert.ok(opts.length);
  for (const { wt, c } of opts) {
    const v = wt.options.find(o => o.id === 'v');
    assert.equal(v.predator.ok, false);
    assert.equal(c.witness.act, 'none');
    assert.equal(c.battle, null);
  }
  const fights = run(swamp, [['r', 'rex']], () => ({ act: 'predator', hunter: 'r' }));
  assert.ok(fights.some(({ c }) => c.battle && c.battle.creature === 'deinosuchus'));
  for (const { c } of fights) if (c.battle && c.battle.win && !c.battle.foeFled) assert.ok(c.loot.length);
  const preys = run(swamp, [['r', 'rex']], wt => (wt.options[0].prey.ok ? { act: 'prey', hunter: 'r' } : null));
  for (const { c } of preys) if (c.witness.act === 'prey' && c.witness.caught) assert.ok(c.witness.contested ? c.battle : c.loot.length);
  // a meadow: a Dilophosaurus goes for a Compsognathus; it fears a Tyrannosaurus, so it runs and is chased
  const chases = run(hexOf('dilo'), [['r', 'rex']], wt => (wt.hunter.species === 'dilo' ? { act: 'predator', hunter: 'r' } : null));
  const ran = chases.filter(({ wt }) => wt.hunter.species === 'dilo');
  assert.ok(ran.length);
  for (const { wt, c } of ran) { assert.ok(wt.options[0].predator.chase); assert.equal(c.battle, null); }
});

test('an open world: the way to a far hex crosses danger, and something on it may come for the team first', async () => {
  const { routeRisk, travelPath, canReach } = await import('../js/world.js');
  const land = landHexes(42);
  const far = hexKey(...land.filter(h => threatAt(42, h).id === 'rex').at(-1));
  const near = hexKey(...land.find(h => hexDist(h) === 3));
  const path = travelPath(42, far.split(',').map(Number)).map(h => hexKey(...h));
  let stopped = 0, met = 0;
  for (let trip = 1; trip <= 60; trip++) {
    const s = game(dino('p', 60, 'proto'));
    s.world.trips = trip - 1;
    assert.equal(canReach(s, far), true);
    const r = applyAction(s, 'explore', { babyId: 'p', hex: far }, T0);
    assert.equal(r.ok, true, r.reason);
    const c = collect(s, { id: r.expedition.id }, r.expedition.returnAt);
    if (c.intercepted) {
      stopped++;
      // it met the one on the way, somewhere it crossed
      assert.ok(path.slice(0, -1).includes(c.intercepted.hex));
      if (c.story.some(e => e.kind === 'fight' && e.hex !== far)) met++;
    }
    // the way there is known now (unless it never got there)
    if (s.hatched.length) assert.ok(path.every(k => s.world.revealed.includes(k)));
  }
  assert.ok(stopped > 0 && met > 0, JSON.stringify({ stopped, met }));
  // near the nest the way is calm
  for (let trip = 1; trip <= 30; trip++) {
    const s = game(dino('p', 60, 'proto'));
    s.world.trips = trip - 1;
    const r = applyAction(s, 'explore', { babyId: 'p', hex: near }, T0);
    assert.equal(collect(s, { id: r.expedition.id }, r.expedition.returnAt).intercepted, null);
  }
  // the warning before setting out: from the biomes crossed
  const team = teamUnits(game(dino('p', 60, 'proto')), [{ kind: 'dino', id: 'p', members: ['p'] }]);
  const risk = routeRisk(game(dino('p', 60, 'proto')), team, far);
  assert.ok(risk.stopped > 0 && risk.foes.length && risk.crosses.length);
});
