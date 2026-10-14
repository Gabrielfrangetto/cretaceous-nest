// Inventory tab: the slot grid, item details, tap-to-move and mouse drag.
import { ITEMS, SLOTS, ROW, MAX_STACK } from '../config.js';
import { S, subscribe } from '../state.js';
import { act } from '../actions.js';
import { ITEM_ICONS } from '../art.js';
import { esc, plural } from '../util.js';
import { currentTab, onTabChange, setTab } from './tabs.js';

const grid = document.getElementById('invGrid');
let sel = -1, suppressClick = false, drag = null;

function buildGrid() {
  for (let i = 0; i < SLOTS; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'slot'; b.dataset.i = i;
    b.addEventListener('click', () => onSlot(i));
    b.addEventListener('pointerdown', e => startDrag(e, i));
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
      b.innerHTML = s ? ITEM_ICONS[s.id] + `<span class="q">${s.n}</span>` : '';
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
      <p class="hint">Tap an item to see its details. Then tap another slot to move it, stack it or swap places. On a computer you can also drag.</p>
      <p class="hint">Each slot holds one kind of item, up to ${MAX_STACK}. You start with one row of ${ROW} slots.</p>`;
    return;
  }
  const it = ITEMS[s.id];
  const hasEmpty = S.inv.some((x, k) => !x && k < S.invSize);
  side.innerHTML = `<div class="big">${ITEM_ICONS[s.id]}</div>
    <h2>${esc(it.name)}</h2>
    <p class="qty">${s.n} / ${MAX_STACK}</p>
    <p class="fact">${esc(it.desc)}</p>
    <div class="row">
      ${s.n > 1 && hasEmpty ? '<button class="ghost" id="invSplit" type="button">Split stack</button>' : ''}
      <button class="ghost" id="invDrop" type="button">Discard 1</button>
    </div>`;
  const split = document.getElementById('invSplit');
  if (split) split.addEventListener('click', () => act('split', { i: sel }));
  document.getElementById('invDrop').addEventListener('click', () => act('discard', { i: sel }));
}

function onSlot(i) {
  if (suppressClick) return;
  if (sel < 0) { if (S.inv[i]) sel = i; render(); return; }
  if (sel === i) { sel = -1; render(); return; }
  const from = sel;
  sel = -1;
  if (act('move', { a: from, b: i }).ok) sel = S.inv[i] ? i : -1;
  render();
}

// mouse drag; touch uses tap-to-select, tap-to-place
function startDrag(e, i) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !S.inv[i]) return;
  drag = { from: i, x: e.clientX, y: e.clientY, ghost: null, over: null };
}
window.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'drag-ghost';
    drag.ghost.innerHTML = ITEM_ICONS[S.inv[drag.from].id];
    document.body.appendChild(drag.ghost);
  }
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';
  const t = document.elementFromPoint(e.clientX, e.clientY);
  const slot = t && t.closest ? t.closest('.slot') : null;
  if (drag.over !== slot) {
    if (drag.over) drag.over.classList.remove('over');
    drag.over = slot;
    if (slot) slot.classList.add('over');
  }
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  const { from, ghost, over } = drag;
  drag = null;
  if (!ghost) return;
  ghost.remove();
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  if (over) over.classList.remove('over');
  const to = over ? +over.dataset.i : -1;
  if (to >= 0 && to !== from && act('move', { a: from, b: to }).ok) sel = S.inv[to] ? to : -1;
  render();
});

export function initInventory() {
  document.getElementById('invSort').addEventListener('click', () => {
    sel = -1;
    act('sort');
  });
  subscribe(() => { if (currentTab() === 'inv') render(); });
  onTabChange(name => { if (name === 'inv') render(); });
}
