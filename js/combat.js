// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi, size, bite, hide } (deriveCombat in
// economy.js, plus agility and its species' body). The faster one strikes first, then they take
// turns. Each blow can be dodged (dodge chance); otherwise it lands (see hitOf): damage ±25%, never
// more than the attacker's bite, × (1 − reduction), minus the target's hide; a blow the hide stops
// does nothing.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_MAX_TURNS, PACK_REACH, PACK_BONUS,
  SPECIES, SIZE_ORDER, SIZE_EDGE, PLAYER_SIZE, PLAYER_ID, BITE, HIDE, WORLD_RADIUS } from './config.js';
const YOUNG_DIST = 3;   // creatures this close to the nest are young
import { deriveCombat, statSheet, seededRand } from './economy.js';

export function fighterOf(baby) {
  const sheet = statSheet(baby);
  const me = baby.id === PLAYER_ID, sp = SPECIES[baby.type];
  // the player's blows come from weapons, so no jaws hold them back
  const body = me ? { size: PLAYER_SIZE, bite: Infinity, hide: 0 } : { size: sp.size, bite: sp.bite, hide: sp.hide, type: baby.type, rival: sp.rival || 0 };
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

// a creature at a distance from the nest, stronger in a lair
export function creatureFighter(id, dist, lair = false) {
  const c = CREATURES[id];
  const level = CREATURE_LEVEL(dist) * (lair ? LAIR_LEVEL : 1);
  const stats = Object.fromEntries(Object.entries(c.stats).map(([k, v]) => [k, Math.max(1, Math.round(v * level))]));
  const power = Object.values(stats).reduce((t, v) => t + v, 0);
  // younger ones near the nest are a size smaller, with thinner hide; full grown at the edge of the map
  const size = dist <= YOUNG_DIST && !lair ? SIZE_ORDER[Math.max(0, SIZE_ORDER.indexOf(c.size) - 1)] : c.size;
  return { name: (lair ? 'Alpha ' : '') + c.name, ...deriveCombat(stats), agi: stats.agi, power, level, size, bite: c.bite ?? BITE[c.size],
    hide: Math.round((c.hide ?? HIDE[c.size]) * Math.min(1, level / CREATURE_LEVEL(WORLD_RADIUS))) };
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
// An expedition's team fights the creature together. A unit is one dinosaur, the player, or a pack:
// { name, pack, members: [fighter] }. Every round each side acts in agility order: each standing unit
// strikes the creature, and the creature strikes one standing unit (a random member of it). A blow
// never carries over to another member, so a pack loses at most one member per blow.
export const unitOf = (name, members, pack = false) => ({ name, pack, members });
const FIGHT_ROUNDS = Math.ceil(FIGHT_MAX_TURNS / 2);
const standing = hp => hp.flatMap((h, i) => h > 0 ? [i] : []);

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
// Rivals (Allosaurus): each other one of the same species in the team takes a share off its
// damage, never below a quarter. Every one for itself: they get in each other's way over the kill.
export const rivalCut = (members, m) => {
  if (!m.rival) return 1;
  const others = members.filter(x => x !== m && x.type === m.type).length;
  return Math.max(0.25, 1 - m.rival * others);
};
function withRivals(units) {
  const all = units.flatMap(u => u.members);
  if (!all.some(m => m.rival)) return units;
  return units.map(u => ({ ...u, members: u.members.map(m => m.rival ? { ...m, damage: m.damage * rivalCut(all, m) } : m) }));
}
export const unitHp = u => u.members.reduce((t, m) => t + m.hp, 0);

// log: [{ by: unit index, miss } | { by, dmg, left }] for the team's blows, left being the creature's
// health; [{ by: 'foe', to, member, miss } | { by: 'foe', to, member, dmg, left }] for the creature's,
// left being the struck member's health. hp: every member's health at the end, per unit.
export function teamFight(units, foe, rand) {
  units = withRivals(units);
  const hp = units.map(u => u.members.map(m => m.hp));
  let foeHp = foe.hp;
  // the order is set by agility at the start; the team goes first on a tie
  const order = [...units.map((u, i) => ({ who: i, agi: unitPower(u).agi })), { who: 'foe', agi: foe.agi - 0.001 }]
    .sort((a, b) => b.agi - a.agi).map(x => x.who);
  const up = () => units.some((_, i) => standing(hp[i]).length);
  const log = [];
  for (let round = 0; round < FIGHT_ROUNDS && foeHp > 0 && up(); round++) {
    for (const who of order) {
      if (foeHp <= 0 || !up()) break;
      if (who === 'foe') {
        const targets = units.flatMap((_, i) => standing(hp[i]).length ? [i] : []);
        const to = targets[Math.floor(rand() * targets.length)];
        const alive = standing(hp[to]);
        const member = alive[Math.floor(rand() * alive.length)];
        if (rand() < unitPower(units[to], hp[to]).dodge) { log.push({ by: 'foe', to, member, miss: true }); continue; }
        const hit = units[to].members[member];
        const dmg = rounded(hitOf(foe, hit, 0.75 + rand() * 0.5));
        hp[to][member] = Math.max(0, hp[to][member] - dmg);
        log.push({ by: 'foe', to, member, dmg, left: hp[to][member] });
      } else {
        if (!standing(hp[who]).length) continue;
        if (rand() < foe.dodge) { log.push({ by: who, miss: true }); continue; }
        const dmg = rounded(unitHit(units[who], hp[who], foe, 0.75 + rand() * 0.5));
        foeHp = Math.max(0, foeHp - dmg);
        log.push({ by: who, dmg, left: foeHp });
      }
    }
  }
  const teamMax = units.reduce((t, u) => t + unitHp(u), 0);
  const teamLeft = hp.flat().reduce((t, h) => t + h, 0);
  const win = foeHp <= 0 || (teamLeft > 0 && teamLeft / teamMax >= foeHp / foe.hp);
  return { win, log, hp, foeHp, teamMax, teamLeft, foeMax: foe.hp };
}

export function teamWinChance(units, foe, runs = 120) {
  const rand = seededRand(`odds:${units.map(u => u.name + u.members.length).join(',')}:${foe.name}:${foe.hp}`);
  let wins = 0;
  for (let i = 0; i < runs; i++) if (teamFight(units, foe, rand).win) wins++;
  return wins / runs;
}

export const DANGER = [[0.85, 'Easy'], [0.6, 'Fair'], [0.3, 'Hard'], [0, 'Deadly']];
export const dangerOf = chance => DANGER.find(([min]) => chance >= min)[1];
