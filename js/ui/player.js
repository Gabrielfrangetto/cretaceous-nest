// You, the player's explorer: always at the left of the page on a wide screen (a button in the top bar
// opens it on a narrower one): your look, your numbers, how you are, a meal, and the weapons and armor
// you wear.
import { ITEMS, PLAYER_ID, PLAYER_SLOTS } from '../config.js';
import { S, subscribe } from '../state.js';
import { isHungry, isArms, statSheet, carriedWeight, carryCapacity, itemWeight, mealFor } from '../economy.js';
import { expeditionOf, injuredLeft } from '../world.js';
import { act } from '../actions.js';
import { openLook } from './look.js';
import { now } from '../clock.js';
import { ITEM_ICONS, playerArt } from '../art.js';
import { modsHTML, loadHTML } from './stats.js';
import { esc, fmt } from '../util.js';

let message = '';
let gearOpen = false;   // (the gear list kept open or shut across redraws)

function eatHTML(p, t) {
  if (!isHungry(p, t)) return '<p class="hint">Fed for now.</p>';
  const food = mealFor(S, null);
  return `<div class="row"><button class="btn small" type="button" data-eat ${food ? '' : 'disabled'}>Eat${food ? ` (${esc(ITEMS[food].name)})` : ''}</button></div>
    <p class="hint warn-text">${food ? 'You are hungry: eat before you set out.' : 'You are hungry, and have nothing to eat: buy Trail Rations in the Shop, or bring home meat or fish.'}</p>`;
}

function html(t) {
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
  return `<div class="you-top"><span class="you-art"></span>
      <div><h2>${esc(p.name)}</h2>
      <button class="ghost small" type="button" data-look>Change look</button>
      <p class="you-state ${hurt ? 'warn-text' : ''}">${away ? 'Out exploring' : hurt ? `Injured · heals in ${fmt(hurt)}` : 'At the nest'}</p></div></div>
    <dl class="you-stats">
      <div><dt>Power</dt><dd>${sheet.power}</dd></div><div><dt>Health</dt><dd>${d.hp}</dd></div>
      <div><dt>Damage</dt><dd>${d.damage}</dd></div><div><dt>Dodge</dt><dd>${Math.round(d.dodge * 100)}%</dd></div>
      <div><dt>Armor</dt><dd>${Math.round(d.reduction * 100)}%</dd></div>
    </dl>
    ${away ? '' : eatHTML(p, t)}
    ${message ? `<p class="hint" role="status">${esc(message)}</p>` : ''}
    <details class="fold" id="gearFold" ${gearOpen ? 'open' : ''}><summary>Weapons and armor</summary>
      ${loadHTML(p)}
      <ul class="gear-slots">${rows}</ul>
      <p class="hint">Sold in the Shop and made in the Forge. They can't be changed while you're away.</p>
    </details>`;
}

function render() {
  const box = document.getElementById('youPanel');
  // (not while a choice is being made in it)
  if (!box || box.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
  box.innerHTML = html(now());
  box.querySelector('.you-art').appendChild(playerArt(S.player.equip, 96, S.player.look));
  box.querySelector('#gearFold').addEventListener('toggle', e => { gearOpen = e.target.open; });
  box.querySelector('[data-look]').addEventListener('click', openLook);
  const eat = box.querySelector('[data-eat]');
  if (eat) eat.addEventListener('click', () => { act('feed', { id: PLAYER_ID }); render(); });
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
}

export function initPlayer() {
  const box = document.getElementById('youPanel'), btn = document.getElementById('youBtn');
  // on a narrower screen the top bar's button opens it over the page
  const show = on => { box.classList.toggle('open', on); btn.setAttribute('aria-expanded', String(on)); };
  btn.addEventListener('click', e => { e.stopPropagation(); show(!box.classList.contains('open')); });
  document.addEventListener('click', e => { if (box.classList.contains('open') && !box.contains(e.target) && e.target.isConnected) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) { show(false); btn.focus(); } });
  render();
  subscribe(render);
  // (how you are changes with the time: hunger, wounds)
  setInterval(() => { if (!document.hidden) render(); }, 30000);
}
