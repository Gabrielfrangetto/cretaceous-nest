// World tab: the hex map around the nest under its fog, and the expeditions that explore it.
// Pick a hex, put a team together, send it; when it comes back, collect what it found.
import { SCOUT, FRENZY_DROPS, BIOMES, ITEMS, SEX, SPECIES, EXPEDITION_SLOTS, TEAM_SLOTS, STAGES, DISCOVERY_COINS_PER_HEX, HEAL_MINS, PLAYER_ID, PLAYER_SLOTS, EYES, SIZE_ORDER } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, isHungry, countItem, isArms, statSheet, carriedWeight, carryCapacity, itemWeight } from '../economy.js';
import {
  ALL_HEXES, hexKey, parseKey, hexDist, biomeAt, cellAt, neighbors, isRevealed, canReach, teamTripMins, teamSlow, teamHaul, allRunners, hasScout, lootTable, exploreProblem, expeditionOf,
  threatAt, isLair, injuredLeft, isCritical, explorerOf, memberProblem, teamFrom, teamUnits, keepsAway, passesBy, watery, routeRisk, sailBackOff, chaseOf, huntOdds, tripStandoff, tripScatter, tripWitness, encounterChance,
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
// terrain drawn over the biome: hills, mountains, a volcano's peak, a river; water has its own colour
const TERRAIN = {
  hill: '<path d="M-13 9 q6 -10 12 0 q5 -8 12 0" fill="none" stroke="#5b4a32" stroke-width="2" opacity=".7"/>',
  mountain: '<path d="M-14 10 L-5 -9 L1 2 L5 -4 L14 10Z" fill="#6e6458"/><path d="M-5 -9 L-2 -3 L-7 -3Z" fill="#f2efe6"/>',
  volcano: '<path d="M-14 10 L-4 -8 L4 -8 L14 10Z" fill="#4a3028"/><path d="M-4 -8 L-1 -13 L2 -9 L4 -12 L4 -8Z" fill="#e2643a"/>',
};
const RIVER = '<path d="M-22 -6 C-8 -14 -6 8 8 0 S 18 -4 24 6" fill="none" stroke="#4f8fcf" stroke-width="4" stroke-linecap="round"/>';
const WATER = { ocean: '#3b6e9e', lake: '#5b95c8' };
const fillOf = c => WATER[c.terrain] || BIOMES[c.biome].color;
const glyphOf = c => WATER[c.terrain] ? '' : (TERRAIN[c.terrain] || GLYPH[c.biome]) + (c.river ? RIVER : '');
const TERRAIN_NAME = { hill: 'hills', mountain: 'mountains', volcano: 'a volcano' };
const placeName = c => WATER[c.terrain] ? (c.terrain === 'lake' ? 'Lake' : 'Open sea') : `${BIOMES[c.biome].name}${TERRAIN_NAME[c.terrain] ? `, ${TERRAIN_NAME[c.terrain]}` : ''}${c.river ? ', a river' : ''}`;
const NEST = '<ellipse cx="0" cy="4" rx="13" ry="5" fill="#9c7240"/><ellipse cx="0" cy="1" rx="9" ry="3" fill="#c49a5c"/><ellipse cx="-3" cy="-2" rx="3" ry="4" fill="#f3ead2"/><ellipse cx="3" cy="-2" rx="3" ry="4" fill="#eadcbf"/>';

// a sample map for the landing page: every hex up to `seen` steps revealed, one more ring of fog
export function sampleMapSVG(seed, seen = 3) {
  const cells = ALL_HEXES.filter(h => hexDist(h) <= seen + 1).map(h => {
    const c = center(h), d = hexDist(h), cell = cellAt(seed, h);
    const fog = d > seen;
    return `<g class="hex ${fog ? 'fog' : 'seen'}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})">
      <polygon points="${corners([0, 0], 0.96)}" ${fog ? '' : `style="fill:${fillOf(cell)}"`}/>${d === 0 ? NEST : fog ? '<text class="q" y="5">?</text>' : glyphOf(cell)}</g>`;
  }).join('');
  const r = SIZE * SQ3 * (seen + 1.6);
  return `<svg class="world-map" viewBox="${-r} ${-r * 0.92} ${r * 2} ${r * 1.84}" aria-hidden="true">${cells}</svg>`;
}

const PROBLEMS = {
  'too-young': 'Babies stay in the nest. Feed it until it is a juvenile.',
  away: 'Already exploring.',
  breeding: 'Busy nesting with its partner.',
  hungry: 'Too hungry to travel. Feed it in the Nest first.',
  'no-slot': `Only ${EXPEDITION_SLOTS} teams can be out at the same time.`,
  unreachable: 'Too deep in the fog. Explore the hexes next to it first.',
  home: 'This is your nest.',
  water: 'Open water: no one can go there.',
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
const SHORT = { away: 'away', injured: 'injured', critical: 'critically injured', hungry: 'hungry', breeding: 'nesting', 'too-young': 'too young' };

// the map's view (in map units), kept while the player looks around; first framed on the nest
let view = null;
const VIEW_W = SIZE * SQ3 * 14, VIEW_MIN = SIZE * SQ3 * 5, VIEW_MAX = SIZE * SQ3 * 60;
function mapSVG(t) {
  const w = S.world;
  const away = new Map(w.expeditions.map(e => [e.hex, e]));
  // the whole continent is drawn (its lie is known); what lives in a hex is known once it was seen
  if (!view) view = { x: -VIEW_W / 2, y: -VIEW_W * 0.35, w: VIEW_W, h: VIEW_W * 0.7 };
  const cells = ALL_HEXES.map(h => {
    const key = hexKey(...h), c = center(h), cell = cellAt(w.seed, h);
    const known = isRevealed(S, key), home = hexDist(h) === 0, water = cell.terrain === 'ocean' || cell.terrain === 'lake';
    const go = !water && canReach(S, key);
    const cls = ['hex', 'seen', known || water ? '' : 'unknown', key === selected ? 'sel' : ''].filter(Boolean).join(' ');
    const lair = known && !water && isLair(w.seed, h);
    const label = home ? 'Your nest' : `${placeName(cell)}${lair ? ', a lair' : ''}${!known && !water ? ', unexplored' : ''}`;
    const glyph = home ? NEST : glyphOf(cell) + (lair ? LAIR : '');
    const exp = away.get(key);
    const marker = exp ? `<g class="trip ${t >= exp.returnAt ? 'back' : ''}"><circle r="8" cx="12" cy="-12"/><text x="12" y="-8.5">${esc(exp.team.length > 1 ? String(exp.team.length) : (unitName(exp.team[0])[0] || '?'))}</text></g>` : '';
    return `<g class="${cls}" data-key="${key}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})" ${go || home ? `tabindex="0" role="button" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
      <polygon points="${corners([0, 0], 0.96)}" style="fill:${fillOf(cell)}"/>${glyph}${marker}</g>`;
  }).join('');
  return `<svg class="world-map" id="worldMap" viewBox="${[view.x, view.y, view.w, view.h].map(v => v.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="World map">${cells}</svg>
    <div class="map-tools"><button class="ghost" type="button" data-zoom="in" aria-label="Zoom in">+</button><button class="ghost" type="button" data-zoom="out" aria-label="Zoom out">−</button><button class="ghost" type="button" data-zoom="home">Nest</button></div>
    <p class="hint map-legend"><span class="unknown-key">Not yet explored</span><span style="--c:${WATER.ocean}">Sea</span><span style="--c:${WATER.lake}">Lake</span>${Object.values(BIOMES).map(b => `<span style="--c:${b.color}">${esc(b.name)}</span>`).join('')} · hills and mountains slow a trip, a river takes crossing, water can't be crossed</p>`;
}

// drag to look around, the wheel or two fingers to zoom; a press that doesn't move is a tap on a hex
let dragged = false;
function bindMap(box) {
  const svg = box.querySelector('#worldMap');
  if (!svg) return;
  const set = () => svg.setAttribute('viewBox', [view.x, view.y, view.w, view.h].map(v => v.toFixed(1)).join(' '));
  const scale = () => view.w / svg.getBoundingClientRect().width;
  const zoom = (k, cx = view.x + view.w / 2, cy = view.y + view.h / 2) => {
    const w = Math.min(VIEW_MAX, Math.max(VIEW_MIN, view.w * k)), f = w / view.w;
    view = { x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h: view.h * f };
    set();
  };
  const pts = new Map();
  let start = null, pinch = null;
  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, view: { ...view } }; dragged = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 0) zoom(pinch.w / (view.w * d / pinch.d));
      dragged = true;
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!dragged && Math.hypot(dx, dy) < 6) return;
    if (!dragged) svg.setPointerCapture(e.pointerId);
    dragged = true;
    const k = scale();
    view = { ...view, x: start.view.x - dx * k, y: start.view.y - dy * k };
    set();
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) start = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), k = scale();
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, view.x + (e.clientX - r.left) * k, view.y + (e.clientY - r.top) * k);
  }, { passive: false });
  box.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.zoom === 'home') { view = { x: -VIEW_W / 2, y: -VIEW_W * 0.35, w: VIEW_W, h: VIEW_W * 0.7 }; set(); }
    else zoom(b.dataset.zoom === 'in' ? 1 / 1.3 : 1.3);
  }));
}

// what waits there and how a fight would likely go for the chosen explorer
function threatHTML(h, units, scout) {
  if (!isRevealed(S, hexKey(...h))) {
    return '<div class="threat"><p class="hint">Tread carefully in these parts: you know not what could happen. Always be prepared.</p></div>';
  }
  const th = threatAt(S.world.seed, h);
  const swamp = watery(S.world.seed, h);
  // it keeps away from a team with anything bigger than it stands up to: no fight, but it may be hunted
  if (units.length && keepsAway(th, units)) {
    const hunt = huntOdds(units, th.foe.members[0]);
    return `<div class="threat ${th.lair ? 'is-lair' : ''}">
    <p><strong>${th.lair ? 'Lair: ' : ''}${esc(th.foe.name)}</strong> <span class="hint">Power ${th.power}</span></p>
    <p class="hint">${passesBy(th, units) ? 'Nothing in your team is prey to it: it will pass you by.' : 'It keeps away from a team like yours: there will be no fight.'}</p>
    <p class="hint">${hunt ? `You ${often(encounterChance(th, units, biomeAt(S.world.seed, h), scout))} spot it at a distance, and ${esc(hunt.hunter)} would have ${chanceOf(hunt.chance)} chance of catching one.` : 'Nobody in this team could hunt it.'}</p>
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
  const sail = units.length ? sailBackOff(th, units, swamp) : 0;
  // watchful ones (Hypsilophodon) may see a predator first and the team scatters
  const eyes = Math.min(EYES.max, EYES.perOne * units.reduce((t, u) => t + u.members.filter(m => m.type && SPECIES[m.type].eyes).length, 0));
  return `<div class="threat ${th.lair ? 'is-lair' : ''}">
    <p><strong>${th.lair ? 'Lair: ' : ''}${esc(th.foe.name)}</strong> <span class="hint">Power ${th.power}</span></p>
    ${run.escaped && units.length ? `<p class="hint warn-text">Nobody in this team would fight it: they'd run off and bring nothing of it home.</p>${chased ? `<p class="hint warn-text">It would give chase, with ${chanceOf(chased.chance)} chance of catching ${esc(chased.fighter.name)}, who would be ${riskOf(chased.chance * chased.death)}.</p>` : ''}`
      : runners.length ? `<p class="hint warn-text">${esc(listNames(runners))} would run from it before the fight.</p>` : ''}
    <p class="hint">${th.lair ? 'Always met here. Beating it pays double and often drops equipment.' : `${cap(often(encounterChance(th, units, biomeAt(S.world.seed, h), scout)))} met here.${scout ? ' Your scout leads the team around it when it can.' : ''}${(th.foe.members[0].role || 'attacker') === 'attacker' ? ' The bigger the team, the sooner it is noticed.' : ''}`}</p>
    ${(th.foe.members[0].role || 'attacker') !== 'attacker' ? '<p class="hint">It won\'t attack: it stands its ground to drive you off. You choose whether to fight it when the team is back.</p>' : ''}
    ${odds == null ? '' : `<p><span class="danger danger-${danger.toLowerCase()}">${danger}</span> <span class="hint">${who} ${winOf(odds)} (Power ${power})</span></p>`}
    ${sail ? `<p class="hint">It may size up your Spinosaurus's sail and back off, as it ${often(sail)} does.</p>` : ''}
    ${fight ? riskHTML(units, fight.death) : ''}
    ${eyes && (th.foe.members[0].role || 'attacker') === 'attacker' ? `<p class="hint">Your Hypsilophodon ${often(eyes)} see it first: then the team scatters and nobody is caught.</p>` : ''}
    ${units.some(u => u.members.some(m => m.type && SPECIES[m.type].runner)) && (th.foe.members[0].role || 'attacker') === 'attacker' ? '<p class="hint warn-text">If your Gallimimus see it first the team runs, but it gives chase: it may catch the slowest of the team, and the one caught may not survive.</p>' : ''}
  </div>`;
}

// Before setting out: what the team could run into on the way and there, from what the player knows
// (the biomes it crosses, the animals already seen): the chance something stops it on the way, and the
// worst it could meet, with the risk of death. Worked out once per hex and team.
const routeCache = new Map();
function routeHTML(units, key) {
  const sig = key + '|' + units.map(u => u.name + u.members.length).join(',');
  if (!routeCache.has(sig)) {
    const r = routeRisk(S, units, key);
    const biome = biomeAt(S.world.seed, parseKey(key));
    // (the likeliest to beat the team; between equals, the deadlier, then the biggest)
    const death = f => Math.max(...f.odds.death.flat()), big = f => SIZE_ORDER.indexOf(f.foe.members[0].size);
    const worst = r.foes.map(f => ({ ...f, odds: teamOdds(units, f.foe, 60, { swamp: false, biome }) })).sort((a, b) => a.odds.win - b.odds.win || death(b) - death(a) || big(b) - big(a))[0] || null;
    if (routeCache.size > 40) routeCache.clear();
    routeCache.set(sig, { ...r, worst });
  }
  const r = routeCache.get(sig);
  const how = r.stopped < 0.08 ? 'The way is quiet.' : r.stopped < 0.25 ? 'Something may notice you on the way.' : r.stopped < 0.5 ? 'The way is dangerous: something will likely come for you.' : 'Few cross that way unharmed.';
  const way = r.crosses.length ? `On the way you cross ${esc(listNames(r.crosses.map(b => `the ${BIOMES[b].name}`)))}. ${how}` : 'The way there is calm.';
  const w = r.worst;
  return `<div class="route ${w && w.odds.win < 0.5 ? 'warn' : ''}"><p class="hint">${way}</p>
    ${w ? `<p class="hint ${w.odds.win < 0.5 ? 'warn-text' : ''}">The worst you could meet ${w.at}: ${article(w.foe.name)} ${esc(w.foe.name)} <span class="danger danger-${dangerOf(w.odds.win).toLowerCase()}">${dangerOf(w.odds.win)}</span>${Math.max(...w.odds.death.flat()) >= 0.01 ? ` (${riskOf(Math.max(...w.odds.death.flat()))})` : ''}.</p>` : ''}</div>`;
}

// the risk of death in a fight, for those who could die (1% or more); a pack shows its likeliest one
function riskHTML(units, death) {
  const at = units.map((u, i) => ({ name: u.name, p: Math.max(...death[i]) })).filter(x => x.p >= 0.01);
  if (!at.length) return '<p class="hint">Nobody is likely to die if it comes to a fight.</p>';
  return `<p class="hint warn-text">If it comes to a fight: ${at.map(x => `${esc(x.name)} would be ${riskOf(x.p)}`).join('; ')}.</p>`;
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
  if (!isRevealed(S, key)) return '';
  return `<ul class="loot">${lootTable(S, key).map(l => `<li><span class="mini">${ITEM_ICONS[l.id]}</span>${l.min === l.max ? l.min : l.min + '–' + l.max} ${esc(itemName(l.id, l.max))}${l.chance < 1 ? ` <span class="hint">(${often(l.chance)})</span>` : ''}</li>`).join('')}</ul>`;
}

// species that may turn on each other (BODY rival) warn when there is more than one
function rivalsHTML(members) {
  const types = members.map(id => id !== PLAYER_ID && byId(id)).filter(Boolean).map(b => b.type);
  return [...new Set(types)].filter(t => SPECIES[t].rival && types.filter(x => x === t).length > 1).map(t => {
    const n = types.filter(x => x === t).length;
    return `<p class="hint warn-text">${n} ${esc(SPECIES[t].species)} in one team: every one for itself. In a fight they may turn on each other and go into a frenzy: they bite far harder, but they bite the foe and each other alike, and the last one standing bites anyone in the team. Win after a frenzy and it may drop ${FRENZY_DROPS.map(d => ITEMS[d.id].plural).join(' and ')}, likelier and more of them the more ${esc(SPECIES[t].species)} there are (now: ${FRENZY_DROPS.map(d => `${ITEMS[d.id].name} ${often(d.chance(n))}`).join(', ')}).</p>`;
  }).join('');
}

function sideHTML(t) {
  if (!selected) return `<h3>Pick a hex</h3>
    <p class="hint">Tap any hex of land to explore it, however far; drag the map to look around. The paler hexes are unexplored: what lives there is unknown, and the far lands are dangerous. Put together a team of up to ${TEAM_SLOTS}: yourself, juvenile or adult dinosaurs, and packs. Farther hexes, and rough ground on the way, take longer. What lives out there is young or old, in its prime or past it: the stronger it is, the more it brings, sometimes an egg. Dinosaurs come home hungry.</p>`;
  const h = parseKey(selected), d = hexDist(h);
  if (d === 0) return `<h3>Your nest</h3><p class="hint">Where your dinosaurs live. Every trip starts and ends here.</p>`;
  const seen = isRevealed(S, selected);
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
  return `<h3>${esc(placeName(cellAt(S.world.seed, h)))}${seen ? '' : ' <span class="hint">· unexplored</span>'}</h3>
    <p class="hint">${plural(d, 'hex', 'hexes')} from the nest · trip ${teamTripMins(S, team.flatMap(membersOf), selected)} min there and back${teamSlow(S, team.flatMap(membersOf)) > 1 ? ` (a giant sets a slow pace, but brings home ×${teamHaul(S, team.flatMap(membersOf))} of what it finds)` : ''}${allRunners(S, team.flatMap(membersOf)) ? ' (only Gallimimus, with you riding one: twice as fast)' : ''}${first ? ` · first visit pays ${Math.min(d, 10) * DISCOVERY_COINS_PER_HEX} coins` : ''}</p>
    ${lootHTML(selected)}
    ${threatHTML(h, units, scout)}
    ${units.length ? routeHTML(units, selected) : ''}
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
    <div class="row"><button class="btn small" type="button" data-hunt="${esc(x.id)}">Hunt <span class="hint">(${esc(x.hunter)}: ${chanceOf(x.chance)} chance)</span></button>
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
    const swamp = watery(S.world.seed, parseKey(e.hex));
    standoffOdds.set(e.id, { ...teamOdds(units, st.foe, 120, { swamp, biome: biomeAt(S.world.seed, parseKey(e.hex)) }), units });
  }
  const { win: odds, death, units } = standoffOdds.get(e.id);
  return `<p class="hint">${standText(st)}</p>
    <button class="btn small" type="button" data-collect="${esc(e.id)}" data-fight="1">Fight ${st.count > 1 ? 'them' : 'it'} <span class="hint">(${dangerOf(odds)})</span></button>
    <button class="ghost" type="button" data-collect="${esc(e.id)}">Leave ${st.count > 1 ? 'them' : 'it'} be</button>
    ${riskHTML(units, death)}`;
}

// Odds are told in words, never in numbers: how often, how good a chance, how grave a risk, how a fight
// would go.
const often = p => (p >= 0.9 ? 'almost always' : p >= 0.65 ? 'usually' : p >= 0.4 ? 'often' : p >= 0.2 ? 'sometimes' : p >= 0.07 ? 'now and then' : 'rarely');
const chanceOf = p => (p >= 0.85 ? 'a near-certain' : p >= 0.6 ? 'a good' : p >= 0.35 ? 'a fair' : p >= 0.12 ? 'a poor' : 'a slim');
const riskOf = p => (p >= 0.45 ? 'likely to die' : p >= 0.2 ? 'a grave risk of dying' : p >= 0.05 ? 'a real risk of dying' : 'a slight risk of dying');
const winOf = p => (p >= 0.85 ? 'should win with ease' : p >= 0.6 ? 'should win' : p >= 0.4 ? 'could go either way' : p >= 0.15 ? 'would likely lose' : 'stands almost no chance');
const cap = t => t[0].toUpperCase() + t.slice(1);

// a predator that scattered the player's group on the way: face it with whoever stayed, or run too (the
// odds are worked out once per trip)
const scatterOdds = new Map();
const article = name => (/^[AEIOU]/.test(name) ? 'an' : 'a');
function scatterHTML(e) {
  const sc = tripScatter(S, e.id);
  if (!sc) return '';
  if (!scatterOdds.has(e.id)) {
    const biome = biomeAt(S.world.seed, parseKey(e.hex));
    scatterOdds.set(e.id, teamOdds(sc.units, sc.foe, 120, { swamp: watery(S.world.seed, parseKey(e.hex)), biome }));
  }
  const { win, death } = scatterOdds.get(e.id);
  const stay = e.team.filter((u, i) => u.kind !== 'player' && !sc.fled.includes(i)).map(unitName);
  const run = sc.run, p = run ? run.chance * (1 - run.safe) : 0;
  const runner = run && (run.id === PLAYER_ID ? 'you' : esc(run.fighter.name));
  const runText = !run || p < 0.01 ? 'It can\'t catch any of you.'
    : run.fights ? `It has ${chanceOf(p)} chance of catching ${runner}, and then there's no escaping the fight.`
    : `It has ${chanceOf(p)} chance of catching ${runner}, who would be ${riskOf(p * run.death)}.`;
  return `<p class="hint">On the way, ${esc(listNames(sc.prey))} ${sc.prey.length > 1 ? 'spot' : 'spots'} ${article(sc.name)} <strong>${esc(sc.name)}</strong> charging the group and ${sc.prey.length > 1 ? 'scatter' : 'bolts'}. ${sc.mounted ? 'You are still riding one of them.' : sc.alone ? 'You are on your own.' : `You stand with ${esc(listNames(stay))}.`}</p>
    <button class="btn small" type="button" data-collect="${esc(e.id)}" data-fight="1">${sc.mounted ? 'Jump down and face it' : 'Face it'} <span class="hint">(${dangerOf(win)})</span></button>
    <button class="ghost" type="button" data-collect="${esc(e.id)}" data-flee="1">${sc.mounted ? 'Ride off' : 'Run for it'}</button>
    <p class="hint">${runText}</p>
    ${riskHTML(sc.units, death)}`;
}

// a hunt the team watches on the way, wild against wild: let it be, or step in with one of its hunters,
// going after the prey or after the hunter (the odds of a fight are worked out once per trip)
const witnessOdds = new Map();
const wildName = x => `${article(x.name)} ${esc(x.name)}`;
function witnessHTML(e) {
  const wt = tripWitness(S, e.id);
  if (!wt) return '';
  const live = e.team.map(u => ({ ...u, members: u.members.filter(id => explorerOf(S, id)) })).filter(u => u.members.length);
  const biome = biomeAt(S.world.seed, parseKey(e.hex));
  const fightOdds = id => {
    const k = e.id + ':' + id;
    if (!witnessOdds.has(k)) witnessOdds.set(k, teamOdds(teamUnits(S, live.filter(u => u.kind === 'player' || u.id === id)), wt.hunterFoe, 120, { swamp: watery(S.world.seed, parseKey(e.hex)), biome, defend: true }));
    return witnessOdds.get(k);
  };
  const buttons = [], cant = [];
  for (const o of wt.options) {
    if (o.prey.ok) buttons.push(`<button class="btn small" type="button" data-collect="${esc(e.id)}" data-witness="prey" data-hunter="${esc(o.id)}">Hunt the ${esc(wt.prey.name)} with ${esc(o.name)} <span class="hint">(${chanceOf(o.prey.chance)} chance${o.prey.backsOff ? '' : ', then the hunter may fight you for it'})</span></button>`);
    if (o.predator.ok) {
      const tag = o.predator.chase ? `it runs: ${chanceOf(o.predator.chance)} chance to catch it` : (() => { const f = fightOdds(o.id); return `a fight: ${dangerOf(f.win)}`; })();
      buttons.push(`<button class="btn small" type="button" data-collect="${esc(e.id)}" data-witness="predator" data-hunter="${esc(o.id)}">Go after the ${esc(wt.hunter.name)} with ${esc(o.name)} <span class="hint">(${tag})</span></button>`);
    }
    if (!o.prey.ok && !o.predator.ok) cant.push(`${esc(o.name)} (${esc(o.prey.reason === o.predator.reason ? o.prey.reason : `prey: ${o.prey.reason}; hunter: ${o.predator.reason}`)})`);
  }
  return `<p class="hint">On the way, ${wildName(wt.hunter)} ${wt.hunter.count > 1 ? 'are' : 'is'} chasing ${wildName(wt.prey)}. Do you step in?</p>
    ${buttons.join('')}
    <button class="ghost" type="button" data-collect="${esc(e.id)}">Let it be</button>
    ${cant.length ? `<p class="hint">Can't step in: ${cant.join(', ')}.</p>` : ''}`;
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
      <div class="row">${back ? (standoffHTML(e) || scatterHTML(e) || witnessHTML(e) ||
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
  bindMap(box);
  box.querySelectorAll('.hex[tabindex]').forEach(g => {
    const pick = () => { selected = g.dataset.key; message = ''; render(); };
    g.addEventListener('click', () => { if (!dragged) pick(); });
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
    const r = act('collectTrip', { id: btn.dataset.collect, fight: btn.dataset.fight === '1', flee: btn.dataset.flee === '1',
      ...(btn.dataset.witness ? { witness: { act: btn.dataset.witness, hunter: btn.dataset.hunter } } : {}) });
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
    const runText = !ran.length || (r.battle && r.battle.escaped) || r.scatter ? '' : ` ${esc(listNames(ran))} ran from the ${esc(r.battle.foe.name)} and left the others to fight.`;
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
    // the player's group scattered before a predator: how it went, told before the rest
    const sc = r.scatter;
    const forcedName = r.battle && r.battle.forced ? (r.battle.forced === PLAYER_ID ? 'you' : esc(hurtName(r.battle.forced))) : '';
    const scatterText = !sc ? '' : `On the way, ${esc(listNames(sc.prey))} spotted ${article(sc.name)} ${esc(sc.name)} charging the group and ${sc.prey.length > 1 ? 'scattered' : 'bolted'}. `
      + (sc.choice === 'fight' ? (sc.mounted ? 'You were thrown in the scramble and stayed to fight. ' : sc.alone ? 'You stayed to face it alone. ' : 'You stayed to face it with the rest. ')
        : r.battle ? `You ran too, but it caught up with ${forcedName} and there was no escaping the fight. `
        : r.chase && r.chase.caught ? `You ran too. In the escape, ${esc(deadName(r.chase.caught))} was caught${r.chase.died ? ' and did not survive. ' : ' and is critically injured. '}`
        : r.chase && r.chase.scattered ? 'You ran too, and it never got close: everyone regrouped. ' : 'You ran too, and everyone got away and regrouped. ');
    // wild against wild, watched on the way
    const wt = r.witness;
    const natural = wt && (wt.outcome === 'kill' ? `bring down ${wildName(wt.prey)}. `
      : `go for ${wildName(wt.prey)}, ${wt.outcome === 'repelled' ? `which drove ${wt.hunter.count > 1 ? 'them' : 'it'} off. ` : 'which got away. '}`);
    const witnessText = !wt ? '' : wt.act === 'none' ? `On the way, the team watched ${wildName(wt.hunter)} ${natural}`
      : wt.act === 'prey' ? `On the way, ${wildName(wt.hunter)} was chasing ${wildName(wt.prey)}, and ${esc(wt.by)} went after it too: `
        + (wt.caught ? (wt.contested ? `it ran the ${esc(wt.prey.name)} down, but the ${esc(wt.hunter.name)} came for the kill. ` : `it ran the ${esc(wt.prey.name)} down, and the ${esc(wt.hunter.name)} let it have it. `)
          : `the ${esc(wt.prey.name)} got away${wt.turned ? `, and the ${esc(wt.hunter.name)} turned on the team. ` : `, and the ${esc(wt.hunter.name)} left. `}`)
      : `On the way, ${wildName(wt.hunter)} was chasing ${wildName(wt.prey)}, and ${esc(wt.by)} went after the ${esc(wt.hunter.name)}: the ${esc(wt.prey.name)} ran off, `
        + (r.battle ? 'and it stood its ground. ' : wt.caught ? `and the ${esc(wt.hunter.name)} ran too, but was caught. ` : `and the ${esc(wt.hunter.name)} ran too, and got away. `);
    const ran2 = sc ? '' : r.chase && r.chase.scattered ? ` ${/^[AEIOU]/.test(r.chase.name) ? 'An' : 'A'} ${esc(r.chase.name)} was spotted by your group before it struck. Everyone scattered in zigzags and got away.`
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
    const ic = r.intercepted;
    const interceptText = ic ? `On the way, crossing the ${esc(BIOMES[ic.biome].name)}, ${article(ic.name)} ${esc(ic.name)} came for the team. ` : '';
    message = interceptText + witnessText + scatterText + (c && c.died && r.members.length === 1
      ? `${who} met ${/^[AEIOU]/.test(r.battle.foe.name) ? 'an' : 'a'} ${esc(r.battle.foe.name)} and ran, but was caught and did not survive.${mapped}`
      : r.battle && r.battle.escaped
      ? `${who} met ${/^[AEIOU]/.test(r.battle.foe.name) ? 'an' : 'a'} ${esc(r.battle.foe.name)} and ran off.${caughtText} ${is === 'is' ? 'It' : 'They'} came back with ${esc(got.join(', ') || 'nothing')}, but nothing of it.${fed}${follow}${mapped}`
      : r.battle && !r.battle.win
      ? `${who} lost to the ${esc(r.battle.foe.name)} and came home with nothing.${warned}${runText}${broke}${mad}${mourn}${hurt}${critical}${mapped}`
      : `${who} ${is} back from the ${esc(BIOMES[r.biome].name)}${r.battle ? `, victorious over the ${esc(r.battle.foe.name)},` : ''} with ${esc(got.join(', ') || 'nothing')}.${ran2}${sailed}${mourn}${warned}${peace}${r.sighting ? ` On the way, the team spotted ${/^[AEIOU]/.test(r.sighting.name) ? 'an' : 'a'} ${esc(r.sighting.name)} keeping its distance.` : ''}${foeBroke}${runText}${broke}${mad}${hurt}${critical}${fed}${follow}${mapped}`);
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
