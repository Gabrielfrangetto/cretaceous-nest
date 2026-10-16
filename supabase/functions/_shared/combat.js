// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi, size, bite, hide } (deriveCombat in
// economy.js, plus agility and its species' body). The faster one strikes first, then they take
// turns. Each blow can be dodged (dodge chance); otherwise it lands (see hitOf): damage ±25%, never
// more than the attacker's bite, × (1 − reduction), minus the target's hide; a blow the hide stops
// does nothing. They fight until one is down: there is no turn limit.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_SAFETY, ROUT, PACK_BONUS, RIVAL_CLASH, FRENZY_DAMAGE, REACH_SLOTS, SIZE_HP, SIZE_DODGE, DODGE_MAX, MISS_FLOOR, SIZE_DODGE_MAX, BLEED_BIGGER, BLEED_SMALLER, BLEED_MIN, BONE_BREAKER, FRILL, ARMOR, CLUB, GRAB, LATCH, CLAW, BEAK, ROLE_TARGET, CHARGE_DAMAGE, CHARGE_EXPOSED, OPENING, FISHER,
  SPECIES, SIZE_ORDER, SIZE_EDGE, PLAYER_SIZE, PLAYER_ID, BITE, HIDE, WORLD_RADIUS } from './config.js';
const YOUNG_DIST = 3;   // creatures this close to the nest are young
import { deriveCombat, statSheet, gearMods, seededRand } from './economy.js';

// extra: stat mods on top of its equipment, for the fight only (a full pack's bonus)
export function fighterOf(baby, extra = []) {
  const sheet = statSheet(baby, extra.length ? [...gearMods(baby), ...extra] : undefined);
  const me = baby.id === PLAYER_ID, sp = SPECIES[baby.type];
  // the player's blows come from weapons, so no jaws hold them back
  const body = me ? { size: PLAYER_SIZE, bite: Infinity, hide: 0, role: 'attacker' }
    : { size: sp.size, bite: sp.bite, hide: sp.hide, type: baby.type, rival: !!sp.rival, role: sp.role, fear: sp.fear, charge: sp.charge || 0, fisher: !!sp.fisher, crush: sp.crush || 0, boneBreaker: !!sp.boneBreaker, armor: !!sp.armor, club: !!sp.club,
        grab: !!sp.grab, tough: !!sp.tough, claw: !!sp.claw, beak: !!sp.beak, plated: sp.build === 'armored',
        ...(sp.frill ? { frill: Math.max(0, Math.min(FRILL.hp, baby.frill ?? FRILL.hp)) } : {}) };
  return { name: baby.name, ...sheet.derived, hp: Math.round(bodyHp(sheet.derived.hp, body.size) * (sp && !me ? sp.fragile || 1 : 1)), agi: sheet.stats.agi, str: sheet.stats.str, res: sheet.stats.res, power: sheet.power, ...body };
}

// a dodge against an attacker. Speed against speed: two equally quick ones cancel each other out and
// only miss MISS_FLOOR of the time; the quicker the target is than its attacker, the more of its
// dodge it keeps (all of it at twice as quick). Then smaller targets are harder to hit
// (SIZE_DODGE a size step).
export const dodgeVs = (dodge, agi, size, attAgi, attSize) => {
  const share = agi > 0 ? agi / (agi + Math.max(0, attAgi || 0)) : 0;
  const quick = Math.max(0, Math.min(1, (share - 0.5) * 6));
  const own = Math.max(MISS_FLOOR, dodge * quick);
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
    size, bite: sp.bite, hide: youngHide(sp.hide, level), role: sp.role, fear: sp.fear, charge: sp.charge || 0, fisher: !!sp.fisher, crush: sp.crush || 0, boneBreaker: !!sp.boneBreaker, plated: sp.build === 'armored',
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
//   A bone-breaking bite adds part ('body' | 'leg' | 'neck'), and lame or kill; a stomp that catches
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
//   Armor adds part and armored to the foe's blow; a blow on armored plates on the back is followed by
//   { by, member, dmg, left, foeLeft, thorns: true }; a club that breaks a shin adds lame and club.
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
  const inFight = i => !fled.includes(i);
  const hp = units.map(u => u.members.map(m => m.hp));
  const foeHp = foe.members.map(m => m.hp);
  const foeLeft = () => foeHp.reduce((t, h) => t + h, 0);
  const foeMax = unitHp(foe);
  const fighting = units.flatMap((_, i) => inFight(i) ? [i] : []);
  // those who stayed to fight; units that ran off mid-fight leave fighting for routed
  const stayed = [...fighting];
  const routed = [];
  let foeRouted = false;
  // the foe's members the unit having its turn went for (a wild defender strikes back from them)
  const hitBy = new Set();
  const log = [];
  const frenzy = new Set();
  // members lamed by a bone-breaking bite: [unit, member]
  const lamed = [];
  // each member's frill (null: none), and how many gored wounds each of the foe's members bleeds from
  const frill = units.map(u => u.members.map(m => m.frill ?? null));
  // each of the foe's members' bleeding (a share of its health a turn) and its gore wounds
  const bleeding = foe.members.map(() => 0);
  const gores = foe.members.map(() => 0);
  // units clinging to the foe (Dilophosaurus) until their next turn, and those that shrugged off a
  // deadly blow this fight
  const clinging = new Map();
  const toughUsed = new Set();
  // units that lost their footing and miss their next turn; Dilophosaurus holding a foe its size
  // (unit -> the foe's member); and which of the foe's members already bleed from its slash (one
  // wound each, however long it holds on)
  const stunned = new Set();
  const holding = new Map();
  const slashed = foe.members.map(() => false);
  const slashWound = (m, who) => { if (m >= 0 && foeHp[m] > 0 && !slashed[m]) { slashed[m] = true; bleeding[m] += bleedVs(GRAB.bleed, biggest(units[who]), foe.members[m].size); } };
  // a contest of one value against another: a / (a + b) to win
  const contest = (a, b) => rand() < a / (a + b);
  // Velociraptors latched on to the foe: unit -> { m: the foe's member, holder: its own member,
  // mode: 'cling' | 'pin' }, and how many claw wounds each foe member bleeds from
  const latches = new Map();
  const clawWounds = foe.members.map(() => 0);
  // Protoceratops clamped on to the foe: unit -> { m: the foe's member, holder: its own member, small:
  // the held one is smaller (it can't strike at all), hpAt: the holder's health when it clamped on }
  const beaks = new Map();
  const beakOn = m => [...beaks.entries()].find(([who, b]) => b.m === m && hp[who][b.holder] > 0);
  const pinned = m => [...latches.values()].some(l => l.m === m && l.mode === 'pin') || [...beaks.entries()].some(([who, b]) => b.m === m && b.small && hp[who][b.holder] > 0);
  if (!escaped) {
    // the order is set by agility at the start; the team goes first on a tie
    const order = [...fighting.map(i => ({ who: i, agi: unitPower(units[i]).agi })), { who: 'foe', agi: unitPower(foe).agi - 0.001 }]
      .sort((a, b) => b.agi - a.agi).map(x => x.who);
    const up = () => fighting.some(i => standing(hp[i]).length);
    // rivals are units of one member of a rival species; a clash sends them into a frenzy
    const isRival = i => !units[i].pack && units[i].members.length === 1 && units[i].members[0].rival;
    const sameKind = (i, j) => units[i].members[0].type === units[j].members[0].type;
    // A team blow on a standing member of the foe, by one of the unit's members (opts.at, its lead by
    // default) with its own agility, size, weapon and strength; opts.target: the foe's member it goes
    // for (a random one by default), opts.buff: a pack's bonus for those striking with it.
    // extra.slash: a clinging Dilophosaurus' slash at the member it holds on to (it can't be dodged)
    const strike = (who, roll, boost, extra = {}, opts = {}) => {
      const alive = standing(foeHp);
      const held = extra.slash || extra.hold;
      const member = held ? extra.member : opts.target ?? alive[Math.floor(rand() * alive.length)];
      const at = opts.at ?? 0, att = units[who].members[at], prey = foe.members[member];
      const buff = opts.buff || 1;
      const by = units[who].pack ? { at } : {};
      hitBy.add(member);
      // a pinned or held foe can't dodge
      if (!held && !pinned(member) && rand() < dodgeVs(dodgeIn(foe, foeHp, member), prey.agi, prey.size, att.agi, att.size)) { log.push({ by: who, ...by, member, miss: true, ...extra }); return -1; }
      // a tail club swung back (a counter or a charge) lands harder than a bite
      const swung = att.club && (extra.counter || extra.charge);
      const club = swung ? CLUB.damage : 1;
      // a sickle claw driven into the neck from below goes through any armor
      const neck = att.claw && rand() < CLAW.neck;
      const dmg = rounded(hitOf(neck ? { ...att, crush: 1 } : att, prey, roll) * buff * boost * club);
      foeHp[member] = Math.max(0, foeHp[member] - dmg);
      let bone = dmg > 0 ? breakBones(units[who], foe, foeHp, member, 'foe') : {};
      // a tail club that lands on something small kills it outright; otherwise it may break the shin
      if (swung && foeHp[member] > 0 && sizeRank(prey.size) <= sizeRank(CLUB.crushes)) { foeHp[member] = 0; bone = { part: 'whole', kill: true, club: true }; }
      else if (dmg > 0 && swung && foeHp[member] > 0 && !prey.lame
        && rand() < CLUB.lame + CLUB.bonus * att.str / (att.str + prey.res)) {
        lameMember(foe, member, 'foe');
        bone = { part: 'leg', lame: true, club: true };
      }
      // grasping hands (Dilophosaurus) on a foe with no armor on its body: a bigger one it may climb
      // on to (agility against agility); one its size or smaller it may seize (agility and strength
      // against agility and strength), and a smaller one, or one its size that can't wrench free
      // (strength against strength), dies in its grip
      let grab = {};
      if (dmg > 0 && att.grab && !held && foeHp[member] > 0 && !prey.plated && !clinging.has(who) && !holding.has(who) && rand() < GRAB.tries) {
        const step = sizeRank(prey.size) - sizeRank(att.size);
        if (step > 0) {
          if (contest(att.agi, prey.agi)) { clinging.set(who, member); grab = { grab: 'cling' }; }
        } else if (contest(att.agi + att.str, prey.agi + prey.str)) {
          if (step < 0) { foeHp[member] = 0; grab = { grab: 'kill' }; }
          // one its size: it holds on unless the foe wrenches free (strength against strength)
          else if (contest(att.str, prey.str)) { holding.set(who, member); grab = { grab: 'hold' }; }
          else grab = { grab: 'freed' };
        }
      }
      // a sickle claw may latch on (one at a time in a pack): clinging to a bigger foe (agility
      // against agility), pinning one its size or smaller (agility and strength against agility and
      // strength)
      if (dmg > 0 && att.claw && !latches.has(who) && foeHp[member] > 0 && !prey.plated && rand() < LATCH.tries) {
        const mode = sizeRank(prey.size) > sizeRank(att.size) ? 'cling' : 'pin';
        if (mode === 'cling' ? contest(att.agi, prey.agi) : contest(att.agi + att.str, prey.agi + prey.str)) {
          latches.set(who, { m: member, holder: at, mode });
          grab = { ...grab, latch: mode };
        }
      }
      // a hooked beak striking back may clamp on to something no bigger than itself
      if (dmg > 0 && att.beak && extra.counter && !beaks.has(who) && !beakOn(member) && foeHp[member] > 0
        && sizeRank(prey.size) <= sizeRank(att.size) && contest(att.agi, prey.agi)) {
        const small = sizeRank(prey.size) < sizeRank(att.size);
        beaks.set(who, { m: member, holder: at, small, hpAt: hp[who][at] });
        grab = { ...grab, beak: small ? 'pin' : 'hold' };
      }
      if (neck) bone = { ...bone, part: 'neck' };
      const also = sweep(att, foe, foeHp, member, m => rounded(hitOf(att, foe.members[m], roll) * buff * boost));
      log.push({ by: who, ...by, member, dmg, left: foeHp[member], ...bone, ...grab, ...(also.length ? { also } : {}), foeLeft: foeLeft(), ...extra });
      return member;
    };
    // A unit's turn of blows: its one animal's, or every standing member of a pack at once (skip: one
    // busy with something else), each its own blow; only as many go for one of the foe's members as can
    // reach it (REACH_SLOTS, by its size), and each lands PACK_BONUS harder for every other one
    // striking with it. Returns the foe's member the last blow went for.
    const attack = (who, boost, extra = {}, skip = -1) => {
      if (!units[who].pack) return strike(who, 0.75 + rand() * 0.5, boost, extra);
      const room = foeHp.map((h, m) => h > 0 ? REACH_SLOTS[foe.members[m].size] || 4 : 0);
      const blows = [];
      for (const at of standing(hp[who])) {
        if (at === skip) continue;
        const open = standing(room);
        if (!open.length) break;
        const target = open[Math.floor(rand() * open.length)];
        room[target]--;
        blows.push({ at, target });
      }
      const buff = 1 + PACK_BONUS * Math.max(0, blows.length - 1);
      let last = -1;
      for (const { at, target } of blows) {
        if (foeLeft() <= 0) break;
        // one already brought down this turn: it goes for another
        last = strike(who, 0.75 + rand() * 0.5, boost, extra, { at, buff, ...(foeHp[target] > 0 ? { target } : {}) });
      }
      return last;
    };
    // A blow from something much bigger than a pack's members catches more of them at once (a stomp,
    // a swipe of the tail): one more for every size step past the first. hit(m) is its damage on m.
    const sweep = (att, target, thp, first, hit) => {
      if (!target.pack) return [];
      const more = sizeRank(att.size) - sizeRank(target.members[first].size) - 1;
      const others = standing(thp).filter(m => m !== first).slice(0, Math.max(0, more));
      return others.map(m => { const dmg = hit(m); thp[m] = Math.max(0, thp[m] - dmg); return { member: m, dmg, left: thp[m] }; });
    };
    // A bone-breaking bite (a unit led by a boneBreaker) lands on a body part: a leg may be lamed (the
    // member keeps half its dodge and agility), a neck no bigger than neckMax is killed outright.
    // Returns what it did, for the log.
    // a lamed member keeps half its dodge and agility; ours come home injured
    const lameMember = (target, m, who) => {
      const hit = target.members[m];
      target.members[m] = { ...hit, lame: true, dodge: hit.dodge * BONE_BREAKER.lameCut, agi: hit.agi * BONE_BREAKER.lameCut };
      if (who !== 'foe') lamed.push([who, m]);
    };
    // part: where the blow landed when the target's armor already decided it
    const breakBones = (att, target, thp, m, who, part = null) => {
      if (!att.members[0].boneBreaker || thp[m] <= 0) return part ? { part } : {};
      // something this small does not survive the jaws closing on it
      if (sizeRank(target.members[m].size) <= sizeRank(BONE_BREAKER.oneBite)) { thp[m] = 0; return { part: 'whole', kill: true }; }
      if (!part) { let x = rand(); part = (BONE_BREAKER.parts.find(([, w]) => (x -= w) < 0) || BONE_BREAKER.parts[0])[0]; }
      const hit = target.members[m];
      if (part === 'neck' && sizeRank(hit.size) <= sizeRank(BONE_BREAKER.neckMax)) { thp[m] = 0; return { part, kill: true }; }
      if ((part === 'leg' || part === 'legs') && !hit.lame && rand() < BONE_BREAKER.lame) { lameMember(target, m, who); return { part, lame: true }; }
      return { part };
    };
    // defenders out of their guard after a charge
    const exposed = new Set();
    // once the foe has gone for a unit: a defender or noncombatant it attacked strikes back, and every
    // other noncombatant may land a blow through the opening
    const afterAttack = (to, counter = true) => {
      const role = roleOf(units[to]);
      if (counter && role !== 'attacker' && standing(hp[to]).length && foeLeft() > 0) attack(to, 1, { counter: true });
      for (const j of fighting) {
        if (j === to || foeLeft() <= 0 || roleOf(units[j]) !== 'noncombatant' || !standing(hp[j]).length) continue;
        if (rand() < OPENING) attack(j, 1, { opening: true });
      }
    };
    // morale: a pack or herd that has lost ROUT of its members runs off, ours as well as the foe's
    const routs = (list, n) => n >= 2 && list.length - standing(list).length >= n * ROUT;
    const checkRouts = () => {
      for (const i of [...fighting]) {
        if (!routs(hp[i], hp[i].length) || !standing(hp[i]).length) continue;
        fighting.splice(fighting.indexOf(i), 1);
        routed.push(i);
        clinging.delete(i); latches.delete(i); holding.delete(i);
        log.push({ by: i, rout: true });
      }
      if (!foeRouted && foeLeft() > 0 && up() && routs(foeHp, foeHp.length)) { foeRouted = true; log.push({ by: 'foe', rout: true }); }
    };
    // One blow of the foe's member a, buff harder for its pack: it goes for defenders more and
    // noncombatants less, on one of ours that still has room for it (room: how many more can reach
    // each of ours, REACH_SLOTS by size). Returns the unit it went for and whether it may strike back,
    // or null when none is in reach or the blow can't touch it.
    // opts.to: the unit it must go for (striking back at it); opts.boost, opts.extra: a charge's or a
    // counter's
    const foeBlow = (a, buff, room, opts = {}) => {
      const fa = foe.members[a], boost = opts.boost || 1, extra = opts.extra || {};
      const left = (to, m) => room.get(to + ':' + m) ?? (REACH_SLOTS[units[to].members[m].size] || 4);
      const reach = to => standing(hp[to]).filter(m => left(to, m) > 0);
      const targets = fighting.filter(i => (reach(i).length || i === opts.to && opts.member !== undefined) && (opts.to === undefined || i === opts.to));
      if (!targets.length) return null;
      const weights = targets.map(i => ROLE_TARGET[roleOf(units[i])]);
      let pick = rand() * weights.reduce((t, w) => t + w, 0), to = targets[targets.length - 1];
      for (let k = 0; k < targets.length; k++) { pick -= weights[k]; if (pick < 0) { to = targets[k]; break; } }
      const alive = reach(to);
      // held in a beak, it can only strike the one holding it
      const member = opts.member !== undefined && hp[to][opts.member] > 0 ? opts.member : alive[Math.floor(rand() * alive.length)];
      if (member === undefined) return null;
      room.set(to + ':' + member, left(to, member) - 1);
      const by = foe.pack ? { at: a } : {};
      const hit = units[to].members[member];
      // clinging to the foe's body, out of its reach
      const clung = latches.get(to);
      if (clinging.has(to) || (clung && clung.mode === 'cling' && clung.holder === member)) { log.push({ by: 'foe', ...by, to, member, dmg: 0, left: hp[to][member], immune: true, ...extra }); return null; }
      if (rand() < dodgeVs(dodgeIn(units[to], hp[to], member), hit.agi, hit.size, fa.agi, fa.size)) { log.push({ by: 'foe', ...by, to, member, miss: true, ...extra }); return { to, counter: true }; }
      // a defender caught out of its guard by its own charge takes more
      const open = exposed.delete(to) ? CHARGE_EXPOSED : 1;
      const roll = 0.75 + rand() * 0.5;
      // a blow on a frilled head: the frill takes it and the horns strike back, or a broken frill
      // lets half of it through
      let head = 1, onHead = false;
      if (frill[to][member] !== null && rand() < (foe.pack ? FRILL.headPack : FRILL.head)) {
        onHead = true;
        if (frill[to][member] > 0) {
          frill[to][member] = Math.max(0, frill[to][member] - (fa.crush ? FRILL.crushed : 1));
          log.push({ by: 'foe', ...by, to, member, dmg: 0, left: hp[to][member], part: 'head', blocked: true, frill: frill[to][member] });
          if (foeLeft() > 0) {
            const gored = strike(to, roll, 1, { counter: true, gore: true }, { at: member, target: a });
            if (gored >= 0 && foeHp[gored] > 0 && gores[gored] < FRILL.maxBleed) { gores[gored]++; bleeding[gored] += bleedVs(FRILL.bleed, hit.size, foe.members[gored].size); }
          }
          return { to, counter: false };
        }
        head = FRILL.broken;
      }
      // armor: the part the blow lands on decides how much gets through
      let armored = opts.part || null, cut = 1;
      if (hit.armor && !opts.part) {
        let x = rand();
        armored = (ARMOR.parts.find(([, w]) => (x -= w) < 0) || ARMOR.parts[0])[0];
        cut = ARMOR.armored.includes(armored) ? 1 - ARMOR.cut : armored === 'belly' ? ARMOR.belly : 1;
      }
      const raw = hitOf(fa, hit, roll) * buff * boost * open * head;
      const dmg = rounded(raw * cut);
      hp[to][member] = Math.max(0, hp[to][member] - dmg);
      const bone = dmg > 0 && !onHead ? breakBones(foe, units[to], hp[to], member, to, armored) : onHead ? { part: 'head' } : armored ? { part: armored } : {};
      if (armored && hit.armor && ARMOR.armored.includes(armored)) bone.armored = true;
      // tough: once a fight it stays standing after a deadly blow from something no bigger than itself
      const key = to + ':' + member;
      if (hp[to][member] <= 0 && hit.tough && !toughUsed.has(key) && sizeRank(fa.size) <= sizeRank(hit.size)) {
        hp[to][member] = 1;
        toughUsed.add(key);
        bone.tough = true;
      }
      const also = sweep(fa, units[to], hp[to], member, m => rounded(hitOf(fa, units[to].members[m], roll) * buff * open));
      log.push({ by: 'foe', ...by, to, member, dmg, left: hp[to][member], ...bone, ...(also.length ? { also } : {}), ...extra });
      // the plates on its back hurt whatever bit them
      if (armored === 'back' && raw > 0 && foeLeft() > 0) {
        const back = Math.max(1, Math.round(raw * ARMOR.thorns));
        foeHp[a] = Math.max(0, foeHp[a] - back);
        log.push({ by: to, member: a, dmg: back, left: foeHp[a], foeLeft: foeLeft(), thorns: true });
      }
      return { to, counter: true };
    };
    // A wild defender or noncombatant strikes back at the unit that just had its turn: each of its
    // members that unit went for (hitBy), still standing and free, one blow at it.
    let striker = null;
    const foeCounters = () => {
      const to = striker;
      striker = null;
      if (to !== null && roleOf(foe) !== 'attacker' && fighting.includes(to)) {
        const buff = 1 + PACK_BONUS * (foe.pack ? standing(foeHp).length - 1 : 0);
        for (const m of hitBy) {
          if (foeHp[m] <= 0 || pinned(m) || foeLeft() <= 0 || !standing(hp[to]).length) continue;
          const held = beakOn(m);
          if (held && held[0] !== to) continue;
          foeBlow(m, buff, new Map(), { to, extra: { counter: true }, ...(held ? { member: held[1].holder, part: 'head' } : {}) });
        }
      }
      hitBy.clear();
    };
    // a beak lets go once its holder has taken BEAK.release of its health since it clamped on (or the
    // held one or the holder is down)
    const checkBeaks = () => {
      for (const [who, b] of beaks) {
        const holder = units[who].members[b.holder];
        if (foeHp[b.m] <= 0 || hp[who][b.holder] <= 0 || !fighting.includes(who)) { beaks.delete(who); continue; }
        if (b.hpAt - hp[who][b.holder] >= BEAK.release * holder.hp) { beaks.delete(who); log.push({ by: 'foe', to: who, member: b.holder, loose: true }); }
      }
    };
    for (let round = 0; round < FIGHT_SAFETY && foeLeft() > 0 && !foeRouted && up(); round++) {
      for (const who of order) {
        foeCounters();
        checkBeaks();
        checkRouts();
        if (foeLeft() <= 0 || foeRouted || !up()) break;
        if (who !== 'foe' && !fighting.includes(who)) continue;
        hitBy.clear();
        if (who !== 'foe') striker = who;
        if (who === 'foe') {
          // gored wounds bleed every turn
          for (let m = 0; m < foeHp.length && foeLeft() > 0; m++) {
            if (!bleeding[m] || foeHp[m] <= 0) continue;
            const dmg = Math.max(1, Math.round(foe.members[m].hp * bleeding[m]));
            foeHp[m] = Math.max(0, foeHp[m] - dmg);
            log.push({ by: 'bleed', member: m, dmg, left: foeHp[m], foeLeft: foeLeft() });
          }
          if (foeLeft() <= 0) break;
          // it tries to shake off the claws latched on to it: agility to throw off a clinging one,
          // strength to get up from under one pinning it
          for (const [j, l] of latches) {
            const holder = units[j].members[l.holder], prey = foe.members[l.m];
            if (foeHp[l.m] <= 0 || hp[j][l.holder] <= 0) { latches.delete(j); continue; }
            if (l.mode === 'cling' ? contest(prey.agi, holder.agi) : contest(prey.str, holder.str)) { latches.delete(j); log.push({ by: 'foe', to: j, member: l.holder, shake: true, mode: l.mode }); }
          }
          // one held by a Dilophosaurus tries to wrench free: strength against strength
          for (const [j, m] of holding) {
            const lead = units[j].members[0];
            if (foeHp[m] <= 0 || !standing(hp[j]).length) { holding.delete(j); continue; }
            if (contest(foe.members[m].str, lead.str)) { holding.delete(j); log.push({ by: 'foe', to: j, member: 0, broke: true }); }
          }
          // pinned members can't strike; if none is free, it loses its turn. A pack or herd's turn is
          // every free member striking at once, each its own blow (as many on one of ours as can
          // reach it), each PACK_BONUS harder for every other one striking with it
          const free = standing(foeHp).filter(m => !pinned(m));
          if (!free.length) { log.push({ by: 'foe', pinned: true }); continue; }
          const buff = 1 + PACK_BONUS * (foe.pack ? free.length - 1 : 0);
          // a wild defender charges now and then and otherwise holds its ground; a noncombatant never
          // goes for anyone on its own (both strike back when attacked)
          const foeRole = roleOf(foe);
          const charging = foeRole === 'defender' && rand() < (foe.members[0].charge || 0);
          if (foeRole !== 'attacker' && !charging) continue;
          const how = charging ? { boost: CHARGE_DAMAGE, extra: { charge: true } } : {};
          const room = new Map();
          // the units it went for: whether each may strike back (a frill's goring already did)
          const struck = new Map();
          for (const a of free) {
            if (foeHp[a] <= 0 || foeLeft() <= 0 || !up()) continue;
            const held = beakOn(a);
            const r = foeBlow(a, buff, room, held ? { ...how, to: held[0], member: held[1].holder, part: 'head' } : how);
            if (r) struck.set(r.to, (struck.get(r.to) ?? false) || r.counter);
          }
          if (foeLeft() <= 0) break;
          for (const [to, counter] of struck) if (foeLeft() > 0) afterAttack(to, counter);
          continue;
        }
        if (!standing(hp[who]).length) continue;
        // knocked off its feet: it misses this turn
        if (stunned.delete(who)) { log.push({ by: who, recovering: true }); continue; }
        // clamped on with its beak: the grip crushes the held one, a blow it can't dodge
        if (beaks.has(who)) {
          const b = beaks.get(who), holder = units[who].members[b.holder], prey = foe.members[b.m];
          const dmg = rounded(hitOf(holder, prey, 0.75 + rand() * 0.5) * BEAK.hold * (b.small ? BEAK.small : 1));
          foeHp[b.m] = Math.max(0, foeHp[b.m] - dmg);
          log.push({ by: who, ...(units[who].pack ? { at: b.holder } : {}), member: b.m, dmg, left: foeHp[b.m], foeLeft: foeLeft(), gripped: b.small ? 'pin' : 'hold' });
          continue;
        }
        // holding a foe its size: a blow and a light slash every turn, until it wrenches free
        if (holding.has(who)) {
          const m = holding.get(who);
          if (foeHp[m] <= 0) holding.delete(who);
          else { slashWound(strike(who, 0.75 + rand() * 0.5, 1, { hold: true, member: m }), who); continue; }
        }
        // clinging on: it holds on (strength against the foe's agility) and slashes, or falls off; a
        // bad fall (agility against agility) costs it its next turn
        if (clinging.has(who)) {
          const m = clinging.get(who), lead = units[who].members[0], prey = foe.members[m];
          if (foeHp[m] <= 0) clinging.delete(who);
          else if (contest(lead.str, prey.agi)) {
            slashWound(strike(who, 0.75 + rand() * 0.5, 1, { slash: true, member: m }), who);
            continue;
          } else {
            clinging.delete(who);
            const landed = contest(lead.agi, prey.agi);
            if (!landed) stunned.add(who);
            log.push({ by: who, member: m, fell: true, landed });
            continue;
          }
        }
        // latched on: it drives the claw in, through hide and armor, and the wound bleeds more
        const latch = latches.get(who);
        if (latch && (foeHp[latch.m] <= 0 || hp[who][latch.holder] <= 0)) latches.delete(who);
        else if (latch) {
          const dmg = rounded(hitOf({ ...units[who].members[latch.holder], crush: 1 }, foe.members[latch.m], 0.75 + rand() * 0.5));
          foeHp[latch.m] = Math.max(0, foeHp[latch.m] - dmg);
          if (foeHp[latch.m] > 0 && clawWounds[latch.m] < LATCH.maxStacks) { clawWounds[latch.m]++; bleeding[latch.m] += bleedVs(LATCH.bleed, units[who].members[latch.holder].size, foe.members[latch.m].size); }
          log.push({ by: who, member: latch.m, dmg, left: foeHp[latch.m], foeLeft: foeLeft(), latched: latch.mode });
          // the rest of a pack keeps attacking
          if (!units[who].pack || standing(hp[who]).length < 2 || foeLeft() <= 0) continue;
        }
        const busy = latch && latches.has(who) ? latch.holder : -1;
        const role = roleOf(units[who]);
        // a noncombatant never goes for the foe on its own
        if (role === 'noncombatant') continue;
        // a defender charges now and then; otherwise it holds its ground, ready to strike back
        if (role === 'defender') {
          if (rand() < (units[who].members[0].charge || 0)) { exposed.add(who); attack(who, CHARGE_DAMAGE, { charge: true }, busy); }
          continue;
        }
        const mad = frenzy.has(who), boost = mad ? FRENZY_DAMAGE : 1;
        const others = test => fighting.filter(j => j !== who && standing(hp[j]).length && test(j));
        // a rival may turn on another one of its kind, and then every one of them goes into a frenzy
        const rivals = isRival(who) && !mad ? others(j => isRival(j) && sameKind(j, who)) : [];
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
          const alive = standing(hp[ally]);
          const member = alive[Math.floor(rand() * alive.length)];
          const dmg = rounded(hitOf(units[who].members[0], units[ally].members[member], 0.75 + rand() * 0.5) * boost);
          hp[ally][member] = Math.max(0, hp[ally][member] - dmg);
          if (clash) fighting.forEach(j => { if (j === ally || (isRival(j) && sameKind(j, who) && standing(hp[j]).length)) frenzy.add(j); });
          log.push({ by: who, ally, member, dmg, left: hp[ally][member], ...(clash ? { clash: true } : { frenzy: true }) });
          continue;
        }
        attack(who, boost, mad ? { frenzy: true } : {}, busy);
      }
      if (foeLeft() > 0 && !foeRouted && up()) foeCounters();
    }
  }
  // only those who stayed count for the result
  const teamMax = stayed.reduce((t, i) => t + unitHp(units[i]), 0);
  const teamLeft = stayed.reduce((t, i) => t + hp[i].reduce((x, h) => x + h, 0), 0);
  const left = foeLeft();
  const win = !escaped && (left <= 0 || foeRouted);
  return { win, escaped, fled, routed, foeRouted, log, hp, foeHp: left, foeHps: foeHp, teamMax, teamLeft, foeMax, frenzy: [...frenzy], lamed, frill };
}

export function teamWinChance(units, foe, runs = 120, opts = {}) {
  const rand = seededRand(`odds:${units.map(u => u.name + u.members.length).join(',')}:${foe.name}:${foe.members ? unitHp(foe) : foe.hp}`);
  let wins = 0;
  for (let i = 0; i < runs; i++) if (teamFight(units, foe, rand, opts).win) wins++;
  return wins / runs;
}

export const DANGER = [[0.85, 'Easy'], [0.6, 'Fair'], [0.3, 'Hard'], [0, 'Deadly']];
export const dangerOf = chance => DANGER.find(([min]) => chance >= min)[1];
