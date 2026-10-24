// World tab: the map of the continent around the nest, and the parties out exploring it.
// Pick a hex, put a team together, send it; when it gets there, see the journey, then send it on or home.
import { SCOUT, FRENZY_DROPS, BIOMES, ITEMS, SEX, SPECIES, EXPEDITION_SLOTS, TEAM_SLOTS, ROCKET, MAGLEV, STAGES, HEAL_MINS, PLAYER_ID, EYES, AMBUSH, SIZE_ORDER, HAZARDS, SURVIVAL, CAMP, VIA_MAX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, countItem } from '../economy.js';
import {
  ALL_HEXES, hexKey, parseKey, hexDist, inWorld, biomeAt, cellAt, neighbors, isRevealed, canReach, teamSlow, teamHaul, allRunners, hasScout, lootTable, exploreProblem, expeditionOf, isAway,
  threatAt, isLair, injuredLeft, isCritical, explorerOf, memberProblem, teamFrom, teamUnits, keepsAway, passesBy, watery, routeRisk, sailBackOff, chaseOf, huntOdds, encounterChance,
} from '../world.js';
import { packOf } from '../packs.js';
import { legMins, progressOf, packOf as suppliesOf, dryStretch, trainTrip, rocketTrip, routePath, freshWater, standingUnits, flightBill, flightMins, stopOf, trainsAt, restLeft, rideAt } from '../journey.js';
import { isStation, upAt } from '../map.js';
import { skyAt, sunTimes, placeOf, worldTime } from '../sun.js';
import { citiesOf, cityAt } from '../world.js';
import { openJourney, partyStatusHTML } from './journey.js';
import { teamOdds, dangerOf, whoFlees } from '../combat.js';
import { playFight } from './fight.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { ITEM_ICONS } from '../art.js';
import { esc, fmt, plural, minsLabel } from '../util.js';
import { currentTab, onTabChange } from './tabs.js';
import { SIZE, SQ3, TILT, center, corners, WATER, fillOf, glyphOf, placeName, NEST, riverSVG } from './hexdraw.js';
import { GRID, fit, drawHexes, drawTiles, warmTiles, mapBounds, hexesIn, hexAt, hexPath, paint, cssVar, DETAIL_PX, onTexture, railCurve, inTunnel } from './mapcanvas.js';
import { often, chanceOf, riskOf, winOf, cap, article, listNames, healthWord, wildName } from './words.js';
import { cleanTeams } from '../teams.js';

// a sample map for the landing page: every hex up to `seen` steps revealed, one more ring of fog
export function sampleMapSVG(seed, seen = 3) {
  // (north to south, so a mountain stands in front of the hexes behind it)
  const cells = ALL_HEXES.filter(h => hexDist(h) <= seen + 1).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(h => {
    const c = center(h), d = hexDist(h), cell = cellAt(seed, h);
    const fog = d > seen;
    return `<g class="hex ${fog ? 'fog' : 'seen'}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})">
      <polygon points="${corners([0, 0], 1.01)}" ${fog ? '' : `style="fill:${fillOf(cell)}"`}/>${d === 0 ? NEST : fog ? '<text class="q" y="5">?</text>' : riverSVG(seed, h) + glyphOf(cell, h, upAt(seed, h))}</g>`;
  }).join('');
  // (the ground seen at a slant, TILT as deep; room above for the mountains of its top row)
  const r = SIZE * SQ3 * (seen + 1.6), top = r * 0.92 * TILT + SIZE * 1.4;
  return `<svg class="world-map" viewBox="${-r} ${(-top).toFixed(1)} ${r * 2} ${(top + r * 0.92 * TILT).toFixed(1)}" aria-hidden="true">${cells}</svg>`;
}

const PROBLEMS = {
  'too-young': 'Babies stay in the nest. Feed it until it is a juvenile.',
  away: 'Already exploring.',
  city: 'A settlement of other colonists. Its people keep to themselves, for now.',
  breeding: 'Busy nesting with its partner.',
  starved: 'You are too hungry to set out. Eat something first (in the Nest).',
  report: 'Back home by air: see the journey report first.',
  coins: 'Not enough coins for the fare.',
  'no-line': 'No maglev line goes there.',
  'train-gone': 'The doors closed on that maglev: it left without you. Pick the next one.',
  'no-slot': `Only ${EXPEDITION_SLOTS} teams can be out at the same time.`,
  unreachable: 'Too deep in the fog. Explore the hexes next to it first.',
  home: 'This is your nest.',
  water: 'Open water: no one can go there.',
  injured: 'Injured. It heals with time, or sooner with a Healing Herb.',
  'no-team': 'Add someone to the team first.',
  'no-player': 'Your dinosaurs never explore without you: on their own they only ride between stations.',
  'baby-fly': 'Babies can\'t fly: send them by maglev.',
  'cant-fly': 'Too big or too long in the neck to fly: send it by maglev.',
  'too-heavy': `Too heavy for one rocket (${ROCKET.load / 1000} t at most).`,
  resting: 'Resting after a rocket flight.',
  'not-together': 'They are not at the same station.',
  'on-the-way': 'On its way.',
  'no-station': 'There is no station there.',
  there: 'Already there.',
  'team-full': `A team has at most ${TEAM_SLOTS} places.`,
  twice: 'Someone is in the team twice.',
  missing: 'Someone in the team is gone.',
};
const LAIR = '<g class="lair" transform="translate(-13 -15)"><circle r="7" fill="#3b2a24"/><path d="M-3.5 -2 l1.6 4 M0 -3 l0 5 M3.5 -2 l-1.6 4" stroke="#f3ead2" stroke-width="1.6" stroke-linecap="round"/></g>';

let selected = null, message = '', tick = null, walkTick = null;
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
let goWith = -1;   // the team (a preset of the Team tab) going with the player, or -1: the player alone
const isMe = b => b && b.id === PLAYER_ID;
const name = b => isMe(b) ? b.name : `${b.name} ${SEX[sexOf(b)].sym}`;
const byId = id => explorerOf(S, id);
const itemName = (id, n) => n === 1 ? ITEMS[id].name : ITEMS[id].plural;
const packById = id => (S.packs || []).find(p => p.id === id);
// a team unit's name, as on its row
function unitName(u) {
  if (u.kind === 'player') return 'You';
  if (u.kind === 'pack') { const p = packById(u.id); return p ? p.name : 'A pack'; }
  const b = byId(u.id);
  return b ? name(b) : '?';
}
const membersOf = u => u.kind === 'pack' ? (packById(u.id) || { members: [] }).members : [u.kind === 'player' ? PLAYER_ID : u.id];

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
const SHORT = { report: 'report to read', away: 'away', injured: 'injured', critical: 'critically injured', starved: 'hungry', breeding: 'nesting', 'too-young': 'too young' };

// the map's view (in map units), kept while the player looks around; first framed on the nest
let view = null;
// (zoomed all the way out, the whole continent)
// (zoomed all the way out, as much of the continent as fits the map's frame: never beyond its edges)
const VIEW_W = SIZE * SQ3 * 14, VIEW_MIN = SIZE * SQ3 * 5, VIEW_MAX = mapBounds().w;
// the map as drawn: a canvas, the zoom buttons, the legend; a line read out for the hex the keyboard is on
function mapHTML() {
  return `<canvas class="world-map" id="worldMap" tabindex="0" role="application" aria-label="World map. Drag to look around, arrow keys to move between hexes, Enter to pick one, plus and minus to zoom." aria-describedby="mapFocus"></canvas><canvas class="world-trains" id="worldTrains" aria-hidden="true"></canvas>
    <p class="sr-only" id="mapFocus" aria-live="polite"></p>
    <div class="map-tools"><button class="ghost" type="button" data-zoom="in" aria-label="Zoom in">+</button><button class="ghost" type="button" data-zoom="out" aria-label="Zoom out">−</button><button class="ghost" type="button" data-zoom="home">Nest</button></div>
    <details class="legend-fold"><summary>Map legend</summary><p class="hint map-legend"><span class="unknown-key">Not yet explored</span><span style="--c:${WATER.ocean}">Sea</span><span style="--c:${WATER.lake}">Lake</span>${Object.values(BIOMES).map(b => `<span style="--c:${b.color}">${esc(b.name)}</span>`).join('')} · hills and mountains slow a trip, a river takes crossing, water can't be crossed</p></details>`;
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
  const m = mapBounds(), b = { x: m.x + SIZE * SQ3, y: m.y, w: m.w - SIZE * SQ3 * 2, h: m.h - SIZE * TILT };
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
let mapCanvas = null, frame = 0, lastFit = null, hover = null, focusKey = null, warmed = '', goal = null;
// (and again when a picture of the ground has come)
onTexture(() => drawMap());
function drawMap() {
  if (!mapCanvas || frame) return;
  frame = requestAnimationFrame(() => { frame = 0; paintMap(); });
}
// Night over the map, as it is right now (sun.js): darker where the sun is down, a small picture of it
// (a pixel every BAND hexes, made again each minute) stretched smoothly over the whole map, so the dusk
// sweeps across it from east to west
const NIGHT_SHADE = 0.5, BAND = 3;
let shade = null;
function nightPicture(t) {
  const minute = Math.floor(t / 60000), b = mapBounds();
  if (shade && shade.minute === minute) return shade;
  const w = Math.ceil(b.w / (SIZE * SQ3 * BAND)), h = Math.ceil(b.h / (SIZE * 1.5 * TILT * BAND));
  const c = shade ? shade.canvas : document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const hex = hexAt(b.x + (i + 0.5) / w * b.w, b.y + (j + 0.5) / h * b.h);
    const k = (j * w + i) * 4;
    img.data[k] = 8; img.data[k + 1] = 16; img.data[k + 2] = 44;
    img.data[k + 3] = Math.round(skyAt(t, placeOf(hex)).dark * NIGHT_SHADE * 255);
  }
  g.putImageData(img, 0, 0);
  return (shade = { minute, canvas: c });
}
function shadeNight(ctx, f, x1, y1, t) {
  const b = mapBounds(), pic = nightPicture(t);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(pic.canvas, b.x, b.y, b.w, b.h);
  ctx.restore();
}

// The maglev's trains, on a canvas of their own over the map, drawn every frame where the timetable
// puts them that moment, so they glide (the map under them is drawn only when it changes); once the
// map is close enough to see them. Drawn again only as often as a train moves a third of a pixel on
// screen (often close up, seldom from afar), or when the map has moved
let trainCanvas = null, trainsDrawn = { at: 0, fit: null };
function paintTrains() {
  requestAnimationFrame(paintTrains);
  const c = trainCanvas, f = lastFit;
  if (!c || !c.isConnected || !f || document.hidden || currentTab() !== 'world') return;
  // (a train runs a hex in about MAGLEV.minsPerHex minutes)
  const pxPerMs = SIZE * SQ3 * f.scale / (MAGLEV.minsPerHex * 60000), t = performance.now();
  if (trainsDrawn.fit === f && t - trainsDrawn.at < Math.min(1000, 0.33 / pxPerMs)) return;
  trainsDrawn = { at: t, fit: f };
  // (laid exactly over the map, wherever the page puts it)
  const m = mapCanvas, place = `${m.offsetLeft}px|${m.offsetTop}px|${f.width}px|${f.height}px`;
  if (c.dataset.place !== place) { c.dataset.place = place; [c.style.left, c.style.top, c.style.width, c.style.height] = place.split('|'); }
  const w = Math.round(f.width * f.dpr), h = Math.round(f.height * f.dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d'), scale = f.scale, px = n => n / scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(f.dpr * scale, 0, 0, f.dpr * scale, -f.x0 * f.dpr * scale, -f.y0 * f.dpr * scale);
  const seed = S.world.seed, x1 = f.x0 + f.width / scale, y1 = f.y0 + f.height / scale, r = Math.max(SIZE * 0.22, px(3));
  // (the parties riding: aboard a train, which shows in their colour, or waiting on a platform)
  const at = now(), accent = cssVar('--accent'), riding = new Map(), placed = [];
  for (const e of S.world.expeditions) {
    if (!e.leg || !e.leg.train || at >= e.leg.arriveAt) continue;
    const ride = rideAt(S, e.leg, at);
    if (ride && ride.train) riding.set(ride.train, e);
    else if (ride && ride.at) { const [x, y] = center(parseKey(ride.at)); placed.push([e, x, y]); }
  }
  // (the trains only once the map is close enough to see them; a party aboard shows from anywhere)
  const seen = SIZE * scale >= 3;
  ctx.lineWidth = Math.max(1, px(1));
  ctx.strokeStyle = '#2b3138';
  for (const tr of trainsAt(S, at)) {
    const mine = riding.get(tr.id);
    if (!seen && !mine) continue;
    // (along the line's smooth curve; under a mountain, in its tunnel, unseen)
    const pts = railCurve(tr.path), [ax, ay] = pts[tr.i], [bx, by] = pts[tr.i + 1];
    const x = ax + (bx - ax) * tr.f, y = ay + (by - ay) * tr.f;
    if (mine) placed.push([mine, x, y]);
    if (!seen || (inTunnel(seed, tr.path[tr.i]) && inTunnel(seed, tr.path[tr.i + 1]))) continue;
    if (x < f.x0 - r * 4 || x > x1 + r * 4 || y < f.y0 - r * 4 || y > y1 + r * 4) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(by - ay, bx - ax));
    ctx.fillStyle = mine ? accent : '#e8edf2';
    ctx.beginPath();
    ctx.roundRect(-r * 1.8, -r * 0.55, r * 3.6, r * 1.1, r * 0.55);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const [e, x, y] of placed) partyBubble(ctx, e, x, y, px, accent);
}

function paintMap() {
  if (!mapCanvas || !mapCanvas.isConnected) return;
  const w = S.world, t = now();
  if (!view) view = homeView();
  // (a zoom gliding: the view a part of the way to where it is going, and on again next frame)
  if (goal) {
    const r = goal.w / view.w, gw = Math.abs(Math.log(r)) < 0.003 ? goal.w : view.w * Math.pow(r, 0.3), gh = view.h * gw / view.w;
    view = { x: goal.cx - goal.fx * gw, y: goal.cy - goal.fy * gh, w: gw, h: gh };
    if (gw === goal.w) goal = null; else drawMap();
  }
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
  shadeNight(ctx, f, x1, y1, t);
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
  // each party's way: walked so far (solid), still ahead (dashed), to where it is by now
  for (const e of w.expeditions) {
    if (!e.leg) continue;
    const g = progressOf(S, e, t), pts = [e.leg.from, ...e.leg.path].map(k => center(parseKey(k)));
    const k = g.i + 1, [ax, ay] = pts[k], [bx, by] = pts[Math.min(k + 1, pts.length - 1)];
    const here = [ax + (bx - ax) * g.f, ay + (by - ay) * g.f];
    const line = (list, dash, color, width) => {
      if (list.length < 2) return;
      ctx.save();
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.setLineDash(dash.map(px));
      ctx.lineWidth = Math.max(2, px(width));
      ctx.strokeStyle = color;
      ctx.beginPath();
      list.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
    };
    line([...pts.slice(0, k + 1), here], [], accent, 3.5);
    line([here, ...pts.slice(k + 1)], [2, 6], 'rgba(255, 246, 220, .85)', 3);
    // (where it is, on the way itself)
    ctx.beginPath();
    ctx.arc(here[0], here[1], Math.max(3, px(3.5)), 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  // where each party is by now: waiting somewhere, or along its way
  for (const e of w.expeditions) {
    // (riding the maglev: drawn with its train, every frame, by paintTrains)
    if (e.leg && e.leg.train && t < e.leg.arriveAt) continue;
    // (on its way: between the last hex reached and the next, as far as the time says)
    const g = e.leg ? progressOf(S, e, t) : null;
    const hexOf = i => center(parseKey(i < 0 ? e.leg.from : e.leg.path[i]));
    let [x, y] = center(parseKey(e.leg ? (g.i < 0 ? e.leg.from : e.leg.path[g.i]) : e.at));
    if (g && g.f > 0 && g.i + 1 < e.leg.path.length) { const [nx, ny] = hexOf(g.i + 1); x += (nx - x) * g.f; y += (ny - y) * g.f; }
    partyBubble(ctx, e, x, y, px, e.leg && t >= e.leg.arriveAt ? heart : accent);
  }
}
// a party's marker: a disc by where it is, with how many go (or the one's initial)
function partyBubble(ctx, e, x, y, px, fill) {
  const r = Math.max(8, px(7)), cx = x + Math.max(12, px(9)), cy = y - Math.max(12, px(9));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = r / 4;
  ctx.strokeStyle = cssVar('--panel');
  ctx.stroke();
  ctx.fillStyle = cssVar('--accent-ink');
  ctx.font = `700 ${(r * 1.25).toFixed(1)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.team.length > 1 ? String(e.team.length) : (unitName(e.team[0])[0] || '?'), cx, cy + r * 0.08);
}

// drag to look around, the wheel or two fingers to zoom; a press that doesn't move is a tap on a hex;
// the arrow keys move between hexes and Enter picks one
let dragged = false, grab = null;
function bindMap(box) {
  const canvas = mapCanvas = box.querySelector('#worldMap');
  if (!trainCanvas) requestAnimationFrame(paintTrains);
  trainCanvas = box.querySelector('#worldTrains');
  // Zooming glides: each step sets where the zoom is going (goal: the width it ends at, and the point
  // of the map that stays put under the pointer, where on the screen it is), and every frame the view
  // goes a part of the way there
  const zoom = (k, cx = view.x + view.w / 2, cy = view.y + view.h / 2) => {
    const from = goal ? goal.w : view.w, w = Math.min(VIEW_MAX, Math.max(VIEW_MIN, from * k));
    goal = { w, cx, cy, fx: (cx - view.x) / view.w, fy: (cy - view.y) / view.h };
    drawMap();
  };
  // (a pinch follows the fingers at once)
  const zoomNow = (k, cx = view.x + view.w / 2, cy = view.y + view.h / 2) => {
    goal = null;
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
      if (d > 0) zoomNow(pinch.w / (view.w * d / pinch.d));
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
    goal = null;
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
      if (x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h) { goal = null; view = { ...view, x: x - view.w / 2, y: y - view.h / 2 }; }
      say();
      drawMap();
    } else if ((e.key === 'Enter' || e.key === ' ') && focusKey) { e.preventDefault(); pick(focusKey); }
    else if (e.key === '+' || e.key === '=') zoom(1 / 1.3);
    else if (e.key === '-') zoom(1.3);
  });
  box.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.zoom === 'home') { goal = null; view = homeView(); drawMap(); }
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
// the time of day there, and when the light turns: its own sun time, the same for every player
const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const PHASE_WORD = { day: 'day', dawn: 'dawn', dusk: 'dusk', night: 'night' };
function timeHTML(h, t) {
  const place = placeOf(h), sky = skyAt(t, place), at = x => clockFmt.format(new Date(worldTime(x, place.lon)));
  const local = at(t);
  const times = sunTimes(t, place), next = sky.phase === 'day' || sky.phase === 'dusk' ? times && times.set : times && (t < times.rise ? times.rise : sunTimes(t + 86400000, place).rise);
  const turn = next && next > t ? `; ${sky.phase === 'day' || sky.phase === 'dusk' ? 'sunset' : 'sunrise'} at ${at(next)}` : '';
  const night = sky.phase === 'night' ? ' Most animals are asleep, night hunters are out, and a team is harder to see in the dark.' : '';
  return `<p class="hint">It is ${local} there, ${PHASE_WORD[sky.phase]}${turn}.${night}</p>`;
}

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
  if (!selected) return `<div class="sec-head"><h3>Pick a hex</h3><details class="info"><summary aria-label="How exploring works">?</summary><p>Tap any hex of land to explore it, however far; drag the map to look around. The paler hexes are unexplored: what lives there is unknown, and the far lands are dangerous. You always go, with one of the teams you set up in the Team tab: up to ${TEAM_SLOTS - 1} juvenile or adult dinosaurs, or packs. Farther hexes, and rough ground on the way, take longer. What lives out there is young or old, in its prime or past it: the stronger it is, the more it brings, sometimes an egg. A team waits where it went for your orders: on to another hex, or home, and the way back has its dangers too. What it finds is carried until it is home. On the way everyone grows hungry and thirsty: plant eaters graze, meat eaters eat what they bring down, and fresh water (rivers, lakes, swamps) waters all; pack water flasks for the dry lands, and rations for yourself.</p></details></div>
    <p class="hint">Tap a hex on the map to see what is there and set out.</p>`;
  const h = parseKey(selected), d = hexDist(h);
  const city = cityAt(S.world.seed, h);
  // you are out with a team: it goes on from where it is, no need to come home first
  const mine = S.world.expeditions.find(e => e.members.includes(PLAYER_ID));
  if (mine) return goOnHTML(mine, h, d, t) + (city ? aheadHTML(t) : '');
  if (d === 0) return `<h3>Your nest</h3><p class="hint">Where your dinosaurs live. Every journey starts and ends here: what a team carries counts once it is home.</p>`;
  const seen = isRevealed(S, selected);
  const first = !S.world.visited.includes(selected);
  // the team: the player, with one of the teams set up in the Team tab (dinosaurs never set out without you)
  const presets = cleanTeams(S);
  if (goWith >= 0 && !(presets[goWith] && presets[goWith].slots.some(Boolean))) goWith = -1;
  team = [{ kind: 'player', id: PLAYER_ID }, ...(goWith >= 0 ? presets[goWith].slots.filter(Boolean) : [])];
  const problem = exploreProblem(S, team, selected, t);
  const scout = hasScout(S, team.flatMap(membersOf));
  const blocker = team.map(u => unitProblem(u, t)).find(Boolean);
  const units = teamUnits(S, (teamFrom(S, team) || []).filter(Boolean));
  const rows = team.map((u, i) => {
    const p = unitProblem(u, t);
    return `<li class="team-unit"><span><strong>${esc(unitName(u))}</strong> <span class="hint">${esc(unitLabel(u).split(' · ').slice(1).join(' · '))}</span>${p ? ` <span class="hint warn-text">· ${esc(SHORT[p.label] || p.problem)}</span>` : ''}</span>
</li>`;
  }).join('');
  const critical = problem === 'injured' && blocker && isCritical(byId(blocker.id), t);
  const why = problem && PROBLEMS[problem]
    ? (blocker && blocker.problem === problem && team.flatMap(membersOf).length > 1 ? `${esc(blocker.id === PLAYER_ID ? 'You' : byId(blocker.id).name)}: ` : '')
      + (critical ? 'Critically injured: it went down in a fight. Herbs won\'t help; a Blood Transfusion heals it at once.' : PROBLEMS[problem])
      + (problem === 'injured' && blocker ? ` Heals in ${fmt(injuredLeft(byId(blocker.id), t))}.` : '')
    : '';
  // a city: its station on the maglev, and a place to stop (fed, watered, the flasks filled)
  const members = team.flatMap(membersOf), trip = city && members.length ? trainTrip(S, members, '0,0', selected, t) : null;
  const fly = city && members.length ? rocketTrip(S, members, '0,0', selected, t) : null;
  const ride = trip && !trip.reason ? `<p class="hint">By the maglev: ${departs(trip.departAt, t)}, then ${trip.mins} min${trip.route.stops.length > 2 ? `, changing at ${esc(listNames(trip.route.stops.slice(1, -1).map(stationName)))}` : ''} · ${trip.fare} coins for this team${S.coins < trip.fare ? ` <span class="warn-text">(${trip.fare - S.coins} more needed)</span>` : ''}. Safe, and everyone is fed and watered aboard.</p>` : '';
  if (city) return `<h3>${esc(city)}</h3>
    <p class="hint">A settlement of other colonists, ${plural(d, 'hex', 'hexes')} from your nest, with a station on the maglev. Around it the land is calm, as around yours: no predator hunts there. A team that stops here is fed and watered, and its flasks filled; from here it can explore the lands around on foot.</p>
    ${ride}
    <p class="hint">On foot: ${legMins(S, members, '0,0', selected)} min, and the dangers of the way.</p>
    ${units.length ? routeHTML(units, selected, true) : ''}
    ${team.length ? suppliesHTML(members, selected) : ''}
    ${teamFieldHTML(rows)}
    <div class="row"><button class="btn" type="button" id="sendTrain" ${trip && !trip.reason ? `data-depart="${trip.departAt}"` : ''} ${problem || !trip || trip.reason || S.coins < trip.fare ? 'disabled' : ''}>Take the maglev</button>${fly && !fly.reason ? `<button class="btn" type="button" id="sendRocket" ${problem || S.coins < fly.fare ? 'disabled' : ''}>Take a rocket <span class="hint">(${departs(fly.departAt, t, false)}, ${fly.mins} min · ${fly.fare} coins)</span></button>` : ''}<button class="ghost" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Walk there</button></div>
    ${fly && fly.reason && PROBLEMS[fly.reason] ? `<p class="hint">No rocket for this team: ${esc(PROBLEMS[fly.reason])}</p>` : ''}
    ${why ? `<p class="hint warn-text">${why}</p>` : ''}
    ${problem === 'injured' && blocker ? healHTML(byId(blocker.id), t) : ''}
    ${aheadHTML(t)}`;
  return `<h3>${esc(placeName(cellAt(S.world.seed, h)))}${seen ? '' : ' <span class="hint">· unexplored</span>'}</h3>
    <p class="hint">${plural(d, 'hex', 'hexes')} from the nest · ${legMins(S, team.flatMap(membersOf), '0,0', selected, route)} min to get there${route.length ? ' by your route' : ''}, as long again to come back${teamSlow(S, team.flatMap(membersOf)) > 1 ? ` (a giant sets a slow pace, but brings home ×${teamHaul(S, team.flatMap(membersOf))} of what it finds)` : ''}${allRunners(S, team.flatMap(membersOf)) ? ' (only Gallimimus, with you riding one: twice as fast)' : ''}${first ? ' · never visited' : ''}</p>
    ${landHTML(cellAt(S.world.seed, h))}${timeHTML(h, t)}
    ${lootHTML(selected)}
    ${threatHTML(h, units, scout)}
    ${units.length ? routeHTML(units, selected) : ''}
    ${team.length ? suppliesHTML(team.flatMap(membersOf), selected) : ''}
    ${teamFieldHTML(rows)}
    ${rivalsHTML(team.flatMap(membersOf))}
    ${S.hatched.some(b => stageOf(b).id !== 'baby') || team.length ? `<div class="row"><button class="btn" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Explore</button></div><p class="hint">You will see the way there, and can change it before the team sets off.</p>` : ''}
    ${why ? `<p class="hint warn-text">${why}</p>` : ''}
    ${problem === 'injured' && blocker ? healHTML(byId(blocker.id), t) : ''}
    ${!S.hatched.some(b => stageOf(b).id !== 'baby') ? `<p class="hint">Your dinosaurs can join once they are juveniles, once growth capsules have raised them past babyhood.</p>` : ''}`;
}

// Dinosaurs sent ahead to a city without you, from the nest: any of those at home, babies too (by
// maglev only); they wait there in the city's stables
let ahead = [];
function aheadHTML(t) {
  const home = S.hatched.filter(b => !isAway(S, b.id));
  if (!home.length) return '';
  ahead = ahead.filter(id => home.some(b => b.id === id));
  const team = ahead.map(id => ({ kind: 'dino', id }));
  const trip = team.length ? trainTrip(S, ahead, '0,0', selected, t) : null, fly = team.length ? rocketTrip(S, ahead, '0,0', selected, t) : null;
  const why = team.length ? exploreProblem(S, team, selected, t, 'maglev') : null;
  return `<details class="ahead"${ahead.length ? ' open' : ''}><summary>Send dinosaurs ahead, without you</summary>
    <p class="hint">They ride on their own and wait here in the city's stables, fed and watered, until you come for them or send them on.</p>
    <ul class="ahead-list">${home.map(b => `<li><label><input type="checkbox" data-ahead="${esc(b.id)}"${ahead.includes(b.id) ? ' checked' : ''}> ${esc(b.name)} <span class="hint">${esc(SPECIES[b.type].species)} · ${esc(stageOf(b).id)}</span></label></li>`).join('')}</ul>
    ${team.length ? `<div class="row"><button class="btn small" type="button" id="aheadTrain" ${trip && !trip.reason ? `data-depart="${trip.departAt}"` : ''} ${why || !trip || trip.reason || S.coins < trip.fare ? 'disabled' : ''}>By maglev <span class="hint">(${trip && !trip.reason ? `${departs(trip.departAt, t)}, ${trip.mins} min · ${trip.fare} coins` : '—'})</span></button><button class="btn small" type="button" id="aheadRocket" ${why || !fly || fly.reason || S.coins < fly.fare ? 'disabled' : ''}>By rocket <span class="hint">(${fly && !fly.reason ? `${departs(fly.departAt, t, false)}, ${fly.mins} min · ${fly.fare} coins` : esc(PROBLEMS[fly.reason] || '—')})</span></button></div>` : ''}
    ${why && PROBLEMS[why] ? `<p class="hint warn-text">${esc(PROBLEMS[why])}</p>` : ''}
  </details>`;
}

// The hex picked while you are out with a team: it goes there from where it waits (or once it gets
// there, if it is on its way), home included
function goOnHTML(p, h, d, t) {
  const title = d === 0 ? 'Your nest' : esc(placeName(cellAt(S.world.seed, h)));
  const here = selected === p.at;
  const where = esc(placeName(cellAt(S.world.seed, parseKey(p.at))));
  if (p.leg) return `<h3>${title}</h3><p class="hint">Your team is on its way ${p.leg.to === '0,0' ? 'home' : `to the ${esc(placeName(cellAt(S.world.seed, parseKey(p.leg.to))))}`}. Once it gets there, it can go on to any hex from where it is.</p>`;
  if (here) return `<h3>${title}</h3><p class="hint">Your team is here, waiting for your orders.</p>`;
  if (p.camp) return `<h3>${title}</h3><p class="hint">Your team is in camp in the ${where}. Break camp to go on.</p>`;
  if (!canReach(S, selected)) return `<h3>${title}</h3><p class="hint">${PROBLEMS.unreachable}</p>`;
  const units = teamUnits(S, standingUnits(S, p)), path = routePath(S.world.seed, p.at, selected, []);
  const seen = d === 0 || isRevealed(S, selected), first = d > 0 && !S.world.visited.includes(selected);
  return `<h3>${title}${seen ? '' : ' <span class="hint">· unexplored</span>'}</h3>
    <p class="hint">From the ${where}, where your team waits: ${legMins(S, p.members, p.at, selected)} min${d === 0 ? '' : ` · ${plural(d, 'hex', 'hexes')} from the nest`}${first ? ' · never visited' : ''}</p>
    ${d === 0 ? '' : `${landHTML(cellAt(S.world.seed, h))}${timeHTML(h, t)}${lootHTML(selected)}${threatHTML(h, units, hasScout(S, p.members))}`}
    ${units.length ? routeHTML(units, selected, d === 0, path) : ''}
    <div class="row"><button class="btn" type="button" data-trace="${esc(p.id)}" data-hex="${esc(selected)}">${d === 0 ? 'Head home' : 'Explore'}</button></div>
    <p class="hint">You will see the way there, and can change it before the team sets off.</p>`;
}

// Tracing a route: the waypoints tapped so far, and what the way would be like
function traceHTML(t) {
  const party = tracing.party && S.world.expeditions.find(e => e.id === tracing.party);
  const members = party ? party.members : team.flatMap(membersOf);
  const home = tracing.to === '0,0', dest = placeName(cellAt(S.world.seed, parseKey(tracing.to)));
  const sup = party ? party.supplies || {} : null, hexes = plannedPath().length - 1;
  // (home is where it goes: only the way there can change)
  return `<h3>${home ? 'The way home' : `The way to the ${esc(dest)}`}</h3>
    <p class="hint">${plural(hexes, 'hex', 'hexes')}, numbered on the map from ${tracing.from === '0,0' ? 'the nest' : 'where the team waits'}. Drag any point of the way to another hex to go that way instead: the rest of the way is worked out again, never over the same ground twice. Tap a point you moved to put it back. Hexes ringed in blue have fresh water.</p>
    <p class="hint">${legMins(S, members, tracing.from, tracing.to, route)} min to get there.</p>
    ${(() => { const units = teamUnits(S, party ? standingUnits(S, party) : (teamFrom(S, team) || []).filter(Boolean)); return units.length ? routeHTML(units, tracing.to, !!cityAt(S.world.seed, parseKey(tracing.to)), plannedPath().slice(1)) : ''; })()}
    ${party ? (() => { const dry = dryStretch(S.world.seed, tracing.from, tracing.to, route); return dry.thirst >= SURVIVAL.at ? `<p class="hint ${dry.thirst >= SURVIVAL.faint ? 'warn-text' : ''}">The longest dry stretch: ${plural(dry.hexes, 'hex', 'hexes')} with no fresh water${sup.water ? `, with ${sup.water} ${sup.water === 1 ? 'drink' : 'drinks'} left in the flasks` : ''}.</p>` : '<p class="hint">Water all the way.</p>'; })() : members.length ? suppliesHTML(members, tracing.to) : ''}
    <div class="row"><button class="btn" type="button" id="traceGo">Set off</button>
      ${undoRoute.length ? '<button class="ghost" type="button" id="traceUndo">Undo</button>' : ''}${route.length ? '<button class="ghost" type="button" id="traceClear">Back to the easiest way</button>' : ''}
      <button class="ghost" type="button" id="traceCancel">Cancel</button></div>`;
}

// who goes: the player, with one of the teams set up in the Team tab
function teamFieldHTML(rows) {
  const ready = cleanTeams(S).map((x, i) => ({ ...x, i, n: x.slots.filter(Boolean).length })).filter(x => x.n);
  const pick = (i, label) => `<button class="${goWith === i ? 'btn' : 'ghost'}" type="button" data-go-with="${i}" aria-pressed="${goWith === i}">${label}</button>`;
  return `<div class="field"><span class="label">Who goes with you</span>
      <div class="team-preset-use">${pick(-1, 'No one')}${ready.map(x => pick(x.i, `${esc(x.name)} <span class="hint">${x.n}</span>`)).join('')}</div>
      ${ready.length ? '' : '<p class="hint">Set up a team in the Team tab to take your dinosaurs along.</p>'}
      <ul class="team-list">${rows}</ul>
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
  if (c.early) return 'You broke camp early and moved on with nothing found.';
  const fed = c.fed.map(id => (id === PLAYER_ID ? 'you' : esc((byId(id) || { name: '?' }).name)));
  return `${c.water ? 'You found fresh water: everyone drank, and the flasks were filled.' : 'You searched all around, but found no water.'}`
    + `${fed.length ? ` ${cap(listNames(fed))} ate${c.meat ? `, and the hunters brought down small game (${c.meat} meat carried)` : ''}.` : ' Nobody found anything to eat.'} Everyone rested.`;
}
// a station's name: the nest's, or its city's
const stationName = k => (k === '0,0' ? 'your nest' : cityAt(S.world.seed, parseKey(k)) || '?');
// the train from where a party waits (a station) home, or to the station picked on the map
function trainButtons(p) {
  if (!isStation(S.world.seed, p.at)) return '';
  const t = now();
  const button = to => {
    if (to === p.at) return '';
    const trip = trainTrip(S, p.members, p.at, to, t), fly = rocketTrip(S, p.members, p.at, to, t);
    const maglev = trip.reason ? '' : `<button class="ghost" type="button" data-train="${esc(p.id)}" data-hex="${esc(to)}" data-depart="${trip.departAt}" ${S.coins >= trip.fare ? '' : 'disabled'}>Maglev to ${esc(stationName(to))} <span class="hint">(${departs(trip.departAt, t)}, ${trip.mins} min · ${trip.fare} coins)</span></button>`;
    const rocket = fly.reason ? '' : `<button class="ghost" type="button" data-rocket="${esc(p.id)}" data-hex="${esc(to)}" ${S.coins >= fly.fare ? '' : 'disabled'}>Rocket to ${esc(stationName(to))} <span class="hint">(${departs(fly.departAt, t, false)}, ${fly.mins} min · ${fly.fare} coins)</span></button>`;
    return maglev + rocket;
  };
  const other = selected && selected !== p.at && selected !== '0,0' && isStation(S.world.seed, selected) ? button(selected) : '';
  // (others of yours waiting at the same station can join this party)
  const join = S.world.expeditions.filter(q => q !== p && !q.leg && !q.camp && q.at === p.at).map(q => `<button class="ghost" type="button" data-join="${esc(q.id)}" data-into="${esc(p.id)}">Join ${esc(listNames(q.team.map(unitName)))} to this team</button>`).join('');
  return button('0,0') + other + join;
}
// when the next train or rocket leaves
// (a train's doors close MAGLEV.board seconds before it leaves)
const departsText = (at, t, doors = true) => (doors && at - t < 60000 ? `boarding, doors close in ${Math.max(0, Math.ceil((at - t) / 1000 - MAGLEV.board))} s` : `leaves in ${fmt(at - t)}`);
// (kept counting down, second by second: doorsClosed)
const departs = (at, t, doors = true) => `<span class="departs" data-at="${at}"${doors ? '' : ' data-open'}>${departsText(at, t, doors)}</span>`;
// When the doors close on a train someone was choosing (a ride button showing it), the choice is
// closed: the dinosaurs picked to send ahead are put back, and the panel shows the next train instead
function doorsClosed() {
  if (currentTab() !== 'world' || document.hidden) return;
  const t = now(), shown = [...document.querySelectorAll('#panelWorld [data-depart]')].map(b => +b.dataset.depart);
  const gone = shown.filter(d => d - t <= MAGLEV.board * 1000);
  if (!gone.length) { document.querySelectorAll('#panelWorld .departs').forEach(el => { el.textContent = departsText(+el.dataset.at, t, !('open' in el.dataset)); }); return; }
  ahead = [];
  message = 'The doors closed on that maglev: it leaves without you. Pick the next one below.';
  render();
}

// the parties out: where each is, how it is, what it carries, and what can be done with it
// An aircraft home for the whole team, from where it is now: the fit's share paid then, the badly hurt
// billed; none on the maglev, once called, or with a journey still to tell
function flyButton(p, t) {
  const leg = p.leg;
  if (leg && (leg.train || leg.rocket || leg.air || leg.fly != null || t >= leg.arriveAt)) return '';
  const at = !leg ? p.at : (pr => (pr && pr.i >= 0 ? leg.path[pr.i] : leg.from))(progressOf(S, p, t));
  if (at === '0,0') return '';
  const c = flightBill(S, p, at);
  return `<button class="ghost" type="button" data-fly="${esc(p.id)}" ${S.coins < c.now ? 'disabled' : ''}>Call an aircraft home <span class="hint">(${plural(c.now, 'coin', 'coins')}${c.later ? `, ${c.later} billed for the badly hurt` : ''}; ${minsLabel(flightMins(at))})</span></button>`;
}

function tripsHTML(t) {
  const list = S.world.expeditions;
  if (!list.length) return `<p class="hint">No one is out. ${EXPEDITION_SLOTS} teams can be out at the same time.</p>`;
  return `<ul class="trips">${list.map(p => {
    const names = `<strong>${esc(listNames(p.team.map(unitName)))}</strong>`;
    if (!p.leg) {
      // waiting somewhere for orders: home, or on to the hex picked on the map (its panel's Explore)
      return `<li class="trip-row">
        <div>${names} <span class="hint">· waiting in the ${esc(placeName(cellAt(S.world.seed, parseKey(p.at))))}</span></div>
        ${partyStatusHTML(p)}
        ${p.camp ? campHTML(p, t) : !p.members.includes(PLAYER_ID) ? `<div class="row">${trainButtons(p)}</div><p class="hint">Waiting in the city's stables, fed and watered, for you to join them or send them on by maglev or rocket.${p.members.some(m => restLeft(byId(m), t)) ? ' Resting after the flight.' : ''}</p>` : `<div class="row">${trainButtons(p)}<button class="btn small" type="button" data-trace="${esc(p.id)}" data-hex="0,0">${isStation(S.world.seed, p.at) ? 'Walk home' : 'Come home'} <span class="hint">(${legMins(S, p.members, p.at, '0,0')} min)</span></button>
        <span class="hint">Pick a hex on the map to explore on from here.</span>
        ${isStation(S.world.seed, p.at) ? '' : `<button class="ghost" type="button" data-camp="${esc(p.id)}">Make camp <span class="hint">(${CAMP.mins} min: look for water and food, rest)</span></button>`}${flyButton(p, t)}</div>`}
      </li>`;
    }
    const leg = p.leg, done = t >= leg.arriveAt;
    // stopped on the way for the player: it stands there, its bar pulsing, until it is seen to
    const halt = haltOf(p, t);
    if (halt && !done) {
      // (the way goes on all the while, unseen)
      const frac = Math.min(1, (t - leg.startedAt) / Math.max(1, leg.arriveAt - leg.startedAt));
      return `<li class="trip-row halted">
      <div>${names} <span class="hint">stopped in the ${esc(placeName(cellAt(S.world.seed, parseKey(leg.path[halt.idx]))))}</span></div>
      <div class="bar alert"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <div class="row"><span class="alert-text">An action needs your attention</span><button class="btn small" type="button" data-journey="${esc(p.id)}">See what happened</button></div>
    </li>`;
    }
    const ride = leg.train ? 'maglev' : leg.rocket ? 'rocket' : '';
    const where = leg.air ? 'flying home by air' : (ride ? (onRide => onRide && onRide.at ? `waiting at ${esc(stationName(onRide.at))} for the ${ride}${t < leg.startedAt ? ` (${departs(leg.startedAt, t)})` : ''} ` : t < leg.startedAt ? `waiting for the ${ride} (${departs(leg.startedAt, t, !leg.rocket)}) ` : `on the ${ride} `)(rideAt(S, leg, t)) : '') + (leg.to === '0,0' ? 'heading home' : `→ ${esc(placeName(cellAt(S.world.seed, parseKey(leg.to))))}`);
    const frac = Math.min(1, (t - leg.startedAt) / Math.max(1, leg.arriveAt - leg.startedAt));
    return `<li class="trip-row">
      <div>${names} <span class="hint">${where}${leg.recalled ? ' · called back' : ''}</span></div>
      <div class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <div class="row">${done ? `<button class="btn small" type="button" data-journey="${esc(p.id)}">${p.pending ? 'A decision awaits' : leg.to === '0,0' ? 'Back! See the journey' : 'Arrived! See the journey'}</button>`
        : `<span class="hint">${leg.air ? 'Lands' : leg.to === '0,0' ? 'Home' : 'There'} in ${fmt(leg.arriveAt - t)}</span>${leg.to === '0,0' || leg.recalled || leg.train || leg.rocket ? '' : `<button class="ghost" type="button" data-recall="${esc(p.id)}">Call back</button>`}${flyButton(p, t)}`}</div>
    </li>`;
  }).join('')}</ul>`;
}

// the player's own hunger, and a meal from the inventory
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
        ${S.world.expeditions.length || message ? `<section class="panel-box"><div class="sec-head"><h3>Expeditions</h3><span class="count">${S.world.expeditions.filter(e => !e.air).length} / ${EXPEDITION_SLOTS}</span></div>
          <div id="tripsBox">${tripsHTML(t)}</div>
          ${message ? `<p class="hint" role="status">${message}</p>` : ''}
        </section>` : '<div id="tripsBox" hidden></div>'}
        <section class="panel-box" aria-live="polite">${sideHTML(t)}</section>`;
  drawMap();
  box.querySelectorAll('[data-go-with]').forEach(btn => btn.addEventListener('click', () => {
    goWith = +btn.dataset.goWith;
    message = '';
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
  const rocketBtn = document.getElementById('sendRocket');
  if (rocketBtn) rocketBtn.addEventListener('click', () => {
    const names = team.map(unitName), r = act('explore', { team, hex: selected, rocket: true });
    message = r.ok ? `${esc(listNames(names))} booked on the rocket to ${esc(stationName(selected))}.` : esc(PROBLEMS[r.reason] || 'The team could not board.');
    if (r.ok) team = [];
    render();
  });
  box.querySelectorAll('[data-ahead]').forEach(c => c.addEventListener('change', () => {
    ahead = c.checked ? [...ahead, c.dataset.ahead] : ahead.filter(id => id !== c.dataset.ahead);
    render();
  }));
  for (const [id, rocket] of [['aheadTrain', false], ['aheadRocket', true]]) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
      const names = ahead.map(i => byId(i).name), r = act('explore', { team: ahead.map(i => ({ kind: 'dino', id: i })), hex: selected, ...(rocket ? { rocket: true } : { train: true, departAt: +btn.dataset.depart }) });
      message = r.ok ? `${esc(listNames(names))} sent ahead to ${esc(stationName(selected))} by ${rocket ? 'rocket' : 'maglev'}.` : esc(PROBLEMS[r.reason] || 'They could not board.');
      if (r.ok) ahead = [];
      render();
    });
  }
  const train = document.getElementById('sendTrain');
  if (train) train.addEventListener('click', () => {
    const names = team.map(unitName), r = act('explore', { team, hex: selected, train: true, departAt: +train.dataset.depart });
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
    message = !r.ok ? esc(PROBLEMS[r.reason] || 'The team could not go.') : to === '0,0' ? `You set off for home. Home in ${mins} min.`
      : `You set off${!party && names.length > 1 ? ` with ${esc(listNames(names.slice(1)))}` : ''}. There in ${mins} min: then you wait there for orders.`;
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
    message = r.ok ? `You made camp. In ${CAMP.mins} min you will see what you found.` : 'You could not make camp here.';
    render();
  }));
  box.querySelectorAll('[data-break-camp]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('breakCamp', { id: btn.dataset.breakCamp });
    message = r.ok ? campText(r.story[0]) : 'You could not break camp.';
    render();
  }));
  box.querySelectorAll('[data-order]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('order', { id: btn.dataset.order, hex: btn.dataset.hex });
    message = r.ok ? (btn.dataset.hex === '0,0' ? 'You set off for home.' : 'You set off.') : 'You could not go there.';
    render();
  }));
  box.querySelectorAll('[data-rocket]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('order', { id: btn.dataset.rocket, hex: btn.dataset.hex, rocket: true });
    message = r.ok ? `Booked on the rocket to ${esc(stationName(btn.dataset.hex))}.` : esc(PROBLEMS[r.reason] || 'They could not board.');
    render();
  }));
  box.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('join', { id: btn.dataset.join, into: btn.dataset.into });
    message = r.ok ? 'They joined the team.' : esc(PROBLEMS[r.reason] || 'They could not join.');
    render();
  }));
  box.querySelectorAll('[data-train]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('order', { id: btn.dataset.train, hex: btn.dataset.hex, train: true, departAt: +btn.dataset.depart });
    message = r.ok ? `You boarded the maglev for ${esc(stationName(btn.dataset.hex))}.` : r.reason === 'coins' ? 'Not enough coins for the fare.' : esc(PROBLEMS[r.reason] || 'The team could not board.');
    render();
  }));
  box.querySelectorAll('[data-fly]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('flyHome', { id: btn.dataset.fly });
    // on its way: the way so far is told first, then it takes off
    if (r.ok && !r.story) { openJourney(btn.dataset.fly, render); return; }
    const f = r.ok && r.story.find(e => e.kind === 'flown');
    message = !r.ok ? (r.reason === 'coins' ? 'Not enough coins for the aircraft.' : 'No aircraft could come.')
      : `An aircraft is flying you all home: ${plural(f.paid, 'coin', 'coins')} paid${f.later ? `, ${f.later} billed` : ''}. You land in ${fmt(f.lands - now())}.`;
    render();
  }));
  box.querySelectorAll('[data-recall]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('recall', { id: btn.dataset.recall });
    message = !r.ok ? 'You could not turn back.' : r.home ? 'You turned back before getting far: you are home.' : 'You turn for home from where you are, and the way back has its dangers too.';
    render();
  }));
}
// parties with a journey to tell
const backKey = t => S.world.expeditions.filter(e => e.leg && (t >= e.leg.arriveAt || haltOf(e, t))).map(e => e.id).join();
// where a party on its way has stopped for the player by now: { idx, at }, or null
function haltOf(p, t) {
  if (!p.leg) return null;
  if (p.pending) return { idx: p.pending.idx, at: p.leg.pausedAt != null ? p.leg.pausedAt : t };
  const stop = t < p.leg.arriveAt && stopOf(S, p);
  return stop && t >= stop.at ? stop : null;
}
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
  const back = S.world.expeditions.filter(e => e.leg && (t >= e.leg.arriveAt || haltOf(e, t))).length;
  const pill = document.getElementById('worldPill');
  pill.hidden = back === 0;
  pill.textContent = back;
  pill.title = back + (back === 1 ? ' journey' : ' journeys') + ' to tell';
}

export function initWorld() {
  subscribe(() => { if (currentTab() === 'world') render(); updateBadge(); });
  onTabChange(tab => {
    clearInterval(tick); tick = null;
    if (tab !== 'world') return;
    render();
    // redraw each second only while a trip is running, keeping the map and the form as they are
    tick = setInterval(tickTrips, 1000);
    // and the map more often while a team walks, so its marker moves smoothly
    clearInterval(walkTick);
    walkTick = setInterval(() => {
      const t = now();
      if (currentTab() === 'world' && !document.hidden && S.world.expeditions.some(e => e.leg && t < e.leg.arriveAt)) drawMap();
    }, 200);
  });
  setInterval(updateBadge, 1000);
  setInterval(doorsClosed, 1000);
  // (the night moving over the map: the trains move on their own canvas)
  setInterval(() => { if (currentTab() === 'world' && !document.hidden) drawMap(); }, 30000);
  updateBadge();
}
