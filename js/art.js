// Drawings made in code: eggs, the nest, item icons, and the baby sprites (with a pixel-art fallback).
import { SPECIES, SEX, DRAWN_SLOTS, OUTFITS, STAGES, ITEMS, SCARS } from './config.js';
import { anchorFor, gearArtFor, FITTED, BEHIND, SCAR_ANCHORS } from './gear-art.js';
import { SHEETS } from './sheets.js';
import { scarStyle } from './journey.js';
import { seededRand } from './economy.js';

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
  // a few seeds, cracked one showing its kernel
  seed: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="5" cy="9" rx="2.6" ry="3.6" transform="rotate(-25 5 9)" fill="#a8743c" stroke="#6b4521" stroke-width=".8"/><ellipse cx="10.5" cy="6.5" rx="2.4" ry="3.3" transform="rotate(20 10.5 6.5)" fill="#c08a4a" stroke="#6b4521" stroke-width=".8"/><ellipse cx="10.5" cy="12" rx="2.2" ry="2.9" transform="rotate(70 10.5 12)" fill="#e8d3a0" stroke="#6b4521" stroke-width=".8"/></svg>',
  // a round fruit with a leaf
  fruit: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9.5" r="5" fill="#d8673a" stroke="#8a3a1c" stroke-width="1"/><circle cx="6.3" cy="7.8" r="1.2" fill="#f2a27a"/><path d="M8 4.5 L8.6 2" stroke="#5b3a1e" stroke-width="1.1"/><path d="M8.6 3 C10.5 1.5 12.5 2.2 13 3.2 C11.5 4 9.8 4 8.6 3Z" fill="#6fa64a"/></svg>',
  // two smooth, rounded pebbles
  stone: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="6" cy="10" rx="4.2" ry="3.2" fill="#9c958a" stroke="#5e584f" stroke-width="1"/><ellipse cx="11" cy="7" rx="3.2" ry="2.5" fill="#bdb6aa" stroke="#5e584f" stroke-width="1"/><path d="M4 9 C5 8.2 6.5 8 7.5 8.4 M9.8 6.2 C10.6 5.7 11.6 5.7 12.4 6" stroke="#e8e4dc" stroke-width=".9" fill="none" stroke-linecap="round"/></svg>',
  // a bundle wrapped in cloth and tied with cord
  ration: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="5" width="11" height="7.5" rx="2" fill="#c9a46a" stroke="#7a5a33" stroke-width="1"/><path d="M8 5 L8 12.5 M2.5 8.7 L13.5 8.7" stroke="#7a3f2a" stroke-width="1.2"/><path d="M8 5 C6.5 3 5 3.5 5.5 4.6 M8 5 C9.5 3 11 3.5 10.5 4.6" stroke="#7a3f2a" stroke-width="1" fill="none"/></svg>',
  // a clay flask with a resin stopper
  water_skin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 2.5 L9.5 2.5 L9.5 5 C12.5 6 13.5 8.5 13 11 C12.5 13.5 10.5 14.5 8 14.5 C5.5 14.5 3.5 13.5 3 11 C2.5 8.5 3.5 6 6.5 5Z" fill="#b8734a" stroke="#6e3f24" stroke-width="1"/><rect x="6.3" y="1.2" width="3.4" height="2" rx=".6" fill="#e39a2c"/><path d="M4.5 10 C6 11 10 11 11.5 10" stroke="#5b95c8" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>',
  leaf: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13 C3 6 8 2 14 2 C14 8 10 13 3 13Z" fill="#6fa64a"/><path d="M3 13 L10 6" stroke="#3f6b2a" stroke-width="1.4"/></svg>',
  meat: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2 C13 2 15 5 14 8 C13 11 9 12 7 10 C5 8 6 2 9 2Z" fill="#c4553b"/><path d="M9.5 4 C11 4 12 5 12 7" stroke="#eb9a84" stroke-width="1.3" fill="none"/><path d="M7.5 9.5 L4 13" stroke="#f2ead8" stroke-width="2.4" stroke-linecap="round"/><circle cx="3" cy="13.6" r="1.5" fill="#f2ead8"/><circle cx="2.4" cy="12" r="1.4" fill="#f2ead8"/></svg>',
  shell: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${SHELL_PATH}" fill="#eadcbf" stroke="#8b6a44" stroke-width="1"/><ellipse cx="5.5" cy="11" rx="1.2" ry="1" fill="#8b6a44" opacity=".6"/></svg>`,
  golden_shell: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${SHELL_PATH}" fill="#f0cd68" stroke="#b48114" stroke-width="1"/><path d="M5 10.5 l.8 -1.6 l.8 1.6 l1.6 .8 l-1.6 .8 l-.8 1.6 l-.8 -1.6 l-1.6 -.8Z" fill="#fff6d0"/></svg>`,
  amber: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L14 6 L11.5 14.5 L4.5 14.5 L2 6Z" fill="#e39a2c" stroke="#a5620f" stroke-width="1"/><path d="M5 6 L8 3.5 L10.5 6" stroke="#ffd58a" stroke-width="1" fill="none"/><ellipse cx="8" cy="10" rx="1.4" ry="1" fill="#6b3f0c"/><path d="M6.6 9.4 L5.6 8.8 M9.4 9.4 L10.4 8.8" stroke="#6b3f0c" stroke-width=".7"/></svg>',
  feather: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 2 C7 3 3.5 8 3 13 C8 12.5 12.5 9 13.5 2Z" fill="#6a9fb5" stroke="#3d6475" stroke-width=".8"/><path d="M2 14.5 L11 5" stroke="#2f4e5c" stroke-width="1.1" stroke-linecap="round"/></svg>',
  seashell: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 C12.5 2.5 14.5 7 13.5 11.5 L8 14 L2.5 11.5 C1.5 7 3.5 2.5 8 2.5Z" fill="#f0b48a" stroke="#a8643e" stroke-width="1"/><path d="M8 14 L8 3 M8 14 L5 3.6 M8 14 L11 3.6 M8 14 L3 6 M8 14 L13 6" stroke="#c47a50" stroke-width=".8"/></svg>',
  clay: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 10 C2.5 6.5 5 4.5 8 4.5 C11 4.5 13.5 6.5 13.5 10 C13.5 12.5 11 13.5 8 13.5 C5 13.5 2.5 12.5 2.5 10Z" fill="#b5694a" stroke="#7a3f28" stroke-width="1"/><path d="M5 8 C6.5 7 9.5 7 11 8" stroke="#d99273" stroke-width="1" fill="none"/></svg>',
  bone: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 9.8 L9.8 4.5" stroke="#efe6cf" stroke-width="2.6" stroke-linecap="round"/><g fill="#efe6cf" stroke="#9b8b66" stroke-width=".8"><circle cx="3.2" cy="10.4" r="1.7"/><circle cx="5.6" cy="12.8" r="1.7"/><circle cx="10.4" cy="3.2" r="1.7"/><circle cx="12.8" cy="5.6" r="1.7"/></g><path d="M4.5 9.8 L9.8 4.5" stroke="#efe6cf" stroke-width="2.2" stroke-linecap="round"/></svg>',
  // a two-tone capsule, the sanctuary's growth formula
  capsule: '<svg viewBox="0 0 16 16" aria-hidden="true"><g transform="rotate(-40 8 8)"><path d="M8 3.5 H5 a4.5 4.5 0 0 0 0 9 H8Z" fill="#4fa3c7" stroke="#24566e" stroke-width=".8"/><path d="M8 3.5 H11 a4.5 4.5 0 0 1 0 9 H8Z" fill="#f2efe6" stroke="#24566e" stroke-width=".8"/><path d="M4 6 Q4.5 5 6 5" stroke="#fff" stroke-width=".8" fill="none" stroke-linecap="round"/></g></svg>',
  herb: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15 V6" stroke="#4d7a32" stroke-width="1.4" stroke-linecap="round"/><path d="M8 9 C4 9 2.5 6.5 3 4 C6 4 8 6 8 9Z M8 7 C12 7 13.5 4.5 13 2 C10 2 8 4 8 7Z M8 12 C11.5 12 13 10 12.5 8 C10 8 8 9.5 8 12Z" fill="#7cbf5a" stroke="#3f6b2a" stroke-width=".7"/><circle cx="12" cy="13" r="2" fill="#e05a7a"/><path d="M11 13 h2 M12 12 v2" stroke="#fff" stroke-width=".8"/></svg>',
  allo_tooth: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2 Q11 3 12.5 9 L8.5 14.5 Q5.5 9 5 2Z" fill="#efe6cf" stroke="#8a7a55" stroke-width="1"/><path d="M12.5 9 L11.6 9.6 L11.9 10.5 L11 11 L11.2 12 L10.2 12.4" stroke="#8a7a55" stroke-width=".7" fill="none"/><path d="M6.5 4 Q7 8 8.5 12" stroke="#fffaf0" stroke-width=".8" fill="none"/></svg>',
  allo_blood: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 C10.5 5.5 13 8 13 10.5 A5 5 0 0 1 3 10.5 C3 8 5.5 5.5 8 1.5Z" fill="#9c1f24" stroke="#5c0d10" stroke-width="1"/><path d="M5.6 10 Q5.8 12.3 7.8 13" stroke="#e05a5e" stroke-width="1" fill="none" stroke-linecap="round"/></svg>',
  transfusion: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1.5 H10 M6.5 1.5 V5 L3.5 12.5 A1.5 1.5 0 0 0 5 14.5 H11 A1.5 1.5 0 0 0 12.5 12.5 L9.5 5 V1.5" fill="#eef3f2" stroke="#6b7f7c" stroke-width="1"/><path d="M5 10 H11 L12 12.6 A1 1 0 0 1 11 13.8 H5 A1 1 0 0 1 4 12.6Z" fill="#9c1f24"/><path d="M8 6.2 V8.6 M6.8 7.4 H9.2" stroke="#3f8a4a" stroke-width="1.1" stroke-linecap="round"/></svg>',
  obsidian: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L13 6.5 L10.5 14.5 L4 13 L2.5 6Z" fill="#2c2733" stroke="#120f16" stroke-width="1"/><path d="M8 1.5 L7 8 L13 6.5 M7 8 L4 13 M7 8 L10.5 14.5" stroke="#5c5370" stroke-width=".8" fill="none"/><path d="M5 5.5 L6.6 4" stroke="#a49bbd" stroke-width=".9" stroke-linecap="round"/></svg>',
  insect: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="9" rx="3.2" ry="4.5" fill="#5a4a2a" stroke="#2a2010" stroke-width=".8"/><circle cx="8" cy="4" r="2" fill="#3a2e1a"/><path d="M5 7 L2 5 M5 9.5 L1.8 9.5 M5 12 L2.4 14 M11 7 L14 5 M11 9.5 L14.2 9.5 M11 12 L13.6 14 M7.2 2.6 L6 1 M8.8 2.6 L10 1" stroke="#2a2010" stroke-width=".9" stroke-linecap="round"/><path d="M8 5.5 V13" stroke="#8a7a4a" stroke-width=".6"/></svg>',
  fish: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8 C4 4 9 3.5 12 8 C9 12.5 4 12 2 8Z" fill="#7aa8c4" stroke="#3a6a84" stroke-width=".9"/><path d="M12 8 L15 5 L15 11Z" fill="#7aa8c4" stroke="#3a6a84" stroke-width=".9"/><circle cx="5" cy="7.3" r=".9" fill="#1b2a33"/><path d="M7.5 6 Q8.5 8 7.5 10" stroke="#3a6a84" stroke-width=".7" fill="none"/></svg>',
  raw_egg: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 C11 1.8 13 6.5 13 9.4 C13 12.6 10.8 14.4 8 14.4 C5.2 14.4 3 12.6 3 9.4 C3 6.5 5 1.8 8 1.8Z" fill="#f3ead2" stroke="#a89878" stroke-width=".9"/><ellipse cx="6.4" cy="6" rx="1.2" ry="2" fill="#fff" opacity=".6"/></svg>',
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
  obsidian_fang: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3 Q8 8 14 3" stroke="#6b4a2e" stroke-width="1.3" fill="none"/><path d="M8 6 L10.5 9 L8 15 L5.5 9Z" fill="#2c2733" stroke="#120f16" stroke-width=".8"/><path d="M8 7.5 L7 10.5" stroke="#8c82a8" stroke-width=".8" stroke-linecap="round"/></svg>',
  feather_cloak: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2 H11 L14.5 14 Q8 11.5 1.5 14Z" fill="#6a9fb5" stroke="#3d6475"/><path d="M4.2 7 Q8 9 11.8 7 M3.2 10.5 Q8 12.5 12.8 10.5" stroke="#9cc8d8" stroke-width="1" fill="none"/><path d="M5 2 Q8 4 11 2" stroke="#3d6475" fill="none"/></svg>',
  clay_plate: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 H13 L14 8.5 L8 15 L2 8.5Z" fill="#b5694a" stroke="#7a3f28"/><path d="M4.5 5.5 H11.5 M3.8 8.5 H12.2" stroke="#d99273" stroke-width="1"/><circle cx="8" cy="11" r="1.2" fill="#7a3f28"/></svg>',
  amber_charm: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5 Q8 8 14 2.5" stroke="#6b4a2e" stroke-width="1.2" fill="none"/><path d="M8 6.5 L12 10 L10 14.5 L6 14.5 L4 10Z" fill="#e39a2c" stroke="#a5620f"/><ellipse cx="8" cy="11" rx="1.3" ry=".9" fill="#6b3f0c"/></svg>',
  golden_crown: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12 L2.5 5 L5.5 8 L8 3.5 L10.5 8 L13.5 5 L14 12Z" fill="#f0cd68" stroke="#b48114"/><rect x="2" y="11.5" width="12" height="2.5" rx=".8" fill="#e0b443" stroke="#b48114" stroke-width=".8"/><circle cx="8" cy="9.5" r="1.2" fill="#d2493f"/></svg>',
  wooden_club: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 14 L10 5" stroke="#8a5a32" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="11" cy="4.5" rx="3" ry="3.5" fill="#8a5a32" stroke="#5a3a1e" transform="rotate(40 11 4.5)"/></svg>',
  hide_cap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 11 C2.5 5.5 5 3 8 3 C11 3 13.5 5.5 13.5 11Z" fill="#a77b4f" stroke="#6b4a2e"/><path d="M2 11 H14" stroke="#6b4a2e" stroke-width="1.6" stroke-linecap="round"/></svg>',
  hide_tunic: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2 L8 4 L11 2 L14 5 L12 7 V14 H4 V7 L2 5Z" fill="#9c6b3f" stroke="#5e3d20"/><path d="M6 9 H10" stroke="#5e3d20"/></svg>',
  wooden_shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="#9a6a3a" stroke="#5e3d20"/><path d="M5 3.5 V12.5 M8 2 V14 M11 3.5 V12.5" stroke="#6e4a26" stroke-width=".9"/><circle cx="8" cy="8" r="1.6" fill="#c9c2b0" stroke="#5e3d20" stroke-width=".7"/></svg>',
  sandals: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12 H8 L9 10 H5 L4 8 H2Z M9 13 H15 L15 11 H11 L10 9 H9Z" fill="#7a5a3a" stroke="#4a3420" stroke-width=".7"/></svg>',
  bone_sword: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 L13 3 L14 2 L13.5 4 L5 13Z" fill="#efe6cf" stroke="#9b8b66" stroke-width=".8"/><path d="M3 10 L6 13 M2.5 13.5 L4.5 11.5" stroke="#6b4a2e" stroke-width="1.6" stroke-linecap="round"/></svg>',
  obsidian_blade: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 L12 2 L13.5 3.5 L5 13Z" fill="#2c2733" stroke="#120f16" stroke-width=".8"/><path d="M11 4 L6 10" stroke="#8c82a8" stroke-width=".7"/><path d="M3 10 L6 13 M2.5 13.5 L4.5 11.5" stroke="#6b4a2e" stroke-width="1.6" stroke-linecap="round"/></svg>',
  bone_shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L14 4 V8 C14 11.5 11 13.8 8 14.8 C5 13.8 2 11.5 2 8 V4Z" fill="#e6dcc0" stroke="#9b8b66"/><path d="M5 5.5 H11 M4.5 8 H11.5 M5.5 10.5 H10.5" stroke="#b8aa86" stroke-width="1"/></svg>',
  clay_armor: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2 L8 4 L11 2 L14 5 L12 7 V14 H4 V7 L2 5Z" fill="#b5694a" stroke="#7a3f28"/><path d="M4.5 8 H11.5 M4.5 10.8 H11.5" stroke="#d99273"/></svg>',
  feather_boots: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 H7 V10 L12 11 V14 H3Z" fill="#6a9fb5" stroke="#3d6475"/><path d="M7 4 L10 1.5 M7 6 L10.5 4" stroke="#9cc8d8" stroke-width="1.2" stroke-linecap="round"/></svg>',
  obsidian_helm: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 11 C2.5 5.5 5 2.5 8 2.5 C11 2.5 13.5 5.5 13.5 11Z" fill="#3a3342" stroke="#120f16"/><path d="M8 2.5 L9.5 0.8 M5 4 L5.5 1.8 M11 4 L10.5 1.8" stroke="#2c2733" stroke-width="1.4" stroke-linecap="round"/><path d="M2 11 H14" stroke="#120f16" stroke-width="1.6"/></svg>',
});

export const BAG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 10 C11 4 21 4 21 10" stroke="#6d4e2a" stroke-width="2.6" fill="none"/><rect x="5" y="9" width="22" height="20" rx="6" fill="#9c7240"/><rect x="9.5" y="17" width="13" height="9" rx="2.5" fill="#c49a5c"/><rect x="14" y="15.5" width="4" height="3.4" rx="1" fill="#6d4e2a"/></svg>';

// ---------- the player ----------
// The player's explorer, drawn in code (a placeholder until real art): a small figure facing right,
// dressed in whatever it wears. height is in pixels.
const tint = (equip, slot, fallback) => (equip[slot] && ITEMS[equip[slot]] && ITEMS[equip[slot]].color) || fallback;
export function playerArt(equip = {}, height = 120) {
  const skin = '#e3b48a', hair = '#4a3324';
  const shirt = tint(equip, 'body', '#d8c8a2'), shoes = tint(equip, 'feet', skin);
  const weapon = equip.weapon && ITEMS[equip.weapon];
  const blade = weapon ? weapon.color : null;
  const weaponSVG = !weapon ? ''
    : equip.weapon === 'wooden_club'
      ? `<path d="M70 82 L86 46" stroke="${blade}" stroke-width="6" stroke-linecap="round"/><ellipse cx="87" cy="42" rx="7" ry="9" fill="${blade}" stroke="#5a3a1e" stroke-width="1.5" transform="rotate(25 87 42)"/>`
      : `<path d="M71 80 L92 34 L95 30 L94 36 L74 82Z" fill="${blade}" stroke="#2a2420" stroke-width="1.4" stroke-linejoin="round"/><path d="M66 76 L78 82" stroke="#6b4a2e" stroke-width="4" stroke-linecap="round"/>`;
  const shield = equip.shield ? `<g transform="translate(22 72)"><ellipse rx="15" ry="18" fill="${tint(equip, 'shield', '#9a6a3a')}" stroke="#4a3420" stroke-width="2"/><circle r="4" fill="#c9c2b0" stroke="#4a3420" stroke-width="1.2"/></g>` : '';
  const helm = equip.head ? `<path d="M34 34 C34 14 46 8 56 8 C68 8 78 16 78 34 Z" fill="${tint(equip, 'head', '#a77b4f')}" stroke="#2a2420" stroke-width="2"/><path d="M32 34 H80" stroke="#2a2420" stroke-width="3" stroke-linecap="round"/>` : '';
  const svg = `<svg class="player-art" viewBox="0 0 100 140" style="height:${Math.round(height)}px;width:auto" role="img" aria-label="Your explorer">
    <path d="M44 84 L36 100" stroke="${skin}" stroke-width="8" stroke-linecap="round"/>
    ${shield}
    <rect x="40" y="100" width="9" height="26" rx="3" fill="#6b4a2e"/><rect x="54" y="100" width="9" height="26" rx="3" fill="#5a3d24"/>
    <path d="M36 126 h16 v8 h-18 Z M51 126 h16 v8 h-18 Z" fill="${shoes}" stroke="#2a2420" stroke-width="1.5"/>
    <path d="M34 62 Q36 52 52 52 Q68 52 70 62 L72 104 H32 Z" fill="${shirt}" stroke="#2a2420" stroke-width="2"/>
    <path d="M32 98 H72" stroke="#2a2420" stroke-width="1.5" opacity=".4"/>
    <circle cx="56" cy="34" r="20" fill="${skin}" stroke="#2a2420" stroke-width="2"/>
    <path d="M36 32 C36 16 48 12 58 12 C70 12 76 20 76 28 C68 24 58 26 52 22 C48 28 42 30 36 32Z" fill="${hair}"/>
    <circle cx="66" cy="36" r="2.6" fill="#1b1a17"/><path d="M62 46 Q67 48 71 44" stroke="#7a4a32" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${helm}
    ${weaponSVG}
    <path d="M62 64 Q70 72 70 80" stroke="${skin}" stroke-width="8" stroke-linecap="round" fill="none"/>
  </svg>`;
  const wrap = document.createElement('span');
  wrap.className = 'player-wrap';
  wrap.innerHTML = svg;
  return wrap.firstElementChild;
}

// ---------- the guide ----------
// Professor Ivy Fern, the paleontologist who teaches the game. Drawn in code (a placeholder until real
// art), facing left so she looks at her speech bubble. height is in pixels.
export function guideArt(height = 180) {
  const skin = '#e9b892', hair = '#8a4b2a', khaki = '#c9b07a', dark = '#2a2420';
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="guide-art" viewBox="0 0 120 170" style="height:${Math.round(height)}px;width:auto" role="img" aria-label="Professor Ivy Fern">
    <path d="M78 40 C96 46 98 70 88 84 C84 70 82 58 76 50Z" fill="${hair}"/>
    <rect x="44" y="124" width="11" height="34" rx="4" fill="#6b5a3a"/><rect x="60" y="124" width="11" height="34" rx="4" fill="#5c4c30"/>
    <path d="M40 156 h18 v9 h-21 Z M57 156 h18 v9 h-21 Z" fill="#5a3d24" stroke="${dark}" stroke-width="1.5"/>
    <path d="M36 82 Q38 68 58 68 Q78 68 80 82 L84 128 H32 Z" fill="${khaki}" stroke="${dark}" stroke-width="2"/>
    <path d="M58 70 L58 126" stroke="${dark}" stroke-width="1.2" opacity=".35"/>
    <rect x="62" y="86" width="12" height="10" rx="2" fill="none" stroke="${dark}" stroke-width="1.4" opacity=".5"/>
    <path d="M46 70 Q58 82 70 70 L66 64 Q58 72 50 64Z" fill="#4f8a3a" stroke="${dark}" stroke-width="1.5"/>
    <path d="M38 84 Q28 100 34 110" stroke="${skin}" stroke-width="9" stroke-linecap="round" fill="none"/>
    <g transform="rotate(-12 30 106)"><rect x="18" y="96" width="22" height="26" rx="2" fill="#a0442c" stroke="${dark}" stroke-width="1.6"/><path d="M22 102 h14 M22 107 h14 M22 112 h10" stroke="#f3ead2" stroke-width="1.4"/></g>
    <circle cx="56" cy="44" r="21" fill="${skin}" stroke="${dark}" stroke-width="2"/>
    <path d="M36 42 C36 26 48 20 60 21 C72 22 78 30 77 42 C70 36 60 34 52 30 C46 36 40 40 36 42Z" fill="${hair}"/>
    <circle cx="45" cy="45" r="5.5" fill="#fff" fill-opacity=".35" stroke="${dark}" stroke-width="1.8"/>
    <circle cx="59" cy="45" r="5.5" fill="#fff" fill-opacity=".35" stroke="${dark}" stroke-width="1.8"/>
    <path d="M50.5 45 h3 M64.5 44 L72 42" stroke="${dark}" stroke-width="1.8"/>
    <circle cx="45" cy="45.5" r="1.8" fill="${dark}"/><circle cx="59" cy="45.5" r="1.8" fill="${dark}"/>
    <path d="M45 56 Q51 60 57 55" stroke="#9a4a32" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="40" cy="52" r="3" fill="#e98a7a" opacity=".45"/>
    <path d="M28 30 Q56 22 86 30 L82 33 Q56 27 32 33Z" fill="#a8905a" stroke="${dark}" stroke-width="1.8"/>
    <path d="M38 31 C38 16 46 10 57 10 C68 10 75 16 75 31Z" fill="${khaki}" stroke="${dark}" stroke-width="2"/>
    <path d="M38 27 H75" stroke="#7a5a33" stroke-width="3"/>
  </svg>`;
  return wrap.firstElementChild;
}

// ---------- babies ----------
// image paths are resolved from this file, not from the page, so pages in other folders
// (tools/anchors.html) find the same pictures
const asset = path => new URL('../' + path, import.meta.url).href;
// an event's picture (images/events/<key>.webp or .png, 16:9): the addresses to try, in order
export const eventArtUrls = keys => keys.flatMap(k => ['webp', 'png'].map(ext => asset(`images/events/${k}.${ext}`)));
// (a baby looks the same whatever its sex: the older drawings use the female's for both)
const SPRITES = Object.fromEntries(['proto', 'hypa', 'raptor'].map(type =>
  [type, { m: asset(`sprites/${type}-f.png`), f: asset(`sprites/${type}-f.png`) }]));
// babies redrawn in profile (animated .webp: their idle plays on their own); a baby looks the same
// whatever its sex, so one drawing serves both
SPRITES.dilo = { f: asset('sprites/dilo-f.webp'), m: asset('sprites/dilo-f.webp') };
SPRITES.rex = { f: asset('sprites/rex.webp'), m: asset('sprites/rex.webp') };
// how tall a profile baby is drawn against the others (its long tail makes it twice as wide)
const BABY_SCALE = { dilo: 0.8, rex: 0.8 };

// adult sprites drawn so far, by species and sex (sprites/adult/); equipment is fitted to these.
// (A new or changed animated .webp needs its sheet made: python3 scripts/sheets.py)
// Adults without one are drawn with their baby sprite, scaled up.
export const ADULT_SPRITES = { rex: { m: asset('sprites/adult/rex-m.webp') }, raptor: { m: asset('sprites/adult/raptor-m.webp'), f: asset('sprites/adult/raptor-f.webp') }, dilo: { m: asset('sprites/adult/dilo-m.webp') } };
// adults that walk with their own cycle (sprites/adult/*-walk.webp, on the same canvas as the idle):
// step, how far a foot travels in half a cycle as a share of the sprite's height, and the cycle's
// frames and their time, so the walker moves exactly as fast as its feet carry it
export const ADULT_WALKS = { raptor: { f: { src: asset('sprites/adult/raptor-f-walk.webp'), step: 0.667, frames: 4, ms: 220 } } };
export const adultWalk = (type, sex) => (ADULT_WALKS[type] && ADULT_WALKS[type][sex]) || null;
// an animated picture's sheet (js/sheets.js), if it has one
export const sheetFor = src => (src && SHEETS[src.slice(asset('').length)]) || null;
// how tall an adult sprite is drawn: in proportion to how tall the animal stands (to the top of its
// head, in metres; HEIGHT_REF metres drawn at the usual size), so a Tyrannosaurus towers over a
// Velociraptor as it did. Animated sprites (.webp) play their idle on their own. (A Velociraptor male
// a little smaller than the female, as in hawks.)
const ADULT_HEIGHT = { raptor: { m: 0.62, f: 0.66 }, dilo: { m: 1.8 }, rex: { m: 3.7 } };
const HEIGHT_REF = 2.6;
export const adultScale = (type, sex) => {
  const h = (ADULT_HEIGHT[type] || {})[sex];
  return h ? Math.round(h / HEIGHT_REF * 100) / 100 : 1;
};
export const adultSpriteUrl = (type, sex) => (ADULT_SPRITES[type] && ADULT_SPRITES[type][sex]) || null;

// juvenile sprites drawn so far (sprites/juvenile/), and how tall each is drawn against the others;
// juveniles without one keep their baby sprite, scaled up
export const JUVENILE_SPRITES = { dilo: { m: asset('sprites/juvenile/dilo-m.webp') } };
const JUVENILE_SCALE = { dilo: { m: 0.8 } };
export const juvenileSpriteUrl = (type, sex) => (JUVENILE_SPRITES[type] && JUVENILE_SPRITES[type][sex]) || null;

// pixel-art fallback for species without a sprite, or when an image fails to load
const BASE = [
  '................', '..........####..', '.........######.', '.........##o####', '.........#######',
  '........#####...', '..#....######...', '..##..#######...', '...##########...', '....#########...',
  '.....#######....', '......##.##.....', '......#..#......', '......##.##.....',
];
const EXTRA = {
  argent: [[0,12],[0,13],[1,12],[2,12],[3,11],[6,1],[7,1],[8,2]],
  spino: [[3,6],[3,7],[3,8],[4,5],[4,6],[4,7],[4,8],[4,9],[2,14],[2,15]],
  allo: [[0,11],[0,13],[1,10],[6,2],[7,3]],
  ankylo: [[5,7],[5,9],[5,11],[6,8],[6,10],[7,4],[7,3]],
  trike: [[1,15],[2,15],[0,12],[1,13],[4,8],[5,8]],
  para: [[0,6],[0,7],[0,8],[0,9],[1,8],[1,9]],
  bary: [[2,14],[2,15],[3,15],[6,2],[7,2]],
  stego: [[4,8],[4,10],[5,7],[5,9],[5,11],[6,6],[6,8],[6,10]],
  pachy: [[0,10],[0,11],[0,12],[0,13],[1,10],[1,13]],
  galli: [[0,11],[1,9],[6,2],[7,2]],
  dilo:    [[0,10],[0,12],[1,9],[1,11],[6,2],[7,3]],
  scelido: [[4,8],[5,8],[5,10],[6,7],[6,9],[6,11],[7,6],[7,8],[7,10]],
  compy:  [[0,11],[1,9],[6,2],[7,3]],
  coelo:  [[0,10],[0,12],[1,9],[6,1],[6,2],[7,2]],
  psitta: [[0,9],[1,8],[2,8],[4,15]],
  hypsi:  [[0,11],[1,9],[7,8],[8,6]],
  proto:  [[0,9],[1,8],[1,9],[2,8],[3,8],[4,8]],
  hypa:   [[0,10],[0,11],[0,12],[1,9],[7,8],[8,6],[9,10]],
  raptor: [[0,11],[0,13],[6,2],[7,2],[8,3],[1,9]],
  rex:    [[5,8],[7,7],[8,5],[9,9]],
};
// males only: extra feathers, horns, crests and stripes in a second, brighter color ('b')
const MALE_EXTRA = {
  argent: [[0,14],[5,8],[9,9]],
  spino: [[2,6],[2,7],[3,5],[3,9]],
  allo: [[0,12],[5,8],[8,4]],
  ankylo: [[4,8],[4,10],[6,2]],
  trike: [[0,13],[0,14],[3,8]],
  para: [[0,5],[1,7],[7,8]],
  bary: [[0,11],[0,12],[5,8]],
  stego: [[3,8],[3,10],[4,6],[4,12]],
  pachy: [[0,9],[0,14],[1,9],[5,8]],
  galli: [[0,12],[5,8],[6,1]],
  dilo:    [[0,11],[0,13],[1,10],[5,8]],
  scelido: [[4,10],[5,6],[5,12],[3,8]],
  compy:  [[0,12],[5,8],[6,3]],
  coelo:  [[0,11],[0,13],[5,2],[8,4]],
  psitta: [[0,8],[1,7],[5,1],[6,1]],
  hypsi:  [[0,12],[7,4],[8,7],[9,9]],
  proto:  [[1,8],[3,8],[2,15],[8,7],[8,9],[0,8]],
  hypa:   [[0,11],[0,13],[7,3],[8,4],[9,6],[1,8]],
  raptor: [[0,12],[0,10],[5,8],[5,2],[6,1],[6,13],[7,13]],
  rex:    [[0,11],[0,12],[6,9],[9,6],[1,9]],
};
const MALE_COLOR = { argent: '#c9b98a', spino: '#d96a3a', allo: '#e8c06a', ankylo: '#c9a96a', trike: '#d9a03a', para: '#e8d27a', bary: '#3aa0a0', stego: '#e0662a', pachy: '#e3c9a0', galli: '#e07a3a', dilo: '#e2b33a', scelido: '#c9573a', compy: '#e46a3a', coelo: '#e3c13a', psitta: '#d9503a', hypsi: '#3aa0c9', proto: '#f2cf45', hypa: '#d9503a', raptor: '#36b5a5', rex: '#f08a46' };

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
// (the juvenile or adult one, when it exists), drawn larger as it grows, with its small accessories
// (DRAWN_SLOTS) on top. Returns the plain sprite when nothing is drawn over it, otherwise a box holding
// the sprite and one layer per accessory.
// Scars, drawn over the sprite where the part is (as equipment is placed: the head, neck and body
// where those pieces go; the legs below the body, the tail behind the back): healed slashes, paler
// than the skin, and for a deep one more of them and the pits of teeth
const SCAR_MARK = {
  1: '<path d="M20 30 L70 18 M28 50 L82 36"/>',
  2: '<path d="M14 26 L74 10 M20 46 L88 28 M30 66 L84 52"/><g class="pits"><circle cx="40" cy="80" r="3.5"/><circle cx="54" cy="76" r="3.5"/><circle cx="68" cy="72" r="3.5"/></g>',
};
const scarSVG = level => `<svg viewBox="0 0 100 100" aria-hidden="true">${SCAR_MARK[level]}</svg>`;
// Scars drawn for each kind of blow (sprites/scars/<style>-<level>.webp, square, the scar filling its
// width), by how it was given (journey.js scarStyle) and how deep; a deep one not drawn yet shows the
// marked one, and a kind with none drawn the slashes above. healed: a deep one's scar, when the deep one
// is drawn as the open wound; stitched: the wound sewn up in the hospital (cuts, not bites); surgical:
// the neat scar it closes into, the stitches out
const SCAR_ART = {
  claw: { 1: 'sprites/scars/claw-1.webp', 2: 'sprites/scars/claw-2.webp', healed: 'sprites/scars/claw-2-healed.webp', stitched: 'sprites/scars/claw-stitched.webp', surgical: 'sprites/scars/claw-surgical.webp' },
  bigBite: { 1: 'sprites/scars/bigBite-1.webp' },
  horns: { 1: 'sprites/scars/horns-1.webp', 2: 'sprites/scars/horns-2.webp', healed: 'sprites/scars/horns-2-healed.webp' },
};
// a part's own pictures, over its kind's (their claw scars, light and deep)
const PART_ART = {
  neck: { claw: { 1: 'sprites/scars/neck-claw-1.webp', healed: 'sprites/scars/neck-claw-2-healed.webp' } },
  body: { claw: { 1: 'sprites/scars/body-claw-1.webp', healed: 'sprites/scars/body-claw-2-healed.webp' } },
  legs: { claw: { healed: 'sprites/scars/legs-claw-2-healed.webp' } },
};
export const SCAR_LOOKS = Object.keys(SCARS.style);
// what a scar looks like: its picture, and how wide it is drawn against its place's width
// (skin: the skin's colour where it is: a scar is that, darker, and a wound heals into it)
export function scarMark(style, level, tint = 0, stitched = false, skin = null, closing = false, part = null) {
  const t = Math.round(tint * 20) / 20;
  // (a deep one drawn as the open wound it was has its healed look apart, for the scar it leaves)
  // (a deep one: the open wound while it gapes, its healed look as it closes and once closed)
  const art = { ...(SCAR_ART[style] || {}), ...((PART_ART[part] || {})[style] || {}) };
  const src = (stitched && (!tint || closing) && art.surgical) || (stitched && tint && art.stitched) || (level === 2 && (!tint || closing) && art.healed) || art[level] || art[1] || art[2];
  // (deep: one of the deep pictures, placed where the deep look is, if it has a place of its own)
  const deep = !!src && (src === art[2] || src === art.healed || src === art.stitched || src === art.surgical);
  // (rim: a deep wound healed on its own, dark at its edges and pale in its middle)
  return src ? { key: src, src: asset(src), scale: 1, tint: t, deep, ...(src === art.healed ? { rim: true } : {}), ...(src === art.surgical && !t ? { pale: true } : {}), ...(skin ? { skin } : {}) }
    : { key: 'line' + level, src: lineScar(level), scale: 1.2, level: t || skin ? 0 : level, tint: t, ...(skin ? { skin } : {}) };
}
// the skin's colour where a part's scar goes: picked there in tools/anchors.html, or on another part of
// the same drawing, or the species' own
const skinAt = (type, sex, part, stage) => {
  const colour = o => o && (o.c || (o.deep && o.deep.c));
  const a = scarAnchor(type, sex, part, stage), other = Object.values(ownScars(type, sex, stage)).map(colour).find(Boolean);
  return colour(a) || other || (SPECIES[type] && SPECIES[type].body) || null;
};
// the giver of the worst a part got (a species or a creature), as the kind of blow it gave
// (or the kind itself, as the anchors tool shows it)
const styleBy = who => (!who ? 'any' : SCARS.style[who] ? who : scarStyle(SPECIES[who] ? { species: who } : { creature: who }));
// (a baby looks the same whatever its sex, so a place set on either serves both)
const ownScars = (type, sex, stage) => {
  const at = ((SCAR_ANCHORS[type] || {})[stage] || {});
  return at[sex] || (stage === 'baby' && at[sex === 'm' ? 'f' : 'm']) || {};
};
const ownScar = (type, sex, part, stage) => ownScars(type, sex, stage)[part] || null;
// A part may have more scars than one, all drawn together: part, part~2, part~3... (the part itself
// when none is placed, where the equipment's places put it)
export function scarPlaces(type, sex, part, stage = 'adult') {
  const keys = Object.keys(ownScars(type, sex, stage)).filter(k => k === part || k.startsWith(part + '~'));
  return keys.length ? keys.sort((a, b) => (+a.split('~')[1] || 1) - (+b.split('~')[1] || 1)) : [part];
}
export function scarAnchor(type, sex, part, stage = 'adult') {
  const own = ownScar(type, sex, part, stage);
  if (own) return own;
  part = part.split('~')[0];
  const at = slot => anchorFor(type, sex, slot);
  const body = at('body'), back = at('back') || body;
  const head = at('head');
  // (the head's piece sits on top of it: a scar goes on the face, below)
  if (part === 'head') return head && { ...head, x: head.x - 0.02, y: Math.min(0.9, head.y + 0.1), w: head.w * 0.55, r: 0 };
  if (part === 'neck' || part === 'body') { const a = at(part); return a && { ...a, w: a.w * 0.6 }; }
  if (!body) return null;
  if (part === 'legs') return { x: body.x - 0.04, y: Math.min(0.85, body.y + 0.3), w: body.w * 0.42, r: 0 };
  return { x: Math.max(0.08, back.x - 0.32), y: Math.min(0.8, back.y + 0.12), w: back.w * 0.42, r: 0 };
}
// How the skin at (x, y) (shares of the drawing) has moved by a frame, from frame 0: the sheet's grid of
// followed points (scripts/sheets.py), between its four nearest. [dx, dy] as shares.
const moves = {};
export function motionAt(sheet, x, y, frame) {
  if (!sheet || !sheet.moves || !frame) return [0, 0];
  const m = moves[sheet.sheet] || (moves[sheet.sheet] = Int8Array.from(atob(sheet.moves), ch => (ch.charCodeAt(0) << 24) >> 24));
  const { step, gw, gh } = sheet;
  const gx = Math.max(0, Math.min(gw - 1.001, x * sheet.w / step - 0.5)), gy = Math.max(0, Math.min(gh - 1.001, y * sheet.h / step - 0.5));
  const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
  const at = (a, b, c) => m[((frame * gh + b) * gw + a) * 2 + c];
  const lerp = c => (at(i, j, c) * (1 - u) + at(Math.min(gw - 1, i + 1), j, c) * u) * (1 - v)
    + (at(i, Math.min(gh - 1, j + 1), c) * (1 - u) + at(Math.min(gw - 1, i + 1), Math.min(gh - 1, j + 1), c) * u) * v;
  const unit = sheet.unit || 1;
  return [lerp(0) * unit / sheet.w, lerp(1) * unit / sheet.h];
}
// where something set on the skin is at a frame: by its own keys if it has them, else as the skin moves
export function placeOn(sheet, a, frame) {
  if (!a || !sheet) return a;
  if (a.f) return scarAt(a, frame, sheet.frames);
  const [dx, dy] = motionAt(sheet, a.x, a.y, frame);
  return dx || dy ? { ...a, x: a.x + dx, y: a.y + dy } : a;
}
// A scar's place as it looks: the deep look (open wound, deep scar, sewn up) may have a place of its own,
// deep: { x, y, w, r, f }, set apart from the superficial one in tools/anchors.html
export function scarPlace(type, sex, part, stage, mark) {
  const a = scarAnchor(type, sex, part, stage);
  return a && mark && mark.deep && a.deep ? a.deep : a;
}
// Which side of a dinosaur each scar is on, its own way (by its id and the scar's key): the sprites face
// right, showing the left side; turned to face left, its right side shows, and the scars on it
export const sideOf = (seed, key) => (seed == null ? null : seededRand(`side:${seed}:${key}`)() < 0.5 ? 'left' : 'right');
// a dinosaur's picture turned to face one way (dir 1 right, -1 left): mirrored, with the scars of the side
// that shows
export function face(art, dir) {
  const base = art.classList.contains('dino-base') ? art : art.querySelector('.dino-base') || art, side = dir < 0 ? 'right' : 'left';
  art.style.transform = `scaleX(${dir})`;
  if (base.sheet && base.side !== side) { base.side = side; base.dirty = true; }
  art.querySelectorAll && art.querySelectorAll('.scar-layer[data-side]').forEach(l => { l.hidden = l.dataset.side !== side; });
}
// Each dinosaur's scars where they fell on it: a scar's place is the middle of where it may be, and each
// dinosaur (by its id, and the scar's key) has it moved, turned and sized within the place's spread
// (d: how far, as a share of the drawing's width; r: degrees either way; s: a share bigger or smaller),
// tried until it lies on its body, the same every time for that dinosaur. Both a scar's looks move alike.
export const SPREAD = { d: 0.03, r: 15, s: 0.1 };
const fell = new Map(), bodies = {};
function bodyOf(s) {
  if (bodies[s.sheet]) return bodies[s.sheet];
  const img = imageOf(sheetImages, s.sheet, asset(s.sheet));
  if (!img.complete || !img.naturalWidth) return null;
  const W = Math.round(s.w / 4), H = Math.round(s.h / 4), c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, s.w, s.h, 0, 0, W, H);
  try { const px = g.getImageData(0, 0, W, H).data, on = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) on[i] = px[i * 4 + 3] > 160; return (bodies[s.sheet] = { W, H, on }); } catch (e) { return null; }
}
const onBody = (b, x, y, w, aspect) => {
  let hits = 0;
  for (const [ox, oy] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2]]) {
    const i = Math.floor((y + oy * w * aspect) * b.H) * b.W + Math.floor((x + ox * w) * b.W);
    if (i >= 0 && i < b.on.length && b.on[i]) hits++;
  }
  return hits >= 8;
};
export function spread(place, main, seed, key, s) {
  const sp = (main && main.spread) || SPREAD;
  if (!place || seed == null || place.f || (!sp.d && !sp.r && !sp.s)) return place;
  const at = [seed, key, main.x, main.y, main.w, main.r || 0, sp.d, sp.r, sp.s, s ? s.sheet : ''].join('|');
  let o = fell.get(at);
  if (!o) {
    const body = s && bodyOf(s), aspect = s ? s.w / s.h : 1, rand = seededRand(`scar:${seed}:${key}`);
    if (s && !body) return place;
    for (let n = 0; n < 12; n++) {
      const turn = rand() * Math.PI * 2, far = Math.sqrt(rand()) * sp.d;
      o = { dx: Math.cos(turn) * far, dy: Math.sin(turn) * far * aspect, dr: (rand() * 2 - 1) * sp.r, ds: (rand() * 2 - 1) * sp.s };
      if (!body || onBody(body, main.x + o.dx, main.y + o.dy, main.w * (1 + o.ds), aspect)) break;
      if (n === 11) o = { dx: 0, dy: 0, dr: 0, ds: 0 };
    }
    if (fell.size > 500) fell.clear();
    fell.set(at, o);
  }
  return { ...place, x: place.x + o.dx, y: place.y + o.dy, r: (place.r || 0) + o.dr, w: place.w * (1 + o.ds) };
}
// Where a scar is at one frame of an animated sprite: its place may carry keys, f: { frame: [x, y, r] },
// and between two keys it moves in a straight line (the place itself is frame 0's key)
export function scarAt(a, frame, frames) {
  if (!a || !a.f) return a;
  const keys = [[0, a.x, a.y, a.r || 0], ...Object.entries(a.f).map(([k, v]) => [+k, ...v]).filter(k => k[0] > 0 && k[0] < frames)].sort((p, q) => p[0] - q[0]);
  let i = keys.length - 1;
  while (keys[i][0] > frame) i--;
  const from = keys[i], to = keys[i + 1] || [frames, a.x, a.y, a.r || 0];
  const t = (frame - from[0]) / (to[0] - from[0]);
  return { ...a, x: from[1] + (to[1] - from[1]) * t, y: from[2] + (to[2] - from[2]) * t, r: from[3] + (to[3] - from[3]) * t };
}
const scarLevel = n => (n >= SCARS.deep ? 2 : n >= SCARS.marked ? 1 : 0);

// scarBy: who gave each part its worst (a dinosaur's own), so its scar looks like that blow
// wounds: its open wounds (journey.js woundsOf): red, the deep scar while they gape, the marked one as
// they close (or, sewn up in the hospital, the stitches all along); once closed, the scar it has there
// sewn: the parts whose last wound was sewn up in the hospital, so their scars are its neat ones
// seed: the dinosaur's own (its id), so its scars fall where they fall on it alone (SPREAD)
export function dressedArt(type, px, sex = 'f', equip = null, outfit = null, stage = 'baby', scars = null, scarBy = null, wounds = null, sewn = null, seed = null, blind = null) {
  const look = outfit && OUTFITS[outfit] && OUTFITS[outfit].species === type ? OUTFITS[outfit] : null;
  const st = STAGES.find(x => x.id === stage) || STAGES[0];
  const own = stage === 'adult' ? adultSpriteUrl(type, sex) : stage === 'juvenile' ? juvenileSpriteUrl(type, sex) : null;
  const size = look ? 1 : !own ? (BABY_SCALE[type] || 1)
    : stage === 'adult' ? adultScale(type, sex) : ((JUVENILE_SCALE[type] || {})[sex] || 1);
  const src = look ? asset(look.sprites[sex]) : own || (SPRITES[type] && SPRITES[type][sex]);
  const sheet = src && SHEETS[src.slice(ROOT.length)];
  const open = pt => (wounds && wounds.parts && wounds.parts[pt]) || 0;
  // (a deep wound gapes, then closes into its deep scar; a light one is a scratch all through; a wound
  // from before depths were kept is deep while it gapes)
  const deepWound = pt => (wounds && Array.isArray(wounds.deep) ? wounds.deep.includes(pt) : open(pt) > 0.5);
  // (each scar placed on the part: [its place's key, how it looks])
  const scarred = look ? [] : SCARS.parts.map(pt => [pt, scarLevel((scars && scars[pt]) || 0)]).filter(([pt, l]) => l || open(pt))
    .flatMap(([pt, l]) => scarPlaces(type, sex, pt, stage).map(key => [key, open(pt) ? scarMark(styleBy(wounds.by || (scarBy && scarBy[pt])), deepWound(pt) ? 2 : 1, open(pt), !!wounds.stitched, skinAt(type, sex, key, stage), open(pt) <= 0.5, pt)
      : scarMark(styleBy(scarBy && scarBy[pt]), l, 0, !!(sewn && sewn.includes(pt)), skinAt(type, sex, key, stage), false, pt)]));
  // (one that lost an eye: its first head scar is the one across it, on that side)
  const tookEye = blind && scarred.length ? (scarred.find(([key]) => key.split('~')[0] === 'head') || [])[0] : null;
  // a scarred animated sprite is drawn frame by frame, its scars following the body
  const wearing = !look && Object.entries(equip || {}).some(([slot, id]) => DRAWN_SLOTS.includes(slot) && ITEM_ICONS[id] && !(FITTED[id] && FITTED[id][type] && FITTED[id][type][sex]));
  // (a walker with its own walk draws it from its sheet too, when it has one, or keeps its picture)
  const walk = stage === 'adult' && adultWalk(type, sex);
  const base = sheet && (scarred.length || (wearing && (!walk || sheetFor(walk.src))))
    ? sheetArt(sheet, px * st.scale * size, babyLabel(type, sex), scarred.map(([part, mark]) => [scarPlace(type, sex, part, stage, mark), mark, part, scarAnchor(type, sex, part, stage), part === tookEye ? blind : sideOf(seed, part), part === tookEye]).filter(([a]) => a), src, seed)
    : babyArt(type, px * st.scale * size, sex, false, look ? asset(look.sprites[sex]) : own);
  if (base.sheet) base.eye = ownScars(type, sex, stage).eye || null;
  // an outfit is a complete drawing, so accessories are only drawn on the baby's own sprite
  const worn = look ? [] : Object.entries(equip || {}).filter(([slot, id]) => DRAWN_SLOTS.includes(slot) && ITEM_ICONS[id]);
  if (!worn.length && !scarred.length) return base;
  const box = document.createElement('span');
  box.className = 'dino-art';
  base.classList.add('dino-base');
  box.appendChild(base);
  // (scars on the skin, under whatever it wears; on a sheet they are drawn in it)
  if (base.tagName !== 'CANVAS' || !base.sheet) for (const [part, mark] of scarred) {
    const a = spread(scarPlace(type, sex, part, stage, mark), scarAnchor(type, sex, part, stage), seed, part, null);
    if (!a) continue;
    const layer = document.createElement('span');
    layer.className = `scar-layer scar-${mark.level || 'art'}`;
    layer.dataset.part = part;
    if (seed != null) { layer.dataset.side = part === tookEye ? blind : sideOf(seed, part); layer.hidden = layer.dataset.side !== 'left'; }
    Object.assign(layer.style, { left: (a.x * 100) + '%', top: (a.y * 100) + '%', width: (a.w * (mark.level ? 1 : mark.scale) * 100) + '%', transform: `translate(-50%, -50%) rotate(${a.r || 0}deg)` });
    if (mark.level) layer.innerHTML = scarSVG(mark.level);
    else if (mark.tint || mark.skin) layer.appendChild(tintedCanvas(mark));
    else layer.appendChild(pictureOf(mark.src));
    box.appendChild(layer);
  }
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
      if (base.sheet) (base.followers = base.followers || []).push([layer, a]);
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

// Animated sprites drawn from their sheet (js/sheets.js), frame by frame, every one on the same clock;
// the scars are drawn on the skin only, so none ever hangs in the air as a tail swings out under it
const ROOT = asset('');
const sheetImages = {}, scarImages = {};
const imageOf = (cache, key, src) => cache[key] || (cache[key] = Object.assign(new Image(), { src }));
// (as .scar-layer draws them, but inside one picture)
const scarImage = mark => imageOf(scarImages, mark.key, mark.src);
// An open wound: the scar's flesh dark crimson (its pale ridges a little lighter, its ink kept), as much
// as the wound is open; made once per scar and shade
const tinted = {};
const SCAR_SHADE = 0.72;   // how much darker a scar is than the skin around it
// how much a scar's own light and shade (its picture's) is made stronger, so its texture shows through the skin's colour
const RELIEF_CONTRAST = 2;
// and duller: scar tissue loses some of the bright colours of the skin (not all their cells come back in
// it) and keeps the dark pigment, so it goes browner: DULL of the colour lost, BROWN of that dark brown;
// enough kept that a scar across a red face and a green neck still shows each under it
const SCAR_DULL = 0.4, SCAR_BROWN = 0.15, SCAR_PIGMENT = [107, 85, 68];
// how finely the skin under a scar is taken (the drawing there at a SKIN_FINE-th of its size: its scales
// smoothed, its colours kept), and how dark a pixel of it is to be one of its lines, left out
const SKIN_FINE = 4, SKIN_INK = 60, SCAR_SOLID = 90;
// The skin under a scar as a few flat colours: its pixels grouped by colour (up to SKIN_COLOURS groups,
// any two nearer than SKIN_MERGE apart one, any of fewer than SKIN_FEW of them given to the nearest
// other), their borders evened (SKIN_EVEN passes), each pixel then its group's colour
const SKIN_COLOURS = 4, SKIN_MERGE = 48, SKIN_FEW = 0.04, SKIN_EVEN = 3;
function flatten(px, w) {
  const idx = [];
  for (let j = 0; j < px.length; j += 4) if (px[j + 3] > 0) idx.push(j);
  if (!idx.length) return;
  const dist = (j, c) => (px[j] - c[0]) ** 2 + (px[j + 1] - c[1]) ** 2 + (px[j + 2] - c[2]) ** 2;
  // (seeds far apart: the first pixel, then each the one farthest from those so far)
  let cs = [[px[idx[0]], px[idx[0] + 1], px[idx[0] + 2]]];
  while (cs.length < SKIN_COLOURS) {
    let far = -1, at = 0;
    for (const j of idx) { const d = Math.min(...cs.map(c => dist(j, c))); if (d > far) { far = d; at = j; } }
    if (far < SKIN_MERGE * SKIN_MERGE) break;
    cs.push([px[at], px[at + 1], px[at + 2]]);
  }
  const group = new Int8Array(px.length / 4);
  const assign = () => { for (const j of idx) { let b = 0, bd = Infinity; cs.forEach((c, i) => { const d = dist(j, c); if (d < bd) { bd = d; b = i; } }); group[j / 4] = b; } };
  const mean = () => {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const j of idx) { const t = sum[group[j / 4]]; t[0] += px[j]; t[1] += px[j + 1]; t[2] += px[j + 2]; t[3]++; }
    return sum;
  };
  for (let it = 0; it < 6; it++) { assign(); cs = mean().map((t, i) => (t[3] ? [t[0] / t[3], t[1] / t[3], t[2] / t[3]] : cs[i])); }
  // (near ones as one, and the few left to the nearest)
  for (let merged = true; merged;) {
    merged = false;
    const n = mean();
    outer: for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const d = Math.sqrt((cs[a][0] - cs[b][0]) ** 2 + (cs[a][1] - cs[b][1]) ** 2 + (cs[a][2] - cs[b][2]) ** 2);
      if (d < SKIN_MERGE || n[a][3] < idx.length * SKIN_FEW || n[b][3] < idx.length * SKIN_FEW) {
        const keep = n[a][3] >= n[b][3] ? a : b;
        cs.splice(keep === a ? b : a, 1); assign(); cs = mean().map((t, i) => (t[3] ? [t[0] / t[3], t[1] / t[3], t[2] / t[3]] : cs[i]));
        merged = cs.length > 1; break outer;
      }
    }
  }
  assign();
  // (the borders between them evened: each pixel the group most of its neighbours are in, twice)
  for (let pass = 0; pass < SKIN_EVEN; pass++) {
    const next = group.slice();
    for (const j of idx) {
      const i = j / 4, x = i % w, y = (i - x) / w, votes = new Array(cs.length).fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, o = yy * w + xx;
        if (xx < 0 || yy < 0 || xx >= w || yy * w >= group.length || !px[o * 4 + 3]) continue;
        votes[group[o]]++;
      }
      next[i] = votes.indexOf(Math.max(...votes));
    }
    group.set(next);
  }
  for (const j of idx) { const c = cs[group[j / 4]]; px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; }
}
const dullen = rgb => {
  const lum = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2], grey = rgb.map(v => v + (lum - v) * SCAR_DULL);
  const pl = (0.3 * SCAR_PIGMENT[0] + 0.59 * SCAR_PIGMENT[1] + 0.11 * SCAR_PIGMENT[2]) / 255;
  return grey.map((v, i) => v * (1 - SCAR_BROWN) + SCAR_PIGMENT[i] / 255 / pl * lum * SCAR_BROWN);
};
function tintOf(mark) {
  const key = mark.key + '|' + mark.tint + '|' + (mark.skin || '');
  if (tinted[key]) return tinted[key];
  const img = scarImage(mark);
  if (!img.complete || !img.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data, t = mark.tint;
    // (a scar is the skin around it, darker (SCAR_SHADE), painted as the crimson is; a wound heals from
    // crimson into it)
    const skin = mark.skin && dullen([1, 3, 5].map(i => parseInt(mark.skin.slice(i, i + 2), 16) / 255 * SCAR_SHADE));
    // (the skin's colour is the drawing's middle tone: its shadows darker, its highlights lighter)
    let mean = 0, n = 0;
    if (skin) for (let i = 0; i < px.length; i += 4) {
      const lum = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
      if (px[i + 3] > 128 && lum >= 0.25) { mean += lum; n++; }
    }
    mean = n ? mean / n : 0.6;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255, lum = 0.3 * r + 0.59 * gr + 0.11 * b;
      if (lum < 0.25) continue;
      const k = 0.55 + lum * 0.75, ridge = lum > 0.8;
      const red = [Math.min(1, 0.62 * k + (ridge ? 0.25 : 0)), Math.min(1, 0.07 * k + (ridge ? 0.12 : 0)), Math.min(1, 0.08 * k + (ridge ? 0.1 : 0))];
      const from = skin ? skin.map(v => Math.min(1, v * lum / mean)) : [r, gr, b];
      px[i] = (from[0] * (1 - t) + red[0] * t) * 255; px[i + 1] = (from[1] * (1 - t) + red[1] * t) * 255; px[i + 2] = (from[2] * (1 - t) + red[2] * t) * 255;
    }
    g.putImageData(d, 0, 0);
  } catch (e) { /* a picture that can't be read stays as it is */ }
  return (tinted[key] = c);
}
// A scar in the colours of the skin under it, pixel by pixel: the drawing there blurred (its outlines
// and scales smoothed away), times the scar's relief (its light and shade, darker by SCAR_SHADE, its
// ink kept), then the crimson of a wound over it as much as it is open. Made on the frame being drawn,
// in its own pixels (k a sheet pixel's size), as a square piece to lay over it.
const reliefs = {};
function reliefOf(mark) {
  if (reliefs[mark.key]) return reliefs[mark.key];
  const img = scarImage(mark);
  if (!img.complete || !img.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    let mean = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
      if (px[i + 3] > 128 && lum >= 0.25) { mean += lum; n++; }
    }
    mean = n ? mean / n : 0.6;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const lum = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
      if (lum < 0.25) continue;
      px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, (1 + (lum / mean - 1) * RELIEF_CONTRAST) * SCAR_SHADE * 255));
    }
    g.putImageData(d, 0, 0);
  } catch (e) { return null; }
  c.dataset.key = mark.key;
  return (reliefs[mark.key] = c);
}
const work = { small: null };
// The eye, where it is on each drawing (SCAR_ANCHORS[type][stage][sex].eye: { x, y, r }, r a share of
// its width, h and a its flattening and tilt, set in tools/anchors.html): no scar is drawn over it. A dinosaur drawn blind in one eye (b.blind, a skin to come)
// has its first head scar moved across it, and the eye milky white as a scarred cornea
const onEye = (place, eye) => {
  const dx = eye.x - place.x, dy = eye.y - place.y;
  const f = place.f && Object.fromEntries(Object.entries(place.f).map(([k, [x, y, r]]) => [k, [x + dx, y + dy, r]]));
  return { ...place, x: eye.x, y: eye.y, ...(f ? { f } : {}) };
};
// (the blind eye itself, painted: sprites/scars/eye-blind.webp, clouded over the eye's circle; false
// until it has loaded)
const BLIND_EYE = 'sprites/scars/eye-blind.webp';
// (an eye is an oval: h its height as a share of its width, a its tilt in degrees; round if unset)
const eyeFlat = eye => (eye.h > 0 ? eye.h : 1);
// Where the eye is on each frame of an animated drawing, found in the frames themselves: the eye and
// the skin round it on the first frame, matched in each frame near where it was (the closest likeness,
// to a fraction of a pixel), so a lost eye stays on the eye exactly as the drawing moves it. How the head
// turns is found the same way on more of it round the eye (an eye alone is too round to tell), and
// evened over the frames next to each. A frame where nothing near looks like the eye (shut in a blink)
// has none (EYE_SHUT: how unlike, as a share of how much the eye's own look varies). Per frame [dx, dy]
// in the sheet's pixels and the turn in degrees (NaN while shut), worked out once a sheet and eye; null
// until its picture has loaded.
const EYE_TURN = 12, EYE_SHUT = 0.6;
const eyeTracks = new Map();
export function eyeTrack(s, eye) {
  const key = [s.sheet, eye.x, eye.y, eye.r].join('|');
  if (eyeTracks.has(key)) return eyeTracks.get(key);
  const img = imageOf(sheetImages, s.sheet, asset(s.sheet));
  if (!img.complete || !img.naturalWidth) return null;
  const T = Math.max(5, Math.ceil(eye.r * s.w * 1.6)), S = Math.max(10, Math.ceil(eye.r * s.w * 2.5)), H = T * 3;
  const M = Math.ceil(H * 1.42) + S + 2, N = 2 * M + 1;
  const cx = Math.round(eye.x * s.w), cy = Math.round(eye.y * s.h);
  const c = document.createElement('canvas'); c.width = N; c.height = N * s.frames;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let f = 0; f < s.frames; f++) g.drawImage(img, (f % s.cols) * s.w + cx - M, Math.floor(f / s.cols) * s.h + cy - M, N, N, 0, f * N, N, N);
  let d;
  try { d = g.getImageData(0, 0, N, N * s.frames).data; } catch (e) { return null; }
  const lum = new Float32Array(N * N * s.frames);
  for (let i = 0; i < lum.length; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) * d[i * 4 + 3] / 255;
  // (a frame's look at a point, between pixels)
  const at = (f, x, y) => {
    x = Math.max(0, Math.min(N - 1.001, x)); y = Math.max(0, Math.min(N - 1.001, y));
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, o = f * N * N;
    return (lum[o + j * N + i] * (1 - u) + lum[o + j * N + i + 1] * u) * (1 - v) + (lum[o + (j + 1) * N + i] * (1 - u) + lum[o + (j + 1) * N + i + 1] * u) * v;
  };
  // (the first frame's look: the eye, and more of the head round it, every other pixel)
  const patch = (rad, by) => {
    const p = [];
    for (let y = -rad; y <= rad; y += by) for (let x = -rad; x <= rad; x += by) if (x * x + y * y <= rad * rad) p.push([x, y, lum[(M + y) * N + M + x]]);
    return p;
  };
  const eyeLook = patch(T, 1), headLook = patch(H, 2);
  const mean = eyeLook.reduce((t, p) => t + p[2], 0) / eyeLook.length, spread = eyeLook.reduce((t, p) => t + (p[2] - mean) ** 2, 0) || 1;
  const unlike = (look, f, ox, oy, deg) => {
    const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    let e = 0;
    for (const [x, y, v] of look) { const w = at(f, M + ox + x * cos - y * sin, M + oy + x * sin + y * cos) - v; e += w * w; }
    return e;
  };
  const low = (m, o, p) => { const den = m - 2 * o + p; return den > 0 ? Math.max(-0.5, Math.min(0.5, (m - p) / (2 * den))) : 0; };
  const out = new Float32Array(s.frames * 3), turns = new Float32Array(s.frames), shut = new Uint8Array(s.frames);
  let turn = 0;
  for (let f = 1; f < s.frames; f++) {
    // the head's turn, near the last frame's (on the eye's place in the last frame, roughly)
    const px = Math.round(out[(f - 1) * 3]) || 0, py = Math.round(out[(f - 1) * 3 + 1]) || 0;
    let hb = Infinity;
    for (let deg = Math.max(-EYE_TURN, turn - 4); deg <= Math.min(EYE_TURN, turn + 4); deg += 0.5) {
      const e = unlike(headLook, f, px, py, deg); if (e < hb) { hb = e; turns[f] = deg; }
    }
    turns[f] += 0.5 * low(unlike(headLook, f, px, py, turns[f] - 0.5), hb, unlike(headLook, f, px, py, turns[f] + 0.5));
    turn = turns[f];
    // the eye moved, so turned: every whole pixel near, then the fraction
    let best = Infinity, bx = 0, by = 0;
    for (let oy = -S; oy <= S; oy++) for (let ox = -S; ox <= S; ox++) { const e = unlike(eyeLook, f, ox, oy, turn); if (e < best) { best = e; bx = ox; by = oy; } }
    if (best / spread > EYE_SHUT) { shut[f] = 1; out[f * 3] = bx; out[f * 3 + 1] = by; continue; }
    out[f * 3] = bx + low(unlike(eyeLook, f, bx - 1, by, turn), best, unlike(eyeLook, f, bx + 1, by, turn));
    out[f * 3 + 1] = by + low(unlike(eyeLook, f, bx, by - 1, turn), best, unlike(eyeLook, f, bx, by + 1, turn));
  }
  // (the turn evened a little with the frames either side, as the drawing loops; the first frame is the
  // eye as set)
  for (let f = 0; f < s.frames; f++) {
    out[f * 3 + 2] = f ? (turns[(f + s.frames - 1) % s.frames] + 2 * turns[f] + turns[(f + 1) % s.frames]) / 4 : 0;
    if (shut[f]) out[f * 3] = out[f * 3 + 1] = out[f * 3 + 2] = NaN;
  }
  if (eyeTracks.size > 50) eyeTracks.clear();
  eyeTracks.set(key, out);
  return out;
}
function blindEye(ctx, eye, s, disp, turn = 0) {
  if (!eye) return true;
  const img = imageOf(scarImages, BLIND_EYE, asset(BLIND_EYE));
  if (!img.complete || !img.naturalWidth) return false;
  const [dx, dy] = disp(eye.x * s.w, eye.y * s.h), x = eye.x * s.w + dx, y = eye.y * s.h + dy, r = eye.r * s.w;
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  ctx.translate(x, y); ctx.rotate(((eye.a || 0) + turn) * Math.PI / 180); ctx.scale(1, eyeFlat(eye));
  // (a little over the eye's ring, so its soft edge falls past the coloured part, all of it clouded)
  ctx.drawImage(img, -r * 1.1, -r * 1.1, r * 2.2, r * 2.2);
  ctx.restore();
  return true;
}
// The drawing's own outlines over a scar: where an ink line of the sprite crosses it (a leg against the
// belly, the rim of an eye, a fold), the line stays as it is and the scar stops a little short of it and
// takes up again a little past it, the skin beside the line untouched (LINE_GAP, in the sprite's pixels,
// the last LINE_SOFT of it fading in), as if the fold hid it: the drawing keeps its relief, the scar is in
// it, not stuck on top. Only the long lines (LINE_LONG): the little outlines of scales are covered. A scar told to stay (place.stay) keeps to the part of the drawing its middle is on,
// those lines its edge. Worked out once for a place, on the first frame, as a mask over the scar's square
// (it moves with the skin as the scar does).
const LINE_GAP = 0.96, LINE_SOFT = 0.8, LINE_LONG = 0.18;
// how dark a pixel of the drawing is to be an outline (its stripes and scales are lighter), and how
// little colour it has: an outline is near black, the dark lines of a coloured crest's pattern are not
const INK = 0.13, INK_HUE = 45;
const linesCache = {};
function linesOf(s, place, mark) {
  const key = [s.sheet, place.x, place.y, place.w, place.r || 0, place.stay ? 1 : 0, mark.scale].join('|');
  if (linesCache[key]) return linesCache[key];
  const img = imageOf(sheetImages, s.sheet, asset(s.sheet));
  if (!img.complete || !img.naturalWidth) return null;
  const M = 192, size = place.w * s.w * mark.scale, c = document.createElement('canvas');
  c.width = M; c.height = M;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.translate(M / 2, M / 2); g.rotate(-(place.r || 0) * Math.PI / 180); g.scale(M / size, M / size);
  g.translate(-place.x * s.w, -place.y * s.h);
  g.drawImage(img, 0, 0, s.w, s.h, 0, 0, s.w, s.h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  try {
    const d = g.getImageData(0, 0, M, M), px = d.data, ink = new Uint8Array(M * M), skin = new Uint8Array(M * M);
    for (let i = 0; i < M * M; i++) {
      const k = i * 4, lum = (0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2]) / 255;
      const hue = Math.max(px[k], px[k + 1], px[k + 2]) - Math.min(px[k], px[k + 1], px[k + 2]);
      if (px[k + 3] > 200 && lum < INK && hue < INK_HUE) ink[i] = 1; else if (px[k + 3] > 200) skin[i] = 1;   // (not the soft rim of the drawing: nothing painted past its edge)
    }
    // (only the drawing's long lines count, its folds and edges: the little outlines of its scales are
    // covered, a scar has none; a line is one at least LINE_LONG of the scar's width end to end)
    const line = new Uint8Array(M * M), seen = new Uint8Array(M * M);
    for (let i0 = 0; i0 < M * M; i0++) {
      if (!ink[i0] || seen[i0]) continue;
      const part = [i0], todo = [i0];
      seen[i0] = 1;
      let x0 = M, x1 = 0, y0 = M, y1 = 0;
      while (todo.length) {
        const i = todo.pop(), x = i % M, y = (i - x) / M;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy, j = yy * M + xx;
          if (xx < 0 || yy < 0 || xx >= M || yy >= M || seen[j] || !ink[j]) continue;
          seen[j] = 1; part.push(j); todo.push(j);
        }
      }
      if (Math.max(x1 - x0, y1 - y0) >= LINE_LONG * M) for (const i of part) line[i] = 1;
    }
    let keep = skin;
    if (!place.stay) { keep = new Uint8Array(M * M); for (let i = 0; i < M * M; i++) keep[i] = skin[i] || (ink[i] && !line[i]) ? 1 : 0; }
    if (place.stay) {
      // the part its middle is on: skin reached from there without crossing an outline (thickened a
      // pixel, so a hairline gap doesn't let it through)
      const wall = new Uint8Array(M * M);
      for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) if (ink[y * M + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < M && yy < M) wall[yy * M + xx] = 1;
      }
      let seed = -1;
      for (let r = 0; r < M / 4 && seed < 0; r++) for (let dy = -r; dy <= r && seed < 0; dy++) for (let dx = -r; dx <= r && seed < 0; dx++) {
        const i = (M / 2 + dy) * M + M / 2 + dx; if (skin[i] && !wall[i]) seed = i;
      }
      keep = new Uint8Array(M * M);
      if (seed >= 0) {
        const todo = [seed]; keep[seed] = 1;
        while (todo.length) {
          const i = todo.pop(), x = i % M, y = (i - x) / M;
          for (const j of [x > 0 ? i - 1 : -1, x < M - 1 ? i + 1 : -1, y > 0 ? i - M : -1, y < M - 1 ? i + M : -1]) if (j >= 0 && !keep[j] && skin[j] && !wall[j]) { keep[j] = 1; todo.push(j); }
        }
        // (and back out to the outline it stopped at, so it meets the line)
        const grown = keep.slice();
        for (let i = 0; i < M * M; i++) if (keep[i]) for (const j of [i - 1, i + 1, i - M, i + M]) if (j >= 0 && j < M * M && skin[j]) grown[j] = 1;
        keep = grown;
      }
    }
    // (how far each pixel is from a line, in the mask's pixels: a two-pass chamfer)
    const far = new Float32Array(M * M), BIG = 1e6;
    for (let i = 0; i < M * M; i++) far[i] = line[i] ? 0 : BIG;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const i = y * M + x;
      if (!far[i]) continue;
      far[i] = Math.min(far[i], x ? far[i - 1] + 1 : BIG, y ? far[i - M] + 1 : BIG, x && y ? far[i - M - 1] + 1.414 : BIG, y && x < M - 1 ? far[i - M + 1] + 1.414 : BIG);
    }
    for (let y = M - 1; y >= 0; y--) for (let x = M - 1; x >= 0; x--) {
      const i = y * M + x;
      if (!far[i]) continue;
      far[i] = Math.min(far[i], x < M - 1 ? far[i + 1] + 1 : BIG, y < M - 1 ? far[i + M] + 1 : BIG, x < M - 1 && y < M - 1 ? far[i + M + 1] + 1.414 : BIG, y < M - 1 && x ? far[i + M - 1] + 1.414 : BIG);
    }
    // (the gap and its soft end, from the sprite's pixels to the mask's)
    const per = M / size, gap = LINE_GAP * per, soft = Math.max(0.5, LINE_SOFT * per);
    for (let i = 0; i < M * M; i++) {
      const k = i * 4, t = Math.max(0, Math.min(1, (far[i] - gap) / soft));
      px[k] = px[k + 1] = px[k + 2] = 255; px[k + 3] = keep[i] ? Math.round(255 * t * t * (3 - 2 * t)) : 0;
    }
    g.putImageData(d, 0, 0);
  } catch (e) { return null; }
  return (linesCache[key] = c);
}
// A deep wound that closed on its own fills in from its edges: the new skin there brings the dark
// pigment of the skin around, the middle, last to close, is pale and pinkish grey. Its middle as a
// pale veil, the stronger the farther from the scar's edge (MIDDLE: how pale, and how far in it is
// palest, as a share of the picture), never over its ink: the skin under it paled (pale of the way to
// white, dull of its colour lost), so a red face's scar is pale red and a green neck's pale green.
const MIDDLE = { colour: [206, 186, 176], alpha: 1, depth: 0.05, pale: 0.35, dull: 0, relief: 1 };
// A deep wound sewn up in the hospital heals into a neat line paler than the skin around, all of it the
// skin under it paled (pale of the way to white), its relief laid back over by relief to keep its shape
const SURGICAL = { pale: 0.45, relief: 1 };
const middles = {};
function middleOf(mark) {
  if (middles[mark.key]) return middles[mark.key];
  const img = scarImage(mark);
  if (!img.complete || !img.naturalWidth) return null;
  const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  try {
    const d = g.getImageData(0, 0, W, H), px = d.data, far = new Float32Array(W * H), BIG = 1e6;
    // how far each pixel of the scar is from its edge (a two-pass chamfer)
    for (let i = 0; i < W * H; i++) far[i] = px[i * 4 + 3] > 128 ? BIG : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!far[i]) continue;
      far[i] = Math.min(far[i], x ? far[i - 1] + 1 : 0, y ? far[i - W] + 1 : 0, x && y ? far[i - W - 1] + 1.414 : 0, y && x < W - 1 ? far[i - W + 1] + 1.414 : 0);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!far[i]) continue;
      far[i] = Math.min(far[i], x < W - 1 ? far[i + 1] + 1 : 0, y < H - 1 ? far[i + W] + 1 : 0, x < W - 1 && y < H - 1 ? far[i + W + 1] + 1.414 : 0, y < H - 1 && x ? far[i + W - 1] + 1.414 : 0);
    }
    const deep = MIDDLE.depth * W;
    for (let i = 0; i < W * H; i++) {
      const k = i * 4, lum = (0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2]) / 255;
      const t = Math.min(1, far[i] / deep), v = t * t * (3 - 2 * t);
      px[k] = MIDDLE.colour[0]; px[k + 1] = MIDDLE.colour[1]; px[k + 2] = MIDDLE.colour[2];
      px[k + 3] = lum < 0.25 ? 0 : px[k + 3] * v * MIDDLE.alpha;
    }
    g.putImageData(d, 0, 0);
  } catch (e) { return null; }
  return (middles[mark.key] = c);
}
function onSkin(cv, place, mark, k) {
  const s = cv.home || cv.sheet, relief = reliefOf(mark);
  if (!relief || !mark.skin) return null;
  const crimson = mark.tint ? tintOf({ key: mark.key, src: mark.src, tint: 1 }) : null;
  if (mark.tint && !crimson) return null;
  const first = imageOf(sheetImages, s.sheet, asset(s.sheet));
  if (!first.complete || !first.naturalWidth) return null;
  const eye = cv.eye;
  const key = [place.x, place.y, place.w, place.r || 0, place.stay ? 1 : 0, mark.key, mark.tint, mark.skin, mark.rim ? 1 : 0, k, s.sheet, eye ? [eye.x, eye.y, eye.r].join(',') : ''].join('|');
  const kept = cv.made || (cv.made = new Map());
  if (kept.has(key)) return kept.get(key);
  const size = place.w * s.w * mark.scale, side = size * 1.42, x = place.x * s.w - side / 2, y = place.y * s.h - side / 2;
  const P = Math.max(2, Math.ceil(side * k)), q = Math.max(2, Math.round(P / SKIN_FINE));
  const piece = document.createElement('canvas');
  const small = work.small || (work.small = document.createElement('canvas'));
  piece.width = P; piece.height = P; small.width = q; small.height = q;
  const g = piece.getContext('2d'), sg = small.getContext('2d');
  // the skin under it on the first frame (the sheet's first), smoothed: drawn small and back
  sg.imageSmoothingQuality = 'high';
  sg.clearRect(0, 0, q, q);
  sg.drawImage(first, x, y, side, side, 0, 0, q, q);
  const sd = sg.getImageData(0, 0, q, q), spx = sd.data;
  // (the drawing's dark lines left out: each filled from the skin beside it, so they don't darken and
  // grey the colours they part)
  const inkAt = j => spx[j * 4 + 3] > 0 && (0.3 * spx[j * 4] + 0.59 * spx[j * 4 + 1] + 0.11 * spx[j * 4 + 2]) < SKIN_INK;
  let left = [];
  for (let j = 0; j < q * q; j++) if (inkAt(j)) left.push(j);
  const done = new Uint8Array(q * q).fill(1);
  for (const j of left) done[j] = 0;
  for (let pass = 0; pass < 6 && left.length; pass++) {
    const fill = [];
    for (const j of left) {
      const x = j % q, y = (j - x) / q;
      let r = 0, g2 = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const xx = x + dx, yy = y + dy, o = yy * q + xx;
        if (xx < 0 || yy < 0 || xx >= q || yy >= q || !done[o] || !spx[o * 4 + 3]) continue;
        r += spx[o * 4]; g2 += spx[o * 4 + 1]; b += spx[o * 4 + 2]; n++;
      }
      if (n) fill.push([j, r / n, g2 / n, b / n]);
    }
    for (const [j, r, g2, b] of fill) { spx[j * 4] = r; spx[j * 4 + 1] = g2; spx[j * 4 + 2] = b; done[j] = 1; }
    left = left.filter(j => !done[j]);
  }
  // (painted, not copied: the skin under it in a few flat colours, one for each colour it crosses (a red
  // face, a green neck, a cream jaw), so the scar is solid paint in each, its shading its own)
  flatten(spx, q);
  // (dulled as scar tissue is: some of the bright colours gone, browner)
  for (let j = 0; j < spx.length; j += 4) {
    const c = dullen([spx[j] / 255, spx[j + 1] / 255, spx[j + 2] / 255]);
    spx[j] = c[0] * 255; spx[j + 1] = c[1] * 255; spx[j + 2] = c[2] * 255;
  }
  sg.putImageData(sd, 0, 0);
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, q, q, 0, 0, P, P);
  const lay = (img, op, alpha = 1) => {
    g.save();
    g.globalCompositeOperation = op; g.globalAlpha = alpha;
    g.translate(P / 2, P / 2); g.rotate((place.r || 0) * Math.PI / 180);
    g.drawImage(img, -size * k / 2, -size * k / 2, size * k, size * k);
    g.restore();
  };
  lay(relief, 'multiply');
  lay(relief, 'destination-in');
  const lines = linesOf(s, place, mark);
  if (lines) lay(lines, 'destination-in');
  const middle = mark.rim && middleOf(mark);
  // (the middle the skin under it paled, its own colour kept: MIDDLE.pale of the way to white, and
  // less of its colour, laid where the middle is; a surgical scar all of it, SURGICAL.pale, its own
  // relief laid back over a little, SURGICAL.relief, so it keeps its shape)
  const veil = middle || (mark.pale ? relief : null), paleBy = middle ? MIDDLE.pale : SURGICAL.pale;
  if (veil) {
    const pale = document.createElement('canvas'); pale.width = P; pale.height = P;
    const pg = pale.getContext('2d');
    pg.drawImage(small, 0, 0, q, q, 0, 0, P, P);
    const pd = pg.getImageData(0, 0, P, P), ppx = pd.data;
    for (let j = 0; j < ppx.length; j += 4) {
      const lum = 0.3 * ppx[j] + 0.59 * ppx[j + 1] + 0.11 * ppx[j + 2];
      for (let c = 0; c < 3; c++) { const v = ppx[j + c] + (lum - ppx[j + c]) * MIDDLE.dull; ppx[j + c] = v + (255 - v) * paleBy; }
    }
    pg.putImageData(pd, 0, 0);
    pg.translate(P / 2, P / 2); pg.rotate((place.r || 0) * Math.PI / 180);
    // (its own relief over the paled skin too, so its texture shows inside it)
    pg.globalCompositeOperation = 'multiply'; pg.globalAlpha = middle ? MIDDLE.relief : SURGICAL.relief; pg.drawImage(relief, -size * k / 2, -size * k / 2, size * k, size * k); pg.globalAlpha = 1;
    pg.globalCompositeOperation = 'destination-in';
    pg.drawImage(veil, -size * k / 2, -size * k / 2, size * k, size * k);
    g.save(); g.globalCompositeOperation = 'source-atop'; g.drawImage(pale, 0, 0); g.restore();
  }
  if (crimson) lay(crimson, 'source-atop', mark.tint);
  // (painted on, not a veil: solid wherever the scar is, only its very edge soft, so the scales and
  // pattern of the skin don't show through what has none; SCAR_SOLID: the art's alpha from where it is
  // solid)
  const od = g.getImageData(0, 0, P, P), opx = od.data;
  for (let j = 3; j < opx.length; j += 4) opx[j] = opx[j] >= SCAR_SOLID ? 255 : opx[j] * 255 / SCAR_SOLID;
  g.putImageData(od, 0, 0);
  // (never over the eye: cut round it)
  if (eye) {
    const ex = eye.x * s.w, ey = eye.y * s.h, er = eye.r * s.w;
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse((ex - x) * k, (ey - y) * k, er * k * 1.08, er * eyeFlat(eye) * k * 1.08, (eye.a || 0) * Math.PI / 180, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const made = { canvas: piece, x, y, side, halo: haloPiece(first, place, mark, k, size, s) };
  if (kept.size > 40) kept.clear();
  kept.set(key, made);
  return made;
}
// The skin around a fresh wound, reddened: a soft glow about it, laid on the skin by multiplying, so it
// shows pink on pale skin and next to nothing on dark (as on a reptile's thick, pigmented hide), and
// only while the wound is fresh (HALO.from: how open it still is when it starts showing)
const HALO = { reach: 2, colour: [255, 90, 80], from: 0.45, strength: 1 };
const halos = {};
function haloOf(mark) {
  if (halos[mark.key]) return halos[mark.key];
  const img = scarImage(mark);
  if (!img.complete || !img.naturalWidth) return null;
  const M = 256, c = document.createElement('canvas'), t = document.createElement('canvas'), n = 20;
  c.width = M; c.height = M; t.width = n; t.height = n;
  const g = c.getContext('2d'), tg = t.getContext('2d');
  // (its shape, much blurred: drawn tiny and back)
  tg.drawImage(img, (n - n / HALO.reach) / 2, (n - n / HALO.reach) / 2, n / HALO.reach, n / HALO.reach);
  g.imageSmoothingQuality = 'high';
  g.drawImage(t, 0, 0, n, n, 0, 0, M, M);
  try {
    const d = g.getImageData(0, 0, M, M), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = HALO.colour[0]; px[i + 1] = HALO.colour[1]; px[i + 2] = HALO.colour[2];
      px[i + 3] = Math.min(255, px[i + 3] * 1.6);
    }
    g.putImageData(d, 0, 0);
  } catch (e) { return null; }
  return (halos[mark.key] = c);
}
function haloPiece(first, place, mark, k, size, s) {
  const t = mark.tint || 0, glow = Math.min(1, Math.max(0, (t - HALO.from) / (1 - HALO.from)));
  const img = glow > 0 && haloOf(mark);
  if (!img) return null;
  const side = size * HALO.reach * 1.42, x = place.x * s.w - side / 2, y = place.y * s.h - side / 2;
  const P = Math.max(2, Math.ceil(side * k)), h = document.createElement('canvas');
  h.width = P; h.height = P;
  const g = h.getContext('2d');
  g.drawImage(first, x, y, side, side, 0, 0, P, P);
  const lay = op => {
    g.save();
    g.globalCompositeOperation = op;
    g.translate(P / 2, P / 2); g.rotate((place.r || 0) * Math.PI / 180);
    const w = size * HALO.reach * k;
    g.drawImage(img, -w / 2, -w / 2, w, w);
    g.restore();
  };
  lay('multiply');
  lay('destination-in');
  return { canvas: h, x, y, side, alpha: glow * HALO.strength };
}
// A piece made on the first frame, laid on a later one bent as the skin under it has moved: cut into a
// mesh of triangles, each corner moved as the skin there (disp, in sheet pixels); in one go where it all
// moved alike. The triangles are a hair larger, so no seam shows between them.
const MESH = 6;
function laySkin(ctx, piece, disp, k) {
  const { canvas: img, x, y, side } = piece, n = MESH, at = [];
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const sx = x + side * i / n, sy = y + side * j / n, [dx, dy] = disp(sx, sy);
    at.push([sx, sy, sx + dx, sy + dy]);
    lo = Math.min(lo, dx, dy); hi = Math.max(hi, dx, dy);
  }
  if (hi - lo < 0.25) { const [dx, dy] = disp(x + side / 2, y + side / 2); ctx.drawImage(img, x + dx, y + dy, side, side); return; }
  const px = img.width / side, grow = 0.6 / k;
  const tri = (p, q, r) => {
    const cx = (p[2] + q[2] + r[2]) / 3, cy = (p[3] + q[3] + r[3]) / 3;
    const out = v => { const ex = v[2] - cx, ey = v[3] - cy, l = Math.hypot(ex, ey) || 1; return [v[2] + ex / l * grow, v[3] + ey / l * grow]; };
    const [a0, a1, a2] = [out(p), out(q), out(r)];
    const u = v => [(v[0] - x) * px, (v[1] - y) * px], [u0, u1, u2] = [u(p), u(q), u(r)];
    const den = (u1[0] - u0[0]) * (u2[1] - u0[1]) - (u2[0] - u0[0]) * (u1[1] - u0[1]);
    if (!den) return;
    const ma = ((q[2] - p[2]) * (u2[1] - u0[1]) - (r[2] - p[2]) * (u1[1] - u0[1])) / den;
    const mc = ((r[2] - p[2]) * (u1[0] - u0[0]) - (q[2] - p[2]) * (u2[0] - u0[0])) / den;
    const mb = ((q[3] - p[3]) * (u2[1] - u0[1]) - (r[3] - p[3]) * (u1[1] - u0[1])) / den;
    const md = ((r[3] - p[3]) * (u1[0] - u0[0]) - (q[3] - p[3]) * (u2[0] - u0[0])) / den;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...a1); ctx.lineTo(...a2); ctx.closePath(); ctx.clip();
    ctx.transform(ma, mb, mc, md, p[2] - ma * u0[0] - mc * u0[1], p[3] - mb * u0[0] - md * u0[1]);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = (a, b) => at[b * (n + 1) + a];
    tri(v(i, j), v(i + 1, j), v(i, j + 1));
    tri(v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
  }
}
const markImage = mark => (mark.tint || mark.skin ? tintOf(mark) : scarImage(mark));
const markReady = mark => { const m = markImage(mark); return !!m && (m.tagName === 'CANVAS' || (m.complete && m.naturalWidth > 0)); };
// (on a sprite drawn as it is, the wound is a canvas of its own, filled once its scar has loaded)
function tintedCanvas(mark) {
  const cv = document.createElement('canvas');
  const fill = () => {
    const t = tintOf(mark);
    if (!t) { scarImage(mark).addEventListener('load', fill, { once: true }); return; }
    cv.width = t.width; cv.height = t.height;
    cv.getContext('2d').drawImage(t, 0, 0);
  };
  fill();
  return cv;
}
const lineScar = level => ('data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="-10 -10 120 120"><filter id="s"><feDropShadow dx="0" dy="2.4" stdDeviation="0" flood-color="rgb(55,25,20)" flood-opacity=".6"/></filter><g fill="none" stroke="rgba(236,214,198,.78)" stroke-width="${level === 2 ? 4.4 : 3.6}" stroke-linecap="round" filter="url(#s)">${SCAR_MARK[level].replace('class="pits"', 'fill="rgba(60,30,25,.55)" stroke="none"')}</g></svg>`));
const drawing = new Set();
let ticking = false;
function tick(now) {
  for (const cv of drawing) {
    if (!cv.isConnected) { if (now - cv.born > 3000) drawing.delete(cv); continue; }
    const s = cv.sheet, frame = cv.hold != null ? cv.hold : Math.floor(now / s.ms) % s.frames;
    if (frame !== cv.drawn || cv.dirty) drawFrame(cv, frame);
  }
  ticking = drawing.size > 0;
  if (ticking) requestAnimationFrame(tick);
}
const SHARP = 1;
export function drawFrame(cv, frame) {
  const s = cv.sheet, img = imageOf(sheetImages, s.sheet, asset(s.sheet));
  if (!img.complete || !img.naturalWidth) return;
  const ctx = cv.getContext('2d');
  const k = cv.sharp || SHARP;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, s.w, s.h);
  // (sharpened, its first frame from the drawing at full size, once that has loaded)
  const hi = cv.sharp > SHARP && frame === 0 && s.hires && imageOf(sheetImages, s.hires, asset(s.hires));
  const waiting = hi && !(hi.complete && hi.naturalWidth);
  if (hi && !waiting) ctx.drawImage(hi, 0, 0, s.w, s.h);
  else {
    ctx.drawImage(img, (frame % s.cols) * s.w, Math.floor(frame / s.cols) * s.h, s.w, s.h, 0, 0, s.w, s.h);
  }
  // (each scar made once on the first frame, from the skin under it there, then laid bent as that skin
  // has moved: by its own keys if it has them, else point by point as the drawing moves)
  const made = [];
  for (const [placed, mark, key, main, side, eyed] of cv.scars) {
    if (side && cv.side && side !== cv.side) continue;
    const blinds = eyed && cv.eye, place = blinds ? onEye(placed, cv.eye) : spread(placed, main, cv.seed, key, cv.home || s);
    if (!markReady(mark) || !reliefOf(mark)) { cv.dirty = true; continue; }
    const piece = onSkin(cv, place, mark, k);
    if (mark.skin && !piece) cv.dirty = true;
    let disp;
    if (place.f) {
      const a = scarAt(place, frame, s.frames), c0x = place.x * s.w, c0y = place.y * s.h, dr = ((a.r || 0) - (place.r || 0)) * Math.PI / 180;
      const cos = Math.cos(dr), sin = Math.sin(dr), c1x = a.x * s.w, c1y = a.y * s.h;
      disp = (x, y) => [c1x + (x - c0x) * cos - (y - c0y) * sin - x, c1y + (x - c0x) * sin + (y - c0y) * cos - y];
    } else disp = (x, y) => { const [dx, dy] = motionAt(s, x / s.w, y / s.h, frame); return [dx * s.w, dy * s.h]; };
    made.push([placeOn(s, place, frame), mark, piece, disp, blinds]);
  }
  ctx.globalCompositeOperation = 'source-atop';
  // (the reddened skin around fresh wounds first, under them)
  for (const [, , piece, disp] of made) {
    const h = piece && piece.halo;
    if (h) { ctx.globalAlpha = h.alpha; laySkin(ctx, h, disp, k); ctx.globalAlpha = 1; }
  }
  for (const [a, mark, piece, disp, blinds] of made) {
    // (the eye where the drawing has it on this frame, whatever keys steer the scar across it)
    // (and none while the eye is shut)
    const track = blinds && eyeTrack(s, cv.eye), shut = track && Number.isNaN(track[frame * 3]);
    if (blinds && !shut && (!track || !blindEye(ctx, cv.eye, s, () => [track[frame * 3], track[frame * 3 + 1]], track[frame * 3 + 2]))) cv.dirty = true;
    if (piece) { laySkin(ctx, piece, disp, k); continue; }
    const size = a.w * s.w * mark.scale;
    ctx.save();
    ctx.translate(a.x * s.w, a.y * s.h);
    ctx.rotate((a.r || 0) * Math.PI / 180);
    ctx.drawImage(markImage(mark), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  // (equipment over the drawing moves with the skin under it)
  for (const [layer, a] of cv.followers || []) {
    const b = placeOn(s, a, frame);
    layer.style.left = (b.x * 100) + '%'; layer.style.top = (b.y * 100) + '%';
  }
  cv.drawn = frame;
  cv.dirty = !!waiting || cv.scars.some(([, mark]) => !markReady(mark));
}
// Drawn at the full size of the drawing, for a close look (the anchors tool's zoom): its first frame
// sharp from the drawing itself, the others from the sheet, larger
export function sharpen(cv, on = true) {
  const s = cv && cv.sheet;
  if (!s) return;
  const k = on && s.hiresW ? s.hiresW / s.w : SHARP;
  if (k === (cv.sharp || SHARP)) return;
  cv.sharp = k;
  cv.width = Math.round(s.w * k); cv.height = Math.round(s.h * k);
  cv.dirty = true;
}
// scars: [place, mark (scarMark), part]; hold a frame by setting the canvas's hold (null plays it); fallback, the
// animated sprite itself, should the sheet not load
export function sheetArt(sheet, px, label, scars, fallback, seed = null) {
  const cv = document.createElement('canvas');
  // (at the sprite's own size: SHARP more, should scars want more detail than the drawing has)
  cv.width = sheet.w * SHARP; cv.height = sheet.h * SHARP;
  Object.assign(cv, { sheet, home: sheet, seed, side: 'left', eye: null, scars, hold: null, drawn: -1, dirty: true, born: performance.now() });
  cv.style.height = Math.round(px * 17) + 'px';
  cv.style.width = 'auto';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', label);
  const img = imageOf(sheetImages, sheet.sheet, asset(sheet.sheet));
  img.addEventListener('error', () => {
    if (!cv.isConnected) return;
    const plain = pictureOf(fallback);
    plain.alt = label; plain.className = cv.className; plain.style.height = cv.style.height; plain.style.width = 'auto';
    cv.replaceWith(plain);
  }, { once: true });
  drawing.add(cv);
  if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  return cv;
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
      c.className = img.className; c.classList.add('pixel-art'); c.style.transform = img.style.transform;
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
  cv.classList.add('pixel-art');
  return cv;
}
