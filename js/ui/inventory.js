// Inventory tab: the slot grid and item details. A click selects an item; moving it takes a drag
// (mouse: press and drag; touch: press and hold, then drag; keyboard: arrow keys on the selected item).
import { ITEMS, SLOTS, ROW, MAX_STACK } from '../config.js';
import { S, subscribe } from '../state.js';
import { act } from '../actions.js';
import { ITEM_ICONS } from '../art.js';
import { esc, plural } from '../util.js';
import { modsHTML } from './stats.js';
import { GEAR_SLOTS, PLAYER_SLOTS } from '../config.js';
import { currentTab, onTabChange, setTab } from './tabs.js';

const grid = document.getElementById('invGrid');
let sel = -1, suppressClick = false, drag = null;
const HOLD_MS = 250;     // touch: how long to hold an item before it lifts, so a swipe still scrolls
const MOVE_PX = 6;

function buildGrid() {
  for (let i = 0; i < SLOTS; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'slot'; b.dataset.i = i;
    b.addEventListener('click', () => onSlot(i));
    b.addEventListener('pointerdown', e => startDrag(e, i));
    b.addEventListener('keydown', e => onSlotKey(e, i));
    grid.appendChild(b);
  }
}

function render() {
  if (!grid.children.length) buildGrid();
  if (sel >= S.invSize || (sel >= 0 && !S.inv[sel])) sel = -1;
  let used = 0;
  for (let i = 0; i < SLOTS; i++) {
    const s = S.inv[i], b = grid.children[i];
    b.hidden = i >= S.invSize;
    if (b.hidden) continue;
    const key = s ? s.id + ':' + s.n : '';
    if (b.dataset.key !== key) {
      b.dataset.key = key;
      b.innerHTML = s ? ITEM_ICONS[s.id] + (ITEMS[s.id].stack === 1 ? '' : `<span class="q">${s.n}</span>`) : '';
      b.classList.toggle('full', !!s && s.n >= MAX_STACK);
    }
    const row = Math.floor(i / ROW) + 1, col = i % ROW + 1;
    b.setAttribute('aria-label', s ? `${ITEMS[s.id].name}, ${s.n}, row ${row}, column ${col}` : `Empty slot, row ${row}, column ${col}`);
    b.classList.toggle('sel', i === sel);
    if (s) used++;
  }
  document.getElementById('invCount').textContent = `${used} of ${S.invSize} slots used`;
  grid.setAttribute('aria-label', `Inventory, ${plural(S.invSize / ROW, 'row', 'rows')} of ${ROW}`);
  const more = document.getElementById('moreRoom');
  if (S.invSize < SLOTS) {
    more.innerHTML = 'Need more room? <button type="button" id="goShop">Buy another row in the Shop</button>.';
    document.getElementById('goShop').addEventListener('click', () => setTab('shop'));
  } else more.textContent = 'All 10 rows are unlocked.';
  renderSide();
}

function renderSide() {
  const side = document.getElementById('invSide');
  const s = sel >= 0 ? S.inv[sel] : null;
  if (!s) {
    side.innerHTML = `<h2>No item selected</h2>
      <p class="hint">Tap an item to see its details. Drag it to another slot to move it, stack it or swap places. On a touch screen, press and hold the item, then drag.</p>
      <p class="hint">Each slot holds one kind of item, up to ${MAX_STACK}. You start with one row of ${ROW} slots.</p>`;
    return;
  }
  const it = ITEMS[s.id];
  const hasEmpty = S.inv.some((x, k) => !x && k < S.invSize);
  side.innerHTML = `<div class="big">${ITEM_ICONS[s.id]}</div>
    <h2>${esc(it.name)}</h2>
    ${it.kind === 'gear' || it.kind === 'arms' ? `<p class="hint">${it.kind === 'arms' ? 'Your weapons and armor' : 'Dinosaur equipment'} · ${(it.kind === 'arms' ? PLAYER_SLOTS : GEAR_SLOTS).find(g => g.id === it.slot).name} · weight ${it.weight}</p>${modsHTML(it.mods)}` : `<p class="qty">${s.n} / ${MAX_STACK}</p>`}
    <p class="fact">${esc(it.desc)}${it.kind === 'gear' ? ' Equip it from a baby’s window in the Nest.' : ''}</p>
    <div class="row">
      ${s.n > 1 && hasEmpty ? '<button class="ghost" id="invSplit" type="button">Split stack</button>' : ''}
      <button class="ghost" id="invDrop" type="button">Discard 1</button>
    </div>`;
  const split = document.getElementById('invSplit');
  if (split) split.addEventListener('click', () => act('split', { i: sel }));
  document.getElementById('invDrop').addEventListener('click', () => act('discard', { i: sel }));
}

// a click or tap only selects; moving takes a drag
function onSlot(i) {
  if (suppressClick) return;
  sel = sel === i || !S.inv[i] ? -1 : i;
  render();
}

// keyboard: arrow keys move the selected item to the next slot over
const ARROWS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ROW, ArrowDown: ROW };
function onSlotKey(e, i) {
  if (!(e.key in ARROWS) || sel !== i) return;
  const to = i + ARROWS[e.key];
  if (to < 0 || to >= S.invSize || (Math.abs(ARROWS[e.key]) === 1 && Math.floor(to / ROW) !== Math.floor(i / ROW))) return;
  e.preventDefault();
  if (act('move', { a: i, b: to }).ok) sel = S.inv[to] ? to : -1;
  render();
  grid.children[to].focus();
}

// ---------- dragging ----------
function startDrag(e, i) {
  if (!S.inv[i] || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const touch = e.pointerType !== 'mouse';
  drag = { from: i, id: e.pointerId, x: e.clientX, y: e.clientY, touch, armed: !touch, ghost: null, over: null, timer: null };
  if (touch) {
    drag.timer = setTimeout(() => {
      if (!drag) return;
      drag.armed = true;
      lift(drag.x, drag.y);
      if (navigator.vibrate) navigator.vibrate(10);
    }, HOLD_MS);
  }
}

function lift(x, y) {
  drag.ghost = document.createElement('div');
  drag.ghost.className = 'drag-ghost';
  drag.ghost.innerHTML = ITEM_ICONS[S.inv[drag.from].id];
  document.body.appendChild(drag.ghost);
  grid.children[drag.from].classList.add('dragging');
  follow(x, y);
}

function follow(x, y) {
  drag.ghost.style.left = x + 'px';
  drag.ghost.style.top = y + 'px';
  const t = document.elementFromPoint(x, y);
  const slot = t && t.closest ? t.closest('.slot') : null;
  if (drag.over !== slot) {
    if (drag.over) drag.over.classList.remove('over');
    drag.over = slot;
    if (slot) slot.classList.add('over');
  }
}

function endDrag() {
  if (!drag) return null;
  const d = drag;
  drag = null;
  clearTimeout(d.timer);
  if (d.ghost) d.ghost.remove();
  if (d.over) d.over.classList.remove('over');
  grid.children[d.from]?.classList.remove('dragging');
  return d;
}

window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.armed) {
    // a touch that moves before the hold is a scroll, not a drag
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > MOVE_PX) endDrag();
    else { drag.x = e.clientX; drag.y = e.clientY; }
    return;
  }
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < MOVE_PX) return;
    lift(e.clientX, e.clientY);
  }
  follow(e.clientX, e.clientY);
});

// while an item is lifted, the finger drags it instead of scrolling the page
document.addEventListener('touchmove', e => { if (drag && drag.armed) e.preventDefault(); }, { passive: false });

window.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = endDrag();
  if (!d.ghost) return;
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  const to = d.over ? +d.over.dataset.i : -1;
  if (to >= 0 && to !== d.from && act('move', { a: d.from, b: to }).ok) sel = S.inv[to] ? to : -1;
  render();
});
window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(); });

export function initInventory() {
  // a long press on an item would otherwise open the browser's menu
  grid.addEventListener('contextmenu', e => { if (e.target.closest('.slot')) e.preventDefault(); });
  document.getElementById('invSort').addEventListener('click', () => {
    sel = -1;
    act('sort');
  });
  subscribe(() => { if (currentTab() === 'inv') render(); });
  onTabChange(name => { if (name === 'inv') render(); });
}
