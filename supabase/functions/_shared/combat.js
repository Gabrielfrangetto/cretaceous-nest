// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi, size, bite, hide } (deriveCombat in
// economy.js, plus agility and its species' body). The faster one strikes first, then they take
// turns. Each blow can be dodged (dodge chance); otherwise it lands (see hitOf): damage ±25%, never
// more than the attacker's bite, × (1 − reduction), minus the target's hide; a blow the hide stops
// does nothing. They fight until one is down: there is no turn limit.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_SAFETY, ROUT, PACK_BONUS, RIVAL_CLASH, FRENZY_DAMAGE, REACH_SLOTS, SIZE_HP, SIZE_DODGE, DODGE_MAX, MISS_FLOOR, SIZE_DODGE_MAX, BLEED_BIGGER, BLEED_SMALLER, BLEED_MIN, BONE_BREAKER, FRILL, ARMOR, CLUB, GRAB, LATCH, CLAW, BEAK, SPIKES, THROAT, DOME, HIT_PARTS, ARMS, BIPED_LEGS, QUAD_LEGS, LIMBS, isLeg, isArm, ROLE_TARGET, CHARGE_DAMAGE, CHARGE_EXPOSED, OPENING, FISHER,
  SPECIES, SIZE_ORDER, SIZE_EDGE, PLAYER_SIZE, PLAYER_ID, BITE, HIDE, WORLD_RADIUS } from './config.js';
const YOUNG_DIST = 3;   // creatures this close to the nest are young
import { deriveCombat, statSheet, gearMods, seededRand } from './economy.js';

// extra: stat mods on top of its equipment, for the fight only (a full pack's bonus)
export function fighterOf(baby, extra = []) {
  const sheet = statSheet(baby, extra.length ? [...gearMods(baby), ...extra] : undefined);
  const me = baby.id === PLAYER_ID, sp = SPECIES[baby.type];
  // the player's blows come from weapons, so no jaws hold them back
  const body = me ? { size: PLAYER_SIZE, bite: Infinity, hide: 0, role: 'attacker', biped: true }
    : { size: sp.size, bite: sp.bite, hide: sp.hide, type: baby.type, biped: !!sp.biped, rival: !!sp.rival, role: sp.role, fear: sp.fear, charge: sp.charge || 0, fisher: !!sp.fisher, crush: sp.crush || 0, boneBreaker: !!sp.boneBreaker, armor: !!sp.armor, club: !!sp.club,
        grab: !!sp.grab, tough: !!sp.tough, claw: !!sp.claw, beak: !!sp.beak, spikes: !!sp.spikes, guard: !!sp.guard, throat: !!sp.throat, dome: !!sp.dome, plated: sp.build === 'armored',
        ...(sp.frill ? { frill: Math.max(0, Math.min(FRILL.hp, baby.frill ?? FRILL.hp)) } : {}) };
  return { name: baby.name, ...sheet.derived, hp: Math.round(bodyHp(sheet.derived.hp, body.size) * (sp && !me ? sp.fragile || 1 : 1)), agi: sheet.stats.agi, str: sheet.stats.str, res: sheet.stats.res, power: sheet.power, ...body };
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
export const dodgeVs = (dodge, agi, size, attAgi, attSize) => {
  const own = quickDodge(dodge, agi, attAgi);
  const steps = Math.max(0, SIZE_ORDER.indexOf(attSize || 'small') - SIZE_ORDER.indexOf(size || 'small'));
  return steps ? Math.min(SIZE_DODGE_MAX, own + SIZE_DODGE * steps) : Math.min(DODGE_MAX, own);
};

// how much a wound bleeds when an attacker of attSize opens it on a target of size
export const bleedVs = (bleed, attSize, size) => {
  const steps = SIZE_ORDER.indexOf(attSize || 'small') - SIZE_ORDER.indexOf(size || 'small');
  return bleed * (steps >= 0 ? 1 + BLEED_BIGGER * steps : Math.max(BLEED_MIN, 1 + BLEED_SMALLER * steps));
};

// health for the size of the body (SIZE_HP)
export const bodyHp = (hp, size) => Math.round(hp * (SIZE_HP[size] ?? 1));

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
  const derived = deriveCombat(stats), size = youngSize(sp.size, dist, lair);
  return {
    name: sp.species, ...derived, hp: Math.round(bodyHp(derived.hp, size) * (sp.fragile || 1)), agi: stats.agi, str: stats.str, res: stats.res, power: Object.values(stats).reduce((t, v) => t + v, 0), level, type,
    size, bite: sp.bite, hide: youngHide(sp.hide, level), biped: !!sp.biped, role: sp.role, fear: sp.fear, charge: sp.charge || 0, fisher: !!sp.fisher, armor: !!sp.armor, club: !!sp.club,
    grab: !!sp.grab, tough: !!sp.tough, claw: !!sp.claw, beak: !!sp.beak, spikes: !!sp.spikes, guard: !!sp.guard, throat: !!sp.throat, dome: !!sp.dome, crush: sp.crush || 0, boneBreaker: !!sp.boneBreaker, plated: sp.build === 'armored',
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
  const derived = deriveCombat(stats), size = youngSize(c.size, dist, lair);
  return { name: (lair ? 'Alpha ' : '') + c.name, ...derived, hp: bodyHp(derived.hp, size), agi: stats.agi, str: stats.str, res: stats.res, power, level, size,
    bite: c.bite ?? BITE[c.size], hide: youngHide(c.hide ?? HIDE[c.size], level), role: 'attacker' };
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
// a unit that runs from this foe: the player never does
export const fears = (u, foe) => !!u.members[0].fear && sizeRank(biggest(foe)) > sizeRank(u.members[0].fear);
// which units flee before the fight; all of them when nobody left would fight
export function whoFlees(units, foe) {
  const fled = units.flatMap((u, i) => fears(u, foe) ? [i] : []);
  const stay = units.flatMap((_, i) => fled.includes(i) ? [] : [i]);
  const nobody = !stay.some(i => roleOf(units[i]) !== 'noncombatant');
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

// a fisher's damage for whether the fight is in the water
function withRoles(u, swamp) {
  return { ...u, members: u.members.map(m => m.fisher ? { ...m, damage: m.damage * (swamp ? FISHER.swamp : FISHER.land) } : m) };
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
//   A Pachycephalosaurus' charge lands on the flank and may add knocked (it loses its next action:
//   { by, recovering: true } for a lone one); a blow its dome shrugs off adds dome (dmg 0).
//   { by, rout: true } | { by: 'foe', rout: true }: a pack or herd that lost half its members runs off
//   (the foe's running off is a win).
// fled: the units that ran before the fight (escaped: everyone did, so there was none); routed: the
// units that ran off mid-fight; hp: every
// member's health at the end, per unit; foeHps: the foe's members'; frenzy: the frenzied units.
// opts.swamp: the fight is in a swamp (fishers fight better).
export function teamFight(units, foe, rand, opts = {}) {
  if (!foe.members) foe = unitOf(foe.name, [foe]);
  units = units.map(u => withRoles(u, opts.swamp));
  foe = withRoles(foe, opts.swamp);
  const { fled, escaped } = whoFlees(units, foe);
  // The two sides follow the same rules: side 0 is the team (its units), side 1 the foe (one unit). A
  // unit is (side, index), one of its animals (side, index, member).
  const S = [units, [foe]];
  const hp = S.map(list => list.map(u => u.members.map(m => m.hp)));
  const foeLeft = () => hp[1][0].reduce((t, h) => t + h, 0);
  const foeMax = unitHp(foe);
  // the units still fighting on each side; those who stayed to fight; ours that ran off mid-fight
  const active = [units.flatMap((_, i) => fled.includes(i) ? [] : [i]), [0]];
  const stayed = [...active[0]];
  const routed = [];
  let foeRouted = false;
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
  const bleeding = new Map(), gores = new Map(), clawWounds = new Map(), spikeWounds = new Map(), slashed = new Set(), toughUsed = new Set();
  const bleed = (s, u, m, rate) => bleeding.set(E(s, u, m), (bleeding.get(E(s, u, m)) || 0) + rate);
  // Holds, by the unit holding (K): Dilophosaurus clinging to a bigger one or holding one its size,
  // Velociraptors latched on (one at a time in a pack), Protoceratops clamped on with its beak. Each
  // { s, u, at: its member, t, v, m: the one held, ... }.
  const clinging = new Map(), holding = new Map(), latches = new Map(), beaks = new Map();
  // units that lost their footing (they miss their next turn), and defenders out of their guard
  const stunned = new Set(), exposed = new Set();
  // animals knocked down: they lose their next action
  const knocked = new Set();
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
  const rollPart = (list, f) => { let x = rand(); const p = (list.find(([, w]) => (x -= w) < 0) || list[0])[0]; return p === 'limbs' ? limbOf(f) : p; };
  // an arm broken: that hand can't grab any more; ours come home injured
  const breakArm = (t, v, m) => {
    S[t][v].members[m] = { ...S[t][v].members[m], armBroken: true, grab: false };
    if (t === 0) lamed.push([v, m]);
  };
  const breakBones = (s, u, t, v, m, part = null) => {
    if (!S[s][u].members[0].boneBreaker || hp[t][v][m] <= 0) return part ? { part } : {};
    const hit = S[t][v].members[m];
    if (sizeRank(hit.size) <= sizeRank(BONE_BREAKER.oneBite)) { hp[t][v][m] = 0; return { part: 'whole', kill: true }; }
    if (!part) part = rollPart(BONE_BREAKER.parts, hit);
    if (part === 'neck' && sizeRank(hit.size) <= sizeRank(BONE_BREAKER.neckMax) && !hit.throat) { hp[t][v][m] = 0; return { part, kill: true }; }
    if (isLeg(part) && !hit.lame && rand() < BONE_BREAKER.lame) { lameMember(t, v, m); return { part, lame: true }; }
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
    // a pinned or held one can't dodge; a spiked tail's swing is slow, and the quicker one sees it coming
    const tail = att.spikes && (extra.counter || extra.charge) ? SPIKES.slow * Math.max(0, 2 * prey.agi / (prey.agi + att.agi) - 1) : 0;
    if (!held && !pinned(t, v, m) && rand() < Math.min(SIZE_DODGE_MAX, dodgeVs(dodgeIn(target, hp[t][v], m), prey.agi, prey.size, att.agi, att.size) + tail)) {
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
    // a sickle claw driven into the neck from below goes through any armor
    const neck = att.claw && !held && !o.part && rand() < CLAW.neck;
    // armor: the part the blow lands on decides how much gets through
    let part = neck ? 'neck' : o.part || null, cut = 1;
    if (prey.armor && !neck) {
      if (!part) part = rollPart(ARMOR.parts, prey);
      cut = ARMOR.armored.includes(part) ? 1 - ARMOR.cut : part === 'belly' ? ARMOR.belly : 1;
    }
    // a dome's charge butts the flank; on a domed head the part matters wherever the blow lands
    const butt = att.dome && extra.charge && !held;
    if (butt && !part) part = rand() < DOME.back ? 'back' : 'belly';
    if (!part && !onHead && prey.dome) part = rollPart(HIT_PARTS, prey);
    // a bone-breaking bite picks its part before it lands (a covered throat can take some of it)
    if (!part && !onHead && S[s][u].members[0].boneBreaker && sizeRank(prey.size) > sizeRank(BONE_BREAKER.oneBite)) part = rollPart(BONE_BREAKER.parts, prey);
    // a throat covered in small bones: nothing from something smaller, half from one its size, a
    // little less from anything bigger
    const step = sizeRank(att.size) - sizeRank(prey.size);
    const throat = part === 'neck' && prey.throat ? (step < 0 ? 0 : step === 0 ? THROAT.same : THROAT.bigger) : 1;
    // a domed head shrugs off anything no bigger than itself
    const domed = (part === 'head' || onHead) && prey.dome && step <= 0;
    // a tail club swung (a counter or a charge) lands harder than a bite; a spiked tail pierces
    const swung = att.club && (extra.counter || extra.charge);
    const spiked = att.spikes && (extra.counter || extra.charge);
    const buff = o.buff || 1;
    const weapon = neck ? { ...att, crush: 1 } : spiked ? { ...att, crush: Math.max(att.crush || 0, SPIKES.pierce) } : att;
    const raw = hitOf(weapon, prey, roll) * buff * boost * (swung ? CLUB.damage : 1) * open * head * throat * (domed ? 0 : 1);
    const dmg = rounded(raw * cut);
    hp[t][v][m] = Math.max(0, hp[t][v][m] - dmg);
    let bone = neck ? { part: 'neck' } : dmg > 0 && !onHead ? breakBones(s, u, t, v, m, part) : onHead ? { part: 'head' } : part ? { part } : {};
    if (prey.armor && !neck && ARMOR.armored.includes(part)) bone.armored = true;
    if (throat < 1) bone.throat = true;
    if (domed) bone = { part: 'head', dome: true };
    // butted in the flank, it may go down and lose its next action
    if (butt && dmg > 0 && hp[t][v][m] > 0 && step >= -DOME.maxStep && contest(att.str, prey.str)) { knocked.add(E(t, v, m)); bone = { ...bone, knocked: true }; }
    // the spikes leave a wound that bleeds, and may go through a leg
    if (spiked && dmg > 0 && hp[t][v][m] > 0) {
      const wounds = spikeWounds.get(E(t, v, m)) || 0;
      if (wounds < SPIKES.maxBleed) { spikeWounds.set(E(t, v, m), wounds + 1); bleed(t, v, m, bleedVs(SPIKES.bleed, att.size, prey.size)); }
      if (!prey.lame && !bone.kill && rand() < SPIKES.impale + SPIKES.bonus * att.str / (att.str + prey.res)) { lameMember(t, v, m); bone = { ...bone, part: legOf(prey), lame: true, impaled: true }; }
    }
    // a tail club that lands on something small kills it outright; otherwise it may break the shin
    if (swung && hp[t][v][m] > 0 && sizeRank(prey.size) <= sizeRank(CLUB.crushes)) { hp[t][v][m] = 0; bone = { part: 'whole', kill: true, club: true }; }
    else if (dmg > 0 && swung && hp[t][v][m] > 0 && !prey.lame && rand() < CLUB.lame + CLUB.bonus * att.str / (att.str + prey.res)) {
      lameMember(t, v, m);
      bone = { part: legOf(prey), lame: true, club: true };
    }
    // tough: once a fight it stays standing after a deadly blow from something no bigger than itself
    if (hp[t][v][m] <= 0 && prey.tough && !toughUsed.has(E(t, v, m)) && sizeRank(att.size) <= sizeRank(prey.size)) {
      hp[t][v][m] = 1;
      toughUsed.add(E(t, v, m));
      bone.tough = true;
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
    // a hooked beak striking back may clamp on to something no bigger than itself
    if (dmg > 0 && att.beak && extra.counter && !beaks.has(key) && !heldBy(beaks, t, v, m) && hp[t][v][m] > 0
      && sizeRank(prey.size) <= sizeRank(att.size) && contest(att.agi, prey.agi)) {
      const small = sizeRank(prey.size) < sizeRank(att.size);
      beaks.set(key, { s, u, at, t, v, m, small, hpAt: hp[s][u][at] });
      grab = { ...grab, beak: small ? 'pin' : 'hold' };
    }
    const also = sweep(att, target, hp[t][v], m, x => rounded(hitOf(att, target.members[x], roll) * buff * boost * open));
    log.push(entry(s, u, at, v, m, { dmg, left: hp[t][v][m], ...bone, ...grab, ...(spiked ? { spiked: true } : {}), ...(butt ? { butt: true } : {}), ...(also.length ? { also } : {}), ...extra }));
    // the plates on its back hurt whatever bit them
    if (part === 'back' && prey.armor && raw > 0 && hp[s][u][at] > 0) {
      const back = Math.max(1, Math.round(raw * ARMOR.thorns));
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
        const targets = (o.to !== undefined ? [o.to] : active[t]).filter(x => active[t].includes(x) && alive(t, x).some(y => roomOf(x, y) > 0));
        if (!targets.length) continue;
        const weights = targets.map(x => ROLE_TARGET[roleOf(S[t][x])]);
        let pick = rand() * weights.reduce((a, w) => a + w, 0);
        v = targets[targets.length - 1];
        for (let k = 0; k < targets.length; k++) { pick -= weights[k]; if (pick < 0) { v = targets[k]; break; } }
        const open = alive(t, v).filter(y => roomOf(v, y) > 0);
        m = o.target !== undefined && v === o.to && hp[t][v][o.target] > 0 ? o.target : open[Math.floor(rand() * open.length)];
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
        if (over() || hp[t][v][m] <= 0 || !alive(s, u).length) continue;
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
  // morale: a pack or herd that has lost ROUT of its members runs off, ours as well as the foe's
  const routs = list => list.length >= 2 && list.length - standing(list).length >= list.length * ROUT;
  const checkRouts = () => {
    for (const s of [0, 1]) for (const u of [...active[s]]) {
      if (over() || !routs(hp[s][u]) || !alive(s, u).length) continue;
      active[s].splice(active[s].indexOf(u), 1);
      if (s === 0) routed.push(u); else foeRouted = true;
      for (const map of [clinging, holding, latches, beaks]) for (const [k, h] of map) if ((h.s === s && h.u === u) || (h.t === s && h.v === u)) map.delete(k);
      log.push(selfEntry(s, u, { rout: true }));
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
    // knocked off its feet: it misses this turn
    if (stunned.delete(key)) { log.push(selfEntry(s, u, { recovering: true })); return; }
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
    // bad fall (agility against agility) costs it its next turn
    const cl = clinging.get(key);
    if (cl) {
      const lead = unit.members[cl.at], prey = S[t][cl.v].members[cl.m];
      if (hp[t][cl.v][cl.m] <= 0) clinging.delete(key);
      else if (contest(lead.str, prey.agi)) { if (blow(s, u, cl.at, cl.v, cl.m, 0.75 + rand() * 0.5, 1, { slash: true }) >= 0) slashWound(s, u, t, cl.v, cl.m); return; }
      else {
        clinging.delete(key);
        const landed = contest(lead.agi, prey.agi);
        if (!landed) stunned.add(key);
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
    // the order is set by agility at the start; the team goes first on a tie
    const order = [...active[0].map(i => ({ s: 0, u: i, agi: unitPower(units[i]).agi })), { s: 1, u: 0, agi: unitPower(foe).agi - 0.001 }]
      .sort((a, b) => b.agi - a.agi);
    for (let round = 0; round < FIGHT_SAFETY && !over(); round++) {
      for (const { s, u } of order) {
        checkBeaks();
        checkRouts();
        if (over()) break;
        if (!active[s].includes(u) || !alive(s, u).length) continue;
        recording = true;
        turn(s, u);
        recording = false;
        counters(s, u);
      }
    }
  }
  // only those who stayed count for the result
  const teamMax = stayed.reduce((t, i) => t + unitHp(units[i]), 0);
  const teamLeft = stayed.reduce((t, i) => t + hp[0][i].reduce((x, h) => x + h, 0), 0);
  const left = foeLeft();
  const win = !escaped && (left <= 0 || foeRouted);
  return { win, escaped, fled, routed, foeRouted, log, hp: hp[0], foeHp: left, foeHps: hp[1][0], teamMax, teamLeft, foeMax, frenzy: [...frenzy], lamed, frill: frill[0] };
}

export function teamWinChance(units, foe, runs = 120, opts = {}) {
  const rand = seededRand(`odds:${units.map(u => u.name + u.members.length).join(',')}:${foe.name}:${foe.members ? unitHp(foe) : foe.hp}`);
  let wins = 0;
  for (let i = 0; i < runs; i++) if (teamFight(units, foe, rand, opts).win) wins++;
  return wins / runs;
}

export const DANGER = [[0.85, 'Easy'], [0.6, 'Fair'], [0.3, 'Hard'], [0, 'Deadly']];
export const dangerOf = chance => DANGER.find(([min]) => chance >= min)[1];
