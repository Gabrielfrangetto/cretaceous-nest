// Drawing the world's hexes: where a hex sits, its outline, its biome's colour and little drawing.
import { BIOMES, WILDS_BIOMES } from '../config.js';
import { cellAt } from '../world.js';

export const SIZE = 30;                 // hex radius in map units
export const SQ3 = Math.sqrt(3);
// The map is seen from the south at a slant, as strategy games show theirs: the ground shows shorter
// north to south than it is (TILT of its depth), while what stands on it (mountains, trees, the
// nest) stands up as drawn. center: where a hex's middle shows on the map; flatCenter: where it truly
// lies, for the slope of the ground
export const TILT = 0.75;
export const flatCenter = ([q, r]) => [SIZE * SQ3 * (q + r / 2), SIZE * 1.5 * r];
export const center = ([q, r]) => [SIZE * SQ3 * (q + r / 2), SIZE * 1.5 * r * TILT];
export const corners = ([x, y], k = 1) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 180 * (60 * i - 30);
  return `${(x + SIZE * k * Math.cos(a)).toFixed(1)},${(y + SIZE * k * Math.sin(a) * TILT).toFixed(1)}`;
}).join(' ');

// a small drawing for each biome, centred on 0,0
const GLYPH = {
  meadow: '<path d="M-9 6 l3 -9 l2 9 M-2 6 l3 -11 l2 11 M5 6 l3 -8 l2 8" fill="#7f9c55"/>',
  forest: '<path d="M-8 8 L-3 -6 L2 8Z M0 8 L6 -10 L12 8Z" fill="#2f5a2c" transform="translate(-2 0)"/>',
  swamp: '<path d="M-11 0 q3 -3 6 0 t6 0 t6 0 t6 0 M-9 6 q3 -3 6 0 t6 0 t6 0" stroke="#3f5d4d" stroke-width="2" fill="none"/>',
  // dunes: two ridges of sand with their shaded side
  desert: '<path d="M-14 7 Q-7 -4 2 6Z" fill="#c9a768"/><path d="M-3 8 Q5 -6 14 7Z" fill="#d4b578"/><path d="M5 -6 Q9 0 14 7 L9 7 Q8 0 5 -6Z" fill="#b8955a"/>',
  // low cycads and bushes on dry ground
  scrub: '<path d="M-10 7 L-10 2 M-10 2 l-4 -3 M-10 2 l4 -3 M-10 2 l-2 -5 M-10 2 l2 -5" stroke="#6f6a36" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="5" cy="5" rx="6" ry="3.5" fill="#8a8a48"/><ellipse cx="11" cy="7" rx="3" ry="2" fill="#7a7a3e"/>',
  // reeds and horsetails by the water
  floodplain: '<path d="M-9 8 L-10 -4 M-6 8 L-5 -7 M-3 8 L-4 -2 M4 8 L3 -5 M7 8 L8 -8 M10 8 L10 -3" stroke="#3f6e34" stroke-width="1.8" stroke-linecap="round"/><path d="M-5 -7 l0 -3 M8 -8 l0 -3" stroke="#7a5a33" stroke-width="2.4" stroke-linecap="round"/>',
  // a beach line and a shell
  coast: '<path d="M-13 3 q4 -3 8 0 t8 0 t8 0" stroke="#f3efe0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M-1 9 a5 5 0 0 1 10 0Z" fill="#e8a67a"/><path d="M4 9 L4 4.5 M1.5 9 L2.5 5.2 M6.5 9 L5.5 5.2" stroke="#b9714a" stroke-width="0.9"/>',
  // a broadleaf tree with a round crown beside a palm
  subtropical: '<path d="M-6 9 L-6 0" stroke="#5a4028" stroke-width="2"/><circle cx="-9" cy="-3" r="4.5" fill="#245a33"/><circle cx="-3" cy="-5" r="5" fill="#2c6a3c"/><circle cx="-6" cy="1" r="3.5" fill="#245a33"/><path d="M7 9 Q6 1 8 -5" stroke="#6a5030" stroke-width="1.8" fill="none"/><path d="M8 -5 q-6 -2 -9 3 M8 -5 q6 -2 8 3 M8 -5 q-3 -5 -7 -5 M8 -5 q3 -5 7 -4" stroke="#2f7a40" stroke-width="2" fill="none" stroke-linecap="round"/>',
  // the uncharted north: narrow spruces; low tufts and a patch of snow
  taiga: '<path d="M-7 9 L-7 -9 M-7 -9 L-10 -2 L-4 -2Z M-7 -6 L-11 2 L-3 2Z M-7 -2 L-12 6 L-2 6Z" fill="#2c4a38" stroke="#2c4a38" stroke-width=".8"/><path d="M6 9 L6 -6 M6 -6 L3 0 L9 0Z M6 -3 L2 4 L10 4Z M6 1 L1 8 L11 8Z" fill="#335640" stroke="#335640" stroke-width=".8"/>',
  tundra: '<ellipse cx="4" cy="2" rx="7" ry="3" fill="#f2f4f2"/><path d="M-11 8 l2 -5 l2 5 M-6 8 l2 -4 l2 4 M8 9 l1.5 -4 l1.5 4" stroke="#7d8060" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  volcano: '<path d="M-12 9 L-4 -6 L4 -6 L12 9Z" fill="#5a3a30"/><path d="M-4 -6 L-2 -10 L1 -8 L4 -11 L4 -6Z" fill="#e2643a"/>',
};
export const WATER = { ocean: '#3b6e9e', lake: '#5b95c8' };
// (a lava flow: dark rock, cooled)
// (a mountain's ground is bare rock, with a little of its land's colour)
export const fillOf = c => WATER[c.terrain] || (c.lava ? '#5e463e' : c.terrain === 'mountain' ? MOUNTAIN_GROUND(c.biome) : (BIOMES[c.biome] || WILDS_BIOMES[c.biome]).color);
const rockGround = new Map();
const MOUNTAIN_GROUND = biome => rockGround.get(biome) || rockGround.set(biome, mix((BIOMES[biome] || WILDS_BIOMES[biome]).color, '#9a9184', 0.6)).get(biome);
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
// a hex's little drawing; mountains and volcanoes stand up out of it (h: the hex, whose own
// shape they get; up: how high it stands, map.js upAt, for how big they are)
export const glyphOf = (c, h = [0, 0], up) => {
  const r = reliefOf(c, h, up);
  return r ? `<g transform="translate(${f1(r.dx)} ${f1(r.dy)})">${r.svg}</g>` : WATER[c.terrain] ? '' : c.lava ? LAVA : GLYPH[c.biome];
};
// ---------- mountains and volcanoes ----------
// Drawn standing up out of their hex, lit from the north-west like the ground (mapcanvas.js): the lit
// face to the left, the shaded one to the right, a shadow cast to the south-east; a mountain reaches up
// past its hex's top, over the hex behind it (so they are drawn north to south). Each hex gets one of a
// few shapes, always the same.
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
// a colour lighter (k > 0, towards white) or darker (k < 0)
export const tone = (hex, k) => '#' + rgbOf(hex).map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, '0')).join('');
// a number from 0 to 1 of the hex's own, the same every time (k: which one)
const rand = (h, k) => wobble(h[0], h[1], k) + 0.5;
const f1 = v => +v.toFixed(1);
const SHADOW = (cx, cy, rx) => `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(rx * 0.22)}" fill="#1b2216" opacity=".16"/>`;
const ROCK = { lit: '#b5aa99', mid: '#8b7f70', dark: '#5d544a', line: '#3a322a' };
// a peak from l to r along the ground at b, its top at (px, py), snow on its top (0: none, up to 1: down
// to a third of its height)
function peak(l, r, px, py, b, snow, rock = ROCK) {
  const ht = b - py, lx = px - (px - l) * 0.18, ly = py + ht * 0.55;
  let out = `<path d="M${f1(l)} ${f1(b)} L${f1(px)} ${f1(py)} L${f1(r)} ${f1(b)}Z" fill="${rock.mid}"/>`
    + `<path d="M${f1(l)} ${f1(b)} L${f1(px)} ${f1(py)} L${f1(lx)} ${f1(ly)} L${f1(l + (px - l) * 0.5)} ${f1(b)}Z" fill="${rock.lit}"/>`
    + `<path d="M${f1(px)} ${f1(py)} L${f1(r)} ${f1(b)} L${f1(px + (r - px) * 0.3)} ${f1(b)} L${f1(px + (r - px) * 0.12)} ${f1(py + ht * 0.6)}Z" fill="${rock.dark}"/>`;
  if (snow > 0) {
    const d = ht * 0.33 * snow, sl = px - (px - l) * d / ht, sr = px + (r - px) * d / ht;
    out += `<path d="M${f1(px)} ${f1(py)} L${f1(sl)} ${f1(py + d)} L${f1(sl + (px - sl) * 0.4)} ${f1(py + d * 0.75)} L${f1(px - 0.5)} ${f1(py + d * 1.05)} L${f1(px + (sr - px) * 0.45)} ${f1(py + d * 0.78)} L${f1(sr)} ${f1(py + d)}Z" fill="#f6f4ee"/>`
      + `<path d="M${f1(px)} ${f1(py)} L${f1(px + (sr - px) * 0.45)} ${f1(py + d * 0.78)} L${f1(sr)} ${f1(py + d)}Z" fill="#d2d7de"/>`;
  }
  return out + `<path d="M${f1(l)} ${f1(b)} L${f1(px)} ${f1(py)} L${f1(r)} ${f1(b)}" fill="none" stroke="${rock.line}" stroke-width="1.4"/>`
    + `<path d="M${f1(px)} ${f1(py)} L${f1(px + (r - px) * 0.12)} ${f1(py + ht * 0.6)} L${f1(px + (r - px) * 0.3)} ${f1(b)}" fill="none" stroke="${rock.line}" stroke-width=".9" opacity=".4"/>`;
}
// (where in its band a hex's height lies: 0 at the band's foot, 1 at its top; map.js upAt)
const BANDS = { mountain: [0.63, 1], volcano: [0.63, 0.9] };
const within = (c, up) => { const [a, b] = BANDS[c.terrain]; return up === undefined ? 0.5 : Math.max(0, Math.min(1, (up - a) / (b - a))); };
// Each is one of a few shapes (VARIANTS of each, at a few sizes and snow cover), set a little off its
// hex's middle (dx, dy): drawn once each and kept as a picture (mapcanvas.js), so a range of hundreds of
// mountains draws quickly, while no two neighbours look alike. { key: which shape, svg around 0,0,
// box: [x0, y0, x1, y1] it fits in, dx, dy }
const VARIANTS = 16;
const SHAPES = {
  // a cluster of peaks, more and bigger the higher it stands, overlapping the hexes around it so a range
  // reads as one massif; snow where it is cold
  mountain(c, v, k, t, snow) {
    const at = [v, 11], n = 1 + (rand(at, 35) < 0.35 + 0.5 * t ? 1 : 0) + (rand(at, 36) < 0.6 * t ? 1 : 0);
    const peaks = Array.from({ length: n }, (_, i) => {
      const main = i === 0, kk = k * (main ? 1 : 0.55 + rand(at, 70 + i) * 0.3);
      const x = (rand(at, 24 + i * 10) - 0.5) * (main ? 6 : 40), b = (main ? 14 : 8) + (rand(at, 25 + i * 10) - 0.5) * 8;
      const w = 30 * kk * (0.85 + rand(at, 26 + i * 10) * 0.3), ht = 50 * kk * (0.8 + rand(at, 27 + i * 10) * 0.35);
      return { x, b, w, ht, px: x + (rand(at, 28 + i * 10) - 0.5) * w * 0.55, main };
    }).sort((a, b) => a.b - b.b);
    const m = peaks.find(p => p.main);
    const box = [Math.min(...peaks.map(p => p.x - p.w)) - 2, Math.min(...peaks.map(p => p.b - p.ht)) - 2, Math.max(...peaks.map(p => p.x + p.w), m.x + 9 + m.w * 1.25) + 2, m.b + 1 + m.w * 0.3];
    return { box, svg: SHADOW(m.x + 9, m.b + 1, m.w * 1.25) + peaks.map(p => peak(p.x - p.w, p.x + p.w, p.px, p.b - p.ht, p.b, snow * (p.main ? 1 : 0.7))).join('') };
  },
  volcano(c, v, k) {
    const rock = { lit: '#7a5a4c', mid: '#5a4036', dark: '#3c2a24', line: '#26190f' };
    const s = x => f1(x * k), side = v % 2 ? 1 : -1;
    const smoke = [[3, -37, 5, 0.55], [9, -44, 6.5, 0.45], [16, -52, 8, 0.32]].map(([x, y, r, o]) => `<circle cx="${s(x * side)}" cy="${s(y)}" r="${s(r)}" fill="#a39d94" opacity="${o}"/>`).join('');
    return { box: [-31 * k, -61 * k, 39 * k, 21], svg: SHADOW(8, 14, 30 * k) + smoke
      + `<path d="M${s(-29)} 14 L${s(-7)} ${s(-27)} L${s(7)} ${s(-27)} L${s(29)} 14Z" fill="${rock.mid}"/><path d="M${s(-29)} 14 L${s(-7)} ${s(-27)} L${s(-6)} ${s(-4)} L${s(-14)} 14Z" fill="${rock.lit}"/><path d="M${s(7)} ${s(-27)} L${s(29)} 14 L${s(10)} 14 L${s(3)} ${s(-6)}Z" fill="${rock.dark}"/>`
      + `<path d="M${s(-1)} ${s(-26)} Q${s(2)} ${s(-14)} ${s(-2)} ${s(-2)} Q${s(4)} ${s(-12)} ${s(4)} ${s(-26)}Z" fill="#e2643a" opacity=".85"/>`
      + `<path d="M${s(-7)} ${s(-27)} Q0 ${s(-22)} ${s(7)} ${s(-27)} Q0 ${s(-31)} ${s(-7)} ${s(-27)}Z" fill="#f08a3e"/><path d="M${s(-29)} 14 L${s(-7)} ${s(-27)} L${s(7)} ${s(-27)} L${s(29)} 14" fill="none" stroke="${rock.line}" stroke-width="1.5"/>` };
  },
};
const reliefs = new Map();
// a hex's mountain or volcano (h: the hex; up: how high it stands, map.js upAt), or null
export function reliefOf(c, h, up) {
  if (!SHAPES[c.terrain] || WATER[c.terrain] || c.lava) return null;
  const t = within(c, up), size = Math.round(t * 3), v = Math.floor(rand(h, 1) * VARIANTS) % (c.terrain === 'volcano' ? 2 : VARIANTS);
  const k = c.terrain === 'mountain' ? 0.68 + 0.45 * size / 3 : 0.85 + 0.35 * size / 3;
  const snow = c.terrain !== 'mountain' ? 0 : c.heat !== undefined ? Math.round(Math.max(0, Math.min(1, (0.2 + 0.35 * t - c.heat) * 4)) * 2) / 2 : c.biome === 'tundra' || c.biome === 'taiga' ? 1 : 0;
  const key = `${c.terrain}|${c.terrain === 'mountain' ? '' : c.biome}|${v}|${size}|${snow}`;
  let shape = reliefs.get(key);
  if (!shape) reliefs.set(key, shape = { key, ...SHAPES[c.terrain](c, v, k, size / 3, snow) });
  return { ...shape, dx: (rand(h, 2) - 0.5) * (c.terrain === 'mountain' ? 12 : 10), dy: (rand(h, 3) - 0.5) * 6 * TILT };
}
// cooled lava, cracked, still glowing in the cracks
const LAVA = '<path d="M-12 2 L-6 -1 L-2 3 L4 0 L11 3 M-8 8 L-3 5 L2 8 M3 -6 L7 -3 L12 -5" stroke="#e2643a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/><path d="M-12 2 L-6 -1 L-2 3 L4 0 L11 3" stroke="#f6c04a" stroke-width=".6" fill="none"/>';
const TERRAIN_NAME = { mountain: 'mountains', volcano: 'a volcano' };
export const placeName = c => c.wilds ? 'The uncharted north' : c.city ? `${c.city}, a settlement of other colonists` : WATER[c.terrain] ? (c.terrain === 'lake' ? 'Lake' : 'Open sea') : `${BIOMES[c.biome].name}${TERRAIN_NAME[c.terrain] ? `, ${TERRAIN_NAME[c.terrain]}` : ''}${c.river ? ', a river' : ''}`;
export const NEST = '<ellipse cx="0" cy="4" rx="13" ry="5" fill="#9c7240"/><ellipse cx="0" cy="1" rx="9" ry="3" fill="#c49a5c"/><ellipse cx="-3" cy="-2" rx="3" ry="4" fill="#f3ead2"/><ellipse cx="3" cy="-2" rx="3" ry="4" fill="#eadcbf"/>';

// ---------- rivers ----------
// A river is drawn as one line from hex to hex: in each hex, from its middle to the edge it flows out
// by (down), and from each edge a river flows in by, wider the more water it carries (flow). The bend
// of each half is the hex's own, so the river meanders.
export const RIVER_COLOR = '#4f8fcf';
const STEPS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const riverWidth = flow => Math.min(12, 1.6 + 1.2 * Math.sqrt(flow || 1));
const wobble = (q, r, k) => { let x = Math.imul(q * 73856093 ^ r * 19349663 ^ k * 83492791, 0x9e3779b1); x ^= x >>> 15; return ((x >>> 0) % 1000) / 1000 - 0.5; };
// the halves of river in a hex, around its middle (0, 0): [{ to: the edge's middle, bend: the curve's
// pull, width }]
export function riverHalves(seed, h) {
  const c = cellAt(seed, h);
  if (!c || !c.river) return [];
  const out = [];
  const half = (k, width) => {
    const [dq, dr] = STEPS[k], [x, y] = center([dq, dr]), to = [x / 2, y / 2];
    // (the curve pulled to one side of the straight way, by up to a third of a hex)
    const side = wobble(h[0], h[1], k) * SIZE * 0.7, len = Math.hypot(...to);
    out.push({ to, bend: [to[0] / 2 - to[1] / len * side, to[1] / 2 + to[0] / len * side], width });
  };
  if (c.down >= 0) half(c.down, riverWidth(c.flow));
  // (a river flowing out of a lake starts at its shore)
  if (c.from >= 0) half(c.from, riverWidth(c.flow));
  STEPS.forEach(([dq, dr], k) => {
    const n = cellAt(seed, [h[0] + dq, h[1] + dr]);
    if (n && n.river && n.down === (k + 3) % 6) half(k, riverWidth(n.flow));
  });
  return out;
}
// the river of a hex as SVG, around its middle
export const riverSVG = (seed, h) => riverHalves(seed, h).map(s => `<path d="M0 0 Q${s.bend[0].toFixed(1)} ${s.bend[1].toFixed(1)} ${s.to[0].toFixed(1)} ${s.to[1].toFixed(1)}" fill="none" stroke="${RIVER_COLOR}" stroke-width="${s.width.toFixed(1)}" stroke-linecap="round"/>`).join('');
