// The world map drawn on a canvas: tens of thousands of hexes stay smooth to drag and zoom. Close up,
// the hexes in view are drawn one by one with their little drawings; from afar, tiles of the map drawn
// once each at the sharpness the zoom needs. The little drawings are the same SVG snippets as everywhere else
// (hexdraw.js), turned into canvas paths.
import { ALL_HEXES, hexKey, cellAt as mapCell, inWorld as inMap, inWilds, wildsAt } from '../world.js';
import { SIZE, SQ3, center, fillOf, glyphOf, NEST, riverHalves, riverWidth, RIVER_COLOR } from './hexdraw.js';
import { railsOf } from '../map.js';

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
    const w = SIZE * SQ3, h = SIZE * 1.5;
    for (const hx of hexes) {
      const [x, y] = center(hx), cell = cellAt(seed, hx);
      ctx.fillStyle = cell.city || hexKey(...hx) === '0,0' ? '#a8743c' : fillOf(cell);
      ctx.fillRect(x - w / 2, y - h / 2, w + 0.5, h + 0.5);
      if (!isWaterCell(cell) && !known(hexKey(...hx))) { ctx.fillStyle = dim; ctx.fillRect(x - w / 2, y - h / 2, w + 0.5, h + 0.5); }
    }
    // from very far only the great rivers show
    drawRivers(ctx, seed, hexes, 8);
    drawRails(ctx, seed, hexes);
    return;
  }
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = fillOf(cell);
    ctx.fill(shape);
    if (!isWaterCell(cell) && !known(hexKey(...h))) { ctx.fillStyle = dim; ctx.fill(shape); }
    if (detail === 'full') ctx.stroke(shape);
    ctx.restore();
  }
  drawRivers(ctx, seed, hexes, detail === 'full' ? 1 : 3);
  drawRails(ctx, seed, hexes);
  for (const h of hexes) {
    const [x, y] = center(h), cell = cellAt(seed, h), key = hexKey(...h);
    const art = key === '0,0' ? NEST : cell.city ? CITY : detail === 'full' ? glyphOf(cell) : '';
    if (art) paint(ctx, art, x, y, !isWaterCell(cell) && !known(key) ? 0.7 : 1);
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
// the hexes whose centre falls inside a box of the map (with a hex's margin), row by row
export function hexesIn(x0, y0, x1, y1) {
  const out = [], rowH = SIZE * 1.5, colW = SIZE * SQ3;
  const r0 = Math.floor((y0 - SIZE * 2) / rowH), r1 = Math.ceil((y1 + SIZE * 2) / rowH);
  for (let r = r0; r <= r1; r++) {
    const q0 = Math.floor((x0 - SIZE * 2) / colW - r / 2), q1 = Math.ceil((x1 + SIZE * 2) / colW - r / 2);
    for (let q = q0; q <= q1; q++) if (inMap([q, r]) || inWilds([q, r])) out.push([q, r]);
  }
  return out;
}
// how big a hex must look (radius in pixels) to be drawn one by one with its drawing
export const DETAIL_PX = 15;
