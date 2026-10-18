// Drawing the world's hexes: where a hex sits, its outline, its biome's colour and little drawing.
import { BIOMES } from '../config.js';
import { cellAt } from '../world.js';

export const SIZE = 30;                 // hex radius in map units
export const SQ3 = Math.sqrt(3);
export const center = ([q, r]) => [SIZE * SQ3 * (q + r / 2), SIZE * 1.5 * r];
export const corners = ([x, y], k = 1) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 180 * (60 * i - 30);
  return `${(x + SIZE * k * Math.cos(a)).toFixed(1)},${(y + SIZE * k * Math.sin(a)).toFixed(1)}`;
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
  volcano: '<path d="M-12 9 L-4 -6 L4 -6 L12 9Z" fill="#5a3a30"/><path d="M-4 -6 L-2 -10 L1 -8 L4 -11 L4 -6Z" fill="#e2643a"/>',
};
// terrain drawn over the biome: hills, mountains, a volcano's peak, a river; water has its own colour
const TERRAIN = {
  hill: '<path d="M-13 9 q6 -10 12 0 q5 -8 12 0" fill="none" stroke="#5b4a32" stroke-width="2" opacity=".7"/>',
  mountain: '<path d="M-14 10 L-5 -9 L1 2 L5 -4 L14 10Z" fill="#6e6458"/><path d="M-5 -9 L-2 -3 L-7 -3Z" fill="#f2efe6"/>',
  volcano: '<path d="M-14 10 L-4 -8 L4 -8 L14 10Z" fill="#4a3028"/><path d="M-4 -8 L-1 -13 L2 -9 L4 -12 L4 -8Z" fill="#e2643a"/>',
};
export const WATER = { ocean: '#3b6e9e', lake: '#5b95c8' };
// (a lava flow: dark rock, cooled)
export const fillOf = c => WATER[c.terrain] || (c.lava ? '#5e463e' : BIOMES[c.biome].color);
export const glyphOf = c => WATER[c.terrain] ? '' : c.lava ? LAVA : (TERRAIN[c.terrain] || GLYPH[c.biome]);
// cooled lava, cracked, still glowing in the cracks
const LAVA = '<path d="M-12 2 L-6 -1 L-2 3 L4 0 L11 3 M-8 8 L-3 5 L2 8 M3 -6 L7 -3 L12 -5" stroke="#e2643a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/><path d="M-12 2 L-6 -1 L-2 3 L4 0 L11 3" stroke="#f6c04a" stroke-width=".6" fill="none"/>';
const TERRAIN_NAME = { hill: 'hills', mountain: 'mountains', volcano: 'a volcano' };
export const placeName = c => c.city ? `${c.city}, a settlement of other colonists` : WATER[c.terrain] ? (c.terrain === 'lake' ? 'Lake' : 'Open sea') : `${BIOMES[c.biome].name}${TERRAIN_NAME[c.terrain] ? `, ${TERRAIN_NAME[c.terrain]}` : ''}${c.river ? ', a river' : ''}`;
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
