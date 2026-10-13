// Shop tab: backpack upgrades and food packs.
import { ITEMS, SLOTS, ROW, FOOD_PACKS, FEED_COINS, HATCH_COINS } from '../config.js';
import { S, commit, subscribe } from '../state.js';
import { rowPrice, buyRow, buyPack, countItem, roomFor } from '../economy.js';
import { BAG, ITEM_ICONS } from '../art.js';
import { esc } from '../util.js';
import { currentTab, onTabChange } from './tabs.js';

let message = '';

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
    <div class="earn">
      <h3>How to earn coins</h3>
      <ul>
        <li>Feed a hungry baby: +${FEED_COINS} (uses 1 leaf or 1 meat from your inventory)</li>
        <li>Hatch an egg: +${HATCH_COINS.proto} (Common), +${HATCH_COINS.hypa} (Uncommon), +${HATCH_COINS.raptor} (Rare), +${HATCH_COINS.rex} (Legendary)</li>
      </ul>
    </div>`;
  box.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => {
    const result = buyPack(S, +b.dataset.pack);
    if (!result.ok) return;
    message = `Bought! +${result.pack.qty} ${ITEMS[result.pack.id].plural} in your inventory.`;
    commit();
  }));
  const buy = document.getElementById('buyRow');
  if (buy) buy.addEventListener('click', () => {
    if (!buyRow(S).ok) return;
    message = `Bought! Your inventory now has ${S.invSize} slots.`;
    commit();
  });
}

export function initShop() {
  subscribe(() => { if (currentTab() === 'shop') render(); });
  onTabChange(name => { if (name === 'shop') { message = ''; render(); } });
}
