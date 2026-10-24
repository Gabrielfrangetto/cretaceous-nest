// The world map drawn on a canvas: tens of thousands of hexes stay smooth to drag and zoom. Close up,
// the hexes in view are drawn one by one with their little drawings; from afar, tiles of the map drawn
// once each at the sharpness the zoom needs. The little drawings are the same SVG snippets as everywhere else
// (hexdraw.js), turned into canvas paths.
import { ALL_HEXES, hexKey, cellAt as mapCell, inWorld as inMap, inWilds, wildsAt } from '../world.js';
import { SIZE, SQ3, TILT, center, flatCenter, fillOf, glyphOf, reliefOf, NEST, riverHalves, riverWidth, RIVER_COLOR } from './hexdraw.js';
import { railsOf, upAt } from '../map.js';

// ---------- SVG snippets as canvas paths ----------
const attr = (s, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(s); return m ? m[1] : null; };
const shiftOf = s => { const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(attr(s, 'transform') || ''); return m ? [+m[1], +m[2]] : [0, 0]; };
const parsed = new Map();
// [{ path, fill, stroke, width, cap, alpha }] for a snippet of <path>, <ellipse>, <circle> and <g transform>
function shapesOf(svg) {
  if (parsed.has(svg)) return parsed.get(svg);
  const out = [], stack = [[0, 0]];
  for (const [, close, tag, rest] of svg.matchAll(/<(\/?)(path|ellipse|circle|g)\b([^>]*?)\/?>/g)) {
    if (tag === 'g') { if (close) stack.pop(); else { const [x, y] = shiftOf(rest), [px, py] = stack.at(-1); stack.push([px + x, py + y]); } continue; }
    const [sx, sy] = shiftOf(rest), [px, py] = stack.at(-1), dx = px + sx, dy = py + sy;
    const raw = new Path2D();
    if (tag === 'path') raw.addPath(new Path2D(attr(rest, 'd')));
    else if (tag === 'ellipse') raw.ellipse(+(attr(rest, 'cx') || 0), +(attr(rest, 'cy') || 0), +attr(rest, 'rx'), +attr(rest, 'ry'), 0, 0, Math.PI * 2);
    else raw.arc(+(attr(rest, 'cx') || 0), +(attr(rest, 'cy') || 0), +attr(rest, 'r'), 0, Math.PI * 2);
    const path = new Path2D();
    path.addPath(raw, new DOMMatrix().translate(dx, dy));
    const fill = attr(rest, 'fill');
    out.push({ path, fill: fill === 'none' ? null : fill || '#000', stroke: attr(rest, 'stroke'), width: +(attr(rest, 'stroke-width') || 1), cap: attr(rest, 'stroke-linecap') || 'butt', alpha: +(attr(rest, 'opacity') || 1) });
  }
  parsed.set(svg, out);
  return out;
}
// draws a snippet centred on x, y (map units), at alpha
export function paint(ctx, svg, x, y, alpha = 1) {
  if (!svg) return;
  ctx.save();
  ctx.translate(x, y);
  for (const s of shapesOf(svg)) {
    ctx.globalAlpha = alpha * s.alpha;
    if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(s.path); }
    if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width; ctx.lineCap = s.cap; ctx.stroke(s.path); }
  }
  ctx.restore();
}

// A hill, mountain or volcano (hexdraw.js reliefOf) drawn as a picture made once for its shape, at the
// sharpness the zoom needs (in half steps of doubling), the last SPRITE_KEEP kept; close up, where few
// hexes show, drawn as shapes
const sprites = new Map(), SPRITE_KEEP = 600;
function drawRelief(ctx, r, x, y, alpha) {
  const a = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  if (a > 1.45) { paint(ctx, r.svg, x + r.dx, y + r.dy, alpha); return; }
  const sharp = 2 ** (Math.ceil(Math.log2(Math.max(a, 0.05)) * 2) / 2), id = `${r.key}|${sharp}`, [x0, y0, x1, y1] = r.box;
  let pic = sprites.get(id);
  if (pic) { sprites.delete(id); sprites.set(id, pic); }
  else {
    // (an ImageBitmap where there is one: a picture made to be drawn again and again)
    const w = Math.max(1, Math.ceil((x1 - x0) * sharp)), h = Math.max(1, Math.ceil((y1 - y0) * sharp));
    const off = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const p = off.getContext('2d');
    p.scale(sharp, sharp);
    paint(p, r.svg, -x0, -y0);
    pic = { img: off.transferToImageBitmap ? off.transferToImageBitmap() : off, w: w / sharp, h: h / sharp };
    sprites.set(id, pic);
    if (sprites.size > SPRITE_KEEP) { const old = sprites.keys().next().value; sprites.get(old).img.close?.(); sprites.delete(old); }
  }
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(pic.img, x + r.dx + x0, y + r.dy + y0, pic.w, pic.h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// a hex's outline around 0,0 (k: its size)
const hexPaths = new Map();
export function hexPath(k = 0.96) {
  if (!hexPaths.has(k)) {
    const p = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      p[i ? 'lineTo' : 'moveTo'](SIZE * k * Math.cos(a), SIZE * k * Math.sin(a) * TILT);
    }
    p.closePath();
    hexPaths.set(k, p);
  }
  return hexPaths.get(k);
}

// ---------- relief ----------
// The ground is lit from the north-west. Each corner of a hex is shared by three hexes, whose heights
// (map.js upAt) make a little slope there, lit or in shade by how it faces the light; a hex is filled
// with its colour lit across it as its corners are (the closest straight blend between them), so slopes
// and ranges stand out and the light runs on smoothly from one hex into the next.
const RELIEF = 300;   // how high the highest peak stands, in map units (a hex is SIZE × 2 tall)
const LIGHT = (() => { const v = [-1, -1.25, 1.5], n = Math.hypot(...v); return v.map(x => x / n); })();
const STEPS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(d => ({ d, at: flatCenter(d) }));
// (the two neighbours that share each corner, corner i lying at 60i - 30 degrees)
const CORNER = [[1, 0], [0, 5], [5, 4], [4, 3], [3, 2], [2, 1]];
// (the corners as they show, the ground seen at a slant)
const RIM = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return [Math.cos(a) * SIZE, Math.sin(a) * SIZE * TILT]; });
const RIM_X = RIM.reduce((t, [x]) => t + x * x, 0), RIM_Y = RIM.reduce((t, [, y]) => t + y * y, 0);
const lights = new Map();
// Broad patches of lighter and darker ground, a few hexes across, so a stretch of one biome is never one
// flat colour, nor a picture of its ground seen repeating: smooth noise over the map, from -1 to 1
const PATCH = 0.07, PATCH_SPAN = SIZE * SQ3 * 5;
const cornerRand = (i, j, k) => { let v = Math.imul(i * 73856093 ^ j * 19349663 ^ k * 83492791, 0x9e3779b1); v ^= v >>> 15; v = Math.imul(v, 0x85ebca6b); v ^= v >>> 13; return (v >>> 0) / 4294967296; };
function patchOf(h, salt = 0) {
  const [x, y] = flatCenter(h);
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < 2; o++, amp /= 2) {
    const fx = x / PATCH_SPAN * 2 ** o, fy = y / PATCH_SPAN * 2 ** o, i = Math.floor(fx), j = Math.floor(fy);
    const u = (fx - i) ** 2 * (3 - 2 * (fx - i)), v = (fy - j) ** 2 * (3 - 2 * (fy - j));
    const c = (a, b) => cornerRand(i + a, j + b, o + salt * 13);
    sum += amp * (c(0, 0) * (1 - u) * (1 - v) + c(1, 0) * u * (1 - v) + c(0, 1) * (1 - u) * v + c(1, 1) * u * v);
    norm += amp;
  }
  return sum / norm * 2 - 1;
}
// how lit a hex is (0: as flat ground, + in the sun, - in shade): m in its middle, changing by (gx, gy)
// a map unit across it as it shows
function lightOf(seed, h) {
  const id = `${seed}|${h[0]},${h[1]}`;
  let l = lights.get(id);
  if (l) return l;
  const z0 = upAt(seed, h) * RELIEF;
  // (beyond the map's edge, and under water, which lies flat at its shore, the ground carries on as it is)
  const zs = STEPS.map(({ d }) => { const n = [h[0] + d[0], h[1] + d[1]], c = (inMap(n) || inWilds(n)) && cellAt(seed, n); return c && !isWaterCell(c) ? upAt(seed, n) * RELIEF : z0; });
  let m = 0, gx = 0, gy = 0;
  CORNER.forEach(([a, b], i) => {
    const [ax, ay] = STEPS[a].at, [bx, by] = STEPS[b].at, az = zs[a] - z0, bz = zs[b] - z0;
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const s = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / Math.hypot(nx, ny, nz) - LIGHT[2];
    m += s / 6; gx += s * RIM[i][0] / RIM_X; gy += s * RIM[i][1] / RIM_Y;
  });
  m += PATCH * patchOf(h);
  l = { m, gx, gy };
  if (lights.size > 120000) lights.clear();
  lights.set(id, l);
  return l;
}
const rgbs = new Map();
const rgbOf = hex => rgbs.get(hex) || rgbs.set(hex, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))).get(hex);
const SUN = [255, 247, 224], SHADE = [24, 32, 46];
// a colour lit (s > 0, towards warm white) or in shade (s < 0, towards a cool dark)
const lightTo = s => [s > 0 ? Math.min(0.45, s * 1.3) : Math.min(0.55, -s * 1.5), s > 0 ? SUN : SHADE];
const litColor = (rgb, s) => {
  const [t, to] = lightTo(s);
  return `rgb(${Math.round(rgb[0] + (to[0] - rgb[0]) * t)},${Math.round(rgb[1] + (to[1] - rgb[1]) * t)},${Math.round(rgb[2] + (to[2] - rgb[2]) * t)})`;
};
// the same light laid over a picture of the ground: the sun's or the shade's colour, see-through
// (softer: a picture has its own light and shade)
// (a grey laid with soft-light: lighter or darker without washing the painting out; see groundFill)
const lightOver = s => { const v = Math.round(Math.max(40, Math.min(215, 128 + s * 260))); return `rgb(${v},${v},${v})`; };
// the fill of a hex drawn around 0,0: its colour, lit as its ground lies (water lies flat); blended
// across it (smooth) close up, where few hexes show, one colour each from further away. over: only the
// light, to lay over a picture of its ground
function groundFill(ctx, seed, h, cell, smooth, over = false) {
  const color = fillOf(cell);
  if (isWaterCell(cell)) return color;
  const l = lightOf(seed, h), { m, gx, gy } = l, g = Math.hypot(gx, gy), rgb = rgbOf(color);
  const paint = s => (over ? lightOver(s) : litColor(rgb, s));
  if (!smooth || g * SIZE < 0.01) return over ? (l.over || (l.over = lightOver(m))) : l.solid || (l.solid = litColor(rgb, m));
  const ux = gx / g * SIZE, uy = gy / g * SIZE, fill = ctx.createLinearGradient(-ux, -uy, ux, uy);
  fill.addColorStop(0, paint(m - g * SIZE));
  fill.addColorStop(1, paint(m + g * SIZE));
  return fill;
}

// ---------- pictures of the ground ----------
// A biome with a picture of its ground (images/terrain/<biome>.webp, made by scripts/texture.py) is
// filled with it close up, laid over the whole map rather than hex by hex, so neighbours show different
// parts of one forest, seen at the same slant as the ground; from afar it is drawn in its colour, which
// is the picture's average.
// (in order: where two meet, the later one's ground runs over the edge into the other's)
const TEXTURED = ['meadow', 'swamp'];
const rank = biome => TEXTURED.indexOf(biome);
const groundName = cell => (cell.terrain === 'mountain' ? 'rock' : cell.biome);
const TEXTURE_PX = SIZE * SQ3 * 1.6 / 352;   // how far across the map a pixel of a picture reaches (map units)
// Each hex of a biome shows one of its pictures whole (scripts/texture.py --variants, densest first),
// cut to the hex: which one by broad patches over the map, so thick forest and clearings come in
// stretches, with a little of each hex's own; each set at a place of its own in the picture
const VARIANTS = { forest: 5, meadow: 3, swamp: 3 };   // (forest: its densities of plants, PLANTED)
const densities = new Map();
function densityOf(seed, h, biome) {
  const n = VARIANTS[biome], id = `${biome}|${h[0]},${h[1]}`;
  if (densities.has(id)) return densities.get(id);
  const v = Math.max(0, Math.min(0.999, 0.5 + patchOf(h, 7) * 0.9 + (cornerRand(h[0], h[1], 61) - 0.5) * 0.45));
  // (the densest the most: about half the forest thick)
  const d = Math.floor(v ** 1.6 * n);
  if (densities.size > 120000) densities.clear();
  densities.set(id, d);
  return d;
}
const textures = new Map(), patterns = new WeakMap();
let texturesLoaded = () => {};
// fn: called when a picture has come, to draw the map again
export function onTexture(fn) { texturesLoaded = fn; }
const picture = name => {
  let img = textures.get(name);
  if (!img) {
    img = new Image();
    img.onload = () => { tiles.clear(); texturesLoaded(); };
    img.src = new URL(`../../images/terrain/${name}.webp`, import.meta.url).href;
    textures.set(name, img);
  }
  return img;
};
// the pattern of one of a biome's pictures (top: its treetops alone), once it has come; all of a
// biome's are asked for together, and none is used until they all have come
function textureOf(ctx, biome, i, top = false) {
  if (rank(biome) < 0) return null;
  const names = Array.from({ length: VARIANTS[biome] }, (_, k) => [`${biome}-${k}`, `${biome}-${k}-top`]).flat();
  const imgs = names.map(picture);
  if (imgs.some(img => !img.complete || !img.naturalWidth)) return null;
  const name = `${biome}-${i}${top ? '-top' : ''}`;
  let mine = patterns.get(ctx);
  if (!mine) patterns.set(ctx, mine = new Map());
  if (!mine.has(name)) mine.set(name, { pattern: ctx.createPattern(picture(name), 'repeat'), k: TEXTURE_PX, span: picture(name).naturalWidth * TEXTURE_PX });
  return mine.get(name);
}
const hasTexture = biome => (rank(biome) >= 0 && textures.get(`${biome}-0`)?.naturalWidth > 0) || !!plantsOf(biome);

// ---------- plants standing in their hex ----------
// A biome drawn in layers: its floor, then plants (scripts/plants.py: trees, single or in clumps, cut
// whole) standing in each hex, every one wholly inside it, so nothing crosses into a neighbour; more of
// them the denser the hex (densityOf). Each hex shows one of a few arrangements made once (LAYOUTS for
// each density, also mirrored).
const PLANTED = { forest: { floor: '#3f5531', size: 12, counts: [40, 22, 12, 6, 2] } };
const floors = new WeakMap();
const floorPattern = (ctx, biome, img) => { let m = floors.get(ctx); if (!m) floors.set(ctx, m = new Map()); if (!m.has(biome)) m.set(biome, ctx.createPattern(img, 'repeat')); return m.get(biome); };
const LAYOUTS = 10, LAYOUT_PX = 5;   // arrangements a density, pixels a map unit they are made at
const plantSets = new Map();
function plantsOf(biome) {
  const p = PLANTED[biome];
  if (!p) return null;
  let set = plantSets.get(biome);
  if (!set) {
    set = { img: picture(`${biome}-plants`), pieces: null, layouts: new Map() };
    picture(`${biome}-floor`);
    plantSets.set(biome, set);
    fetch(new URL(`../../images/terrain/${biome}-plants.json`, import.meta.url).href).then(r => r.json()).then(j => { set.pieces = j.pieces; set.big = j.big; tiles.clear(); texturesLoaded(); }).catch(() => {});
  }
  return set.pieces && set.img.complete && set.img.naturalWidth ? set : null;
}
// (a seeded random sequence)
const seq = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// the hex as it shows (at a slant), its six sides as [x0, y0, x1, y1]
const SIDES = Array.from({ length: 6 }, (_, i) => { const at = k => { const a = Math.PI / 180 * (60 * k - 30); return [Math.cos(a) * SIZE, Math.sin(a) * SIZE * TILT]; }; return [...at(i), ...at(i + 1)]; });
// how far (x, y) is inside the hex, from its nearest side (below 0: outside)
const inside = (x, y) => Math.min(...SIDES.map(([x0, y0, x1, y1]) => ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / Math.hypot(x1 - x0, y1 - y0)));
function layoutOf(biome, set, level, k) {
  const id = `${level}|${k}`;
  if (set.layouts.has(id)) return set.layouts.get(id);
  const p = PLANTED[biome], unit = p.size / set.big, rand = seq(level * 7919 + k * 104729 + 17);
  const w = Math.ceil(SIZE * SQ3 * LAYOUT_PX) + 2, h = Math.ceil(SIZE * 2 * TILT * LAYOUT_PX) + 2;
  const placed = [];
  for (let tries = 0; placed.length < p.counts[level] && tries < 3000; tries++) {
    const [px, py, pw, ph] = set.pieces[Math.floor(rand() ** 0.8 * set.pieces.length)];
    const s = unit * (0.85 + rand() * 0.3), r = Math.max(pw, ph) * s / 2;
    const x = (rand() - 0.5) * SIZE * SQ3, y = (rand() - 0.5) * SIZE * 2 * TILT;
    // (wholly inside the hex; packed close in thick forest, apart where it is open)
    if (inside(x, y) < r * 0.95) continue;
    if (placed.some(o => Math.hypot(o.x - x, o.y - y) < (o.r + r) * (level < 2 ? 0.5 : 0.85))) continue;
    placed.push({ x, y, r, s, px, py, pw, ph, flip: rand() < 0.5 });
  }
  placed.sort((a, b) => a.y - b.y);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.translate(w / 2, h / 2);
  g.scale(LAYOUT_PX, LAYOUT_PX);
  // their shadows on the floor, towards the bottom right (the light from the top-left), then the plants
  for (const t of placed) {
    const sh = g.createRadialGradient(t.x + t.r * 0.3, t.y + t.r * 0.35, 0, t.x + t.r * 0.3, t.y + t.r * 0.35, t.r * 1.05);
    sh.addColorStop(0, 'rgba(10,16,8,.45)'); sh.addColorStop(1, 'rgba(10,16,8,0)');
    g.fillStyle = sh;
    g.beginPath(); g.ellipse(t.x + t.r * 0.3, t.y + t.r * 0.35, t.r * 1.05, t.r * 0.95, 0, 0, Math.PI * 2); g.fill();
  }
  for (const t of placed) {
    g.save();
    g.translate(t.x, t.y);
    if (t.flip) g.scale(-1, 1);
    g.drawImage(set.img, t.px, t.py, t.pw, t.ph, -t.pw * t.s / 2, -t.ph * t.s / 2, t.pw * t.s, t.ph * t.s);
    g.restore();
  }
  const out = { canvas: c, w: w / LAYOUT_PX, h: h / LAYOUT_PX };
  set.layouts.set(id, out);
  return out;
}
// a picture's place in a hex: where in the picture the hex's middle falls, its own
const placeIn = (tex, h) => new DOMMatrix([tex.k, 0, 0, tex.k * TILT, -cornerRand(h[0], h[1], 71) * tex.span, -cornerRand(h[0], h[1], 72) * tex.span * TILT]);

// the colours of the page's theme, for what the canvas draws
export const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

// a hex of the map, or of the uncharted north just past its top edge (the land runs on to the edge of
// the screen there: never explored)
const cellAt = (seed, h) => mapCell(seed, h) || wildsAt(seed, h);

// the line between hexes: barely there, a shade of the land's own colour
export const GRID = 'rgba(0, 0, 0, .07)';

// a settlement of other colonists: huts behind a palisade
export const CITY = '<path d="M-15 10 L15 10" stroke="#5b3a1e" stroke-width="2.5"/><path d="M-13 9 L-8 -1 L-3 9Z" fill="#8a5a2b"/><path d="M-4 9 L2 -8 L8 9Z" fill="#a8743c"/><path d="M5 9 L9.5 1 L14 9Z" fill="#8a5a2b"/><path d="M2 -8 L2 -13 L6 -11.5 L2 -10" fill="#d2493f" stroke="#5b3a1e" stroke-width="1"/>';

// Draws hexes with their colour, outline and little drawing; known(key) false: not yet explored, drawn
// a little dimmer. edge: the faint line between hexes (GRID). detail: how much to draw, for how big a hex
// looks: 'full' (line and drawing), 'plain' (colour only), 'dots' (squares of colour, from very far)
export function drawHexes(ctx, seed, hexes, known, edge = GRID, detail = 'full') {
  // (a hair bigger than the hex, so neighbours meet with no gap between them)
  const shape = hexPath(1.01);
  const dim = 'rgba(30, 34, 28, .16)';
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = edge;
  if (detail === 'dots') {
    const w = SIZE * SQ3, h = SIZE * 1.5 * TILT;
    for (const hx of hexes) {
      const [x, y] = center(hx), cell = cellAt(seed, hx);
      ctx.fillStyle = cell.city || hexKey(...hx) === '0,0' ? '#a8743c' : groundFill(ctx, seed, hx, cell, false);
      ctx.fillRect(x - w / 2, y - h / 2, w + 0.5, h + 0.5);
      if (!isWaterCell(cell) && !known(hexKey(...hx))) { ctx.fillStyle = dim; ctx.fillRect(x - w / 2, y - h / 2, w + 0.5, h + 0.5); }
    }
    // from very far only the great rivers show
    drawRivers(ctx, seed, hexes, 8);
    drawRails(ctx, seed, hexes);
    return;
  }
  const smooth = SIZE * Math.hypot(ctx.getTransform().a, ctx.getTransform().b) >= 44;
  // the ground: first each hex in its colour, lit as it lies; then those with a picture of their ground,
  // each within its own hex (their light over it too); then over all of them, the unexplored dimmed and
  // the line between hexes
  const textured = [];
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h);
    const biome = groundName(cell), dense = rank(biome) >= 0 || PLANTED[biome] ? densityOf(seed, h, biome) : 0;
    const planted = !isWaterCell(cell) && !cell.lava && plantsOf(biome);
    if (planted) {
      // (its floor: a picture laid over the whole map, not hex by hex, so it runs on from one hex into the
      // next; plain until it has come. The light is laid over it with its plants, below)
      const floor = picture(`${biome}-floor`);
      ctx.save(); ctx.translate(x, y);
      if (floor.complete && floor.naturalWidth) {
        const k = SIZE * SQ3 * 2.4 / floor.naturalWidth, pat = floorPattern(ctx, biome, floor);
        pat.setTransform(new DOMMatrix([k, 0, 0, k * TILT, -x, -y]));
        ctx.fillStyle = pat;
      } else ctx.fillStyle = PLANTED[biome].floor;
      ctx.fill(shape); ctx.restore();
      textured.push({ h, x, y, cell, planted, dense });
      continue;
    }
    const tex = !isWaterCell(cell) && !cell.lava && textureOf(ctx, biome, dense);
    if (tex) { textured.push({ h, x, y, cell, tex, dense }); continue; }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = groundFill(ctx, seed, h, cell, smooth);
    ctx.fill(shape);
    ctx.restore();
  }
  textured.sort((a, b) => rank(groundName(a.cell)) - rank(groundName(b.cell)));
  for (const { h, x, y, cell, tex, planted, dense } of textured) {
    if (planted) {
      const L = planted, lay = layoutOf(groundName(cell), L, dense, Math.floor(cornerRand(h[0], h[1], 81) * LAYOUTS));
      ctx.save();
      ctx.translate(x, y);
      if (cornerRand(h[0], h[1], 82) < 0.5) ctx.scale(-1, 1);
      ctx.drawImage(lay.canvas, -lay.w / 2, -lay.h / 2, lay.w, lay.h);
      ctx.restore();
      continue;
    }
    // (each picture within its own hex, never over a neighbour's)
    const edge = shape;
    ctx.save();
    ctx.translate(x, y);
    tex.pattern.setTransform(placeIn(tex, h));
    ctx.fillStyle = tex.pattern;
    ctx.fill(edge);
    ctx.restore();
  }
  // (the light over each, lightening or darkening the painting; blended across it at every zoom, as
  // steps of light from hex to hex would show on a painting)
  for (const { h, x, y, cell } of textured) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = groundFill(ctx, seed, h, cell, true, true);
    ctx.fill(shape);
    ctx.restore();
  }
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h), unknown = !isWaterCell(cell) && !known(hexKey(...h));
    if (!unknown && detail !== 'full') continue;
    ctx.save();
    ctx.translate(x, y);
    if (unknown) { ctx.fillStyle = dim; ctx.fill(shape); }
    if (detail === 'full') ctx.stroke(shape);
    ctx.restore();
  }
  drawRivers(ctx, seed, hexes, detail === 'full' ? 1 : 3);
  drawRails(ctx, seed, hexes);
  // (north to south, so what stands up out of a hex, a mountain, is in front of the hexes behind it)
  for (const h of [...hexes].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const [x, y] = center(h), cell = cellAt(seed, h), key = hexKey(...h), alpha = !isWaterCell(cell) && !known(key) ? 0.7 : 1;
    // (a hill in a biome with a painted ground shows by its light alone: no drawn mound)
    const relief = detail === 'full' && key !== '0,0' && !cell.city && !(cell.terrain === 'hill' && hasTexture(groundName(cell))) && reliefOf(cell, h, upAt(seed, h));
    if (relief) { drawRelief(ctx, relief, x, y, alpha); continue; }
    // (ground with a picture of its own needs no little drawing)
    const art = key === '0,0' ? NEST : cell.city ? CITY : detail === 'full' && !hasTexture(groundName(cell)) ? glyphOf(cell, h) : '';
    if (art) paint(ctx, art, x, y, alpha);
  }
}
// The rivers of these hexes, one line from hex to hex (the ones carrying at least minFlow); from afar
// never thinner on screen than the water they carry deserves
function drawRivers(ctx, seed, hexes, minFlow) {
  const hair = 1 / Math.max(1e-6, ctx.getTransform().a);
  ctx.save();
  ctx.strokeStyle = RIVER_COLOR;
  ctx.lineCap = 'round';
  for (const h of hexes) {
    const cell = cellAt(seed, h);
    if (!cell.river || cell.flow < minFlow) continue;
    const [x, y] = center(h);
    for (const s of riverHalves(seed, h)) {
      if (s.width < riverWidth(minFlow)) continue;
      ctx.lineWidth = Math.max(s.width, hair * (0.6 + Math.sqrt(s.width) * 0.45));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + s.bend[0], y + s.bend[1], x + s.to[0], y + s.to[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}
// The maglev's elevated lines: a dark guideway with a pale rail along it, curving through each hex from
// the edge it comes in by to the one it leaves by (straight to the middle where it ends or branches);
// never thinner on screen than a couple of pixels
const RAIL = [['#3b4047', 6, 2.4], ['#dfe3e8', 1.8, 0.8]];
function drawRails(ctx, seed, hexes) {
  const at = railsOf(seed).at, hair = 1 / Math.max(1e-6, ctx.getTransform().a);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, width, px] of RAIL) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(width, hair * px);
    ctx.beginPath();
    for (const h of hexes) {
      const next = at.get(hexKey(...h));
      if (!next) continue;
      const [x, y] = center(h);
      const mids = next.map(k => { const [nx, ny] = center(k.split(',').map(Number)); return [(x + nx) / 2, (y + ny) / 2]; });
      if (mids.length === 2) { ctx.moveTo(...mids[0]); ctx.quadraticCurveTo(x, y, ...mids[1]); continue; }
      for (const m of mids) { ctx.moveTo(x, y); ctx.lineTo(...m); }
    }
    ctx.stroke();
  }
  ctx.restore();
}
const isWaterCell = c => c.terrain === 'ocean' || c.terrain === 'lake';

// the map's extent, in map units: { x, y, w, h }
let bounds = null;
export function mapBounds() {
  if (!bounds) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const h of ALL_HEXES) { const [x, y] = center(h); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    bounds = { x: x0 - SIZE, y: y0 - SIZE, w: x1 - x0 + SIZE * 2, h: y1 - y0 + SIZE * 2 };
  }
  return bounds;
}

// ---------- the view from afar, in tiles ----------
// The map is cut into square tiles drawn at a few sharpnesses (LEVELS, pixels a map unit), each drawn
// once and kept (the last TILE_KEEP), for the zoom that needs it: the sharpness just above the screen's.
// A tile not drawn yet is drawn in the next frames (a few a frame), the blurrier one standing in.
const TILE = 256, LEVELS = [0.5, 0.25, 0.125, 0.0625, 0.03125], TILE_KEEP = 160;
const tiles = new Map();
const detailAt = k => (SIZE * k >= 9 ? 'full' : SIZE * k >= 3 ? 'plain' : 'dots');
function tileOf(seed, known, sig, edge, k, tx, ty) {
  const id = `${seed}|${sig}|${edge}|${k}|${tx}|${ty}`;
  if (tiles.has(id)) { const c = tiles.get(id); tiles.delete(id); tiles.set(id, c); return c; }
  return null;
}
function makeTile(seed, known, sig, edge, k, tx, ty) {
  const id = `${seed}|${sig}|${edge}|${k}|${tx}|${ty}`, b = mapBounds(), span = TILE / k;
  const ox = b.x + tx * span, oy = b.y + ty * span;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.translate(-ox, -oy);
  drawHexes(ctx, seed, hexesIn(ox, oy, ox + span, oy + span), known, edge, detailAt(k));
  tiles.set(id, canvas);
  while (tiles.size > TILE_KEEP) tiles.delete(tiles.keys().next().value);
  return canvas;
}
// Draws the tiles covering the view (f: from fit); returns whether some are still to be drawn (then
// ask for another frame). sig: what of the map is known (when it changes, the tiles are drawn anew).
export function drawTiles(ctx, seed, f, known, sig, edge) {
  const b = mapBounds(), need = f.scale * f.dpr;
  const k = [...LEVELS].reverse().find(l => l >= need) || LEVELS[0];
  const span = TILE / k;
  const x1 = f.x0 + f.width / f.scale, y1 = f.y0 + f.height / f.scale;
  const tx0 = Math.max(0, Math.floor((f.x0 - b.x) / span)), tx1 = Math.min(Math.ceil(b.w / span) - 1, Math.floor((x1 - b.x) / span));
  const ty0 = Math.max(0, Math.floor((f.y0 - b.y) / span)), ty1 = Math.min(Math.ceil(b.h / span) - 1, Math.floor((y1 - b.y) / span));
  let budget = 6, missing = false;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    let tile = tileOf(seed, known, sig, edge, k, tx, ty);
    if (!tile && budget > 0) { tile = makeTile(seed, known, sig, edge, k, tx, ty); budget--; }
    const x = b.x + tx * span, y = b.y + ty * span;
    if (tile) { ctx.drawImage(tile, x, y, span, span); continue; }
    missing = true;
    // a blurrier tile that covers this one, if there is one
    for (const l of LEVELS.filter(l => l < k)) {
      const s2 = TILE / l, px = Math.floor((x - b.x) / s2), py = Math.floor((y - b.y) / s2);
      const up = tileOf(seed, known, sig, edge, l, px, py);
      if (!up) continue;
      const fx = (x - b.x - px * s2) / s2 * TILE, fy = (y - b.y - py * s2) / s2 * TILE, fw = span / s2 * TILE;
      ctx.drawImage(up, fx, fy, fw, fw, x, y, span, span);
      break;
    }
  }
  return missing;
}
// draws the blurriest tiles of the whole map ahead of time, so the first look from afar is ready
export function warmTiles(seed, known, sig, edge) {
  const b = mapBounds(), k = LEVELS.at(-1), span = TILE / k;
  for (let ty = 0; ty * span < b.h; ty++) for (let tx = 0; tx * span < b.w; tx++) if (!tileOf(seed, known, sig, edge, k, tx, ty)) makeTile(seed, known, sig, edge, k, tx, ty);
}

// the hex under a point of the map (map units, as the map shows), as [q, r]
export function hexAt(x, y) {
  y /= TILT;
  const q = (SQ3 / 3 * x - y / 3) / SIZE, r = (2 / 3 * y) / SIZE, s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq + 0, rr + 0];
}

// Readies a canvas to draw on at the size it is shown, sharp on any screen: the context, with map
// units of view ({ x, y, w, h }) fitted into it (centred, nothing cut). Returns { ctx, scale: pixels
// a map unit, width, height (CSS pixels), x0, y0: the map point at the canvas' top left }
export function fit(canvas, view) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const scale = Math.min(w / view.w, h / view.h);
  const x0 = view.x + view.w / 2 - w / 2 / scale, y0 = view.y + view.h / 2 - h / 2 / scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -x0 * dpr * scale, -y0 * dpr * scale);
  return { ctx, scale, width: w, height: h, x0, y0, dpr };
}
// the hexes whose centre falls inside a box of the map (with a hex's margin), row by row
export function hexesIn(x0, y0, x1, y1) {
  const out = [], rowH = SIZE * 1.5 * TILT, colW = SIZE * SQ3;
  const r0 = Math.floor((y0 - SIZE * 2) / rowH), r1 = Math.ceil((y1 + SIZE * 2) / rowH);
  for (let r = r0; r <= r1; r++) {
    const q0 = Math.floor((x0 - SIZE * 2) / colW - r / 2), q1 = Math.ceil((x1 + SIZE * 2) / colW - r / 2);
    for (let q = q0; q <= q1; q++) if (inMap([q, r]) || inWilds([q, r])) out.push([q, r]);
  }
  return out;
}
// how big a hex must look (radius in pixels) to be drawn one by one with its drawing
export const DETAIL_PX = 15;
