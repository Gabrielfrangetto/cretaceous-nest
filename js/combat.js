// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi, size, bite, hide } (deriveCombat in
// economy.js, plus agility and its species' body). The faster one strikes first, then they take
// turns. Each blow can be dodged (dodge chance); otherwise it lands (see hitOf): damage ±25%, never
// more than the attacker's bite, × (1 − reduction), minus the target's hide; a blow the hide stops
// does nothing.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_MAX_TURNS, PACK_REACH, PACK_BONUS, RIVAL_CLASH, FRENZY_DAMAGE, ROLE_TARGET, CHARGE_DAMAGE, CHARGE_EXPOSED, OPENING, FISHER,
  SPECIES, SIZE_ORDER, SIZE_EDGE, PLAYER_SIZE, PLAYER_ID, BITE, HIDE, WORLD_RADIUS } from './config.js';
const YOUNG_DIST = 3;   // creatures this close to the nest are young
import { deriveCombat, statSheet, seededRand } from './economy.js';

export function fighterOf(baby) {
  const sheet = statSheet(baby);
  const me = baby.id === PLAYER_ID, sp = SPECIES[baby.type];
  // the player's blows come from weapons, so no jaws hold them back
  const body = me ? { size: PLAYER_SIZE, bite: Infinity, hide: 0, role: 'attacker' }
    : { size: sp.size, bite: sp.bite, hide: sp.hide, type: baby.type, rival: !!sp.rival, role: sp.role, fear: sp.fear, charge: sp.charge || 0, fisher: !!sp.fisher };
  return { name: baby.name, ...sheet.derived, agi: sheet.stats.agi, power: sheet.power, ...body };
}

// what one blow does before rounding, roll being the ±25% (0.75 to 1.25): 0 when the hide stops it
export function hitOf(att, def, roll) {
  const landed = Math.min(att.bite ?? Infinity, att.damage * roll) * (1 - def.reduction) - (def.hide || 0);
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
  return {
    name: sp.species, ...deriveCombat(stats), agi: stats.agi, power: Object.values(stats).reduce((t, v) => t + v, 0), level, type,
    size: youngSize(sp.size, dist, lair), bite: sp.bite, hide: youngHide(sp.hide, level), fisher: !!sp.fisher,
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
  return { name: (lair ? 'Alpha ' : '') + c.name, ...deriveCombat(stats), agi: stats.agi, power, level, size: youngSize(c.size, dist, lair),
    bite: c.bite ?? BITE[c.size], hide: youngHide(c.hide ?? HIDE[c.size], level), role: 'attacker' };
}

// log: [{ by: 'a' | 'b', miss } | { by, dmg, left }], left being the target's health after the blow
export function fight(a, b, rand) {
  const hp = { a: a.hp, b: b.hp };
  const side = { a, b };
  let turn = a.agi >= b.agi ? 'a' : 'b';
  const log = [];
  for (let i = 0; i < FIGHT_MAX_TURNS && hp.a > 0 && hp.b > 0; i++) {
    const att = side[turn], other = turn === 'a' ? 'b' : 'a', def = side[other];
    if (rand() < def.dodge) log.push({ by: turn, miss: true });
    else {
      const dmg = rounded(hitOf(att, def, 0.75 + rand() * 0.5));
      hp[other] = Math.max(0, hp[other] - dmg);
      log.push({ by: turn, dmg, left: hp[other] });
    }
    turn = other;
  }
  const win = hp.b <= 0 || (hp.a > 0 && hp.a / a.hp >= hp.b / b.hp);
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
const FIGHT_ROUNDS = Math.ceil(FIGHT_MAX_TURNS / 2);
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

// one blow of a unit: every standing member bites (each held back by its own jaws and the foe's
// hide), the hardest bite counts in full and every other one a share, plus the pack's teamwork
export function unitHit(u, hp, foe, roll) {
  const up = u.members.filter((_, i) => hp[i] > 0);
  const extra = u.pack ? up.length - 1 : 0;
  const hits = up.map(m => hitOf(m, foe, roll)).sort((a, b) => b - a);
  return hits.reduce((t, d, i) => t + d * (i ? PACK_REACH : 1), 0) * (1 + PACK_BONUS * extra);
}
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
// fled: the units that ran before the fight (escaped: everyone did, so there was none); hp: every
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
  const log = [];
  const frenzy = new Set();
  if (!escaped) {
    // the order is set by agility at the start; the team goes first on a tie
    const order = [...fighting.map(i => ({ who: i, agi: unitPower(units[i]).agi })), { who: 'foe', agi: unitPower(foe).agi - 0.001 }]
      .sort((a, b) => b.agi - a.agi).map(x => x.who);
    const up = () => fighting.some(i => standing(hp[i]).length);
    // rivals are units of one member of a rival species; a clash sends them into a frenzy
    const isRival = i => !units[i].pack && units[i].members.length === 1 && units[i].members[0].rival;
    const sameKind = (i, j) => units[i].members[0].type === units[j].members[0].type;
    // a team blow on a random standing member of the foe
    const strike = (who, roll, boost, extra = {}) => {
      const alive = standing(foeHp);
      const member = alive[Math.floor(rand() * alive.length)];
      if (rand() < unitPower(foe, foeHp).dodge) { log.push({ by: who, member, miss: true, ...extra }); return; }
      const dmg = rounded(unitHit(units[who], hp[who], foe.members[member], roll) * boost);
      foeHp[member] = Math.max(0, foeHp[member] - dmg);
      log.push({ by: who, member, dmg, left: foeHp[member], foeLeft: foeLeft(), ...extra });
    };
    // defenders out of their guard after a charge
    const exposed = new Set();
    // once the foe has gone for a unit: a defender or noncombatant it attacked strikes back, and every
    // other noncombatant may land a blow through the opening
    const afterAttack = to => {
      const role = roleOf(units[to]);
      if (role !== 'attacker' && standing(hp[to]).length && foeLeft() > 0) strike(to, 0.75 + rand() * 0.5, 1, { counter: true });
      for (const j of fighting) {
        if (j === to || foeLeft() <= 0 || roleOf(units[j]) !== 'noncombatant' || !standing(hp[j]).length) continue;
        if (rand() < OPENING) strike(j, 0.75 + rand() * 0.5, 1, { opening: true });
      }
    };
    for (let round = 0; round < FIGHT_ROUNDS && foeLeft() > 0 && up(); round++) {
      for (const who of order) {
        if (foeLeft() <= 0 || !up()) break;
        if (who === 'foe') {
          // it goes for defenders more and noncombatants less
          const targets = fighting.filter(i => standing(hp[i]).length);
          const weights = targets.map(i => ROLE_TARGET[roleOf(units[i])]);
          let pick = rand() * weights.reduce((t, w) => t + w, 0), to = targets[targets.length - 1];
          for (let k = 0; k < targets.length; k++) { pick -= weights[k]; if (pick < 0) { to = targets[k]; break; } }
          const alive = standing(hp[to]);
          const member = alive[Math.floor(rand() * alive.length)];
          if (rand() < unitPower(units[to], hp[to]).dodge) { log.push({ by: 'foe', to, member, miss: true }); afterAttack(to); continue; }
          // a defender caught out of its guard by its own charge takes more
          const open = exposed.delete(to) ? CHARGE_EXPOSED : 1;
          const dmg = rounded(unitHit(foe, foeHp, units[to].members[member], 0.75 + rand() * 0.5) * open);
          hp[to][member] = Math.max(0, hp[to][member] - dmg);
          log.push({ by: 'foe', to, member, dmg, left: hp[to][member] });
          afterAttack(to);
          continue;
        }
        if (!standing(hp[who]).length) continue;
        const role = roleOf(units[who]);
        // a noncombatant never goes for the foe on its own
        if (role === 'noncombatant') continue;
        // a defender charges now and then; otherwise it holds its ground, ready to strike back
        if (role === 'defender') {
          if (rand() < (units[who].members[0].charge || 0)) { exposed.add(who); strike(who, 0.75 + rand() * 0.5, CHARGE_DAMAGE, { charge: true }); }
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
        strike(who, 0.75 + rand() * 0.5, boost, mad ? { frenzy: true } : {});
      }
    }
  }
  // only those who stayed count for the result
  const teamMax = fighting.reduce((t, i) => t + unitHp(units[i]), 0);
  const teamLeft = fighting.reduce((t, i) => t + hp[i].reduce((x, h) => x + h, 0), 0);
  const left = foeLeft();
  const win = !escaped && (left <= 0 || (teamLeft > 0 && teamLeft / teamMax >= left / foeMax));
  return { win, escaped, fled, log, hp, foeHp: left, foeHps: foeHp, teamMax, teamLeft, foeMax, frenzy: [...frenzy] };
}

export function teamWinChance(units, foe, runs = 120, opts = {}) {
  const rand = seededRand(`odds:${units.map(u => u.name + u.members.length).join(',')}:${foe.name}:${foe.members ? unitHp(foe) : foe.hp}`);
  let wins = 0;
  for (let i = 0; i < runs; i++) if (teamFight(units, foe, rand, opts).win) wins++;
  return wins / runs;
}

export const DANGER = [[0.85, 'Easy'], [0.6, 'Fair'], [0.3, 'Hard'], [0, 'Deadly']];
export const dangerOf = chance => DANGER.find(([min]) => chance >= min)[1];
