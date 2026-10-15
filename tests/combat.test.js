import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, countItem, addItem, buyGear, equipGear, seededRand } from '../js/economy.js';
import { freshState } from '../js/state.js';
import { fight, fighterOf, creatureFighter, wildFighter, encounterUnit, teamFight, unitOf, winChance, dangerOf } from '../js/combat.js';
import { ALL_HEXES, hexKey, hexDist, newWorld, isLair, threatAt, tripMins, injuredLeft, exploreProblem } from '../js/world.js';
import { CREATURES, BIOMES, SPECIES, INJURY_MINS, CRITICAL_MINS, HEAL_MINS, LAIR_MIN_DIST } from '../js/config.js';

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
  const key = lairs(42)[0];
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
  const compys = encounterUnit({ species: 'compy', pack: [3, 3], loot: [] }, 2);
  const f = teamFight([me, galli], compys, seededRand('stay'));
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
