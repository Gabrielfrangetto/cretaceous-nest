// Shop tab: backpack upgrades and food packs.
import { ITEMS, SLOTS, ROW, FOOD_PACKS, FEED_COINS, RARITIES, GEAR_SLOTS, PLAYER_SLOTS } from '../config.js';
import { S, subscribe } from '../state.js';
import { rowPrice, countItem, roomFor } from '../economy.js';
import { act } from '../actions.js';
import { BAG, ITEM_ICONS } from '../art.js';
import { esc } from '../util.js';
import { modsHTML } from './stats.js';
import { currentTab, onTabChange } from './tabs.js';

let message = '';

// the priced pieces of one kind: 'gear' for dinosaurs, 'arms' for the player
const gearCards = kind => Object.entries(ITEMS).filter(([, it]) => it.kind === kind && it.price).map(([id, it]) => {
        const fits = roomFor(S, id) >= 1, ok = fits && S.coins >= it.price;
        const slot = (kind === 'arms' ? PLAYER_SLOTS : GEAR_SLOTS).find(g => g.id === it.slot).name;
        return `<li class="gear-card">
          <span class="gear-icon big">${ITEM_ICONS[id]}</span>
          <div class="gear-body">
            <strong>${esc(it.name)}</strong>
            <span class="hint">${slot} · weight ${it.weight} · ${esc(it.desc)}</span>
            ${modsHTML(it.mods)}
          </div>
          <div class="gear-buy">
            <button class="btn small" type="button" data-gear="${id}" ${ok ? '' : 'disabled'}>${it.price} coins</button>
            ${!fits ? '<span class="hint">No room</span>' : S.coins < it.price ? `<span class="hint">${it.price - S.coins} more</span>` : ''}
          </div>
        </li>`;
      }).join('');

function render() {
  const box = document.getElementById('shopBox');
  const maxed = S.invSize >= SLOTS, price = rowPrice(S), can = S.coins >= price;
  const rows = S.invSize / ROW;
  box.innerHTML = `
    <article class="shop-item">
      <div class="shop-icon">${BAG}</div>
      <div class="shop-body">
        <h3>Bigger backpack</h3>
        <p class="hint">Adds a row of ${ROW} slots to your inventory.</p>
        <div class="rows-meter" aria-hidden="true">${Array.from({ length: SLOTS / ROW }, (_, i) => `<i class="${i < rows ? 'on' : ''}"></i>`).join('')}</div>
        <p class="hint">${S.invSize} of ${SLOTS} slots unlocked</p>
      </div>
      <div class="shop-buy">
        ${maxed ? '<p class="qty">Inventory maxed out</p>'
          : `<button class="btn" id="buyRow" type="button" ${can ? '' : 'disabled'}>Buy for ${price} coins</button>
             <p class="hint">${can ? 'You will have ' + (S.invSize + ROW) + ' slots' : (price - S.coins) + ' more coins needed'}</p>`}
      </div>
    </article>
    ${FOOD_PACKS.map((p, k) => {
      const it = ITEMS[p.id], fits = roomFor(S, p.id) >= p.qty, ok = S.coins >= p.price && fits;
      return `<article class="shop-item">
        <div class="shop-icon">${ITEM_ICONS[p.id]}</div>
        <div class="shop-body">
          <h3>${p.qty} ${it.plural}</h3>
          <p class="hint">${esc(it.desc)}</p>
          <p class="hint">You have ${countItem(S, p.id)}</p>
        </div>
        <div class="shop-buy">
          <button class="btn" type="button" data-pack="${k}" ${ok ? '' : 'disabled'}>Buy for ${p.price} coins</button>
          <p class="hint">${!fits ? "Won't fit in your inventory" : S.coins < p.price ? (p.price - S.coins) + ' more coins needed' : 'Goes to your inventory'}</p>
        </div>
      </article>`;
    }).join('')}
    ${message ? `<p class="hint" role="status">${esc(message)}</p>` : ''}
    <section class="gear-shop">
      <div><h3>Weapons and armor</h3><p class="hint">For your own explorer. Wear them from the World tab.</p></div>
      <ul class="gear-list">${gearCards('arms')}</ul>
    </section>
    <section class="gear-shop">
      <div><h3>Dinosaur equipment</h3><p class="hint">Bought with coins you earn in the game. Only adults wear it: equip it from a dinosaur's window in the Nest.</p></div>
      <ul class="gear-list">${gearCards('gear')}</ul>
    </section>
    <div class="earn">
      <h3>How to earn coins</h3>
      <ul>
        <li>Give a young dinosaur its growth capsule: +${FEED_COINS}</li>
        <li>Hatch an egg: ${Object.entries(RARITIES).filter(([name]) => name !== 'Starter').map(([name, r]) => `+${r.coins} (${name})`).join(', ')}</li>
      </ul>
    </div>`;
  box.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => {
    const result = act('buyPack', { k: +b.dataset.pack });
    if (!result.ok) return;
    message = `Bought! +${result.pack.qty} ${ITEMS[result.pack.id].plural} in your inventory.`;
    render();
  }));
  box.querySelectorAll('[data-gear]').forEach(b => b.addEventListener('click', () => {
    const r = act('buyGear', { id: b.dataset.gear });
    if (!r.ok) return;
    message = 'Bought! ' + ITEMS[r.item].name + ' is in your inventory. Equip it from a baby’s window in the Nest.';
    render();
  }));
  const buy = document.getElementById('buyRow');
  if (buy) buy.addEventListener('click', () => {
    if (!act('buyRow').ok) return;
    message = `Bought! Your inventory now has ${S.invSize} slots.`;
    render();
  });
}

export function initShop() {
  subscribe(() => { if (currentTab() === 'shop') render(); });
  onTabChange(name => { if (name === 'shop') { message = ''; render(); } });
}
