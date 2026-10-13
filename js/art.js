// Drawings made in code: eggs, the nest, item icons, and the baby sprites (with a pixel-art fallback).
import { SPECIES, SEX } from './config.js';

// ---------- eggs ----------
let uid = 0;
const EGG = 'M50 4 C78 4 96 52 96 80 C96 108 76 126 50 126 C24 126 4 108 4 80 C4 52 22 4 50 4 Z';
const ZIG = '0,0 100,0 100,62 88,56 76,66 64,55 52,67 40,56 28,66 16,55 0,63';
const ZIG_BOTTOM = '0,63 16,55 28,66 40,56 52,67 64,55 76,66 88,56 100,62 100,130 0,130';
const CRACKS = [
  'M60 18 L55 30 L62 38 L56 50',
  'M28 52 L38 58 L33 68 L44 74 L40 84',
  'M74 60 L66 70 L75 80 L68 92 M55 50 L48 58',
];

function patternSVG(sp) {
  const m = sp.mark;
  if (sp.pattern === 'spots') return [[30,40,9],[62,30,6],[70,70,11],[36,88,7],[54,104,8],[22,70,5],[80,96,6]]
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .8}" fill="${m}" opacity=".75"/>`).join('');
  if (sp.pattern === 'stripes') return [34, 62, 92]
    .map(y => `<path d="M0 ${y} Q25 ${y - 8} 50 ${y} T100 ${y}" stroke="${m}" stroke-width="7" fill="none" opacity=".7"/>`).join('');
  if (sp.pattern === 'speckle') {
    let s = 11, out = '';
    for (let i = 0; i < 46; i++) {
      s = (s * 9301 + 49297) % 233280; const x = s / 233280 * 100;
      s = (s * 9301 + 49297) % 233280; const y = 8 + s / 233280 * 118;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.2 + (i % 3)).toFixed(1)}" fill="${m}" opacity=".8"/>`;
    }
    return out;
  }
  return `<path d="M-10 70 L70 -10 L84 4 L4 84 Z" fill="#fff6d0" opacity=".45"/>
          <path d="M30 100 l3 -7 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 Z" fill="#fff6d0" opacity=".9"/>
          <path d="M72 44 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z" fill="#fff6d0" opacity=".9"/>
          <ellipse cx="50" cy="110" rx="40" ry="14" fill="${m}" opacity=".35"/>`;
}

// crack: 0–3 visible cracks; split: draw top and bottom halves separately for the hatch animation
export function eggSVG(sp, crack = 0, split = false) {
  const id = 'e' + (++uid);
  const shell = `<path d="${EGG}" fill="${sp.shell}"/>
    <g clip-path="url(#${id}c)">${patternSVG(sp)}
      <ellipse cx="34" cy="38" rx="11" ry="18" fill="#fff" opacity=".35" transform="rotate(20 34 38)"/>
      <path d="M0 96 Q50 140 100 96 L100 130 L0 130 Z" fill="#000" opacity=".08"/></g>
    <path d="${EGG}" fill="none" stroke="${sp.mark}" stroke-width="2.5" opacity=".7"/>
    ${CRACKS.slice(0, crack).map(d => `<path d="${d}" fill="none" stroke="#2b2416" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`).join('')}`;
  const defs = `<defs><clipPath id="${id}c"><path d="${EGG}"/></clipPath>
    <clipPath id="${id}t"><polygon points="${ZIG}"/></clipPath>
    <clipPath id="${id}b"><polygon points="${ZIG_BOTTOM}"/></clipPath></defs>`;
  const body = split
    ? `<g class="bottom" clip-path="url(#${id}b)">${shell}</g><g class="top" clip-path="url(#${id}t)">${shell}</g>`
    : shell;
  return `<svg viewBox="0 0 100 130" aria-hidden="true">${defs}${body}</svg>`;
}

export const NEST = `<svg class="nest" viewBox="0 0 260 80" aria-hidden="true">
  <ellipse cx="130" cy="44" rx="124" ry="30" fill="var(--nest)"/>
  <ellipse cx="130" cy="34" rx="104" ry="18" fill="var(--nest2)"/>
  <g stroke="var(--nest)" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M20 40 Q70 22 120 44"/><path d="M60 52 Q120 30 190 50"/><path d="M140 40 Q190 24 240 42"/>
    <path d="M40 58 Q110 70 170 56"/><path d="M110 62 Q180 74 230 52"/>
  </g>
  <g stroke="var(--nest2)" stroke-width="2.5" stroke-linecap="round" fill="none">
    <path d="M12 46 Q60 66 104 58"/><path d="M150 64 Q200 60 248 44"/><path d="M80 44 Q130 56 176 42"/>
  </g></svg>`;

// ---------- icons ----------
const SHELL_PATH = 'M2 8 L4.5 6 L6.5 8.5 L8.5 5.5 L10.5 8.5 L12 6.5 L14 8 C14 12.5 11.5 15 8 15 C4.5 15 2 12.5 2 8Z';
export const ITEM_ICONS = {
  leaf: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13 C3 6 8 2 14 2 C14 8 10 13 3 13Z" fill="#6fa64a"/><path d="M3 13 L10 6" stroke="#3f6b2a" stroke-width="1.4"/></svg>',
  meat: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2 C13 2 15 5 14 8 C13 11 9 12 7 10 C5 8 6 2 9 2Z" fill="#c4553b"/><path d="M9.5 4 C11 4 12 5 12 7" stroke="#eb9a84" stroke-width="1.3" fill="none"/><path d="M7.5 9.5 L4 13" stroke="#f2ead8" stroke-width="2.4" stroke-linecap="round"/><circle cx="3" cy="13.6" r="1.5" fill="#f2ead8"/><circle cx="2.4" cy="12" r="1.4" fill="#f2ead8"/></svg>',
  shell: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${SHELL_PATH}" fill="#eadcbf" stroke="#8b6a44" stroke-width="1"/><ellipse cx="5.5" cy="11" rx="1.2" ry="1" fill="#8b6a44" opacity=".6"/></svg>`,
  golden_shell: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${SHELL_PATH}" fill="#f0cd68" stroke="#b48114" stroke-width="1"/><path d="M5 10.5 l.8 -1.6 l.8 1.6 l1.6 .8 l-1.6 .8 l-.8 1.6 l-.8 -1.6 l-1.6 -.8Z" fill="#fff6d0"/></svg>`,
  amber: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L14 6 L11.5 14.5 L4.5 14.5 L2 6Z" fill="#e39a2c" stroke="#a5620f" stroke-width="1"/><path d="M5 6 L8 3.5 L10.5 6" stroke="#ffd58a" stroke-width="1" fill="none"/><ellipse cx="8" cy="10" rx="1.4" ry="1" fill="#6b3f0c"/><path d="M6.6 9.4 L5.6 8.8 M9.4 9.4 L10.4 8.8" stroke="#6b3f0c" stroke-width=".7"/></svg>',
};

export const BAG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 10 C11 4 21 4 21 10" stroke="#6d4e2a" stroke-width="2.6" fill="none"/><rect x="5" y="9" width="22" height="20" rx="6" fill="#9c7240"/><rect x="9.5" y="17" width="13" height="9" rx="2.5" fill="#c49a5c"/><rect x="14" y="15.5" width="4" height="3.4" rx="1" fill="#6d4e2a"/></svg>';

// ---------- babies ----------
const SPRITES = {
  proto:  { m: 'sprites/proto-m.png',  f: 'sprites/proto-f.png' },
  hypa:   { m: 'sprites/hypa-m.png',   f: 'sprites/hypa-f.png' },
  raptor: { m: 'sprites/raptor-m.png', f: 'sprites/raptor-f.png' },
  rex:    { m: 'sprites/rex-m.png',    f: 'sprites/rex-f.png' },
};

// pixel-art fallback for species without a sprite, or when an image fails to load
const BASE = [
  '................', '..........####..', '.........######.', '.........##o####', '.........#######',
  '........#####...', '..#....######...', '..##..#######...', '...##########...', '....#########...',
  '.....#######....', '......##.##.....', '......#..#......', '......##.##.....',
];
const EXTRA = {
  proto:  [[0,9],[1,8],[1,9],[2,8],[3,8],[4,8]],
  hypa:   [[0,10],[0,11],[0,12],[1,9],[7,8],[8,6],[9,10]],
  raptor: [[0,11],[0,13],[6,2],[7,2],[8,3],[1,9]],
  rex:    [[5,8],[7,7],[8,5],[9,9]],
};
// males only: extra feathers, horns, crests and stripes in a second, brighter color ('b')
const MALE_EXTRA = {
  proto:  [[1,8],[3,8],[2,15],[8,7],[8,9],[0,8]],
  hypa:   [[0,11],[0,13],[7,3],[8,4],[9,6],[1,8]],
  raptor: [[0,12],[0,10],[5,8],[5,2],[6,1],[6,13],[7,13]],
  rex:    [[0,11],[0,12],[6,9],[9,6],[1,9]],
};
const MALE_COLOR = { proto: '#f2cf45', hypa: '#d9503a', raptor: '#36b5a5', rex: '#f08a46' };

function babyGrid(type, sex) {
  const g = BASE.map(r => r.split(''));
  for (const [r, c] of EXTRA[type]) g[r][c] = 'a';
  if (type === 'rex') { g[6][13] = '#'; g[7][13] = '#'; }
  if (sex === 'm') for (const [r, c] of MALE_EXTRA[type]) g[r][c] = 'b';
  return g;
}

const babyLabel = (type, sex) => SEX[sex].word + ' ' + SPECIES[type].species + ' baby';

// px sets the size: sprites are px * 17 tall, the pixel fallback is 14 px-sized pixels tall
export function babyArt(type, px, sex = 'f', pixelOnly = false) {
  const src = !pixelOnly && SPRITES[type] && SPRITES[type][sex];
  if (src) {
    const img = new Image();
    img.src = src;
    img.alt = babyLabel(type, sex);
    img.draggable = false;
    img.style.height = Math.round(px * 17) + 'px';
    img.style.width = 'auto';
    img.addEventListener('error', () => {
      const c = babyArt(type, px, sex, true);
      c.className = img.className; c.style.transform = img.style.transform;
      img.replaceWith(c);
    });
    return img;
  }
  const sp = SPECIES[type], g = babyGrid(type, sex);
  const male = sex === 'm';
  const cv = document.createElement('canvas');
  cv.width = 16 * px; cv.height = 14 * px;
  const ctx = cv.getContext('2d');
  for (let r = 0; r < g.length; r++) for (let c = 0; c < 16; c++) {
    const ch = g[r][c];
    if (ch === '.') continue;
    // females keep one base color; males show the accent and the extra color
    ctx.fillStyle = ch === 'o' ? '#1b1a17' : !male ? sp.body : ch === 'a' ? sp.acc : ch === 'b' ? MALE_COLOR[type] : sp.body;
    ctx.fillRect(c * px, r * px, px, px);
  }
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', babyLabel(type, sex));
  return cv;
}
