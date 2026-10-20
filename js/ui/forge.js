// The Forge, under the inventory: equipment made from the materials explorers bring home.
import { ITEMS, RECIPES, GEAR_SLOTS, PLAYER_SLOTS } from '../config.js';
import { S, subscribe } from '../state.js';
import { countItem, roomFor } from '../economy.js';
import { act } from '../actions.js';
import { ITEM_ICONS } from '../art.js';
import { esc } from '../util.js';
import { modsHTML } from './stats.js';
import { currentTab, onTabChange } from './tabs.js';

let message = '';

function render() {
  const box = document.getElementById('forgeBox');
  if (!box) return;
  // what can be forged now first
  const rows = RECIPES.map(r => {
    const parts = Object.entries(r.needs).map(([id, n]) => ({ id, n, have: countItem(S, id) }));
    return { r, parts, ready: parts.every(p => p.have >= p.n) };
  }).sort((a, b) => b.ready - a.ready);
  box.innerHTML = `
    <div class="sec-head"><h2 id="forgeTitle">Forge</h2>
      <details class="info"><summary aria-label="What the Forge is">?</summary><p>Turn the materials your explorers bring home into weapons and armor for you, equipment for your adult dinosaurs, and remedies, that the Shop doesn't sell.</p></details></div>
    ${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}
    <ul class="row-list">${rows.map(({ r, parts, ready }) => {
      const it = ITEMS[r.id], room = roomFor(S, r.id) >= 1;
      const what = it.slot ? `${it.kind === 'arms' ? 'For you' : 'For dinosaurs'} · ${(it.kind === 'arms' ? PLAYER_SLOTS : GEAR_SLOTS).find(g => g.id === it.slot).name}` : r.id === 'transfusion' ? 'Remedy' : 'Supplies';
      return `<li class="row-item ${ready ? '' : 'dim'}">
        <span class="ri-icon">${ITEM_ICONS[r.id]}</span>
        <span class="ri-body"><strong>${esc(it.name)}</strong> <span class="meta">${what}</span>
          ${it.mods ? modsHTML(it.mods) : ''}
          <span class="needs">${parts.map(p => `<span class="need ${p.have >= p.n ? 'got' : 'short'}" title="${esc(ITEMS[p.id].name)}">${ITEM_ICONS[p.id]}${p.have}/${p.n}</span>`).join('')}</span></span>
        <span class="ri-buy"><button class="btn small" type="button" data-craft="${r.id}" ${ready && room ? '' : 'disabled'}>Forge</button>${ready && !room ? '<span class="meta">No room</span>' : ''}</span>
      </li>`;
    }).join('')}</ul>`;
  box.querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => {
    const r = act('craft', { id: b.dataset.craft });
    message = r.ok ? `Forged a ${ITEMS[r.item].name}! It's in your inventory.` : 'Missing materials.';
    render();
  }));
}

export function initForge() {
  subscribe(() => { if (currentTab() === 'inv') render(); });
  onTabChange(tab => { if (tab === 'inv') { message = ''; render(); } });
}
