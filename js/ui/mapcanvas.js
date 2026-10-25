// The world map drawn on a canvas: tens of thousands of hexes stay smooth to drag and zoom. Close up,
// the hexes in view are drawn one by one with their little drawings; from afar, tiles of the map drawn
// once each at the sharpness the zoom needs. The little drawings are the same SVG snippets as everywhere else
// (hexdraw.js), turned into canvas paths.
import { ALL_HEXES, hexKey, cellAt as mapCell, inWorld as inMap, inWilds, wildsAt } from '../world.js';
import { SIZE, SQ3, TILT, center, flatCenter, fillOf, glyphOf, reliefOf, NEST, riverHalves, RIVER_COLOR } from './hexdraw.js';
import { railsOf, upAt, WILDS_HEXES } from '../map.js';

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

// A painted mountain or volcano (images/terrain/<sheet>-plants.webp, scripts/plants.py): one of the
// pieces of its sheet, bigger the higher it stands, standing on the hex's front so a range overlaps into
// one massif. A mountain snowy where it is cold (--snow); a volcano smoking, its lava running, the more
// likely the higher it stands, else a cold cone (the small pieces). False until the picture has come
// (then drawn as shapes)
const PAINTED = { mountain: { sheet: 'mountain' }, volcano: { sheet: 'volcano-peak', scale: 1.5 } };
// where a painted one stands in hex (x, y): its piece, its place, whether it is a smoking volcano; or
// null until its picture has come
function paintedPlace(r, x, y) {
  const M = PAINTED[r.terrain];
  if (!M) return null;
  if (!M.img) {
    M.img = picture(`${M.sheet}-plants`);
    fetch(new URL(`../../images/terrain/${M.sheet}-plants.json`, import.meta.url).href).then(res => res.json()).then(j => { M.pieces = j.pieces; M.big = j.big; M.snow = new Set(j.snow || []); retireTiles(); texturesLoaded(); }).catch(() => { M.failed = true; });
  }
  if (!M.pieces || !M.img.complete || !M.img.naturalWidth) return null;
  const all = M.pieces.map((p, i) => i);
  let list, active = false;
  if (r.terrain === 'mountain') { const snowy = r.snow >= 1 || (r.snow > 0 && r.pick < 0.5); list = all.filter(i => M.snow.has(i) === snowy); }
  else { active = r.pick < 0.3 + 0.6 * r.t; const tall = Math.max(...M.pieces.map(p => p[3]));
    M.cone = tall * 0.6; list = all.filter(i => (M.pieces[i][3] > M.cone) === active); }
  const [sx, sy, sw, sh] = M.pieces[list[Math.floor(r.pick * 997) % list.length]];
  const k = SIZE * SQ3 * (1.3 + 0.6 * r.t) * (M.scale || 1) * (M.cone && sh < M.cone ? 1.4 : 1) / M.big, w = sw * k, h = sh * k;
  return { img: M.img, sx, sy, sw, sh, w, h, left: x + r.dx - w / 2, top: y + r.dy + SIZE * TILT * 0.55 - h, active };
}
function drawPainted(ctx, r, x, y, alpha) {
  const p = paintedPlace(r, x, y);
  if (!p) return false;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, p.left, p.top, p.w, p.h);
  ctx.restore();
  return true;
}

// A mountain or volcano (hexdraw.js reliefOf) drawn as a picture made once for its shape, at the
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
const TEXTURED = [];
const rank = biome => TEXTURED.indexOf(biome);
const groundName = cell => (cell.terrain === 'mountain' ? 'rock' : cell.terrain === 'ocean' || cell.terrain === 'lake' ? cell.terrain : cell.biome);
const TEXTURE_PX = SIZE * SQ3 * 1.6 / 352;   // how far across the map a pixel of a picture reaches (map units)
// Each hex of a biome shows one of its pictures whole (scripts/texture.py --variants, densest first),
// cut to the hex: which one by broad patches over the map, so thick forest and clearings come in
// stretches, with a little of each hex's own; each set at a place of its own in the picture
const VARIANTS = { lake: 1, ocean: 1, rock: 1, forest: 5, meadow: 3, swamp: 3, scrub: 3, subtropical: 4, coast: 3, floodplain: 3, desert: 3, volcano: 3 };   // (forest: its densities of plants, PLANTED)
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
    img.onload = () => { retireTiles(); texturesLoaded(); };
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
const PLANTED = { lake: { floor: '#65a3b0', counts: [0], bare: true, span: 5 }, ocean: { floor: '#235d74', counts: [0], bare: true, span: 7 }, rock: { floor: '#8c8476', counts: [0], bare: true }, volcano: { floor: '#5e4b42', size: 11, counts: [6, 3, 1] }, desert: { floor: '#dcb77a', size: 15, counts: [1, 1, 0] }, floodplain: { floor: '#6f9a55', size: 10, counts: [14, 8, 3] }, coast: { floor: '#d8cba0', size: 9, counts: [10, 5, 2] }, subtropical: { floor: '#3a4426', size: 13, counts: [34, 20, 10, 4] }, scrub: { floor: '#a89a62', size: 10, counts: [12, 6, 2] }, swamp: { floor: '#56704a', size: 14, counts: [14, 8, 4], span: 4.5 }, meadow: { floor: '#a3bd74', size: 10, counts: [12, 6, 2] }, forest: { floor: '#3f5531', size: 12, counts: [40, 22, 12, 6, 2] } };
const floors = new WeakMap();
const floorPattern = (ctx, biome, img) => { let m = floors.get(ctx); if (!m) floors.set(ctx, m = new Map()); if (!m.has(biome)) m.set(biome, ctx.createPattern(img, 'repeat')); return m.get(biome); };
const LAYOUTS = 10, LAYOUT_PX = 5;   // arrangements a density, pixels a map unit they are made at
const plantSets = new Map();
function plantsOf(biome) {
  const p = PLANTED[biome];
  if (!p) return null;
  let set = plantSets.get(biome);
  // (bare ground, as a mountain's rock: its floor only)
  if (p.bare) return { pieces: [], layouts: new Map(), floor: picture(`${biome}-floor`) };
  if (!set) {
    set = { img: picture(`${biome}-plants`), pieces: null, layouts: new Map() };
    if (PLANTED[biome].counts) picture(`${biome}-floor`);
    plantSets.set(biome, set);
    fetch(new URL(`../../images/terrain/${biome}-plants.json`, import.meta.url).href).then(r => r.json()).then(j => { set.pieces = j.pieces; set.big = j.big; retireTiles(); texturesLoaded(); }).catch(() => { set.failed = true; });
  }
  return set.pieces && set.img.complete && set.img.naturalWidth ? set : null;
}
// (a seeded random sequence)
const seq = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// the hex as it shows (at a slant), its six sides as [x0, y0, x1, y1]
const SIDES = Array.from({ length: 6 }, (_, i) => { const at = k => { const a = Math.PI / 180 * (60 * k - 30); return [Math.cos(a) * SIZE, Math.sin(a) * SIZE * TILT]; }; return [...at(i), ...at(i + 1)]; });
// how far (x, y) is inside the hex, from its nearest side (below 0: outside)
const inside = (x, y) => Math.min(...SIDES.map(([x0, y0, x1, y1]) => ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / Math.hypot(x1 - x0, y1 - y0)));
// ---------- shores ----------
// Where land meets a lake or the sea the shore isn't the hexes' straight sides: each corner of it is
// rounded off (the corner where three hexes meet moved a little into the one that is alone in being
// water, or land), and each side between wanders a little either way, the same seen from either hex.
// Only how it is drawn: a hex is still land or water.
const STEP = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
// (the corners of the side towards each STEP, and each corner's place around the middle)
const SIDE_CORNERS = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];
const cornerAt = i => { const a = Math.PI / 180 * (60 * i - 30); return [Math.cos(a) * SIZE, Math.sin(a) * SIZE * TILT]; };
const isWaterAt = (seed, h) => { const c = cellAt(seed, h); return !!c && isWaterCell(c); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
// a corner of hex h where it lies on the shore, around h's middle: moved into the hex it stands alone in
const shoreCorners = new Map();
function shoreCorner(seed, h, i) {
  const at = cornerAt(i), g = add(center(h), at), id = `${seed}|${Math.round(g[0] * 4)},${Math.round(g[1] * 4)}`;
  let v = shoreCorners.get(id);
  if (!v) {
    const three = [h, ...[0, 1, 2, 3, 4, 5].filter(k => SIDE_CORNERS[k].includes(i)).map(k => [h[0] + STEP[k][0], h[1] + STEP[k][1]])];
    const wet = three.filter(t => isWaterAt(seed, t));
    if (wet.length === 0 || wet.length === 3) v = g;
    else {
      const lone = wet.length === 1 ? wet[0] : three.find(t => !isWaterAt(seed, t)), c = center(lone);
      const f = 0.3 + 0.12 * cornerRand(Math.round(g[0] * 4), Math.round(g[1] * 4), 41);
      v = [g[0] + (c[0] - g[0]) * f, g[1] + (c[1] - g[1]) * f];
    }
    if (shoreCorners.size > 60000) shoreCorners.clear();
    shoreCorners.set(id, v);
  }
  const c = center(h);
  return [v[0] - c[0], v[1] - c[1]];
}
// the shore along a water hex's side k (towards land), from corner a to corner b, around its middle:
// points wandering either way, never off the side's middle (where a river may come in)
const SHORE_PTS = 10;
function shoreSide(seed, h, k, a, b) {
  const A = shoreCorner(seed, h, a), B = shoreCorner(seed, h, b), g = add(center(h), cornerAt(a)), g2 = add(center(h), cornerAt(b));
  const i = Math.round((g[0] + g2[0]) * 2), j = Math.round((g[1] + g2[1]) * 2);
  const amp = SIZE * 0.1, a1 = (cornerRand(i, j, 51) - 0.5) * 2, a2 = (cornerRand(i, j, 52) - 0.5) * 0.4;
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, n = [-(B[1] - A[1]) / len, (B[0] - A[0]) / len];
  const out = [];
  for (let s = 1; s < SHORE_PTS; s++) {
    const t = s / SHORE_PTS, d = amp * (a1 * Math.sin(2 * Math.PI * t) + a2 * Math.sin(4 * Math.PI * t));
    out.push([A[0] + (B[0] - A[0]) * t + n[0] * d, A[1] + (B[1] - A[1]) * t + n[1] * d]);
  }
  return out;
}
// a side's points from corner a to corner b of hex h, the shore's wandering in between, on the map
function sideLine(seed, h, k) {
  const [a, b] = SIDE_CORNERS[k], c = center(h);
  return [shoreCorner(seed, h, a), ...shoreSide(seed, h, k, a, b), shoreCorner(seed, h, b)].map(p => add(p, c));
}
const landAt = (seed, h, k) => !isWaterAt(seed, [h[0] + STEP[k][0], h[1] + STEP[k][1]]);
// the line of shore of water hex h starting at its corner i (on the map), from that corner along it
function shoreFrom(seed, h, i) {
  const k = [0, 1, 2, 3, 4, 5].find(k => SIDE_CORNERS[k].includes(i) && landAt(seed, h, k));
  const line = sideLine(seed, h, k);
  return SIDE_CORNERS[k][0] === i ? line : line.reverse();
}
const ROUND = 3;   // (how many of a side's points a rounded corner takes, each way)
// A water hex's outline on the map: a path of its corners and sides, its sides towards land wandering,
// a corner where it is the only water rounded off (by a curve within it); and its shore lines alone,
// for the shallows and the foam. Where it is one of two water hexes at a corner of land, that corner
// is rounded off by tipOf
function waterOutline(seed, h, path, shores) {
  const items = [];
  for (let c = 0; c < 6; c++) {
    const next = (c + 1) % 6, k = SIDE_CORNERS.findIndex(([x, y]) => (x === c && y === next) || (x === next && y === c));
    const lone = landAt(seed, h, k) && landAt(seed, h, SIDE_CORNERS.findIndex((pair, kk) => kk !== k && pair.includes(c)));
    const g = add(shoreCorner(seed, h, c), center(h));
    items.push({ p: g, lone });
    if (landAt(seed, h, k)) {
      const line = sideLine(seed, h, k), fwd = SIDE_CORNERS[k][0] === c ? line : line.reverse();
      for (const p of fwd.slice(1, -1)) items.push({ p });
      shores.push(Object.assign(fwd, { land: cellAt(seed, [h[0] + STEP[k][0], h[1] + STEP[k][1]]) }));
    }
  }
  // (a lone corner: the points next to it dropped, a curve from the one before to the one after)
  const n = items.length, drop = new Set();
  items.forEach((it, i) => { if (it.lone) for (let d = 1; d < ROUND; d++) { drop.add((i - d + n) % n); drop.add((i + d) % n); } });
  const start = items.findIndex((it, i) => !it.lone && !drop.has(i));
  let first = true;
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n, it = items[i];
    if (drop.has(i)) continue;
    if (it.lone) {
      const after = items[(i + ROUND) % n].p;
      path.quadraticCurveTo(it.p[0], it.p[1], after[0], after[1]);
      s += ROUND;
      continue;
    }
    if (first) { path.moveTo(...it.p); first = false; } else path.lineTo(...it.p);
  }
  path.closePath();
}
// Where land pokes into the water between two water hexes: its tip, rounded off, as a shape for the
// water to cover (once a corner, the one with the lesser hex doing it), or nothing
function tipOf(seed, h, c, path) {
  const three = [h, ...[0, 1, 2, 3, 4, 5].filter(k => SIDE_CORNERS[k].includes(c)).map(k => [h[0] + STEP[k][0], h[1] + STEP[k][1]])];
  const wet = three.filter(t => isWaterAt(seed, t));
  if (wet.length !== 2) return;
  const other = wet.find(t => t !== h);
  if (other[0] < h[0] || (other[0] === h[0] && other[1] < h[1])) return;
  // (the other's own number for this corner)
  const V = add(shoreCorner(seed, h, c), center(h)), oc = center(other);
  const c2 = [0, 1, 2, 3, 4, 5].reduce((best, i) => (Math.hypot(...add(add(cornerAt(i), oc), [-add(cornerAt(c), center(h))[0], -add(cornerAt(c), center(h))[1]])) < Math.hypot(...add(add(cornerAt(best), oc), [-add(cornerAt(c), center(h))[0], -add(cornerAt(c), center(h))[1]])) ? i : best), 0);
  const one = shoreFrom(seed, h, c), two = shoreFrom(seed, other, c2);
  const poly = [...one.slice(1, ROUND + 1).reverse(), V, ...two.slice(1, ROUND + 1)];
  let area = 0;
  poly.forEach(([ax, ay], i) => { const [bx, by] = poly[(i + 1) % poly.length]; area += ax * by - bx * ay; });
  const pts = area < 0 ? poly.reverse() : poly;
  path.moveTo(...pts[0]);
  for (const p of pts.slice(1)) path.lineTo(...p);
  path.quadraticCurveTo(V[0], V[1], pts[0][0], pts[0][1]);
  path.closePath();
}
// the sides of a land hex towards water, as STEP indices
const waterSides = (seed, h) => [0, 1, 2, 3, 4, 5].filter(k => isWaterAt(seed, [h[0] + STEP[k][0], h[1] + STEP[k][1]]));
// for a land hex's plants: points of the water's edge in it, each with how far to keep from it
function shoreWet(seed, h, sides) {
  const out = [];
  for (const k of sides) {
    const [a, b] = SIDE_CORNERS[k], A = cornerAt(a), B = cornerAt(b);
    for (let s = 0; s <= 6; s++) out.push([A[0] + (B[0] - A[0]) * s / 6, A[1] + (B[1] - A[1]) * s / 6, SIZE * 0.14]);
    for (const i of [a, b]) { const v = shoreCorner(seed, h, i); out.push([v[0], v[1], SIZE * 0.2]); }
  }
  return out;
}

// river: a hex's river (hexdraw.js riverHalves), its plants kept off the water and its bank (and shore:
// shoreWet's, off a lake's or the sea's edge); such a
// layout is the hex's own, the last RIVER_LAYOUTS of them kept
const RIVER_LAYOUTS = 400;
function layoutOf(biome, set, level, k, river = null, hex = '', shore = []) {
  const id = (river && river.length) || shore.length ? `${level}|${k}|${hex}` : `${level}|${k}`;
  if (set.layouts.has(id)) return set.layouts.get(id);
  // (points along the river's curves and the shore, each with how far from it a plant's middle stays)
  const wet = [...shore];
  if (river) for (const { pts } of river) for (const [x, y, w] of pts) wet.push([x, y, w / 2 + 1.5]);
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
    if (wet.some(([wx, wy, d]) => Math.hypot(wx - x, wy - y) < d + r * 0.8)) continue;
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
  if (wet.length) { set.rivers = (set.rivers || 0) + 1; if (set.rivers > RIVER_LAYOUTS) { for (const key of set.layouts.keys()) if (key.split('|').length > 2) { set.layouts.delete(key); break; } } }
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
// a little dimmer. edge: the faint line between hexes (GRID). detail: 'dots' (squares of colour, from
// very far); otherwise what is drawn goes by how big a hex looks (LOD)
// How much is drawn by how big a hex looks: each thing from this many pixels (a hex's radius on the
// screen, the device's pixels) up; below 3 the map is squares of colour ('dots') whatever these say.
// Below plants, a planted ground (forest, meadow…) is its colour alone; below texture, a painted ground
// too. Set today so the map looks as it always has (plants and pictures down to 3 px: even that small
// they give the forests their grain); raise one when new detail makes the map slow from afar. The
// tiles are drawn at about 15, 7.5 and 3.75 px a hex, so a threshold between those moves a whole level.
// Below blend, the ground is no longer drawn hex by hex at all: each hex's colour, lit as it lies, blended
// smoothly into its neighbours' (groundField), so from afar no hex shows, only the lie of the land.
export const LOD = { blend: 9, texture: 3, plants: 3, relief: 9, glyphs: 9, grid: 9 };
// The whole map's ground as one small picture, two pixels a hex across and one a row of hexes down,
// each hex's colour lit as it lies (dimmer where not yet explored), to be stretched over the map
// smoothly: { canvas, x, y, w, h } (where it lies on the map, map units). Made again when what is known
// changes (sig)
const fields = new Map();
function groundField(seed, known, sig) {
  const id = `${seed}|${sig}`;
  if (fields.has(id)) return fields.get(id);
  const hexes = [...ALL_HEXES, ...WILDS_HEXES], hw = SIZE * SQ3 / 2, rh = SIZE * 1.5 * TILT;
  let n0 = Infinity, n1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const [q, r] of hexes) { n0 = Math.min(n0, 2 * q + r); n1 = Math.max(n1, 2 * q + r); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
  const W = n1 - n0 + 2, H = r1 - r0 + 1, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (const h of hexes) {
    const cell = cellAt(seed, h);
    if (!cell) continue;
    let rgb = rgbOf(fillOf(cell));
    if (!isWaterCell(cell)) {
      const [t, to] = lightTo(lightOf(seed, h).m);
      rgb = rgb.map((v, i) => v + (to[i] - v) * t);
      if (!known(hexKey(...h))) rgb = rgb.map((v, i) => v * 0.84 + [30, 34, 28][i] * 0.16);
    }
    if (cell.city || (h[0] === 0 && h[1] === 0)) rgb = rgbOf('#a8743c');
    const x = 2 * h[0] + h[1] - n0, y = h[1] - r0;
    for (const k of [(y * W + x) * 4, (y * W + x + 1) * 4]) { d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  const out = { canvas, x: hw * n0 - hw, y: rh * r0 - rh / 2, w: W * hw, h: H * rh };
  if (fields.size > 2) fields.delete(fields.keys().next().value);
  fields.set(id, out);
  return out;
}
export function drawHexes(ctx, seed, hexes, known, edge = GRID, detail = 'full', sig = '') {
  // (a hair bigger than the hex, so neighbours meet with no gap between them)
  const shape = hexPath(1.01);
  const dim = 'rgba(30, 34, 28, .16)';
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = edge;
  const px = SIZE * Math.hypot(ctx.getTransform().a, ctx.getTransform().b), smooth = px >= 44;
  if (detail === 'dots' || px < LOD.blend) {
    // the ground blended, no hex showing (the part of the map's picture under these hexes)
    const f = groundField(seed, known, sig), [ax, ay, bx, by] = areaOf(hexes), m = SIZE * 2;
    const kx = f.canvas.width / f.w, ky = f.canvas.height / f.h;
    const sx = Math.max(0, Math.floor((ax - m - f.x) * kx)), sy = Math.max(0, Math.floor((ay - m - f.y) * ky));
    const sw = Math.min(f.canvas.width, Math.ceil((bx + m - f.x) * kx)) - sx, sh = Math.min(f.canvas.height, Math.ceil((by + m - f.y) * ky)) - sy;
    if (sw > 0 && sh > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(f.canvas, sx, sy, sw, sh, f.x + sx / kx, f.y + sy / ky, sw / kx, sh / ky);
      ctx.restore();
    }
    // (from very far only the great rivers show)
    drawRivers(ctx, seed, hexes, detail === 'dots' ? 8 : 3);
    drawRails(ctx, seed, areaOf(hexes));
    if (detail !== 'dots') for (const h of hexes) { const key = hexKey(...h), cell = cellAt(seed, h); if (key === '0,0' || cell.city) { const [x, y] = center(h); paint(ctx, key === '0,0' ? NEST : CITY, x, y); } }
    return;
  }
  // the ground: first each hex in its colour, lit as it lies; then those with a picture of their ground,
  // each within its own hex (their light over it too); then over all of them, the unexplored dimmed and
  // the line between hexes
  const textured = [], waters = [];
  // (a land hex's ground runs on under the water beside it, to where the wandering shore comes)
  const under = (h, sides) => { for (const k of sides) { const [a, b] = SIDE_CORNERS[k], o = center(STEP[k]); ctx.beginPath(); ctx.moveTo(...cornerAt(a)); ctx.lineTo(...cornerAt(b)); ctx.lineTo(...o); ctx.closePath(); ctx.fill(); } };
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h);
    if (isWaterCell(cell)) { waters.push(h); continue; }
    const sides = waterSides(seed, h);
    const biome = groundName(cell), dense = rank(biome) >= 0 || PLANTED[biome] ? densityOf(seed, h, biome) : 0;
    // (cooled lava has the volcanic slopes' ground too)
    const planted = px >= LOD.plants && (!isWaterCell(cell) || PLANTED[biome]) && plantsOf(biome);
    if (planted) {
      // (its floor: a picture laid over the whole map, not hex by hex, so it runs on from one hex into the
      // next; plain until it has come. The light is laid over it with its plants, below)
      const floor = picture(`${biome}-floor`);
      ctx.save(); ctx.translate(x, y);
      if (floor.complete && floor.naturalWidth) {
        const k = SIZE * SQ3 * (PLANTED[biome].span || 2.4) / floor.naturalWidth, pat = floorPattern(ctx, biome, floor);
        pat.setTransform(new DOMMatrix([k, 0, 0, k * TILT, -x, -y]));
        ctx.fillStyle = pat;
      } else ctx.fillStyle = PLANTED[biome].floor;
      ctx.fill(shape); under(h, sides); ctx.restore();
      textured.push({ h, x, y, cell, planted, dense, sides });
      continue;
    }
    const tex = px >= LOD.texture && !PLANTED[biome] && !isWaterCell(cell) && !cell.lava && textureOf(ctx, biome, dense);
    if (tex) { textured.push({ h, x, y, cell, tex, dense }); continue; }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = groundFill(ctx, seed, h, cell, smooth);
    ctx.fill(shape);
    under(h, sides);
    ctx.restore();
  }
  // (the banks of mud and sand on the ground, under the plants standing by the water)
  drawWater(ctx, seed, waters, px, 'bank');
  drawRivers(ctx, seed, hexes, px >= LOD.relief ? 1 : 3, 'bank');
  textured.sort((a, b) => rank(groundName(a.cell)) - rank(groundName(b.cell)));
  for (const { h, x, y, cell, tex, planted, dense, sides } of textured) {
    if (planted) {
      if (!PLANTED[groundName(cell)].counts[dense]) continue;
      // (a hex with a river or a shore has its own, its plants off the water: never mirrored, as its
      // water isn't)
      const river = cell.river ? riverHalves(seed, h) : null, shore = sides.length ? shoreWet(seed, h, sides) : [];
      const L = planted, lay = layoutOf(groundName(cell), L, dense, Math.floor(cornerRand(h[0], h[1], 81) * LAYOUTS), river, hexKey(...h), shore);
      ctx.save();
      ctx.translate(x, y);
      if (!river && !shore.length && cornerRand(h[0], h[1], 82) < 0.5) ctx.scale(-1, 1);
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
    if (isWaterCell(cell)) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = groundFill(ctx, seed, h, cell, true, true);
    ctx.fill(shape);
    ctx.restore();
  }
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h), unknown = !isWaterCell(cell) && !known(hexKey(...h));
    if (isWaterCell(cell) || (!unknown && px < LOD.grid)) continue;
    ctx.save();
    ctx.translate(x, y);
    if (unknown) { ctx.fillStyle = dim; ctx.fill(shape); }
    if (px >= LOD.grid) {
      // (no line along a shore: the water has none)
      const sides = waterSides(seed, h);
      if (!sides.length) ctx.stroke(shape);
      else { ctx.beginPath(); for (let k = 0; k < 6; k++) if (!sides.includes(k)) { const [a, b] = SIDE_CORNERS[k]; ctx.moveTo(...cornerAt(a)); ctx.lineTo(...cornerAt(b)); } ctx.stroke(); }
    }
    ctx.restore();
  }
  // (the rivers first: where one runs into a lake or the sea, the water and its shallows lie over its end)
  drawRivers(ctx, seed, hexes, px >= LOD.relief ? 1 : 3, 'water');
  drawWater(ctx, seed, waters, px, 'water');
  drawRails(ctx, seed, areaOf(hexes));
  // (north to south, so what stands up out of a hex, a mountain, is in front of the hexes behind it)
  for (const h of [...hexes].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const [x, y] = center(h), cell = cellAt(seed, h), key = hexKey(...h), alpha = !isWaterCell(cell) && !known(key) ? 0.7 : 1;
    const relief = px >= LOD.relief && key !== '0,0' && !cell.city && reliefOf(cell, h, upAt(seed, h));
    if (relief) { if (!drawPainted(ctx, relief, x, y, alpha)) drawRelief(ctx, relief, x, y, alpha); continue; }
    // (ground with a picture of its own needs no little drawing)
    const art = key === '0,0' ? NEST : cell.city ? CITY : px >= LOD.glyphs && !hasTexture(groundName(cell)) ? glyphOf(cell, h) : '';
    if (art) paint(ctx, art, x, y, alpha);
  }
}
// The rivers of these hexes, one line from hex to hex (the ones carrying at least minFlow); from afar
// never thinner on screen than the water they carry deserves
// The kinds of shore (images/terrain/<name>-floor.webp): how wide (by bankAt), its colour from afar,
// and a picture it borrows, if it has none of its own. A lake's is mud; the sea's sand, but where a
// swamp meets it a mangrove's mudflat
const SHORES = {
  lakeshore: { wide: 1, color: 'rgba(80, 64, 46, .45)' },
  beach: { wide: 1.6, color: 'rgba(70, 60, 40, .22)' },
  mangrove: { wide: 1.3, color: 'rgba(60, 64, 50, .4)' },
};
const shoreOf = (kind, land) => (kind === 'lake' ? 'lakeshore' : land && land.biome === 'swamp' ? 'mangrove' : 'beach');
// how far up onto the land a lake's bank reaches here (of SIZE): smooth over the map, the same from
// either hex
const bankAt = ([x, y]) => 0.02 + 0.14 * (0.5 + 0.25 * Math.sin(x * 0.11 + y * 0.07) + 0.25 * Math.sin(x * 0.05 - y * 0.13 + 1.7));
// a shore's picture (a lake's mud, the sea's sand) as a pattern laid over the map, or null until it has
// come (or from afar)
function mudOf(ctx, px, name = 'lakeshore') {
  const img = picture(`${name}-floor`);
  if (px < LOD.plants || !img.complete || !img.naturalWidth) return null;
  const pat = floorPattern(ctx, name, img), k = SIZE * SQ3 * 2.5 / img.naturalWidth;
  pat.setTransform(new DOMMatrix([k, 0, 0, k * TILT, 0, 0]));
  return pat;
}
// The lakes and the sea: each one shape over its hexes (no line between them), their shores wandering
// (waterOutline); in its picture close up. Along a shore the water is shallower, paler, and on the sea a
// line of foam, on a lake a darker wet edge
// What lies in the water along its shores (images/terrain/water-plants.webp, scripts/plants.py; kinds
// in its .json): on a lake reeds at the edge, water lilies a little out, now and then a rock or a log; on
// the sea foam and rocks where the waves break, a log washed up. { kind: [[chance a side of shore, how
// far out (of SIZE), how big (map units)]] }; a mangrove's (where a swamp meets the sea) calmer, reedy
const SHORE_THINGS = {
  mangrove: [['reed', 0.4, 0.06, 12], ['reed', 0.2, 0.12, 11], ['log', 0.04, 0.12, 16]],
  lake: [['reed', 0.55, 0.06, 13], ['reed', 0.3, 0.1, 12], ['lily', 0.5, 0.3, 13], ['lily', 0.25, 0.45, 12], ['rock', 0.1, 0.12, 10], ['log', 0.06, 0.15, 16]],
  ocean: [['foam', 0.6, 0.1, 19], ['foam', 0.25, 0.2, 15], ['rock', 0.18, 0.14, 11], ['rock', 0.08, 0.25, 10], ['log', 0.012, 0.1, 16]],
};
const THINGS = { img: null, pieces: null };
function drawShoreThings(ctx, list) {
  const T = THINGS;
  if (!T.img) {
    T.img = picture('water-plants');
    fetch(new URL('../../images/terrain/water-plants.json', import.meta.url).href).then(res => res.json()).then(j => {
      T.pieces = j.pieces; T.big = j.big; T.of = {};
      j.kinds.forEach((k, i) => (T.of[k] = T.of[k] || []).push(i));
      retireTiles(); texturesLoaded();
    }).catch(() => { T.failed = true; });
  }
  if (!T.pieces || !T.img.complete || !T.img.naturalWidth) return;
  for (const t of list.sort((a, b) => a.y - b.y)) {
    const ids = T.of[t.kind];
    if (!ids) continue;
    const [sx, sy, sw, sh] = T.pieces[ids[Math.floor(t.pick * 997) % ids.length]], k = t.size * (0.85 + 0.3 * t.pick) / T.big, w = sw * k, h = sh * k;
    ctx.save();
    ctx.translate(t.x, t.y);
    if (t.flip && t.kind !== 'rock' && t.kind !== 'log') ctx.scale(-1, 1);
    // (standing in the water: its foot at the point)
    ctx.drawImage(T.img, sx, sy, sw, sh, -w / 2, t.kind === 'reed' ? -h * 0.9 : -h / 2, w, h);
    ctx.restore();
  }
}
// part: 'bank' (the wet ground above the waterline, under the rivers) or 'water' (over their ends)
function drawWater(ctx, seed, hexes, px, part) {
  const things = [];
  for (const kind of ['ocean', 'lake']) {
    const area = new Path2D(), edge = new Path2D(), banks = new Map();
    let any = false;
    for (const h of hexes) {
      if (cellAt(seed, h).terrain !== kind) continue;
      any = true;
      const shores = [];
      waterOutline(seed, h, area, shores);
      for (let c = 0; c < 6; c++) tipOf(seed, h, c, area);
      // (things along each side of shore, each its own chance, place and size)
      if (px >= 30) shores.forEach((line, n) => SHORE_THINGS[shoreOf(kind, line.land) === 'mangrove' ? 'mangrove' : kind].forEach(([what, chance, out, size], m) => {
        const r = salt => cornerRand(h[0] * 7 + n, h[1] * 7 + m, salt);
        if (r(61) >= chance) return;
        const p = line[1 + Math.floor(r(62) * (line.length - 2))], c = center(h), d = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1, o = SIZE * out * (0.7 + 0.6 * r(63));
        things.push({ kind: what, x: p[0] + (c[0] - p[0]) / d * o, y: p[1] + (c[1] - p[1]) / d * o, size, pick: r(64), flip: r(65) < 0.5 });
      }));
      const c = center(h);
      for (const line of shores) {
        const name = shoreOf(kind, line.land);
        if (!banks.has(name)) banks.set(name, { edge: new Path2D(), bank: new Path2D() });
        const b = banks.get(name);
        for (const path of [edge, b.edge]) { path.moveTo(...line[0]); for (const p of line.slice(1)) path.lineTo(...p); }
        // (the bank's far edge: the shore moved up onto the land, by more in some places than others)
        line.forEach((p, i) => { const d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1, o = SIZE * bankAt(p) * SHORES[name].wide; b.bank[i ? 'lineTo' : 'moveTo'](p[0] + (p[0] - c[0]) / d * o, p[1] + (p[1] - c[1]) / d * o); });
      }
    }
    if (!any) continue;
    const floor = picture(`${kind}-floor`);
    if (px >= LOD.plants && floor.complete && floor.naturalWidth) {
      const k = SIZE * SQ3 * PLANTED[kind].span / floor.naturalWidth, pat = floorPattern(ctx, kind, floor);
      pat.setTransform(new DOMMatrix([k, 0, 0, k * TILT, 0, 0]));
      ctx.fillStyle = pat;
    } else ctx.fillStyle = PLANTED[kind].floor;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // (wet ground just above the waterline, its kind by the land's (SHORES): a bank of its picture, wider
    // in places, fading into the land)
    if (part === 'bank') {
      for (const [name, b] of banks) {
        const mud = mudOf(ctx, px, SHORES[name].picture || name), wide = SHORES[name].wide;
        if (mud) {
          ctx.strokeStyle = mud;
          for (const [path, w, a] of [[b.bank, 0.22, 0.25], [b.bank, 0.12, 0.5], [b.edge, 0.24, 0.5], [b.edge, 0.14, 0.85]]) { ctx.globalAlpha = a; ctx.lineWidth = SIZE * w * wide; ctx.stroke(path); }
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = SHORES[name].color;
          ctx.lineWidth = SIZE * 0.1;
          ctx.stroke(b.edge);
        }
      }
      ctx.restore();
      continue;
    }
    ctx.fill(area);
    ctx.clip(area);
    // (the bank showing through the shallowest water)
    for (const [name, b] of banks) {
      const mud = mudOf(ctx, px, SHORES[name].picture || name);
      if (mud) { ctx.globalAlpha = 0.3; ctx.strokeStyle = mud; ctx.lineWidth = SIZE * 0.2; ctx.stroke(b.edge); ctx.globalAlpha = 1; }
    }
    // (the shallows, paler the nearer the shore)
    for (const [w, a] of [[0.8, 0.06], [0.65, 0.06], [0.5, 0.07], [0.36, 0.07], [0.24, 0.08], [0.12, 0.08]]) {
      ctx.strokeStyle = kind === 'ocean' ? `rgba(140, 215, 210, ${a})` : `rgba(200, 235, 225, ${a})`;
      ctx.lineWidth = SIZE * w;
      ctx.stroke(edge);
    }
    // (the waterline: foam where the sea's waves break, none on a mangrove's calm water)
    ctx.strokeStyle = kind === 'ocean' ? 'rgba(245, 250, 245, .7)' : 'rgba(225, 238, 230, .22)';
    ctx.lineWidth = kind === 'ocean' ? SIZE * 0.07 : SIZE * 0.04;
    for (const [name, b] of banks) if (name !== 'mangrove') ctx.stroke(b.edge);
    ctx.restore();
  }
  if (part === 'water') drawShoreThings(ctx, things);
}
// Each half of river (hexdraw.js riverHalves) filled as the shape its changing width makes, all of them
// one shape (so where they overlap, at a hex's middle, nothing shows twice). Close up, the water is the
// lake's (its picture, laid over the map as the lakes' is) within a thin bank of the lakes' mud
// (part: 'bank' only its bank, 'water' only its water; both if not given)
function drawRivers(ctx, seed, hexes, minFlow, part) {
  const scale = Math.max(1e-6, ctx.getTransform().a), hair = 1 / scale, lake = picture('lake-floor');
  const close = scale * SIZE >= LOD.plants * 4 && lake.complete && lake.naturalWidth;
  const halves = [];
  for (const h of hexes) {
    const cell = cellAt(seed, h);
    if (!cell.river || cell.flow < minFlow) continue;
    const [x, y] = center(h);
    for (const s of riverHalves(seed, h)) if (s.flow >= minFlow) halves.push({ x, y, pts: s.pts, shore: s.shore });
  }
  // (bank: the bank's shape, stopping at a shore)
  const shape = (grow, bank = false) => {
    const path = new Path2D();
    for (const h of halves) {
      const { x, y } = h, pts = bank ? h.pts.slice(0, h.shore + 1) : h.pts;
      const left = [], right = [];
      pts.forEach(([px, py, w], i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const r = (Math.max(w, hair * (0.6 + Math.sqrt(w) * 0.45)) + grow) / 2, nx = -(b[1] - a[1]) / l * r, ny = (b[0] - a[0]) / l * r;
        left.push([x + px + nx, y + py + ny]); right.push([x + px - nx, y + py - ny]);
      });
      // (all turning the same way, as the circles do, so none cancels another out where they overlap)
      let poly = [...left, ...right.reverse()], area = 0;
      poly.forEach(([ax, ay], i) => { const [bx, by] = poly[(i + 1) % poly.length]; area += ax * by - bx * ay; });
      if (area < 0) poly = poly.reverse();
      path.moveTo(...poly[0]);
      for (const p of poly.slice(1)) path.lineTo(...p);
      path.closePath();
      // (round where it runs through the hex's middle, where halves meet)
      const [px, py, w] = pts[0], r = (Math.max(w, hair * (0.6 + Math.sqrt(w) * 0.45)) + grow) / 2;
      path.moveTo(x + px + r, y + py);
      path.arc(x + px, y + py, r, 0, Math.PI * 2);
    }
    return path;
  };
  ctx.save();
  if (close) {
    // (a thin bank of the lakes' mud, fading into the land)
    const mud = mudOf(ctx, scale * SIZE), grow = Math.max(1.6, hair * 1.5);
    if (part === 'water') {}
    else if (mud) {
      ctx.fillStyle = mud;
      ctx.globalAlpha = 0.4; ctx.fill(shape(grow * 2.2, true), 'nonzero');
      ctx.globalAlpha = 0.85; ctx.fill(shape(grow * 1.2, true), 'nonzero');
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(52, 58, 36, 0.45)';
      ctx.fill(shape(grow, true), 'nonzero');
    }
    if (part === 'bank') { ctx.restore(); return; }
    const k = SIZE * SQ3 * PLANTED.lake.span / lake.naturalWidth, pat = floorPattern(ctx, 'lake', lake);
    pat.setTransform(new DOMMatrix([k, 0, 0, k * TILT, 0, 0]));
    ctx.fillStyle = pat;
  } else if (part === 'bank') { ctx.restore(); return; } else ctx.fillStyle = RIVER_COLOR;
  ctx.fill(shape(0), 'nonzero');
  ctx.restore();
}
// The maglev's elevated lines: a dark guideway with a pale rail along it, drawn smooth along each line
// (the hexes' middles eased into a gentle curve, the stations where they are), and through a mountain in
// a tunnel: only a faint dashed line where it runs under it, the trains unseen there. Never thinner on
// screen than a couple of pixels
const RAIL = [['#3b4047', 6, 2.4], ['#dfe3e8', 1.8, 0.8]];
const curves = new Map();
// a line's hexes (keys, in order) as the points of its smooth curve, one a hex, in map units
export function railCurve(path) {
  const id = path[0] + '|' + path[path.length - 1] + '|' + path.length;
  if (curves.has(id)) return curves.get(id);
  let pts = path.map(k => center(k.split(',').map(Number)));
  // (a few rounds of each point moved to the middle of its neighbours, the ends kept)
  for (let round = 0; round < 3; round++) {
    pts = pts.map((p, i) => {
      const r = Math.min(3, i, pts.length - 1 - i);
      if (!r) return p;
      let x = 0, y = 0;
      for (let d = -r; d <= r; d++) { x += pts[i + d][0]; y += pts[i + d][1]; }
      return [x / (2 * r + 1), y / (2 * r + 1)];
    });
  }
  if (curves.size > 200) curves.clear();
  curves.set(id, pts);
  return pts;
}
// A ride's way (hex keys, from its first station) along the track as drawn: each stretch between two
// stations on its line's curve, one point a hex
export function railPoints(seed, keys) {
  const stations = new Set(railsOf(seed).stations), out = [];
  let start = 0;
  for (let i = 1; i < keys.length; i++) {
    if (!stations.has(keys[i]) && i < keys.length - 1) continue;
    const pts = railCurve(keys.slice(start, i + 1));
    out.push(...(start ? pts.slice(1) : pts));
    start = i;
  }
  return out.length ? out : keys.map(k => center(k.split(',').map(Number)));
}
// whether a line runs under a mountain at its hex
export const inTunnel = (seed, k) => { const c = cellAt(seed, k.split(',').map(Number)); return !!c && c.terrain === 'mountain'; };
// (the box a few hexes' middles lie in: [x0, y0, x1, y1])
const areaOf = hexes => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const h of hexes) { const [x, y] = center(h); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
// (each line's track and tunnels as paths, made once, with the box each lies in)
const railShapes = new Map();
function railShapesOf(seed) {
  if (railShapes.has(seed)) return railShapes.get(seed);
  const out = railsOf(seed).lines.map(l => {
    const pts = railCurve(l.path), open = new Path2D(), tunnel = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 1; i < pts.length; i++) {
      const under = inTunnel(seed, l.path[i - 1]) && inTunnel(seed, l.path[i]), p = under ? tunnel : open;
      p.moveTo(...pts[i - 1]);
      p.lineTo(...pts[i]);
    }
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { open, tunnel, box: [x0, y0, x1, y1] };
  });
  if (railShapes.size > 4) railShapes.clear();
  railShapes.set(seed, out);
  return out;
}
function drawRails(ctx, seed, area = null) {
  const hair = 1 / Math.max(1e-6, ctx.getTransform().a), pad = SIZE * 2;
  const shown = railShapesOf(seed).filter(({ box: [x0, y0, x1, y1] }) => !area || (x1 >= area[0] - pad && x0 <= area[2] + pad && y1 >= area[1] - pad && y0 <= area[3] + pad));
  if (!shown.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [color, width, px] of RAIL) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(width, hair * px);
    for (const r of shown) ctx.stroke(r.open);
  }
  // (the tunnels)
  ctx.strokeStyle = 'rgba(40, 44, 50, 0.45)';
  ctx.lineWidth = Math.max(2, hair * 1);
  ctx.setLineDash([Math.max(4, hair * 3), Math.max(4, hair * 3)]);
  for (const r of shown) ctx.stroke(r.tunnel);
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
// A tile not drawn yet is drawn in the next frames (as many as fit in a few milliseconds a frame, so
// zooming never stalls), the blurrier one standing in; and once the view is all drawn, the tiles one
// sharper and one blurrier for it are drawn ahead while the browser is idle, ready for the next zoom.
const TILE = 256, LEVELS = [0.5, 0.25, 0.125, 0.0625, 0.03125], TILE_KEEP = 160;
const tiles = new Map();
// When a picture of the ground comes, every tile drawn before it is out of date; they are kept aside
// (stale), still shown until their new ones are all drawn, so the map never blinks while it catches up
let stale = new Map(), lastWarm = null;
function retireTiles() {
  for (const [id, c] of tiles) { stale.delete(id); stale.set(id, c); }
  tiles.clear();
  while (stale.size > TILE_KEEP * 2) stale.delete(stale.keys().next().value);
  // (the whole map's blurriest tiles drawn again soon, to fall back on)
  if (lastWarm) setTimeout(() => warmTiles(...lastWarm), 300);
}
const detailAt = k => (SIZE * k >= 9 ? 'full' : SIZE * k >= 3 ? 'plain' : 'dots');
function tileOf(seed, known, sig, edge, k, tx, ty) {
  const id = `${seed}|${sig}|${edge}|${k}|${tx}|${ty}`;
  if (tiles.has(id)) { const c = tiles.get(id); tiles.delete(id); tiles.set(id, c); return c; }
  return null;
}
// a tile up to date, or else one out of date (to show while the new one is drawn)
const anyTileOf = (seed, known, sig, edge, k, tx, ty) => tileOf(seed, known, sig, edge, k, tx, ty) || stale.get(`${seed}|${sig}|${edge}|${k}|${tx}|${ty}`) || null;
function makeTile(seed, known, sig, edge, k, tx, ty) {
  const id = `${seed}|${sig}|${edge}|${k}|${tx}|${ty}`, b = mapBounds(), span = TILE / k;
  const ox = b.x + tx * span, oy = b.y + ty * span;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.translate(-ox, -oy);
  drawHexes(ctx, seed, hexesIn(ox, oy, ox + span, oy + span), known, edge, detailAt(k), sig);
  tiles.set(id, canvas);
  // (the oldest let go, but never the blurriest level's: the map whole, always there to fall back on)
  for (const old of tiles.keys()) {
    if (tiles.size <= TILE_KEEP) break;
    if (old.split('|')[3] !== String(LEVELS.at(-1))) tiles.delete(old);
  }
  return canvas;
}
// Draws the tiles covering the view (f: from fit); returns whether some are still to be drawn (then
// ask for another frame). sig: what of the map is known (when it changes, the tiles are drawn anew).
export function drawTiles(ctx, seed, f, known, sig, edge) {
  const b = mapBounds(), need = f.scale * f.dpr;
  const want = [...LEVELS].reverse().find(l => l >= need) || LEVELS[0];
  const x1 = f.x0 + f.width / f.scale, y1 = f.y0 + f.height / f.scale;
  // (the tiles of a level covering the view)
  const cover = k => {
    const span = TILE / k, out = [];
    const tx0 = Math.max(0, Math.floor((f.x0 - b.x) / span)), tx1 = Math.min(Math.ceil(b.w / span) - 1, Math.floor((x1 - b.x) / span));
    const ty0 = Math.max(0, Math.floor((f.y0 - b.y) / span)), ty1 = Math.min(Math.ceil(b.h / span) - 1, Math.floor((y1 - b.y) / span));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) out.push([tx, ty]);
    return out;
  };
  // the level wanted, built a few milliseconds a frame out of sight; until it is all there, the
  // nearest level that is (sharper first) is shown whole instead, so the map never shows itself
  // being built
  const until = performance.now() + TILE_MS, tiles = cover(want);
  let made = 0;
  for (const [tx, ty] of tiles) {
    if (tileOf(seed, known, sig, edge, want, tx, ty)) continue;
    if (made && performance.now() >= until) break;
    makeTile(seed, known, sig, edge, want, tx, ty);
    made++;
  }
  const ready = (k, get) => cover(k).every(([tx, ty]) => get(seed, known, sig, edge, k, tx, ty));
  // (the whole view from one level, all there: the one wanted, or a sharper one; a blurrier one would
  // look a different map (from afar the ground is drawn otherwise), so it never stands in for all of it)
  const order = [want, ...LEVELS.filter(l => l > want).sort((p, q) => p - q)];
  // (a level all up to date; else one all there, some of it out of date)
  let k = order.find(l => ready(l, tileOf)), get = tileOf;
  if (k == null) { k = order.find(l => ready(l, anyTileOf)); get = anyTileOf; }
  if (k == null) {
    // (not all there yet: each tile of the level wanted that is, and a blurrier one standing in for
    // each that isn't, until it is)
    const span = TILE / want;
    for (const [tx, ty] of tiles) {
      const x = b.x + tx * span, y = b.y + ty * span, t = anyTileOf(seed, known, sig, edge, want, tx, ty);
      if (t) { ctx.drawImage(t, x, y, span, span); continue; }
      for (const l of LEVELS.filter(l => l < want)) {
        const s2 = TILE / l, px = Math.floor((x - b.x) / s2), py = Math.floor((y - b.y) / s2), up = anyTileOf(seed, known, sig, edge, l, px, py);
        if (!up) continue;
        const fx = (x - b.x - px * s2) / s2 * TILE, fy = (y - b.y - py * s2) / s2 * TILE, fw = span / s2 * TILE;
        ctx.drawImage(up, fx, fy, fw, fw, x, y, span, span);
        break;
      }
    }
    return true;
  }
  const span = TILE / k;
  for (const [tx, ty] of cover(k)) ctx.drawImage(get(seed, known, sig, edge, k, tx, ty), b.x + tx * span, b.y + ty * span, span, span);
  if (k !== want || get !== tileOf) return true;
  drawAhead(seed, known, sig, edge, f, k);
  return false;
}
// (how long a frame may spend drawing tiles)
const TILE_MS = 8;
// the tiles the next zoom in or out would need, drawn while the browser is idle, a few at a time
let ahead = null;
// Close up, where the map is drawn hex by hex (no tiles): the sharpest tiles for around the view built
// out of sight, so a zoom out finds them ready rather than showing a blurry map while they are made
export function warmAround(seed, known, sig, edge, f) { drawAhead(seed, known, sig, edge, f, LEVELS[0] * 2); }
function drawAhead(seed, known, sig, edge, f, k) {
  const b = mapBounds(), x1 = f.x0 + f.width / f.scale, y1 = f.y0 + f.height / f.scale, cx = (f.x0 + x1) / 2, cy = (f.y0 + y1) / 2;
  const id = `${seed}|${sig}|${k}|${Math.round(f.x0)}|${Math.round(f.y0)}|${Math.round(x1)}`;
  if (ahead && ahead.id === id) return;
  const todo = [];
  for (const l of LEVELS.filter(l => l === k * 2 || l === k / 2)) {
    // (the sharper level for the middle of the view, where a zoom in lands; the blurrier for twice the view)
    const half = l > k ? 0.5 : 2, span = TILE / l;
    const ax = cx - (x1 - f.x0) / 2 * half, bx = cx + (x1 - f.x0) / 2 * half, ay = cy - (y1 - f.y0) / 2 * half, by = cy + (y1 - f.y0) / 2 * half;
    for (let ty = Math.max(0, Math.floor((ay - b.y) / span)); ty <= Math.min(Math.ceil(b.h / span) - 1, Math.floor((by - b.y) / span)); ty++)
      for (let tx = Math.max(0, Math.floor((ax - b.x) / span)); tx <= Math.min(Math.ceil(b.w / span) - 1, Math.floor((bx - b.x) / span)); tx++) todo.push([l, tx, ty]);
  }
  const job = ahead = { id };
  const idle = globalThis.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => TILE_MS }), 50));
  const step = deadline => {
    if (ahead !== job) return;
    while (todo.length && deadline.timeRemaining() > 2) {
      const [l, tx, ty] = todo.shift();
      if (!tileOf(seed, known, sig, edge, l, tx, ty)) makeTile(seed, known, sig, edge, l, tx, ty);
    }
    if (todo.length) idle(step);
  };
  idle(step);
}
// draws the blurriest tiles of the whole map ahead of time, so the first look from afar is ready
export function warmTiles(seed, known, sig, edge) {
  lastWarm = [seed, known, sig, edge];
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
// Every picture of the ground, the plants, the mountains and the water asked for at once (they are
// otherwise fetched as the map first needs each), and a promise of when all are there (or failed, or
// after a while anyway), so the map can be shown only once it looks as it should
let preloading = null;
export function preloadTerrain(wait = 12000) {
  if (preloading) return preloading;
  const checks = [];
  const pic = name => { const img = picture(name); checks.push(() => img.complete); };
  for (const [biome, p] of Object.entries(PLANTED)) {
    pic(`${biome}-floor`);
    if (!p.bare) { const set = (plantsOf(biome), plantSets.get(biome)); checks.push(() => !!set.pieces || set.failed); pic(`${biome}-plants`); }
  }
  for (const name of Object.keys(SHORES)) pic(`${SHORES[name].picture || name}-floor`);
  const ask = (M, load) => { load(); checks.push(() => !!M.pieces || M.failed); };
  for (const terrain of Object.keys(PAINTED)) ask(PAINTED[terrain], () => paintedPlace({ terrain, t: 0, snow: 0, pick: 0, dx: 0, dy: 0 }, 0, 0));
  ask(THINGS, () => drawShoreThings(null, []));
  const start = performance.now();
  preloading = new Promise(done => {
    const look = () => (checks.every(c => c()) || performance.now() - start > wait ? done() : setTimeout(look, 60));
    look();
  });
  return preloading;
}

// What moves on the map among these hexes (ui/world.js draws it, every frame, over the map): the
// lakes' and the sea's water (one shape each, as drawWater has them), the sea's surf (its shores where
// waves break: not a mangrove's), and the smoking volcanoes' craters ({ x, y, size }: where their smoke
// rises from, how big the volcano is); pending: a volcano's picture hasn't come yet
export function ambientOf(seed, hexes) {
  const water = new Path2D(), surf = new Path2D(), craters = [];
  let wet = false, surfs = false, pending = false;
  for (const h of hexes) {
    const cell = cellAt(seed, h);
    if (isWaterCell(cell)) {
      wet = true;
      const shores = [];
      waterOutline(seed, h, water, shores);
      for (let c = 0; c < 6; c++) tipOf(seed, h, c, water);
      if (cell.terrain === 'ocean') for (const line of shores) if (shoreOf('ocean', line.land) === 'beach') { surfs = true; surf.moveTo(...line[0]); for (const p of line.slice(1)) surf.lineTo(...p); }
      continue;
    }
    if (cell.terrain !== 'volcano') continue;
    const r = reliefOf(cell, h, upAt(seed, h)), [x, y] = center(h), p = r && paintedPlace(r, x, y);
    if (r && !p) pending = true;
    if (p && p.active) craters.push({ x: p.left + p.w * 0.5, y: p.top + p.h * 0.24, size: p.w });
  }
  return { water: wet ? water : null, surf: surfs ? surf : null, craters, pending };
}
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
