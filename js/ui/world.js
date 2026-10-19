// World tab: the map of the continent around the nest, and the parties out exploring it.
// Pick a hex, put a team together, send it; when it gets there, see the journey, then send it on or home.
import { SCOUT, FRENZY_DROPS, BIOMES, ITEMS, SEX, SPECIES, EXPEDITION_SLOTS, TEAM_SLOTS, STAGES, DISCOVERY_COINS_PER_HEX, HEAL_MINS, PLAYER_ID, PLAYER_SLOTS, EYES, AMBUSH, SIZE_ORDER, HAZARDS, SURVIVAL, CAMP, VIA_MAX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, isHungry, countItem, isArms, statSheet, carriedWeight, carryCapacity, itemWeight, mealFor } from '../economy.js';
import {
  ALL_HEXES, hexKey, parseKey, hexDist, inWorld, biomeAt, cellAt, neighbors, isRevealed, canReach, teamSlow, teamHaul, allRunners, hasScout, lootTable, exploreProblem, expeditionOf,
  threatAt, isLair, injuredLeft, isCritical, explorerOf, memberProblem, teamFrom, teamUnits, keepsAway, passesBy, watery, routeRisk, sailBackOff, chaseOf, huntOdds, encounterChance,
} from '../world.js';
import { packOf } from '../packs.js';
import { legMins, positionOf, packOf as suppliesOf, dryStretch, trainTrip, routePath, freshWater, standingUnits } from '../journey.js';
import { isStation } from '../map.js';
import { citiesOf, cityAt } from '../world.js';
import { openJourney, partyStatusHTML } from './journey.js';
import { teamOdds, dangerOf, whoFlees } from '../combat.js';
import { playFight } from './fight.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { ITEM_ICONS, playerArt } from '../art.js';
import { modsHTML, loadHTML } from './stats.js';
import { esc, fmt, plural } from '../util.js';
import { currentTab, onTabChange } from './tabs.js';
import { SIZE, SQ3, center, corners, WATER, fillOf, glyphOf, placeName, NEST, riverSVG } from './hexdraw.js';
import { GRID, fit, drawHexes, drawTiles, warmTiles, mapBounds, hexesIn, hexAt, hexPath, paint, cssVar, DETAIL_PX } from './mapcanvas.js';
import { often, chanceOf, riskOf, winOf, cap, article, listNames, healthWord, wildName } from './words.js';

// a sample map for the landing page: every hex up to `seen` steps revealed, one more ring of fog
export function sampleMapSVG(seed, seen = 3) {
  const cells = ALL_HEXES.filter(h => hexDist(h) <= seen + 1).map(h => {
    const c = center(h), d = hexDist(h), cell = cellAt(seed, h);
    const fog = d > seen;
    return `<g class="hex ${fog ? 'fog' : 'seen'}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})">
      <polygon points="${corners([0, 0], 1.01)}" ${fog ? '' : `style="fill:${fillOf(cell)}"`}/>${d === 0 ? NEST : fog ? '<text class="q" y="5">?</text>' : riverSVG(seed, h) + glyphOf(cell)}</g>`;
  }).join('');
  const r = SIZE * SQ3 * (seen + 1.6);
  return `<svg class="world-map" viewBox="${-r} ${-r * 0.92} ${r * 2} ${r * 1.84}" aria-hidden="true">${cells}</svg>`;
}

const PROBLEMS = {
  'too-young': 'Babies stay in the nest. Feed it until it is a juvenile.',
  away: 'Already exploring.',
  city: 'A settlement of other colonists. Its people keep to themselves, for now.',
  breeding: 'Busy nesting with its partner.',
  hungry: 'Too hungry to travel. Feed it in the Nest first.',
  starved: 'You are too hungry to set out. Eat something first (in the Nest).',
  coins: 'Not enough coins for the fare.',
  'no-line': 'No maglev line goes there.',
  'no-slot': `Only ${EXPEDITION_SLOTS} teams can be out at the same time.`,
  unreachable: 'Too deep in the fog. Explore the hexes next to it first.',
  home: 'This is your nest.',
  water: 'Open water: no one can go there.',
  injured: 'Injured. It heals with time, or sooner with a Healing Herb.',
  'no-team': 'Add someone to the team first.',
  'no-player': 'Your dinosaurs never set out without you.',
  'team-full': `A team has at most ${TEAM_SLOTS} places.`,
  twice: 'Someone is in the team twice.',
  missing: 'Someone in the team is gone.',
};
const LAIR = '<g class="lair" transform="translate(-13 -15)"><circle r="7" fill="#3b2a24"/><path d="M-3.5 -2 l1.6 4 M0 -3 l0 5 M3.5 -2 l-1.6 4" stroke="#f3ead2" stroke-width="1.6" stroke-linecap="round"/></g>';

let selected = null, message = '', tick = null;
// Planning the way: { to: the destination, from: where the team sets out, party: the id of a party
// waiting out there that is sent on (null: a new team from the nest) }, and route: the points the player
// dragged the way through, in the order the way passes them (the easiest way between them)
let tracing = null, route = [], undoRoute = [];
// a change to the way, kept to be undone
const changeRoute = next => { undoRoute.push(route); route = next; };
// the way planned: every hex of it, where it sets out first (worked out once per change)
let planned = { sig: '', path: [] };
function plannedPath() {
  const sig = tracing ? `${tracing.from}|${tracing.to}|${route.join(';')}` : '';
  if (planned.sig !== sig) planned = { sig, path: tracing ? [tracing.from, ...routePath(S.world.seed, tracing.from, tracing.to, route)] : [] };
  return planned.path;
}
// which stretch of the way (between the dragged points) the hex at index i of the planned path is in
function stretchOf(i) {
  const path = plannedPath();
  let s = 0, from = 0;
  for (const k of route) { const at = path.indexOf(k, from + 1); if (at < 0 || at >= i) break; s++; from = at; }
  return s;
}
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
const SHORT = { away: 'away', injured: 'injured', critical: 'critically injured', hungry: 'hungry', starved: 'hungry', breeding: 'nesting', 'too-young': 'too young' };

// the map's view (in map units), kept while the player looks around; first framed on the nest
let view = null;
// (zoomed all the way out, the whole continent)
// (zoomed all the way out, as much of the continent as fits the map's frame: never beyond its edges)
const VIEW_W = SIZE * SQ3 * 14, VIEW_MIN = SIZE * SQ3 * 5, VIEW_MAX = mapBounds().w;
// the map as drawn: a canvas, the zoom buttons, the legend; a line read out for the hex the keyboard is on
function mapHTML() {
  return `<canvas class="world-map" id="worldMap" tabindex="0" role="application" aria-label="World map. Drag to look around, arrow keys to move between hexes, Enter to pick one, plus and minus to zoom." aria-describedby="mapFocus"></canvas>
    <p class="sr-only" id="mapFocus" aria-live="polite"></p>
    <div class="map-tools"><button class="ghost" type="button" data-zoom="in" aria-label="Zoom in">+</button><button class="ghost" type="button" data-zoom="out" aria-label="Zoom out">−</button><button class="ghost" type="button" data-zoom="home">Nest</button></div>
    <p class="hint map-legend"><span class="unknown-key">Not yet explored</span><span style="--c:${WATER.ocean}">Sea</span><span style="--c:${WATER.lake}">Lake</span>${Object.values(BIOMES).map(b => `<span style="--c:${b.color}">${esc(b.name)}</span>`).join('')} · hills and mountains slow a trip, a river takes crossing, water can't be crossed</p>`;
}
const homeView = () => ({ x: -VIEW_W / 2, y: -VIEW_W * 0.35, w: VIEW_W, h: VIEW_W * 0.7 });
// a hex the player can pick: the nest, or land a team can reach
function pickable(key) {
  const h = parseKey(key);
  if (!h || !inWorld(h)) return false;
  return hexDist(h) === 0 || canReach(S, key);
}
// a hex a traced route can pass through: land a team can reach, not where it sets out from nor goes to
function traceable(key) {
  const h = parseKey(key);
  return !!tracing && !!h && inWorld(h) && key !== tracing.to && key !== tracing.from && key !== '0,0' && canReach(S, key);
}
function hexLabel(key) {
  const h = parseKey(key), cell = cellAt(S.world.seed, h);
  if (hexDist(h) === 0) return 'Your nest';
  const known = isRevealed(S, key), water = cell.terrain === 'ocean' || cell.terrain === 'lake';
  const lair = known && !water && isLair(S.world.seed, h);
  return `${placeName(cell)}${lair ? ', a lair' : ''}${!known && !water ? ', unexplored' : ''}`;
}

// The view kept inside the map: shaped like the canvas, no bigger than the map either way, and moved
// back so no edge shows past the map's
function keepInside(v, canvas) {
  // (the map's edge without the half hexes the staggered rows leave; at the top the map's first row
  // shows whole, and past it only the edge of the uncharted north, which no one explores)
  const m = mapBounds(), b = { x: m.x + SIZE * SQ3, y: m.y, w: m.w - SIZE * SQ3 * 2, h: m.h - SIZE };
  const r = canvas.getBoundingClientRect();
  const aspect = r.width > 0 && r.height > 0 ? r.height / r.width : v.h / v.w;
  const w = Math.max(VIEW_MIN, Math.min(v.w, b.w, b.h / aspect)), h = w * aspect;
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const x = Math.min(b.x + b.w - w, Math.max(b.x, cx - w / 2)), y = Math.min(b.y + b.h - h, Math.max(b.y, cy - h / 2));
  return { x, y, w, h };
}

// The map, drawn on the canvas once a frame at most (drawMap asks for it): the hexes in view, one by
// one close up or the continent's picture from afar; then lairs, the hex picked, the one under the
// pointer or the keyboard, and where each party is
let mapCanvas = null, frame = 0, lastFit = null, hover = null, focusKey = null, warmed = '';
function drawMap() {
  if (!mapCanvas || frame) return;
  frame = requestAnimationFrame(() => { frame = 0; paintMap(); });
}
function paintMap() {
  if (!mapCanvas || !mapCanvas.isConnected) return;
  const w = S.world, t = now();
  if (!view) view = homeView();
  view = keepInside(view, mapCanvas);
  const f = lastFit = fit(mapCanvas, view);
  const { ctx, scale } = f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b3a46';
  ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  ctx.restore();
  const knownSet = new Set(w.revealed), known = k => knownSet.has(k);
  const edge = cssVar('--panel'), accent = cssVar('--accent'), ink = cssVar('--ink'), heart = cssVar('--heart'), accentInk = cssVar('--accent-ink');
  const x1 = f.x0 + f.width / scale, y1 = f.y0 + f.height / scale;
  const close = SIZE * scale >= DETAIL_PX;
  const inView = close || SIZE * scale >= 6 ? hexesIn(f.x0, f.y0, x1, y1) : [];
  if (close) drawHexes(ctx, w.seed, inView, known, GRID);
  else if (drawTiles(ctx, w.seed, f, known, w.revealed.length, GRID)) drawMap();
  // the blurriest tiles of the whole map, drawn ahead once the map is up
  const sig = `${w.seed}|${w.revealed.length}`;
  if (warmed !== sig) { warmed = sig; setTimeout(() => warmTiles(w.seed, known, w.revealed.length, GRID), 400); }
  // (sizes in map units, never smaller than a few pixels on screen)
  const px = n => n / scale;
  // lairs, once a hex is big enough to show one
  for (const h of inView) {
    const key = hexKey(...h);
    if (known(key) && isLair(w.seed, h)) { const [x, y] = center(h); paint(ctx, LAIR, x, y); }
  }
  // the cities' names, and the nest's
  ctx.save();
  ctx.font = `700 ${px(12).toFixed(2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  for (const c of [{ h: [0, 0], name: 'Your nest' }, ...citiesOf(w.seed)]) {
    const [x, y] = center(c.h), ty = y + Math.max(SIZE * 0.75, px(8));
    if (x < f.x0 - px(80) || x > x1 + px(80) || y < f.y0 - px(40) || y > y1 + px(40)) continue;
    ctx.lineWidth = px(3);
    ctx.strokeStyle = 'rgba(20, 24, 18, .75)';
    ctx.strokeText(c.name, x, ty);
    ctx.fillStyle = '#fff6dc';
    ctx.fillText(c.name, x, ty);
  }
  ctx.restore();
  const outline = (key, color, width, dash = []) => {
    const h = parseKey(key);
    if (!h) return;
    const [x, y] = center(h);
    ctx.save();
    ctx.translate(x, y);
    ctx.setLineDash(dash.map(px));
    ctx.lineWidth = Math.max(width, px(2));
    ctx.strokeStyle = color;
    ctx.stroke(hexPath());
    ctx.restore();
  };
  if (hover && hover !== selected) outline(hover, ink, 2.5);
  if (focusKey && document.activeElement === mapCanvas) outline(focusKey, ink, 3, [5, 4]);
  if (selected) outline(selected, accent, 4);
  // the way planned: a line through every hex of it, each numbered (once big enough to read), the
  // points the player dragged it through ringed, fresh water marked; a point being dragged shown where
  // it would go
  if (tracing) {
    outline(tracing.to, accent, 4);
    const keys = plannedPath(), pts = keys.map(k => center(parseKey(k)));
    ctx.save();
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, px(3));
    ctx.strokeStyle = accent;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const big = SIZE * scale >= 18, r = big ? SIZE * 0.42 : Math.max(2.5, px(3));
    keys.forEach((k, i) => {
      if (!i) return;
      const [x, y] = pts[i], pin = route.includes(k), rr = pin ? r * 1.25 : r;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = pin ? heart : accent;
      ctx.fill();
      if (freshWater(w.seed, parseKey(k))) { ctx.lineWidth = Math.max(2, px(2)); ctx.strokeStyle = '#5b95c8'; ctx.stroke(); }
      if (big) {
        ctx.fillStyle = accentInk;
        ctx.font = `700 ${(rr * (i > 99 ? 0.8 : 1)).toFixed(1)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i), x, y + rr * 0.08);
      }
    });
    if (grab && grab.target) {
      const [tx, ty] = center(parseKey(grab.target));
      ctx.setLineDash([px(6), px(5)]);
      ctx.lineWidth = Math.max(2, px(2));
      ctx.strokeStyle = heart;
      ctx.beginPath();
      ctx.moveTo(...pts[grab.i - 1]);
      ctx.lineTo(tx, ty);
      ctx.lineTo(...pts[grab.i + 1]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(tx, ty, r * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = heart;
      ctx.fill();
    }
    ctx.restore();
  }
  // where each party is by now: waiting somewhere, or along its way
  for (const e of w.expeditions) {
    const i = e.leg ? positionOf(S, e, t) : null;
    const key = !e.leg ? e.at : i < 0 ? e.leg.from : e.leg.path[i];
    const [x, y] = center(parseKey(key));
    const r = Math.max(8, px(7)), cx = x + Math.max(12, px(9)), cy = y - Math.max(12, px(9));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = e.leg && t >= e.leg.arriveAt ? heart : accent;
    ctx.fill();
    ctx.lineWidth = r / 4;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.fillStyle = accentInk;
    ctx.font = `700 ${(r * 1.25).toFixed(1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.team.length > 1 ? String(e.team.length) : (unitName(e.team[0])[0] || '?'), cx, cy + r * 0.08);
  }
}

// drag to look around, the wheel or two fingers to zoom; a press that doesn't move is a tap on a hex;
// the arrow keys move between hexes and Enter picks one
let dragged = false, grab = null;
function bindMap(box) {
  const canvas = mapCanvas = box.querySelector('#worldMap');
  const zoom = (k, cx = view.x + view.w / 2, cy = view.y + view.h / 2) => {
    const w = Math.min(VIEW_MAX, Math.max(VIEW_MIN, view.w * k)), f = w / view.w;
    view = keepInside({ x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h: view.h * f }, canvas);
    drawMap();
  };
  // a point on the screen as a point of the map
  const at = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect(), f = lastFit || fit(canvas, view);
    return [f.x0 + (clientX - r.left) / f.scale, f.y0 + (clientY - r.top) / f.scale];
  };
  const keyAt = (clientX, clientY) => hexKey(...hexAt(...at(clientX, clientY)));
  const pick = key => {
    // (planning the way: a tap on a point dragged puts it back)
    if (tracing) { if (route.includes(key)) { changeRoute(route.filter(k => k !== key)); render(); } return; }
    if (pickable(key)) { selected = key; message = ''; render(); }
  };
  const pts = new Map();
  let start = null, pinch = null;
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, view: { ...view } };
      dragged = false;
      // planning the way: a press on one of its points (not where it starts or ends) takes hold of it
      if (tracing) {
        const key = keyAt(e.clientX, e.clientY), path = plannedPath(), i = path.indexOf(key);
        grab = i > 0 && i < path.length - 1 ? { i, key, target: null } : null;
      }
    }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) {
      // the hex under the pointer, outlined when it can be picked
      const key = keyAt(e.clientX, e.clientY), on = (tracing ? traceable(key) : pickable(key)) ? key : null;
      canvas.style.cursor = on ? 'pointer' : '';
      if (on !== hover) { hover = on; drawMap(); }
      return;
    }
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
    if (!dragged) canvas.setPointerCapture(e.pointerId);
    dragged = true;
    if (grab) {
      // a point of the way dragged to another hex
      const key = keyAt(e.clientX, e.clientY), target = key !== grab.key && traceable(key) ? key : null;
      if (target !== grab.target) { grab.target = target; drawMap(); }
      return;
    }
    const k = 1 / (lastFit ? lastFit.scale : 1);
    const want = { ...view, x: start.view.x - dx * k, y: start.view.y - dy * k };
    view = keepInside(want, canvas);
    // (held at an edge: the drag starts over from here, so dragging back moves the map at once)
    if (view.x !== want.x || view.y !== want.y) start = { x: e.clientX, y: e.clientY, view: { ...view } };
    drawMap();
  });
  const end = e => {
    const tap = pts.size === 1 && start && !dragged;
    if (grab && e.type === 'pointerup' && grab.target) {
      // the dragged point becomes one the way passes through: moved, if it was one, or put in its stretch
      const k = route.indexOf(grab.key);
      if (k >= 0) changeRoute(route.map((x, j) => (j === k ? grab.target : x)));
      else if (route.length < VIA_MAX) changeRoute([...route.slice(0, stretchOf(grab.i)), grab.target, ...route.slice(stretchOf(grab.i))]);
      grab = null;
      render();
    }
    grab = null;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) start = null;
    if (tap && e.type === 'pointerup') pick(keyAt(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; drawMap(); } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [x, y] = at(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, x, y);
  }, { passive: false });
  // the keyboard: a hex to stand on, kept in view, read out
  const say = () => { box.querySelector('#mapFocus').textContent = hexLabel(focusKey) + (pickable(focusKey) ? '' : ' (out of reach)'); };
  canvas.addEventListener('focus', () => { focusKey = focusKey || selected || '0,0'; say(); drawMap(); });
  canvas.addEventListener('blur', drawMap);
  const STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  canvas.addEventListener('keydown', e => {
    if (STEPS[e.key]) {
      e.preventDefault();
      const [q, r] = parseKey(focusKey || '0,0'), [dq, dr] = STEPS[e.key], h = [q + dq, r + dr];
      if (!inWorld(h)) return;
      focusKey = hexKey(...h);
      const [x, y] = center(h);
      if (x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h) view = { ...view, x: x - view.w / 2, y: y - view.h / 2 };
      say();
      drawMap();
    } else if ((e.key === 'Enter' || e.key === ' ') && focusKey) { e.preventDefault(); pick(focusKey); }
    else if (e.key === '+' || e.key === '=') zoom(1 / 1.3);
    else if (e.key === '-') zoom(1.3);
  });
  box.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.zoom === 'home') { view = homeView(); drawMap(); }
    else zoom(b.dataset.zoom === 'in' ? 1 / 1.3 : 1.3);
  }));
  // the canvas follows the size it is shown at
  new ResizeObserver(drawMap).observe(canvas);
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
  const chased = units.length && run.escaped ? chaseOf(units, th.foe, biomeAt(S.world.seed, h)) : null;
  // a rival as big as a Spinosaurus in the team may back off from its sail
  const sail = units.length ? sailBackOff(th, units, swamp) : 0;
  // watchful ones (Hypsilophodon) may see a predator first and the team scatters
  // in a thick forest a predator gets close unseen (AMBUSH)
  const ambush = !!BIOMES[biomeAt(S.world.seed, h)].ambush && (th.foe.members[0].role || 'attacker') === 'attacker';
  const eyes = Math.min(EYES.max, EYES.perOne * units.reduce((t, u) => t + u.members.filter(m => m.type && SPECIES[m.type].eyes).length, 0)) * (ambush ? AMBUSH.spot : 1);
  return `<div class="threat ${th.lair ? 'is-lair' : ''}">
    <p><strong>${th.lair ? 'Lair: ' : ''}${esc(th.foe.name)}</strong> <span class="hint">Power ${th.power}</span></p>
    ${run.escaped && units.length ? `<p class="hint warn-text">Nobody in this team would fight it: they'd run off and bring nothing of it home.</p>${chased ? `<p class="hint warn-text">It would give chase, with ${chanceOf(chased.chance)} chance of catching ${esc(chased.fighter.name)}, who would be ${riskOf(chased.chance * chased.death)}.</p>` : ''}`
      : runners.length ? `<p class="hint warn-text">${esc(listNames(runners))} would run from it before the fight.</p>` : ''}
    <p class="hint">${th.lair ? 'Always met here. Beating it pays double and often drops equipment.' : `${cap(often(encounterChance(th, units, biomeAt(S.world.seed, h), scout)))} met here.${scout ? ' Your scout leads the team around it when it can.' : ''}${(th.foe.members[0].role || 'attacker') === 'attacker' ? ' The bigger the team, the sooner it is noticed.' : ''}`}</p>
    ${ambush ? '<p class="hint warn-text">The forest is thick here: a hunter gets close before anyone sees it, and it is harder to outrun.</p>' : ''}
    ${(th.foe.members[0].role || 'attacker') !== 'attacker' ? '<p class="hint">It won\'t attack: it stands its ground to drive you off. You choose whether to fight it when you see the journey.</p>' : ''}
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
// (path: the way planned, hex keys with the destination last; the easiest way from the nest by default)
function routeHTML(units, key, calm = false, path = null) {
  const sig = key + '|' + units.map(u => u.name + u.members.length).join(',') + '|' + (path ? path.join(';') : '');
  if (!routeCache.has(sig)) {
    const r = path ? routeRisk(S, units, key, path.map(parseKey)) : routeRisk(S, units, key);
    // the likeliest to beat the team, fought where it would be met; between equals, the deadlier, then
    // the biggest
    const death = f => Math.max(...f.odds.death.flat()), big = f => SIZE_ORDER.indexOf(f.foe.members[0].size);
    const worstOf = at => r.foes.filter(f => f.at === at).map(f => ({ ...f, odds: teamOdds(units, f.foe, 60, { swamp: f.water, biome: f.biome }) }))
      .sort((a, b) => a.odds.win - b.odds.win || death(b) - death(a) || big(b) - big(a))[0] || null;
    if (routeCache.size > 40) routeCache.clear();
    routeCache.set(sig, { ...r, way: worstOf('on the way'), there: worstOf('there') });
  }
  const r = routeCache.get(sig);
  const how = r.stopped < 0.08 ? 'The way is quiet.' : r.stopped < 0.25 ? 'Something may notice you on the way.' : r.stopped < 0.5 ? 'The way is dangerous: something will likely come for you.' : 'Few cross that way unharmed.';
  const way = r.crosses.length ? `On the way you cross ${esc(listNames(r.crosses.map(b => `the ${BIOMES[b].name}`)))}. ${how}` : 'The way there is calm.';
  const line = (w, where) => {
    if (!w) return '';
    const dies = Math.max(...w.odds.death.flat());
    return `<p class="hint ${w.odds.win < 0.5 ? 'warn-text' : ''}">${where}, the worst you could meet: ${article(w.foe.name)} ${esc(w.foe.name)}${w.at === 'on the way' ? ` in the ${esc(BIOMES[w.biome].name)}` : ''} <span class="danger danger-${dangerOf(w.odds.win).toLowerCase()}">${dangerOf(w.odds.win)}</span>${dies >= 0.01 ? ` (${riskOf(dies)})` : ''}.</p>`;
  };
  // (what lives at an explored hex is told above it; at an unexplored one only what its land could hold)
  const there = isRevealed(S, key) || calm ? null : r.there;
  const warn = [r.way, there].some(w => w && w.odds.win < 0.5);
  return `<div class="route ${warn ? 'warn' : ''}"><p class="hint">${way}</p>${line(r.way, 'On the way')}${line(there, 'When you arrive')}</div>`;
}

// What the team packs (water flasks, the player's rations) and the longest dry stretch on the way
function suppliesHTML(members, key, from = '0,0') {
  const sup = suppliesOf(S, members), dry = dryStretch(S.world.seed, from, key, route);
  const packed = [sup.water_skin ? `${sup.water_skin} ${sup.water_skin === 1 ? ITEMS.water_skin.name : ITEMS.water_skin.plural}` : '', sup.ration ? `${sup.ration} ${sup.ration === 1 ? ITEMS.ration.name : ITEMS.ration.plural}` : ''].filter(Boolean);
  const pack = packed.length ? `The team packs ${listNames(packed)} from your inventory.` : '';
  const drinks = members.reduce((t, id) => t + (SURVIVAL.drinks[id === PLAYER_ID ? 'small' : SPECIES[byId(id).type].size] || 1), 0);
  let water = '';
  if (dry.thirst >= SURVIVAL.faint) water = `A long dry stretch on the way: ${plural(dry.hexes, 'hex', 'hexes')} with no fresh water. ${sup.water >= drinks ? 'The flasks may just see the team through.' : 'Without water flasks, some may not make it.'}`;
  else if (dry.thirst >= SURVIVAL.at) water = `There is a dry stretch on the way, ${plural(dry.hexes, 'hex', 'hexes')} with no fresh water: the team will be thirsty${sup.water ? ', but has its flasks' : ''}.`;
  const food = members.includes(PLAYER_ID) && !sup.ration ? 'You pack no rations: you will eat what the team finds or brings down.' : '';
  const text = [pack, water, food].filter(Boolean).join(' ');
  return text ? `<p class="hint ${dry.thirst >= SURVIVAL.faint && sup.water < drinks ? 'warn-text' : ''}">${text}</p>` : '';
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

// the land's own dangers there (HAZARDS), in a line
function landHTML(cell) {
  const z = (HAZARDS[cell.biome] || []).filter(x => (!x.river || cell.river) && (x.cold == null || cell.heat < x.cold));
  const say = {
    sandstorm: 'Sandstorms blow across the dunes.', heat: 'Water is scarce under the burning sun.',
    fumes: `Foul fumes drift down from the vents${cell.lava ? ', worst here on the old lava' : ''}.`,
    flood: 'The river can burst its banks and hold a team up.', bog: "Bogs can cost a team its time, and a heavy animal its footing.",
    cold: 'The nights are bitterly cold for small dinosaurs.', lost: 'A team can lose its way in this forest.',
  };
  return z.length ? `<p class="hint">${z.map(x => say[x.kind]).join(' ')}</p>` : '';
}

function sideHTML(t) {
  if (tracing) return traceHTML(t);
  if (!selected) return `<h3>Pick a hex</h3>
    <p class="hint">Tap any hex of land to explore it, however far; drag the map to look around. The paler hexes are unexplored: what lives there is unknown, and the far lands are dangerous. Put together a team of up to ${TEAM_SLOTS}: yourself, juvenile or adult dinosaurs, and packs. Farther hexes, and rough ground on the way, take longer. What lives out there is young or old, in its prime or past it: the stronger it is, the more it brings, sometimes an egg. A team waits where it went for your orders: on to another hex, or home, and the way back has its dangers too. What it finds is carried until it is home. On the way everyone grows hungry and thirsty: plant eaters graze, meat eaters eat what they bring down, and fresh water (rivers, lakes, swamps) waters all; pack water flasks for the dry lands, and rations for yourself.</p>`;
  const h = parseKey(selected), d = hexDist(h);
  const city = cityAt(S.world.seed, h);
  if (d === 0) return `<h3>Your nest</h3><p class="hint">Where your dinosaurs live. Every journey starts and ends here: what a team carries counts once it is home.</p>`;
  const seen = isRevealed(S, selected);
  const first = !S.world.visited.includes(selected);
  // the team: kept between hexes, always led by the player (dinosaurs never set out without you)
  const choices = unitChoices();
  team = team.filter(u => u.kind !== 'player' && choices.some(c => unitKey(c) === unitKey(u)));
  team.unshift({ kind: 'player', id: PLAYER_ID });
  const problem = exploreProblem(S, team, selected, t);
  const scout = hasScout(S, team.flatMap(membersOf));
  const blocker = team.map(u => unitProblem(u, t)).find(Boolean);
  const units = teamUnits(S, (teamFrom(S, team) || []).filter(Boolean));
  const left = choices.filter(c => !team.some(u => unitKey(u) === unitKey(c)));
  const rows = team.map((u, i) => {
    const p = unitProblem(u, t);
    return `<li class="team-unit"><span><strong>${esc(unitName(u))}</strong> <span class="hint">${esc(unitLabel(u).split(' · ').slice(1).join(' · '))}</span>${p ? ` <span class="hint warn-text">· ${esc(SHORT[p.label] || p.problem)}</span>` : ''}</span>
      ${u.kind === 'player' ? '' : `<button class="ghost" type="button" data-unit-off="${i}" aria-label="Take ${esc(unitName(u))} out of the team">×</button>`}</li>`;
  }).join('');
  const critical = problem === 'injured' && blocker && isCritical(byId(blocker.id), t);
  const why = problem && PROBLEMS[problem]
    ? (blocker && blocker.problem === problem && team.flatMap(membersOf).length > 1 ? `${esc(blocker.id === PLAYER_ID ? 'You' : byId(blocker.id).name)}: ` : '')
      + (critical ? 'Critically injured: it went down in a fight. Herbs won\'t help; a Blood Transfusion heals it at once.' : PROBLEMS[problem])
      + (problem === 'injured' && blocker ? ` Heals in ${fmt(injuredLeft(byId(blocker.id), t))}.` : '')
    : '';
  // a city: its station on the maglev, and a place to stop (fed, watered, the flasks filled)
  const members = team.flatMap(membersOf), trip = city && members.length ? trainTrip(S, members, '0,0', selected) : null;
  const ride = trip && !trip.reason ? `<p class="hint">By the maglev: ${trip.mins} min${trip.route.stops.length > 2 ? `, changing at ${esc(listNames(trip.route.stops.slice(1, -1).map(stationName)))}` : ''} · ${trip.fare} coins for this team${S.coins < trip.fare ? ` <span class="warn-text">(${trip.fare - S.coins} more needed)</span>` : ''}. Safe, and everyone is fed and watered aboard.</p>` : '';
  if (city) return `<h3>${esc(city)}</h3>
    <p class="hint">A settlement of other colonists, ${plural(d, 'hex', 'hexes')} from your nest, with a station on the maglev. Around it the land is calm, as around yours: no predator hunts there. A team that stops here is fed and watered, and its flasks filled; from here it can explore the lands around on foot.</p>
    ${ride}
    <p class="hint">On foot: ${legMins(S, members, '0,0', selected)} min, and the dangers of the way.</p>
    ${units.length ? routeHTML(units, selected, true) : ''}
    ${team.length ? suppliesHTML(members, selected) : ''}
    ${teamFieldHTML(rows, left, t)}
    <div class="row"><button class="btn" type="button" id="sendTrain" ${problem || !trip || trip.reason || S.coins < trip.fare ? 'disabled' : ''}>Take the maglev</button><button class="ghost" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Walk there</button></div>
    ${why ? `<p class="hint warn-text">${why}</p>` : ''}
    ${problem === 'injured' && blocker ? healHTML(byId(blocker.id), t) : ''}`;
  return `<h3>${esc(placeName(cellAt(S.world.seed, h)))}${seen ? '' : ' <span class="hint">· unexplored</span>'}</h3>
    <p class="hint">${plural(d, 'hex', 'hexes')} from the nest · ${legMins(S, team.flatMap(membersOf), '0,0', selected, route)} min to get there${route.length ? ' by your route' : ''}, as long again to come back${teamSlow(S, team.flatMap(membersOf)) > 1 ? ` (a giant sets a slow pace, but brings home ×${teamHaul(S, team.flatMap(membersOf))} of what it finds)` : ''}${allRunners(S, team.flatMap(membersOf)) ? ' (only Gallimimus, with you riding one: twice as fast)' : ''}${first ? ` · first visit pays ${Math.min(d, 10) * DISCOVERY_COINS_PER_HEX} coins` : ''}</p>
    ${landHTML(cellAt(S.world.seed, h))}
    ${lootHTML(selected)}
    ${threatHTML(h, units, scout)}
    ${units.length ? routeHTML(units, selected) : ''}
    ${team.length ? suppliesHTML(team.flatMap(membersOf), selected) : ''}
    ${teamFieldHTML(rows, left, t)}
    ${rivalsHTML(team.flatMap(membersOf))}
    ${S.hatched.some(b => stageOf(b).id !== 'baby') || team.length ? `<div class="row"><button class="btn" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Explore</button></div><p class="hint">You will see the way there, and can change it before the team sets off.</p>` : ''}
    ${why ? `<p class="hint warn-text">${why}</p>` : ''}
    ${problem === 'injured' && blocker ? healHTML(byId(blocker.id), t) : ''}
    ${!S.hatched.some(b => stageOf(b).id !== 'baby') ? `<p class="hint">Your dinosaurs can join once they are juveniles, after ${STAGES[1].meals} meals.</p>` : ''}`;
}

// Tracing a route: the waypoints tapped so far, and what the way would be like
function traceHTML(t) {
  const party = tracing.party && S.world.expeditions.find(e => e.id === tracing.party);
  const members = party ? party.members : team.flatMap(membersOf);
  const dest = placeName(cellAt(S.world.seed, parseKey(tracing.to)));
  const sup = party ? party.supplies || {} : null, hexes = plannedPath().length - 1;
  return `<h3>The way to the ${esc(dest)}</h3>
    <p class="hint">${plural(hexes, 'hex', 'hexes')}, numbered on the map from ${tracing.from === '0,0' ? 'the nest' : 'where the team waits'}. Drag any point of the way to another hex to go that way instead: the rest of the way is worked out again, never over the same ground twice. Tap a point you moved to put it back. Hexes ringed in blue have fresh water.</p>
    <p class="hint">${legMins(S, members, tracing.from, tracing.to, route)} min to get there.</p>
    ${(() => { const units = teamUnits(S, party ? standingUnits(S, party) : (teamFrom(S, team) || []).filter(Boolean)); return units.length ? routeHTML(units, tracing.to, !!cityAt(S.world.seed, parseKey(tracing.to)), plannedPath().slice(1)) : ''; })()}
    ${party ? (() => { const dry = dryStretch(S.world.seed, tracing.from, tracing.to, route); return dry.thirst >= SURVIVAL.at ? `<p class="hint ${dry.thirst >= SURVIVAL.faint ? 'warn-text' : ''}">The longest dry stretch: ${plural(dry.hexes, 'hex', 'hexes')} with no fresh water${sup.water ? `, with ${sup.water} ${sup.water === 1 ? 'drink' : 'drinks'} left in the flasks` : ''}.</p>` : '<p class="hint">Water all the way.</p>'; })() : members.length ? suppliesHTML(members, tracing.to) : ''}
    <div class="row"><button class="btn" type="button" id="traceGo">Set off</button>
      ${undoRoute.length ? '<button class="ghost" type="button" id="traceUndo">Undo</button>' : ''}${route.length ? '<button class="ghost" type="button" id="traceClear">Back to the easiest way</button>' : ''}
      <button class="ghost" type="button" id="traceCancel">Cancel</button></div>`;
}

// the team being put together, and who else could join it
function teamFieldHTML(rows, left, t) {
  return `<div class="field"><span class="label">Team <span class="hint">${team.length} / ${TEAM_SLOTS} places · a pack takes one</span></span>
      ${rows ? `<ul class="team-list">${rows}</ul>` : '<p class="hint">No one yet.</p>'}
      ${team.length < TEAM_SLOTS && left.length ? `<div class="row team-add"><select id="addUnit" aria-label="Add to the team">${left.map(u => {
        const p = unitProblem(u, t);
        return `<option value="${esc(unitKey(u))}">${esc(unitLabel(u))}${p ? ` · ${esc(SHORT[p.label] || p.problem)}` : ''}</option>`;
      }).join('')}</select><button class="ghost" type="button" id="addUnitBtn">Add</button></div>` : ''}
    </div>`;
}
// a team in camp: how long it has left, and breaking camp (early: nothing found)
function campHTML(p, t) {
  const done = t >= p.camp.endsAt;
  return `<div class="row">${done ? `<button class="btn small" type="button" data-break-camp="${esc(p.id)}">Break camp: see what they found</button>`
    : `<span class="hint">In camp, looking for water and food · ${fmt(p.camp.endsAt - t)} left</span><button class="ghost" type="button" data-break-camp="${esc(p.id)}">Break camp now</button>`}</div>`;
}
// what a camp found, in words
function campText(c) {
  if (c.early) return 'The team broke camp early and moved on with nothing found.';
  const fed = c.fed.map(id => (id === PLAYER_ID ? 'you' : esc((byId(id) || { name: '?' }).name)));
  return `${c.water ? 'The team found fresh water: everyone drank, and the flasks were filled.' : 'The team searched all around, but found no water.'}`
    + `${fed.length ? ` ${cap(listNames(fed))} ate${c.meat ? `, and the hunters brought down small game (${c.meat} meat carried)` : ''}.` : ' Nobody found anything to eat.'} Everyone rested.`;
}
// a station's name: the nest's, or its city's
const stationName = k => (k === '0,0' ? 'your nest' : cityAt(S.world.seed, parseKey(k)) || '?');
// the train from where a party waits (a station) home, or to the station picked on the map
function trainButtons(p) {
  if (!isStation(S.world.seed, p.at)) return '';
  const button = to => {
    const trip = trainTrip(S, p.members, p.at, to);
    if (trip.reason) return '';
    const can = S.coins >= trip.fare;
    return `<button class="ghost" type="button" data-train="${esc(p.id)}" data-hex="${esc(to)}" ${can ? '' : 'disabled'}>Maglev to ${esc(stationName(to))} <span class="hint">(${trip.mins} min · ${trip.fare} coins)</span></button>`;
  };
  const other = selected && selected !== p.at && selected !== '0,0' && isStation(S.world.seed, selected) ? button(selected) : '';
  return button('0,0') + other;
}

// the parties out: where each is, how it is, what it carries, and what can be done with it
function tripsHTML(t) {
  const list = S.world.expeditions;
  if (!list.length) return `<p class="hint">No one is out. ${EXPEDITION_SLOTS} teams can be out at the same time.</p>`;
  return `<ul class="trips">${list.map(p => {
    const names = `<strong>${esc(listNames(p.team.map(unitName)))}</strong>`;
    if (!p.leg) {
      // waiting somewhere for orders: home, or on to the hex picked on the map
      const there = selected && selected !== p.at && canReach(S, selected) ? selected : null;
      return `<li class="trip-row">
        <div>${names} <span class="hint">· waiting in the ${esc(placeName(cellAt(S.world.seed, parseKey(p.at))))}</span></div>
        ${partyStatusHTML(p)}
        ${p.camp ? campHTML(p, t) : `<div class="row">${trainButtons(p)}<button class="btn small" type="button" data-order="${esc(p.id)}" data-hex="0,0">${isStation(S.world.seed, p.at) ? 'Walk home' : 'Come home'} <span class="hint">(${legMins(S, p.members, p.at, '0,0')} min)</span></button>
        ${there ? `<button class="ghost" type="button" data-trace="${esc(p.id)}" data-hex="${esc(there)}">Go to the ${esc(placeName(cellAt(S.world.seed, parseKey(there))))}…</button>` : '<span class="hint">Pick a hex on the map to send them on.</span>'}
        ${isStation(S.world.seed, p.at) ? '' : `<button class="ghost" type="button" data-camp="${esc(p.id)}">Make camp <span class="hint">(${CAMP.mins} min: look for water and food, rest)</span></button>`}</div>`}
      </li>`;
    }
    const leg = p.leg, done = t >= leg.arriveAt;
    const where = (leg.train ? 'on the maglev ' : '') + (leg.to === '0,0' ? 'heading home' : `→ ${esc(placeName(cellAt(S.world.seed, parseKey(leg.to))))}`);
    const frac = Math.min(1, (t - leg.startedAt) / Math.max(1, leg.arriveAt - leg.startedAt));
    return `<li class="trip-row">
      <div>${names} <span class="hint">${where}${leg.recalled ? ' · called back' : ''}</span></div>
      <div class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <div class="row">${done ? `<button class="btn small" type="button" data-journey="${esc(p.id)}">${p.pending ? 'A decision awaits' : leg.to === '0,0' ? 'Back! See the journey' : 'Arrived! See the journey'}</button>`
        : `<span class="hint">${leg.to === '0,0' ? 'Home' : 'There'} in ${fmt(leg.arriveAt - t)}</span>${leg.to === '0,0' || leg.recalled || leg.train ? '' : `<button class="ghost" type="button" data-recall="${esc(p.id)}">Call back</button>`}`}</div>
    </li>`;
  }).join('')}</ul>`;
}

// the player's own hunger, and a meal from the inventory
function eatHTML(p, t) {
  if (!isHungry(p, t)) return '<p class="hint">Fed for now.</p>';
  const food = mealFor(S, null);
  return `<div class="row"><button class="btn small" type="button" data-eat ${food ? '' : 'disabled'}>Eat${food ? ` (${esc(ITEMS[food].name)})` : ''}</button>
    <span class="hint warn-text">${food ? 'You are hungry: eat before you set out.' : 'You are hungry, and have nothing to eat: buy Trail Rations in the Shop, or bring home meat or fish.'}</span></div>`;
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
      <p class="hint">${away ? 'Out exploring.' : hurt ? `Injured · heals in ${fmt(hurt)}` : 'You can explore on foot, anywhere.'}</p>
      ${away ? '' : eatHTML(p, t)}</div></div>
    ${loadHTML(p)}
    <ul class="gear-slots">${rows}</ul>
    <p class="hint">Weapons and armor are sold in the Shop and made in the Forge. They can't be changed while you're away.</p>`;
}

function render() {
  const box = document.getElementById('worldBox');
  if (!box) return;
  const t = now();
  // the map is made once and only redrawn; the side is remade
  if (!box.querySelector('#worldMap')) {
    box.innerHTML = `<div class="world-layout"><div class="world-map-wrap">${mapHTML()}</div><div class="world-side"></div></div>`;
    bindMap(box);
  }
  box.querySelector('.world-side').innerHTML = `
        <section class="panel-box" aria-live="polite">${sideHTML(t)}</section>
        <section class="panel-box you" id="youBox">${youHTML(t)}</section>
        <section class="panel-box"><h3>Expeditions <span class="hint">${S.world.expeditions.length} / ${EXPEDITION_SLOTS}</span></h3>
          <div id="tripsBox">${tripsHTML(t)}</div>
          ${message ? `<p class="hint" role="status">${message}</p>` : ''}
        </section>`;
  drawMap();
  box.querySelector('.you-art').appendChild(playerArt(S.player.equip, 110));
  const eat = box.querySelector('[data-eat]');
  if (eat) eat.addEventListener('click', () => { act('feed', { id: PLAYER_ID }); render(); });
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
  const train = document.getElementById('sendTrain');
  if (train) train.addEventListener('click', () => {
    const names = team.map(unitName), r = act('explore', { team, hex: selected, train: true });
    message = r.ok ? `${esc(listNames(names))} boarded the maglev for ${esc(stationName(selected))}.` : esc(PROBLEMS[r.reason] || 'The team could not board.');
    if (r.ok) team = [];
    render();
  });
  // tracing a route: started from the hex picked (a new team) or for a party waiting out there
  // planning the way: started from the hex picked (a new team) or for a party waiting out there
  const go = document.getElementById('traceGo');
  if (go) go.addEventListener('click', () => {
    const { to, party } = tracing, names = team.map(unitName);
    const r = party ? act('order', { id: party, hex: to, via: route }) : act('explore', { team, hex: to, via: route });
    const mins = legMins(S, party ? (S.world.expeditions.find(e => e.id === party) || { members: [] }).members : team.flatMap(membersOf), tracing.from, to, route);
    message = r.ok ? `${party ? 'The team' : esc(listNames(names))} set off. There in ${mins} min: then they wait for your orders.` : esc(PROBLEMS[r.reason] || 'The team could not go.');
    if (r.ok) { tracing = null; route = []; if (!party) team = []; }
    render();
  });
  const undo = document.getElementById('traceUndo');
  if (undo) undo.addEventListener('click', () => { route = undoRoute.pop() || []; render(); });
  const clear = document.getElementById('traceClear');
  if (clear) clear.addEventListener('click', () => { changeRoute([]); render(); });
  const cancel = document.getElementById('traceCancel');
  if (cancel) cancel.addEventListener('click', () => { tracing = null; route = []; render(); });
  const send = document.getElementById('sendTrip');
  if (send) send.addEventListener('click', () => { tracing = { to: selected, from: '0,0', party: null }; route = []; undoRoute = []; message = ''; render(); });
  bindTrips(box);
}

let shownBack = '';
// the list of parties, redrawn on its own every second so the map and the form are left alone
function bindTrips(box) {
  shownBack = backKey(now());
  box.querySelectorAll('[data-journey]').forEach(btn => btn.addEventListener('click', () => {
    const r = openJourney(btn.dataset.journey, render);
    if (!r.ok) { message = 'Not there yet.'; render(); }
  }));
  box.querySelectorAll('[data-trace]').forEach(btn => btn.addEventListener('click', () => {
    const p = S.world.expeditions.find(e => e.id === btn.dataset.trace);
    if (!p) return;
    tracing = { to: btn.dataset.hex, from: p.at, party: p.id };
    route = [];
    undoRoute = [];
    message = '';
    render();
  }));
  box.querySelectorAll('[data-camp]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('camp', { id: btn.dataset.camp });
    message = r.ok ? `The team made camp. In ${CAMP.mins} min you will see what they found.` : 'The team could not make camp here.';
    render();
  }));
  box.querySelectorAll('[data-break-camp]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('breakCamp', { id: btn.dataset.breakCamp });
    message = r.ok ? campText(r.story[0]) : 'The team could not break camp.';
    render();
  }));
  box.querySelectorAll('[data-order]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('order', { id: btn.dataset.order, hex: btn.dataset.hex });
    message = r.ok ? (btn.dataset.hex === '0,0' ? 'The team set off for home.' : 'The team set off.') : 'The team could not go there.';
    render();
  }));
  box.querySelectorAll('[data-train]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('order', { id: btn.dataset.train, hex: btn.dataset.hex, train: true });
    message = r.ok ? `The team boarded the maglev for ${esc(stationName(btn.dataset.hex))}.` : r.reason === 'coins' ? 'Not enough coins for the fare.' : 'The team could not board.';
    render();
  }));
  box.querySelectorAll('[data-recall]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('recall', { id: btn.dataset.recall });
    message = !r.ok ? 'The team could not be called back.' : r.home ? 'Called back before it got far: the team is home.' : 'Called back. The team turns for home from where it is, and the way back has its dangers too.';
    render();
  }));
}
// parties with a journey to tell
const backKey = t => S.world.expeditions.filter(e => e.leg && t >= e.leg.arriveAt).map(e => e.id).join();
function tickTrips() {
  const box = document.getElementById('tripsBox');
  if (!box || !S.world.expeditions.length || document.hidden) return;
  const t = now();
  // a trip that just came back changes the map too
  if (backKey(t) !== shownBack) { render(); return; }
  box.innerHTML = tripsHTML(t);
  bindTrips(box);
  // (the parties move on the map)
  drawMap();
}

// the timers and the "back!" badge on the tab keep moving while the page is open
function updateBadge() {
  const t = now();
  const back = S.world.expeditions.filter(e => e.leg && t >= e.leg.arriveAt).length;
  const pill = document.getElementById('worldPill');
  pill.hidden = back === 0;
  pill.textContent = back + ' to tell';
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
