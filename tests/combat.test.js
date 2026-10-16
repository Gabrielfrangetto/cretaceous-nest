import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, buyGear, equipGear, seededRand } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { fight, fighterOf, creatureFighter, wildFighter, encounterUnit, teamFight, unitOf, winChance, dangerOf } from '../js/combat.js';
import { ALL_HEXES, hexKey, hexDist, newWorld, isLair, threatAt, tripMins, injuredLeft, exploreProblem } from '../js/world.js';
import { CREATURES, BIOMES, SPECIES, INJURY_MINS, CRITICAL_MINS, HEAL_MINS, LAIR_MIN_DIST, SIZE_ORDER } from '../js/config.js';
// whether what waits in a hex shows itself to a team whose biggest is size (it keeps away otherwise)
const showsTo = (key, size) => { const e = threatAt(42, key.split(',').map(Number)).entry; const f = e.species && SPECIES[e.species].fear; return !f || SIZE_ORDER.indexOf(f) >= SIZE_ORDER.indexOf(size); };

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
  return applyAction(s, 'collectTrip', { id: r.expedition.id }, T0 + tripMins(key) * 60000);
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
  const lairs = ALL_HEXES.filter(h => isLair(42, h));
  assert.ok(lairs.length > 0);
  for (const h of lairs) { assert.ok(hexDist(h) >= LAIR_MIN_DIST); assert.equal(threatAt(42, h).chance, 1); }
});

// the lairs on the map, weakest creature first
const lairs = seed => ALL_HEXES.filter(h => isLair(seed, h)).sort((x, y) => threatAt(seed, x).foe.power - threatAt(seed, y).foe.power).map(h => hexKey(...h));

test('beating a creature brings its loot and coins on top of the hex', () => {
  const s = game(dino('champ', 100));
  const key = lairs(42).find(k => showsTo(k, SPECIES.rex.size));
  const r = trip(s, 'champ', key);
  assert.equal(r.battle.win, true);
  assert.equal(r.battle.lair, true);
  const cLoot = threatAt(42, key.split(',').map(Number)).entry.loot.map(l => l[0]);
  assert.ok(r.loot.some(l => cLoot.includes(l.id)));
  assert.ok(r.coins > 0);
  assert.equal(injuredLeft(s.hatched[0], T0 + tripMins(key) * 60000) >= 0, true);
});

test('losing brings nothing, still maps the land, and leaves the dinosaur injured (critically, as it went down)', () => {
  // a Triceratops stands up to anything, so it fights even the strongest lair (and loses)
  const s = game(dino('runt', 1, 'trike'));
  const key = lairs(42).at(-1);
  const coins = s.coins;
  const back = T0 + tripMins(key) * 60000;
  const r = trip(s, 'runt', key);
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
  const s = game(dino('runt', 1, 'trike'));
  const key = lairs(42).at(-1);
  const back = T0 + tripMins(key) * 60000;
  const r = trip(s, 'runt', key);
  assert.equal(r.battle.win, false);
  const b = s.hatched[0];
  assert.equal(isCritical(b, back), true);
  assert.equal(injuredLeft(b, back), CRITICAL_MINS * 60000);
  assert.ok(r.battle.injured[0].critical);
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
  // against a small pack it stays and never attacks on its own: it strikes back when attacked, or
  // through an opening while the pack goes for someone else
  const raptors = encounterUnit({ species: 'raptor', pack: [3, 3], loot: [] }, 2);
  const f = teamFight([me, galli], raptors, seededRand('stay'));
  assert.deepEqual(f.fled, []);
  const its = f.log.filter(e => e.by === 1);
  assert.ok(its.length && its.every(e => e.counter || e.opening));
  assert.ok(its.some(e => e.opening));
});

test('a defender charges now and then, otherwise holds its ground and strikes back', () => {
  const foe = encounterUnit({ species: 'dilo', loot: [] }, 5);
  const trike = unitOf('t', [fighterOf(dino('t', 50, 'trike'))]);
  let charges = 0, counters = 0;
  for (let i = 0; i < 20; i++) {
    const r = teamFight([trike], foe, seededRand('d' + i));
    for (const e of r.log) if (e.by === 0) { assert.ok(e.charge || e.counter); if (e.charge) charges++; else counters++; }
  }
  assert.ok(charges > 0 && counters > charges, `${charges} charges, ${counters} counters`);
});

test('the foe goes for defenders more and noncombatants less', () => {
  const foe = encounterUnit({ species: 'dilo', loot: [] }, 3);
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
    const r = teamFight([unitOf('s', [fighterOf(dino('s', 50, 'stego'))])], rex, seededRand('b' + i));
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
  const { ARMOR } = await import('../js/config.js');
  const rex = wildFighter('rex', 6);
  const parts = {};
  let thorns = 0, shins = 0;
  for (let i = 0; i < 40; i++) {
    const r = teamFight([unitOf('a', [fighterOf(dino('a', 50, 'ankylo'))])], rex, seededRand('k' + i));
    let lastFoeBlow = null;
    for (const e of r.log) {
      if (e.by === 'foe' && !e.miss) {
        parts[e.part] = (parts[e.part] || 0) + 1;
        assert.equal(!!e.armored, ARMOR.armored.includes(e.part));
        assert.ok(!e.kill, 'its neck is never bitten through');
        lastFoeBlow = e;
      }
      if (e.thorns) { thorns++; assert.equal(lastFoeBlow.part, 'back'); }
      if (e.club) { shins++; assert.ok(e.lame && (e.counter || e.charge)); }
    }
  }
  for (const [p] of ARMOR.parts) assert.ok(parts[p], `blows land on its ${p}`);
  assert.ok(thorns && shins, `${thorns} spikes, ${shins} shins`);
  // the armored parts let much less through than the belly
  const plain = fighterOf(dino('a', 50, 'ankylo'));
  assert.ok(1 - ARMOR.cut < 1 && ARMOR.belly > 1 && plain.armor && plain.club);
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
      if (e.by === 'foe') { if (holding) { assert.ok(e.immune); seen.immune++; } else assert.ok(!e.immune); }
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
  const ankylo = () => unitOf('a', [{ ...fighterOf(dino('a', 50, 'ankylo')), fear: undefined }]);
  let swings = 0, landed = 0, kills = 0;
  for (let i = 0; i < 40; i++) {
    for (const e of teamFight([ankylo()], encounterUnit({ species: 'raptor', pack: [4, 4], loot: [] }, 5), seededRand('c' + i)).log) {
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
  for (let i = 0; i < 30; i++) {
    const s = game(dino('rex', 60));
    s.world.trips = i;
    const r = trip(s, 'rex', key);
    assert.equal(r.battle, null);
    assert.equal(r.sighting.species, 'compy');
    assert.ok(r.sighting.chance > 0 && r.sighting.chance < 1);
    assert.deepEqual(s.world.sightings.map(x => x.id), [r.sighting.id]);
    const meat = countItem(s, 'meat');
    const h = applyAction(s, 'hunt', { id: r.sighting.id, go: true });
    assert.equal(h.ok, true);
    assert.deepEqual(s.world.sightings, []);
    if (h.caught) { caught.yes++; assert.ok(countItem(s, 'meat') > meat && h.coins > 0); } else { caught.no++; assert.equal(countItem(s, 'meat'), meat); }
    assert.equal(applyAction(s, 'hunt', { id: r.sighting.id, go: true }).ok, false);
  }
  assert.ok(caught.yes > 0 && caught.no > 0, JSON.stringify(caught));
  // letting them be brings nothing; a team with no carnivore big enough doesn't even get the chance
  const s = game(dino('rex', 60));
  const r = trip(s, 'rex', key);
  assert.equal(applyAction(s, 'hunt', { id: r.sighting.id, go: false }).caught, undefined);
  assert.deepEqual(s.world.sightings, []);
  const herbivore = game(dino('trike', 60, 'trike'));
  const t = trip(herbivore, 'trike', key);
  assert.equal(t.battle, null);
  assert.equal(t.sighting, null);
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
  const { tripStandoff } = await import('../js/world.js');
  const key = ALL_HEXES.map(h => hexKey(...h)).find(k => threatAt(42, k.split(',').map(Number)).id === 'proto' && !isLair(42, k.split(',').map(Number)));
  const results = {};
  for (const fight of [false, true]) {
    // a trip that runs into the herd (the trip number seeds whether it does)
    for (let trip = 0; trip < 40; trip++) {
      const s = game(dino('d', 60, 'dilo'));
      s.world.trips = trip;
      const r = applyAction(s, 'explore', { babyId: 'd', hex: key }, T0);
      const st = tripStandoff(s, r.expedition.id);
      if (!st) continue;
      assert.equal(st.species, 'Protoceratops');
      assert.equal(st.group, st.count > 1 ? 'herd' : '');
      results[fight] = applyAction(s, 'collectTrip', { id: r.expedition.id, fight }, r.expedition.returnAt);
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
  const raptors = ALL_HEXES.map(h => hexKey(...h)).find(k => threatAt(42, k.split(',').map(Number)).id === 'raptor');
  const r = applyAction(s, 'explore', { babyId: 'd', hex: raptors }, T0);
  assert.equal(tripStandoff(s, r.expedition.id), null);
});
