// World map rules: a hex map around the nest, hidden under fog, and the expeditions that reveal it.
// Like economy.js these only work on the state passed in, so the browser and the server share them.
//
// Hexes use axial coordinates (q, r) with the nest at 0,0, and are stored as "q,r" keys.
// s.world = { seed, revealed: [key], visited: [key], trips, expeditions: [parties out (journey.js)] }
// A party's team is up to TEAM_SLOTS units, each { kind: 'dino' | 'player' | 'pack', id, members: [id] }
// (a pack's members as they were when it set out); members lists everyone out on it.
import {
  BIOMES, ITEMS, MAP_VERSION, TRAVEL, EXPEDITION_SLOTS, TEAM_SLOTS, INTERCEPT, DISCOVERY_COINS_PER_HEX, LOOT_PER_HEX,
  LAIR_SHARE, LAIR_MIN_DIST, AGES, ALPHA_STEP, EGG_STEP, NEST_CALM, NEST_FAR, WIN_COINS_PER_HEX, GEAR_DROP, INJURY_MINS, BRUISE_MINS, HEAL_MINS, CRITICAL_MINS,
  EGG_CHANCE, EGG_GENES, EGG_TRAY_SIZE, STATS, PLAYER_ID, SPECIES, RARITIES, ROLES, SCOUT, FRENZY_DROPS, PACK_LIMITS, FRILL, TOUGH, SIZE_ORDER, PACK_BONUS, VISIBILITY, PLAYER_SIZE, RUNNER, DEATH, PACK_MIN, WATER_BIOMES, SAIL, ZIGZAG, EYES, CHASE, WITNESS,
} from './config.js';
import { CREATURES } from './config.js';
import { addItem, removeItem, countItem, earn, stageOf, isHungry, hungerEvery, seededRand } from './economy.js';
import { fighterOf, encounterUnit, teamFight, unitOf, whoFlees, isPrey, hitOf } from './combat.js';
import { hashId } from './util.js';
import { inMap, mapNeighbors, MAP_HEXES, isWater, cellAt, travelCost, travelPath } from './map.js';

// ---------- hex geometry ----------
export const hexKey = (q, r) => `${q},${r}`;
export function parseKey(key) {
  const m = /^(-?\d+),(-?\d+)$/.exec(String(key));
  return m ? [Number(m[1]), Number(m[2])] : null;
}
export const hexDist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
// the map itself (map.js): a supercontinent around the nest
export const inWorld = inMap;
export const neighbors = mapNeighbors;
// every hex of the map, nest first
export const ALL_HEXES = MAP_HEXES;
// the land hexes of a world: where expeditions can go
export const landHexes = seed => ALL_HEXES.filter(h => !isWater(seed, h));
export { isWater, cellAt, travelCost, travelPath };

// a hash of a hex, for what is fixed about it (lairs)
function mix(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
const cell = (seed, salt, q, r) => mix(mix(mix(seed + salt) + q * 73856093) + r * 19349663) / 4294967296;
// a hex's biome (water has none: it reads as Swamp, though no one goes there)
export const biomeAt = (seed, h) => (cellAt(seed, h) || {}).biome || 'swamp';
// whether a hex is by the water, for fishers (Baryonyx, Spinosaurus): a swamp, a river, or the shore
// of a lake or the sea
export const watery = (seed, h) => WATER_BIOMES.includes(biomeAt(seed, h)) || !!(cellAt(seed, h) || {}).river || neighbors(h).some(n => isWater(seed, n));

// The eggs a hex can give: its biome's species, each with its rarity's weight (legendaries are only
// found in lairs).
export function eggKinds(biome, d, lair) {
  return BIOMES[biome].eggs
    .map(type => ({ type, r: RARITIES[SPECIES[type].rarity] }))
    .filter(({ r }) => !r.lairOnly || lair)
    .map(({ type, r }) => ({ type, weight: r.weight }));
}
export function pickWeighted(list, rand) {
  let x = rand() * list.reduce((t, k) => t + k.weight, 0);
  for (const k of list) { x -= k.weight; if (x < 0) return k.type; }
  return list[list.length - 1].type;
}

// lairs: a few hexes away from the nest where an animal always waits, stronger
export const isLair = (seed, h) => hexDist(h) > NEST_CALM && !isWater(seed, h) && cell(seed, 0x27d4eb2f, ...h) < LAIR_SHARE;
const isPredatorEntry = e => (e.creature ? true : (SPECIES[e.species].role || 'attacker') === 'attacker');
const isBigPredator = e => isPredatorEntry(e) && sizeRank(e.creature ? CREATURES[e.creature].size : SPECIES[e.species].size) >= sizeRank('large');
// the wild animals of a hex's biome that can live there: no predators near the nest, no big ones
// within NEST_FAR of it (a newcomer doesn't run into a Tyrannosaurus by chance)
export const wildFor = (seed, h) => {
  const all = BIOMES[biomeAt(seed, h)].wild;
  const list = hexDist(h) > NEST_FAR ? all : all.filter(e => !isBigPredator(e)).length ? all.filter(e => !isBigPredator(e)) : all;
  if (hexDist(h) > NEST_CALM) return list;
  // (a biome of nothing but predators: the meadow's small ones wander in instead)
  const calm = list.filter(e => !isPredatorEntry(e));
  return calm.length ? calm : BIOMES.meadow.wild.filter(e => !isPredatorEntry(e));
};
// what waits in a hex: one of its biome's wild animals (WILD), the same every time, how old it is (AGES:
// a lair holds an Alpha), how likely a fight is (the biome's density), and whether it is a lair. foe is
// the unit it fights as; id names it (a species or a creature); step is its strength (AGES).
export function threatAt(seed, h) {
  const lair = isLair(seed, h);
  const list = wildFor(seed, h);
  let x = cell(seed, 0x165667b1, ...h) * list.reduce((t, e) => t + e.weight, 0);
  const entry = list.find(e => (x -= e.weight) < 0) || list[list.length - 1];
  let y = cell(seed, 0x7f4a7c15, ...h) * Object.values(AGES).reduce((t, a) => t + a.weight, 0);
  const age = lair ? 'alpha' : Object.keys(AGES).find(k => (y -= AGES[k].weight) < 0) || 'adult';
  const step = lair ? ALPHA_STEP : AGES[age].step;
  const unit = encounterUnit(entry, step, lair);
  const label = lair ? '' : AGES[age].name;
  const foe = label ? { ...unit, name: `${label} ${unit.name}` } : unit;
  return {
    id: entry.species || entry.creature, entry, lair, age, step, chance: lair ? 1 : BIOMES[biomeAt(seed, h)].density, foe,
    power: foe.members.reduce((t, m) => t + m.power, 0),
  };
}

export function newWorld(seed) {
  const home = [0, 0];
  return { seed, map: MAP_VERSION, revealed: [hexKey(0, 0), ...neighbors(home).map(h => hexKey(...h))], visited: [hexKey(0, 0)], trips: 0, expeditions: [] };
}

// a seed for saves made before the world existed: taken from the save itself, so the browser and
// the server come up with the same one
export const seedFor = s => hashId('world:' + ((s.hatched || []).map(b => b && b.id).join('|') || s.updatedAt || 'nest')) || 1;

// ---------- what the player can see and reach ----------
// an explorer: one of the dinosaurs, or the player's own explorer
export const explorerOf = (s, id) => id === PLAYER_ID ? s.player : s.hatched.find(x => x.id === id);
const W = s => s.world;
export const isRevealed = (s, key) => W(s).revealed.includes(key);
// hexes an expedition can go to: any land the nest's continent reaches, however far (revealed ones
// are those whose animals are known: seen on the way or nearby)
export function canReach(s, key) {
  const h = parseKey(key);
  return inWorld(h) && hexDist(h) > 0 && !isWater(W(s).seed, h) && travelCost(W(s).seed, h) < Infinity;
}
// minutes for a trip there and back, the easiest way (TRAVEL)
export const tripMins = (key, seed) => Math.max(1, Math.round(travelCost(seed, parseKey(key)) * TRAVEL.mins));

// a scout (ROLES) in a team leads it: faster trips, fewer fights outside lairs, more eggs
export const hasScout = (s, members) => members.some(id => {
  const b = id !== PLAYER_ID && s.hatched.find(x => x.id === id);
  return !!b && (ROLES[b.type] || {}).ability === 'scout' && stageOf(b).id !== 'baby';
});
// a team's trip there and back, in minutes
// the slowest in the team sets its pace (BODY slow), and its best hauler how much it brings (BODY haul)
export const bodyOf = (s, id) => { const b = id !== PLAYER_ID && explorerOf(s, id); return b && b.type ? SPECIES[b.type] : {}; };
export const teamSlow = (s, members) => Math.max(1, ...members.map(id => bodyOf(s, id).slow || 1));
export const teamHaul = (s, members) => Math.max(1, ...members.map(id => bodyOf(s, id).haul || 1));
// a team of nothing but runners (Gallimimus) goes twice as fast
// (the player rides one of them: a single Gallimimus with the player is enough)
export const allRunners = (s, members) => {
  const dinos = members.filter(id => id !== PLAYER_ID);
  return dinos.length > 0 && dinos.every(id => bodyOf(s, id).runner);
};
export const teamTripMins = (s, members, key) => tripMins(key, W(s).seed) * teamSlow(s, members) * (allRunners(s, members) ? RUNNER.trip : 1);

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
  return BIOMES[biomeAt(W(s).seed, h)].loot.map(([id, min, max, chance = 1]) => ({ id, min, max, chance }));
}

// why this explorer can't go to this hex now, or null when it can
export function memberProblem(s, id, key, now) {
  const b = explorerOf(s, id);
  if (!b) return 'missing';
  // the player goes anywhere and never gets hungry
  const me = id === PLAYER_ID;
  const stage = me ? 'adult' : stageOf(b).id;
  if (stage === 'baby') return 'too-young';
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
  if (isWater(W(s).seed, h)) return 'water';
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

// ---------- being noticed ----------
// how much a team (fighters, from teamUnits) stands out in a biome: every member by its size, nothing for
// one camouflaged there
export const teamVisibility = (units, biome) => units.reduce((t, u) => t + u.members.reduce((x, m) =>
  x + (m.type && SPECIES[m.type] && SPECIES[m.type].camo === biome ? 0 : VISIBILITY.size[m.size || PLAYER_SIZE] || 1), 0), 0);
// the chance a trip meets what waits in its hex: a scout leads the team around it, and a predator
// notices a team that stands out more often (lairs are always met)
export function encounterChance(threat, units, biome, scout) {
  if (threat.lair) return threat.chance;
  const predator = (threat.foe.members[0].role || 'attacker') === 'attacker';
  const seen = predator && units.length ? Math.min(VISIBILITY.max, Math.max(VISIBILITY.min, teamVisibility(units, biome) / VISIBILITY.base)) : 1;
  return Math.min(1, threat.chance * (scout ? SCOUT.encounter : 1) * seen);
}

// ---------- keeping away and hunting ----------
const sizeRank = size => SIZE_ORDER.indexOf(size || 'small');
// a wild predator that has nothing to hunt in this team (fighters, from teamUnits): all of it is out of
// its food chain (isPrey), too big or too well armored for it
export function passesBy(threat, team) {
  const pred = threat.foe.members[0];
  return (pred.role || 'attacker') === 'attacker' && !team.some(u => u.members.some(m => isPrey(pred, m)));
}
// a wild animal that doesn't show itself to this team (fighters, from teamUnits): a prey animal always
// does; others keep away from
// anything bigger than its fear, and a predator smaller than a sail's owner (Spinosaurus) keeps away from it
export function keepsAway(threat, team) {
  // a predator with nothing in the team it could hunt passes it by
  if (passesBy(threat, team)) return true;
  const sp = threat.entry.species && SPECIES[threat.entry.species];
  if (!sp || !sp.fear) return false;
  // prey animals (noncombatants) run from any team: they can only be spotted and hunted
  if (sp.role === 'noncombatant') return true;
  const size = sizeRank(threat.foe.members[0].size), predator = sp.role === 'attacker';
  // (it runs from a predator bigger than it stands up to; a big plant eater it simply leaves alone)
  return team.some(u => u.members.some(m => ((m.role || 'attacker') === 'attacker' && sizeRank(m.size) > sizeRank(sp.fear)) || (predator && m.type && SPECIES[m.type].sail && size < sizeRank(m.size))));
}

// the chance a wild predator as big as a sail's owner backs off after sizing it up (SAIL), or 0: none
// in the team, not a predator, or a lair's Alpha. The strongest sail counts.
// (where: by the water, or the biome)
export function sailBackOff(threat, team, where) {
  const sp = threat.entry.species && SPECIES[threat.entry.species];
  const foe = threat.foe.members[0];
  if (!sp || sp.role !== 'attacker' || threat.lair) return 0;
  const base = (typeof where === 'string' ? WATER_BIOMES.includes(where) : where) ? SAIL.water : SAIL.land;
  const [lo, hi] = SAIL.ratio;
  return team.reduce((best, u) => u.members.reduce((b, m) => {
    if (!m.type || !SPECIES[m.type].sail || sizeRank(m.size) !== sizeRank(foe.size)) return b;
    return Math.max(b, Math.min(SAIL.max, base * Math.min(hi, Math.max(lo, m.power / foe.power))));
  }, best), 0);
}

// the team's best chance to hunt one of these (prey: one of them as a fighter), or null when nobody
// can: a carnivore no smaller than it, by its agility and hunting skill against the prey's agility
export function huntOdds(team, prey) {
  let best = null;
  team.forEach((u, i) => {
    const able = u.members.filter(m => m.type && SPECIES[m.type] && SPECIES[m.type].hunt && isPrey(m, prey));
    if (!able.length) return;
    const top = able.reduce((b, m) => m.agi + SPECIES[m.type].hunt > b.agi + SPECIES[b.type].hunt ? m : b);
    const score = (top.agi + SPECIES[top.type].hunt) * (1 + PACK_BONUS * (u.pack ? u.members.length - 1 : 0));
    // a zigzag runner (Hypsilophodon) is harder to run down
    const chance = score / (score + prey.agi * (prey.zigzag ? ZIGZAG.hunt : 1));
    if (!best || chance > best.chance) best = { unit: i, hunter: u.pack ? u.name : top.name, chance };
  });
  return best;
}

// a dinosaur that died: gone from the nest and its pack (a pack left too small breaks up), and what it
// wore back in the inventory (lost if there is no room)
export function bury(s, id) {
  const b = s.hatched.find(x => x.id === id);
  if (!b || id === PLAYER_ID) return null;
  for (const item of Object.values(b.equip || {})) if (item) addItem(s, item, 1);
  s.hatched = s.hatched.filter(x => x.id !== id);
  s.packs = (s.packs || []).map(p => ({ ...p, members: p.members.filter(m => m !== id) })).filter(p => p.members.length >= PACK_MIN);
  if (s.breeding && (s.breeding.maleId === id || s.breeding.femaleId === id)) s.breeding = null;
  return { id, name: b.name, type: b.type };
}

export const standsGround = foe => (foe.members[0].role || 'attacker') !== 'attacker';

// With the player along, a predator met makes those who run from it (prey animals, the afraid) scatter,
// and the player decides: face it with whoever stays, or run too. null when it isn't that: no player,
// not a predator, or nobody runs. { name, count, prey: the names of those who ran, mounted: the player
// rides one of them (a team of Gallimimus), alone: nobody stays with the player }
export function scatterOf(s, units, threat) {
  if (standsGround(threat.foe) || !units.some(u => u.kind === 'player')) return null;
  const team = teamUnits(s, units);
  const { fled } = whoFlees(team, threat.foe);
  if (!fled.length) return null;
  const stay = units.flatMap((u, i) => fled.includes(i) || u.kind === 'player' ? [] : [i]);
  return {
    name: threat.foe.name, count: threat.foe.members.length, prey: fled.map(i => team[i].name),
    mounted: allRunners(s, units.flatMap(u => u.members)), alone: !stay.length, fled,
  };
}
// Everyone running from it: the predator goes for the slowest (the player too, unless riding), as with
// anyone running (CHASE); watchful ones (Hypsilophodon) may see it coming in time (safe). null when it
// can't catch anyone. { id, unit, fighter, chance, death, safe, fights: caught, it (or the player) turns
// to fight instead of going down }
export function runOf(s, units, threat, sc = scatterOf(s, units, threat)) {
  if (!sc) return null;
  const team = teamUnits(s, units), foe = threat.foe, top = sizeRank(quickest(foe).size);
  const flee = f => f.agi * (f.zigzag ? ZIGZAG.flee : 1);
  let slow = null;
  team.forEach((u, i) => u.members.forEach((f, j) => {
    const id = units[i].members[j];
    if ((id === PLAYER_ID && sc.mounted) || top - sizeRank(f.size) > CHASE.maxSteps || !isPrey(foe.members[0], f)) return;
    if (!slow || flee(f) < flee(slow.fighter)) slow = { id, unit: i, fighter: f };
  }));
  if (!slow) return null;
  return { ...slow, chance: catchChance(foe, slow.fighter), death: caughtDeath(foe, slow.fighter), safe: eyesChance(s, units.flatMap(u => u.members)),
    fights: slow.id === PLAYER_ID || !sc.fled.includes(slow.unit) };
}
// A hunt the team may watch at a hex, wild against wild: a second animal of the biome turns up beside the
// one living there and one goes for the other (rolled from rand). null when neither hunts the other.
// { hunter, prey: { name, species, count, entry }, hunterFoe, preyFoe: the two as they fight, outcome:
// how it ends if the team lets it be ('kill', 'escaped' or 'repelled') }
export function witnessAt(seed, h, rand) {
  const biome = biomeAt(seed, h), threat = threatAt(seed, h);
  const list = wildFor(seed, h);
  let x = rand() * list.reduce((t, e) => t + e.weight, 0);
  const entry = list.find(e => (x -= e.weight) < 0) || list[list.length - 1];
  let y = rand() * Object.values(AGES).reduce((t, a) => t + a.weight, 0);
  const age = AGES[Object.keys(AGES).find(k => (y -= AGES[k].weight) < 0) || 'adult'];
  const visitor = { entry, foe: (u => (age.name ? { ...u, name: `${age.name} ${u.name}` } : u))(encounterUnit(entry, age.step, false)) };
  const resident = { entry: threat.entry, foe: threat.foe };
  const hunts = (a, b) => (a.foe.members[0].role || 'attacker') === 'attacker' && isPrey(a.foe.members[0], b.foe.members[0]);
  const [hunter, prey] = hunts(resident, visitor) ? [resident, visitor] : hunts(visitor, resident) ? [visitor, resident] : [];
  if (!hunter) return null;
  const who = u => ({ name: u.foe.name, species: u.entry.species || u.entry.creature, count: u.foe.members.length, entry: u.entry });
  const r = teamFight([prey.foe], hunter.foe, rand, { biome, swamp: watery(seed, h) });
  let outcome;
  if (r.escaped) {
    // it ran: the hunter goes after the slowest
    const slow = prey.foe.members.reduce((a, f) => (f.agi < a.agi ? f : a));
    outcome = rand() < catchChance(hunter.foe, slow) ? 'kill' : 'escaped';
  } else outcome = r.win ? 'repelled' : 'kill';
  return { hunter: who(hunter), prey: who(prey), hunterFoe: hunter.foe, preyFoe: prey.foe, outcome };
}
// a hunter that scares a predator off: one of it is a predator bigger than it stands up to
const scares = (unit, pred) => unit.members.some(m => (m.role || 'attacker') === 'attacker' && sizeRank(m.size) > sizeRank(pred.fear || 'colossal'));
// Who in the team could step into a hunt the team watches, and how (for each unit but the player):
// { id, name, prey: going after the prey, predator: going after the hunter }, each { ok, reason } or
// { ok, chance (of running it down), backsOff (prey: the hunter lets it have it), chase (predator: it
// runs, so no fight) }. A hunter (a hunting skill) won't go near anything bigger than it stands up to,
// goes after the prey only if it hunts it, and after the hunter only if it can hurt it.
export function interveneOptions(s, exp, wt) {
  const units = exp.team.map(u => ({ ...u, members: u.members.filter(m => explorerOf(s, m)) })).filter(u => u.members.length && u.kind !== 'player');
  const pred = wt.hunterFoe.members[0];
  const prey = wt.preyFoe.members.reduce((a, f) => (f.agi < a.agi ? f : a));
  const fastest = wt.hunterFoe.members.reduce((a, f) => (f.agi > a.agi ? f : a));
  return units.map(u => {
    const unit = teamUnits(s, [u])[0], m = unit.members[0], sp = SPECIES[m.type] || {};
    const base = { id: u.id, name: unit.name };
    if (!sp.hunt || (m.role || 'attacker') !== 'attacker') return { ...base, prey: { ok: false, reason: 'not a hunter' }, predator: { ok: false, reason: 'not a hunter' } };
    const wary = f => sizeRank(f.size) > sizeRank(m.fear || 'colossal');
    let onPrey;
    if (wary(prey)) onPrey = { ok: false, reason: 'won\'t go near it' };
    else if (!isPrey(m, prey)) onPrey = { ok: false, reason: 'doesn\'t hunt it' };
    else { const o = huntOdds([unit], prey); onPrey = o ? { ok: true, chance: o.chance, backsOff: scares(unit, pred) } : { ok: false, reason: 'doesn\'t hunt it' }; }
    let onPred;
    if (wary(pred)) onPred = { ok: false, reason: 'won\'t go near it' };
    else if (!unit.members.some(x => hitOf(x, pred, 1.25) > 0)) onPred = { ok: false, reason: 'can\'t hurt it' };
    else if (scares(unit, pred)) {
      // it runs from this hunter: a chase, its hunting skill and speed against the quickest of them
      const top = unit.members.reduce((b, x) => (x.agi > b.agi ? x : b));
      const score = (top.agi + (SPECIES[top.type].hunt || 0)) * (1 + PACK_BONUS * (unit.pack ? unit.members.length - 1 : 0));
      onPred = { ok: true, chase: true, chance: score / (score + fastest.agi) };
    } else onPred = { ok: true, chase: false };
    return { ...base, prey: onPrey, predator: onPred };
  });
}
// What a team going to a hex could run into, for the warning before it sets out: from what the player
// knows, not what waits (the animals of the biomes on the way, grown ones): the chance something on the
// way stops it, and the predators that could (fighters, from teamUnits), worst first: [{ foe, biome }]
export function routeRisk(s, team, key) {
  const seed = W(s).seed, h = parseKey(key), path = travelPath(seed, h);
  let pass = 1;
  const seen = new Map();
  for (const p of path) {
    const last = hexKey(...p) === key;
    if (hexDist(p) <= NEST_CALM && !last) continue;
    const biome = biomeAt(seed, p), known = isRevealed(s, hexKey(...p));
    // what lives there: the one known, or any of the biome's
    const kinds = known ? [threatAt(seed, p)] : BIOMES[biome].wild.map(e => ({ entry: e, lair: false, chance: BIOMES[biome].density, foe: encounterUnit(e, AGES.adult.step, false), weight: e.weight }));
    const total = kinds.reduce((t, k) => t + (k.weight || 1), 0);
    let p0 = 0;
    for (const k of kinds) {
      if ((k.foe.members[0].role || 'attacker') !== 'attacker' || keepsAway(k, team)) continue;
      if (!last) p0 += (k.weight || 1) / total * (k.lair ? INTERCEPT.lair : Math.min(1, k.chance) * INTERCEPT.share);
      const id = k.entry.species || k.entry.creature;
      if (!seen.has(id)) seen.set(id, { foe: k.foe, biome, at: last ? 'there' : 'on the way' });
    }
    if (!last) pass *= 1 - p0;
  }
  return { stopped: 1 - pass, crosses: [...new Set(path.slice(0, -1).filter(p => hexDist(p) > NEST_CALM).map(p => biomeAt(seed, p)))], foes: [...seen.values()] };
}

// whether a team's runners (Gallimimus) see a predator first: each one may (RUNNER.eye)
export const runnersSpot = (s, members, rand) => members.some(id => bodyOf(s, id).runner && rand() < RUNNER.eye);
// a predator giving chase: its quickest runs down prey (a fighter) this often (CHASE)
export const quickest = foe => foe.members.reduce((a, f) => (f.agi > a.agi ? f : a));
// one caught doesn't fight back: the bigger the predator, the likelier it doesn't survive (DEATH.caught);
// otherwise it comes home critically injured
export const caughtDeath = (foe, prey) => DEATH.caught.find(([n]) => sizeRank(quickest(foe).size) - sizeRank(prey.size) >= n)[1];
export const catchChance = (foe, prey) => {
  const hunter = quickest(foe), agi = prey.agi * (prey.zigzag ? ZIGZAG.flee : 1);
  return hunter.agi / (hunter.agi + CHASE.lead * agi);
};
// When a whole team (fighters, from teamUnits) runs from a predator, the one it gives chase to: the
// slowest to get away, never the player. null when it won't chase (it isn't a predator) or nobody can be
// caught. { unit, member, fighter, chance, death: the chance the one caught doesn't survive }
export function chaseOf(team, foe) {
  if (foe.members[0].role && foe.members[0].role !== 'attacker') return null;
  const flee = f => f.agi * (f.zigzag ? ZIGZAG.flee : 1), top = sizeRank(quickest(foe).size);
  let slow = null;
  team.forEach((u, i) => u.members.forEach((f, j) => {
    if (f.type && top - sizeRank(f.size) <= CHASE.maxSteps && isPrey(foe.members[0], f) && (!slow || flee(f) < flee(slow.fighter))) slow = { unit: i, member: j, fighter: f };
  }));
  if (!slow) return null;
  const f = slow.fighter;
  return { ...slow, chance: catchChance(foe, f), death: caughtDeath(foe, f) };
}
// whether a team's watchful ones (Hypsilophodon) see a predator first: more eyes, likelier (EYES)
export const eyesChance = (s, members) => Math.min(EYES.max, EYES.perOne * members.filter(id => bodyOf(s, id).eyes).length);
// how a group that stood its ground is told: its species, how many, and whether it's a herd or a pack
export const standoffOf = threat => ({
  name: threat.foe.name, species: SPECIES[threat.entry.species].species, count: threat.foe.members.length,
  group: threat.foe.members.length > 1 ? (threat.entry.herd ? 'herd' : 'pack') : '', lair: threat.lair,
});

// keeps a loaded world inside the rules whatever produced it
export function cleanWorld(world, s) {
  let w = world && typeof world === 'object' ? world : newWorld(seedFor(s));
  // a world made before the map it is played on: the new map starts unexplored (the same seed, the
  // trips counted on), and teams out on the old one are home
  if (w.map !== MAP_VERSION) w = { ...newWorld(Number.isInteger(w.seed) && w.seed > 0 ? w.seed : seedFor(s)), trips: Math.max(0, Math.floor(Number(w.trips) || 0)) };
  const keys = list => [...new Set((Array.isArray(list) ? list : []).filter(k => inWorld(parseKey(k))))];
  const home = newWorld(1);
  return {
    seed: Number.isInteger(w.seed) && w.seed > 0 ? w.seed : seedFor(s),
    map: MAP_VERSION,
    revealed: keys([...home.revealed, ...keys(w.revealed)]),
    visited: keys([...home.visited, ...keys(w.visited)]),
    trips: Math.max(0, Math.floor(Number(w.trips) || 0)),
    // the parties out, as saved: journey.js cleanParties checks them
    expeditions: Array.isArray(w.expeditions) ? w.expeditions : [],
  };
}
