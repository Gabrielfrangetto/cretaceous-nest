// The Forge, under the inventory: equipment made from the materials explorers bring home.
import { ITEMS, RECIPES, GEAR_SLOTS } from '../config.js';
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
  box.innerHTML = `
    <div><h2 id="forgeTitle">Forge</h2>
    <p class="hint">Turn the materials your explorers bring home into equipment you can't buy in the Shop. Only adults wear equipment.</p></div>
    <ul class="gear-list">${RECIPES.map(r => {
      const it = ITEMS[r.id];
      const parts = Object.entries(r.needs).map(([id, n]) => ({ id, n, have: countItem(S, id) }));
      const ready = parts.every(p => p.have >= p.n), room = roomFor(S, r.id) >= 1;
      return `<li class="gear-card">
        <span class="gear-icon big">${ITEM_ICONS[r.id]}</span>
        <div class="gear-body">
          <strong>${esc(it.name)}</strong>
          <span class="hint">${GEAR_SLOTS.find(g => g.id === it.slot).name} · ${esc(it.desc)}</span>
          ${modsHTML(it.mods)}
          <ul class="needs">${parts.map(p => `<li class="${p.have >= p.n ? 'got' : 'short'}"><span class="mini">${ITEM_ICONS[p.id]}</span>${p.have}/${p.n} ${esc(p.n === 1 ? ITEMS[p.id].name : ITEMS[p.id].plural)}</li>`).join('')}</ul>
        </div>
        <div class="gear-buy">
          <button class="btn small" type="button" data-craft="${r.id}" ${ready && room ? '' : 'disabled'}>Forge</button>
          ${ready && !room ? '<span class="hint">No room</span>' : ''}
        </div>
      </li>`;
    }).join('')}</ul>
    ${message ? `<p class="hint" role="status">${esc(message)}</p>` : ''}`;
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
