// Detail window for one baby, opened from its card in "Your babies": stats, combat numbers,
// equipment (equip and take off) and family.
import { SPECIES, SEX, ITEMS, GEAR_SLOTS, OUTFITS, STAGES, FRILL, ROLES } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, isGear, outfitFits, isAdult, wornGear, stageOf, nextStage, mealsFor, grownIn, ageOf, carriedWeight, carryCapacity, itemWeight, countItem } from '../economy.js';
import { frillOf } from '../world.js';
import { act } from '../actions.js';
import { dressedArt, ITEM_ICONS, sharpen, sideOf, face } from '../art.js';
import { esc, plural, ageLabel, realSpan } from '../util.js';
import { now } from '../clock.js';
import { scarLevels, woundsOf } from '../journey.js';
import { CREATURES } from '../config.js';

// its scars, and who gave them (only seen: they change nothing)
const PART = { head: 'Head', neck: 'Neck', body: 'Flank', legs: 'Legs', tail: 'Tail' };
function scarsHTML(b) {
  const lv = scarLevels(b), list = Object.entries(lv).filter(([, l]) => l);
  if (!list.length) return '';
  const by = id => (SPECIES[id] ? SPECIES[id].species : CREATURES[id] ? CREATURES[id].name : null);
  return `<div><dt>Scars</dt><dd>${list.map(([pt, l]) => `${PART[pt]} (${pt === 'head' && b.blind ? b.blind : sideOf(b.id, pt)} side)${l === 2 ? ', deep' : ''}${pt === 'head' && b.blind ? `, across its ${b.blind} eye, blind` : ''}${b.scarBy && by(b.scarBy[pt]) ? ` (a ${esc(by(b.scarBy[pt]))})` : ''}`).join('; ')}</dd></div>`;
}
import { statsHTML, powerText, genesText, derivedHTML, breakdownHTML, modsHTML, loadHTML } from './stats.js';
import { setTab } from './tabs.js';

const dialog = document.getElementById('babyDialog');
const body = document.getElementById('babyBody');
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
let openId = null, message = '';

const PROBLEMS = { room: 'Your inventory is full. Make room to take this off.', 'not-adult': 'Only adults can wear equipment.', 'too-heavy': 'Too heavy: that would be more than it can carry.' };

// a Triceratops' frill: its own health, mended a point at a time with Healing Herbs
function frillHTML(b) {
  const f = frillOf(b);
  if (f === null) return '';
  const herbs = countItem(S, 'herb');
  return `<div class="frill">
    <div class="frill-head"><strong>Frill</strong> <span class="hint">${f} / ${FRILL.hp}${f === 0 ? ' · broken' : ''}</span></div>
    <span class="frill-bar" aria-hidden="true">${Array.from({ length: FRILL.hp }, (_, i) => `<i class="${i < f ? 'on' : ''}"></i>`).join('')}</span>
    <p class="hint">Blows on its head hit the frill instead, and it gores back with its horns. A broken frill lets head blows through. It doesn't grow back by itself.</p>
    ${f < FRILL.hp ? `<div class="row"><button class="ghost" type="button" id="mendFrill" ${herbs ? '' : 'disabled'}>Mend with a Healing Herb (${herbs})</button><span class="hint">+1 each</span></div>` : ''}
  </div>`;
}

function parentsText(b) {
  if (!b.parents || !b.parents.length) return 'Hatched from a free egg';
  const names = b.parents.map(id => {
    const p = S.hatched.find(x => x.id === id);
    return p ? `${p.name} ${SEX[sexOf(p)].sym}` : 'a baby no longer in the nest';
  });
  return names.join(' and ');
}

function equipmentHTML(b) {
  const adult = isAdult(b);
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
        ${adult && options.length ? `<select data-slot="${slot}" aria-label="Choose ${name.toLowerCase()} equipment">${options.map(({ x, i }) => {
          // how heavy it is, and whether it would push the load past what this dinosaur can carry
          const over = carriedWeight(b) - itemWeight(worn) + itemWeight(x.id) > carryCapacity(b);
          return `<option value="${i}">${esc(ITEMS[x.id].name)} · weight ${itemWeight(x.id)}${over ? ' · too heavy' : ''}</option>`;
        }).join('')}</select>
          <button class="ghost" type="button" data-equip="${slot}">${worn ? 'Swap' : 'Equip'}</button>` : ''}
        ${worn ? `<button class="ghost" type="button" data-unequip="${slot}">Take off</button>` : ''}
      </div>
    </li>`;
  }).join('');
  const next = nextStage(b);
  const until = next && realSpan(grownIn(b, mealsFor(b, STAGES[STAGES.length - 1]) - (b.fed || 0), now()));
  return `${adult ? '' : `<p class="hint"><strong>Only adults can wear equipment.</strong> ${esc(b.name)} grows up in ${until}. Anything it already wears does nothing until then and can be taken off.</p>`}
    ${loadHTML(b)}
    <ul class="gear-slots">${rows}</ul>
    <p class="hint">Equipment is bought with coins in the <button type="button" class="link" id="gearShop">Shop</button>. Every piece has a weight: big, strong dinosaurs carry more, and a load over half of what one can carry costs agility. Head and neck pieces show on the dinosaur; body and back pieces only change its stats.</p>`;
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
      <button class="info-art" type="button" aria-label="See ${esc(b.name)} up close" title="See up close"></button>
      <div>
        <h2 id="babyTitle">${esc(b.name)} ${SEX[sex].sym}</h2>
        <p class="hint">${SPECIES[b.type].species} · ${SEX[sex].word} · Gen ${b.gen || 1}</p>
        ${ROLES[b.type] ? `<p class="hint"><strong>${esc(ROLES[b.type].role)}.</strong> ${esc(ROLES[b.type].text)}</p>` : ''}
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
    ${frillHTML(b)}
    <details class="how">
      <summary>How these numbers are worked out</summary>
      ${breakdownHTML(b)}
      <p class="hint">Each stat is the species' base scaled by the genes, from 50% at genes 0 to 100% at genes 100. Then equipment adds flat bonuses, then percentage bonuses (added together), then multipliers.</p>
    </details>
    <dl class="info-facts">
      <div><dt>Parents</dt><dd>${esc(parentsText(b))}</dd></div>
      <div><dt>Hatched</dt><dd>${dateFmt.format(new Date(b.at))}</dd></div>
      <div><dt>Age</dt><dd>${ageLabel(ageOf(b, now()))}</dd></div>
      ${scarsHTML(b)}
      <div><dt>Days of growing</dt><dd>${b.fed || 0}</dd></div>
      <div><dt>Stage</dt><dd>${stageOf(b).name}${nextStage(b) ? ` (${nextStage(b).stage.name} in ${realSpan(grownIn(b, nextStage(b).mealsLeft, now()))})` : ''}</dd></div>
    </dl>`;
  body.querySelector('.info-art').appendChild(dressedArt(b.type, 8, sex, wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, now()), b.sewn, b.id, b.blind));
  body.querySelector('.info-art').addEventListener('click', () => openZoom(b));

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
  const mend = document.getElementById('mendFrill');
  if (mend) mend.addEventListener('click', () => {
    const r = act('mendFrill', { babyId: b.id });
    message = r.ok ? '' : r.reason === 'away' ? 'It is out exploring.' : 'No Healing Herbs.';
    render();
  });
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

// A dinosaur up close: as big as its drawing goes without a pixel stretched (and no bigger than the
// screen). An animated one stands still on its first frame, drawn from the drawing at its full size.
let zoomBox = null;
function openZoom(b) {
  if (!zoomBox) {
    zoomBox = document.createElement('dialog');
    zoomBox.className = 'dino-zoom';
    zoomBox.addEventListener('click', () => zoomBox.close());
    document.body.appendChild(zoomBox);
  }
  const art = dressedArt(b.type, 8, sexOf(b), wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, now()), b.sewn, b.id, b.blind);
  const base = art.querySelector('.dino-base') || art;
  zoomBox.innerHTML = `<p class="zoom-name">${esc(b.name)} <button class="ghost" type="button" data-turn>Turn around</button> <span class="hint">Tap anywhere else to close</span></p>`;
  zoomBox.prepend(art);
  // (it faces right, its left side showing; turned, its right side and the scars on it)
  let dir = 1;
  zoomBox.querySelector('[data-turn]').addEventListener('click', e => { e.stopPropagation(); dir = -dir; face(art, dir); });
  const fitTo = (w, h) => {
    const dpr = window.devicePixelRatio || 1;
    const tall = Math.min(h / dpr, innerHeight * 0.82, innerWidth * 0.92 * h / w);
    base.style.height = Math.round(tall) + 'px';
  };
  const s = base.sheet;
  if (s) {
    if (s.hiresW) { sharpen(base); base.hold = 0; fitTo(s.hiresW, s.h * s.hiresW / s.w); }
    else fitTo(s.w, s.h);
  } else if (base.tagName === 'IMG') {
    const size = () => fitTo(base.naturalWidth, base.naturalHeight);
    if (base.complete && base.naturalWidth) size(); else base.addEventListener('load', size, { once: true });
  } else fitTo(base.width || 240, base.height || 240);
  zoomBox.showModal();
}
