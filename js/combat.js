// Auto-combat between two fighters. Pure: give it both sides and a random source, it returns who won
// and every blow, so the server decides the fight and the browser replays the same blows.
//
// A fighter is { name, hp, damage, dodge, reduction, agi } (deriveCombat in economy.js plus agility).
// The faster one strikes first, then they take turns. Each blow can be dodged (dodge chance);
// otherwise it deals damage × (1 − reduction), ±25%, at least 1.
import { CREATURES, CREATURE_LEVEL, LAIR_LEVEL, FIGHT_MAX_TURNS } from './config.js';
import { deriveCombat, statSheet, seededRand } from './economy.js';

export function fighterOf(baby) {
  const sheet = statSheet(baby);
  return { name: baby.name, ...sheet.derived, agi: sheet.stats.agi, power: sheet.power };
}

// a creature at a distance from the nest, stronger in a lair
export function creatureFighter(id, dist, lair = false) {
  const c = CREATURES[id];
  const level = CREATURE_LEVEL(dist) * (lair ? LAIR_LEVEL : 1);
  const stats = Object.fromEntries(Object.entries(c.stats).map(([k, v]) => [k, Math.max(1, Math.round(v * level))]));
  const power = Object.values(stats).reduce((t, v) => t + v, 0);
  return { name: (lair ? 'Alpha ' : '') + c.name, ...deriveCombat(stats), agi: stats.agi, power, level };
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
      const dmg = Math.max(1, Math.round(att.damage * (1 - def.reduction) * (0.75 + rand() * 0.5)));
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

export const DANGER = [[0.85, 'Easy'], [0.6, 'Fair'], [0.3, 'Hard'], [0, 'Deadly']];
export const dangerOf = chance => DANGER.find(([min]) => chance >= min)[1];
