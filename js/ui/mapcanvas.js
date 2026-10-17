// The world map drawn on a canvas: thousands of hexes stay smooth to drag and zoom. Close up, the hexes
// in view are drawn one by one with their little drawings; from afar, a picture of the whole continent,
// drawn once, is shown instead. The little drawings are the same SVG snippets as everywhere else
// (hexdraw.js), turned into canvas paths.
import { ALL_HEXES, hexKey, cellAt } from '../world.js';
import { SIZE, SQ3, center, fillOf, glyphOf, NEST } from './hexdraw.js';

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

// a hex's outline around 0,0 (k: its size)
const hexPaths = new Map();
export function hexPath(k = 0.96) {
  if (!hexPaths.has(k)) {
    const p = new Path2D();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      p[i ? 'lineTo' : 'moveTo'](SIZE * k * Math.cos(a), SIZE * k * Math.sin(a));
    }
    p.closePath();
    hexPaths.set(k, p);
  }
  return hexPaths.get(k);
}

// the colours of the page's theme, for what the canvas draws
export const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

// Draws hexes with their colour, outline and little drawing; known(key) false: not yet explored, drawn
// a little dimmer. edge: the outline's colour.
export function drawHexes(ctx, seed, hexes, known, edge) {
  const shape = hexPath();
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = edge;
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h), key = hexKey(...h);
    const water = cell.terrain === 'ocean' || cell.terrain === 'lake', dim = !water && !known(key);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = fillOf(cell);
    ctx.fill(shape);
    if (dim) { ctx.fillStyle = 'rgba(30, 34, 28, .16)'; ctx.fill(shape); }
    ctx.stroke(shape);
    ctx.restore();
    paint(ctx, key === '0,0' ? NEST : glyphOf(cell), x, y, dim ? 0.7 : 1);
  }
}

// the map's extent, in map units: { x, y, w, h }
let bounds = null;
export function mapBounds() {
  if (!bounds) {
    const xs = ALL_HEXES.map(h => center(h)[0]), ys = ALL_HEXES.map(h => center(h)[1]);
    const x = Math.min(...xs) - SIZE, y = Math.min(...ys) - SIZE;
    bounds = { x, y, w: Math.max(...xs) + SIZE - x, h: Math.max(...ys) + SIZE - y };
  }
  return bounds;
}

// The whole continent as one picture (k pixels a map unit), drawn once for a map and what of it is
// known, for the view from afar
const pictures = new Map();
export function mapPicture(seed, known, sig, edge, k = 0.5) {
  const id = `${seed}|${sig}|${edge}|${k}`;
  if (pictures.has(id)) return pictures.get(id);
  const b = mapBounds();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(b.w * k);
  canvas.height = Math.ceil(b.h * k);
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.translate(-b.x, -b.y);
  drawHexes(ctx, seed, ALL_HEXES, known, edge);
  pictures.clear();
  const pic = { canvas, k, b };
  pictures.set(id, pic);
  return pic;
}

// the hex under a point of the map (map units), as [q, r]
export function hexAt(x, y) {
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
// the hexes whose centre falls inside a box of the map (with a hex's margin)
export const hexesIn = (x0, y0, x1, y1) => ALL_HEXES.filter(h => {
  const [x, y] = center(h);
  return x > x0 - SIZE * 2 && x < x1 + SIZE * 2 && y > y0 - SIZE * 2 && y < y1 + SIZE * 2;
});
// how big a hex must look (radius in pixels) to be drawn one by one with its drawing
export const DETAIL_PX = 15;
