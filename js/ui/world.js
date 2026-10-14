// World tab: the hex map around the nest under its fog, and the expeditions that explore it.
// Pick a hex, pick a dinosaur, send it; when it comes back, collect what it found.
import { BIOMES, ITEMS, SEX, SPECIES, EXPEDITION_SLOTS, JUVENILE_RANGE, STAGES, DISCOVERY_COINS_PER_HEX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, isHungry } from '../economy.js';
import {
  ALL_HEXES, hexKey, parseKey, hexDist, biomeAt, isRevealed, canReach, tripMins, lootTable, exploreProblem, expeditionOf,
} from '../world.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { ITEM_ICONS } from '../art.js';
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

const PROBLEMS = {
  'too-young': 'Babies stay in the nest. Feed it until it is a juvenile.',
  'too-far': `Juveniles only explore up to ${JUVENILE_RANGE} hexes from the nest. Adults go anywhere.`,
  away: 'Already exploring.',
  breeding: 'Busy nesting with its partner.',
  hungry: 'Too hungry to travel. Feed it in the Nest first.',
  'no-slot': `Only ${EXPEDITION_SLOTS} dinosaurs can explore at the same time.`,
  unreachable: 'Too deep in the fog. Explore the hexes next to it first.',
  home: 'This is your nest.',
};

let selected = null, explorerId = null, message = '', tick = null;
const name = b => `${b.name} ${SEX[sexOf(b)].sym}`;
const byId = id => S.hatched.find(b => b.id === id);
const itemName = (id, n) => n === 1 ? ITEMS[id].name : ITEMS[id].plural;

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
    const label = home ? 'Your nest' : seen ? `${BIOMES[biome].name}, ${hexDist(h)} from the nest` : frontier ? `Unexplored, ${hexDist(h)} from the nest` : 'Deep fog';
    const glyph = home ? NEST : seen ? GLYPH[biome] : frontier ? '<text class="q" y="5">?</text>' : '';
    const exp = away.get(key);
    const marker = exp ? `<g class="trip ${t >= exp.returnAt ? 'back' : ''}"><circle r="8" cx="12" cy="-12"/><text x="12" y="-8.5">${esc((byId(exp.babyId) || { name: '?' }).name[0] || '?')}</text></g>` : '';
    const focusable = seen || frontier;
    return `<g class="${cls}" data-key="${key}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})" ${focusable ? `tabindex="0" role="button" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
      <polygon points="${corners([0, 0], 0.96)}" ${seen ? `style="fill:${BIOMES[biome].color}"` : ''}/>${glyph}${marker}</g>`;
  }).join('');
  return `<svg class="world-map" viewBox="${box.map(v => v.toFixed(1)).join(' ')}" role="group" aria-label="World map">${cells}</svg>`;
}

function lootHTML(key) {
  if (!isRevealed(S, key)) return '<p class="hint">Unexplored. Send a dinosaur to find out what is there.</p>';
  return `<ul class="loot">${lootTable(S, key).map(l => `<li><span class="mini">${ITEM_ICONS[l.id]}</span>${l.min === l.max ? l.min : l.min + '–' + l.max} ${esc(itemName(l.id, l.max))}${l.chance < 1 ? ` <span class="hint">(${Math.round(l.chance * 100)}% chance)</span>` : ''}</li>`).join('')}</ul>`;
}

function sideHTML(t) {
  if (!selected) return `<h3>Pick a hex</h3>
    <p class="hint">Tap a hex next to the fog (marked ?) to explore it. Juveniles and adults can explore; farther hexes take longer and bring back more. A dinosaur comes home hungry.</p>`;
  const h = parseKey(selected), d = hexDist(h);
  if (d === 0) return `<h3>Your nest</h3><p class="hint">Where your dinosaurs live. Every trip starts and ends here.</p>`;
  const seen = isRevealed(S, selected);
  const biome = seen ? BIOMES[biomeAt(S.world.seed, h)] : null;
  const first = !S.world.visited.includes(selected);
  // everyone who could go, best candidates first; the ones who can't still show why
  const cands = S.hatched.filter(b => stageOf(b).id !== 'baby');
  if (!explorerId || !cands.some(b => b.id === explorerId)) explorerId = (cands.find(b => !exploreProblem(S, b.id, selected, t)) || cands.find(b => !expeditionOf(S, b.id)) || cands[0] || {}).id || null;
  const problem = explorerId ? exploreProblem(S, explorerId, selected, t) : null;
  return `<h3>${seen ? esc(biome.name) : 'Unexplored hex'}</h3>
    <p class="hint">${plural(d, 'hex', 'hexes')} from the nest · trip ${tripMins(selected)} min there and back${first ? ` · first visit pays ${d * DISCOVERY_COINS_PER_HEX} coins` : ''}</p>
    ${lootHTML(selected)}
    ${cands.length ? `<div class="field"><label for="explorer">Explorer</label>
      <select id="explorer">${cands.map(b => `<option value="${esc(b.id)}" ${b.id === explorerId ? 'selected' : ''}>${esc(name(b))} · ${esc(SPECIES[b.type].species)} · ${stageOf(b).name}${expeditionOf(S, b.id) ? ' · away' : isHungry(b, t) ? ' · hungry' : ''}</option>`).join('')}</select></div>
      <div class="row"><button class="btn" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Explore</button></div>
      ${problem && PROBLEMS[problem] ? `<p class="hint warn-text">${PROBLEMS[problem]}</p>` : ''}`
    : `<p class="hint warn-text">No dinosaur can explore yet. Babies grow into juveniles after ${STAGES[1].meals} meals.</p>`}`;
}

function tripsHTML(t) {
  const list = S.world.expeditions;
  if (!list.length) return `<p class="hint">No one is exploring. ${EXPEDITION_SLOTS} dinosaurs can explore at the same time.</p>`;
  return `<ul class="trips">${list.map(e => {
    const b = byId(e.babyId), back = t >= e.returnAt;
    const biome = isRevealed(S, e.hex) ? BIOMES[biomeAt(S.world.seed, parseKey(e.hex))].name : 'the fog';
    const frac = Math.min(1, (t - e.startedAt) / (e.returnAt - e.startedAt));
    return `<li class="trip-row">
      <div><strong>${esc(b ? name(b) : '?')}</strong> <span class="hint">→ ${esc(biome)}</span></div>
      <div class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
      <div class="row">${back
        ? `<button class="btn small" type="button" data-collect="${esc(e.id)}">Back! Collect</button>`
        : `<span class="hint">Back in ${fmt(e.returnAt - t)}</span><button class="ghost" type="button" data-recall="${esc(e.id)}">Call back</button>`}</div>
    </li>`;
  }).join('')}</ul>`;
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
        <section class="panel-box"><h3>Expeditions <span class="hint">${S.world.expeditions.length} / ${EXPEDITION_SLOTS}</span></h3>
          <div id="tripsBox">${tripsHTML(t)}</div>
          ${message ? `<p class="hint" role="status">${message}</p>` : ''}</section>
      </div>
    </div>`;
  box.querySelectorAll('.hex[tabindex]').forEach(g => {
    const pick = () => { selected = g.dataset.key; message = ''; render(); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  const ex = document.getElementById('explorer');
  if (ex) ex.addEventListener('change', e => { explorerId = e.target.value; render(); });
  const send = document.getElementById('sendTrip');
  if (send) send.addEventListener('click', () => {
    const r = act('explore', { babyId: explorerId, hex: selected });
    const b = byId(explorerId);
    message = r.ok ? `${esc(b.name)} set off. Back in ${tripMins(selected)} min.` : esc(PROBLEMS[r.reason] || 'It could not go.');
    if (r.ok) explorerId = null;   // the next free dinosaur is picked
    render();
  });
  bindTrips(box);
}

let shownBack = '';
// the list of trips, redrawn on its own every second so the map and the form are left alone
function bindTrips(box) {
  shownBack = backKey(now());
  box.querySelectorAll('[data-collect]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('collectTrip', { id: btn.dataset.collect });
    if (!r.ok) { message = 'Not back yet.'; render(); return; }
    const b = byId(r.babyId);
    const got = r.loot.map(l => `${l.n} ${itemName(l.id, l.n)}${l.lost ? ` (${l.lost} lost, inventory full)` : ''}`);
    if (r.coins) got.push(`${r.coins} coins for the discovery`);
    message = `${esc(b ? b.name : 'Your explorer')} is back from the ${esc(BIOMES[r.biome].name)} with ${esc(got.join(', ') || 'nothing')}.${r.revealed ? ` ${plural(r.revealed, 'new hex', 'new hexes')} on the map.` : ''}`;
    render();
  }));
  box.querySelectorAll('[data-recall]').forEach(btn => btn.addEventListener('click', () => {
    act('recall', { id: btn.dataset.recall });
    message = 'Called back. It came home with nothing.';
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
