// For tests: a party's journey out to its hex, told with fixed answers, and straight home from there
// (no dangers on the way back), summed up the way a trip used to come back: what it met where it went,
// and what it brought home.
import { applyAction } from '../js/economy.js';
import { partyOf, HOME } from '../js/journey.js';
import { SURVIVAL, EXPEDITION } from '../js/config.js';

// The journeys in these tests are about what a team meets: nobody grows hungry or thirsty on the way
// (the tests of hunger and thirst set it themselves)
export const REAL_SURVIVAL = { thirst: SURVIVAL.thirst, hunger: SURVIVAL.hunger };
SURVIVAL.thirst = 0;
SURVIVAL.hunger = 0;
// and they are about what each dinosaur does on its own: they may send one out without the player
// (the test of that rule sets it itself)
EXPEDITION.needsPlayer = false;

// choice: { fight, flee, hunt, witness } answers every decision; the party always goes on
export function collect(s, { id, ...choice }, now) {
  const p = partyOf(s, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  const story = [];
  let r;
  for (let i = 0; i < 100; i++) {
    r = applyAction(s, 'journey', { id, ...choice }, now);
    if (!r.ok) return r;
    story.push(...r.story);
    if (!r.pending) break;
  }
  const arrived = story.find(e => e.kind === 'arrived');
  if (partyOf(s, id)) {
    // straight home, nothing on the way (or landing, flown home)
    if (p.leg && p.leg.air) story.push(...applyAction(s, 'journey', { id }, p.leg.arriveAt).story);
    else {
      p.leg = { n: 0, from: p.at, to: HOME, path: [HOME], step: 0, startedAt: now, arriveAt: now, recalled: true };
      story.push(...applyAction(s, 'journey', { id }, now).story);
    }
  }
  return summary(story, arrived, p);
}

export function summary(story, arrived, p) {
  const home = story.find(e => e.kind === 'home') || {};
  const fights = story.filter(e => e.kind === 'fight' || (e.kind === 'witness' && e.battle));
  const last = fights[fights.length - 1];
  const at = e => e && e.idx < (arrived ? arrived.idx : Infinity);
  const ev = story.find(e => ['fight', 'chase', 'standoff', 'sighting', 'backedOff', 'witness'].includes(e.kind));
  const chase = story.find(e => e.kind === 'chase');
  const fightAt = story.find(e => e.kind === 'fight');
  const standoff = story.find(e => e.kind === 'standoff') || (fightAt && fightAt.standoff && { kind: 'standoff', ...fightAt.standoff, fought: true });
  const sc = (fightAt && fightAt.scatter) || (chase && chase.scatter && { ...chase.scatter, choice: 'flee' });
  return {
    ok: true, hex: arrived ? arrived.hex : null, biome: arrived ? arrived.biome : null, story,
    team: home.team || p.team, members: home.members || p.members,
    loot: home.loot || [], coins: home.coins || 0, egg: (home.eggs || [])[0] || null, injured: home.injured || [], fedSelf: home.fedSelf || [],
    died: [...(home.died || []), ...(story.some(e => e.kind === 'lost') ? p.dead : [])],
    discovered: !!(arrived && arrived.discovered), found: arrived ? arrived.found : [],
    battle: last ? last.battle : null,
    standoff: standoff ? { ...standoff, fought: !!standoff.fought } : null,
    chase: chase ? { name: chase.name, count: chase.count, caught: chase.caught ? chase.caught.id : null, died: !!(chase.caught && chase.caught.died), ...(chase.scattered ? { scattered: true } : {}) } : null,
    scatter: sc || null,
    sighting: story.find(e => e.kind === 'sighting') || null,
    witness: story.find(e => e.kind === 'witness') || null,
    backedOff: story.find(e => e.kind === 'backedOff') || null,
    intercepted: at(ev) ? { name: ev.name || (ev.battle && ev.battle.foe.name) || (ev.hunter && ev.hunter.name), hex: ev.hex, biome: ev.biome } : null,
  };
}

// plays a party's leg (always going on, answering nothing else) until a decision that wants is waiting
// (wants(pending)), and returns that decision, or null when none came
export function reach(s, id, now, wants) {
  for (let i = 0; i < 100; i++) {
    const r = applyAction(s, 'journey', { id }, now);
    if (!r.ok || !r.pending) return null;
    // (left waiting: the next call, collect, answers it)
    if (wants(r.pending)) return r.pending;
  }
  return null;
}
