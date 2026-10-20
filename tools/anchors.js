// Visual editor for js/gear-art.js ANCHORS and SCAR_ANCHORS: place, size and turn each piece of
// equipment on each adult sprite (only adults wear equipment), and each scar on each sprite of every
// stage. Click or drag anywhere on the dinosaur: the chosen one goes there.
import { SPECIES, ORDER, ITEMS, GEAR_SLOTS, DRAWN_SLOTS, SCARS } from '../js/config.js';
import { ANCHORS, SCAR_ANCHORS } from '../js/gear-art.js';
import { dressedArt, adultSpriteUrl, scarAnchor } from '../js/art.js';

const KEY = 'cretaceous-nest:anchors', SCAR_KEY = 'cretaceous-nest:scar-anchors';
const TALL = 340;   // every sprite drawn this tall here
const PX = 20 / 1.5;   // adults are drawn 1.5× a baby's size: 340 px tall here
const $ = id => document.getElementById(id);

let anchors = structuredClone(ANCHORS);
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) anchors = saved; } catch (e) {}
let scarSet = structuredClone(SCAR_ANCHORS);
try { const saved = JSON.parse(localStorage.getItem(SCAR_KEY)); if (saved) scarSet = saved; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(anchors)); localStorage.setItem(SCAR_KEY, JSON.stringify(scarSet)); } catch (e) {} };
const scarring = () => $('mode').value === 'scars';
const PARTS = { head: 'Head (face)', neck: 'Neck', body: 'Flank', legs: 'Legs', tail: 'Tail' };

const gearFor = slot => Object.entries(ITEMS).filter(([, it]) => it.kind === 'gear' && it.slot === slot);
const fill = (sel, pairs) => { sel.innerHTML = pairs.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); };

// species with no adult sprite yet stay listed, marked, and show a note instead of a drawing
const hasAdult = type => adultSpriteUrl(type, 'm') || adultSpriteUrl(type, 'f');
fill($('type'), ORDER.map(k => [k, SPECIES[k].species + (hasAdult(k) ? '' : ' (no adult sprite yet)')]));
$('type').value = ORDER.find(hasAdult) || ORDER[0];
const fillSex = () => {
  const type = $('type').value, keep = $('sex').value;
  fill($('sex'), [['m', 'Male'], ['f', 'Female']].map(([v, t]) => [v, t + (adultSpriteUrl(type, v) ? '' : ' (no adult sprite yet)')]));
  $('sex').value = adultSpriteUrl(type, keep) ? keep : adultSpriteUrl(type, 'm') ? 'm' : adultSpriteUrl(type, 'f') ? 'f' : keep || 'm';
};
fillSex();
fill($('slot'), GEAR_SLOTS.filter(s => DRAWN_SLOTS.includes(s.id)).map(s => [s.id, s.name]));
const fillItems = () => fill($('item'), gearFor($('slot').value).map(([id, it]) => [id, it.name]));
fillItems();

const set = () => anchors[$('type').value][$('sex').value];
// a scar's place on this sprite: its own, once set here
const scarsOf = () => {
  const t = $('type').value, st = $('stage').value, sx = $('sex').value;
  scarSet[t] = scarSet[t] || {}; scarSet[t][st] = scarSet[t][st] || {}; scarSet[t][st][sx] = scarSet[t][st][sx] || {};
  return scarSet[t][st][sx];
};
// with the editor's own places in use, so what you see is what you have set so far
function withScars(fn) {
  const t = $('type').value, real = SCAR_ANCHORS[t];
  SCAR_ANCHORS[t] = scarSet[t];
  try { return fn(); } finally { if (real) SCAR_ANCHORS[t] = real; else delete SCAR_ANCHORS[t]; }
}
// the item's own fit, or its slot's as a starting point; a scar's own place, or where it goes now
const current = () => scarring() ? (scarsOf()[$('slot').value] || withScars(() => scarAnchor($('type').value, $('sex').value, $('slot').value, $('stage').value)))
  : set()[$('item').value] || set()[$('slot').value];
// the first change to an item copies its slot's fit into an entry of its own, so other items stay put
function editable() {
  if (scarring()) {
    const s = scarsOf(), part = $('slot').value;
    if (!s[part]) { const a = current(); s[part] = { x: a.x, y: a.y, w: Math.round(a.w * (part === 'head' ? 0.55 : 0.6) * 100) / 100, r: a.r || 0 }; }
    return s[part];
  }
  const s = set(), id = $('item').value;
  if (!s[id]) s[id] = { ...s[$('slot').value] };
  return s[id];
}
const showReadout = a => {
  if (scarring()) { $('readout').textContent = `x ${a.x.toFixed(3)} · y ${a.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${a.r || 0}° · ${scarsOf()[$('slot').value] ? 'its own place' : 'guessed from the equipment places, not set yet'}`; return; }
  const own = !!set()[$('item').value];
  $('readout').textContent = `x ${a.x.toFixed(3)} · y ${a.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${a.r || 0}°${a.m ? ' · mirrored' : ''} · ${own ? 'this item’s own fit' : 'slot default, not tuned yet'}`;
};

let art = null, active = null;

function renderScars() {
  const type = $('type').value, sex = $('sex').value, part = $('slot').value, stage = $('stage').value;
  const all = Object.fromEntries(SCARS.parts.map(pt => [pt, SCARS.deep]));
  art = withScars(() => dressedArt(type, 10, sex, null, null, stage, all));
  const base = art.querySelector('.dino-base');
  if (base && base.tagName === 'IMG') base.style.height = TALL + 'px';
  $('canvas').innerHTML = '';
  $('canvas').appendChild(art);
  active = art.querySelector(`.scar-layer[data-part="${part}"]`);
  if (active) active.classList.add('active');
  const a = current();
  if (a) { $('w').value = a.w; $('r').value = a.r || 0; showReadout(a); }
  $('out').value = output();
}
// Drops the species, stages and sexes with nothing placed
const prune = (o) => {
  if (!o || typeof o !== 'object' || 'x' in o) return o;
  const kept = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, prune(v)]).filter(([, v]) => v));
  return Object.keys(kept).length ? kept : undefined;
};
const output = () => 'export const ANCHORS = ' + format(anchors) + ';\n\nexport const SCAR_ANCHORS = ' + JSON.stringify(prune(scarSet) || {}, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 2) + ';\n';

function render() {
  for (const [id, on] of [['stageField', scarring()], ['itemField', !scarring()], ['mField', !scarring()], ['allField', !scarring()]]) $(id).hidden = !on;
  $('slotLabel').textContent = scarring() ? 'Scar' : 'Slot';
  if (scarring()) return renderScars();
  const type = $('type').value, sex = $('sex').value, slot = $('slot').value;
  if (!adultSpriteUrl(type, sex)) {
    art = active = null;
    $('canvas').innerHTML = `<p class="hint">There is no adult ${sex === 'm' ? 'male' : 'female'} ${SPECIES[type].species} sprite yet. Add it as sprites/adult/${type}-${sex}.png and list it in ADULT_SPRITES in js/art.js.</p>`;
    $('readout').textContent = '';
    $('out').value = output();
    return;
  }
  const equip = {};
  if ($('all').checked) for (const id of DRAWN_SLOTS) equip[id] = gearFor(id)[0][0];
  equip[slot] = $('item').value;
  // the editor draws with its own anchors, so what you see is what you have set so far
  const real = ANCHORS[type][sex];
  ANCHORS[type][sex] = anchors[type][sex];
  art = dressedArt(type, PX, sex, equip, null, 'adult');
  ANCHORS[type][sex] = real;
  $('canvas').innerHTML = '';
  $('canvas').appendChild(art);
  const order = Object.keys(equip);
  active = [...art.querySelectorAll('.gear-layer')][order.indexOf(slot)];
  active.classList.add('active');
  const a = current();
  $('w').value = a.w; $('r').value = a.r || 0; $('m').checked = !!a.m;
  showReadout(a);
  $('out').value = output();
}

// pointer anywhere on the dinosaur: the chosen piece jumps there and follows until released
$('canvas').addEventListener('pointerdown', e => {
  if (!art || !art.contains(e.target)) return;
  e.preventDefault();
  const place = ev => {
    const rect = art.getBoundingClientRect();
    const a = editable();
    a.x = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientX - rect.left) / rect.width)) * 1000) / 1000;
    a.y = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientY - rect.top) / rect.height)) * 1000) / 1000;
    if (active) { active.style.left = (a.x * 100) + '%'; active.style.top = (a.y * 100) + '%'; }
    showReadout(a);
  };
  place(e);
  const move = ev => { if (ev.pointerId === e.pointerId) place(ev); };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    save(); render();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
});

// the same shape as js/gear-art.js: per sprite, the slot defaults, then each tuned item
function format(all) {
  const anchor = a => `{ x: ${a.x}, y: ${a.y}, w: ${a.w}, r: ${a.r || 0}${a.m ? ', m: true' : ''} }`;
  const keys = s => [...GEAR_SLOTS.map(g => g.id), ...Object.keys(ITEMS).filter(id => s[id])];
  return '{\n' + ORDER.map(type => `  ${type}: {\n` + ['m', 'f'].map(sex => {
    const s = all[type][sex];
    return `    ${sex}: {\n` + keys(s).map(k => `      ${k}: ${anchor(s[k])},\n`).join('') + '    },\n';
  }).join('') + '  },\n').join('') + '}';
}

for (const id of ['sex', 'item', 'all']) $(id).addEventListener('change', render);
$('type').addEventListener('change', () => { fillSex(); render(); });
$('slot').addEventListener('change', () => { if (!scarring()) fillItems(); render(); });
$('stage').addEventListener('change', render);
$('mode').addEventListener('change', () => {
  if (scarring()) fill($('slot'), SCARS.parts.map(pt => [pt, PARTS[pt]]));
  else { fill($('slot'), GEAR_SLOTS.filter(g => DRAWN_SLOTS.includes(g.id)).map(g => [g.id, g.name])); fillItems(); }
  render();
});
$('w').addEventListener('input', e => { editable().w = +e.target.value; save(); render(); });
$('r').addEventListener('input', e => { editable().r = +e.target.value; save(); render(); });
$('m').addEventListener('change', e => { const a = editable(); if (e.target.checked) a.m = true; else delete a.m; save(); render(); });
$('resetItem').addEventListener('click', () => {
  if (scarring()) { delete scarsOf()[$('slot').value]; save(); render(); $('msg').textContent = 'This scar is back to its guessed place.'; return; }
  delete set()[$('item').value];
  save(); render();
  $('msg').textContent = `${ITEMS[$('item').value].name} is back to its slot's default fit on this sprite.`;
});
$('reset').addEventListener('click', () => {
  const type = $('type').value, sex = $('sex').value;
  if (scarring()) { const st = $('stage').value; if (scarSet[type] && scarSet[type][st]) scarSet[type][st][sex] = structuredClone(((SCAR_ANCHORS[type] || {})[st] || {})[sex] || {}); save(); render(); $('msg').textContent = 'These scars are back to js/gear-art.js.'; return; }
  anchors[type][sex] = structuredClone(ANCHORS[type][sex]);
  save(); render();
  $('msg').textContent = 'This sprite is back to the anchors in js/gear-art.js.';
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('out').value); $('msg').textContent = 'Copied. Paste it into js/gear-art.js, or send it to Claude.'; }
  catch (e) { $('out').select(); $('msg').textContent = 'Select the text below and copy it.'; }
});
render();
