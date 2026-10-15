// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi } (deriveCombat in economy.js plus agility).
// The faster one strikes first, then they take turns. Each blow can be dodged (dodge chance);
// otherwise it deals damage × (1 − reduction), ±25%, at least 1.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_MAX_TURNS, PACK_REACH, PACK_BONUS,
  SPECIES, SIZE_ORDER, SIZE_EDGE, PLAYER_SIZE, PLAYER_ID } from './config.js';
import { deriveCombat, statSheet, seededRand } from './economy.js';

export function fighterOf(baby) {
  const sheet = statSheet(baby);
  const size = baby.id === PLAYER_ID ? PLAYER_SIZE : SPECIES[baby.type].size;
  return { name: baby.name, ...sheet.derived, agi: sheet.stats.agi, power: sheet.power, size };
}

// how much harder (or softer) a blow lands for the size difference
// (sizes next to each other are an even match)
export function sizeEdge(att, def) {
  const steps = SIZE_ORDER.indexOf(att.size || 'small') - SIZE_ORDER.indexOf(def.size || 'small');
  return Math.pow(1 + SIZE_EDGE, Math.sign(steps) * Math.max(0, Math.abs(steps) - 2));
}

// a creature at a distance from the nest, stronger in a lair
export function creatureFighter(id, dist, lair = false) {
  const c = CREATURES[id];
  const level = CREATURE_LEVEL(dist) * (lair ? LAIR_LEVEL : 1);
  const stats = Object.fromEntries(Object.entries(c.stats).map(([k, v]) => [k, Math.max(1, Math.round(v * level))]));
  const power = Object.values(stats).reduce((t, v) => t + v, 0);
  return { name: (lair ? 'Alpha ' : '') + c.name, ...deriveCombat(stats), agi: stats.agi, power, level, size: c.size };
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
      const dmg = Math.max(1, Math.round(att.damage * sizeEdge(att, def) * (1 - def.reduction) * (0.75 + rand() * 0.5)));
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

// what a unit hits with while these members stand: the strongest in full, every other one a share,
// and a pack gets better at working together the more of it stands
export function unitPower(u, hp = u.members.map(m => m.hp), foe = null) {
  const up = u.members.filter((_, i) => hp[i] > 0);
  if (!up.length) return { damage: 0, dodge: 0, agi: 0 };
  const extra = u.pack ? up.length - 1 : 0;
  const hits = up.map(m => m.damage * (foe ? sizeEdge(m, foe) : 1)).sort((a, b) => b - a);
  const damage = hits.reduce((t, d, i) => t + d * (i ? PACK_REACH : 1), 0) * (1 + PACK_BONUS * extra);
  const dodge = Math.min(0.75, up.reduce((t, m) => t + m.dodge, 0) / up.length * (1 + PACK_BONUS * extra));
  const agi = up.reduce((t, m) => t + m.agi, 0) / up.length;
  return { damage, dodge, agi };
}
export const unitHp = u => u.members.reduce((t, m) => t + m.hp, 0);

// log: [{ by: unit index, miss } | { by, dmg, left }] for the team's blows, left being the creature's
// health; [{ by: 'foe', to, member, miss } | { by: 'foe', to, member, dmg, left }] for the creature's,
// left being the struck member's health. hp: every member's health at the end, per unit.
export function teamFight(units, foe, rand) {
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
        const dmg = Math.max(1, Math.round(foe.damage * sizeEdge(foe, hit) * (1 - hit.reduction) * (0.75 + rand() * 0.5)));
        hp[to][member] = Math.max(0, hp[to][member] - dmg);
        log.push({ by: 'foe', to, member, dmg, left: hp[to][member] });
      } else {
        if (!standing(hp[who]).length) continue;
        if (rand() < foe.dodge) { log.push({ by: who, miss: true }); continue; }
        const dmg = Math.max(1, Math.round(unitPower(units[who], hp[who], foe).damage * (1 - foe.reduction) * (0.75 + rand() * 0.5)));
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
