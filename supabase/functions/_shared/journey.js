// Journeys: a party out in the world. It sets out from the nest to a hex (a leg), waits there for
// orders, goes on to another hex or comes home (each one more leg, with the same dangers on the way).
// What happens on a leg is told when the player collects it, hex by hex, stopping at each event for
// the player's decision. Like economy.js these only work on the state passed in, so the browser and
// the server share them, and every roll is seeded so both roll the same.
//
// A party, in s.world.expeditions:
// { id, team, members, at: the hex it is at (or set out from), leg, health: { id: share of its health
//   left }, down: [ids too hurt to fight, carried by the rest], hurt: [ids that come home injured
//   whatever their health], dead: [{ id, name, type }], carry: { items: { id: n }, coins, eggs: [] },
//   pending: the event waiting for the player's decision, or null,
//   hex, trip, startedAt, returnAt: the leg's destination, number, start and arrival, for the screens }
// leg: { n, from, to, path: [the hexes walked, from excluded], step: the next one to tell, startedAt,
//   arriveAt, recalled: called back mid-way (it ends where it was and turns for home) } | null: waiting
import {
  TRAVEL, RUNNER, INTERCEPT, WITNESS, NEST_CALM, PLAYER_ID, SPECIES, ITEMS, DEATH, CRITICAL_MINS, INJURY_MINS, BRUISE_MINS, TOUGH,
  LOOT_PER_HEX, WIN_COINS_PER_HEX, FRENZY_DROPS, GEAR_DROP, EGG_STEP, EGG_CHANCE, EGG_GENES, EGG_TRAY_SIZE, STATS, SCOUT,
  DISCOVERY_COINS_PER_HEX, EXPEDITION_SLOTS, TEAM_SLOTS, HAZARDS, HAZARD_MAX, HAZARD_WOUND, HAZARD_FLOOR, SIZE_ORDER, PLAYER_SIZE,
} from './config.js';
import { addItem, earn, hungerEvery, seededRand } from './economy.js';
import { teamFight } from './combat.js';
import { travelPath, routeCost, stepCost, cellAt } from './map.js';
import {
  hexKey, parseKey, hexDist, nearOf, inWorld, neighbors, biomeAt, watery, isWater, threatAt, explorerOf, teamFrom, exploreProblem, teamUnits,
  teamSlow, allRunners, hasScout, teamHaul, bodyOf, encounterChance, keepsAway, passesBy, sailBackOff, huntOdds, scatterOf, runOf,
  runnersSpot, eyesChance, standsGround, standoffOf, chaseOf, witnessAt, interveneOptions, lootTable, eggKinds, pickWeighted, bury,
} from './world.js';

export const HOME = '0,0';
const W = s => s.world;
const isAttacker = foe => (foe.members[0].role || 'attacker') === 'attacker';

// ---------- the party ----------
export const partyOf = (s, id) => W(s).expeditions.find(p => p.id === id) || null;
export const healthOf = (p, id) => (p.health && p.health[id] != null ? p.health[id] : 1);
export const isDown = (p, id) => (p.down || []).includes(id);
// the units still on their feet (those down are carried, and don't fight)
export const standingUnits = (s, p) => p.team
  .map(u => ({ ...u, members: u.members.filter(id => explorerOf(s, id) && !isDown(p, id)) }))
  .filter(u => u.members.length);
const anyStanding = (s, p) => standingUnits(s, p).length > 0;
// minutes for a leg from one hex to another, the easiest way: half a trip there and back (TRAVEL),
// at the pace of the slowest (BODY slow), twice as fast for a team of runners (RUNNER)
export const legMins = (s, members, from, to) =>
  Math.max(1, Math.round(routeCost(W(s).seed, parseKey(from), parseKey(to)) * TRAVEL.mins / 2 * teamSlow(s, members) * (allRunners(s, members) ? RUNNER.trip : 1)));

function startLeg(s, p, to, at) {
  const w = W(s);
  w.trips += 1;
  const path = travelPath(w.seed, parseKey(to), parseKey(p.at)).map(h => hexKey(...h));
  // (the land's dangers on the way may cost it time: a storm sat out, a river waited on)
  const lost = hazardsOf(w.seed, w.trips, path).reduce((t, z) => t + z.mins, 0);
  p.leg = { n: w.trips, from: p.at, to, path, step: 0, startedAt: at, arriveAt: at + (legMins(s, p.members, p.at, to) + lost) * 60000 };
  Object.assign(p, { hex: to, trip: w.trips, startedAt: at, returnAt: p.leg.arriveAt });
}

// a new party sets out from the nest to a hex
export function startExpedition(s, team, key, now) {
  const problem = exploreProblem(s, team, key, now);
  if (problem) return { ok: false, reason: problem };
  const w = W(s);
  const units = teamFrom(s, team), members = units.flatMap(u => u.members);
  const p = { id: `t${w.trips + 1}`, team: units, members, at: HOME, leg: null, health: {}, down: [], hurt: [], dead: [], carry: { items: {}, coins: 0, eggs: [] }, pending: null };
  startLeg(s, p, key, now);
  w.expeditions.push(p);
  return { ok: true, expedition: p };
}

// where a party on a leg is by now: the index of the last hex of its path it reached (-1: still leaving)
export function positionOf(s, p, now) {
  const leg = p.leg;
  if (!leg) return null;
  const seed = W(s).seed, costs = leg.path.map(k => stepCost(cellAt(seed, parseKey(k))));
  const total = costs.reduce((t, c) => t + c, 0) || 1;
  const done = Math.min(1, Math.max(0, (now - leg.startedAt) / Math.max(1, leg.arriveAt - leg.startedAt))) * total;
  let i = -1, sum = 0;
  while (i + 1 < costs.length && sum + costs[i + 1] <= done) sum += costs[++i];
  return i;
}
// when a leg reached the hex at index i of its path
function timeAt(s, leg, i) {
  const seed = W(s).seed, costs = leg.path.map(k => stepCost(cellAt(seed, parseKey(k))));
  const total = costs.reduce((t, c) => t + c, 0) || 1;
  const sum = costs.slice(0, i + 1).reduce((t, c) => t + c, 0);
  return Math.round(leg.startedAt + (leg.arriveAt - leg.startedAt) * sum / total);
}

// a party waiting at a hex is sent on: to another hex, or home (HOME)
export function orderParty(s, id, to, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (p.leg) return { ok: false, reason: 'on-the-way' };
  const h = parseKey(to);
  if (!h || !inWorld(h)) return { ok: false, reason: 'out-of-map' };
  if (to === p.at) return { ok: false, reason: 'there' };
  if (isWater(W(s).seed, h)) return { ok: false, reason: 'water' };
  if (routeCost(W(s).seed, parseKey(p.at), h) === Infinity) return { ok: false, reason: 'unreachable' };
  // with nobody on their feet, the only way is home
  if (to !== HOME && !anyStanding(s, p)) return { ok: false, reason: 'nobody-standing' };
  startLeg(s, p, to, now);
  return { ok: true, expedition: p };
}

// Calling a party back: one waiting somewhere sets out for home; one on its way out stops where it is
// by now and turns for home (what it met before then is still told). Not one already heading home.
export function recallParty(s, id, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (!p.leg) return orderParty(s, id, HOME, now);
  const leg = p.leg;
  if (leg.to === HOME || leg.recalled) return { ok: false, reason: 'homeward' };
  if (now >= leg.arriveAt) return { ok: false, reason: 'arrived' };
  const i = Math.max(leg.step - 1, positionOf(s, p, now));
  if (i < 0) {
    // it hadn't left yet: straight back, nothing happened
    if (leg.from === HOME) { W(s).expeditions = W(s).expeditions.filter(x => x !== p); return { ok: true, home: true }; }
    p.at = leg.from; p.leg = null;
    startLeg(s, p, HOME, now);
    return { ok: true, expedition: p };
  }
  Object.assign(leg, { path: leg.path.slice(0, i + 1), to: leg.path[i], arriveAt: now, recalled: true });
  Object.assign(p, { hex: leg.to, returnAt: now });
  return { ok: true, expedition: p };
}

// ---------- telling a leg ----------
// Tells what happened on a party's leg up to the next decision: { ok, story: what happened, in order
// (each with the hex, the index in its leg's path where it happened, and the leg's n), legs: the legs
// told ({ n, from, to, path, step: where the telling began }), leg: the last of them, pending: the decision waiting (pendingView), expedition: the party (null once home or
// lost) }. choice answers the decision waiting: { fight }, { flee }, { hunt }, { back }, or
// { witness: { act: 'prey' | 'predator', hunter } }.
export function journeyStep(s, id, choice = {}, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  if (!p.leg) return { ok: false, reason: 'waiting' };
  if (now < p.leg.arriveAt) return { ok: false, reason: 'not-back' };
  const ctx = { s, p, now, story: [], legs: [], n: p.leg.n };
  // (every event is told with the leg it happened on, n)
  ctx.story.push = (...xs) => Array.prototype.push.apply(ctx.story, xs.map(x => ({ n: ctx.n, ...x })));
  // (step: the next hex to tell when the telling began)
  const snap = () => ({ n: p.leg.n, from: p.leg.from, to: p.leg.to, path: [...p.leg.path], step: p.leg.step, startedAt: p.leg.startedAt, arriveAt: p.leg.arriveAt });
  ctx.legs.push(snap());
  if (p.pending) {
    const ev = p.pending;
    p.pending = null;
    if (ev.kind === 'go-on') { if (choice && choice.back) turnBack(ctx, ev.idx); }
    else if (run(ctx, ev, choice || {}) && !ctx.gone) afterEvent(ctx, ev);
  }
  walk(ctx);
  return {
    ok: true, story: ctx.story, legs: ctx.legs, leg: ctx.legs[ctx.legs.length - 1],
    pending: !ctx.gone && p.pending ? pendingView(s, p) : null, expedition: ctx.gone ? null : p,
  };

  function walk(c) {
    while (!c.gone && p.leg && !p.pending) {
      const leg = p.leg;
      c.n = leg.n;
      if (c.legs[c.legs.length - 1].n !== leg.n) c.legs.push(snap());
      if (now < leg.arriveAt) break;
      if (leg.step >= leg.path.length) { arrive(c); continue; }
      const idx = leg.step, key = leg.path[idx];
      leg.step += 1;
      reveal(s, [key]);
      const z = hazardsOf(W(s).seed, leg.n, leg.path).find(x => x.idx === idx);
      if (z) suffer(c, z);
      if (c.gone) break;
      const ev = idx === leg.path.length - 1 && !leg.recalled ? endEvent(c, idx) : wayEvent(c, idx);
      if (ev && run(c, ev, null) && !c.gone && !p.pending) afterEvent(c, ev);
    }
  }
}

// After an event on the way out: go on, or turn back (nobody on their feet: they turn back)
function afterEvent(ctx, ev) {
  const { s, p } = ctx, leg = p.leg;
  if (!leg || leg.to === HOME || ev.idx >= leg.path.length - 1) return;
  if (!anyStanding(s, p)) { turnBack(ctx, ev.idx); return; }
  p.pending = { kind: 'go-on', idx: ev.idx, hex: leg.path[ev.idx] };
}
// the leg ends at the hex at index i, and the party heads home from there, from when it was there
function turnBack(ctx, i) {
  const { s, p, story } = ctx, leg = p.leg;
  const at = timeAt(s, leg, i);
  p.at = leg.path[i];
  p.leg = null;
  story.push({ kind: 'turned', hex: p.at, idx: i });
  if (p.at === HOME) { comeHome(ctx); return; }
  startLeg(s, p, HOME, at);
}

// the end of a leg: at home the party breaks up and brings everything in; elsewhere it waits there
// (having looked around: gather); a leg called back turns for home where it stopped
function arrive(ctx) {
  const { s, p, story } = ctx, leg = p.leg;
  p.at = leg.to;
  if (leg.to === HOME) { comeHome(ctx); return; }
  if (leg.recalled) {
    const at = leg.arriveAt;
    p.leg = null;
    story.push({ kind: 'turned', hex: p.at, idx: leg.path.length - 1, recalled: true });
    startLeg(s, p, HOME, at);
    return;
  }
  p.leg = null;
  gather(ctx, leg);
  Object.assign(p, { hex: p.at, returnAt: leg.arriveAt });
}

const reveal = (s, keys) => {
  const w = W(s);
  for (const k of keys) if (!w.revealed.includes(k)) w.revealed.push(k);
};

// ---------- the land's own dangers ----------
// The dangers of the land a leg crosses (HAZARDS), rolled once per hex of the leg (none in the calm
// around a settlement), at most HAZARD_MAX: [{ idx, kind, mins: minutes lost, wound: who it wears down }]
export function hazardsOf(seed, n, path) {
  const out = [];
  for (let idx = 0; idx < path.length && out.length < HAZARD_MAX; idx++) {
    const h = parseKey(path[idx]), cell = cellAt(seed, h);
    if (!cell || nearOf(seed, h) <= NEST_CALM) continue;
    const rand = seededRand(`haz:${seed}:${n}:${idx}`);
    for (const z of HAZARDS[cell.biome] || []) {
      if ((z.river && !cell.river) || (z.cold != null && !(cell.heat < z.cold))) continue;
      if (rand() >= z.chance * (z.lava && cell.lava ? z.lava : 1)) continue;
      out.push({ idx, kind: z.kind, mins: z.delay ? z.delay[0] + Math.floor(rand() * (z.delay[1] - z.delay[0] + 1)) : 0, wound: z.wound || null });
      break;
    }
  }
  return out;
}
// A danger of the land met at a hex: the time it cost is already in the leg; someone of those on their
// feet may be worn down by it (never brought down). Told unless nothing came of it.
function suffer(ctx, z) {
  const { s, p, story } = ctx, w = W(s), key = p.leg.path[z.idx];
  const rand = seededRand(`hurt:${w.seed}:${p.leg.n}:${z.idx}`);
  const members = standingUnits(s, p).flatMap(u => u.members);
  const size = id => SIZE_ORDER.indexOf(bodyOf(s, id).size || PLAYER_SIZE);
  const pool = !z.wound ? [] : z.wound === 'heavy' ? members.filter(id => size(id) >= SIZE_ORDER.indexOf('large'))
    : z.wound === 'cold' ? members.filter(id => id !== PLAYER_ID && size(id) <= SIZE_ORDER.indexOf('small')) : members;
  const who = pool.length ? pool[Math.floor(rand() * pool.length)] : null;
  if (!z.mins && !who) return;
  if (who) {
    const cut = HAZARD_WOUND[0] + rand() * (HAZARD_WOUND[1] - HAZARD_WOUND[0]);
    p.health[who] = Math.round(Math.max(Math.min(HAZARD_FLOOR, healthOf(p, who)), healthOf(p, who) - cut) * 1000) / 1000;
  }
  const b = who && who !== PLAYER_ID ? explorerOf(s, who) : null;
  story.push({ kind: 'hazard', hazard: z.kind, hex: key, idx: z.idx, biome: biomeAt(w.seed, parseKey(key)), mins: z.mins, ...(who ? { who: { id: who, name: who === PLAYER_ID ? 'You' : b ? b.name : '?' } } : {}) });
}

// ---------- what happens on the way ----------
// At a hex on the way (past the calm around the nest): now and then a hunt, wild against wild, the
// team watches; otherwise what lives there may notice the team (INTERCEPT): a lair's Alpha often,
// anything else by how much the team stands out
function wayEvent(ctx, idx) {
  const { s, p } = ctx, w = W(s), key = p.leg.path[idx], h = parseKey(key);
  if (nearOf(w.seed, h) <= NEST_CALM) return null;
  const units = standingUnits(s, p);
  if (!units.length) return null;
  const rand = seededRand(`way:${w.seed}:${p.leg.n}:${idx}`);
  if (rand() < WITNESS.way && witnessOf(s, p, idx)) return { kind: 'witness', idx, hex: key };
  const t = threatAt(w.seed, h), team = teamUnits(s, units);
  if (isAttacker(t.foe) && keepsAway(t, team) && !huntOdds(team, t.foe.members[0])) return null;
  const chance = t.lair ? INTERCEPT.lair : encounterChance(t, team, biomeAt(w.seed, h), hasScout(s, p.members)) * INTERCEPT.share;
  return rand() < chance ? { kind: 'meet', idx, hex: key } : null;
}
// At the journey's end: a hunt the team watches (WITNESS), or what lives there, met as often as it
// would be (encounterChance)
function endEvent(ctx, idx) {
  const { s, p } = ctx, w = W(s), key = p.leg.path[idx], h = parseKey(key);
  const units = standingUnits(s, p);
  if (!units.length) return null;
  const rand = seededRand(`end:${w.seed}:${p.leg.n}`);
  if (rand() < WITNESS.chance && witnessOf(s, p, idx)) return { kind: 'witness', idx, hex: key };
  const t = threatAt(w.seed, h);
  return rand() < encounterChance(t, teamUnits(s, units), biomeAt(w.seed, h), hasScout(s, p.members)) ? { kind: 'meet', idx, hex: key } : null;
}
const witnessOf = (s, p, idx) => witnessAt(W(s).seed, parseKey(p.leg.path[idx]), seededRand(`wit:${W(s).seed}:${p.leg.n}:${idx}`));

// Plays an event: one waiting for a decision is left pending (choice null) or played with it. Returns
// whether anything happened the player is told of.
function run(ctx, ev, choice) {
  const { s, p, story, now } = ctx, w = W(s), h = parseKey(ev.hex);
  const rand = seededRand(`ev:${w.seed}:${p.leg.n}:${ev.idx}:${ev.kind}`);
  const units = standingUnits(s, p), team = teamUnits(s, units);
  const threat = threatAt(w.seed, h);
  const tell = x => story.push({ hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), ...x });
  const ask = kind => { p.pending = { kind, idx: ev.idx, hex: ev.hex }; return true; };
  if (!units.length) return false;

  if (ev.kind === 'meet') {
    if (keepsAway(threat, team)) {
      // it keeps away from the team, but may be spotted at a distance, and hunted
      return huntOdds(team, threat.foe.members[0]) ? ask('sighting') : false;
    }
    const back = sailBackOff(threat, team, watery(w.seed, h));
    if (back && rand() < back) {
      // a rival as big as the team's Spinosaurus sized up its sail and backed off
      const sail = team.flatMap(u => u.members).filter(m => m.type && SPECIES[m.type].sail).reduce((a, m) => (m.power > a.power ? m : a));
      tell({ kind: 'backedOff', name: threat.foe.name, count: threat.foe.members.length, by: sail.name });
      return true;
    }
    // the player was along and some ran: the player decides
    if (scatterOf(s, units, threat)) return ask('scatter');
    if (!standsGround(threat.foe) && runnersSpot(s, p.members, rand, biomeAt(w.seed, h))) {
      // runners (Gallimimus) saw the predator first: the team runs, and it gives chase to the slowest
      const chased = chaseOf(team, threat.foe, biomeAt(w.seed, h));
      let caught = null;
      if (chased && rand() < chased.chance) caught = fall(ctx, units[chased.unit].members[chased.member], rand() < chased.death);
      tell({ kind: 'chase', name: threat.foe.name, count: threat.foe.members.length, spotted: 'runners', caught });
      return true;
    }
    const eyes = eyesChance(s, p.members, biomeAt(w.seed, h));
    if (!standsGround(threat.foe) && eyes && rand() < eyes) {
      // watchful ones (Hypsilophodon) saw it first: the team scatters in zigzags, nobody is caught
      tell({ kind: 'chase', name: threat.foe.name, count: threat.foe.members.length, spotted: 'eyes', caught: null, scattered: true });
      return true;
    }
    if (standsGround(threat.foe)) return ask('standoff');
    fight(ctx, ev, rand);
    return true;
  }
  if (ev.kind === 'scatter') {
    const sc = scatterOf(s, units, threat);
    if (!sc) { fight(ctx, ev, rand); return true; }
    if (choice === null) return ask('scatter');
    if (!choice.flee) { fight(ctx, ev, rand, { thrown: sc.mounted, scatter: sc }); return true; }
    const r = runOf(s, units, threat, sc, biomeAt(w.seed, h));
    const safe = !!(r && r.safe && rand() < r.safe);
    if (r && !safe && rand() < r.chance) {
      // caught: the player (or one who'd fight) turns to fight; one of those who ran may not survive
      if (r.fights) { fight(ctx, ev, rand, { forced: r.id, scatter: sc }); return true; }
      tell({ kind: 'chase', name: threat.foe.name, count: threat.foe.members.length, scatter: scatterView(sc), caught: fall(ctx, r.id, rand() < r.death) });
    } else tell({ kind: 'chase', name: threat.foe.name, count: threat.foe.members.length, scatter: scatterView(sc), caught: null, ...(safe ? { scattered: true } : {}) });
    return true;
  }
  if (ev.kind === 'standoff') {
    if (choice === null) return ask('standoff');
    if (choice.fight) fight(ctx, ev, rand, { standoff: true });
    else tell({ kind: 'standoff', ...standoffOf(threat), fought: false });
    return true;
  }
  if (ev.kind === 'sighting') {
    const odds = huntOdds(team, threat.foe.members[0]);
    if (!odds) return false;
    if (choice === null) return ask('sighting');
    const base = { kind: 'sighting', name: threat.foe.name, species: threat.entry.species, count: threat.foe.members.length, hunter: odds.hunter };
    if (!choice.hunt) { tell({ ...base, hunted: false }); return true; }
    const caught = rand() < odds.chance;
    const got = caught ? carcass(ctx, threat.entry, threat.step, rand) : [];
    const coins = caught ? threat.step * WIN_COINS_PER_HEX * (threat.lair ? 2 : 1) : 0;
    p.carry.coins += coins;
    tell({ ...base, hunted: true, caught, loot: got, coins });
    return true;
  }
  if (ev.kind === 'witness') {
    const wt = witnessOf(s, p, ev.idx);
    if (!wt) return false;
    if (choice === null) return ask('witness');
    const told = { kind: 'witness', hunter: wt.hunter, prey: wt.prey, outcome: wt.outcome, act: 'none', loot: [] };
    const want = choice.witness && typeof choice.witness === 'object' ? choice.witness : null;
    const opt = want && interveneOptions(s, { team: units }, wt).find(o => o.id === want.hunter);
    const act = want && want.act, go = opt && (act === 'prey' ? opt.prey : act === 'predator' ? opt.predator : null);
    if (go && go.ok) {
      const by = units.find(u => u.id === opt.id), me = units.filter(u => u.kind === 'player');
      Object.assign(told, { act, by: opt.name });
      const step = threat.step;
      const hunterAs = { foe: wt.hunterFoe, entry: wt.hunter.entry, step, name: wt.hunter.name };
      if (act === 'prey') {
        told.caught = rand() < go.chance;
        if (told.caught && go.backsOff) told.loot.push(...carcass(ctx, wt.prey.entry, step, rand));
        else if (told.caught) {
          // the hunter comes for the kill: the player and the one who ran it down fight it for it
          told.contested = true;
          const b = fight(ctx, ev, rand, { as: hunterAs, units: [...me, by], defend: true, silent: true });
          told.battle = b;
          if (b.win) told.loot.push(...carcass(ctx, wt.prey.entry, step, rand));
        } else if (!passesBy({ entry: wt.hunter.entry, foe: wt.hunterFoe }, team)) {
          // its meal got away: it turns on the team, if anything in it is on its menu
          told.turned = true;
          told.battle = fight(ctx, ev, rand, { as: hunterAs, silent: true });
        }
      } else if (go.chase) {
        // it runs from this hunter, and the prey runs too
        told.caught = rand() < go.chance;
        if (told.caught) told.loot.push(...carcass(ctx, wt.hunter.entry, step, rand));
      } else told.battle = fight(ctx, ev, rand, { as: hunterAs, units: [...me, by], defend: true, silent: true });
      if (told.loot.length && !told.battle) { told.coins = step * WIN_COINS_PER_HEX; p.carry.coins += told.coins; }
    }
    tell(told);
    return true;
  }
  return false;
}

const scatterView = sc => ({ name: sc.name, prey: sc.prey, mounted: sc.mounted, alone: sc.alone });

// the carcass of what the team brought down: its loot, more the stronger it was (AGES), carried home
function carcass(ctx, entry, step, rand) {
  const mult = 1 + (step - 1) * LOOT_PER_HEX, got = [];
  for (const [item, min, max] of entry.loot || []) {
    const lo = Math.round(min * mult), hi = Math.round(max * mult);
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    if (n > 0) got.push(carryItem(ctx.p, item, n));
  }
  return got;
}
function carryItem(p, item, n) {
  if (!ITEMS[item] || n <= 0) return { id: item, n: 0 };
  p.carry.items[item] = (p.carry.items[item] || 0) + n;
  return { id: item, n };
}

// One of the party caught or brought down: it dies (buried at once: gone from the nest), or it is
// down, carried by the rest. Returns { id, name, died }.
function fall(ctx, id, dies) {
  const { s, p } = ctx;
  const b = explorerOf(s, id), name = b ? b.name : '?';
  if (dies && id !== PLAYER_ID) { die(ctx, id); return { id, name, died: true }; }
  p.health[id] = 0;
  if (!p.down.includes(id)) p.down.push(id);
  return { id, name, died: false };
}
function die(ctx, id) {
  const { s, p } = ctx;
  const gone = bury(s, id);
  if (gone) p.dead.push(gone);
  p.team = p.team.map(u => ({ ...u, members: u.members.filter(m => m !== id) })).filter(u => u.members.length);
  p.members = p.members.filter(m => m !== id);
  p.down = p.down.filter(m => m !== id);
  p.hurt = p.hurt.filter(m => m !== id);
  delete p.health[id];
  if (!p.members.length) {
    // nobody left: the party is lost, and all it carried
    W(s).expeditions = W(s).expeditions.filter(x => x !== p);
    ctx.gone = true;
    ctx.story.push({ kind: 'lost', hex: p.leg ? p.leg.path[Math.max(0, p.leg.step - 1)] : p.at });
  }
}

// The party fights what lives at the event's hex (or how.as: { foe, entry, step, name }, a hunter it
// stepped in on), with the health it has left. how.units: who fights (those on their feet by default);
// how.defend: the team went for it, so it defends itself whatever it would hunt; how.thrown: the player
// came off its mount; how.forced: the one caught running turned to fight. A win carries home the
// carcass (unless it got away badly hurt) and coins. Returns the battle, for the replay.
function fight(ctx, ev, rand, how = {}) {
  const { s, p, story } = ctx, w = W(s), h = parseKey(ev.hex);
  const threat = threatAt(w.seed, h);
  const as = how.as || { foe: threat.foe, entry: threat.entry, step: threat.step, lair: threat.lair, id: threat.id };
  const foe = as.foe;
  const fought = how.units || standingUnits(s, p);
  const team = teamUnits(s, fought);
  const opts = { swamp: watery(w.seed, h), biome: biomeAt(w.seed, h), hp: fought.map(u => u.members.map(id => healthOf(p, id))), ...(how.defend ? { defend: true } : {}) };
  const result = teamFight(team, foe, rand, opts);
  const frenzyCount = p.members.filter(id => { const b = id !== PLAYER_ID && explorerOf(s, id); return b && SPECIES[b.type].rival; }).length;
  // everyone ran from a predator: it gives chase, and may catch the slowest
  const chased = result.escaped ? chaseOf(team, foe, opts.biome) : null;
  let caught = null;
  if (chased && rand() < chased.chance) caught = fall(ctx, fought[chased.unit].members[chased.member], rand() < chased.death);
  const died = [];
  const downed = [];
  // health carries on: brought down, it may be killed (slain outright, or by its resistance), or is
  // down; a lamed leg or a lost fight means coming home injured whatever its health
  fought.forEach((u, i) => !result.fled.includes(i) && u.members.forEach((id, j) => {
    const left = Math.max(0, result.hp[i][j] / result.teamHps[i][j]);
    if (left <= 0) {
      if (id !== PLAYER_ID) {
        const slain = result.slain.some(([a, b]) => a === i && b === j);
        const res = team[i].members[j].res;
        const lives = Math.min(DEATH.max, Math.max(DEATH.min, res / (res + DEATH.resBase)));
        if (slain || rand() >= lives) { died.push(id); return; }
      }
      fall(ctx, id, false);
      downed.push(id);
      return;
    }
    p.health[id] = Math.round(left * 1000) / 1000;
    const lame = result.lamed.some(([a, b]) => a === i && b === j);
    if ((lame || !result.win) && !p.hurt.includes(id)) p.hurt.push(id);
    // a frill keeps the damage it took until it is mended
    const f = result.frill[i] && result.frill[i][j];
    if (f !== null && f !== undefined) explorerOf(s, id).frill = f;
  }));
  const names = Object.fromEntries(p.members.map(id => [id, (explorerOf(s, id) || {}).name]));
  const battle = {
    creature: as.id || (as.entry.species || as.entry.creature), lair: !!as.lair,
    foe: { name: foe.name, power: as.lair !== undefined ? threat.power : foe.members.reduce((t, m) => t + m.power, 0), hp: result.foeMax, count: foe.members.length, pack: foe.pack },
    team: team.map((t, i) => ({ name: t.name, kind: fought[i].kind, members: fought[i].members, hp: result.teamHps[i], power: t.members.reduce((x, m) => x + m.power, 0),
      start: opts.hp[i], ...(t.members.some(m => m.frill !== undefined) ? { frill: t.members.map(m => m.frill ?? null) } : {}) })),
    ...result, frenzyCount, downed, ...(caught ? { caught } : {}), ...(how.thrown ? { thrown: true } : {}), ...(how.forced ? { forced: how.forced } : {}),
  };
  battle.died = died.map(id => ({ id, name: names[id] }));
  // the spoils of a win
  if (result.win) {
    battle.loot = as.entry && !result.foeFled ? carcass(ctx, as.entry, as.step, rand) : [];
    battle.coins = as.step * WIN_COINS_PER_HEX * (as.lair ? 2 : 1);
    if (result.frenzy.length) for (const drop of FRENZY_DROPS) if (rand() < drop.chance(frenzyCount)) {
      const lo = drop.min(frenzyCount), hi = drop.max(frenzyCount);
      battle.loot.push(carryItem(p, drop.id, lo + Math.floor(rand() * (hi - lo + 1))));
    }
    // equipment that drops is the kind sold in the Shop
    if (rand() < GEAR_DROP(as.step, !!as.lair)) {
      const gear = Object.keys(ITEMS).filter(id => ITEMS[id].kind === 'gear' && ITEMS[id].price);
      battle.loot.push(carryItem(p, gear[Math.floor(rand() * gear.length)], 1));
    }
    p.carry.coins += battle.coins;
  }
  if (ev.idx === (p.leg ? p.leg.path.length - 1 : -1)) ctx.endBattle = battle;
  if (!how.silent) {
    story.push({
      hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), kind: 'fight', battle,
      ...(how.standoff ? { standoff: standoffOf(threat) } : {}), ...(how.scatter ? { scatter: { ...scatterView(how.scatter), choice: 'fight' } } : {}),
    });
  }
  // (the dead are buried once the fight is told)
  for (const id of died) die(ctx, id);
  return battle;
}

// Looking around the journey's end (a team beaten there brings nothing away): what the hex has, more
// with a hauler; fish for a fisher by the water; plants for a forager; maybe an egg; coins for a first
// visit. All of it carried home.
function gather(ctx, leg) {
  const { s, p, story, now } = ctx, w = W(s), key = leg.to, h = parseKey(key);
  const rand = seededRand(`loot:${w.seed}:${leg.n}`);
  const b = ctx.endBattle;
  const beaten = b && !b.win && !b.escaped;
  const found = [];
  let coins = 0, egg = null, discovered = false;
  const roll = ({ min, max }) => min + Math.floor(rand() * (max - min + 1));
  const standing = standingUnits(s, p).flatMap(u => u.members);
  if (!beaten && standing.length) {
    const haul = teamHaul(s, standing);
    for (const l of lootTable(s, key)) if (rand() < l.chance) found.push(carryItem(p, l.id, Math.round(roll(l) * haul)));
    if (watery(w.seed, h)) for (const id of standing) {
      const f = bodyOf(s, id).fishing;
      if (f) found.push(carryItem(p, 'fish', f[0] + Math.floor(rand() * (f[1] - f[0] + 1))));
    }
    for (const id of standing) for (const [item, min, max, chance = 1] of bodyOf(s, id).forage || []) {
      if (rand() < chance) found.push(carryItem(p, item, min + Math.floor(rand() * (max - min + 1))));
    }
    const lair = !!(b && b.win && b.lair);
    const kinds = eggKinds(biomeAt(w.seed, h), EGG_STEP, lair);
    if (kinds.length && rand() < EGG_CHANCE(EGG_STEP, lair) * (hasScout(s, standing) ? SCOUT.egg : 1)) {
      const [lo, hi] = EGG_GENES(EGG_STEP, lair);
      egg = {
        id: `egg-${w.seed}-${leg.n}`, type: pickWeighted(kinds, rand), gen: 1, parents: [], laidAt: now,
        genes: Object.fromEntries(STATS.map(({ id: st }) => [st, lo + Math.floor(rand() * (hi - lo + 1))])),
      };
      p.carry.eggs.push(egg);
    }
    discovered = !w.visited.includes(key);
    if (discovered) { coins = Math.min(hexDist(h), 10) * DISCOVERY_COINS_PER_HEX; w.visited.push(key); p.carry.coins += coins; }
  }
  // even a beaten team saw the land around it
  reveal(s, neighbors(h).map(n => hexKey(...n)));
  ctx.endBattle = null;
  story.push({ kind: 'arrived', hex: key, idx: leg.path.length - 1, biome: biomeAt(w.seed, h), found: found.filter(x => x.n > 0), coins, egg, discovered, beaten: !!beaten });
}

// Home: what was carried is brought in, wounds become injuries (down: critical; a lost fight or a lamed
// leg: injured; under half health: bruised), everyone is hungry but a small hunter (Compsognathus) that
// fed itself on the way, and the party breaks up
function comeHome(ctx) {
  const { s, p, story, now } = ctx, w = W(s);
  const loot = [];
  for (const [item, n] of Object.entries(p.carry.items)) if (n > 0) loot.push({ id: item, n, lost: addItem(s, item, n) });
  if (p.carry.coins) earn(s, p.carry.coins);
  const eggs = p.carry.eggs.map(egg => {
    s.eggs = s.eggs || [];
    if (s.eggs.length < EGG_TRAY_SIZE) { s.eggs.push(egg); return egg; }
    return { ...egg, lost: true };
  });
  const injured = [], fedSelf = [];
  for (const id of p.members) {
    const b = explorerOf(s, id);
    if (!b) continue;
    const left = healthOf(p, id), down = isDown(p, id), me = id === PLAYER_ID;
    const critical = down && !me;
    let mins = critical ? CRITICAL_MINS : down || p.hurt.includes(id) ? INJURY_MINS : left < 0.5 ? Math.round(BRUISE_MINS * (1 - left * 2)) : 0;
    if (mins) {
      // a tough one (Dilophosaurus) heals in half the time, a critical injury aside
      if (!critical && b.type && SPECIES[b.type].tough) mins = Math.max(1, Math.round(mins * TOUGH.heal));
      b.injuredUntil = now + mins * 60000;
      if (critical) b.critical = true; else delete b.critical;
      injured.push({ id, mins, ...(critical ? { critical } : {}) });
    }
    if (me) continue;
    if (SPECIES[b.type].selfFeed && !down) { b.lastFed = now; b.fed = (b.fed || 0) + 1; fedSelf.push(id); }
    else b.lastFed = now - hungerEvery(b);
  }
  w.expeditions = w.expeditions.filter(x => x !== p);
  p.leg = null;
  ctx.gone = true;
  story.push({ kind: 'home', hex: HOME, idx: -1, loot, coins: p.carry.coins, eggs, injured, fedSelf, died: p.dead, team: p.team, members: p.members });
}

// ---------- the decision waiting, for the screens ----------
// { kind, hex, idx, biome, ... }: 'scatter' (the player's group scattered from a predator: fight or
// flee) { name, count, prey, mounted, alone, run, units }; 'standoff' (a group stood its ground: fight
// or leave) { ...standoffOf, foe }; 'sighting' (spotted at a distance: hunt or let be) { name, species,
// count, hunter, chance }; 'witness' (a hunt watched: step in or not) { hunter, prey, outcome, options,
// hunterFoe, preyFoe }; 'go-on' (after an event on the way out: go on to the destination, or turn back)
// { to, standing, down: the ids of those down }. foe and units are fighters, for the odds.
export function pendingView(s, p) {
  const ev = p.pending;
  if (!ev || !p.leg) return null;
  const w = W(s), h = parseKey(ev.hex), units = standingUnits(s, p), team = teamUnits(s, units);
  const threat = threatAt(w.seed, h);
  const base = { kind: ev.kind, hex: ev.hex, idx: ev.idx, biome: biomeAt(w.seed, h), swamp: watery(w.seed, h), units: team, hp: units.map(u => u.members.map(id => healthOf(p, id))) };
  if (ev.kind === 'scatter') {
    const sc = scatterOf(s, units, threat);
    return { ...base, ...(sc ? scatterView(sc) : { name: threat.foe.name }), count: threat.foe.members.length, foe: threat.foe, run: sc && runOf(s, units, threat, sc, base.biome) };
  }
  if (ev.kind === 'standoff') return { ...base, ...standoffOf(threat), foe: threat.foe };
  if (ev.kind === 'sighting') {
    const odds = huntOdds(team, threat.foe.members[0]);
    return { ...base, name: threat.foe.name, species: threat.entry.species, count: threat.foe.members.length, hunter: odds && odds.hunter, chance: odds ? odds.chance : 0 };
  }
  if (ev.kind === 'witness') {
    const wt = witnessOf(s, p, ev.idx);
    return { ...base, ...wt, options: wt ? interveneOptions(s, { team: units }, wt) : [] };
  }
  return { ...base, to: p.leg.to, standing: units.length > 0, down: [...p.down] };
}

// Plays a party's whole leg with a fixed answer to every decision (for tests and quick play): fight
// what stands its ground, flee nothing, hunt nothing, step into nothing, and go on (back: turn back
// at the first chance). Returns every step's result.
export function journeyAll(s, id, now, answers = {}) {
  const steps = [];
  for (let i = 0; i < 200; i++) {
    const r = journeyStep(s, id, answers, now);
    steps.push(r);
    if (!r.ok || !r.pending) break;
  }
  return steps;
}


// ---------- loaded saves ----------
const PENDING = ['scatter', 'standoff', 'sighting', 'witness', 'go-on'];
// keeps the parties of a loaded world inside the rules whatever produced them: real explorers each out
// once, legs along the real way and never quicker than it takes, carried things that exist. A trip
// from before journeys becomes a leg from the nest to its hex.
export function cleanParties(s, w) {
  const ids = new Set([PLAYER_ID, ...s.hatched.map(b => b.id)]), seen = new Set();
  const land = k => { const h = parseKey(k); return !!h && inWorld(h) && (k === HOME || !isWater(w.seed, h)); };
  const num = (x, lo = 0) => Math.max(lo, Number(x) || 0);
  const int = (x, lo = 0) => Math.floor(num(x, lo));
  const UNITS = ['dino', 'player', 'pack'];
  const [, geneMax] = EGG_GENES(EGG_STEP, true);
  const out = [];
  for (const e of Array.isArray(w.expeditions) ? w.expeditions : []) {
    if (!e || typeof e !== 'object' || out.length >= EXPEDITION_SLOTS) continue;
    const team = (Array.isArray(e.team) ? e.team : e.babyId ? [{ kind: e.babyId === PLAYER_ID ? 'player' : 'dino', id: e.babyId, members: [e.babyId] }] : [])
      .filter(u => u && UNITS.includes(u.kind))
      .map(u => ({ kind: u.kind, id: String(u.id), members: (Array.isArray(u.members) ? u.members : [u.id]).filter(id => ids.has(id) && !seen.has(id) && seen.add(id)) }))
      .filter(u => u.members.length)
      .slice(0, TEAM_SLOTS);
    if (!team.length) continue;
    const members = team.flatMap(u => u.members);
    const old = !('at' in e);
    const at = old ? HOME : String(e.at);
    const L = old ? { n: e.trip, from: HOME, to: e.hex, startedAt: e.startedAt } : e.leg;
    let leg = null;
    if (L && typeof L === 'object') {
      const from = String(L.from), to = String(L.to);
      if (!land(from) || !land(to) || from === to || from !== at) continue;
      const path = travelPath(w.seed, parseKey(to), parseKey(from)).map(h => hexKey(...h));
      if (!path.length) continue;
      const startedAt = num(L.startedAt), recalled = L.recalled === true;
      leg = {
        n: int(L.n, 1), from, to, path, step: Math.min(path.length, int(L.step)), startedAt,
        arriveAt: recalled ? Math.max(num(L.arriveAt), startedAt) : Math.max(num(L.arriveAt), startedAt + legMins(s, members, from, to) * 60000),
        ...(recalled ? { recalled } : {}),
      };
    }
    // a party with nowhere to go is one at home: it broke up
    if (!land(at) || (!leg && at === HOME)) continue;
    const pe = leg && e.pending && typeof e.pending === 'object' ? e.pending : null;
    const pidx = pe ? Math.floor(Number(pe.idx)) : -1;
    const pending = pe && PENDING.includes(pe.kind) && pidx >= 0 && pidx < leg.step ? { kind: pe.kind, idx: pidx, hex: leg.path[pidx] } : null;
    const health = {};
    for (const id of members) if (e.health && e.health[id] != null) health[id] = Math.max(0, Math.min(1, Number(e.health[id]) || 0));
    const inParty = list => [...new Set((Array.isArray(list) ? list : []).filter(id => members.includes(id)))];
    const c = e.carry && typeof e.carry === 'object' ? e.carry : {};
    const items = {};
    for (const [id, n] of Object.entries(c.items && typeof c.items === 'object' ? c.items : {})) if (ITEMS[id] && int(n) > 0) items[id] = int(n);
    const eggs = (Array.isArray(c.eggs) ? c.eggs : []).filter(g => g && SPECIES[g.type]).slice(0, 3).map(g => ({
      id: String(g.id), type: g.type, gen: 1, parents: [], laidAt: num(g.laidAt),
      genes: Object.fromEntries(STATS.map(({ id }) => [id, Math.min(geneMax, int(g.genes && g.genes[id]))])),
    }));
    out.push({
      id: String(e.id), team, members, at, leg, health, down: inParty(e.down), hurt: inParty(e.hurt),
      dead: (Array.isArray(e.dead) ? e.dead : []).filter(d => d && typeof d === 'object').slice(0, 12).map(d => ({ id: String(d.id), name: String(d.name || '').slice(0, 24), type: SPECIES[d.type] ? d.type : null })),
      carry: { items, coins: int(c.coins), eggs }, pending,
      hex: leg ? leg.to : at, trip: leg ? leg.n : int(e.trip, 1), startedAt: leg ? leg.startedAt : num(e.startedAt), returnAt: leg ? leg.arriveAt : num(e.returnAt),
    });
  }
  return out;
}
