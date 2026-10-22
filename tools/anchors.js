// Visual editor for js/gear-art.js ANCHORS and SCAR_ANCHORS: place, size and turn each piece of
// equipment on each adult sprite (only adults wear equipment), and each scar on each sprite of every
// stage. Click or drag anywhere on the dinosaur: the chosen one goes there.
import { SPECIES, ORDER, ITEMS, GEAR_SLOTS, DRAWN_SLOTS, SCARS } from '../js/config.js';
import { ANCHORS, SCAR_ANCHORS } from '../js/gear-art.js';
import { dressedArt, adultSpriteUrl, scarAnchor, placeOn, drawFrame, sharpen, sheetFor, eyeTrack, SCAR_LOOKS, SPREAD } from '../js/art.js';

const KEY = 'cretaceous-nest:anchors', SCAR_KEY = 'cretaceous-nest:scar-anchors';
const TALL = 340;   // every sprite drawn this tall here, times the zoom
let zoom = 1;
const PX = 20 / 1.5;   // adults are drawn 1.5× a baby's size: 340 px tall here
const $ = id => document.getElementById(id);

let anchors = structuredClone(ANCHORS);
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) anchors = saved; } catch (e) {}
let scarSet = structuredClone(SCAR_ANCHORS);
try { const saved = JSON.parse(localStorage.getItem(SCAR_KEY)); if (saved) scarSet = saved; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(anchors)); localStorage.setItem(SCAR_KEY, JSON.stringify(scarSet)); } catch (e) {} };
const scarring = () => $('mode').value === 'scars';
const PARTS = { head: 'Head (face)', neck: 'Neck', body: 'Flank', legs: 'Legs', tail: 'Tail' };
// a part may have several scars: part, part~2, part~3...
const baseOf = key => key.split('~')[0];
const label = key => PARTS[baseOf(key)] + (key.includes('~') ? ' ' + key.split('~')[1] : '');
const keysOn = pt => Object.keys(scarsOf()).filter(k => baseOf(k) === pt).sort((a, b) => (+a.split('~')[1] || 1) - (+b.split('~')[1] || 1));

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
const LOOKS = { claw: 'Claws', bigBite: 'Big bite', bite: 'Bite', horns: 'Horns', club: 'Club', stomp: 'Stomp', butt: 'Head-butt', croc: 'Crocodile', any: 'Any other' };
fill($('look'), SCAR_LOOKS.map(k => [k, LOOKS[k] || k]));
$('look').value = 'claw';
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
// The look being placed: the deep one (open wound, deep scar, sewn up) or the superficial one (marked,
// a wound closing), each with its place; the deep one starts where the superficial one is
const DEEP_VIEWS = ['2', 'd1', 'd0.66', 'd0.33', 's1', 's0.6', 's0.25', 'h'];
const deepView = () => DEEP_VIEWS.includes($('wound').value);
const lookOf = (a, make) => (!a || !deepView() ? a : a.deep || (make ? (a.deep = { x: a.x, y: a.y, w: a.w, r: a.r || 0 }) : a));
const current = () => scarring() ? (lookOf(scarsOf()[$('slot').value]) || withScars(() => scarAnchor($('type').value, $('sex').value, $('slot').value, $('stage').value)))
  : set()[$('item').value] || set()[$('slot').value];
// the first change to an item copies its slot's fit into an entry of its own, so other items stay put
function editable() {
  if (scarring()) {
    return lookOf(scarsOf()[$('slot').value], true) || null;
  }
  const s = set(), id = $('item').value;
  if (!s[id]) s[id] = { ...s[$('slot').value] };
  return s[id];
}
const showReadout = a => {
  if (scarring() && !scarsOf()[$('slot').value]) { $('readout').textContent = 'Not on this drawing: add it to place it.'; return; }
  if (scarring()) { const b = here(a); $('readout').textContent = `x ${b.x.toFixed(3)} · y ${b.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${Math.round(b.r || 0)}° · ${deepView() ? 'the deep look' + ((scarsOf()[$('slot').value] || {}).deep ? '' : ', where the superficial one is until moved') : 'the superficial look'}`; return; }
  const own = !!set()[$('item').value];
  $('readout').textContent = `x ${a.x.toFixed(3)} · y ${a.y.toFixed(3)} · w ${a.w.toFixed(2)} · r ${a.r || 0}°${a.m ? ' · mirrored' : ''} · ${own ? 'this item’s own fit' : 'slot default, not tuned yet'}`;
};

let art = null, active = null;
// the animated drawing, when there is one: its canvas, and the frame held (null while it plays)
let sheetCv = null, held = 0, mark = null, eyeRing = null;
const frames = () => (sheetCv ? sheetCv.sheet.frames : 1);
const frameNow = () => (sheetCv ? (held != null ? held : Math.max(0, sheetCv.drawn)) : 0);
// a scar's place at the frame on screen
const here = a => (sheetCv ? placeOn(sheetCv.sheet, a, frameNow()) : a);
const keysOf = a => (a && a.f ? Object.keys(a.f).map(Number).sort((p, q) => p - q) : []);

function renderScars() {
  const type = $('type').value, sex = $('sex').value, part = $('slot').value, stage = $('stage').value;
  const shown = $('wound').value, scar = ['2', '1', 'h'].includes(shown);
  // (only the scars added to this drawing are drawn)
  const placed = SCARS.parts.filter(pt => keysOn(pt).length);
  const all = Object.fromEntries(placed.map(pt => [pt, shown === '1' ? SCARS.marked : SCARS.deep]));
  const look = Object.fromEntries(placed.map(pt => [pt, $('look').value]));
  const sewn = shown[0] === 's', open = scar ? 0 : +shown.slice(1);
  const wounds = open && placed.length ? { parts: Object.fromEntries(placed.map(pt => [pt, open])), by: $('look').value, deep: shown[0] === 'm' ? [] : placed, ...(sewn ? { stitched: true } : {}) } : null;
  art = withScars(() => dressedArt(type, 10, sex, null, null, stage, all, look, wounds, shown === 'h' ? placed : null, seed, $('eyeBlind').checked ? 'left' : null));
  // (with none, the plain drawing: boxed the same, to be clicked the same)
  if (!art.classList.contains('dino-art')) { const box = document.createElement('span'); box.className = 'dino-art'; art.classList.add('dino-base'); box.appendChild(art); art = box; }
  const base = art.querySelector('.dino-base');
  fill($('slot'), SCARS.parts.flatMap(pt => keysOn(pt).length ? keysOn(pt).map(k => [k, '✓ ' + label(k)]) : [[pt, PARTS[pt]]]));
  $('slot').value = part;
  if ($('slot').value !== part) $('slot').value = keysOn(baseOf(part))[0] || baseOf(part);
  const on = !!scarsOf()[$('slot').value];
  $('addScar').hidden = on; $('anotherScar').hidden = !on; $('removeScar').hidden = !on;
  // (the eye, its ring)
  const eye = scarsOf().eye;
  $('eyeR').value = eye ? eye.r : 0.02; $('eyeR').disabled = !eye; $('eyeRNo').textContent = eye ? (eye.r * 100).toFixed(2) + '%' : 'not set';
  $('eyeH').value = eye && eye.h ? eye.h : 1; $('eyeH').disabled = !eye; $('eyeHNo').textContent = eye ? (eye.h && eye.h < 1 ? Math.round(eye.h * 100) + '% as tall as wide' : 'round') : '';
  $('eyeA').value = eye ? eye.a || 0 : 0; $('eyeA').disabled = !eye; $('eyeANo').textContent = eye ? (eye.a || 0) + '°' : '';
  eyeRing = null;
  if (eye) {
    const ring = eyeRing = document.createElement('span');
    ring.className = 'eye-ring';
    Object.assign(ring.style, { left: eye.x * 100 + '%', top: eye.y * 100 + '%', width: eye.r * 2 * 100 + '%', aspectRatio: String(1 / (eye.h || 1)), rotate: (eye.a || 0) + 'deg' });
    art.appendChild(ring);
  }
  // (the feathers painted on it)
  const feathers = scarsOf().feathers || [];
  $('brushNo').textContent = (+$('brush').value * 100).toFixed(1) + '%';
  $('featherPaint').textContent = feathering ? 'Done painting' : 'Paint feathers';
  if (feathers.length || feathering) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('feather-paint');
    svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none');
    art.appendChild(svg);
    featherSvg = svg;
    drawFeathers();
  } else featherSvg = null;
  $('stay').disabled = !on; $('stay').checked = !!(on && scarsOf()[$('slot').value].stay);
  const sp = (on && scarsOf()[$('slot').value].spread) || SPREAD;
  for (const [id, v, t] of [['spreadD', sp.d, (sp.d * 100).toFixed(1) + '%'], ['spreadR', sp.r, '±' + sp.r + '°'], ['spreadS', sp.s, '±' + Math.round(sp.s * 100) + '%']]) { $(id).value = v; $(id).disabled = !on; $(id + 'No').textContent = t; }
  // (the ring it falls within, round the place as shown)
  const shownAt = on && lookOf(scarsOf()[$('slot').value]);
  if (shownAt && sp.d) {
    const ring = document.createElement('span'), r = sp.d * 2 * 100;
    ring.className = 'spread-ring';
    Object.assign(ring.style, { left: shownAt.x * 100 + '%', top: shownAt.y * 100 + '%', width: r + '%', aspectRatio: '1' });
    art.appendChild(ring);
  }
  if (base) base.style.height = TALL * zoom + 'px';
  // (zoomed in, drawn from the drawing at its full size)
  if (base && base.sheet && zoom > 1) sharpen(base);
  sheetCv = base && base.sheet ? base : null;
  $('canvas').innerHTML = '';
  $('canvas').appendChild(art);
  $('framesField').hidden = !sheetCv;
  mark = null;
  if (sheetCv) {
    // the editor's own places, so a drag shows at once
    sheetCv.scars = sheetCv.scars.map(([a, mark, pt, main, ...rest]) => { const own = scarsOf()[pt]; return [own ? (mark.deep && own.deep ? own.deep : own) : a, mark, pt, own || main, ...rest]; });
    sheetCv.hold = held;
    $('frame').max = frames() - 1;
    if (held != null) $('frame').value = held;
    mark = document.createElement('span');
    mark.className = 'scar-mark';
    art.appendChild(mark);
  }
  active = art.querySelector(`.scar-layer[data-part="${part}"]`);
  if (active) active.classList.add('active');
  const a = current();
  if (a) { $('w').value = a.w; $('r').value = Math.round(here(a).r || 0); showReadout(a); }
  showFrame();
  const colour = o => o && (o.c || (o.deep && o.deep.c));
  const own = colour(scarsOf()[part]), other = Object.values(scarsOf()).map(colour).find(Boolean);
  $('swatch').style.background = own || other || SPECIES[type].body;
  $('swatch').title = own ? 'Picked for this part' : other ? 'Picked on another part of this drawing' : 'The species colour, not picked yet';
  $('out').value = output();
}
// the frame, its keys, and the dashed box round the scar being placed, where it is now
function showFrame() {
  if (!scarring() || !sheetCv) return;
  const a = current(), k = frameNow(), keys = keysOf(lookOf(scarsOf()[$('slot').value]));
  $('frameNo').textContent = `${k + 1} of ${frames()}` + (k === 0 || keys.includes(k) ? ' · a key' : '');
  $('keys').textContent = keys.length ? `Keys on frames 1, ${keys.map(f => f + 1).join(', ')}.` : 'It moves with the skin under it by itself. To steer it yourself, move it on a frame: that frame becomes a key.';
  $('play').textContent = held == null ? 'Stop' : 'Play';
  if (mark) mark.hidden = !scarsOf()[$('slot').value];
  // (the eye's ring follows the eye, found in each frame)
  const eye = scarsOf().eye;
  if (eyeRing && eye) {
    const s = sheetCv.sheet, t = eyeTrack(s, eye), k = frameNow(), shut = t && Number.isNaN(t[k * 3]);
    const dx = t && !shut ? t[k * 3] / s.w : 0, dy = t && !shut ? t[k * 3 + 1] / s.h : 0, turn = t && !shut ? t[k * 3 + 2] : 0;
    Object.assign(eyeRing.style, { left: (eye.x + dx) * 100 + '%', top: (eye.y + dy) * 100 + '%', rotate: ((eye.a || 0) + turn) + 'deg', opacity: shut ? 0.3 : 1 });
  }
  if (mark && a) {
    const b = here(a);
    Object.assign(mark.style, { left: (b.x * 100) + '%', top: (b.y * 100) + '%', width: (a.w * 100) + '%', height: (a.w * sheetCv.sheet.w / sheetCv.sheet.h * 100) + '%', rotate: (b.r || 0) + 'deg' });
  }
}
(function follow() { if (held == null) { showFrame(); if (sheetCv) $('frame').value = frameNow(); } requestAnimationFrame(follow); })();
const hold = k => { held = k; if (sheetCv) { sheetCv.hold = k; drawFrame(sheetCv, k); } $('frame').value = k; };
// sets where the scar is at the frame on screen: frame 1 is the place itself, any other a key
function placeAt(a, x, y, r) {
  const k = frameNow();
  if (!sheetCv || k === 0) { if (x != null) { a.x = x; a.y = y; } if (r != null) a.r = r; return; }
  const b = here(a);
  a.f = a.f || {};
  a.f[k] = [x != null ? x : Math.round(b.x * 1000) / 1000, y != null ? y : Math.round(b.y * 1000) / 1000, r != null ? r : Math.round(b.r || 0)];
}


// Drops the species, stages and sexes with nothing placed
const prune = (o) => {
  if (Array.isArray(o)) return o.length ? o : undefined;
  if (!o || typeof o !== 'object' || 'x' in o) return o;
  const kept = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, prune(v)]).filter(([, v]) => v));
  return Object.keys(kept).length ? kept : undefined;
};
const output = () => 'export const ANCHORS = ' + format(anchors) + ';\n\nexport const SCAR_ANCHORS = ' + JSON.stringify(prune(scarSet) || {}, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 2) + ';\n';

function render() {
  for (const [id, on] of [['stageField', scarring()], ['lookField', scarring()], ['woundField', scarring()], ['skinField', scarring()], ['scarAddRow', scarring()], ['stayField', scarring()], ['spreadField', scarring()], ['eyeField', scarring()], ['featherField', scarring()], ['resetItem', !scarring()], ['itemField', !scarring()], ['mField', !scarring()], ['allField', !scarring()]]) $(id).hidden = !on;
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
  const gearBase = art.querySelector('.dino-base');
  if (gearBase) gearBase.style.height = TALL * zoom + 'px';
  if (gearBase && gearBase.sheet && zoom > 1) sharpen(gearBase);
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

// The skin's colour where a scar goes, picked off the drawing (the frame on screen, without its scars):
// a sewn-up wound heals into it
let picking = false, eyeing = false, feathering = false, featherSvg = null;
// the feather circles drawn over the drawing (an ellipse each, the drawing not square)
function drawFeathers() {
  if (!featherSvg) return;
  const r = art.getBoundingClientRect(), aspect = r.width && r.height ? r.width / r.height : 2;
  featherSvg.innerHTML = (scarsOf().feathers || []).map(([x, y, rr]) => `<ellipse cx="${x * 1000}" cy="${y * 1000}" rx="${rr * 1000}" ry="${rr * 1000 * aspect}"/>`).join('');
}
// the dinosaur shown: none (each scar right in its place) or one picked at random, to see where its
// scars fall
let seed = null;
const SEWN = ['claw'];   // the kinds of wound sewn up in the hospital, so far drawn
// The eye fitted to its coloured part (the iris, around the pupil) on the drawing's first frame, at its
// sharpest: the bright, coloured pixels joined to the one clicked nearest it, as an oval (their spread
// along and across). Null if none is near.
async function fitEye(x, y) {
  // (the drawing's sheet: the one shown, or, with no scar on it yet and so drawn as a plain picture,
  // the picture's own)
  const base = art.querySelector('.dino-base') || art;
  const s = (sheetCv && sheetCv.sheet) || (base.tagName === 'IMG' && sheetFor(base.src)) || null;
  const src = s ? (s.hires || s.sheet) : null;
  if (!src) return null;
  const img = new Image();
  img.src = new URL('../' + src, import.meta.url).href;
  try { await img.decode(); } catch (e) { return null; }
  // (the first frame: all of the hi-res picture, or the sheet's first cell)
  const W = s.hires ? img.naturalWidth : s.w, H = s.hires ? img.naturalHeight : s.h;
  const R = Math.round(W * 0.03), cx = Math.round(x * W), cy = Math.round(y * H);
  const c = document.createElement('canvas'); c.width = c.height = R * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, cx - R, cy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
  const d = g.getImageData(0, 0, R * 2, R * 2).data, n = R * 2;
  const iris = i => { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], hi = Math.max(r, gg, b), lo = Math.min(r, gg, b); return d[i * 4 + 3] > 200 && hi > 120 && hi - lo > 50; };
  // (the coloured pixel nearest the click, and those joined to it)
  let start = -1, best = Infinity;
  for (let i = 0; i < n * n; i++) if (iris(i)) { const dd = (i % n - R) ** 2 + (Math.floor(i / n) - R) ** 2; if (dd < best) { best = dd; start = i; } }
  if (start < 0) return null;
  // (grown from it over all but the dark outline round the eye, its shaded top too; then with the
  // pupil and the light's gleam inside it: all that the outside cannot reach)
  const lit = i => d[i * 4 + 3] > 200 && Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) >= 46;
  const grow = (from, ok) => {
    const seen = new Uint8Array(n * n), stack = from.filter(i => ok(i));
    for (const i of stack) seen[i] = 1;
    while (stack.length) {
      const i = stack.pop(), px = i % n, py = Math.floor(i / n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = px + dx, qy = py + dy, q = qy * n + qx;
        if (qx < 0 || qy < 0 || qx >= n || qy >= n || seen[q] || !ok(q)) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    return seen;
  };
  const inside = grow([start], lit);
  const edge = []; for (let k = 0; k < n; k++) edge.push(k, (n - 1) * n + k, k * n, k * n + n - 1);
  const outside = grow(edge, i => !inside[i]);
  const pts = [];
  for (let i = 0; i < n * n; i++) if (!outside[i]) pts.push([i % n, Math.floor(i / n)]);
  if (pts.length < 6 || pts.length > n * n * 0.4) return null;
  const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  let xx = 0, yy = 0, xy = 0;
  for (const [px, py] of pts) { xx += (px - mx) ** 2; yy += (py - my) ** 2; xy += (px - mx) * (py - my); }
  const t = Math.atan2(2 * xy, xx - yy) / 2, cos = Math.cos(t), sin = Math.sin(t);
  // (its extent along the long way and across it)
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [px, py] of pts) { const u = (px - mx) * cos + (py - my) * sin, v = -(px - mx) * sin + (py - my) * cos; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
  const long = a1 - a0 + 1, across = b1 - b0 + 1;
  return { x: (cx - R + mx + 0.5) / W, y: (cy - R + my + 0.5) / H, r: long / 2 / W, h: Math.min(1, across / long), a: t * 180 / Math.PI };
}
async function pickAt(e) {
  picking = false;
  $('canvas').classList.remove('picking');
  const base = art.querySelector('.dino-base') || art, rect = base.getBoundingClientRect();
  let src, sx = 0, sy = 0, w, h;
  if (sheetCv) { const s = sheetCv.sheet, k = frameNow(); src = new URL('../' + s.sheet, import.meta.url).href; w = s.w; h = s.h; sx = (k % s.cols) * w; sy = Math.floor(k / s.cols) * h; }
  else src = base.currentSrc || base.src;
  const img = new Image();
  img.src = src;
  await img.decode();
  w = w || img.naturalWidth; h = h || img.naturalHeight;
  const x = Math.round(sx + (e.clientX - rect.left) / rect.width * w), y = Math.round(sy + (e.clientY - rect.top) / rect.height * h);
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, x - 4, y - 4, 9, 9, 0, 0, 9, 9);
  const px = g.getImageData(0, 0, 9, 9).data, sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    // (the skin itself: not the air, nor the ink of its outlines)
    if (px[i + 3] < 200 || px[i] + px[i + 1] + px[i + 2] < 90) continue;
    sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; n++;
  }
  if (!n) { $('msg').textContent = 'No skin there: pick on the body itself.'; return; }
  // (the colour is the part's, kept on its place whichever look is shown)
  const own = scarsOf()[$('slot').value];
  own.c = '#' + sum.map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  if (own.deep) delete own.deep.c;
  // (shown at once: only a sewn-up wound, past its first crimson, takes it, and only the kinds sewn up)
  if (!['s0.6', 's0.25'].includes($('wound').value)) $('wound').value = 's0.25';
  if (!SEWN.includes($('look').value)) $('look').value = SEWN[0];
  save(); render();
  $('msg').textContent = `The skin here is ${own.c}: a wound sewn up on this part heals into it (shown nearly healed).`;
}
$('pick').addEventListener('click', () => {
  if (needScar()) return; picking = true; $('canvas').classList.add('picking'); $('msg').textContent = 'Click the skin where this scar goes.'; });
$('unpick').addEventListener('click', () => { const a = scarsOf()[$('slot').value]; if (a) { delete a.c; if (a.deep) delete a.deep.c; } save(); render(); $('msg').textContent = 'Back to the species colour.'; });

// pointer anywhere on the dinosaur: the chosen piece jumps there and follows until released
$('canvas').addEventListener('pointerdown', e => {
  if (!art || !art.contains(e.target)) return;
  e.preventDefault();
  if (picking) { pickAt(e); return; }
  if (feathering) {
    // (painting: a circle every half a brush along the stroke; erasing: off goes every circle under it)
    const brush = +$('brush').value, list = scarsOf().feathers = scarsOf().feathers || [];
    let last = null;
    const paint = ev => {
      const r = art.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height, aspect = r.width / r.height;
      const far = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) / aspect);
      if ($('featherErase').checked) { for (let i = list.length - 1; i >= 0; i--) if (far(list[i], [x, y]) < brush + list[i][2] * 0.5) list.splice(i, 1); }
      else if (!last || far(last, [x, y]) > brush * 0.5) { last = [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000, brush]; list.push(last); }
      drawFeathers();
    };
    paint(e);
    const move = ev => { if (ev.pointerId === e.pointerId) paint(ev); };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (!list.length) delete scarsOf().feathers;
      save(); render();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    return;
  }
  if (eyeing) {
    const r = art.getBoundingClientRect(), eye = scarsOf().eye || { r: 0.02 };
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    eyeing = false; $('canvas').classList.remove('eyeing');
    fitEye(x, y).then(fit => {
      const round = v => Math.round(v * 10000) / 10000;
      scarsOf().eye = fit ? { x: round(fit.x), y: round(fit.y), r: round(fit.r), ...(fit.h < 0.97 ? { h: Math.round(fit.h * 100) / 100, ...(Math.round(fit.a) ? { a: Math.round(fit.a) } : {}) } : {}) }
        : { ...eye, x: round(x), y: round(y) };
      save(); render();
      $('msg').textContent = fit ? 'Fitted to the coloured part of the eye: adjust it if it is off.' : 'The eye is there (its colour not found): size, flatten and tilt it so the ring sits on it.';
    });
    return;
  }
  if (scarring()) {
    // (a click on another added scar picks it; on bare skin, the chosen one goes there, if added)
    const rect = art.getBoundingClientRect(), fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    const under = pt => {
      const a = lookOf(scarsOf()[pt]), b = here(a), hw = a.w / 2 * 0.85, hh = a.w * rect.width / rect.height / 2 * 0.85;
      return Math.abs(fx - b.x) <= hw && Math.abs(fy - b.y) <= hh;
    };
    // (the chosen one first, where they overlap)
    const hit = scarsOf()[$('slot').value] && under($('slot').value) ? $('slot').value : Object.keys(scarsOf()).filter(k => SCARS.parts.includes(baseOf(k))).find(under);
    if (hit && hit !== $('slot').value) { $('slot').value = hit; render(); $('msg').textContent = `${label(hit)} chosen.`; return; }
    if (!scarsOf()[$('slot').value]) { $('msg').textContent = 'This scar is not on the drawing: press “Add this scar”, or click one already added.'; return; }
  }
  // (a scar is placed on a still frame)
  if (scarring() && sheetCv && held == null) hold(frameNow());
  const place = ev => {
    const rect = art.getBoundingClientRect();
    const a = editable();
    const x = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientX - rect.left) / rect.width)) * 1000) / 1000;
    const y = Math.round(Math.min(1.2, Math.max(-0.2, (ev.clientY - rect.top) / rect.height)) * 1000) / 1000;
    if (scarring()) placeAt(a, x, y, null); else { a.x = x; a.y = y; }
    if (active) { active.style.left = (x * 100) + '%'; active.style.top = (y * 100) + '%'; }
    if (sheetCv) { sheetCv.scars = sheetCv.scars.map(([b, level, pt, main]) => [pt === $('slot').value ? a : b, level, pt, main]); drawFrame(sheetCv, frameNow()); showFrame(); }
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
// a scar added where it would go by the equipment's places, to be moved from there
// a scar kept to its part of the body, both its looks
$('stay').addEventListener('change', e => {
  const own = scarsOf()[$('slot').value];
  if (!own) return;
  for (const p of [own, own.deep].filter(Boolean)) { if (e.target.checked) p.stay = true; else delete p.stay; }
  save(); render();
});
// how far a scar wanders on each dinosaur, both its looks
const setSpread = (k, v) => {
  const own = scarsOf()[$('slot').value];
  if (!own) return;
  const sp = { ...(own.spread || SPREAD), [k]: v };
  for (const p of [own, own.deep].filter(Boolean)) p.spread = sp;
  save(); render();
};
$('spreadD').addEventListener('input', e => setSpread('d', +e.target.value));
$('spreadR').addEventListener('input', e => setSpread('r', +e.target.value));
$('spreadS').addEventListener('input', e => setSpread('s', +e.target.value));
$('another').addEventListener('click', () => { seed = 'preview-' + Math.random().toString(36).slice(2, 8); render(); $('msg').textContent = 'Another dinosaur: its scars where they fell on it. Moving one moves where they fall from.'; });
$('middle').addEventListener('click', () => { seed = null; render(); $('msg').textContent = 'Each scar right in its place again.'; });
$('eyeSet').addEventListener('click', () => { eyeing = true; $('canvas').classList.add('eyeing'); $('msg').textContent = 'Click the coloured part of the eye: the ring fits itself to it.'; });
$('eyeClear').addEventListener('click', () => { delete scarsOf().eye; save(); render(); $('msg').textContent = 'No eye set on this drawing.'; });
$('eyeBlind').addEventListener('change', render);
$('featherPaint').addEventListener('click', () => { feathering = !feathering; $('canvas').classList.toggle('feathering', feathering); render(); $('msg').textContent = feathering ? 'Paint over the feathers that lie on the skin (tick Erase to rub out). The scars stop at them.' : 'Feathers set.'; });
$('brush').addEventListener('input', () => { $('brushNo').textContent = (+$('brush').value * 100).toFixed(1) + '%'; });
$('featherClear').addEventListener('click', () => { delete scarsOf().feathers; save(); render(); $('msg').textContent = 'No feathers painted on this drawing.'; });
$('eyeR').addEventListener('input', e => { const eye = scarsOf().eye; if (!eye) return; eye.r = +e.target.value; save(); render(); });
$('eyeH').addEventListener('input', e => { const eye = scarsOf().eye; if (!eye) return; if (+e.target.value < 1) eye.h = +e.target.value; else delete eye.h; save(); render(); });
$('eyeA').addEventListener('input', e => { const eye = scarsOf().eye; if (!eye) return; if (+e.target.value) eye.a = +e.target.value; else delete eye.a; save(); render(); });
$('addScar').addEventListener('click', () => {
  const a = withScars(() => scarAnchor($('type').value, $('sex').value, $('slot').value, $('stage').value)) || { x: 0.5, y: 0.5, w: 0.15, r: 0 };
  scarsOf()[$('slot').value] = { x: a.x, y: a.y, w: Math.round(a.w * 1000) / 1000, r: a.r || 0 };
  save(); render();
  $('msg').textContent = `${label($('slot').value)} added: drag it where it goes.`;
});
// one more on the same part, a little off the one chosen (they are all drawn together)
$('anotherScar').addEventListener('click', () => {
  const key = $('slot').value, pt = baseOf(key), a = scarsOf()[key];
  let n = 2;
  while (scarsOf()[pt + '~' + n]) n++;
  const next = pt + '~' + n;
  const off = p => ({ x: Math.round((p.x + 0.04) * 1000) / 1000, y: Math.round((p.y + 0.04) * 1000) / 1000, w: p.w, r: p.r || 0 });
  scarsOf()[next] = { ...off(a), ...(a.c ? { c: a.c } : {}), ...(a.deep ? { deep: off(a.deep) } : {}) };
  save(); render();
  $('slot').value = next; render();
  $('msg').textContent = `${label(next)} added: drag it where it goes.`;
});
$('removeScar').addEventListener('click', () => {
  const key = $('slot').value;
  delete scarsOf()[key];
  save(); render();
  $('msg').textContent = `${label(key)} removed from this drawing.`;
});
$('look').addEventListener('change', render);
$('wound').addEventListener('change', render);
$('mode').addEventListener('change', () => {
  if (scarring()) fill($('slot'), SCARS.parts.map(pt => [pt, PARTS[pt]]));
  else { fill($('slot'), GEAR_SLOTS.filter(g => DRAWN_SLOTS.includes(g.id)).map(g => [g.id, g.name])); fillItems(); }
  render();
});
const needScar = () => { if (editable()) return false; $('msg').textContent = 'Add this scar first.'; return true; };
$('w').addEventListener('input', e => { if (needScar()) return; editable().w = +e.target.value; save(); render(); });
$('r').addEventListener('input', e => { if (needScar()) return; if (scarring()) placeAt(editable(), null, null, +e.target.value); else editable().r = +e.target.value; save(); render(); });
$('frame').addEventListener('input', e => { hold(+e.target.value); const a = current(); if (a) { $('r').value = Math.round(here(a).r || 0); showReadout(a); } showFrame(); });
$('play').addEventListener('click', () => { if (held == null) hold(frameNow()); else { held = null; if (sheetCv) sheetCv.hold = null; } showFrame(); });
$('unkey').addEventListener('click', () => {
  const a = lookOf(scarsOf()[$('slot').value]), k = frameNow();
  if (!a || !a.f || !a.f[k]) { $('msg').textContent = k === 0 ? 'Frame 1 is the scar’s own place: move it instead.' : 'This frame has no key.'; return; }
  delete a.f[k];
  if (!Object.keys(a.f).length) delete a.f;
  save(); render();
  $('msg').textContent = `The key on frame ${k + 1} is gone.`;
});
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
// Zoom, to place small scars: the drawing drawn bigger in a box that scrolls; with Ctrl and the wheel,
// about the pointer
function setZoom(z, at) {
  const box = $('canvas'), old = zoom;
  zoom = Math.max(1, Math.min(6, Math.round(z * 4) / 4));
  if (zoom === old || !art) return;
  // (the point of the drawing under the pointer, or in the middle, stays where it is)
  const r = box.getBoundingClientRect(), a = art.getBoundingClientRect();
  const sx = at ? at.clientX : r.left + r.width / 2, sy = at ? at.clientY : r.top + r.height / 2;
  const fx = (sx - a.left) / a.width, fy = (sy - a.top) / a.height;
  box.classList.toggle('zoomed', zoom > 1);
  $('zoomNo').textContent = Math.round(zoom * 100) + '%';
  render();
  const b = art.getBoundingClientRect();
  box.scrollLeft += b.left + fx * b.width - sx;
  box.scrollTop += b.top + fy * b.height - sy;
}
$('zoomIn').addEventListener('click', () => setZoom(zoom * 1.5));
$('zoomOut').addEventListener('click', () => setZoom(zoom / 1.5));
$('canvas').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8), e); }, { passive: false });
render();
