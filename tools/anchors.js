// Visual editor for js/gear-art.js ANCHORS: place, size and turn each piece of equipment on each
// official baby sprite. Click or drag anywhere on the baby: the chosen piece goes there.
import { SPECIES, ORDER, ITEMS, GEAR_SLOTS } from '../js/config.js';
import { ANCHORS } from '../js/gear-art.js';
import { dressedArt } from '../js/art.js';

const KEY = 'cretaceous-nest:anchors';
const PX = 20;   // sprite drawn 340 px tall
const $ = id => document.getElementById(id);

let anchors = structuredClone(ANCHORS);
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) anchors = saved; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(anchors)); } catch (e) {} };

const gearFor = slot => Object.entries(ITEMS).filter(([, it]) => it.kind === 'gear' && it.slot === slot);
const fill = (sel, pairs) => { sel.innerHTML = pairs.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); };

fill($('type'), ORDER.map(k => [k, SPECIES[k].species]));
fill($('slot'), GEAR_SLOTS.map(s => [s.id, s.name]));
const fillItems = () => fill($('item'), gearFor($('slot').value).map(([id, it]) => [id, it.name]));
fillItems();

const set = () => anchors[$('type').value][$('sex').value];
// the item's own fit, or its slot's as a starting point
const current = () => set()[$('item').value] || set()[$('slot').value];
// the first change to an item copies its slot's fit into an entry of its own, so other items stay put
function editable() {
  const s = set(), id = $('item').value;
  if (!s[id]) s[id] = { ...s[$('slot').value] };
  return s[id];
}
const showReadout = a => {
  const own = !!set()[$('item').value];
  $('readout').textContent = `x ${a.x.toFixed(3)} · y ${a.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${a.r || 0}° · ${own ? 'this item’s own fit' : 'slot default, not tuned yet'}`;
};

let art = null, active = null;

function render() {
  const type = $('type').value, sex = $('sex').value, slot = $('slot').value;
  const equip = {};
  if ($('all').checked) for (const s of GEAR_SLOTS) equip[s.id] = gearFor(s.id)[0][0];
  equip[slot] = $('item').value;
  // the editor draws with its own anchors, so what you see is what you have set so far
  const real = ANCHORS[type][sex];
  ANCHORS[type][sex] = anchors[type][sex];
  art = dressedArt(type, PX, sex, equip);
  ANCHORS[type][sex] = real;
  $('canvas').innerHTML = '';
  $('canvas').appendChild(art);
  const order = Object.keys(equip);
  active = [...art.querySelectorAll('.gear-layer')][order.indexOf(slot)];
  active.classList.add('active');
  const a = current();
  $('w').value = a.w; $('r').value = a.r || 0;
  showReadout(a);
  $('out').value = 'export const ANCHORS = ' + format(anchors) + ';\n';
}

// pointer anywhere on the baby: the chosen piece jumps there and follows until released
$('canvas').addEventListener('pointerdown', e => {
  if (!art || !art.contains(e.target)) return;
  e.preventDefault();
  const place = ev => {
    const rect = art.getBoundingClientRect();
    const a = editable();
    a.x = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientX - rect.left) / rect.width)) * 1000) / 1000;
    a.y = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientY - rect.top) / rect.height)) * 1000) / 1000;
    active.style.left = (a.x * 100) + '%';
    active.style.top = (a.y * 100) + '%';
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
  const anchor = a => `{ x: ${a.x}, y: ${a.y}, w: ${a.w}, r: ${a.r || 0} }`;
  const keys = s => [...GEAR_SLOTS.map(g => g.id), ...Object.keys(ITEMS).filter(id => s[id])];
  return '{\n' + ORDER.map(type => `  ${type}: {\n` + ['m', 'f'].map(sex => {
    const s = all[type][sex];
    return `    ${sex}: {\n` + keys(s).map(k => `      ${k}: ${anchor(s[k])},\n`).join('') + '    },\n';
  }).join('') + '  },\n').join('') + '}';
}

for (const id of ['type', 'sex', 'item', 'all']) $(id).addEventListener('change', render);
$('slot').addEventListener('change', () => { fillItems(); render(); });
$('w').addEventListener('input', e => { editable().w = +e.target.value; save(); render(); });
$('r').addEventListener('input', e => { editable().r = +e.target.value; save(); render(); });
$('resetItem').addEventListener('click', () => {
  delete set()[$('item').value];
  save(); render();
  $('msg').textContent = `${ITEMS[$('item').value].name} is back to its slot's default fit on this sprite.`;
});
$('reset').addEventListener('click', () => {
  const type = $('type').value, sex = $('sex').value;
  anchors[type][sex] = structuredClone(ANCHORS[type][sex]);
  save(); render();
  $('msg').textContent = 'This sprite is back to the anchors in js/gear-art.js.';
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('out').value); $('msg').textContent = 'Copied. Paste it into js/gear-art.js, or send it to Claude.'; }
  catch (e) { $('out').select(); $('msg').textContent = 'Select the text below and copy it.'; }
});
render();
