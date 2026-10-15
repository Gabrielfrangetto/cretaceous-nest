// World tab: the hex map around the nest under its fog, and the expeditions that explore it.
// Pick a hex, pick a dinosaur, send it; when it comes back, collect what it found.
import { BIOMES, ITEMS, SEX, SPECIES, EXPEDITION_SLOTS, JUVENILE_RANGE, STAGES, DISCOVERY_COINS_PER_HEX, HEAL_MINS, PLAYER_ID, PLAYER_SLOTS } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, isHungry, countItem, isArms, statSheet, carriedWeight, carryCapacity, itemWeight } from '../economy.js';
import {
  ALL_HEXES, hexKey, parseKey, hexDist, biomeAt, isRevealed, canReach, tripMins, lootTable, exploreProblem, expeditionOf,
  threatAt, isLair, injuredLeft, explorerOf,
} from '../world.js';
import { fighterOf, winChance, dangerOf } from '../combat.js';
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
  'no-slot': `Only ${EXPEDITION_SLOTS} explorers can be out at the same time.`,
  unreachable: 'Too deep in the fog. Explore the hexes next to it first.',
  home: 'This is your nest.',
  injured: 'Injured. It heals with time, or sooner with a Healing Herb.',
};
const LAIR = '<g class="lair" transform="translate(-13 -15)"><circle r="7" fill="#3b2a24"/><path d="M-3.5 -2 l1.6 4 M0 -3 l0 5 M3.5 -2 l-1.6 4" stroke="#f3ead2" stroke-width="1.6" stroke-linecap="round"/></g>';

let selected = null, explorerId = null, message = '', tick = null;
const isMe = b => b && b.id === PLAYER_ID;
const name = b => isMe(b) ? b.name : `${b.name} ${SEX[sexOf(b)].sym}`;
const byId = id => explorerOf(S, id);
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
    const label = home ? 'Your nest' : seen ? `${BIOMES[biome].name}${isLair(w.seed, h) ? ' lair' : ''}, ${hexDist(h)} from the nest` : frontier ? `Unexplored, ${hexDist(h)} from the nest` : 'Deep fog';
    const glyph = home ? NEST : seen ? GLYPH[biome] + (isLair(w.seed, h) ? LAIR : '') : frontier ? '<text class="q" y="5">?</text>' : '';
    const exp = away.get(key);
    const marker = exp ? `<g class="trip ${t >= exp.returnAt ? 'back' : ''}"><circle r="8" cx="12" cy="-12"/><text x="12" y="-8.5">${esc((byId(exp.babyId) || { name: '?' }).name[0] || '?')}</text></g>` : '';
    const focusable = seen || frontier;
    return `<g class="${cls}" data-key="${key}" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})" ${focusable ? `tabindex="0" role="button" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
      <polygon points="${corners([0, 0], 0.96)}" ${seen ? `style="fill:${BIOMES[biome].color}"` : ''}/>${glyph}${marker}</g>`;
  }).join('');
  return `<svg class="world-map" viewBox="${box.map(v => v.toFixed(1)).join(' ')}" role="group" aria-label="World map">${cells}</svg>`;
}

// what waits there and how a fight would likely go for the chosen explorer
function threatHTML(h, ex) {
  if (!isRevealed(S, hexKey(...h))) return '<p class="hint">Unknown dangers.</p>';
  const th = threatAt(S.world.seed, h);
  const odds = ex ? winChance(fighterOf(ex), th.foe) : null;
  const danger = odds == null ? '' : dangerOf(odds);
  return `<div class="threat ${th.lair ? 'is-lair' : ''}">
    <p><strong>${th.lair ? 'Lair: ' : ''}${esc(th.foe.name)}</strong> <span class="hint">Power ${th.foe.power}</span></p>
    <p class="hint">${th.lair ? 'Always fights here. Beating it pays double and often drops equipment.' : `${Math.round(th.chance * 100)}% chance to meet it.`}</p>
    ${odds == null ? '' : `<p><span class="danger danger-${danger.toLowerCase()}">${danger}</span> <span class="hint">${esc(ex.name)} wins about ${Math.round(odds * 100)}% of the time (Power ${fighterOf(ex).power})</span></p>`}
  </div>`;
}

const healHTML = () => {
  const herbs = countItem(S, 'herb');
  return `<div class="row"><button class="ghost" type="button" id="healBtn" ${herbs ? '' : 'disabled'}>Use a Healing Herb (${herbs})</button>
    <span class="hint">${herbs ? `−${HEAL_MINS} min each` : 'Find them in meadows and forests, or buy them in the Shop'}</span></div>`;
};

function lootHTML(key) {
  if (!isRevealed(S, key)) return '<p class="hint">Unexplored. Send a dinosaur to find out what is there.</p>';
  return `<ul class="loot">${lootTable(S, key).map(l => `<li><span class="mini">${ITEM_ICONS[l.id]}</span>${l.min === l.max ? l.min : l.min + '–' + l.max} ${esc(itemName(l.id, l.max))}${l.chance < 1 ? ` <span class="hint">(${Math.round(l.chance * 100)}% chance)</span>` : ''}</li>`).join('')}</ul>`;
}

function sideHTML(t) {
  if (!selected) return `<h3>Pick a hex</h3>
    <p class="hint">Tap a hex next to the fog (marked ?) to explore it. You can go yourself, or send a juvenile or adult dinosaur. Farther hexes take longer and bring back more, sometimes an egg. Dinosaurs come home hungry.</p>`;
  const h = parseKey(selected), d = hexDist(h);
  if (d === 0) return `<h3>Your nest</h3><p class="hint">Where your dinosaurs live. Every trip starts and ends here.</p>`;
  const seen = isRevealed(S, selected);
  const biome = seen ? BIOMES[biomeAt(S.world.seed, h)] : null;
  const first = !S.world.visited.includes(selected);
  // everyone who could go, best candidates first; the ones who can't still show why
  // the player first, then every dinosaur old enough to explore
  const cands = [S.player, ...S.hatched.filter(b => stageOf(b).id !== 'baby')];
  if (!explorerId || !cands.some(b => b.id === explorerId)) explorerId = (cands.find(b => !exploreProblem(S, b.id, selected, t)) || cands.find(b => !expeditionOf(S, b.id)) || cands[0] || {}).id || null;
  const problem = explorerId ? exploreProblem(S, explorerId, selected, t) : null;
  const ex = explorerId && byId(explorerId);
  return `<h3>${seen ? esc(biome.name) : 'Unexplored hex'}</h3>
    <p class="hint">${plural(d, 'hex', 'hexes')} from the nest · trip ${tripMins(selected)} min there and back${first ? ` · first visit pays ${d * DISCOVERY_COINS_PER_HEX} coins` : ''}</p>
    ${lootHTML(selected)}
    ${threatHTML(h, ex)}
    ${cands.length ? `<div class="field"><label for="explorer">Explorer</label>
      <select id="explorer">${cands.map(b => `<option value="${esc(b.id)}" ${b.id === explorerId ? 'selected' : ''}>${esc(name(b))} · ${isMe(b) ? 'you, on foot' : `${esc(SPECIES[b.type].species)} · ${stageOf(b).name}`}${expeditionOf(S, b.id) ? ' · away' : injuredLeft(b, t) ? ' · injured' : !isMe(b) && isHungry(b, t) ? ' · hungry' : ''}</option>`).join('')}</select></div>
      <div class="row"><button class="btn" type="button" id="sendTrip" ${problem ? 'disabled' : ''}>Explore</button></div>
      ${problem && PROBLEMS[problem] ? `<p class="hint warn-text">${PROBLEMS[problem]}${problem === 'injured' ? ` Heals in ${fmt(injuredLeft(ex, t))}.` : ''}</p>` : ''}
      ${problem === 'injured' ? healHTML() : ''}`
    : `<p class="hint warn-text">No dinosaur can explore yet. Babies grow into juveniles after ${STAGES[1].meals} meals.</p>`}`;
}

function tripsHTML(t) {
  const list = S.world.expeditions;
  if (!list.length) return `<p class="hint">No one is exploring. ${EXPEDITION_SLOTS} explorers can be out at the same time.</p>`;
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
          ${message ? `<p class="hint" role="status">${message}</p>` : ''}</section>
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
  const ex = document.getElementById('explorer');
  if (ex) ex.addEventListener('change', e => { explorerId = e.target.value; render(); });
  const heal = document.getElementById('healBtn');
  if (heal) heal.addEventListener('click', () => {
    const r = act('heal', { babyId: explorerId });
    message = r.ok ? (r.left ? `Feeling better. Heals in ${fmt(r.left)}.` : 'Fully healed!') : 'No Healing Herbs.';
    render();
  });
  const send = document.getElementById('sendTrip');
  if (send) send.addEventListener('click', () => {
    const r = act('explore', { babyId: explorerId, hex: selected });
    const b = byId(explorerId);
    message = r.ok ? `${isMe(b) ? 'You' : esc(b.name)} set off. Back in ${tripMins(selected)} min.` : esc(PROBLEMS[r.reason] || 'It could not go.');
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
    // the player is "you": "You are back", not "You is back"
    const me = r.babyId === PLAYER_ID;
    const who = me ? 'You' : esc(b ? b.name : 'Your explorer'), is = me ? 'are' : 'is';
    const got = r.loot.map(l => `${l.n} ${itemName(l.id, l.n)}${l.lost ? ` (${l.lost} lost, inventory full)` : ''}`);
    if (r.coins) got.push(`${r.coins} coins`);
    const mapped = r.revealed ? ` ${plural(r.revealed, 'new hex', 'new hexes')} on the map.` : '';
    const hurt = r.battle && r.battle.injuredMins ? ` ${who} ${is} injured for ${r.battle.injuredMins} min.` : '';
    const follow = !r.egg ? '' : r.egg.lost ? ` ${who} found a ${esc(SPECIES[r.egg.type].egg)} but your egg tray is full, so it stayed behind.`
      : ` ${who} found a ${esc(SPECIES[r.egg.type].egg)} (${esc(SPECIES[r.egg.type].species)})! It's waiting in the Incubator.`;
    message = r.battle && !r.battle.win
      ? `${who} lost to the ${esc(r.battle.foe.name)} and came home with nothing.${hurt}${mapped}`
      : `${who} ${is} back from the ${esc(BIOMES[r.biome].name)}${r.battle ? `, victorious over the ${esc(r.battle.foe.name)},` : ''} with ${esc(got.join(', ') || 'nothing')}.${hurt}${follow}${mapped}`;
    render();
    if (r.battle && b) playFight(b, r.battle, message);
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
