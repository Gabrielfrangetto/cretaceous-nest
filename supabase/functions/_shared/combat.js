// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi, size, bite, hide } (deriveCombat in
// economy.js, plus agility and its species' body). The faster one strikes first, then they take
// turns. Each blow can be dodged (dodge chance); otherwise it lands (see hitOf): damage ±25%, never
// more than the attacker's bite, × (1 − reduction), minus the target's hide; a blow the hide stops
// does nothing. They fight until one is down: there is no turn limit.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_SAFETY, ROUT, PACK_BONUS, RIVAL_CLASH, FRENZY_DAMAGE, REACH_SLOTS, KG, MASS, SIZE_DODGE, DODGE_MAX, MISS_FLOOR, SIZE_DODGE_MAX, BLEED_BIGGER, BLEED_SMALLER, BLEED_MIN, BONE_BREAKER, FRILL, ARMOR, CLUB, GRAB, LATCH, CLAW, BEAK, SPIKES, THROAT, DOME, RISE, STANCE, GIANT, ALERT, ESCAPE, FLIGHT, GIVE_UP, CAMO, CRACK, DEATH, HIT_PARTS, ARMS, BIPED_LEGS, QUAD_LEGS, LIMBS, isLeg, isArm, ROLE_TARGET, CHARGE_DAMAGE, CHARGE_EXPOSED, OPENING, WATER_BIOMES, HOOK, ZIGZAG,
  SPECIES, SIZE_ORDER, SIZE_EDGE, PLAYER_SIZE, PLAYER_ID, BITE, HIDE, WORLD_RADIUS } from './config.js';
const YOUNG_DIST = 3;   // creatures this close to the nest are young
import { deriveCombat, statSheet, gearMods, seededRand, massOf, hpForMass, biteForMass } from './economy.js';

// extra: stat mods on top of its equipment, for the fight only (a full pack's bonus)
export function fighterOf(baby, extra = []) {
  const sheet = statSheet(baby, extra.length ? [...gearMods(baby), ...extra] : undefined);
  const me = baby.id === PLAYER_ID, sp = SPECIES[baby.type];
  // the player's blows come from weapons, so no jaws hold them back
  const body = me ? { size: PLAYER_SIZE, bite: Infinity, hide: 0, role: 'attacker', biped: true }
    : { size: sp.size, bite: sp.bite, hide: sp.hide, type: baby.type, biped: !!sp.biped, rival: !!sp.rival, role: sp.role, fear: sp.fear, hunts: sp.hunts || null, preyMax: sp.preyMax || null, charge: sp.charge || 0, fisher: sp.fisher || null, hook: !!sp.hook, crush: sp.crush || 0, boneBreaker: !!sp.boneBreaker, armor: sp.armor || false, collar: !!sp.collar, crouch: !!sp.crouch, club: !!sp.club,
        grab: !!sp.grab, tough: !!sp.tough, claw: !!sp.claw, beak: !!sp.beak, spikes: !!sp.spikes, guard: !!sp.guard, throat: !!sp.throat, dome: !!sp.dome, giant: !!sp.giant, alert: !!sp.alert, escape: !!sp.escape, crack: !!sp.crack, camo: sp.camo || null, kick: sp.kick || 1, zigzag: !!sp.zigzag, plated: sp.build === 'armored',
        ...(sp.frill ? { frill: Math.max(0, Math.min(FRILL.hp, baby.frill ?? FRILL.hp)) } : {}) };
  // (health from its vitality and its weight; a growing one bites as its skull allows)
  const kg = massOf(baby);
  if (!me) body.bite = biteForMass(sp.bite, kg, KG[baby.type]);
  return { name: baby.name, ...sheet.derived, hp: Math.round(hpForMass(sheet.derived.hp, kg) * (sp && !me ? sp.fragile || 1 : 1)), agi: sheet.stats.agi, str: sheet.stats.str, res: sheet.stats.res, power: sheet.power, ...body, kg };
}

// a dodge against an attacker. Speed against speed: two equally quick ones cancel each other out and
// only miss MISS_FLOOR of the time; the quicker the target is than its attacker, the more of its
// dodge it keeps (all of it at twice as quick). Then smaller targets are harder to hit
// (SIZE_DODGE a size step).
// the dodge left from speed against speed alone (no size): MISS_FLOOR between equals, all of it at twice
// as quick
export const quickDodge = (dodge, agi, attAgi) => {
  const share = agi > 0 ? agi / (agi + Math.max(0, attAgi || 0)) : 0;
  return Math.max(MISS_FLOOR, dodge * Math.max(0, Math.min(1, (share - 0.5) * 6)));
};
// cap: how high it may go against a bigger attacker (SIZE_DODGE_MAX unless said otherwise)
export const dodgeVs = (dodge, agi, size, attAgi, attSize, cap = SIZE_DODGE_MAX) => {
  const own = quickDodge(dodge, agi, attAgi);
  const steps = Math.max(0, SIZE_ORDER.indexOf(attSize || 'small') - SIZE_ORDER.indexOf(size || 'small'));
  return steps ? Math.min(cap, own + SIZE_DODGE * steps) : Math.min(DODGE_MAX, own);
};

// how much a wound bleeds when an attacker of attSize opens it on a target of size
export const bleedVs = (bleed, attSize, size) => {
  const steps = SIZE_ORDER.indexOf(attSize || 'small') - SIZE_ORDER.indexOf(size || 'small');
  return bleed * (steps >= 0 ? 1 + BLEED_BIGGER * steps : Math.max(BLEED_MIN, 1 + BLEED_SMALLER * steps));
};


// what one blow does before rounding, roll being the ±25% (0.75 to 1.25): 0 when the hide stops it
export function hitOf(att, def, roll) {
  // a crushing bite goes through part of the hide and the damage reduction
  const pierce = 1 - (att.crush || 0);
  // a sickle claw hits hard on prey no bigger than itself
  const cap = att.claw && SIZE_ORDER.indexOf(def.size || 'small') <= SIZE_ORDER.indexOf(att.size || 'small') ? Math.max(att.bite ?? 0, CLAW.bite) : att.bite;
  const landed = Math.min(cap ?? Infinity, att.damage * roll) * (1 - def.reduction * pierce) - (def.hide || 0) * pierce;
  return landed > 0 ? landed * sizeEdge(att, def) : 0;
}
const rounded = hit => hit > 0 ? Math.max(1, Math.round(hit)) : 0;

// how much harder (or softer) a blow lands for the size difference
export function sizeEdge(att, def) {
  const steps = SIZE_ORDER.indexOf(att.size || 'small') - SIZE_ORDER.indexOf(def.size || 'small');
  return Math.pow(1 + SIZE_EDGE, Math.sign(steps) * Math.abs(steps));
}

// younger ones near the nest are a size smaller, with thinner hide; full grown at the edge of the map
const youngSize = (size, dist, lair) => dist <= YOUNG_DIST && !lair ? SIZE_ORDER[Math.max(0, SIZE_ORDER.indexOf(size) - 1)] : size;
const youngHide = (hide, level) => Math.round(hide * Math.min(1, level / CREATURE_LEVEL(WORLD_RADIUS)));
const wildStats = (base, level) => Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.max(1, Math.round(v * level))]));

// a wild dinosaur of one of the game's species, at a distance from the nest, stronger in a lair
export function wildFighter(type, dist, lair = false) {
  const sp = SPECIES[type];
  const level = CREATURE_LEVEL(dist) * (lair ? LAIR_LEVEL : 1);
  const stats = wildStats(sp.base, level);
  const derived = deriveCombat(stats), size = youngSize(sp.size, dist, lair), young = size !== sp.size;
  const kg = KG[type] * (young ? MASS.young : 1);
  return {
    name: sp.species, ...derived, hp: Math.round(hpForMass(derived.hp, kg) * (sp.fragile || 1)), agi: stats.agi, str: stats.str, res: stats.res, power: Object.values(stats).reduce((t, v) => t + v, 0), level, type, kg,
    size, young, bite: biteForMass(sp.bite, kg, KG[type]), hide: youngHide(sp.hide, level), biped: !!sp.biped, role: sp.role, fear: sp.fear, hunts: sp.hunts || null, preyMax: sp.preyMax || null, charge: sp.charge || 0, fisher: sp.fisher || null, hook: !!sp.hook, armor: sp.armor || false, collar: !!sp.collar, crouch: !!sp.crouch, club: !!sp.club,
    grab: !!sp.grab, tough: !!sp.tough, claw: !!sp.claw, beak: !!sp.beak, spikes: !!sp.spikes, guard: !!sp.guard, throat: !!sp.throat, dome: !!sp.dome, giant: !!sp.giant, alert: !!sp.alert, escape: !!sp.escape, crack: !!sp.crack, camo: sp.camo || null, kick: sp.kick || 1, zigzag: !!sp.zigzag, crush: sp.crush || 0, boneBreaker: !!sp.boneBreaker, plated: sp.build === 'armored',
    ...(sp.frill ? { frill: FRILL.hp } : {}),
  };
}

// what waits in a hex (an entry of WILD) as the unit it fights as: one animal, or a pack or herd
// that grows from pack[0] next to the nest to pack[1] at the edge (the largest in a lair)
export function encounterUnit(entry, dist, lair = false) {
  if (entry.creature) {
    const f = creatureFighter(entry.creature, dist, lair);
    return unitOf(f.name, [f]);
  }
  const sp = SPECIES[entry.species];
  const n = !entry.pack ? 1 : lair ? entry.pack[1] : Math.round(entry.pack[0] + (entry.pack[1] - entry.pack[0]) * Math.max(0, dist - 1) / (WORLD_RADIUS - 1));
  const name = (lair ? 'Alpha ' : '') + (n > 1 ? `${sp.species} ${entry.herd ? 'herd' : 'pack'} (${n})` : sp.species);
  return unitOf(name, Array.from({ length: n }, () => wildFighter(entry.species, dist, lair)), n > 1);
}

// an animal that isn't a dinosaur (CREATURES), at a distance from the nest, stronger in a lair
export function creatureFighter(id, dist, lair = false) {
  const c = CREATURES[id];
  const level = CREATURE_LEVEL(dist) * (lair ? LAIR_LEVEL : 1);
  const stats = Object.fromEntries(Object.entries(c.stats).map(([k, v]) => [k, Math.max(1, Math.round(v * level))]));
  const power = Object.values(stats).reduce((t, v) => t + v, 0);
  const derived = deriveCombat(stats), size = youngSize(c.size, dist, lair), young = size !== c.size;
  const kg = KG[id] * (young ? MASS.young : 1);
  return { name: (lair ? 'Alpha ' : '') + c.name, ...derived, hp: hpForMass(derived.hp, kg), agi: stats.agi, str: stats.str, res: stats.res, power, level, size, young, kg,
    bite: biteForMass(c.bite ?? BITE[c.size], kg, KG[id]), hide: youngHide(c.hide ?? HIDE[c.size], level), role: 'attacker', fear: c.fear, hunts: c.hunts || null, preyMax: c.preyMax || null };
}

// log: [{ by: 'a' | 'b', miss } | { by, dmg, left }], left being the target's health after the blow
export function fight(a, b, rand) {
  const hp = { a: a.hp, b: b.hp };
  const side = { a, b };
  let turn = a.agi >= b.agi ? 'a' : 'b';
  const log = [];
  for (let i = 0; i < FIGHT_SAFETY && hp.a > 0 && hp.b > 0; i++) {
    const att = side[turn], other = turn === 'a' ? 'b' : 'a', def = side[other];
    if (rand() < dodgeVs(def.dodge, def.agi, def.size, att.agi, att.size)) log.push({ by: turn, miss: true });
    else {
      const dmg = rounded(hitOf(att, def, 0.75 + rand() * 0.5));
      hp[other] = Math.max(0, hp[other] - dmg);
      log.push({ by: turn, dmg, left: hp[other] });
    }
    turn = other;
  }
  const win = hp.b <= 0;
  return { win, log, hpA: hp.a, hpB: hp.b, maxA: a.hp, maxB: b.hp };
}

// share of fights the first side wins, from a fixed set of rolls so the answer does not flicker
export function winChance(a, b, runs = 120) {
  const rand = seededRand(`odds:${a.name}:${b.name}:${a.hp}:${b.hp}`);
  let wins = 0;
  for (let i = 0; i < runs; i++) if (fight(a, b, rand).win) wins++;
  return wins / runs;
}

// ---------- teams ----------
// An expedition's team fights what it meets together. A unit is one dinosaur, the player, or a pack:
// { name, pack, members: [fighter] }; the foe is a unit too (one animal, or a wild pack or herd).
// Before the fight, every unit facing a foe bigger than its fear flees; a team left with nobody
// who fights runs off altogether. Then every round each side acts in agility order. The foe strikes
// one standing unit (a random member of it), going for defenders more and noncombatants less
// (ROLE_TARGET). Each unit acts by its role: an attacker strikes a member of the foe; a defender
// charges or holds its ground, striking back at whatever attacks it; a noncombatant only strikes
// back when attacked, or through an opening when the foe goes for someone else. A blow never
// carries over to another member, so a pack loses at most one member per blow.
export const unitOf = (name, members, pack = false) => ({ name, pack, members });
const standing = hp => hp.flatMap((h, i) => h > 0 ? [i] : []);
const sizeRank = size => SIZE_ORDER.indexOf(size || 'small');
// a unit's role and the biggest of a unit
const roleOf = u => u.members[0].role || 'attacker';
export const biggest = u => u.members.reduce((b, m) => sizeRank(m.size) > sizeRank(b) ? m.size : b, u.members[0].size);
// Whether one animal (f) is afraid of another (g). A predator fears another predator only if it is
// bigger than itself, and a plant eater only if it is more than one size bigger (one size up it
// still takes on). A plant eater fears only predators, bigger than it stands up to (BODY fear). The
// player never runs, nor anything with no fear at all.
export const afraidOf = (f, g) => {
  if (!f.type || !f.fear) return false;
  const other = (g.role || 'attacker') === 'attacker';
  if ((f.role || 'attacker') === 'attacker') return sizeRank(g.size) > sizeRank(f.size) + (other ? 0 : 1);
  return other && !!f.fear && sizeRank(g.size) > sizeRank(f.fear);
};
// a unit that runs from this foe: afraid of its biggest
export const fears = (u, foe) => afraidOf(u.members[0], foe.members.reduce((a, m) => (sizeRank(m.size) > sizeRank(a.size) ? m : a)));
// The food chain: what a predator hunts (BODY hunts). An animal of a body plan in its diet, no bigger
// than it takes on (preyMax; a size less for a young one near the nest), that it can hurt at all;
// anything else it passes by.
const familyOf = m => (m.type && SPECIES[m.type] ? SPECIES[m.type].build : 'human');
export const isPrey = (pred, m) => {
  if (!pred.hunts || !(pred.hunts === 'any' || pred.hunts.includes(familyOf(m)) || (m.type && pred.hunts.includes(m.type)))) return false;
  const most = sizeRank(pred.preyMax || pred.size) - (pred.young ? 1 : 0);
  return sizeRank(m.size) <= most && !(m.plated && sizeRank(pred.size) <= sizeRank(ARMOR.ignores)) && hitOf(pred, m, 1.25) > 0;
};
const isPredator = foe => (foe.members[0].role || 'attacker') === 'attacker';
// which units flee before the fight: those afraid of it, and every noncombatant (prey animals: the
// urge to run wins out, trained or not); all of them when nobody left would fight, or, against a
// predator, when nobody left is prey to it (it goes after those who ran, or passes by)
// (defend: the team went for it, so it fights back whatever it would hunt)
export function whoFlees(units, foe, defend = false) {
  const fled = units.flatMap((u, i) => fears(u, foe) || roleOf(u) === 'noncombatant' ? [i] : []);
  const stay = units.flatMap((_, i) => fled.includes(i) ? [] : [i]);
  const hunted = i => defend || !isPredator(foe) || units[i].members.some(m => isPrey(foe.members[0], m));
  const nobody = !stay.some(i => roleOf(units[i]) !== 'noncombatant' && hunted(i));
  return { fled: nobody ? units.map((_, i) => i) : fled, escaped: nobody };
}

// how a unit dodges and how fast it is while these members stand; a pack gets better at working
// together the more of it stands
export function unitPower(u, hp = u.members.map(m => m.hp)) {
  const up = u.members.filter((_, i) => hp[i] > 0);
  if (!up.length) return { dodge: 0, agi: 0 };
  const extra = u.pack ? up.length - 1 : 0;
  const dodge = Math.min(0.75, up.reduce((t, m) => t + m.dodge, 0) / up.length * (1 + PACK_BONUS * extra));
  const agi = up.reduce((t, m) => t + m.agi, 0) / up.length;
  return { dodge, agi };
}

// one member's dodge, with its pack's bonus for each other one of it still standing
export const dodgeIn = (u, hp, m) => Math.min(0.75, u.members[m].dodge * (1 + PACK_BONUS * (u.pack ? standing(hp).length - 1 : 0)));
export const unitHp = u => u.members.reduce((t, m) => t + m.hp, 0);

// a fisher in the water or on land: its blows, and (Spinosaurus) its agility out of the water
function withRoles(u, water) {
  return { ...u, members: u.members.map(m => !m.fisher ? m : {
    ...m, damage: m.damage * (water ? m.fisher.water : m.fisher.land),
    ...(!water && m.fisher.landAgi ? { agi: m.agi * m.fisher.landAgi, dodge: m.dodge * m.fisher.landAgi } : {}),
  }) };
}

// log, by: a team unit's index or 'foe':
//   { by, member, miss } | { by, member, dmg, left, foeLeft }: a team blow on the foe's member
//     (left: that member's health, foeLeft: the whole foe's); charge: a defender's charge;
//     counter: striking back when attacked; opening: a noncombatant's blow while the foe is busy;
//   { by: 'foe', to, member, miss } | { by: 'foe', to, member, dmg, left }: the foe striking a unit;
//   { by, ally, member, dmg, left, clash? | frenzy? }: a rival or a frenzied one striking its own team.
//   A blow's part is one of PARTS ('head' | 'neck' | 'back' | 'belly', a biped's 'armL' | 'armR' |
//   'legL' | 'legR', a four-legged one's 'legFL' | 'legFR' | 'legHL' | 'legHR'; 'whole' for something swallowed
//   in one bite). A bone-breaking bite adds part, and lame or kill; a stomp that catches
//   more of a pack adds also: [{ member, dmg, left }]. A blow on a frill adds part: 'head', blocked
//   and frill (what is left of it); the goring back is a counter with gore: true;
//   { by: 'bleed', member, dmg, left, foeLeft }: a wounded foe bleeding at the start of its turn.
//   A Dilophosaurus' blow adds grab: 'cling' (on a bigger foe), 'kill' (a smaller one seized and
//   killed), 'hold' (one its size held: each of its turns then a blow with hold: true, until
//   { by: 'foe', to, broke: true }) or 'freed' (it wrenched free at once); clinging, each of its turns
//   is a slash (slash: true) or a fall
//   ({ by, member, fell: true, landed }), and a bad fall costs its next turn ({ by, recovering: true });
//   the foe's blows on it while it clings are { immune: true }; a deadly blow it shrugs off adds tough.
//   A Velociraptor's blow that latches on adds latch ('cling' | 'pin'); then each of its turns is
//   { by, member, dmg, left, foeLeft, latched } until { by: 'foe', to, member, shake: true, mode };
//   a foe whose every member is pinned loses its turn: { by: 'foe', pinned: true }.
//   A Protoceratops' counter that clamps on adds beak ('hold' on one its size, 'pin' on a smaller one);
//   then each of its turns is { by, member, dmg, left, foeLeft, gripped } until it lets go:
//   { by: 'foe', to, member, loose: true }. One its size held strikes only its head (part: 'head').
//   Armor adds part and armored; a blow on the plated back is followed by
//   { by, member, dmg, left, foeLeft, thorns: true }; a club that breaks a shin adds lame and club.
//   A Stegosaurus' tail adds spiked to its counters and charges (impaled with lame when it goes
//   through a leg); a blow it turns aside is { ..., dmg: 0, guarded: true }, answered at once by a
//   counter with guard: true; a blow on its covered throat adds throat.
//   A Pachycephalosaurus' charge lands on the flank and may add knocked, with rose when the one knocked
//   down got straight back up on its own agility (otherwise it loses its next action:
//   { by, recovering: true } for a lone one); a blow its dome shrugs off adds dome (dmg 0).
//   A giant's blow back adds stomp (a kill when it lands on anything short of colossal: stomped) or
//   swipe (its tail).
//   A blow that would have brought down a Parasaurolophus may add escaped: it ran (left 0 for the fight;
//   one of ours comes home with 1).
//   { by, crouch: true } | { by: 'foe', crouch: true }: an armored one hunkers down before a bigger
//   predator (it stays down, its belly and legs out of reach, while one is there);
//   { by: 'foe', fled: true }: a wild predator badly hurt got away (foeFled; a win with no carcass), or
//   { by: 'foe', caught: true }: it tried and was caught, losing its turn; { by: 'foe', fled: true,
//   gaveUp: true }: it gave up on hunkered-down armor it couldn't hurt and had nobody else to go for
//   (GIVE_UP); { by: 'foe', turned: true }: it gave up on them and turned on the rest of the group.
//   { by, alert: true } | { by: 'foe', alert: true }: a Parasaurolophus' call warned its side of a
//   predator (alerted: 'team' | 'foe'): readied, it acts first. teamHps: our members' full health for
//   the fight (a readied team has a little more).
//   { by, rout: true } | { by: 'foe', rout: true }: a pack or herd that lost half its members runs off
//   (the foe's running off is a win).
// fled: the units that ran before the fight (escaped: everyone did, so there was none); routed: the
// units that ran off mid-fight; hp: every
// member's health at the end, per unit; foeHps: the foe's members'; frenzy: the frenzied units.
// opts.swamp / opts.biome: where the fight is (fishers fight better in the water, WATER_BIOMES).
// opts.guard: the foe guards its nest: it never runs, breaks away, gives up or routs.
export function teamFight(units, foe, rand, opts = {}) {
  if (!foe.members) foe = unitOf(foe.name, [foe]);
  const water = !!opts.swamp || WATER_BIOMES.includes(opts.biome);
  units = units.map(u => withRoles(u, water));
  foe = withRoles(foe, water);
  // an alarm call (Parasaurolophus): a side with one that meets a predator is warned and readied
  // (more of them notice more often and call louder)
  const caller = list => list.findIndex(u => u.members.some(m => m.alert));
  const callers = list => list.reduce((n, u) => n + u.members.filter(m => m.alert).length, 0);
  const preys = list => list.some(u => (u.members[0].role || 'attacker') === 'attacker');
  const hears = list => rand() < Math.min(1, ALERT.chance + ALERT.perEye * (callers(list) - 1));
  const alerted = caller(units) >= 0 && preys([foe]) && hears(units) ? 'team' : caller([foe]) >= 0 && preys(units) && hears([foe]) ? 'foe' : null;
  const bonus = 1 + Math.min(ALERT.maxBonus, ALERT.bonus + ALERT.perCall * (callers(alerted === 'foe' ? [foe] : units) - 1));
  const readied = u => ({ ...u, members: u.members.map(m => ({
    ...m, hp: Math.round(m.hp * bonus), damage: m.damage * bonus, agi: m.agi * bonus, str: m.str * bonus,
    res: m.res * bonus, dodge: Math.min(DODGE_MAX, m.dodge * bonus), reduction: m.reduction * bonus })) });
  if (alerted === 'team') units = units.map(readied);
  if (alerted === 'foe') foe = readied(foe);
  const { fled, escaped } = whoFlees(units, foe, !!opts.defend);
  // The two sides follow the same rules: side 0 is the team (its units), side 1 the foe (one unit). A
  // unit is (side, index), one of its animals (side, index, member).
  const S = [units, [foe]];
  // (opts.hp: how much of its health each of ours starts with, a share per unit and member: a team
  // carries its wounds from one fight to the next on a journey)
  const start = (i, j) => opts.hp && opts.hp[i] && opts.hp[i][j] != null ? Math.max(1, Math.round(S[0][i].members[j].hp * Math.min(1, opts.hp[i][j]))) : S[0][i].members[j].hp;
  const hp = S.map((list, s) => list.map((u, i) => u.members.map((m, j) => s === 0 ? start(i, j) : m.hp)));
  const foeLeft = () => hp[1][0].reduce((t, h) => t + h, 0);
  const foeMax = unitHp(foe);
  // the units still fighting on each side; those who stayed to fight; ours that ran off mid-fight
  const active = [units.flatMap((_, i) => fled.includes(i) ? [] : [i]), [0]];
  const stayed = [...active[0]];
  const routed = [];
  let foeRouted = false, foeFled = false, foeWent = false;
  const log = [];
  const frenzy = new Set();
  // our members lamed by a bone-breaking bite or a club: [unit, member]
  const lamed = [];
  const K = (s, u) => s + ':' + u;
  const E = (s, u, m) => s + ':' + u + ':' + m;
  const alive = (s, u) => standing(hp[s][u]);
  const up = s => active[s].some(u => alive(s, u).length);
  const over = () => !up(0) || !up(1);
  // a contest of one value against another: a / (a + b) to win
  const contest = (a, b) => rand() < a / (a + b);
  // A log entry for what side s's unit u (its member at, in a pack) does to the other side's unit v,
  // member m: by the team { by: u, member, ..., foeLeft }, by the foe { by: 'foe', to: v, member, ... }.
  const entry = (s, u, at, v, m, fields) => s === 0
    ? { by: u, ...(S[0][u].pack && at != null ? { at } : {}), member: m, ...fields, ...('left' in fields ? { foeLeft: foeLeft() } : {}) }
    : { by: 'foe', ...(S[1][u].pack && at != null ? { at } : {}), to: v, member: m, ...fields };
  const selfEntry = (s, u, fields) => s === 0 ? { by: u, ...fields } : { by: 'foe', ...fields };
  // every animal's frill (null: none), bleeding (a share of its health a turn) and wounds
  const frill = S.map(list => list.map(u => u.members.map(m => m.frill ?? null)));
  const bleeding = new Map(), gores = new Map(), clawWounds = new Map(), spikeWounds = new Map(), hookWounds = new Map(), slashed = new Set(), toughUsed = new Set();
  const bleed = (s, u, m, rate) => bleeding.set(E(s, u, m), (bleeding.get(E(s, u, m)) || 0) + rate);
  // Holds, by the unit holding (K): Dilophosaurus clinging to a bigger one or holding one its size,
  // Velociraptors latched on (one at a time in a pack), Protoceratops clamped on with its beak. Each
  // { s, u, at: its member, t, v, m: the one held, ... }.
  const clinging = new Map(), holding = new Map(), latches = new Map(), beaks = new Map();
  // the one each predator unit has singled out: { v, m }
  const focus = new Map();
  // units that lost their footing (they miss their next turn), and defenders out of their guard
  const exposed = new Set();
  // Animals knocked down (a butt to the flank, a fall): on its own agility (RISE) it gets straight back
  // up; otherwise it loses its next action. Returns whether it rose.
  const knocked = new Set();
  // animals that broke away and ran instead of going down: out of the fight, home with a little health
  const brokeAway = new Set();
  // our members killed outright by a deadly blow (a bite that swallows, a neck, a stomp, a club, a grip)
  const slain = [];
  // armored ones hunkered down before a bigger predator, till their next turn (CROUCH in config.js)
  const crouched = new Set();
  // the blows of the turn being played on hunkered-down armor: damage, the biggest health among them,
  // and whether any went on something that wasn't hunkered down; and each wild predator's frustrated turns
  let turnHits = { dmg: 0, hp: 0, open: false };
  const frustrated = new Map();
  // the hunkered-down ones each wild predator gave up on: it goes for anyone else first
  const ignored = new Map();
  // a wild predator never goes for what isn't prey to it (out of its food chain), unless the team went
  // for it (opts.defend)
  if (isPredator(foe) && !opts.defend) {
    const out = new Set();
    units.forEach((u, v) => u.members.forEach((m, j) => { if (!isPrey(foe.members[0], m)) out.add(E(0, v, j)); }));
    if (out.size) ignored.set(0, out);
  }
  // how firmly it stands against being knocked down: four feet on the ground hold better than two
  const footing = f => f.str * (f.biped ? 1 : STANCE.stable);
  const knockDown = (t, v, m) => {
    if (S[t][v].members[m].giant || rand() < Math.min(RISE.max, S[t][v].members[m].agi / 100)) return true;
    knocked.add(E(t, v, m));
    return false;
  };
  const holderUp = h => hp[h.s][h.u][h.at] > 0;
  const heldBy = (map, t, v, m) => [...map.values()].find(h => h.t === t && h.v === v && h.m === m && holderUp(h));
  // pinned under a claw or in a beak, it can't strike or dodge
  const pinned = (t, v, m) => [...latches.values()].some(l => l.t === t && l.v === v && l.m === m && l.mode === 'pin' && holderUp(l))
    || [...beaks.values()].some(b => b.t === t && b.v === v && b.m === m && b.small && holderUp(b));
  // the enemy members each blow of a unit's own turn went for, and which of them may strike back:
  // E(t, v, m) -> { at: the member that struck it, counter }
  const struck = new Map();
  let recording = false;

  // A bone-breaking bite (a unit led by a boneBreaker) lands on a body part: a leg may be lamed, a
  // neck no bigger than neckMax is killed outright, something small doesn't survive the jaws at all.
  // part: where the blow landed when the target's armor already decided it.
  const lameMember = (t, v, m) => {
    const hit = S[t][v].members[m];
    S[t][v].members[m] = { ...hit, lame: true, dodge: hit.dodge * BONE_BREAKER.lameCut, agi: hit.agi * BONE_BREAKER.lameCut };
    if (t === 0) lamed.push([v, m]);
  };
  // where a blow lands on this body: 'limbs' in a list becomes one of its legs, or a biped's arm
  const legOf = f => { const legs = f.biped ? BIPED_LEGS : QUAD_LEGS; return legs[Math.floor(rand() * legs.length)]; };
  const limbOf = f => f.biped && rand() < LIMBS.arm ? ARMS[Math.floor(rand() * ARMS.length)] : legOf(f);
  // (a hunkered-down one shows neither belly nor legs)
  const rollPart = (list, f, low = false) => {
    const open = low ? list.filter(([p]) => p !== 'belly' && p !== 'limbs') : list;
    let x = rand() * open.reduce((t, [, w]) => t + w, 0);
    const p = (open.find(([, w]) => (x -= w) < 0) || open[0])[0];
    return p === 'limbs' ? limbOf(f) : p;
  };
  // an arm broken: that hand can't grab any more; ours come home injured
  const breakArm = (t, v, m) => {
    S[t][v].members[m] = { ...S[t][v].members[m], armBroken: true, grab: false };
    if (t === 0) lamed.push([v, m]);
  };
  const breakBones = (s, u, t, v, m, part = null) => {
    if (!S[s][u].members[0].boneBreaker) return part ? { part } : {};
    const hit = S[t][v].members[m];
    // something this small is swallowed whole, whatever the bite already did
    if (sizeRank(hit.size) <= sizeRank(BONE_BREAKER.oneBite)) { hp[t][v][m] = 0; return { part: 'whole', kill: true }; }
    if (hp[t][v][m] <= 0) return part ? { part } : {};
    if (!part) part = rollPart(BONE_BREAKER.parts, hit);
    if (part === 'neck' && sizeRank(hit.size) <= sizeRank(BONE_BREAKER.neckMax) && !hit.throat && !hit.collar) { hp[t][v][m] = 0; return { part, kill: true }; }
    if (isLeg(part) && !hit.lame && !(hit.giant && sizeRank(S[s][u].members[0].size) < sizeRank(hit.size)) && rand() < BONE_BREAKER.lame) { lameMember(t, v, m); return { part, lame: true }; }
    if (isArm(part) && !hit.armBroken && rand() < BONE_BREAKER.lame) { breakArm(t, v, m); return { part, armBroken: true }; }
    return { part };
  };
  // A blow from something much bigger than a pack's members catches more of them at once (a stomp,
  // a swipe of the tail): one more for every size step past the first. hit(m) is its damage on m.
  const sweep = (att, target, thp, first, hit) => {
    if (!target.pack) return [];
    const more = sizeRank(att.size) - sizeRank(target.members[first].size) - 1;
    const others = standing(thp).filter(m => m !== first).slice(0, Math.max(0, more));
    return others.map(m => { const dmg = hit(m); thp[m] = Math.max(0, thp[m] - dmg); return { member: m, dmg, left: thp[m] }; });
  };
  // a slash from grasping hands leaves one bleeding wound, however long it holds on
  const slashWound = (s, u, t, v, m) => {
    if (m < 0 || hp[t][v][m] <= 0 || slashed.has(E(t, v, m))) return;
    slashed.add(E(t, v, m));
    bleed(t, v, m, bleedVs(GRAB.bleed, biggest(S[s][u]), S[t][v].members[m].size));
  };

  // One blow of side s's unit u, member at, on the other side's unit v, member m: with its own
  // agility, size, weapon and strength, against that one's dodge, frill, armor and body; and what its
  // abilities do when it lands. o.buff: its pack's bonus; o.part: where it must land (the head).
  // extra.slash / extra.hold: a clinging or holding Dilophosaurus' blow, which can't be dodged.
  // Returns the member it went for, or -1 when it missed or couldn't touch it.
  const blow = (s, u, at, v, m, roll, boost = 1, extra = {}, o = {}) => {
    const t = 1 - s, key = K(s, u), att = S[s][u].members[at], target = S[t][v], prey = target.members[m];
    // one of ours that goes for it (an attacker, not a defender charging or striking back) is fought
    // back, prey or not
    if (s === 0 && roleOf(S[0][u]) === 'attacker' && ignored.has(v)) ignored.get(v).delete(E(0, u, at));
    const held = extra.slash || extra.hold;
    // held in a beak by one its size, it can only reach the head of the one holding it
    const gripped = heldBy(beaks, s, u, at);
    if (gripped && !gripped.small && gripped.u === v && gripped.at === m) o = { ...o, part: 'head' };
    if (recording) struck.set(E(t, v, m), { at, counter: true });
    // clinging to the attacker's body, out of its reach
    const c = clinging.get(K(t, v)), l = latches.get(K(t, v));
    if ((c && c.t === s && c.v === u && holderUp(c)) || (l && l.mode === 'cling' && l.at === m && l.t === s && l.v === u)) {
      log.push(entry(s, u, at, v, m, { dmg: 0, left: hp[t][v][m], immune: true, ...extra }));
      if (recording) struck.delete(E(t, v, m));
      return -1;
    }
    // a giant strikes back with a stomp or its tail; a stomp comes down right only a flat few times in a
    // hundred, fewer on something quicker, and even then the target may still dodge it
    const stomp = att.giant && (extra.counter || extra.charge) && rand() < GIANT.stomp;
    const swipe = att.giant && (extra.counter || extra.charge) && !stomp;
    const lead = Math.max(0, Math.min(1, 2 * prey.agi / (prey.agi + att.agi) - 1));
    if (stomp && rand() >= GIANT.hit[1] - (GIANT.hit[1] - GIANT.hit[0]) * lead) {
      log.push(entry(s, u, at, v, m, { miss: true, stomp: true, ...extra }));
      return -1;
    }
    // a pinned or held one can't dodge; a spiked or giant's tail swings slow, and the quicker one sees
    // it coming
    const slowSwing = (extra.counter || extra.charge) && (att.spikes ? SPIKES.slow : swipe ? GIANT.slow : 0);
    const tail = slowSwing ? slowSwing * lead : 0;
    // a giant hardly finds anything far smaller than itself
    const cap = att.giant && sizeRank(att.size) - sizeRank(prey.size) >= GIANT.tinyStep ? GIANT.tinyDodge : SIZE_DODGE_MAX;
    // a zigzag runner (Hypsilophodon) is harder still to catch for anything bigger
    const zig = prey.zigzag ? ZIGZAG.perStep * Math.max(0, sizeRank(att.size) - sizeRank(prey.size)) : 0;
    if (!held && !pinned(t, v, m) && rand() < Math.min(cap, dodgeVs(dodgeIn(target, hp[t][v], m), prey.agi, prey.size, att.agi, att.size, cap) + tail + zig)) {
      log.push(entry(s, u, at, v, m, { miss: true, ...extra }));
      return -1;
    }
    // a fighting stance (Stegosaurus): the blow is turned aside and answered at once with the tail
    if (!held && prey.guard && !extra.guard && rand() < quickDodge(dodgeIn(target, hp[t][v], m), prey.agi, att.agi)) {
      log.push(entry(s, u, at, v, m, { dmg: 0, left: hp[t][v][m], guarded: true, ...extra }));
      if (recording) struck.set(E(t, v, m), { at, counter: false });
      if (hp[s][u][at] > 0) {
        const was = recording;
        recording = false;
        blow(t, v, m, u, at, 0.75 + rand() * 0.5, 1, { counter: true, guard: true });
        recording = was;
      }
      return -1;
    }
    // a defender caught out of its guard by its own charge takes more
    const open = exposed.delete(K(t, v)) ? CHARGE_EXPOSED : 1;
    // a blow on a frilled head: the frill takes it and the horns strike back, or a broken frill lets
    // half of it through
    let head = 1, onHead = o.part === 'head';
    if (!held && frill[t][v][m] !== null && (onHead || rand() < (S[s][u].pack ? FRILL.headPack : FRILL.head))) {
      onHead = true;
      if (frill[t][v][m] > 0) {
        frill[t][v][m] = Math.max(0, frill[t][v][m] - (att.crush ? FRILL.crushed : 1));
        log.push(entry(s, u, at, v, m, { dmg: 0, left: hp[t][v][m], part: 'head', blocked: true, frill: frill[t][v][m], ...extra }));
        if (recording) struck.set(E(t, v, m), { at, counter: false });
        if (hp[s][u][at] > 0) {
          const was = recording;
          recording = false;
          const gored = blow(t, v, m, u, at, roll, 1, { counter: true, gore: true });
          recording = was;
          const wounds = gores.get(E(s, u, at)) || 0;
          if (gored >= 0 && hp[s][u][at] > 0 && wounds < FRILL.maxBleed) { gores.set(E(s, u, at), wounds + 1); bleed(s, u, at, bleedVs(FRILL.bleed, prey.size, att.size)); }
        }
        return -1;
      }
      head = FRILL.broken;
    }
    // a giant's neck is out of reach of anything smaller
    const below = prey.giant && sizeRank(att.size) < sizeRank(prey.size);
    // a sickle claw driven into the neck from below goes through any armor
    const neck = att.claw && !held && !o.part && !below && rand() < CLAW.neck;
    // armor: the part the blow lands on decides how much gets through
    // hunkered down, only its armored top shows
    const low = crouched.has(E(t, v, m));
    let part = neck ? 'neck' : o.part || null, cut = 1;
    const plates = prey.armor && ARMOR[prey.armor];
    if (plates && !neck) {
      if (!part) part = rollPart(ARMOR.parts, prey, low);
      cut = plates.armored.includes(part) ? 1 - plates.cut : part === 'belly' ? ARMOR.belly : 1;
    }
    // a dome's charge butts the flank; on a domed head the part matters wherever the blow lands
    const butt = att.dome && extra.charge && !held;
    // a domed head goes for the flank, not the front, whatever the blow
    if (att.dome && !held && !part) part = rand() < DOME.back ? 'back' : 'belly';
    if (!part && !onHead && prey.dome) part = rollPart(HIT_PARTS, prey, low);
    // a bone-breaking bite picks its part before it lands (a covered throat can take some of it)
    if (!part && !onHead && S[s][u].members[0].boneBreaker && sizeRank(prey.size) > sizeRank(BONE_BREAKER.oneBite)) part = rollPart(BONE_BREAKER.parts, prey, low);
    if (below && part === 'neck') part = rollPart(HIT_PARTS.filter(([p]) => p !== 'neck'), prey);
    // a throat covered in small bones: nothing from something smaller, half from one its size, a
    // little less from anything bigger
    const step = sizeRank(att.size) - sizeRank(prey.size);
    const throat = part === 'neck' && prey.throat ? (step < 0 ? 0 : step === 0 ? THROAT.same : THROAT.bigger) : 1;
    // a domed head takes little from anything no bigger than itself
    const domed = (part === 'head' || onHead) && prey.dome && step <= 0;
    // a tail club swung (a counter or a charge) lands harder than a bite; a spiked tail pierces
    const swung = att.club && (extra.counter || extra.charge);
    const spiked = att.spikes && (extra.counter || extra.charge);
    // a thumb claw that hooks: it goes through hide and leaves a bleeding wound
    const hooked = att.hook && !held && rand() < HOOK.chance;
    const buff = o.buff || 1;
    const weapon = neck ? { ...att, crush: 1 } : spiked ? { ...att, crush: Math.max(att.crush || 0, SPIKES.pierce) } : hooked ? { ...att, crush: Math.max(att.crush || 0, HOOK.pierce) } : att;
    // a long-legged kick back lands harder (Gallimimus)
    const kick = extra.counter && att.kick > 1 ? att.kick : 1;
    // armor (plates, scutes) is beyond anything small or tiny: its teeth and claws do nothing
    const shrug = prey.plated && sizeRank(att.size) <= sizeRank(ARMOR.ignores);
    const raw = shrug ? 0 : hitOf(weapon, prey, roll) * buff * boost * kick * (swung ? CLUB.damage : 1) * (swipe ? GIANT.tail : 1) * open * head * throat * (domed ? DOME.head : 1);
    const dmg = rounded(raw * cut);
    hp[t][v][m] = Math.max(0, hp[t][v][m] - dmg);
    // what this turn's blows did to hunkered-down armor (a frustrated predator gives up)
    if (recording) { if (low || shrug) { turnHits.dmg += dmg; turnHits.hp = Math.max(turnHits.hp, prey.hp); } else turnHits.open = true; }
    let bone = neck ? { part: 'neck' } : dmg > 0 && !onHead ? breakBones(s, u, t, v, m, part) : onHead ? { part: 'head' } : part ? { part } : {};
    if (plates && !neck && plates.armored.includes(part)) bone.armored = true;
    if (throat < 1) bone.throat = true;
    if (shrug) bone.shrugged = true;
    if (domed) bone = { part: 'head', dome: true };
    // a predator's bite that lands on something a fraction of its weight kills it outright
    if (dmg > 0 && hp[t][v][m] > 0 && att.type && (att.role || 'attacker') === 'attacker' && att.kg && prey.kg && prey.kg <= att.kg * MASS.oneBite) { hp[t][v][m] = 0; bone = { ...bone, kill: true }; }
    // a giant's stomp crushes anything short of colossal
    if (stomp && hp[t][v][m] > 0 && sizeRank(prey.size) < sizeRank('colossal')) { hp[t][v][m] = 0; bone = { part: 'whole', kill: true, stomped: true }; }
    // butted in the flank, it may go down and lose its next action (never a giant)
    if (butt && !prey.giant && dmg > 0 && hp[t][v][m] > 0 && step >= -DOME.maxStep && contest(att.str, footing(prey))) bone = { ...bone, knocked: true, rose: knockDown(t, v, m) };
    if (hooked && dmg > 0 && hp[t][v][m] > 0) {
      const wounds = hookWounds.get(E(t, v, m)) || 0;
      if (wounds < HOOK.maxBleed) { hookWounds.set(E(t, v, m), wounds + 1); bleed(t, v, m, bleedVs(HOOK.bleed, att.size, prey.size)); }
    }
    // the spikes leave a wound that bleeds, and may go through a leg
    if (spiked && dmg > 0 && hp[t][v][m] > 0) {
      const wounds = spikeWounds.get(E(t, v, m)) || 0;
      if (wounds < SPIKES.maxBleed) { spikeWounds.set(E(t, v, m), wounds + 1); bleed(t, v, m, bleedVs(SPIKES.bleed, att.size, prey.size)); }
      if (!prey.lame && !below && !bone.kill && rand() < SPIKES.impale + SPIKES.bonus * att.str / (att.str + prey.res)) { lameMember(t, v, m); bone = { ...bone, part: legOf(prey), lame: true, impaled: true }; }
    }
    // a tail club that lands on something small kills it outright; otherwise it may break the shin
    if (swung && hp[t][v][m] > 0 && sizeRank(prey.size) <= sizeRank(CLUB.crushes)) { hp[t][v][m] = 0; bone = { part: 'whole', kill: true, club: true }; }
    else if (dmg > 0 && swung && hp[t][v][m] > 0 && !prey.lame && !below && rand() < CLUB.lame + CLUB.bonus * att.str / (att.str + prey.res)) {
      lameMember(t, v, m);
      bone = { part: legOf(prey), lame: true, club: true };
    }
    let toughRan = false;
    // tough: once a fight it stays standing after a deadly blow from something no bigger than itself
    if (hp[t][v][m] <= 0 && prey.tough && !toughUsed.has(E(t, v, m)) && sizeRank(att.size) <= sizeRank(prey.size)) {
      hp[t][v][m] = 1;
      toughUsed.add(E(t, v, m));
      bone.tough = true;
      // a wild one gets that one more chance to run, there and then (its health doesn't hold it back)
      if (t === 1 && roleOf(S[t][v]) === 'attacker' && !opts.guard) {
        const speed = prey.agi + prey.res;
        const chasers = active[s].some(x => roleOf(S[s][x]) === 'attacker' && alive(s, x).length);
        if (!chasers || rand() < Math.min(0.95, speed / (speed + FLIGHT.base))) toughRan = true;
      }
    }
    // grasping hands (Dilophosaurus) on one with no armor on its body: a bigger one it may climb on to
    // (agility against agility); one its size or smaller it may seize (agility and strength against
    // agility and strength), and a smaller one, or one its size that can't wrench free (strength
    // against strength), dies in its grip
    let grab = {};
    if (dmg > 0 && att.grab && !held && hp[t][v][m] > 0 && !prey.plated && !clinging.has(key) && !holding.has(key) && rand() < GRAB.tries) {
      const step = sizeRank(prey.size) - sizeRank(att.size);
      if (step > 0) {
        if (contest(att.agi, prey.agi)) { clinging.set(key, { s, u, at, t, v, m }); grab = { grab: 'cling' }; }
      } else if (contest(att.agi + att.str, prey.agi + prey.str)) {
        if (step < 0) { hp[t][v][m] = 0; grab = { grab: 'kill' }; }
        else if (contest(att.str, prey.str)) { holding.set(key, { s, u, at, t, v, m }); grab = { grab: 'hold' }; }
        else grab = { grab: 'freed' };
      }
    }
    // a sickle claw may latch on: clinging to a bigger one (agility against agility), pinning one its
    // size or smaller (agility and strength against agility and strength)
    if (dmg > 0 && att.claw && !latches.has(key) && hp[t][v][m] > 0 && !prey.plated && rand() < LATCH.tries) {
      const mode = sizeRank(prey.size) > sizeRank(att.size) ? 'cling' : 'pin';
      if (mode === 'cling' ? contest(att.agi, prey.agi) : contest(att.agi + att.str, prey.agi + prey.str)) {
        latches.set(key, { s, u, at, t, v, m, mode });
        grab = { ...grab, latch: mode };
      }
    }
    // a nut-cracking beak striking back may break a small foe's limb
    if (dmg > 0 && att.crack && extra.counter && hp[t][v][m] > 0 && sizeRank(prey.size) <= sizeRank(att.size) && rand() < CRACK.chance) {
      const limb = limbOf(prey);
      if (isArm(limb) && !prey.armBroken) { breakArm(t, v, m); bone = { ...bone, part: limb, armBroken: true, cracked: true }; }
      else if (isLeg(limb) && !prey.lame) { lameMember(t, v, m); bone = { ...bone, part: limb, lame: true, cracked: true }; }
    }
    // a hooked beak striking back may clamp on to something no bigger than itself
    if (dmg > 0 && att.beak && extra.counter && !beaks.has(key) && !heldBy(beaks, t, v, m) && hp[t][v][m] > 0
      && sizeRank(prey.size) <= sizeRank(att.size) && contest(att.agi, prey.agi)) {
      const small = sizeRank(prey.size) < sizeRank(att.size);
      beaks.set(key, { s, u, at, t, v, m, small, hpAt: hp[s][u][at] });
      grab = { ...grab, beak: small ? 'pin' : 'hold' };
    }
    // brought down, it may break away and run instead (out of the fight, hurt but not critically), and
    // its herd runs with it
    let herdRuns = false;
    if (hp[t][v][m] <= 0 && prey.escape && !(t === 1 && opts.guard) && !pinned(t, v, m) && !heldBy(holding, t, v, m) && rand() < Math.min(ESCAPE.max, prey.agi / 100)) {
      brokeAway.add(E(t, v, m));
      bone = { ...bone, escaped: true };
      herdRuns = true;
    }
    // a giant's stomp and tail find one target
    const also = att.giant ? [] : sweep(att, target, hp[t][v], m, x => rounded(hitOf(att, target.members[x], roll) * buff * boost * open));
    log.push(entry(s, u, at, v, m, { dmg, left: hp[t][v][m], ...bone, ...grab, ...(spiked ? { spiked: true } : {}), ...(hooked && dmg > 0 ? { hooked: true } : {}), ...(butt ? { butt: true } : {}), ...(swipe ? { swipe: true } : {}), ...(stomp ? { stomp: true } : {}), ...(also.length ? { also } : {}), ...extra }));
    if (herdRuns && S[t][v].pack && alive(t, v).length && active[t].includes(v)) runOff(t, v);
    // saved by its toughness, a wild one ran for it
    if (toughRan && active[t].includes(v)) runOff(t, v, { fled: true });
    // ours killed outright (not just brought down)
    if (t === 0 && hp[t][v][m] <= 0 && (bone.kill || grab.grab === 'kill') && !slain.some(([a, b]) => a === v && b === m)) slain.push([v, m]);
    // the plates hurt whatever bit them
    if (plates && plates.thornsOn.includes(part) && raw > 0 && hp[s][u][at] > 0) {
      const back = Math.max(1, Math.round(raw * plates.thorns));
      hp[s][u][at] = Math.max(0, hp[s][u][at] - back);
      log.push(entry(t, v, m, u, at, { dmg: back, left: hp[s][u][at], thorns: true }));
    }
    return m;
  };

  // A unit's blows: every standing, free member of it at once (o.skip: one busy with something else,
  // o.only: just that one), each going for the enemy units by ROLE_TARGET (o.to: only that one, at
  // its member o.target when it can) on a member that still has room for it (REACH_SLOTS by size);
  // one held in a beak by one its size can only strike the head of the one holding it. A pack's
  // blows land PACK_BONUS harder for every other one striking with it.
  const attack = (s, u, boost, extra = {}, o = {}) => {
    const t = 1 - s, room = new Map();
    const roomOf = (v, m) => room.get(E(t, v, m)) ?? (REACH_SLOTS[S[t][v].members[m].size] || 4);
    const blows = [];
    let free = 0;
    for (const at of alive(s, u)) {
      if (at === o.skip || (o.only !== undefined && at !== o.only) || pinned(s, u, at)) continue;
      // knocked down: it gets up instead
      if (knocked.delete(E(s, u, at))) continue;
      free++;
      const bk = heldBy(beaks, s, u, at);
      let v, m, part;
      if (bk && !bk.small) {
        if (o.to !== undefined && bk.u !== o.to) continue;
        v = bk.u; m = bk.at; part = 'head';
      } else {
        // a predator that gave up on some hunkered-down ones goes for the others
        const ign = ignored.get(u) || new Set();
        const open = (x, y) => roomOf(x, y) > 0 && !(s === 1 && ign.has(E(t, x, y)));
        const anyOpen = (o.to !== undefined ? [o.to] : active[t]).some(x => active[t].includes(x) && alive(t, x).some(y => open(x, y)));
        const usable = (x, y) => anyOpen ? open(x, y) : roomOf(x, y) > 0 && !(s === 1 && ign.has(E(t, x, y)));
        const targets = (o.to !== undefined ? [o.to] : active[t]).filter(x => active[t].includes(x) && alive(t, x).some(y => usable(x, y)));
        if (!targets.length) continue;
        // camouflaged in this biome, it is hard to pick out
        // a predator singles one out and keeps at it till it is down (or out of reach): each one of a
        // pack its own
        const fx = roleOf(S[s][u]) === 'attacker' && o.target === undefined ? focus.get(`${K(s, u)}:${at}`) : null;
        if (fx && targets.includes(fx.v) && hp[t][fx.v][fx.m] > 0 && usable(fx.v, fx.m)) { v = fx.v; m = fx.m; }
        else {
          const weights = targets.map(x => ROLE_TARGET[roleOf(S[t][x])] * (opts.biome && S[t][x].members.every(f => f.camo === opts.biome) ? CAMO.target : 1));
          let pick = rand() * weights.reduce((a, w) => a + w, 0);
          v = targets[targets.length - 1];
          for (let k = 0; k < targets.length; k++) { pick -= weights[k]; if (pick < 0) { v = targets[k]; break; } }
          const free = alive(t, v).filter(y => usable(v, y));
          m = o.target !== undefined && v === o.to && hp[t][v][o.target] > 0 ? o.target : free[Math.floor(rand() * free.length)];
          if (roleOf(S[s][u]) === 'attacker' && o.target === undefined && !(fx && targets.includes(fx.v) && hp[t][fx.v][fx.m] > 0)) focus.set(`${K(s, u)}:${at}`, { v, m });
        }
      }
      room.set(E(t, v, m), roomOf(v, m) - 1);
      blows.push({ at, v, m, part });
    }
    // pinned, every one of it: it loses its turn
    if (!free && o.only === undefined && alive(s, u).some(at => at !== o.skip)) { log.push(selfEntry(s, u, { pinned: true })); return; }
    const buff = S[s][u].pack ? 1 + PACK_BONUS * Math.max(0, blows.length - 1) : 1;
    for (const b of blows) {
      if (over() || hp[s][u][b.at] <= 0 || !active[t].includes(b.v)) continue;
      // one already brought down this turn: it goes for another of the same unit
      let m = b.m;
      if (hp[t][b.v][m] <= 0) { const left = alive(t, b.v); if (!left.length || b.part) continue; m = left[Math.floor(rand() * left.length)]; }
      blow(s, u, b.at, b.v, m, 0.75 + rand() * 0.5, boost, extra, { buff, part: b.part });
    }
  };

  // after a unit's own turn: each defender or noncombatant it went for strikes back at it (the
  // members it went for, at the one that struck each), and every other noncombatant on that side may
  // land a blow through the opening
  const counters = (s, u) => {
    const t = 1 - s, back = new Map();
    for (const [e, x] of struck) {
      if (!x.counter) continue;
      const [, v, m] = e.split(':').map(Number);
      back.set(v, [...(back.get(v) || []), { m, at: x.at }]);
    }
    struck.clear();
    for (const [v, list] of back) {
      if (!active[t].includes(v) || roleOf(S[t][v]) === 'attacker') continue;
      for (const { m, at } of list) {
        if (over() || hp[t][v][m] <= 0 || !alive(s, u).length || crouched.has(E(t, v, m))) continue;
        attack(t, v, 1, { counter: true }, { only: m, to: u, target: at });
      }
    }
    for (const v of back.keys()) for (const j of [...active[t]]) {
      if (over() || j === v || roleOf(S[t][j]) !== 'noncombatant' || !alive(t, j).length || !alive(s, u).length) continue;
      if (rand() < OPENING) attack(t, j, 1, { opening: true }, { to: u });
    }
    struck.clear();
  };

  // a beak lets go once its holder has taken BEAK.release of its health since it clamped on (or the
  // held one or the holder is down)
  const checkBeaks = () => {
    for (const [k, b] of beaks) {
      const holder = S[b.s][b.u].members[b.at];
      if (hp[b.t][b.v][b.m] <= 0 || !holderUp(b) || !active[b.s].includes(b.u) || !active[b.t].includes(b.v)) { beaks.delete(k); continue; }
      if (b.hpAt - hp[b.s][b.u][b.at] >= BEAK.release * holder.hp) { beaks.delete(k); log.push(entry(b.t, b.v, b.m, b.u, b.at, { loose: true })); }
    }
  };
  // a unit leaving the fight: ours that ran off, or the foe's (a win)
  const runOff = (s, u, how = { rout: true }) => {
    active[s].splice(active[s].indexOf(u), 1);
    if (s === 0) routed.push(u); else { foeRouted = true; if (how.fled) foeFled = true; if (how.passed) foeWent = true; }
    for (const map of [clinging, holding, latches, beaks]) for (const [k, h] of map) if ((h.s === s && h.u === u) || (h.t === s && h.v === u)) map.delete(k);
    log.push(selfEntry(s, u, how));
  };
  // morale: a pack or herd that has lost ROUT of its members runs off, ours as well as the foe's
  const routs = list => list.length >= 2 && list.length - standing(list).length >= list.length * ROUT;
  const checkRouts = () => {
    for (const s of [0, 1]) for (const u of [...active[s]]) {
      if (over() || !routs(hp[s][u]) || !alive(s, u).length || (s === 1 && opts.guard)) continue;
      runOff(s, u);
    }
  };

  // rivals are team units of one member of a rival species; a clash sends them into a frenzy
  const isRival = i => !units[i].pack && units[i].members.length === 1 && units[i].members[0].rival;
  const sameKind = (i, j) => units[i].members[0].type === units[j].members[0].type;

  // One unit's turn. Its wounds bleed; its members try to get loose (from a claw: agility against a
  // clinging one, strength against a pinning one; from a Dilophosaurus' hold: strength against
  // strength). Then it keeps up what holds it has going, or acts by its role: an attacker strikes, a
  // defender charges now and then (otherwise it holds its ground), a noncombatant never strikes on
  // its own.
  const turn = (s, u) => {
    const t = 1 - s, key = K(s, u), unit = S[s][u];
    for (const m of alive(s, u)) {
      const rate = bleeding.get(E(s, u, m));
      if (!rate || over()) continue;
      const dmg = Math.max(1, Math.round(unit.members[m].hp * rate));
      hp[s][u][m] = Math.max(0, hp[s][u][m] - dmg);
      log.push(s === 1 ? { by: 'bleed', member: m, dmg, left: hp[s][u][m], foeLeft: foeLeft() } : { by: 'bleed', to: u, member: m, dmg, left: hp[s][u][m] });
    }
    if (over() || !alive(s, u).length) return;
    for (const [k, l] of latches) {
      if (l.t !== s || l.v !== u) continue;
      if (hp[s][u][l.m] <= 0 || !holderUp(l)) { latches.delete(k); continue; }
      const holder = S[l.s][l.u].members[l.at], prey = unit.members[l.m];
      if (l.mode === 'cling' ? contest(prey.agi, holder.agi) : contest(prey.str, holder.str)) { latches.delete(k); log.push(entry(s, u, l.m, l.u, l.at, { shake: true, mode: l.mode })); }
    }
    for (const [k, h] of holding) {
      if (h.t !== s || h.v !== u) continue;
      if (hp[s][u][h.m] <= 0 || !holderUp(h)) { holding.delete(k); continue; }
      if (contest(unit.members[h.m].str, S[h.s][h.u].members[h.at].str)) { holding.delete(k); log.push(entry(s, u, h.m, h.u, h.at, { broke: true })); }
    }
    // hunkered down before a bigger predator (each of its armored ones, every turn), it does nothing else
    const bigger = f => active[t].some(x => roleOf(S[t][x]) === 'attacker' && alive(t, x).some(y => sizeRank(S[t][x].members[y].size) > sizeRank(f.size)));
    for (const m of alive(s, u)) {
      const f = unit.members[m], was = crouched.has(E(s, u, m));
      if (f.crouch && bigger(f)) { crouched.add(E(s, u, m)); if (!was) log.push(selfEntry(s, u, { crouch: true, ...(unit.pack ? { at: m } : {}) })); }
      else crouched.delete(E(s, u, m));
    }
    if (!unit.pack && crouched.has(E(s, u, 0))) return;
    // a wild predator with no prey left in reach leaves: the rest is out of its food chain
    if (s === 1 && roleOf(unit) === 'attacker' && !opts.defend) {
      const ign = ignored.get(u) || new Set();
      if (!active[t].some(v => alive(t, v).some(m => !ign.has(E(t, v, m))))) { runOff(s, u, { fled: true, passed: true }); return; }
    }
    // a wild predator badly hurt tries to run: always, with nobody on the other side to chase it (not
    // one guarding its nest: opts.guard)
    if (s === 1 && roleOf(unit) === 'attacker' && !opts.guard) {
      const left = hp[s][u].reduce((a, h) => a + h, 0) / unitHp(unit);
      const below = FLIGHT.below;
      if (left < below) {
        const up = alive(s, u).map(m => unit.members[m]);
        const speed = up.reduce((a, f) => a + f.agi + f.res, 0) / up.length;
        const chasers = active[t].some(x => roleOf(S[t][x]) === 'attacker' && alive(t, x).length);
        if (!chasers || rand() < Math.min(0.95, speed / (speed + FLIGHT.base) * left / below)) { runOff(s, u, { fled: true }); return; }
        log.push(selfEntry(s, u, { caught: true }));
        return;
      }
    }
    // knocked down, a lone animal spends its turn getting up
    if (!unit.pack && knocked.delete(E(s, u, 0))) { log.push(selfEntry(s, u, { recovering: true })); return; }
    // pinned under a claw or in a beak, a lone animal can do nothing
    if (!unit.pack && pinned(s, u, 0)) { log.push(selfEntry(s, u, { pinned: true })); return; }
    let busy = -1;
    // clamped on with its beak: the grip crushes the held one, a blow it can't dodge
    const bk = beaks.get(key);
    if (bk && (hp[t][bk.v][bk.m] <= 0 || !holderUp(bk))) beaks.delete(key);
    else if (bk) {
      const holder = unit.members[bk.at], prey = S[t][bk.v].members[bk.m];
      const dmg = rounded(hitOf(holder, prey, 0.75 + rand() * 0.5) * BEAK.hold * (bk.small ? BEAK.small : 1));
      hp[t][bk.v][bk.m] = Math.max(0, hp[t][bk.v][bk.m] - dmg);
      log.push(entry(s, u, bk.at, bk.v, bk.m, { dmg, left: hp[t][bk.v][bk.m], gripped: bk.small ? 'pin' : 'hold' }));
      if (!unit.pack || alive(s, u).length < 2 || over()) return;
      busy = bk.at;
    }
    // holding one its size: a blow and a light slash every turn, until it wrenches free
    const hd = holding.get(key);
    if (hd && hp[t][hd.v][hd.m] <= 0) holding.delete(key);
    else if (hd) { if (blow(s, u, hd.at, hd.v, hd.m, 0.75 + rand() * 0.5, 1, { hold: true }) >= 0) slashWound(s, u, t, hd.v, hd.m); return; }
    // clinging on: it holds on (strength against the other's agility) and slashes, or falls off; a
    // bad fall (it gets up on its own agility, RISE) costs it its next turn
    const cl = clinging.get(key);
    if (cl) {
      const lead = unit.members[cl.at], prey = S[t][cl.v].members[cl.m];
      if (hp[t][cl.v][cl.m] <= 0) clinging.delete(key);
      else if (contest(lead.str, prey.agi)) { if (blow(s, u, cl.at, cl.v, cl.m, 0.75 + rand() * 0.5, 1, { slash: true }) >= 0) slashWound(s, u, t, cl.v, cl.m); return; }
      else {
        clinging.delete(key);
        const landed = knockDown(s, u, cl.at);
        log.push(entry(s, u, cl.at, cl.v, cl.m, { fell: true, landed }));
        return;
      }
    }
    // latched on: it drives the claw in, through hide and armor, and the wound bleeds more
    const lt = latches.get(key);
    if (lt && (hp[t][lt.v][lt.m] <= 0 || !holderUp(lt))) latches.delete(key);
    else if (lt) {
      const holder = unit.members[lt.at], prey = S[t][lt.v].members[lt.m];
      const dmg = rounded(hitOf({ ...holder, crush: 1 }, prey, 0.75 + rand() * 0.5));
      hp[t][lt.v][lt.m] = Math.max(0, hp[t][lt.v][lt.m] - dmg);
      const wounds = clawWounds.get(E(t, lt.v, lt.m)) || 0;
      if (hp[t][lt.v][lt.m] > 0 && wounds < LATCH.maxStacks) { clawWounds.set(E(t, lt.v, lt.m), wounds + 1); bleed(t, lt.v, lt.m, bleedVs(LATCH.bleed, holder.size, prey.size)); }
      log.push(entry(s, u, lt.at, lt.v, lt.m, { dmg, left: hp[t][lt.v][lt.m], latched: lt.mode }));
      // the rest of a pack keeps attacking
      if (!unit.pack || alive(s, u).length < 2 || over()) return;
      busy = lt.at;
    }
    const role = roleOf(unit);
    if (role === 'noncombatant') return;
    if (role === 'defender') {
      if (rand() < (unit.members[0].charge || 0)) { exposed.add(key); attack(s, u, CHARGE_DAMAGE, { charge: true }, { skip: busy }); }
      return;
    }
    const mad = s === 0 && frenzy.has(u), boost = mad ? FRENZY_DAMAGE : 1;
    if (s === 0) {
      const others = test => active[0].filter(j => j !== u && alive(0, j).length && test(j));
      // a rival may turn on another one of its kind, and then every one of them goes into a frenzy
      const rivals = isRival(u) && !mad ? others(j => isRival(j) && sameKind(j, u)) : [];
      const clash = rivals.length > 0 && rand() < RIVAL_CLASH;
      // in a frenzy it is every one for itself: each strikes the foe or one of the other frenzied
      // ones; the last one standing strikes the foe or anyone left in the team
      let pool = [];
      if (clash) pool = rivals;
      else if (mad) {
        const mates = others(j => frenzy.has(j));
        const targets = mates.length ? mates : others(() => true);
        const pick = Math.floor(rand() * (targets.length + 1));
        if (pick < targets.length) pool = [targets[pick]];
      }
      if (pool.length) {
        const ally = pool[Math.floor(rand() * pool.length)];
        const left = alive(0, ally);
        const member = left[Math.floor(rand() * left.length)];
        const dmg = rounded(hitOf(units[u].members[0], units[ally].members[member], 0.75 + rand() * 0.5) * boost);
        hp[0][ally][member] = Math.max(0, hp[0][ally][member] - dmg);
        if (clash) active[0].forEach(j => { if (j === ally || (isRival(j) && sameKind(j, u) && alive(0, j).length)) frenzy.add(j); });
        log.push({ by: u, ally, member, dmg, left: hp[0][ally][member], ...(clash ? { clash: true } : { frenzy: true }) });
        return;
      }
    }
    attack(s, u, boost, mad ? { frenzy: true } : {}, { skip: busy });
  };

  if (!escaped) {
    // the order is set by agility at the start; the team goes first on a tie; a warned side goes first
    if (alerted) log.push(alerted === 'team' ? { by: caller(units), alert: true } : { by: 'foe', alert: true });
    const first = s => alerted === (s === 0 ? 'team' : 'foe') ? 1e6 : 0;
    const order = [...active[0].map(i => ({ s: 0, u: i, agi: unitPower(units[i]).agi + first(0) })), { s: 1, u: 0, agi: unitPower(foe).agi - 0.001 + first(1) }]
      .sort((a, b) => b.agi - a.agi);
    for (let round = 0; round < FIGHT_SAFETY && !over(); round++) {
      for (const { s, u } of order) {
        checkBeaks();
        checkRouts();
        if (over()) break;
        if (!active[s].includes(u) || !alive(s, u).length) continue;
        recording = true;
        turnHits = { dmg: 0, hp: 0, open: false };
        turn(s, u);
        recording = false;
        // a wild predator that only scraped hunkered-down armor (or armor too much for it) this turn grows
        // frustrated, and gives up
        if (s === 1 && active[1].includes(u) && roleOf(S[1][u]) === 'attacker' && !over() && !opts.guard) {
          const scraped = turnHits.hp > 0 && !turnHits.open && turnHits.dmg < GIVE_UP.perTurn * turnHits.hp;
          const n = scraped ? (frustrated.get(u) || 0) + 1 : 0;
          frustrated.set(u, n);
          if (n >= GIVE_UP.turns) {
            // it gives up on the hunkered-down ones and turns on the rest of the group; with nobody else
            // left to go for, it leaves
            const ign = ignored.get(u) || new Set();
            const small = sizeRank(biggest(S[1][u])) <= sizeRank(ARMOR.ignores);
            for (const v of active[0]) for (const m of alive(0, v)) if (crouched.has(E(0, v, m)) || (small && S[0][v].members[m].plated)) ign.add(E(0, v, m));
            ignored.set(u, ign);
            frustrated.set(u, 0);
            const others = active[0].some(v => alive(0, v).some(m => !ign.has(E(0, v, m))));
            if (others) log.push({ by: 'foe', turned: true });
            else runOff(1, u, { fled: true, gaveUp: true });
          }
        }
        counters(s, u);
      }
    }
  }
  // only those who stayed count for the result
  for (const e of brokeAway) { const [s, v, m] = e.split(':').map(Number); if (s === 0) hp[0][v][m] = 1; }
  const teamMax = stayed.reduce((t, i) => t + unitHp(units[i]), 0);
  const teamLeft = stayed.reduce((t, i) => t + hp[0][i].reduce((x, h) => x + h, 0), 0);
  const left = foeLeft();
  // (a predator that left because nothing it hunts was left standing was not beaten: no win)
  const win = !escaped && (left <= 0 || (foeRouted && !foeWent));
  return { win, escaped, fled, routed, foeRouted, foeFled, foeWent, alerted, slain, teamHps: units.map(u => u.members.map(m => m.hp)), log, hp: hp[0], foeHp: left, foeHps: hp[1][0], teamMax, teamLeft, foeMax, frenzy: [...frenzy], lamed, frill: frill[0] };
}

// How a team would do, from a fixed set of rolls so the answer does not flicker: how often it wins,
// and how likely each of its members (per unit) is to die in the fight (a deadly blow, or brought down
// and not surviving it: DEATH). The player never dies.
export function teamOdds(units, foe, runs = 120, opts = {}) {
  const rand = seededRand(`odds:${units.map(u => u.name + u.members.length).join(',')}:${foe.name}:${foe.members ? unitHp(foe) : foe.hp}`);
  let wins = 0;
  const death = units.map(u => u.members.map(() => 0));
  for (let i = 0; i < runs; i++) {
    const r = teamFight(units, foe, rand, opts);
    if (r.win) wins++;
    r.hp.forEach((list, a) => list.forEach((h, b) => {
      const f = units[a].members[b];
      if (h > 0 || !f.type) return;
      const slain = r.slain.some(([x, y]) => x === a && y === b);
      const lives = Math.min(DEATH.max, Math.max(DEATH.min, f.res / (f.res + DEATH.resBase)));
      death[a][b] += slain ? 1 : 1 - lives;
    }));
  }
  return { win: wins / runs, death: death.map(list => list.map(d => d / runs)) };
}
export const teamWinChance = (units, foe, runs = 120, opts = {}) => teamOdds(units, foe, runs, opts).win;

export const DANGER = [[0.85, 'Easy'], [0.6, 'Fair'], [0.3, 'Hard'], [0, 'Deadly']];
export const dangerOf = chance => DANGER.find(([min]) => chance >= min)[1];
