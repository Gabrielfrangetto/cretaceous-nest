// Drawings made in code: eggs, the nest, item icons, and the baby sprites (with a pixel-art fallback).
import { SPECIES, SEX, DRAWN_SLOTS, OUTFITS, STAGES } from './config.js';
import { anchorFor, gearArtFor, FITTED, BEHIND } from './gear-art.js';

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
  feather: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 2 C7 3 3.5 8 3 13 C8 12.5 12.5 9 13.5 2Z" fill="#6a9fb5" stroke="#3d6475" stroke-width=".8"/><path d="M2 14.5 L11 5" stroke="#2f4e5c" stroke-width="1.1" stroke-linecap="round"/></svg>',
  clay: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 10 C2.5 6.5 5 4.5 8 4.5 C11 4.5 13.5 6.5 13.5 10 C13.5 12.5 11 13.5 8 13.5 C5 13.5 2.5 12.5 2.5 10Z" fill="#b5694a" stroke="#7a3f28" stroke-width="1"/><path d="M5 8 C6.5 7 9.5 7 11 8" stroke="#d99273" stroke-width="1" fill="none"/></svg>',
  bone: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 9.8 L9.8 4.5" stroke="#efe6cf" stroke-width="2.6" stroke-linecap="round"/><g fill="#efe6cf" stroke="#9b8b66" stroke-width=".8"><circle cx="3.2" cy="10.4" r="1.7"/><circle cx="5.6" cy="12.8" r="1.7"/><circle cx="10.4" cy="3.2" r="1.7"/><circle cx="12.8" cy="5.6" r="1.7"/></g><path d="M4.5 9.8 L9.8 4.5" stroke="#efe6cf" stroke-width="2.2" stroke-linecap="round"/></svg>',
  herb: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15 V6" stroke="#4d7a32" stroke-width="1.4" stroke-linecap="round"/><path d="M8 9 C4 9 2.5 6.5 3 4 C6 4 8 6 8 9Z M8 7 C12 7 13.5 4.5 13 2 C10 2 8 4 8 7Z M8 12 C11.5 12 13 10 12.5 8 C10 8 8 9.5 8 12Z" fill="#7cbf5a" stroke="#3f6b2a" stroke-width=".7"/><circle cx="12" cy="13" r="2" fill="#e05a7a"/><path d="M11 13 h2 M12 12 v2" stroke="#fff" stroke-width=".8"/></svg>',
  obsidian: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L13 6.5 L10.5 14.5 L4 13 L2.5 6Z" fill="#2c2733" stroke="#120f16" stroke-width="1"/><path d="M8 1.5 L7 8 L13 6.5 M7 8 L4 13 M7 8 L10.5 14.5" stroke="#5c5370" stroke-width=".8" fill="none"/><path d="M5 5.5 L6.6 4" stroke="#a49bbd" stroke-width=".9" stroke-linecap="round"/></svg>',
};

// equipment icons (placeholders until the hand-drawn art arrives)
Object.assign(ITEM_ICONS, {
  leaf_crown: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11 Q8 5 14 11" stroke="#4d7f2e" stroke-width="2" fill="none"/><path d="M3.5 9.5 L2.5 5 L6 7.5Z M8 7 L7.5 2 L10 5.5Z M12.5 9.5 L13.5 5 L10 7.5Z" fill="#6fa64a"/></svg>',
  bone_helmet: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 11 C2.5 5.5 5 2.5 8 2.5 C11 2.5 13.5 5.5 13.5 11 Z" fill="#e8dfc8" stroke="#8a7a5c"/><rect x="1.5" y="10" width="13" height="3" rx="1" fill="#cfc2a4" stroke="#8a7a5c"/><path d="M6 6.5 H10" stroke="#8a7a5c"/></svg>',
  spiked_collar: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="5" fill="none" stroke="#6b4a2e" stroke-width="2.4"/><path d="M8 1.5 L9.2 4 H6.8Z M2.2 6 L4.8 6.8 L3.3 8.6Z M13.8 6 L11.2 6.8 L12.7 8.6Z M3 14 L4.8 11.9 L5.6 13.7Z M13 14 L11.2 11.9 L10.4 13.7Z" fill="#cfcfcf" stroke="#8a8a8a" stroke-width=".4"/></svg>',
  feather_scarf: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5 Q8 9 14.5 5.5 L14.5 8.8 Q8 12.3 1.5 8.8Z" fill="#d9503a"/><path d="M10 9.5 Q12.6 13.5 9.4 15.2 Q8.3 12.4 10 9.5Z" fill="#f2cf45"/></svg>',
  leather_vest: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 H6 L8 5 L10 2 H12 L14 6 L13 14 H3 L2 6Z" fill="#9c6b3f" stroke="#5e3d20"/><path d="M8 5 V14" stroke="#5e3d20"/><circle cx="9.3" cy="8" r=".7" fill="#e3c08a"/><circle cx="9.3" cy="11" r=".7" fill="#e3c08a"/></svg>',
  heavy_armor: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5 H13 L14 8 L8 15 L2 8Z" fill="#8e98a3" stroke="#4d565f"/><path d="M5 5 H11 M4.3 8 H11.7 M6 11 H10" stroke="#5f6a74"/></svg>',
  swift_cape: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2 H11 L14.5 14 Q8 11 1.5 14Z" fill="#36b5a5" stroke="#1f7a6f"/><path d="M5 2 Q8 4.2 11 2" stroke="#1f7a6f" fill="none"/></svg>',
  turtle_shell: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 11.5 C1 5.5 4 2 8 2 C12 2 15 5.5 15 11.5Z" fill="#6f8f3a" stroke="#3f5a1f"/><path d="M6 4.2 H10 L11.5 7.2 L10 10.2 H6 L4.5 7.2Z" fill="#8fae55" stroke="#3f5a1f"/></svg>',
});

export const BAG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 10 C11 4 21 4 21 10" stroke="#6d4e2a" stroke-width="2.6" fill="none"/><rect x="5" y="9" width="22" height="20" rx="6" fill="#9c7240"/><rect x="9.5" y="17" width="13" height="9" rx="2.5" fill="#c49a5c"/><rect x="14" y="15.5" width="4" height="3.4" rx="1" fill="#6d4e2a"/></svg>';

// ---------- babies ----------
// image paths are resolved from this file, not from the page, so pages in other folders
// (tools/anchors.html) find the same pictures
const asset = path => new URL('../' + path, import.meta.url).href;
const SPRITES = Object.fromEntries(['proto', 'hypa', 'raptor', 'rex'].map(type =>
  [type, { m: asset(`sprites/${type}-m.png`), f: asset(`sprites/${type}-f.png`) }]));

// adult sprites drawn so far, by species and sex (sprites/adult/); equipment is fitted to these.
// Adults without one are drawn with their baby sprite, scaled up.
export const ADULT_SPRITES = { rex: { m: asset('sprites/adult/rex-m.png') } };
export const adultSpriteUrl = (type, sex) => (ADULT_SPRITES[type] && ADULT_SPRITES[type][sex]) || null;

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

// image path for a baby, or null when it only has pixel art (used for system notification icons)
export const spriteUrl = (type, sex) => (SPRITES[type] && SPRITES[type][sex]) || null;

const babyLabel = (type, sex) => SEX[sex].word + ' ' + SPECIES[type].species + ' baby';

// The baby as it looks at its growth stage: its outfit's sprite if it wears one, otherwise its own sprite
// (the adult one for adults, when it exists), drawn larger as it grows, with its small accessories
// (DRAWN_SLOTS) on top. Returns the plain sprite when nothing is drawn over it, otherwise a box holding
// the sprite and one layer per accessory.
export function dressedArt(type, px, sex = 'f', equip = null, outfit = null, stage = 'baby') {
  const look = outfit && OUTFITS[outfit] && OUTFITS[outfit].species === type ? OUTFITS[outfit] : null;
  const st = STAGES.find(x => x.id === stage) || STAGES[0];
  const own = stage === 'adult' ? adultSpriteUrl(type, sex) : null;
  const base = babyArt(type, px * st.scale, sex, false, look ? asset(look.sprites[sex]) : own);
  // an outfit is a complete drawing, so accessories are only drawn on the baby's own sprite
  const worn = look ? [] : Object.entries(equip || {}).filter(([slot, id]) => DRAWN_SLOTS.includes(slot) && ITEM_ICONS[id]);
  if (!worn.length) return base;
  const box = document.createElement('span');
  box.className = 'dino-art';
  base.classList.add('dino-base');
  box.appendChild(base);
  for (const [slot, id] of worn) {
    const layer = document.createElement('span');
    layer.className = 'gear-layer' + (BEHIND.has(slot) ? ' behind' : '');
    const fitted = FITTED[id] && FITTED[id][type] && FITTED[id][type][sex];
    if (fitted) {
      // drawn for this exact sprite, at its size: it simply covers the sprite
      layer.classList.add('fitted');
      layer.appendChild(pictureOf(asset(fitted)));
    } else {
      const a = anchorFor(type, sex, slot, id);
      if (!a) continue;
      layer.style.left = (a.x * 100) + '%';
      layer.style.top = (a.y * 100) + '%';
      layer.style.width = (a.w * 100) + '%';
      layer.style.transform = `translate(-50%, -50%) rotate(${a.r || 0}deg)${a.m ? ' scaleX(-1)' : ''}`;
      const art = gearArtFor(id, type);
      if (art) layer.appendChild(pictureOf(asset(art)));
      else layer.innerHTML = ITEM_ICONS[id];
    }
    box.appendChild(layer);
  }
  return box;
}

function pictureOf(src) {
  const img = new Image();
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

// px sets the size: sprites are px * 17 tall, the pixel fallback is 14 px-sized pixels tall.
// srcOverride draws another picture of the same baby (an outfit) instead of its own sprite.
export function babyArt(type, px, sex = 'f', pixelOnly = false, srcOverride = null) {
  const src = !pixelOnly && (srcOverride || (SPRITES[type] && SPRITES[type][sex]));
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
