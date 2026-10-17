// Drawing the world's hexes: where a hex sits, its outline, its biome's colour and little drawing.
import { BIOMES } from '../config.js';

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
  badlands: '<path d="M-12 8 L-8 -3 L-2 -3 L1 2 L5 -6 L10 -6 L13 8Z" fill="#a9824e"/>',
  volcano: '<path d="M-12 9 L-4 -6 L4 -6 L12 9Z" fill="#5a3a30"/><path d="M-4 -6 L-2 -10 L1 -8 L4 -11 L4 -6Z" fill="#e2643a"/>',
};
// terrain drawn over the biome: hills, mountains, a volcano's peak, a river; water has its own colour
const TERRAIN = {
  hill: '<path d="M-13 9 q6 -10 12 0 q5 -8 12 0" fill="none" stroke="#5b4a32" stroke-width="2" opacity=".7"/>',
  mountain: '<path d="M-14 10 L-5 -9 L1 2 L5 -4 L14 10Z" fill="#6e6458"/><path d="M-5 -9 L-2 -3 L-7 -3Z" fill="#f2efe6"/>',
  volcano: '<path d="M-14 10 L-4 -8 L4 -8 L14 10Z" fill="#4a3028"/><path d="M-4 -8 L-1 -13 L2 -9 L4 -12 L4 -8Z" fill="#e2643a"/>',
};
const RIVER = '<path d="M-22 -6 C-8 -14 -6 8 8 0 S 18 -4 24 6" fill="none" stroke="#4f8fcf" stroke-width="4" stroke-linecap="round"/>';
export const WATER = { ocean: '#3b6e9e', lake: '#5b95c8' };
export const fillOf = c => WATER[c.terrain] || BIOMES[c.biome].color;
export const glyphOf = c => WATER[c.terrain] ? '' : (TERRAIN[c.terrain] || GLYPH[c.biome]) + (c.river ? RIVER : '');
const TERRAIN_NAME = { hill: 'hills', mountain: 'mountains', volcano: 'a volcano' };
export const placeName = c => c.city ? `${c.city}, a city of another tribe` : WATER[c.terrain] ? (c.terrain === 'lake' ? 'Lake' : 'Open sea') : `${BIOMES[c.biome].name}${TERRAIN_NAME[c.terrain] ? `, ${TERRAIN_NAME[c.terrain]}` : ''}${c.river ? ', a river' : ''}`;
export const NEST = '<ellipse cx="0" cy="4" rx="13" ry="5" fill="#9c7240"/><ellipse cx="0" cy="1" rx="9" ry="3" fill="#c49a5c"/><ellipse cx="-3" cy="-2" rx="3" ry="4" fill="#f3ead2"/><ellipse cx="3" cy="-2" rx="3" ry="4" fill="#eadcbf"/>';
