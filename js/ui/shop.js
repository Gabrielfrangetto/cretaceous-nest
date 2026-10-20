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

// one thing on sale: its icon, its name and what it is, and its price
const COIN = '<svg class="coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#e9b83a" stroke="#a87812"/></svg>';
function itemRow({ icon, name, have = '', desc, extra = '', price, attrs, ok, why = '' }) {
  return `<li class="row-item">
    <span class="ri-icon">${icon}</span>
    <span class="ri-body"><strong>${name}</strong>${have ? ` <span class="meta">${have}</span>` : ''}<span class="ri-desc">${desc}</span>${extra}</span>
    <span class="ri-buy"><button class="btn small" type="button" ${attrs} ${ok ? '' : 'disabled'}>${COIN}${price}</button>${why ? `<span class="meta">${why}</span>` : ''}</span>
  </li>`;
}
// the priced pieces of one kind: 'gear' for dinosaurs, 'arms' for the player
const gearRows = kind => Object.entries(ITEMS).filter(([, it]) => it.kind === kind && it.price).map(([id, it]) => {
  const fits = roomFor(S, id) >= 1;
  const slot = (kind === 'arms' ? PLAYER_SLOTS : GEAR_SLOTS).find(g => g.id === it.slot).name;
  return itemRow({ icon: ITEM_ICONS[id], name: esc(it.name), have: `${slot} · weight ${it.weight}`, desc: esc(it.desc), extra: modsHTML(it.mods),
    price: it.price, attrs: `data-gear="${id}"`, ok: fits && S.coins >= it.price, why: !fits ? 'No room' : '' });
}).join('');

function render() {
  const box = document.getElementById('shopBox');
  const maxed = S.invSize >= SLOTS, price = rowPrice(S);
  const supplies = [
    maxed ? '' : itemRow({ icon: BAG, name: 'Bigger backpack', have: `${S.invSize} / ${SLOTS} slots`, desc: `Adds a row of ${ROW} slots to your inventory.`, price, attrs: 'id="buyRow"', ok: S.coins >= price }),
    ...FOOD_PACKS.map((p, k) => {
      const it = ITEMS[p.id], fits = roomFor(S, p.id) >= p.qty;
      return itemRow({ icon: ITEM_ICONS[p.id], name: `${p.qty} ${it.plural}`, have: `you have ${countItem(S, p.id)}`, desc: esc(it.desc), price: p.price, attrs: `data-pack="${k}"`, ok: fits && S.coins >= p.price, why: fits ? '' : 'No room' });
    }),
  ].join('');
  box.innerHTML = `
    <div class="sec-head"><h2>Shop</h2>
      <details class="info"><summary aria-label="How to earn coins">?</summary><p><strong>How to earn coins.</strong> Give a young dinosaur its growth capsule: +${FEED_COINS}. Sell what you bring home to the Scientists, in the Inventory: they pay well for specimens (teeth, blood, shells, amber, bone) and little for food, which they grow in plenty. Win a fight out in the wild. Hatch an egg: ${Object.entries(RARITIES).filter(([name]) => name !== 'Starter').map(([name, r]) => `+${r.coins} (${name})`).join(', ')}.</p></details></div>
    ${message ? `<p class="notice" role="status">${esc(message)}</p>` : ''}
    <section class="sec"><h3 class="sub-head">Supplies</h3><ul class="row-list">${supplies}</ul></section>
    <section class="sec"><h3 class="sub-head">Your weapons and armor <span class="meta">wear them from the World tab</span></h3><ul class="row-list">${gearRows('arms')}</ul></section>
    <section class="sec"><h3 class="sub-head">Dinosaur equipment <span class="meta">for adults, from a dinosaur's window in the Nest</span></h3><ul class="row-list">${gearRows('gear')}</ul></section>`;
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
