// World tab: the hex map around the nest under its fog, and the expeditions that explore it.
// Pick a hex, put a team together, send it; when it comes back, collect what it found.
import { SCOUT, FRENZY_DAMAGE, FRENZY_DROPS, BIOMES, ITEMS, SEX, SPECIES, EXPEDITION_SLOTS, TEAM_SLOTS, JUVENILE_RANGE, STAGES, DISCOVERY_COINS_PER_HEX, HEAL_MINS, PLAYER_ID, PLAYER_SLOTS, EYES } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, isHungry, countItem, isArms, statSheet, carriedWeight, carryCapacity, itemWeight } from '../economy.js';
import {
  ALL_HEXES, hexKey, parseKey, hexDist, biomeAt, isRevealed, canReach, teamTripMins, teamSlow, teamHaul, allRunners, hasScout, lootTable, exploreProblem, expeditionOf,
  threatAt, isLair, injuredLeft, isCritical, explorerOf, memberProblem, teamFrom, teamUnits, keepsAway, sailBackOff, chaseOf, huntOdds, tripStandoff, encounterChance,
} from '../world.js';
import { packOf } from '../packs.js';
import { teamOdds, dangerOf, whoFlees } from '../combat.js';
import { playFight } from './fight.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { ITEM_ICONS, playerArt } from '../art.js';
import { modsHTML, loadHTML } from './stats.js';
import { esc, fmt, plural } from '../util.js';
import { currentTab, onTabChange } from './tabs.js';

const SIZE = 30;                 // hex radius in map units
const SQ3 = Math.sqrt(3);
const center = ([q, r]) => [SIZE * SQ3 * (q + r / 2), SIZE * 1.5 * r];
const corners = ([x, y], k = 1) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 180 * (60 * i - 30);
  return `${(x + SIZE * k * Math.cos(a)).toFixed(1)},${(y + SIZE * k * Math.sin(a)).toFixed(1)}`;
}).join(' ');

// a small drawing for each biome, centred on 0,0
const GLYPH = {
  meadow: '<path d="M-9 6 l3 -9 l2 9 M-2 6 l3 -11 l2 11 M5 6 l3 -8 l2 8" fill="#7f9c55"/>',
  forest: '<path d="M-8 8 L-3 -6 L2 8Z M0 8 L6 -10 L12 8Z" fill="#2f5a2c" transform="translate(-2 0)"/>',
  swamp: '<path d="M-11 0 q3 -3 6 0 t6 0 t6 0 t6 0 M-9 6 q3 -3 6 0 t6 0 t6 0" stroke="#3f5d4d" stroke-width="2" fill="none"/>',
  badlands: '<path d="M-12 8 L-8 -3 L-2 -3 L1 2 L5 -6 L10 -6 L13 8Z" fill="#a9824e"/>',
  volcano: '<path d="M-12 9 L-4 -6 L4 -6 L12 9Z" fill="#5a3a30"/><path d="M-4 -6 L-2 -10 L1 -8 L4 -11 L4 -6Z" fill="#e2643a"/>',
};
const NEST = '<ellipse cx="0" cy="4" rx="13" ry="5" fill="#9c7240"/><ellipse cx="0" cy="1" rx="9" ry="3" fill="#c49a5c"/><ellipse cx="-3" cy="-2" rx="3" ry="4" fill="#f3ead2"/><ellipse cx="3" cy="-2" rx="3" ry="4" fill="#eadcbf"/>';

// a sample map for the landing page: every hex up to `seen` steps revealed, one more ring of fog
export function sampleMapSVG(seed, seen = 3) {
  const cells = ALL_HEXES.filter(h => hexDist(h) <= seen + 1).map(h => {
    const c = center(h), d = hexDist(h), biome = biomeAt(seed, h);
    const fog = d > seen;
    return `<g class="hex ${fog ? 'fog' : 'seen'}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})">
      <polygon points="${corners([0, 0], 0.96)}" ${fog ? '' : `style="fill:${BIOMES[biome].color}"`}/>${d === 0 ? NEST : fog ? '<text class="q" y="5">?</text>' : GLYPH[biome]}</g>`;
  }).join('');
  const r = SIZE * SQ3 * (seen + 1.6);
  return `<svg class="world-map" viewBox="${-r} ${-r * 0.92} ${r * 2} ${r * 1.84}" aria-hidden="true">${cells}</svg>`;
}

const PROBLEMS = {
  'too-young': 'Babies stay in the nest. Feed it until it is a juvenile.',
  'too-far': `Juveniles only explore up to ${JUVENILE_RANGE} hexes from the nest. Adults go anywhere.`,
  away: 'Already exploring.',
  breeding: 'Busy nesting with its partner.',
  hungry: 'Too hungry to travel. Feed it in the Nest first.',
  'no-slot': `Only ${EXPEDITION_SLOTS} teams can be out at the same time.`,
  unreachable: 'Too deep in the fog. Explore the hexes next to it first.',
  home: 'This is your nest.',
  injured: 'Injured. It heals with time, or sooner with a Healing Herb.',
  'no-team': 'Add someone to the team first.',
  'team-full': `A team has at most ${TEAM_SLOTS} places.`,
  twice: 'Someone is in the team twice.',
  missing: 'Someone in the team is gone.',
};
const LAIR = '<g class="lair" transform="translate(-13 -15)"><circle r="7" fill="#3b2a24"/><path d="M-3.5 -2 l1.6 4 M0 -3 l0 5 M3.5 -2 l-1.6 4" stroke="#f3ead2" stroke-width="1.6" stroke-linecap="round"/></g>';

let selected = null, message = '', tick = null;
// the team being put together: [{ kind: 'dino' | 'player' | 'pack', id }]
let team = [];
const isMe = b => b && b.id === PLAYER_ID;
const name = b => isMe(b) ? b.name : `${b.name} ${SEX[sexOf(b)].sym}`;
const byId = id => explorerOf(S, id);
const itemName = (id, n) => n === 1 ? ITEMS[id].name : ITEMS[id].plural;
const unitKey = u => `${u.kind}:${u.id}`;
const packById = id => (S.packs || []).find(p => p.id === id);
// a team unit's name, as on its row
function unitName(u) {
  if (u.kind === 'player') return 'You';
  if (u.kind === 'pack') { const p = packById(u.id); return p ? p.name : 'A pack'; }
  const b = byId(u.id);
  return b ? name(b) : '?';
}
const membersOf = u => u.kind === 'pack' ? (packById(u.id) || { members: [] }).members : [u.kind === 'player' ? PLAYER_ID : u.id];
// "A", "A and B", "A, B and C"
const listNames = list => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;

// everyone who could join a team: you, each pack, each dinosaur old enough and not in a pack
function unitChoices() {
  return [
    { kind: 'player', id: PLAYER_ID },
    ...(S.packs || []).map(p => ({ kind: 'pack', id: p.id })),
    ...S.hatched.filter(b => stageOf(b).id !== 'baby' && !packOf(S, b.id)).map(b => ({ kind: 'dino', id: b.id })),
  ];
}
function unitLabel(u) {
  if (u.kind === 'player') return `${S.player.name} · you, on foot`;
  if (u.kind === 'pack') { const p = packById(u.id); return `${p.name} · pack of ${p.members.length} ${SPECIES[p.type].species}`; }
  const b = byId(u.id);
  return `${name(b)} · ${SPECIES[b.type].species} · ${stageOf(b).name}`;
}
// the first thing keeping one of a unit's members home, with who it is
function unitProblem(u, t) {
  for (const id of membersOf(u)) {
    const problem = memberProblem(S, id, selected, t);
    if (problem) return { id, problem, label: problem === 'injured' && isCritical(byId(id), t) ? 'critical' : problem };
  }
  return null;
}
const SHORT = { away: 'away', injured: 'injured', critical: 'critically injured', hungry: 'hungry', breeding: 'nesting', 'too-far': 'too far for a juvenile', 'too-young': 'too young' };

function mapSVG(t) {
  const w = S.world;
  const away = new Map(w.expeditions.map(e => [e.hex, e]));
  // frame what has been found plus a ring of fog around it, never tighter than 3 hexes from the
  // nest, so the map starts big and opens up as it is explored
  const shown = ALL_HEXES.filter(h => hexDist(h) <= 3 || canReach(S, hexKey(...h)) || isRevealed(S, hexKey(...h))).map(center);
  const pad = SIZE * 2.2;
  const xs = shown.map(c => c[0]), ys = shown.map(c => c[1]);
  const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
  const cells = ALL_HEXES.map(h => {
    const key = hexKey(...h), c = center(h);
    const seen = isRevealed(S, key), frontier = !seen && canReach(S, key);
    const biome = seen ? biomeAt(w.seed, h) : null;
    const home = hexDist(h) === 0;
    const cls = ['hex', seen ? 'seen' : 'fog', frontier ? 'frontier' : '', key === selected ? 'sel' : ''].filter(Boolean).join(' ');
    const label = home ? 'Your nest' : seen ? `${BIOMES[biome].name}${isLair(w.seed, h) ? ' lair' : ''}, ${hexDist(h)} from the nest` : frontier ? `Unexplored, ${hexDist(h)} from the nest` : 'Deep fog';
    const glyph = home ? NEST : seen ? GLYPH[biome] + (isLair(w.seed, h) ? LAIR : '') : frontier ? '<text class="q" y="5">?</text>' : '';
    const exp = away.get(key);
    const marker = exp ? `<g class="trip ${t >= exp.returnAt ? 'back' : ''}"><circle r="8" cx="12" cy="-12"/><text x="12" y="-8.5">${esc(exp.team.length > 1 ? String(exp.team.length) : (unitName(exp.team[0])[0] || '?'))}</text></g>` : '';
    const focusable = seen || frontier;
    return `<g class="${cls}" data-key="${key}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})" ${focusable ? `tabindex="0" role="button" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
      <polygon points="${corners([0, 0], 0.96)}" ${seen ? `style="fill:${BIOMES[biome].color}"` : ''}/>${glyph}${marker}</g>`;
  }).join('');
  return `<svg class="world-map" viewBox="${box.map(v => v.toFixed(1)).join(' ')}" role="group" aria-label="World map">${cells}</svg>`;
}

// what waits there and how a fight would likely go for the chosen explorer
function threatHTML(h, units, scout) {
  if (!isRevealed(S, hexKey(...h))) return '<p class="hint">Unknown dangers.</p>';
  const th = threatAt(S.world.seed, h);
  const swamp = biomeAt(S.world.seed, h) === 'swamp';
  // it keeps away from a team with anything bigger than it stands up to: no fight, but it may be hunted
  if (units.length && keepsAway(th, units)) {
    const hunt = huntOdds(units, th.foe.members[0]);
    return `<div class="threat ${th.lair ? 'is-lair' : ''}">
    <p><strong>${th.lair ? 'Lair: ' : ''}${esc(th.foe.name)}</strong> <span class="hint">Power ${th.power}</span></p>
    <p class="hint">It keeps away from a team like yours: there will be no fight.</p>
    <p class="hint">${hunt ? `${Math.round(encounterChance(th, units, biomeAt(S.world.seed, h), scout) * 100)}% chance to spot it at a distance; ${esc(hunt.hunter)} would catch one about ${Math.round(hunt.chance * 100)}% of the time.` : 'Nobody in this team could hunt it.'}</p>
  </div>`;
  }
  // who would run from it before the fight, and how the rest would do
  const run = units.length ? whoFlees(units, th.foe) : { fled: [], escaped: false };
  const fight = units.length && !run.escaped ? teamOdds(units, th.foe, 120, { swamp, biome: biomeAt(S.world.seed, h) }) : null;
  const odds = fight ? fight.win : null;
  const power = units.reduce((t, u, i) => run.fled.includes(i) ? t : t + u.members.reduce((x, m) => x + m.power, 0), 0);
  const who = units.length === 1 && !units[0].pack ? esc(units[0].name) : run.fled.length ? 'Who stays' : 'Your team';
  const danger = odds == null ? '' : dangerOf(odds);
  const runners = run.fled.map(i => units[i].name);
  // everyone would run: a predator gives chase and may catch the slowest, who may not survive
  const chased = units.length && run.escaped ? chaseOf(units, th.foe) : null;
  // a rival as big as a Spinosaurus in the team may back off from its sail
  const sail = units.length ? sailBackOff(th, units, biomeAt(S.world.seed, h)) : 0;
  // watchful ones (Hypsilophodon) may see a predator first and the team scatters
  const eyes = Math.min(EYES.max, EYES.perOne * units.reduce((t, u) => t + u.members.filter(m => m.type && SPECIES[m.type].eyes).length, 0));
  return `<div class="threat ${th.lair ? 'is-lair' : ''}">
    <p><strong>${th.lair ? 'Lair: ' : ''}${esc(th.foe.name)}</strong> <span class="hint">Power ${th.power}</span></p>
    ${run.escaped && units.length ? `<p class="hint warn-text">Nobody in this team would fight it: they'd run off and bring nothing of it home.</p>${chased ? `<p class="hint warn-text">It would give chase and may catch ${esc(chased.fighter.name)} (about ${Math.round(chased.chance * 100)}%), who may not survive: risk of death ~${Math.round(chased.chance * chased.death * 100)}%.</p>` : ''}`
      : runners.length ? `<p class="hint warn-text">${esc(listNames(runners))} would run from it before the fight.</p>` : ''}
    <p class="hint">${th.lair ? 'Always met here. Beating it pays double and often drops equipment.' : `${Math.round(encounterChance(th, units, biomeAt(S.world.seed, h), scout) * 100)}% chance to meet it.${scout ? ' Your scout leads the team around it when it can.' : ''}${(th.foe.members[0].role || 'attacker') === 'attacker' ? ' The bigger the team, the sooner it is noticed.' : ''}`}</p>
    ${(th.foe.members[0].role || 'attacker') !== 'attacker' ? '<p class="hint">It won\'t attack: it stands its ground to drive you off. You choose whether to fight it when the team is back.</p>' : ''}
    ${odds == null ? '' : `<p><span class="danger danger-${danger.toLowerCase()}">${danger}</span> <span class="hint">${who} wins about ${Math.round(odds * 100)}% of the time (Power ${power})</span></p>`}
    ${sail ? `<p class="hint">It may size up your Spinosaurus's sail and back off: about ${Math.round(sail * 100)}% of the time.</p>` : ''}
    ${fight ? riskHTML(units, fight.death) : ''}
    ${eyes && (th.foe.members[0].role || 'attacker') === 'attacker' ? `<p class="hint">Your Hypsilophodon may see it first (about ${Math.round(eyes * 100)}%): the team scatters and nobody is caught.</p>` : ''}
    ${units.some(u => u.members.some(m => m.type && SPECIES[m.type].runner)) && (th.foe.members[0].role || 'attacker') === 'attacker' ? '<p class="hint warn-text">If your Gallimimus see it first the team runs, but it may catch the slowest one, and the one caught may not survive.</p>' : ''}
  </div>`;
}

// the risk of death in a fight, for those who could die (1% or more); a pack shows its likeliest one
function riskHTML(units, death) {
  const at = units.map((u, i) => ({ name: u.name, p: Math.max(...death[i]) })).filter(x => x.p >= 0.01);
  if (!at.length) return '<p class="hint">Nobody is likely to die if it comes to a fight.</p>';
  return `<p class="hint warn-text">Risk of death if it comes to a fight: ${at.map(x => `${esc(x.name)} ~${Math.round(x.p * 100)}%`).join(', ')}.</p>`;
}

const healHTML = (b, t) => {
  if (isCritical(b, t)) {
    const kits = countItem(S, 'transfusion');
    return `<div class="row"><button class="ghost" type="button" id="transfuseBtn" ${kits ? '' : 'disabled'}>Give a Blood Transfusion (${kits})</button>
      <span class="hint">${kits ? 'Heals it on the spot' : 'Herbs can\'t help a critical injury. Forge a transfusion from Allosaurus blood'}</span></div>`;
  }
  const herbs = countItem(S, 'herb');
  return `<div class="row"><button class="ghost" type="button" id="healBtn" ${herbs ? '' : 'disabled'}>Use a Healing Herb (${herbs})</button>
    <span class="hint">${herbs ? `−${HEAL_MINS} min each` : 'Find them in meadows and forests, or buy them in the Shop'}</span></div>`;
};

function lootHTML(key) {
  if (!isRevealed(S, key)) return '<p class="hint">Unexplored. Send a dinosaur to find out what is there.</p>';
  return `<ul class="loot">${lootTable(S, key).map(l => `<li><span class="mini">${ITEM_ICONS[l.id]}</span>${l.min === l.max ? l.min : l.min + '–' + l.max} ${esc(itemName(l.id, l.max))}${l.chance < 1 ? ` <span class="hint">(${Math.round(l.chance * 100)}% chance)</span>` : ''}</li>`).join('')}</ul>`;
}

// species that may turn on each other (BODY rival) warn when there is more than one
function rivalsHTML(members) {
  const types = members.map(id => id !== PLAYER_ID && byId(id)).filter(Boolean).map(b => b.type);
  return [...new Set(types)].filter(t => SPECIES[t].rival && types.filter(x => x === t).length > 1).map(t => {
    const n = types.filter(x => x === t).length;
    return `<p class="hint warn-text">${n} ${esc(SPECIES[t].species)} in one team: every one for itself. In a fight they may turn on each other and go into a frenzy: ${Math.round((FRENZY_DAMAGE - 1) * 100)}% more damage, but they bite the foe and each other alike, and the last one standing bites anyone in the team. Win after a frenzy and it may drop ${FRENZY_DROPS.map(d => ITEMS[d.id].plural).join(' and ')}, likelier and more of them the more ${esc(SPECIES[t].species)} there are (now: ${FRENZY_DROPS.map(d => `${ITEMS[d.id].name} ${Math.round(d.chance(n) * 100)}%`).join(', ')}).</p>`;
  }).join('');
}

function sideHTML(t) {
  if (!selected) return `<h3>Pick a hex</h3>
    <p class="hint">Tap a hex next to the fog (marked ?) to explore it. Put together a team of up to ${TEAM_SLOTS}: yourself, juvenile or adult dinosaurs, and packs. Farther hexes take longer and bring back more, sometimes an egg. Dinosaurs come home hungry.</p>`;
  const h = parseKey(selected), d = hexDist(h);
  if (d === 0) return `<h3>Your nest</h3><p class="hint">Where your dinosaurs live. Every trip starts and ends here.</p>`;
  const seen = isRevealed(S, selected);
  const biome = seen ? BIOMES[biomeAt(S.world.seed, h)] : null;
  const first = !S.world.visited.includes(selected);
  // the team: kept between hexes; when empty, the first one free to go is suggested
  const choices = unitChoices();
  team = team.filter(u => choices.some(c => unitKey(c) === unitKey(u)));
  if (!team.length) {
    const free = choices.find(u => !unitProblem(u, t));
    if (free) team = [free];
  }
  const problem = exploreProblem(S, team, selected, t);
  const scout = hasScout(S, team.flatMap(membersOf));
  const blocker = team.map(u => unitProblem(u, t)).find(Boolean);
  const units = teamUnits(S, (teamFrom(S, team) || []).filter(Boolean));
  const left = choices.filter(c => !team.some(u => unitKey(u) === unitKey(c)));
  const rows = team.map((u, i) => {
    const p = unitProblem(u, t);
    return `<li class="team-unit"><span><strong>${esc(unitName(u))}</strong> <span class="hint">${esc(unitLabel(u).split(' · ').slice(1).join(' · '))}</span>${p ? ` <span class="hint warn-text">· ${esc(SHORT[p.label] || p.problem)}</span>` : ''}</span>
      <button class="ghost" type="button" data-unit-off="${i}" aria-label="Take ${esc(unitName(u))} out of the team">×</button></li>`;
  }).join('');
  const critical = problem === 'injured' && blocker && isCritical(byId(blocker.id), t);
  const why = problem && PROBLEMS[problem]
    ? (blocker && blocker.problem === problem && team.flatMap(membersOf).length > 1 ? `${esc(blocker.id === PLAYER_ID ? 'You' : byId(blocker.id).name)}: ` : '')
      + (critical ? 'Critically injured: it went down in a fight. Herbs won\'t help; a Blood Transfusion heals it at once.' : PROBLEMS[problem])
      + (problem === 'injured' && blocker ? ` Heals in ${fmt(injuredLeft(byId(blocker.id), t))}.` : '')
    : '';
  return `<h3>${seen ? esc(biome.name) : 'Unexplored hex'}</h3>
    <p class="hint">${plural(d, 'hex', 'hexes')} from the nest · trip ${teamTripMins(S, team.flatMap(membersOf), selected)} min there and back${scout ? ' (a scout leads the way)' : ''}${teamSlow(S, team.flatMap(membersOf)) > 1 ? ` (a giant sets a slow pace, but brings home ×${teamHaul(S, team.flatMap(membersOf))} of what it finds)` : ''}${allRunners(S, team.flatMap(membersOf)) ? ' (Gallimimus alone: twice as fast)' : ''}${first ? ` · first visit pays ${d * DISCOVERY_COINS_PER_HEX} coins` : ''}</p>
    ${lootHTML(selected)}
    ${threatHTML(h, units, scout)}
    <div class="field"><span class="label">Team <span class="hint">${team.length} / ${TEAM_SLOTS} places · a pack takes one</span></span>
      ${rows ? `<ul class="team-list">${rows}</ul>` : '<p class="hint">No one yet.</p>'}
      ${team.length < TEAM_SLOTS && left.length ? `<div class="row team-add"><select id="addUnit" aria-label="Add to the team">${left.map(u => {
        const p = unitProblem(u, t);
        return `<option value="${esc(unitKey(u))}">${esc(unitLabel(u))}${p ? ` · ${esc(SHORT[p.label] || p.problem)}` : ''}</option>`;
      }).join('')}</select><button class="ghost" type="button" id="addUnitBtn">Add</button></div>` : ''}
    </div>
    ${rivalsHTML(team.flatMap(membersOf))}
    ${S.hatched.some(b => stageOf(b).id !== 'baby') || team.length ? `<div class="row"><button class="btn" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Explore</button></div>` : ''}
    ${why ? `<p class="hint warn-text">${why}</p>` : ''}
    ${problem === 'injured' && blocker ? healHTML(byId(blocker.id), t) : ''}
    ${!S.hatched.some(b => stageOf(b).id !== 'baby') ? `<p class="hint">Your dinosaurs can join once they are juveniles, after ${STAGES[1].meals} meals.</p>` : ''}`;
}

// groups a team spotted at a distance: hunt one of them, or let them be
function sightingsHTML() {
  const list = S.world.sightings || [];
  if (!list.length) return '';
  return `<ul class="sightings">${list.map(x => `<li class="sighting">
    <p>Your team spotted ${/^[AEIOU]/.test(x.name) ? 'an' : 'a'} <strong>${esc(x.name)}</strong> at a distance${isRevealed(S, x.hex) ? `, in the ${esc(BIOMES[biomeAt(S.world.seed, parseKey(x.hex))].name)}` : ''}. Hunt one of them?</p>
    <div class="row"><button class="btn small" type="button" data-hunt="${esc(x.id)}">Hunt <span class="hint">(${esc(x.hunter)}, ${Math.round(x.chance * 100)}%)</span></button>
      <button class="ghost" type="button" data-let="${esc(x.id)}">Let them be</button></div>
  </li>`).join('')}</ul>`;
}

// a wild defender or noncombatant that stood its ground on the way: fight it, or leave it be (the
// odds are worked out once per trip)
const standoffOdds = new Map();
// "On the way, a Protoceratops herd spots you and 2 stay their ground to drive you off.": happening
// now, on the trip, while the choice is open; told in the past in the trip report
const standText = (st, past = false) => {
  const what = `${st.lair ? 'Alpha ' : ''}${st.species}${st.group ? ' ' + st.group : ''}`;
  const ground = past ? (st.count > 1 ? `${st.count} stood their ground` : 'stood its ground') : (st.count > 1 ? `${st.count} stay their ground` : 'stays its ground');
  return `On the way, ${/^[AEIOU]/.test(what) ? 'an' : 'a'} <strong>${esc(what)}</strong> ${past ? 'spotted' : 'spots'} you and ${ground} to drive you off.`;
};
function standoffHTML(e) {
  const st = tripStandoff(S, e.id);
  if (!st) return '';
  if (!standoffOdds.has(e.id)) {
    const units = teamUnits(S, e.team.map(u => ({ ...u, members: u.members.filter(id => explorerOf(S, id)) })).filter(u => u.members.length));
    const swamp = biomeAt(S.world.seed, parseKey(e.hex)) === 'swamp';
    standoffOdds.set(e.id, { ...teamOdds(units, st.foe, 120, { swamp, biome: biomeAt(S.world.seed, parseKey(e.hex)) }), units });
  }
  const { win: odds, death, units } = standoffOdds.get(e.id);
  return `<p class="hint">${standText(st)}</p>
    <button class="btn small" type="button" data-collect="${esc(e.id)}" data-fight="1">Fight ${st.count > 1 ? 'them' : 'it'} <span class="hint">(${dangerOf(odds)}, ${Math.round(odds * 100)}%)</span></button>
    <button class="ghost" type="button" data-collect="${esc(e.id)}">Leave ${st.count > 1 ? 'them' : 'it'} be</button>
    ${riskHTML(units, death)}`;
}

function tripsHTML(t) {
  const list = S.world.expeditions;
  if (!list.length) return `<p class="hint">No one is exploring. ${EXPEDITION_SLOTS} teams can be out at the same time.</p>`;
  return `<ul class="trips">${list.map(e => {
    const back = t >= e.returnAt;
    const biome = isRevealed(S, e.hex) ? BIOMES[biomeAt(S.world.seed, parseKey(e.hex))].name : 'the fog';
    const frac = Math.min(1, (t - e.startedAt) / (e.returnAt - e.startedAt));
    return `<li class="trip-row">
      <div><strong>${esc(listNames(e.team.map(unitName)))}</strong> <span class="hint">→ ${esc(biome)}</span></div>
      <div class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <div class="row">${back ? (standoffHTML(e) ||
        `<button class="btn small" type="button" data-collect="${esc(e.id)}">Back! Collect</button>`)
        : `<span class="hint">Back in ${fmt(e.returnAt - t)}</span><button class="ghost" type="button" data-recall="${esc(e.id)}">Call back</button>`}</div>
    </li>`;
  }).join('')}</ul>`;
}

// the player's own explorer: stats and the weapons and armor it wears
function youHTML(t) {
  const p = S.player, sheet = statSheet(p), d = sheet.derived;
  const away = expeditionOf(S, PLAYER_ID), hurt = injuredLeft(p, t);
  const rows = PLAYER_SLOTS.map(({ id: slot, name: slotName }) => {
    const worn = p.equip[slot];
    const options = S.inv.map((x, i) => ({ x, i })).filter(({ x, i }) => x && i < S.invSize && isArms(x.id) && ITEMS[x.id].slot === slot);
    return `<li class="gear-row">
      <span class="gear-slot-name">${slotName}</span>
      <div class="gear-worn">${worn ? `<span class="gear-icon">${ITEM_ICONS[worn]}</span><span><strong>${esc(ITEMS[worn].name)}</strong>${modsHTML(ITEMS[worn].mods)}</span>` : '<span class="hint">Empty</span>'}</div>
      <div class="gear-actions">
        ${!away && options.length ? `<select data-arms-slot="${slot}" aria-label="Choose ${slotName.toLowerCase()}">${options.map(({ x, i }) => {
          const over = carriedWeight(p) - itemWeight(worn) + itemWeight(x.id) > carryCapacity(p);
          return `<option value="${i}">${esc(ITEMS[x.id].name)} · weight ${itemWeight(x.id)}${over ? ' · too heavy' : ''}</option>`;
        }).join('')}</select>
          <button class="ghost" type="button" data-arms="${slot}">${worn ? 'Swap' : 'Wear'}</button>` : ''}
        ${!away && worn ? `<button class="ghost" type="button" data-arms-off="${slot}">Take off</button>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<div class="you-head"><span class="you-art"></span>
      <div><h3>${esc(p.name)}</h3>
      <p class="hint">Power ${sheet.power} · Health ${d.hp} · Damage ${d.damage} · Dodge ${Math.round(d.dodge * 100)}% · Armor ${Math.round(d.reduction * 100)}%</p>
      <p class="hint">${away ? 'Out exploring.' : hurt ? `Injured · heals in ${fmt(hurt)}` : 'You can explore on foot, anywhere, and never get hungry.'}</p></div></div>
    ${loadHTML(p)}
    <ul class="gear-slots">${rows}</ul>
    <p class="hint">Weapons and armor are sold in the Shop and made in the Forge. They can't be changed while you're away.</p>`;
}

function render() {
  const box = document.getElementById('worldBox');
  if (!box) return;
  const t = now();
  box.innerHTML = `
    <div class="world-layout">
      <div class="world-map-wrap">${mapSVG(t)}</div>
      <div class="world-side">
        <section class="panel-box" aria-live="polite">${sideHTML(t)}</section>
        <section class="panel-box you" id="youBox">${youHTML(t)}</section>
        <section class="panel-box"><h3>Expeditions <span class="hint">${S.world.expeditions.length} / ${EXPEDITION_SLOTS}</span></h3>
          <div id="tripsBox">${tripsHTML(t)}</div>
          ${message ? `<p class="hint" role="status">${message}</p>` : ''}
          <div id="sightBox">${sightingsHTML()}</div></section>
      </div>
    </div>`;
  box.querySelectorAll('.hex[tabindex]').forEach(g => {
    const pick = () => { selected = g.dataset.key; message = ''; render(); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  box.querySelector('.you-art').appendChild(playerArt(S.player.equip, 110));
  box.querySelectorAll('[data-arms]').forEach(btn => btn.addEventListener('click', () => {
    const index = +box.querySelector(`select[data-arms-slot="${btn.dataset.arms}"]`).value;
    const r = act('equipArms', { index });
    message = r.ok ? '' : r.reason === 'away' ? 'You are away.' : r.reason === 'too-heavy' ? 'Too heavy: that would be more than you can carry.' : 'That could not be worn.';
    render();
  }));
  box.querySelectorAll('[data-arms-off]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('unequipArms', { slot: btn.dataset.armsOff });
    message = r.ok ? '' : r.reason === 'room' ? 'Your inventory is full.' : 'That could not be taken off.';
    render();
  }));
  const add = document.getElementById('addUnitBtn');
  if (add) add.addEventListener('click', () => {
    const [kind, ...rest] = document.getElementById('addUnit').value.split(':');
    team.push({ kind, id: rest.join(':') });
    message = '';
    render();
  });
  box.querySelectorAll('[data-unit-off]').forEach(btn => btn.addEventListener('click', () => {
    team.splice(+btn.dataset.unitOff, 1);
    render();
  }));
  const kit = document.getElementById('transfuseBtn');
  if (kit) kit.addEventListener('click', () => {
    const hurt = team.map(u => unitProblem(u, now())).find(p => p && p.problem === 'injured');
    if (!hurt) return;
    const r = act('transfuse', { babyId: hurt.id });
    message = r.ok ? `${esc(byId(hurt.id).name)} is back on its feet!` : 'No Blood Transfusion.';
    render();
  });
  const heal = document.getElementById('healBtn');
  if (heal) heal.addEventListener('click', () => {
    const hurt = team.map(u => unitProblem(u, now())).find(p => p && p.problem === 'injured');
    if (!hurt) return;
    const r = act('heal', { babyId: hurt.id });
    message = r.ok ? (r.left ? `Feeling better. Heals in ${fmt(r.left)}.` : 'Fully healed!') : 'No Healing Herbs.';
    render();
  });
  const send = document.getElementById('sendTrip');
  if (send) send.addEventListener('click', () => {
    const names = team.map(unitName), mins = teamTripMins(S, team.flatMap(membersOf), selected);
    const r = act('explore', { team, hex: selected });
    message = r.ok ? `${esc(listNames(names))} set off. Back in ${mins} min.` : esc(PROBLEMS[r.reason] || 'The team could not go.');
    if (r.ok) team = [];   // the next free one is suggested
    render();
  });
  bindTrips(box);
  box.querySelectorAll('[data-hunt], [data-let]').forEach(btn => btn.addEventListener('click', () => {
    const go = 'hunt' in btn.dataset;
    const r = act('hunt', { id: btn.dataset.hunt || btn.dataset.let, go });
    if (!r.ok) { message = 'They are long gone.'; render(); return; }
    const name = esc(r.sighting.name);
    const got = (r.loot || []).map(l => `${l.n} ${itemName(l.id, l.n)}${l.lost ? ` (${l.lost} lost, inventory full)` : ''}`);
    if (r.coins) got.push(`${r.coins} coins`);
    message = !go ? `You let the ${name} be.`
      : r.caught ? `${esc(r.sighting.hunter)} ran one of the ${name} down: ${esc(got.join(', ') || 'nothing')}.`
      : `${esc(r.sighting.hunter)} gave chase, but the ${name} got away.`;
    render();
  }));
}

let shownBack = '';
// the list of trips, redrawn on its own every second so the map and the form are left alone
function bindTrips(box) {
  shownBack = backKey(now());
  box.querySelectorAll('[data-collect]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('collectTrip', { id: btn.dataset.collect, fight: btn.dataset.fight === '1' });
    if (!r.ok) { message = 'Not back yet.'; render(); return; }
    // the player alone is "you": "You are back", not "You is back"
    const names = r.team.map(unitName);
    const who = esc(listNames(names)), is = r.team.length > 1 || r.team[0].kind !== 'dino' ? 'are' : 'is';
    const got = r.loot.map(l => `${l.n} ${itemName(l.id, l.n)}${l.lost ? ` (${l.lost} lost, inventory full)` : ''}`);
    if (r.coins) got.push(`${r.coins} coins`);
    const mapped = r.revealed ? ` ${plural(r.revealed, 'new hex', 'new hexes')} on the map.` : '';
    const injured = r.battle ? r.battle.injured : [];
    const hurtName = id => id === PLAYER_ID ? 'You' : (byId(id) || { name: '?' }).name;
    const hurt = !injured.length ? ''
      : injured.length === 1 ? ` ${esc(hurtName(injured[0].id))} ${injured[0].id === PLAYER_ID ? 'are' : 'is'} injured for ${injured[0].mins} min.`
      : ` ${injured.length} of the team are injured, for up to ${Math.max(...injured.map(x => x.mins))} min.`;
    const down = injured.filter(x => x.critical).map(x => hurtName(x.id));
    const critical = !down.length ? '' : ` ${esc(listNames(down))} went down and ${down.length > 1 ? 'are' : 'is'} critically injured: herbs won't help, a Blood Transfusion will.`;
    const finder = r.team.length === 1 && r.team[0].kind !== 'pack' ? who : 'The team';
    const follow = !r.egg ? '' : r.egg.lost ? ` ${finder} found a ${esc(SPECIES[r.egg.type].egg)} but your egg tray is full, so it stayed behind.`
      : ` ${finder} found a ${esc(SPECIES[r.egg.type].egg)} (${esc(SPECIES[r.egg.type].species)})! It's waiting in the Incubator.`;
    const mad = r.battle && r.battle.frenzy.length
      ? ` ${esc(listNames(r.battle.frenzy.map(i => r.battle.team[i].name)))} turned on each other and fought in a frenzy.` : '';
    const ran = r.battle ? r.battle.fled.map(i => r.battle.team[i].name) : [];
    const runText = !ran.length || (r.battle && r.battle.escaped) ? '' : ` ${esc(listNames(ran))} ran from the ${esc(r.battle.foe.name)} and left the others to fight.`;
    // a pack of ours, or the foe's pack or herd, that lost half its members and ran off mid-fight
    // (a Parasaurolophus herd runs as soon as one of it breaks away)
    const herdRan = i => r.battle.log.some(e => e.by === 'foe' && e.to === i && e.escaped);
    const routs = r.battle && r.battle.routed ? r.battle.routed : [];
    const broke = [
      ...routs.filter(i => !herdRan(i)).length ? [` ${esc(listNames(routs.filter(i => !herdRan(i)).map(i => r.battle.team[i].name)))} lost half the pack and ran off.`] : [],
      ...routs.filter(herdRan).map(i => ` One of ${esc(r.battle.team[i].name)} broke away and the whole herd ran with it.`),
    ].join('');
    const gaveUp = r.battle && r.battle.log.some(e => e.gaveUp);
    const foeBroke = r.battle && r.battle.foeFled ? (gaveUp ? ` The ${esc(r.battle.foe.name)} couldn't get through the armor and gave up.` : ` Badly hurt, the ${esc(r.battle.foe.name)} fled and left nothing behind.`)
      : r.battle && r.battle.foeRouted ? ` Half of them down, the rest ran off.` : '';
    // a Parasaurolophus heard the predator coming
    const call = r.battle && r.battle.alerted === 'team' ? r.battle.log.find(e => e.alert) : null;
    const warned = call ? ` ${esc(r.battle.team[call.by].name)} warned of the predator, leaving your group ready.` : '';
    // runners saw a predator first and the team ran
    const deadName = id => ((r.died || []).find(x => x.id === id) || {}).name || hurtName(id);
    const ran2 = r.chase && r.chase.scattered ? ` ${/^[AEIOU]/.test(r.chase.name) ? 'An' : 'A'} ${esc(r.chase.name)} was spotted by your group before it struck. Everyone scattered in zigzags and got away.`
      : r.chase ? ` ${/^[AEIOU]/.test(r.chase.name) ? 'An' : 'A'} ${esc(r.chase.name)} was spotted by your group.${r.chase.caught ? ` In the escape, ${esc(deadName(r.chase.caught))} was caught by ${r.chase.count > 1 ? 'them' : 'it'}${r.chase.died ? ' and did not survive.' : ' and is critically injured.'}` : ' Everyone got away.'}` : '';
    // the dead, from the fight
    const lost = (r.died || []).filter(x => !r.chase || x.id !== r.chase.caught);
    const mourn = lost.length ? ` ${esc(listNames(lost.map(x => x.name)))} did not survive the fight.` : '';
    // a rival as big as the team's Spinosaurus sized up its sail and backed off
    const sailed = r.backedOff ? ` On the way, ${/^[AEIOU]/.test(r.backedOff.name) ? 'an' : 'a'} ${esc(r.backedOff.name)} sized up ${esc(r.backedOff.by)}'s sail and backed off.` : '';
    const peace = r.standoff && !r.standoff.fought ? ` ${standText(r.standoff, true)} The team left ${r.standoff.count > 1 ? 'them' : 'it'} in peace.` : '';
    // a predator gave chase to those who ran and caught one
    const c = r.battle && r.battle.caught;
    const caughtText = c ? ` In the escape, ${esc(deadName(c.id))} was caught${c.died ? ' and did not survive.' : ' and is critically injured.'}` : '';
    const fed = (r.fedSelf || []).length ? ` ${esc(listNames(r.fedSelf.map(hurtName)))} hunted lizards and insects on the way and came home fed.` : '';
    message = c && c.died && r.members.length === 1
      ? `${who} met ${/^[AEIOU]/.test(r.battle.foe.name) ? 'an' : 'a'} ${esc(r.battle.foe.name)} and ran, but was caught and did not survive.${mapped}`
      : r.battle && r.battle.escaped
      ? `${who} met ${/^[AEIOU]/.test(r.battle.foe.name) ? 'an' : 'a'} ${esc(r.battle.foe.name)} and ran off.${caughtText} ${is === 'is' ? 'It' : 'They'} came back with ${esc(got.join(', ') || 'nothing')}, but nothing of it.${fed}${follow}${mapped}`
      : r.battle && !r.battle.win
      ? `${who} lost to the ${esc(r.battle.foe.name)} and came home with nothing.${warned}${runText}${broke}${mad}${mourn}${hurt}${critical}${mapped}`
      : `${who} ${is} back from the ${esc(BIOMES[r.biome].name)}${r.battle ? `, victorious over the ${esc(r.battle.foe.name)},` : ''} with ${esc(got.join(', ') || 'nothing')}.${ran2}${sailed}${mourn}${warned}${peace}${r.sighting ? ` On the way, the team spotted ${/^[AEIOU]/.test(r.sighting.name) ? 'an' : 'a'} ${esc(r.sighting.name)} keeping its distance.` : ''}${foeBroke}${runText}${broke}${mad}${hurt}${critical}${fed}${follow}${mapped}`;
    render();
    if (r.battle && !r.battle.escaped) playFight(r.battle, message, byId);
  }));
  box.querySelectorAll('[data-recall]').forEach(btn => btn.addEventListener('click', () => {
    act('recall', { id: btn.dataset.recall });
    message = 'Called back. The team came home with nothing.';
    render();
  }));
}
const backKey = t => S.world.expeditions.filter(e => t >= e.returnAt).map(e => e.id).join();
function tickTrips() {
  const box = document.getElementById('tripsBox');
  if (!box || !S.world.expeditions.length || document.hidden) return;
  const t = now();
  // a trip that just came back changes the map too
  if (backKey(t) !== shownBack) { render(); return; }
  box.innerHTML = tripsHTML(t);
  bindTrips(box);
}

// the timers and the "back!" badge on the tab keep moving while the page is open
function updateBadge() {
  const t = now();
  const back = S.world.expeditions.filter(e => t >= e.returnAt).length;
  const pill = document.getElementById('worldPill');
  pill.hidden = back === 0;
  pill.textContent = back + ' back';
}

export function initWorld() {
  subscribe(() => { if (currentTab() === 'world') render(); updateBadge(); });
  onTabChange(tab => {
    clearInterval(tick); tick = null;
    if (tab !== 'world') return;
    render();
    // redraw each second only while a trip is running, keeping the map and the form as they are
    tick = setInterval(tickTrips, 1000);
  });
  setInterval(updateBadge, 1000);
  updateBadge();
}
