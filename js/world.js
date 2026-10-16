// World map rules: a hex map around the nest, hidden under fog, and the expeditions that reveal it.
// Like economy.js these only work on the state passed in, so the browser and the server share them.
//
// Hexes use axial coordinates (q, r) with the nest at 0,0, and are stored as "q,r" keys.
// s.world = { seed, revealed: [key], visited: [key], trips, expeditions: [{ id, team, members, hex, trip, startedAt, returnAt }] }
// An expedition's team is up to TEAM_SLOTS units, each { kind: 'dino' | 'player' | 'pack', id, members: [id] }
// (a pack's members as they were when it set out); members lists everyone out on it.
import {
  BIOMES, ITEMS, WORLD_RADIUS, TRIP_MINS_PER_HEX, EXPEDITION_SLOTS, TEAM_SLOTS, JUVENILE_RANGE, DISCOVERY_COINS_PER_HEX, LOOT_PER_HEX,
  LAIR_SHARE, LAIR_MIN_DIST, ENCOUNTER_CHANCE, WIN_COINS_PER_HEX, GEAR_DROP, INJURY_MINS, BRUISE_MINS, HEAL_MINS, CRITICAL_MINS,
  EGG_CHANCE, EGG_GENES, EGG_TRAY_SIZE, STATS, PLAYER_ID, SPECIES, RARITIES, ROLES, SCOUT, FRENZY_DROPS, PACK_LIMITS, FRILL, TOUGH, SIZE_ORDER, PACK_BONUS, HUNT_SIGHTINGS,
} from './config.js';
import { addItem, removeItem, countItem, earn, stageOf, isHungry, hungerEvery, seededRand } from './economy.js';
import { fighterOf, encounterUnit, teamFight, unitOf } from './combat.js';
import { hashId } from './util.js';

// ---------- hex geometry ----------
export const hexKey = (q, r) => `${q},${r}`;
export function parseKey(key) {
  const m = /^(-?\d+),(-?\d+)$/.exec(String(key));
  return m ? [Number(m[1]), Number(m[2])] : null;
}
export const hexDist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const inWorld = h => !!h && hexDist(h) <= WORLD_RADIUS;
export const neighbors = ([q, r]) => DIRS.map(([dq, dr]) => [q + dq, r + dr]).filter(inWorld);

// every hex of the map, nest first
export const ALL_HEXES = (() => {
  const out = [];
  for (let q = -WORLD_RADIUS; q <= WORLD_RADIUS; q++)
    for (let r = -WORLD_RADIUS; r <= WORLD_RADIUS; r++) if (inWorld([q, r])) out.push([q, r]);
  return out.sort((a, b) => hexDist(a) - hexDist(b));
})();

// ---------- generation ----------
// A smooth random field: each hex's own value blended with the hexes up to two steps away, so
// biomes form patches instead of noise.
function mix(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
const cell = (seed, salt, q, r) => mix(mix(mix(seed + salt) + q * 73856093) + r * 19349663) / 4294967296;
function field(seed, salt, [q, r]) {
  let total = 0, weight = 0;
  for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) {
    const d = hexDist([dq, dr]);
    if (d > 2) continue;
    const w = 3 - d;
    total += cell(seed, salt, q + dq, r + dr) * w; weight += w;
  }
  return total / weight;
}

// Biomes are shared out by rank, so every map gets a similar mix: the hottest hexes become volcano
// (only far from the nest; nearer, badlands), the next hottest and dry ones badlands, then the
// wettest swamp, the next forest, and the rest meadow. The nest's surroundings are always meadow.
const SHARE = { hot: 0.16, dry: 0.12, swamp: 0.22, forest: 0.3 };
const maps = new Map();
function biomeMap(seed) {
  if (maps.has(seed)) return maps.get(seed);
  const hexes = ALL_HEXES.filter(h => hexDist(h) > 1).map(h => ({ h, wet: field(seed, 0x9e3779b9, h), heat: field(seed, 0x85ebca6b, h) }));
  const out = new Map(ALL_HEXES.map(h => [hexKey(...h), 'meadow']));
  const n = hexes.length, take = (list, share) => list.slice(0, Math.round(n * share));
  const byHeat = [...hexes].sort((a, b) => b.heat - a.heat);
  for (const x of take(byHeat, SHARE.hot)) out.set(hexKey(...x.h), hexDist(x.h) >= 4 ? 'volcano' : 'badlands');
  const left = () => hexes.filter(x => out.get(hexKey(...x.h)) === 'meadow');
  for (const x of take(left().sort((a, b) => (b.heat - b.wet) - (a.heat - a.wet)), SHARE.dry)) out.set(hexKey(...x.h), 'badlands');
  const byWet = left().sort((a, b) => b.wet - a.wet);
  for (const x of take(byWet, SHARE.swamp)) out.set(hexKey(...x.h), 'swamp');
  for (const x of take(byWet.slice(Math.round(n * SHARE.swamp)), SHARE.forest)) out.set(hexKey(...x.h), 'forest');
  if (maps.size > 50) maps.clear();
  maps.set(seed, out);
  return out;
}
export const biomeAt = (seed, h) => biomeMap(seed).get(hexKey(...h)) || 'meadow';

// The eggs a hex can give: its biome's species whose rarity is allowed that far from the nest (a lair
// counts 2 hexes farther, and legendaries are only found in lairs), each with its rarity's weight.
export function eggKinds(biome, d, lair) {
  return BIOMES[biome].eggs
    .map(type => ({ type, r: RARITIES[SPECIES[type].rarity] }))
    .filter(({ r }) => d + (lair ? 2 : 0) >= r.minDist && (!r.lairOnly || lair))
    .map(({ type, r }) => ({ type, weight: r.weight }));
}
function pickWeighted(list, rand) {
  let x = rand() * list.reduce((t, k) => t + k.weight, 0);
  for (const k of list) { x -= k.weight; if (x < 0) return k.type; }
  return list[list.length - 1].type;
}

// lairs: a few hexes 3+ away where an animal always waits, stronger
export const isLair = (seed, h) => hexDist(h) >= LAIR_MIN_DIST && cell(seed, 0x27d4eb2f, ...h) < LAIR_SHARE;
// what waits in a hex: one of its biome's wild animals (WILD), the same every time, how likely a
// fight is, and whether it is a lair. foe is the unit it fights as; id names it (a species or a creature).
export function threatAt(seed, h) {
  const lair = isLair(seed, h);
  const list = BIOMES[biomeAt(seed, h)].wild;
  let x = cell(seed, 0x165667b1, ...h) * list.reduce((t, e) => t + e.weight, 0);
  const entry = list.find(e => (x -= e.weight) < 0) || list[list.length - 1];
  const foe = encounterUnit(entry, hexDist(h), lair);
  return {
    id: entry.species || entry.creature, entry, lair, chance: lair ? 1 : ENCOUNTER_CHANCE(hexDist(h)), foe,
    power: foe.members.reduce((t, m) => t + m.power, 0),
  };
}

export function newWorld(seed) {
  const home = [0, 0];
  return { seed, revealed: [hexKey(0, 0), ...neighbors(home).map(h => hexKey(...h))], visited: [hexKey(0, 0)], trips: 0, expeditions: [], sightings: [] };
}

// a seed for saves made before the world existed: taken from the save itself, so the browser and
// the server come up with the same one
export const seedFor = s => hashId('world:' + ((s.hatched || []).map(b => b && b.id).join('|') || s.updatedAt || 'nest')) || 1;

// ---------- what the player can see and reach ----------
// an explorer: one of the dinosaurs, or the player's own explorer
export const explorerOf = (s, id) => id === PLAYER_ID ? s.player : s.hatched.find(x => x.id === id);
const W = s => s.world;
export const isRevealed = (s, key) => W(s).revealed.includes(key);
// hexes an expedition can go to: revealed ones and the fog right next to them (not the nest itself)
export function canReach(s, key) {
  const h = parseKey(key);
  if (!inWorld(h) || hexDist(h) === 0) return false;
  return isRevealed(s, key) || neighbors(h).some(n => isRevealed(s, hexKey(...n)));
}
// minutes for a trip there and back
export const tripMins = key => hexDist(parseKey(key)) * TRIP_MINS_PER_HEX;

// a scout (ROLES) in a team leads it: faster trips, fewer fights outside lairs, more eggs
export const hasScout = (s, members) => members.some(id => {
  const b = id !== PLAYER_ID && s.hatched.find(x => x.id === id);
  return !!b && (ROLES[b.type] || {}).ability === 'scout' && stageOf(b).id !== 'baby';
});
// a team's trip there and back, in minutes
export const teamTripMins = (s, members, key) => tripMins(key) * (hasScout(s, members) ? SCOUT.trip : 1);

// injured dinosaurs heal with time; a Healing Herb speeds it up
export const injuredLeft = (b, now) => Math.max(0, ((b && b.injuredUntil) || 0) - now);
// brought down in a fight: herbs don't help, a Blood Transfusion does
export const isCritical = (b, now) => !!(b && b.critical) && injuredLeft(b, now) > 0;
export function transfuse(s, babyId, now) {
  const b = s.hatched.find(x => x.id === babyId);
  if (!b) return { ok: false, reason: 'missing' };
  if (!isCritical(b, now)) return { ok: false, reason: 'not-critical' };
  if (countItem(s, 'transfusion') < 1) return { ok: false, reason: 'no-transfusion' };
  removeItem(s, 'transfusion', 1);
  delete b.injuredUntil;
  delete b.critical;
  return { ok: true };
}
export function healBaby(s, babyId, now) {
  const b = explorerOf(s, babyId);
  if (!b) return { ok: false, reason: 'missing' };
  if (!injuredLeft(b, now)) return { ok: false, reason: 'not-injured' };
  if (isCritical(b, now)) return { ok: false, reason: 'critical' };
  if (countItem(s, 'herb') < 1) return { ok: false, reason: 'no-herb' };
  removeItem(s, 'herb', 1);
  b.injuredUntil -= HEAL_MINS * 60000;
  if (b.injuredUntil <= now) delete b.injuredUntil;
  return { ok: true, left: injuredLeft(b, now) };
}

// a Triceratops' frill (FRILL.hp when whole); a Healing Herb mends a point of it
export const frillOf = b => SPECIES[b.type] && SPECIES[b.type].frill ? Math.max(0, Math.min(FRILL.hp, b.frill ?? FRILL.hp)) : null;
export function mendFrill(s, babyId) {
  const b = s.hatched.find(x => x.id === babyId);
  if (!b || frillOf(b) === null) return { ok: false, reason: 'no-frill' };
  if (frillOf(b) >= FRILL.hp) return { ok: false, reason: 'whole' };
  if (isAway(s, babyId)) return { ok: false, reason: 'away' };
  if (countItem(s, 'herb') < 1) return { ok: false, reason: 'no-herb' };
  removeItem(s, 'herb', 1);
  b.frill = frillOf(b) + 1;
  if (b.frill >= FRILL.hp) delete b.frill;
  return { ok: true, frill: frillOf(b) };
}

export const expeditionOf = (s, id) => W(s).expeditions.find(e => e.members.includes(id)) || null;
export const isAway = (s, id) => !!expeditionOf(s, id);

// the items a hex can give, with quantities already scaled by its distance
export function lootTable(s, key) {
  const h = parseKey(key);
  const mult = 1 + (hexDist(h) - 1) * LOOT_PER_HEX;
  return BIOMES[biomeAt(W(s).seed, h)].loot.map(([id, min, max, chance = 1]) =>
    ({ id, min: Math.max(1, Math.round(min * mult)), max: Math.max(1, Math.round(max * mult)), chance }));
}

// why this explorer can't go to this hex now, or null when it can
export function memberProblem(s, id, key, now) {
  const b = explorerOf(s, id);
  if (!b) return 'missing';
  // the player goes anywhere and never gets hungry
  const me = id === PLAYER_ID;
  const stage = me ? 'adult' : stageOf(b).id;
  if (stage === 'baby') return 'too-young';
  if (stage === 'juvenile' && hexDist(parseKey(key)) > JUVENILE_RANGE) return 'too-far';
  if (isAway(s, id)) return 'away';
  if (s.breeding && (s.breeding.maleId === id || s.breeding.femaleId === id)) return 'breeding';
  if (injuredLeft(b, now)) return 'injured';
  if (!me && isHungry(b, now)) return 'hungry';
  return null;
}

// a team as asked for ([{ kind, id }], or one explorer's id as before teams) with every unit's members
export function teamFrom(s, team) {
  if (typeof team === 'string') team = [{ kind: team === PLAYER_ID ? 'player' : 'dino', id: team }];
  if (!Array.isArray(team)) return null;
  return team.map(u => {
    if (!u || typeof u !== 'object') return null;
    if (u.kind === 'player') return { kind: 'player', id: PLAYER_ID, members: [PLAYER_ID] };
    if (u.kind === 'dino') return s.hatched.some(b => b.id === u.id) ? { kind: 'dino', id: u.id, members: [u.id] } : null;
    if (u.kind === 'pack') {
      const p = (s.packs || []).find(x => x.id === u.id);
      return p ? { kind: 'pack', id: p.id, members: [...p.members] } : null;
    }
    return null;
  });
}

// why this team can't go to this hex now, or null when it can
export function exploreProblem(s, team, key, now) {
  const units = teamFrom(s, team);
  if (!units || !units.length) return 'no-team';
  if (units.includes(null)) return 'missing';
  if (units.length > TEAM_SLOTS) return 'team-full';
  const h = parseKey(key);
  if (!inWorld(h)) return 'out-of-map';
  if (hexDist(h) === 0) return 'home';
  if (!canReach(s, key)) return 'unreachable';
  const members = units.flatMap(u => u.members);
  if (new Set(members).size !== members.length) return 'twice';
  for (const id of members) {
    const problem = memberProblem(s, id, key, now);
    if (problem) return problem;
  }
  if (W(s).expeditions.length >= EXPEDITION_SLOTS) return 'no-slot';
  return null;
}

export function startExpedition(s, team, key, now) {
  const problem = exploreProblem(s, team, key, now);
  if (problem) return { ok: false, reason: problem };
  const w = W(s);
  const units = teamFrom(s, team), members = units.flatMap(u => u.members);
  w.trips += 1;
  // the trip number seeds the loot, so the browser and the server roll the same things
  const exp = {
    id: `t${w.trips}`, team: units, members,
    hex: key, trip: w.trips, startedAt: now, returnAt: now + teamTripMins(s, members, key) * 60000,
  };
  w.expeditions.push(exp);
  return { ok: true, expedition: exp };
}

// a pack at its species' limit, of a species with fullPack, gets more of every stat
export function fullPackMods(type, n) {
  const sp = type && SPECIES[type];
  return sp && sp.fullPack && n >= PACK_LIMITS[type] ? STATS.map(({ id }) => ({ stat: id, type: 'increased', value: sp.fullPack })) : [];
}

// the fighting side of a team: a unit per dinosaur, the player, or pack
export function teamUnits(s, units) {
  return units.map(u => {
    const pack = u.kind === 'pack' && (s.packs || []).find(p => p.id === u.id);
    const bonus = fullPackMods(pack ? pack.type : null, u.members.length);
    const fighters = u.members.map(id => explorerOf(s, id)).filter(Boolean).map(b => fighterOf(b, bonus));
    return unitOf(u.kind === 'pack' ? (pack ? pack.name : 'Pack') : (fighters[0] || { name: '?' }).name, fighters, u.kind === 'pack');
  }).filter(u => u.members.length);
}

// ---------- keeping away and hunting ----------
const sizeRank = size => SIZE_ORDER.indexOf(size || 'small');
// a wild animal that doesn't show itself to this team (fighters, from teamUnits): it keeps away from
// anything bigger than its fear
export function keepsAway(threat, team) {
  const sp = threat.entry.species && SPECIES[threat.entry.species];
  if (!sp || !sp.fear) return false;
  return team.some(u => u.members.some(m => sizeRank(m.size) > sizeRank(sp.fear)));
}

// the team's best chance to hunt one of these (prey: one of them as a fighter), or null when nobody
// can: a carnivore no smaller than it, by its agility and hunting skill against the prey's agility
export function huntOdds(team, prey) {
  let best = null;
  team.forEach((u, i) => {
    const able = u.members.filter(m => m.type && SPECIES[m.type] && SPECIES[m.type].hunt && sizeRank(m.size) >= sizeRank(prey.size));
    if (!able.length) return;
    const top = able.reduce((b, m) => m.agi + SPECIES[m.type].hunt > b.agi + SPECIES[b.type].hunt ? m : b);
    const score = (top.agi + SPECIES[top.type].hunt) * (1 + PACK_BONUS * (u.pack ? u.members.length - 1 : 0));
    const chance = score / (score + prey.agi);
    if (!best || chance > best.chance) best = { unit: i, hunter: u.pack ? u.name : top.name, chance };
  });
  return best;
}

// decides on a group the team spotted at a distance (w.sightings): go after one of them, or let them be
export function huntSighting(s, { id, go }) {
  const w = W(s);
  const at = (w.sightings || []).findIndex(x => x.id === id);
  if (at < 0) return { ok: false, reason: 'no-sighting' };
  const sight = w.sightings.splice(at, 1)[0];
  if (!go) return { ok: true, hunted: false, sighting: sight };
  const rand = seededRand(`hunt:${w.seed}:${sight.trip}`);
  if (rand() >= sight.chance) return { ok: true, hunted: true, caught: false, sighting: sight };
  const loot = [];
  for (const [item, min, max] of sight.loot) {
    const n = min + Math.floor(rand() * (max - min + 1));
    if (n > 0) loot.push({ id: item, n, lost: addItem(s, item, n) });
  }
  if (sight.coins) earn(s, sight.coins);
  return { ok: true, hunted: true, caught: true, sighting: sight, loot, coins: sight.coins };
}

// calls the dinosaur back early: no loot, no new map, but it is free again right away
export function recallExpedition(s, id) {
  const w = W(s);
  if (!w.expeditions.some(e => e.id === id)) return { ok: false, reason: 'no-expedition' };
  w.expeditions = w.expeditions.filter(e => e.id !== id);
  return { ok: true };
}

// the dinosaur is back: the hex and its neighbours are revealed, the loot goes to the inventory
// (what does not fit is lost), a first visit pays discovery coins, and the trip leaves it hungry
export function collectExpedition(s, id, now) {
  const w = W(s);
  const exp = w.expeditions.find(e => e.id === id);
  if (!exp) return { ok: false, reason: 'no-expedition' };
  if (now < exp.returnAt) return { ok: false, reason: 'not-back' };
  const h = parseKey(exp.hex), d = hexDist(h);
  const units = exp.team.map(u => ({ ...u, members: u.members.filter(id => explorerOf(s, id)) })).filter(u => u.members.length);
  // the trip number seeds everything, so the browser and the server roll the same trip
  const rand = seededRand(`trip:${w.seed}:${exp.trip}`);
  const fightRand = seededRand(`fight:${w.seed}:${exp.trip}`);
  const loot = [];
  const give = (item, n) => { const lost = addItem(s, item, n); loot.push({ id: item, n, lost }); };
  const roll = ({ min, max }) => min + Math.floor(rand() * (max - min + 1));

  // a creature may be waiting; losing means coming home hurt with nothing
  let battle = null;
  const threat = threatAt(w.seed, h);
  const scout = hasScout(s, exp.members);
  let sighting = null;
  const meets = units.length && fightRand() < threat.chance * (scout && !threat.lair ? SCOUT.encounter : 1);
  // what keeps away from the team may still be spotted at a distance, and hunted
  if (meets && keepsAway(threat, teamUnits(s, units))) {
    const odds = huntOdds(teamUnits(s, units), threat.foe.members[0]);
    if (odds) {
      const mult = 1 + (d - 1) * LOOT_PER_HEX;
      sighting = {
        id: `sight-${w.seed}-${exp.trip}`, trip: exp.trip, hex: exp.hex, species: threat.entry.species, name: threat.foe.name,
        count: threat.foe.members.length, hunter: odds.hunter, chance: Math.round(odds.chance * 1000) / 1000,
        loot: threat.entry.loot.map(([item, min, max]) => [item, Math.round(min * mult), Math.round(max * mult)]),
        coins: d * WIN_COINS_PER_HEX * (threat.lair ? 2 : 1),
      };
      w.sightings = [...(w.sightings || []), sighting].slice(-HUNT_SIGHTINGS);
    }
  } else if (meets) {
    const team = teamUnits(s, units), foe = threat.foe;
    const result = teamFight(team, foe, fightRand, { swamp: biomeAt(w.seed, h) === 'swamp' });
    // a dinosaur that went down is critically injured (the player just injured); the rest are
    // bruised by how much health they lost, and everyone is injured when the team loses
    const injured = [];
    // those who ran before the fight come home unhurt
    units.forEach((u, i) => !result.fled.includes(i) && u.members.forEach((id, j) => {
      const left = result.hp[i][j] / team[i].members[j].hp;
      const critical = left <= 0 && id !== PLAYER_ID;
      // a leg lamed by a bone-breaking bite comes home injured at least
      const lame = result.lamed.some(([a, b]) => a === i && b === j);
      let mins = critical ? CRITICAL_MINS : !result.win || left <= 0 || lame ? INJURY_MINS : left < 0.5 ? Math.round(BRUISE_MINS * (1 - left * 2)) : 0;
      if (!mins) return;
      const b = explorerOf(s, id);
      // a tough one (Dilophosaurus) heals in half the time, a critical injury aside
      if (!critical && b.type && SPECIES[b.type].tough) mins = Math.max(1, Math.round(mins * TOUGH.heal));
      b.injuredUntil = now + mins * 60000;
      if (critical) b.critical = true; else delete b.critical;
      injured.push({ id, mins, ...(critical ? { critical } : {}) });
    }));
    // a frill keeps the damage it took until it is mended
    units.forEach((u, i) => !result.fled.includes(i) && u.members.forEach((id, j) => {
      const f = result.frill[i] && result.frill[i][j];
      if (f !== null && f !== undefined) explorerOf(s, id).frill = f;
    }));
    battle = {
      creature: threat.id, lair: threat.lair, foe: { name: foe.name, power: threat.power, hp: result.foeMax, count: foe.members.length, pack: foe.pack },
      team: team.map((t, i) => ({ name: t.name, kind: units[i].kind, members: units[i].members, hp: t.members.map(m => m.hp), power: t.members.reduce((x, m) => x + m.power, 0),
        ...(t.members.some(m => m.frill !== undefined) ? { frill: t.members.map(m => m.frill ?? null) } : {}) })),
      ...result, injured,
      // how many of a rival species (Allosaurus) were in the team, for the frenzy drops
      frenzyCount: exp.members.filter(id => { const b = id !== PLAYER_ID && explorerOf(s, id); return b && SPECIES[b.type].rival; }).length,
    };
  }
  // a team that ran off still looked around the hex, but the animal's loot is not theirs
  const won = !battle || battle.win || battle.escaped;

  let coins = 0, discovered = false, foundEgg = null;
  if (won) {
    for (const l of lootTable(s, exp.hex)) if (rand() < l.chance) give(l.id, roll(l));
    if (battle && battle.win) {
      const mult = 1 + (d - 1) * LOOT_PER_HEX;
      for (const [item, min, max] of threat.entry.loot) give(item, roll({ min: Math.round(min * mult), max: Math.round(max * mult) }));
      coins += d * WIN_COINS_PER_HEX * (battle.lair ? 2 : 1);
      // a fight that went into a frenzy drops what nothing else gives, more with more of them in it
      if (battle.frenzy.length) {
        const n = battle.frenzyCount;
        for (const drop of FRENZY_DROPS) if (rand() < drop.chance(n)) give(drop.id, roll({ min: drop.min(n), max: drop.max(n) }));
      }
      // equipment that drops is the kind sold in the Shop; forged pieces only come from the Forge
      if (rand() < GEAR_DROP(d, battle.lair)) {
        const gear = Object.keys(ITEMS).filter(id => ITEMS[id].kind === 'gear' && ITEMS[id].price);
        give(gear[Math.floor(rand() * gear.length)], 1);
      }
    }
    // an egg of one of the biome's species, for the egg tray
    const lair = !!(battle && battle.win && battle.lair);
    const kinds = eggKinds(biomeAt(w.seed, h), d, lair);
    if (kinds.length && rand() < EGG_CHANCE(d, lair) * (scout ? SCOUT.egg : 1)) {
      const [lo, hi] = EGG_GENES(d, lair);
      const egg = {
        id: `egg-${w.seed}-${exp.trip}`, type: pickWeighted(kinds, rand), gen: 1, parents: [], laidAt: now,
        genes: Object.fromEntries(STATS.map(({ id: st }) => [st, lo + Math.floor(rand() * (hi - lo + 1))])),
      };
      s.eggs = s.eggs || [];
      if (s.eggs.length < EGG_TRAY_SIZE) { s.eggs.push(egg); foundEgg = egg; }
      else foundEgg = { ...egg, lost: true };
    }
    discovered = !w.visited.includes(exp.hex);
    if (discovered) { coins += d * DISCOVERY_COINS_PER_HEX; w.visited.push(exp.hex); }
    if (coins) earn(s, coins);
  }
  // even a beaten explorer saw the land
  const newly = [exp.hex, ...neighbors(h).map(n => hexKey(...n))].filter(k => !w.revealed.includes(k));
  w.revealed.push(...newly);
  w.expeditions = w.expeditions.filter(e => e.id !== id);
  for (const id of exp.members) {
    const b = explorerOf(s, id);
    if (b && id !== PLAYER_ID) b.lastFed = now - hungerEvery(b);
  }
  return { ok: true, hex: exp.hex, biome: biomeAt(w.seed, h), team: exp.team, members: exp.members, loot, coins, discovered, revealed: newly.length, battle, sighting, egg: foundEgg };
}

// keeps a loaded world inside the rules whatever produced it
export function cleanWorld(world, s) {
  const w = world && typeof world === 'object' ? world : newWorld(seedFor(s));
  const keys = list => [...new Set((Array.isArray(list) ? list : []).filter(k => inWorld(parseKey(k))))];
  const home = newWorld(1);
  const ids = new Set([PLAYER_ID, ...s.hatched.map(b => b.id)]);
  const seen = new Set();
  const KINDS = ['dino', 'player', 'pack'];
  // a team with only real explorers, each out once
  const cleanTeam = e => {
    const team = (Array.isArray(e.team) ? e.team : e.babyId ? [{ kind: e.babyId === PLAYER_ID ? 'player' : 'dino', id: e.babyId, members: [e.babyId] }] : [])
      .filter(u => u && KINDS.includes(u.kind))
      .map(u => ({ kind: u.kind, id: String(u.id), members: (Array.isArray(u.members) ? u.members : [u.id]).filter(id => ids.has(id) && !seen.has(id) && seen.add(id)) }))
      .filter(u => u.members.length)
      .slice(0, TEAM_SLOTS);
    return team;
  };
  return {
    seed: Number.isInteger(w.seed) && w.seed > 0 ? w.seed : seedFor(s),
    revealed: keys([...home.revealed, ...keys(w.revealed)]),
    visited: keys([...home.visited, ...keys(w.visited)]),
    trips: Math.max(0, Math.floor(Number(w.trips) || 0)),
    // groups spotted at a distance, waiting for the player to hunt them or let them be
    sightings: (Array.isArray(w.sightings) ? w.sightings : [])
      .filter(x => x && SPECIES[x.species] && Array.isArray(x.loot))
      .slice(-HUNT_SIGHTINGS)
      .map(x => ({
        id: String(x.id), trip: Math.max(1, Math.floor(Number(x.trip) || 1)), hex: String(x.hex), species: x.species, name: String(x.name || SPECIES[x.species].species).slice(0, 60),
        count: Math.max(1, Math.floor(Number(x.count) || 1)), hunter: String(x.hunter || '').slice(0, 24), chance: Math.max(0, Math.min(1, Number(x.chance) || 0)),
        loot: x.loot.filter(l => Array.isArray(l) && ITEMS[l[0]]).map(([item, min, max]) => [item, Math.max(0, Math.floor(Number(min) || 0)), Math.max(0, Math.floor(Number(max) || 0))]),
        coins: Math.max(0, Math.floor(Number(x.coins) || 0)),
      })),
    expeditions: (Array.isArray(w.expeditions) ? w.expeditions : [])
      .filter(e => e && inWorld(parseKey(e.hex)) && hexDist(parseKey(e.hex)) > 0)
      .map(e => ({ ...e, team: cleanTeam(e) }))
      .filter(e => e.team.length)
      .slice(0, EXPEDITION_SLOTS)
      .map(e => ({
        id: String(e.id), team: e.team, members: e.team.flatMap(u => u.members), hex: e.hex, trip: Math.max(1, Math.floor(Number(e.trip) || 1)),
        startedAt: Number(e.startedAt) || 0,
        // never sooner than the trip really takes
        returnAt: Math.max(Number(e.returnAt) || 0, (Number(e.startedAt) || 0) + teamTripMins(s, e.team.flatMap(u => u.members), e.hex) * 60000),
      })),
  };
}
