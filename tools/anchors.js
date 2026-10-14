// Visual editor for js/gear-art.js ANCHORS: drag, size and turn each piece of equipment on each sprite.
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

const current = () => anchors[$('type').value][$('sex').value][$('slot').value];

function render() {
  const type = $('type').value, sex = $('sex').value, slot = $('slot').value;
  const equip = {};
  if ($('all').checked) for (const s of GEAR_SLOTS) equip[s.id] = gearFor(s.id)[0][0];
  equip[slot] = $('item').value;
  const art = dressedArt(type, PX, sex, equip);
  $('canvas').innerHTML = '';
  $('canvas').appendChild(art);
  // the layer for the chosen slot is the one being edited
  const order = GEAR_SLOTS.map(s => s.id).filter(s => equip[s]);
  const layers = [...art.querySelectorAll('.gear-layer')];
  const layer = layers[order.indexOf(slot)];
  layer.classList.add('active');
  makeDraggable(art, layer);
  const a = current();
  $('w').value = a.w; $('r').value = a.r || 0;
  $('readout').textContent = `x ${a.x.toFixed(3)} · y ${a.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${a.r || 0}°`;
  $('out').value = 'export const ANCHORS = ' + format(anchors) + ';\n';
}

function makeDraggable(box, layer) {
  layer.addEventListener('pointerdown', e => {
    e.preventDefault();
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const rect = box.getBoundingClientRect();
      const a = current();
      a.x = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientX - rect.left) / rect.width)) * 1000) / 1000;
      a.y = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientY - rect.top) / rect.height)) * 1000) / 1000;
      layer.style.left = (a.x * 100) + '%';
      layer.style.top = (a.y * 100) + '%';
      $('readout').textContent = `x ${a.x.toFixed(3)} · y ${a.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${a.r || 0}°`;
    };
    // listen on the whole window so a fast drag never loses the piece
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      save(); render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
}

// the same shape as js/gear-art.js, one sprite per line
function format(all) {
  const anchor = a => `{ x: ${a.x}, y: ${a.y}, w: ${a.w}, r: ${a.r || 0} }`;
  return '{\n' + ORDER.map(type => `  ${type}: {\n` + ['m', 'f'].map(sex =>
    `    ${sex}: { ` + GEAR_SLOTS.map(({ id }) => `${id}: ${anchor(all[type][sex][id])}`).join(', ') + ' },\n').join('') + '  },\n').join('') + '}';
}

for (const id of ['type', 'sex', 'item', 'all']) $(id).addEventListener('change', render);
$('slot').addEventListener('change', () => { fillItems(); render(); });
$('w').addEventListener('input', e => { current().w = +e.target.value; save(); render(); });
$('r').addEventListener('input', e => { current().r = +e.target.value; save(); render(); });
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
