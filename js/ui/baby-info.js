// Detail window for one baby, opened from its card in "Your babies": stats, combat numbers,
// equipment (equip and take off) and family.
import { SPECIES, SEX, ITEMS, GEAR_SLOTS, OUTFITS } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, isGear, outfitFits } from '../economy.js';
import { act } from '../actions.js';
import { dressedArt, ITEM_ICONS } from '../art.js';
import { esc, plural } from '../util.js';
import { statsHTML, powerText, genesText, derivedHTML, breakdownHTML, modsHTML } from './stats.js';
import { setTab } from './tabs.js';

const dialog = document.getElementById('babyDialog');
const body = document.getElementById('babyBody');
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
let openId = null, message = '';

const PROBLEMS = { room: 'Your inventory is full. Make room to take this off.' };

function parentsText(b) {
  if (!b.parents || !b.parents.length) return 'Hatched from a free egg';
  const names = b.parents.map(id => {
    const p = S.hatched.find(x => x.id === id);
    return p ? `${p.name} ${SEX[sexOf(p)].sym}` : 'a baby no longer in the nest';
  });
  return names.join(' and ');
}

function equipmentHTML(b) {
  const rows = GEAR_SLOTS.map(({ id: slot, name }) => {
    const worn = b.equip && b.equip[slot];
    // pieces in the bag that fit this slot, by inventory position
    const options = S.inv
      .map((x, i) => ({ x, i }))
      .filter(({ x, i }) => x && i < S.invSize && isGear(x.id) && ITEMS[x.id].slot === slot);
    return `<li class="gear-row">
      <span class="gear-slot-name">${name}</span>
      <div class="gear-worn">${worn
        ? `<span class="gear-icon">${ITEM_ICONS[worn]}</span><span><strong>${esc(ITEMS[worn].name)}</strong>${modsHTML(ITEMS[worn].mods)}</span>`
        : '<span class="hint">Empty</span>'}</div>
      <div class="gear-actions">
        ${options.length ? `<select data-slot="${slot}" aria-label="Choose ${name.toLowerCase()} equipment">${options.map(({ x, i }) => `<option value="${i}">${esc(ITEMS[x.id].name)}</option>`).join('')}</select>
          <button class="ghost" type="button" data-equip="${slot}">${worn ? 'Swap' : 'Equip'}</button>` : ''}
        ${worn ? `<button class="ghost" type="button" data-unequip="${slot}">Take off</button>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<ul class="gear-slots">${rows}</ul>
    <p class="hint">Equipment is bought with coins in the <button type="button" class="link" id="gearShop">Shop</button>. Some pieces raise one stat and lower another. Head and neck pieces show on the baby; body and back pieces only change its stats.</p>`;
}

// outfits: a whole new look, no stats
function lookHTML(b) {
  const owned = (S.wardrobe || []).filter(id => outfitFits(id, b));
  if (!owned.length) {
    return `<p class="hint">Outfits change how a baby looks without changing its stats. You don't have one for ${SPECIES[b.type].species} yet.</p>`;
  }
  return `<div class="row look-row">
      <select id="outfitSel" aria-label="Outfit">
        <option value="">Its own look</option>
        ${owned.map(id => `<option value="${id}" ${b.outfit === id ? 'selected' : ''}>${esc(OUTFITS[id].name)}</option>`).join('')}
      </select>
      <button class="ghost" type="button" id="outfitBtn">Wear</button>
    </div>
    <p class="hint">Outfits only change the look. While a baby wears one, its head and neck pieces aren't drawn, but still count.</p>`;
}

function render() {
  const b = S.hatched.find(x => x.id === openId);
  if (!b) { dialog.close(); return; }
  const sex = sexOf(b);
  body.innerHTML = `
    <div class="info-head">
      <div class="info-art"></div>
      <div>
        <h2 id="babyTitle">${esc(b.name)} ${SEX[sex].sym}</h2>
        <p class="hint">${SPECIES[b.type].species} · ${SEX[sex].word} · Gen ${b.gen || 1}</p>
        <p class="info-total">${powerText(b)}</p>
        <p class="hint">${genesText(b.genes)}</p>
      </div>
    </div>
    ${statsHTML(b)}
    <p class="hint grade-key">Letters grade the genes behind each stat: S 90+, A 75+, B 55+, C 35+, D below. Breed the best genes to raise them.</p>
    <h3>Look</h3>
    ${lookHTML(b)}
    <h3>Equipment</h3>
    ${equipmentHTML(b)}
    ${message ? `<p class="hint warn-text" role="status">${esc(message)}</p>` : ''}
    <h3>In combat</h3>
    ${derivedHTML(b)}
    <details class="how">
      <summary>How these numbers are worked out</summary>
      ${breakdownHTML(b)}
      <p class="hint">Each stat is the species' base scaled by the genes, from 50% at genes 0 to 100% at genes 100. Then equipment adds flat bonuses, then percentage bonuses (added together), then multipliers.</p>
    </details>
    <dl class="info-facts">
      <div><dt>Parents</dt><dd>${esc(parentsText(b))}</dd></div>
      <div><dt>Hatched</dt><dd>${dateFmt.format(new Date(b.at))}</dd></div>
      <div><dt>Meals</dt><dd>${plural(b.fed || 0, 'meal', 'meals')}</dd></div>
    </dl>`;
  body.querySelector('.info-art').appendChild(dressedArt(b.type, 8, sex, b.equip, b.outfit));

  body.querySelectorAll('[data-equip]').forEach(btn => btn.addEventListener('click', () => {
    const index = +body.querySelector(`select[data-slot="${btn.dataset.equip}"]`).value;
    const r = act('equip', { babyId: b.id, index });
    message = r.ok ? '' : PROBLEMS[r.reason] || 'That could not be equipped.';
    render();
  }));
  body.querySelectorAll('[data-unequip]').forEach(btn => btn.addEventListener('click', () => {
    const r = act('unequip', { babyId: b.id, slot: btn.dataset.unequip });
    message = r.ok ? '' : PROBLEMS[r.reason] || 'That could not be taken off.';
    render();
  }));
  document.getElementById('gearShop').addEventListener('click', () => { dialog.close(); setTab('shop'); });
  const wear = document.getElementById('outfitBtn');
  if (wear) wear.addEventListener('click', () => {
    const r = act('setOutfit', { babyId: b.id, outfitId: document.getElementById('outfitSel').value || null });
    message = r.ok ? '' : 'That outfit could not be worn.';
    render();
  });
}

export function openBabyInfo(id) {
  openId = id;
  message = '';
  render();
  if (!dialog.open) dialog.showModal();
}

export function initBabyInfo() {
  document.getElementById('babyClose').addEventListener('click', () => dialog.close());
  // a click on the dimmed backdrop closes it too
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { openId = null; });
  // keep the window in step with the server's answer
  subscribe(() => { if (dialog.open && openId && !body.contains(document.activeElement)) render(); });
}
