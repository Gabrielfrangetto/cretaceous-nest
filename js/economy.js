// Game rules. Every function works on a state object passed in and touches no DOM or storage,
// so the same rules can be tested in Node and later run on a server.
import {
  SPECIES, ITEMS, TAP_MS, TAP_CAP, SLOTS, BASE_SLOTS, ROW, MAX_STACK, DIET,
  FEED_COINS, HATCH_COINS, HATCH_LOOT, FOOD_PACKS, ROW_PRICE, DAY_OFFSET_HOURS, DAILY_REWARDS, ACHIEVEMENTS,
  FACTIONS, HOME_FACTION, OUTFITS, RECIPES, STARTERS, GUIDE, NURSE, CARRY, CARRY_PER_STR, PLAYER_CARRY, LOAD_FREE, LOAD_AGI_LOSS, PLAYER_ID, PLAYER_BASE, PLAYER_SLOTS, STATS, GENES_MAX, WILD_GENES, GENE_GRADES, SPECIES_BASE, GENE_FLOOR, DERIVED, BREED_MINS, BREED_GENE_CHANGE, EGG_TRAY_SIZE, STAGES, CAPSULE, CAPSULES, PLAYER_HUNGER_MIN, PLAYER_DIET,
  PROMO_CODES, PROMO_SALT, EGG_GENES, EGG_STEP,
  KG, PLAYER_KG, MASS,
  FOOD,
} from './config.js';
import { hashId, newId, sha256 } from './util.js';
import { isAway, healBaby, transfuse, mendFrill } from './world.js';
import { startExpedition, orderParty, recallParty, journeyStep, makeCamp, breakCamp, flyHome, tripCare } from './journey.js';
import { formPack, setPackMembers, renamePack, disbandPack } from './packs.js';
import { setTeamSlot, renameTeam } from './teams.js';

// running totals the achievements read; older saves get them from their migration
function bump(s, key, n = 1) {
  if (!s.stats) s.stats = { coinsEarned: 0, meals: 0, purchases: 0 };
  s.stats[key] = (s.stats[key] || 0) + n;
}
// ---------- genes ----------
// dice seeded from a string (mulberry32), so a migration gives every device and the server the same genes
export function seededRand(seed) {
  let t = hashId(seed) || 1;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const roll = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const clampGene = n => Math.min(GENES_MAX, Math.max(1, Math.round(Number(n) || 1)));
const sumOf = (values, id) => STATS.reduce((t, s) => t + ((values && values[id ? id(s) : s.id]) || 0), 0);

// a baby from one of the incubator's free eggs
export function wildGenes(rand) {
  const [lo, hi] = WILD_GENES;
  return Object.fromEntries(STATS.map(({ id }) => [id, roll(rand, lo, hi)]));
}

// the best a free egg can give (used to cap genes that can't be checked)
export const WILD_GENES_MAX = Object.fromEntries(STATS.map(({ id }) => [id, WILD_GENES[1]]));

// each gene lands between the parents' genes, then moves a little
export function inheritGenes(a, b, rand) {
  const [down, up] = BREED_GENE_CHANGE;
  return Object.fromEntries(STATS.map(({ id }) => {
    const lo = Math.min(a[id], b[id]), hi = Math.max(a[id], b[id]);
    return [id, clampGene(roll(rand, lo, hi) + roll(rand, down, up))];
  }));
}

export const genesTotal = g => sumOf(g);
export const genesPercent = g => Math.round(genesTotal(g) / (STATS.length * GENES_MAX) * 100);
export const geneGrade = n => GENE_GRADES.find(([min]) => n >= min)[1];

export function cleanGenes(g, seed) {
  if (!g || typeof g !== 'object') return wildGenes(seededRand(seed));
  return Object.fromEntries(STATS.map(({ id }) => [id, clampGene(g[id])]));
}

// ---------- growth ----------
// A young one's stage comes from how many growth capsules it has had (fed), which only the rules (and
// the server) change. the capsules a stage needs for this one's species (CAPSULES)
export const mealsFor = (b, st) => (b && CAPSULES[b.type] ? CAPSULES[b.type][st.id] : st.share ? Infinity : 0);
export const stageOf = b => [...STAGES].reverse().find(st => ((b && b.fed) || 0) >= mealsFor(b, st));
// the next stage and how many capsules it still needs, or null for adults
export function nextStage(b) {
  const next = STAGES[STAGES.indexOf(stageOf(b)) + 1];
  return next ? { stage: next, mealsLeft: mealsFor(b, next) - ((b && b.fed) || 0) } : null;
}
// its age (ms), a year of it a year of ours
export const ageOf = (b, now) => Math.max(0, now - (Number.isFinite(b.at) ? b.at : now));

// ---------- stats ----------
// Only adults wear equipment; pieces a younger baby still wears (from before this rule) can be
// taken off but give no bonus and are not drawn.
export const isAdult = b => !!b && stageOf(b).id === 'adult';
export const isPlayer = b => !!b && b.id === PLAYER_ID;
// what a baby actually wears: its equipment if it is an adult, otherwise nothing (the player always wears theirs)
export const wornGear = baby => ((isPlayer(baby) || isAdult(baby)) && baby.equip) || {};

// ---------- weight ----------
// How much equipment it can carry: its size's capacity plus a little for its strength from genes
// (equipment doesn't raise it). The player has a capacity of their own.
export function carryCapacity(b) {
  const str = statSheet(b, []).stats.str;
  return Math.round(((isPlayer(b) ? PLAYER_CARRY : CARRY[SPECIES[b.type].size]) + str * CARRY_PER_STR) * 10) / 10;
}
export const itemWeight = id => (ITEMS[id] && ITEMS[id].weight) || 0;
export const carriedWeight = b => Object.values(wornGear(b)).reduce((t, id) => t + itemWeight(id), 0);
// the agility multiplier from the load: nothing up to LOAD_FREE of capacity, then down to
// 1 − LOAD_AGI_LOSS at a full load (and no lower for a load from before weights existed)
export function loadFactor(b) {
  const share = carriedWeight(b) / carryCapacity(b);
  if (share <= LOAD_FREE) return 1;
  return 1 - LOAD_AGI_LOSS * Math.min(1, (share - LOAD_FREE) / (1 - LOAD_FREE));
}

// the bonuses from everything a baby wears, and what the load costs
export function gearMods(baby) {
  const mods = Object.values(wornGear(baby)).flatMap(id => (ITEMS[id] && ITEMS[id].mods) || []);
  const load = loadFactor(baby);
  if (load < 1) mods.push({ stat: 'agi', type: 'more', value: Math.round(load * 100) / 100, weight: true });
  // raised among Hypacrosaurus (NURSE)
  if (baby && baby.care > 0) for (const { id } of STATS) mods.push({ stat: id, type: 'more', value: 1 + baby.care, care: true });
  return mods;
}

// A baby's stats, worked out in stages like an action RPG:
//   1. species base × (GENE_FLOOR + (1 − GENE_FLOOR) × genes / GENES_MAX)
//   2. + flat bonuses                        e.g. "+30 Resistance"
//   3. × (1 + sum of "increased" bonuses)    e.g. "+10% Strength", "−25% Agility": these add up together
//   4. × each "more" multiplier              e.g. "×1.10 Strength": these multiply each other
//   5. rounded, never below 1
// mods: [{ stat, type: 'flat' | 'increased' | 'more', value }], with increased as a fraction (0.10 = +10%)
// and more as a multiplier (1.10). Equipment will supply them.
// The player has no species or genes: their base stats count as perfect genes.
export function statSheet(baby, mods = gearMods(baby)) {
  const me = isPlayer(baby);
  const base = me ? PLAYER_BASE : SPECIES_BASE[baby.type];
  const stats = {}, steps = {};
  for (const { id } of STATS) {
    const genes = me ? GENES_MAX : baby.genes[id];
    const factor = GENE_FLOOR + (1 - GENE_FLOOR) * genes / GENES_MAX;
    const fromGenes = base[id] * factor;
    const mine = mods.filter(m => m.stat === id);
    const flat = mine.filter(m => m.type === 'flat').reduce((t, m) => t + m.value, 0);
    const increased = mine.filter(m => m.type === 'increased').reduce((t, m) => t + m.value, 0);
    const more = mine.filter(m => m.type === 'more').reduce((t, m) => t * m.value, 1);
    const value = Math.max(1, Math.round((fromGenes + flat) * Math.max(0, 1 + increased) * more));
    stats[id] = value;
    steps[id] = { base: base[id], genes, factor, fromGenes, flat, increased, more, value };
  }
  return { stats, steps, derived: deriveCombat(stats), power: sumOf(stats) };
}

// how heavy one is (kg): the player, or a dinosaur at its stage of growth (MASS)
export const massOf = b => (b.id === PLAYER_ID ? PLAYER_KG : KG[b.type] * (MASS.stage[stageOf(b).id] ?? 1));
// the health a body of this mass has, from the health its vitality gives
export const hpForMass = (hp, kg) => Math.round(hp * Math.pow(kg / MASS.ref, MASS.hp));
// a bite, for a body lighter than the grown one
export const biteForMass = (bite, kg, grown) => (kg >= grown ? bite : Math.round(bite * Math.pow(kg / grown, MASS.bite)));

export function deriveCombat(st) {
  return {
    hp: Math.round(DERIVED.hpBase + st.vit * DERIVED.hpPerVit),
    damage: Math.round(st.str * DERIVED.damagePerStr * 10) / 10,
    dodge: st.agi / (st.agi + DERIVED.dodgeHalfAt),
    reduction: st.res / (st.res + DERIVED.reductionHalfAt),
  };
}

// coins coming in go to the bills first, while any are owed (bill)
export function earn(s, coins) {
  const paid = Math.min(s.debt || 0, coins);
  if (paid) s.debt -= paid;
  s.coins += coins - paid;
  bump(s, 'coinsEarned', coins);
}
// a bill for the sanctuary's services (an air rescue, a hospital), paid when the player chooses
export function bill(s, coins) {
  s.debt = (s.debt || 0) + Math.max(0, Math.round(coins));
}
// pays what can be paid of the bills now
export function payDebt(s) {
  const n = Math.min(s.coins, s.debt || 0);
  if (!n) return { ok: false, reason: s.debt ? 'coins' : 'no-debt' };
  s.coins -= n; s.debt -= n;
  return { ok: true, paid: n, left: s.debt };
}

// ---------- inventory ----------
// equipment stacks one per slot; everything else up to MAX_STACK
export const maxStack = id => (ITEMS[id] && ITEMS[id].stack) || MAX_STACK;

export const countItem = (s, id) =>
  s.inv.reduce((t, slot, i) => t + (slot && slot.id === id && i < s.invSize ? slot.n : 0), 0);

// how many more of an item fit in the unlocked slots
export const roomFor = (s, id) =>
  s.inv.reduce((t, slot, i) => i >= s.invSize ? t : t + (!slot ? maxStack(id) : slot.id === id ? maxStack(id) - slot.n : 0), 0);

// fills matching stacks first, then empty slots; returns how many did not fit
export function addItem(s, id, n) {
  let left = n;
  for (let i = 0; i < s.invSize && left; i++) {
    const slot = s.inv[i];
    if (slot && slot.id === id && slot.n < maxStack(id)) { const k = Math.min(left, maxStack(id) - slot.n); slot.n += k; left -= k; }
  }
  for (let i = 0; i < s.invSize && left; i++) {
    if (!s.inv[i]) { const k = Math.min(left, maxStack(id)); s.inv[i] = { id, n: k }; left -= k; }
  }
  return left;
}

// takes from the smallest stacks first so big stacks stay together; returns how many were removed
export function removeItem(s, id, n) {
  const stacks = s.inv.map((slot, i) => [slot, i])
    .filter(([slot, i]) => slot && slot.id === id && i < s.invSize)
    .sort((a, b) => a[0].n - b[0].n);
  let removed = 0;
  for (const [slot, i] of stacks) {
    if (removed === n) break;
    const k = Math.min(n - removed, slot.n);
    slot.n -= k; removed += k;
    if (!slot.n) s.inv[i] = null;
  }
  return removed;
}

// drop slot a onto slot b: move into an empty slot, merge the same item up to its stack size, otherwise swap
export function moveSlot(s, a, b) {
  const A = s.inv[a], B = s.inv[b];
  if (!A || a === b) return false;
  if (!B) { s.inv[b] = A; s.inv[a] = null; }
  else if (B.id === A.id) {
    const k = Math.min(A.n, maxStack(A.id) - B.n);
    B.n += k; A.n -= k;
    if (!A.n) s.inv[a] = null;
    else if (!k) { s.inv[a] = B; s.inv[b] = A; }
  } else { s.inv[a] = B; s.inv[b] = A; }
  return true;
}

// merges repeated stacks and orders items by their order in ITEMS
export function sortInventory(s, itemOrder = Object.keys(ITEMS)) {
  const totals = {};
  for (const slot of s.inv) if (slot) totals[slot.id] = (totals[slot.id] || 0) + slot.n;
  s.inv = Array(SLOTS).fill(null);
  for (const id of itemOrder) if (totals[id]) addItem(s, id, totals[id]);
}

// moves half of a stack into the first empty slot; returns that slot or -1
export function splitStack(s, i) {
  const slot = s.inv[i];
  if (!slot || slot.n < 2) return -1;
  const j = s.inv.findIndex((x, k) => !x && k < s.invSize);
  if (j < 0) return -1;
  const half = Math.floor(slot.n / 2);
  slot.n -= half;
  s.inv[j] = { id: slot.id, n: half };
  return j;
}

export function discardOne(s, i) {
  const slot = s.inv[i];
  if (!slot) return false;
  slot.n -= 1;
  if (!slot.n) s.inv[i] = null;
  return true;
}

// ---------- selling ----------
// what a faction pays for one of an item (FACTIONS): its own value, or for equipment a share of its price
// or its makings and the work
export function valueOf(id, faction = HOME_FACTION) {
  const f = FACTIONS[faction], it = ITEMS[id];
  if (!f || !it) return 0;
  if (f.value[id] != null) return f.value[id];
  if (it.price) return it.price * f.gear;
  const r = RECIPES.find(x => x.id === id);
  return r ? Object.entries(r.needs).reduce((t, [k, n]) => t + valueOf(k, faction) * n, 0) * f.work : 0;
}
// sells n of the item in slot i to the nest's faction, for whole coins
export function sellItems(s, i, n) {
  const slot = s.inv[i];
  if (!slot) return { ok: false, reason: 'empty-slot' };
  n = Math.min(slot.n, Math.max(1, Math.floor(Number(n) || 1)));
  const coins = Math.floor(n * valueOf(slot.id) + 1e-9);
  if (coins < 1) return { ok: false, reason: 'worthless' };
  const id = slot.id;
  slot.n -= n;
  if (!slot.n) s.inv[i] = null;
  earn(s, coins);
  return { ok: true, id, n, coins };
}

// ---------- eggs ----------
// egg is a bred egg from the tray (carrying its genes and family), or null for a free egg
// nest-mates that care for eggs and hatchlings (NURSE), at home
const nurses = (s, adults) => s.hatched.filter(b => SPECIES[b.type] && SPECIES[b.type].nurse && !isAway(s, b.id) && (!adults || stageOf(b).id === 'adult'));
// an egg's sex, fixed when it was taken or laid (older eggs: one of their own, from their id)
export const eggSex = e => (e.sex === 'm' || e.sex === 'f' ? e.sex : hashId(String(e.id || `${e.type}:${e.startedAt}`)) % 2 ? 'm' : 'f');
export function startEgg(s, type, now, egg = null) {
  // an adult that nests in colonies looks after it: it hatches sooner
  const nursed = nurses(s, true).length > 0;
  s.current = { type, startedAt: now, duration: Math.round(SPECIES[type].mins * 60000 * (nursed ? 1 - NURSE.hatch : 1)), bonus: 0, ...(nursed ? { nursed } : {}) };
  if (egg) Object.assign(s.current, { genes: egg.genes, gen: egg.gen, parents: egg.parents, sex: eggSex(egg) });
}

export function eggProgress(egg, now) {
  const elapsed = now - egg.startedAt + (egg.bonus || 0);
  return { frac: Math.min(1, elapsed / egg.duration), left: Math.max(0, egg.duration - elapsed) };
}

// returns true when the tap actually saved time (taps stop counting at TAP_CAP)
export function warmEgg(s) {
  const egg = s.current;
  if (!egg) return false;
  const before = egg.bonus || 0;
  egg.bonus = Math.min(egg.duration * TAP_CAP, before + TAP_MS);
  return egg.bonus > before;
}

export function suggestName(s, type) {
  const count = s.hatched.filter(b => b.type === type).length;
  return count ? SPECIES[type].nick + ' ' + (count + 1) : SPECIES[type].nick;
}

// hatches the current egg if it is ready; the baby gets a default name it can be renamed from
export function hatchEgg(s, now, rand = Math.random) {
  const egg = s.current;
  if (!egg || eggProgress(egg, now).frac < 1) return null;
  const type = egg.type;
  // (sex and genes were settled when the egg was taken or laid)
  const baby = { id: newId(), type, sex: eggSex(egg), name: suggestName(s, type), at: now };
  baby.genes = egg.genes ? { ...egg.genes } : wildGenes(rand);
  baby.gen = egg.gen || 1;
  if (egg.parents) baby.parents = [...egg.parents];
  // raised among Hypacrosaurus: a little more of every stat for life
  const care = Math.min(NURSE.max, nurses(s).length * NURSE.perOne);
  if (care > 0) baby.care = Math.round(care * 100) / 100;
  // raised in a Psittacosaurus creche: a strong stomach
  if (s.hatched.some(b => SPECIES[b.type] && SPECIES[b.type].creche && stageOf(b).id === 'adult' && !isAway(s, b.id))) baby.stomach = true;
  s.hatched.unshift(baby);
  // its eggs, and its nests, are known from now on
  if (!(s.known || []).includes(type)) s.known = [...(s.known || []), type];
  const lootId = HATCH_LOOT[type];
  const lost = addItem(s, lootId, 1) > 0;
  earn(s, HATCH_COINS[type]);
  s.current = null;
  return { baby, coins: HATCH_COINS[type], lootId, lost };
}

// ---------- babies ----------
// babies from before sexes existed get a stable one from their id
export const sexOf = b => b.sex === 'm' || b.sex === 'f' ? b.sex : (hashId(b.id) % 2 ? 'm' : 'f');

// At home the keepers feed the dinosaurs; only the player gets hungry there, every PLAYER_HUNGER_MIN.
// A young dinosaur instead needs a growth capsule as each one wears off (CAPSULE.every hours of its
// stage), the first as soon as it hatches; an adult needs none.
export const hungerEvery = b => b.id === PLAYER_ID ? PLAYER_HUNGER_MIN * 60000 : (CAPSULE.every[stageOf(b).id] || 0) * 3600000;
// (a player who has never eaten yet isn't hungry)
export const isHungry = (b, now) => b.id === PLAYER_ID ? b.lastFed != null && now - b.lastFed >= hungerEvery(b) : needsCapsule(b, now);
export const needsCapsule = (b, now) => !!b && b.id !== PLAYER_ID && !isAdult(b) && (b.lastFed == null || now - b.lastFed >= hungerEvery(b));

// A day's food (kg) for one (a dinosaur at its stage, or the player) of this food: FOOD
const PLANT_FOOD = ['leaf', 'fruit', 'seed'];
export const dailyKg = (b, food) => (b.id !== PLAYER_ID && PLANT_FOOD.includes(food) ? FOOD.plant : FOOD.animal) * Math.pow(massOf(b), 0.75);
// how many items of a food a meal in the nest takes: a quarter of a day's food, one at the least
export const mealSize = (b, food) => Math.max(1, Math.round(dailyKg(b, food) * FOOD.meal / ((ITEMS[food] && ITEMS[food].kg) || 1)));
// the meal one would eat now: its favourite food there is enough of in the inventory for a meal, or
// null (who: the dinosaur, or the player, for the size of the meal; none: one item)
export const mealFor = (s, type, who = null) => (type ? DIET[type] : PLAYER_DIET).find(food => countItem(s, food) >= (who ? mealSize(who, food) : 1)) || null;
// "Meat eater", "Plant eater", "Omnivore" or "Fish eater", from what it eats
export function dietLabel(type) {
  const d = DIET[type];
  if (d[0] === 'fish') return 'Fish eater';
  if (d.includes('leaf') && d.includes('meat')) return 'Omnivore';
  return d.includes('meat') ? 'Meat eater' : 'Plant eater';
}

// gives a young dinosaur its growth capsule (the player: a meal)
export function feedBaby(s, id, now) {
  if (id === PLAYER_ID) return feedPlayer(s, now);
  const b = s.hatched.find(x => x.id === id);
  if (!b) return { ok: false, reason: 'missing' };
  if (isAway(s, id, now)) return { ok: false, reason: 'away' };
  if (!needsCapsule(b, now)) return { ok: false, reason: isAdult(b) ? 'grown' : 'full' };
  const food = CAPSULE.item, n = 1;
  if (countItem(s, food) < n) return { ok: false, reason: 'no-food', food, n };
  removeItem(s, food, n);
  const before = stageOf(b);
  b.lastFed = now;
  b.fed = (b.fed || 0) + 1;
  earn(s, FEED_COINS);
  bump(s, 'meals');
  const after = stageOf(b);
  return { ok: true, food, n, coins: FEED_COINS, grewTo: after !== before ? after.id : null };
}

// the player eats (in the nest): no coins for it
function feedPlayer(s, now) {
  const p = s.player;
  if (isAway(s, PLAYER_ID, now)) return { ok: false, reason: 'away' };
  if (!isHungry(p, now)) return { ok: false, reason: 'full' };
  const food = mealFor(s, null, p);
  if (!food) return { ok: false, reason: 'no-food', food: PLAYER_DIET[0] };
  const n = mealSize(p, food);
  removeItem(s, food, n);
  p.lastFed = now;
  return { ok: true, food, n, coins: 0, grewTo: null };
}

// ---------- shop ----------
export const rowPrice = s => ROW_PRICE * ((s.invSize - BASE_SLOTS) / ROW + 1);

export function buyRow(s) {
  if (s.invSize >= SLOTS) return { ok: false, reason: 'maxed' };
  const price = rowPrice(s);
  if (s.coins < price) return { ok: false, reason: 'coins' };
  s.coins -= price;
  bump(s, 'purchases');
  s.invSize += ROW;
  return { ok: true, price };
}

export function buyPack(s, k) {
  const pack = FOOD_PACKS[k];
  if (!pack) return { ok: false, reason: 'missing' };
  if (roomFor(s, pack.id) < pack.qty) return { ok: false, reason: 'room' };
  if (s.coins < pack.price) return { ok: false, reason: 'coins' };
  s.coins -= pack.price;
  bump(s, 'purchases');
  addItem(s, pack.id, pack.qty);
  return { ok: true, pack };
}

// ---------- equipment ----------
export const isGear = id => !!(ITEMS[id] && ITEMS[id].kind === 'gear');

// dinosaur equipment or the player's weapons and armor; forged pieces have no price and are not sold
export function buyGear(s, id) {
  if (!(isGear(id) || isArms(id)) || !ITEMS[id].price) return { ok: false, reason: 'unknown-item' };
  if (roomFor(s, id) < 1) return { ok: false, reason: 'room' };
  if (s.coins < ITEMS[id].price) return { ok: false, reason: 'coins' };
  s.coins -= ITEMS[id].price;
  addItem(s, id, 1);
  bump(s, 'purchases');
  return { ok: true, item: id };
}

// puts the item in inventory slot `index` on the baby; whatever it wore there goes back to that slot
export function equipGear(s, babyId, index) {
  const baby = s.hatched.find(b => b.id === babyId);
  if (!baby) return { ok: false, reason: 'missing' };
  if (!isAdult(baby)) return { ok: false, reason: 'not-adult' };
  // its fights are worked out with what it wore when it set off
  if (isAway(s, babyId)) return { ok: false, reason: 'away' };
  if (!Number.isInteger(index) || index < 0 || index >= s.invSize) return { ok: false, reason: 'bad-slot' };
  const item = s.inv[index];
  if (!item || !isGear(item.id)) return { ok: false, reason: 'not-gear' };
  const slot = ITEMS[item.id].slot;
  const old = baby.equip && baby.equip[slot];
  if (carriedWeight(baby) - itemWeight(old) + itemWeight(item.id) > carryCapacity(baby)) return { ok: false, reason: 'too-heavy' };
  item.n -= 1;
  if (!item.n) s.inv[index] = null;
  if (old) { if (!s.inv[index]) s.inv[index] = { id: old, n: 1 }; else addItem(s, old, 1); }
  baby.equip = { ...(baby.equip || {}), [slot]: item.id };
  return { ok: true, slot, item: item.id, removed: old || null };
}

export function unequipGear(s, babyId, slot) {
  const baby = s.hatched.find(b => b.id === babyId);
  const id = baby && baby.equip && baby.equip[slot];
  if (!id) return { ok: false, reason: 'empty' };
  if (isAway(s, babyId)) return { ok: false, reason: 'away' };
  if (roomFor(s, id) < 1) return { ok: false, reason: 'room' };
  addItem(s, id, 1);
  const { [slot]: gone, ...rest } = baby.equip;
  baby.equip = rest;
  return { ok: true, item: id };
}

// ---------- starter ----------
// A new game starts with no dinosaur: the player picks one of the starter babies. Each choice's sex
// and genes come from the save's world seed, so the browser and the server offer the same babies.
const starterRand = (s, type) => seededRand(`starter:${(s.world && s.world.seed) || 1}:${type}`);
export function starterBaby(s, type) {
  const rand = starterRand(s, type);
  return { id: `starter-${(s.world && s.world.seed) || 1}`, type, sex: rand() < 0.5 ? 'm' : 'f', genes: wildGenes(rand), gen: 1 };
}
export function pickStarter(s, type, now) {
  if (s.starter) return { ok: false, reason: 'picked' };
  if (!STARTERS.includes(type)) return { ok: false, reason: 'unknown-species' };
  const baby = { ...starterBaby(s, type), name: suggestName(s, type), at: now, equip: {} };
  s.hatched.unshift(baby);
  // its eggs, and its nests, are known from now on
  if (!(s.known || []).includes(type)) s.known = [...(s.known || []), type];
  s.starter = true;
  return { ok: true, baby };
}

// ---------- forge ----------
export const recipeFor = id => RECIPES.find(r => r.id === id) || null;
export function craftItem(s, id) {
  const r = recipeFor(id);
  if (!r) return { ok: false, reason: 'unknown-recipe' };
  for (const [item, n] of Object.entries(r.needs)) if (countItem(s, item) < n) return { ok: false, reason: 'materials', item };
  if (roomFor(s, id) < 1) return { ok: false, reason: 'room' };
  for (const [item, n] of Object.entries(r.needs)) removeItem(s, item, n);
  addItem(s, id, 1);
  return { ok: true, item: id };
}

// ---------- the player's weapons and armor ----------
export const isArms = id => !!(ITEMS[id] && ITEMS[id].kind === 'arms');
export const newPlayer = () => ({ id: PLAYER_ID, name: 'You', equip: {} });

// puts the piece in inventory slot `index` on the player; whatever was worn there goes back to that slot
export function equipArms(s, index) {
  if (isAway(s, PLAYER_ID)) return { ok: false, reason: 'away' };
  if (!Number.isInteger(index) || index < 0 || index >= s.invSize) return { ok: false, reason: 'bad-slot' };
  const item = s.inv[index];
  if (!item || !isArms(item.id)) return { ok: false, reason: 'not-arms' };
  const slot = ITEMS[item.id].slot, p = s.player;
  const old = p.equip[slot];
  if (carriedWeight(p) - itemWeight(old) + itemWeight(item.id) > carryCapacity(p)) return { ok: false, reason: 'too-heavy' };
  item.n -= 1;
  if (!item.n) s.inv[index] = null;
  if (old) { if (!s.inv[index]) s.inv[index] = { id: old, n: 1 }; else addItem(s, old, 1); }
  p.equip = { ...p.equip, [slot]: item.id };
  return { ok: true, slot, item: item.id, removed: old || null };
}

export function unequipArms(s, slot) {
  const p = s.player, id = p.equip[slot];
  if (!id) return { ok: false, reason: 'empty' };
  if (isAway(s, PLAYER_ID)) return { ok: false, reason: 'away' };
  if (roomFor(s, id) < 1) return { ok: false, reason: 'room' };
  addItem(s, id, 1);
  const { [slot]: gone, ...rest } = p.equip;
  p.equip = rest;
  return { ok: true, item: id };
}

// keeps a loaded player inside the rules
export function cleanPlayer(p) {
  const src = p && typeof p === 'object' ? p : newPlayer();
  const name = String(src.name ?? '').trim().slice(0, 24) || 'You';
  const equip = Object.fromEntries(PLAYER_SLOTS.map(({ id }) => [id, src.equip && src.equip[id]]).filter(([slot, item]) => isArms(item) && ITEMS[item].slot === slot));
  return { id: PLAYER_ID, name, equip, ...(Number(src.injuredUntil) > 0 ? { injuredUntil: Number(src.injuredUntil) } : {}), ...(Number(src.lastFed) > 0 ? { lastFed: Number(src.lastFed) } : {}), ...(Number(src.flyingUntil) > 0 ? { flyingUntil: Number(src.flyingUntil) } : {}) };
}

// ---------- outfits ----------
// an outfit fits a baby of its species; null puts the baby back in its own look
export const outfitFits = (id, baby) => !!(OUTFITS[id] && OUTFITS[id].species === baby.type);

export function setOutfit(s, babyId, outfitId) {
  const baby = s.hatched.find(b => b.id === babyId);
  if (!baby) return { ok: false, reason: 'missing' };
  if (outfitId == null) { delete baby.outfit; return { ok: true, outfit: null }; }
  if (!(s.wardrobe || []).includes(outfitId)) return { ok: false, reason: 'not-owned' };
  if (!outfitFits(outfitId, baby)) return { ok: false, reason: 'wrong-species' };
  baby.outfit = outfitId;
  return { ok: true, outfit: outfitId };
}

// ---------- breeding ----------
export const trayFull = s => (s.eggs || []).length >= EGG_TRAY_SIZE;

// ---------- event codes ----------
// the event code typed, as the table knows it (PROMO_CODES): its id, or null
export function promoOf(code) {
  const hash = sha256(PROMO_SALT + String(code ?? '').replace(/[\s-]+/g, '').toUpperCase());
  return Object.keys(PROMO_CODES).find(id => PROMO_CODES[id].hash === hash) || null;
}
// redeems an event code once per game: its reward (an egg, as one found in a nest) goes in
export function redeemCode(s, code, now) {
  const id = promoOf(code);
  if (!id) return { ok: false, reason: 'invalid' };
  const promo = PROMO_CODES[id];
  if ((s.redeemed || []).includes(id)) return { ok: false, reason: 'used' };
  if (promo.off || (promo.until && now > promo.until)) return { ok: false, reason: 'expired' };
  const r = promo.reward, out = { ok: true, id };
  if (r.egg) {
    if (trayFull(s)) return { ok: false, reason: 'tray-full' };
    // (its genes and sex settled now, the same for the same game)
    const rand = seededRand(`promo:${id}:${(s.world && s.world.seed) || 1}`), [lo, hi] = EGG_GENES(EGG_STEP, false);
    const egg = { id: `promo-${id}`, type: r.egg, gen: 1, parents: [], laidAt: now, genes: Object.fromEntries(STATS.map(({ id: st }) => [st, lo + Math.floor(rand() * (hi - lo + 1))])) };
    egg.sex = rand() < 0.5 ? 'm' : 'f';
    s.eggs = [...(s.eggs || []), egg];
    out.egg = egg;
  }
  if (r.dino) {
    // one hatched already, grown to its stage: its genes and sex settled as an egg's would be
    const rand = seededRand(`promo:${id}:${(s.world && s.world.seed) || 1}`), [lo, hi] = EGG_GENES(EGG_STEP, false);
    const b = { id: newId(), type: r.dino, sex: rand() < 0.5 ? 'm' : 'f', name: suggestName(s, r.dino), at: now, gen: 1,
      genes: Object.fromEntries(STATS.map(({ id: st }) => [st, lo + Math.floor(rand() * (hi - lo + 1))])),
      fed: CAPSULES[r.dino][r.stage || 'baby'] || 0, lastFed: now, equip: {} };
    s.hatched.unshift(b);
    if (!(s.known || []).includes(r.dino)) s.known = [...(s.known || []), r.dino];
    out.dino = b;
  }
  s.redeemed = [...(s.redeemed || []), id];
  return out;
}

// why this pair can't breed, or null when it can
export function breedProblem(s, maleId, femaleId) {
  const m = s.hatched.find(b => b.id === maleId), f = s.hatched.find(b => b.id === femaleId);
  if (!m || !f) return 'missing';
  if (sexOf(m) !== 'm' || sexOf(f) !== 'f') return 'not-a-pair';
  if (m.type !== f.type) return 'different-species';
  if (!isAdult(m) || !isAdult(f)) return 'not-adult';
  if (isAway(s, maleId) || isAway(s, femaleId)) return 'away';
  if (s.breeding) return 'busy';
  if (trayFull(s)) return 'tray-full';
  return null;
}

export function startBreeding(s, maleId, femaleId, now) {
  const problem = breedProblem(s, maleId, femaleId);
  if (problem) return { ok: false, reason: problem };
  const type = s.hatched.find(b => b.id === maleId).type;
  s.breeding = { type, maleId, femaleId, startedAt: now, readyAt: now + BREED_MINS[type] * 60000 };
  return { ok: true, readyAt: s.breeding.readyAt };
}

export function collectEgg(s, now, rand = Math.random) {
  const br = s.breeding;
  if (!br) return { ok: false, reason: 'not-breeding' };
  if (now < br.readyAt) return { ok: false, reason: 'not-ready' };
  if (trayFull(s)) return { ok: false, reason: 'tray-full' };
  const m = s.hatched.find(b => b.id === br.maleId), f = s.hatched.find(b => b.id === br.femaleId);
  s.breeding = null;
  if (!m || !f) return { ok: false, reason: 'missing' };
  const egg = {
    id: newId(), type: br.type, genes: inheritGenes(m.genes, f.genes, rand), sex: rand() < 0.5 ? 'm' : 'f',
    gen: Math.max(m.gen || 1, f.gen || 1) + 1, parents: [m.id, f.id], laidAt: now,
  };
  s.eggs = [...(s.eggs || []), egg];
  bump(s, 'eggsLaid');
  return { ok: true, egg };
}

// ---------- daily reward ----------
const DAY_MS = 86400000;
const OFFSET_MS = DAY_OFFSET_HOURS * 3600000;

// the game day number; it changes at midnight in DAY_OFFSET_HOURS
export const gameDay = now => Math.floor((now + OFFSET_MS) / DAY_MS);
export const nextDayAt = now => (gameDay(now) + 1) * DAY_MS - OFFSET_MS;

export function dailyStatus(s, now) {
  const d = s.daily || { last: null, streak: 0, best: 0 };
  const today = gameDay(now);
  const claimedToday = d.last === today;
  const continues = d.last === today - 1;
  const nextStreak = claimedToday ? d.streak : continues ? d.streak + 1 : 1;
  const index = (nextStreak - 1) % DAILY_REWARDS.length;
  return {
    today, claimedToday,
    streak: claimedToday || continues ? d.streak : 0,   // a missed day breaks the streak
    best: d.best || 0,
    nextStreak, index, reward: DAILY_REWARDS[index],
  };
}

export function claimDaily(s, now) {
  const st = dailyStatus(s, now);
  if (st.claimedToday) return { ok: false, reason: 'claimed' };
  earn(s, st.reward.coins);
  const lost = {};
  for (const [id, n] of Object.entries(st.reward.items || {})) {
    const left = addItem(s, id, n);
    if (left) lost[id] = left;
  }
  s.daily = { last: st.today, streak: st.nextStreak, best: Math.max(st.best, st.nextStreak) };
  return { ok: true, reward: st.reward, streak: st.nextStreak, lost };
}

// ---------- achievements ----------
export function achievementProgress(s, metric) {
  const types = new Set(s.hatched.map(b => b.type));
  switch (metric) {
    case 'hatched': return s.hatched.length;
    case 'hatched_raptor': return s.hatched.filter(b => b.type === 'raptor').length;
    case 'hatched_rex': return s.hatched.filter(b => b.type === 'rex').length;
    case 'species': return types.size;
    case 'pair': return [...types].some(t => {
      const sexes = new Set(s.hatched.filter(b => b.type === t).map(sexOf));
      return sexes.has('m') && sexes.has('f');
    }) ? 1 : 0;
    case 'meals': return (s.stats && s.stats.meals) || 0;
    case 'best_streak': return (s.daily && s.daily.best) || 0;
    case 'slots': return s.invSize;
    case 'coins_earned': return (s.stats && s.stats.coinsEarned) || 0;
    case 'eggs_laid': return (s.stats && s.stats.eggsLaid) || 0;
    default: return 0;
  }
}

export function achievementList(s) {
  return ACHIEVEMENTS.map(a => {
    const progress = Math.min(a.target, achievementProgress(s, a.metric));
    const claimed = !!(s.achievements && s.achievements[a.id]);
    return { ...a, progress, done: progress >= a.target, claimed };
  });
}

export const claimableCount = (s, now) =>
  achievementList(s).filter(a => a.done && !a.claimed).length + (dailyStatus(s, now).claimedToday ? 0 : 1);

export function claimAchievement(s, id, now) {
  const a = achievementList(s).find(x => x.id === id);
  if (!a) return { ok: false, reason: 'unknown-achievement' };
  if (a.claimed) return { ok: false, reason: 'claimed' };
  if (!a.done) return { ok: false, reason: 'not-done' };
  earn(s, a.coins);
  s.achievements = { ...(s.achievements || {}), [id]: now };
  return { ok: true, achievement: id, coins: a.coins };
}

// ---------- actions ----------
// Every change a player can make, by name. The browser applies these for instant feedback and the
// server applies the very same functions to decide what really happened, so the rules live once.
// Each returns { ok: true, ...details } or { ok: false, reason }.
const fail = reason => ({ ok: false, reason });
const slotIndex = (s, i) => Number.isInteger(i) && i >= 0 && i < s.invSize;
const MAX_TAPS_PER_REQUEST = 600;

export const ACTIONS = {
  // { eggId } puts an egg from the tray in the incubator; eggs come from expeditions and breeding only
  startEgg(s, { eggId }, now) {
    if (s.current) return fail('busy');
    const egg = (s.eggs || []).find(e => e.id === eggId);
    if (!egg) return fail('unknown-egg');
    s.eggs = s.eggs.filter(e => e.id !== eggId);
    startEgg(s, egg.type, now, egg);
    return { ok: true };
  },
  pickStarter(s, { type }, now) {
    return pickStarter(s, type, now);
  },
  startBreeding(s, { maleId, femaleId }, now) {
    return startBreeding(s, maleId, femaleId, now);
  },
  cancelBreeding(s) {
    if (!s.breeding) return fail('not-breeding');
    s.breeding = null;
    return { ok: true };
  },
  collectEgg(s, args, now, rand) {
    return collectEgg(s, now, rand);
  },
  buyGear(s, { id }) {
    return buyGear(s, id);
  },
  equip(s, { babyId, index }) {
    return equipGear(s, babyId, index);
  },
  unequip(s, { babyId, slot }) {
    return unequipGear(s, babyId, slot);
  },
  setOutfit(s, { babyId, outfitId = null }) {
    return setOutfit(s, babyId, outfitId);
  },
  warmEgg(s, { taps = 1 }) {
    let saved = 0;
    const n = Math.min(MAX_TAPS_PER_REQUEST, Math.max(1, Math.floor(Number(taps) || 1)));
    for (let i = 0; i < n && warmEgg(s); i++) saved++;
    return saved ? { ok: true, saved } : fail('warm');
  },
  giveUpEgg(s) {
    if (!s.current) return fail('no-egg');
    s.current = null;
    return { ok: true };
  },
  hatch(s, args, now, rand) {
    const result = hatchEgg(s, now, rand);
    return result ? { ok: true, ...result } : fail('not-ready');
  },
  rename(s, { id, name }) {
    const baby = s.hatched.find(b => b.id === id);
    const clean = String(name ?? '').trim().slice(0, 24);
    if (!baby) return fail('missing');
    if (!clean) return fail('empty-name');
    baby.name = clean;
    return { ok: true };
  },
  feed(s, { id }, now) {
    return feedBaby(s, id, now);
  },
  // a team: [{ kind: 'dino' | 'player' | 'pack', id }]; one explorer's babyId still works
  explore(s, { team, babyId, hex, train, via }, now) {
    return startExpedition(s, team || babyId, hex, now, !!train, via);
  },
  // a party out is called home: from where it waits, or from where it is by now on its way out
  recall(s, { id }, now) {
    return recallParty(s, String(id), now);
  },
  // a party waiting at a hex is sent on: to another hex, or home ('0,0')
  order(s, { id, hex, train, via }, now) {
    return orderParty(s, String(id), String(hex), now, !!train, via);
  },
  // a team waiting in the wild makes camp, or breaks it (and finds what it found)
  camp(s, { id }, now) {
    return makeCamp(s, String(id), now);
  },
  breakCamp(s, { id }, now) {
    return breakCamp(s, String(id), now);
  },
  // what happened on a party's leg, told up to the next decision, which choice answers: fight (what
  // stood its ground), flee (a predator scattered the player's group: run too), hunt (one spotted at a
  // distance), back (turn back home instead of going on), witness (a hunt watched, stepped into:
  // { act: 'prey' | 'predator', hunter: a unit's id })
  journey(s, { id, fight, flee, hunt, back, witness, nest, decoy, airlift }, now) {
    const w = witness && typeof witness === 'object' && ['prey', 'predator'].includes(witness.act) ? { act: witness.act, hunter: String(witness.hunter || '') } : null;
    const n = ['take', 'candle', 'keep', 'sneak', 'lure', 'fight'].includes(nest) ? nest : null;
    // (the dinosaurs to fly home: their ids)
    const air = Array.isArray(airlift) ? airlift.slice(0, 12).map(String) : [];
    return journeyStep(s, String(id), { fight: !!fight, flee: !!flee, hunt: !!hunt, back: !!back, witness: w, nest: n, decoy: decoy == null ? null : String(decoy), airlift: air }, now);
  },
  equipArms(s, { index }) {
    return equipArms(s, index);
  },
  unequipArms(s, { slot }) {
    return unequipArms(s, slot);
  },
  // the player read a tip from the guide; it is not shown again
  seeGuide(s, { id }) {
    if (!GUIDE[id]) return fail('unknown-tip');
    if (s.tutorial.seen.includes(id)) return fail('seen');
    s.tutorial.seen.push(id);
    return { ok: true };
  },
  renamePlayer(s, { name }) {
    const clean = String(name ?? '').trim().slice(0, 24);
    if (!clean) return fail('empty-name');
    s.player.name = clean;
    return { ok: true };
  },
  formPack(s, args) {
    return formPack(s, args);
  },
  setPackMembers(s, args) {
    return setPackMembers(s, args);
  },
  renamePack(s, args) {
    return renamePack(s, args);
  },
  disbandPack(s, args) {
    return disbandPack(s, args);
  },
  // the Team tab's presets: a unit in a place ({ team, slot, unit: { kind, id } | null }), or a name
  setTeamSlot(s, args) {
    return setTeamSlot(s, args);
  },
  renameTeam(s, args) {
    return renameTeam(s, args);
  },
  heal(s, { babyId }, now) {
    return healBaby(s, babyId, now);
  },
  transfuse(s, { babyId }, now) {
    return transfuse(s, babyId, now);
  },
  mendFrill(s, { babyId }) {
    return mendFrill(s, babyId);
  },
  craft(s, { id }) {
    return craftItem(s, id);
  },
  move(s, { a, b }) {
    if (!slotIndex(s, a) || !slotIndex(s, b)) return fail('bad-slot');
    return moveSlot(s, a, b) ? { ok: true } : fail('empty-slot');
  },
  sort(s) {
    sortInventory(s);
    return { ok: true };
  },
  split(s, { i }) {
    if (!slotIndex(s, i)) return fail('bad-slot');
    const j = splitStack(s, i);
    return j >= 0 ? { ok: true, to: j } : fail('cannot-split');
  },
  discard(s, { i }) {
    if (!slotIndex(s, i)) return fail('bad-slot');
    return discardOne(s, i) ? { ok: true } : fail('empty-slot');
  },
  payDebt(s) {
    return payDebt(s);
  },
  flyHome(s, { id }, now) {
    return flyHome(s, String(id), now);
  },
  // tending to one of a team stopped on its way: { id, member, what: 'herb' | 'transfusion' | 'eat' | 'drink' }
  tripCare(s, { id, member, what }) {
    return tripCare(s, String(id), String(member), String(what));
  },
  sell(s, { i, n }) {
    if (!slotIndex(s, i)) return fail('bad-slot');
    return sellItems(s, i, n);
  },
  buyRow(s) {
    return buyRow(s);
  },
  buyPack(s, { k }) {
    return buyPack(s, k);
  },
  // an event code, typed by the player: { code }
  redeem(s, { code }, now) {
    return redeemCode(s, code, now);
  },
  claimDaily(s, args, now) {
    return claimDaily(s, now);
  },
  claimAchievement(s, { id }, now) {
    return claimAchievement(s, id, now);
  },
};

export function applyAction(s, name, args, now, rand = Math.random) {
  const fn = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null;
  if (!fn) return fail('unknown-action');
  return fn(s, args && typeof args === 'object' ? args : {}, now, rand);
}
