// Drawings made in code: eggs, the nest, item icons, and the baby sprites (with a pixel-art fallback).
import { SPECIES, SEX, DRAWN_SLOTS, OUTFITS, STAGES, ITEMS, SCARS } from './config.js';
import { anchorFor, gearArtFor, FITTED, BEHIND, SCAR_ANCHORS } from './gear-art.js';
import { SHEETS } from './sheets.js';
import { scarStyle } from './journey.js';

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
// is drawn as the open wound; stitched: the wound sewn up in the hospital (cuts, not bites)
const SCAR_ART = {
  claw: { 1: 'sprites/scars/claw-1.webp', 2: 'sprites/scars/claw-2.webp', stitched: 'sprites/scars/claw-stitched.webp' },
  bigBite: { 1: 'sprites/scars/bigBite-1.webp' },
  horns: { 1: 'sprites/scars/horns-1.webp', 2: 'sprites/scars/horns-2.webp', healed: 'sprites/scars/horns-2-healed.webp' },
};
export const SCAR_LOOKS = Object.keys(SCARS.style);
// what a scar looks like: its picture, and how wide it is drawn against its place's width
// (skin: the skin's colour where it is, for a sewn-up wound, which heals into it)
export function scarMark(style, level, tint = 0, stitched = false, skin = null) {
  const t = Math.round(tint * 20) / 20;
  // (a deep one drawn as the open wound it was has its healed look apart, for the scar it leaves)
  const art = SCAR_ART[style] || {}, src = (stitched && tint && art.stitched) || (level === 2 && !tint && art.healed) || art[level] || art[1] || art[2];
  const sewn = stitched && tint && art.stitched && src === art.stitched;
  return src ? { key: src, src: asset(src), scale: 1, tint: t, ...(sewn && skin ? { skin } : {}) }
    : { key: 'line' + level, src: lineScar(level), scale: 1.2, level: t ? 0 : level, tint: t };
}
// the skin's colour where a part's scar goes: picked there in tools/anchors.html, or on another part of
// the same drawing, or the species' own
const skinAt = (type, sex, part, stage) => {
  const a = scarAnchor(type, sex, part, stage), mine = (((SCAR_ANCHORS[type] || {})[stage] || {})[sex]) || {};
  const other = SCARS.parts.map(pt => mine[pt] && mine[pt].c).find(Boolean);
  return (a && a.c) || other || (SPECIES[type] && SPECIES[type].body) || null;
};
// the giver of the worst a part got (a species or a creature), as the kind of blow it gave
// (or the kind itself, as the anchors tool shows it)
const styleBy = who => (!who ? 'any' : SCARS.style[who] ? who : scarStyle(SPECIES[who] ? { species: who } : { creature: who }));
// (a baby looks the same whatever its sex, so a place set on either serves both)
const ownScar = (type, sex, part, stage) => {
  const at = ((SCAR_ANCHORS[type] || {})[stage] || {});
  return (at[sex] || {})[part] || (stage === 'baby' ? (at[sex === 'm' ? 'f' : 'm'] || {})[part] : null) || null;
};
export function scarAnchor(type, sex, part, stage = 'adult') {
  const own = ownScar(type, sex, part, stage);
  if (own) return own;
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
export function dressedArt(type, px, sex = 'f', equip = null, outfit = null, stage = 'baby', scars = null, scarBy = null, wounds = null) {
  const look = outfit && OUTFITS[outfit] && OUTFITS[outfit].species === type ? OUTFITS[outfit] : null;
  const st = STAGES.find(x => x.id === stage) || STAGES[0];
  const own = stage === 'adult' ? adultSpriteUrl(type, sex) : stage === 'juvenile' ? juvenileSpriteUrl(type, sex) : null;
  const size = look ? 1 : !own ? (BABY_SCALE[type] || 1)
    : stage === 'adult' ? adultScale(type, sex) : ((JUVENILE_SCALE[type] || {})[sex] || 1);
  const src = look ? asset(look.sprites[sex]) : own || (SPRITES[type] && SPRITES[type][sex]);
  const sheet = src && SHEETS[src.slice(ROOT.length)];
  const open = pt => (wounds && wounds.parts && wounds.parts[pt]) || 0;
  const scarred = look ? [] : SCARS.parts.map(pt => [pt, scarLevel((scars && scars[pt]) || 0)]).filter(([pt, l]) => l || open(pt))
    .map(([pt, l]) => [pt, open(pt) ? scarMark(styleBy(wounds.by || (scarBy && scarBy[pt])), open(pt) > 0.5 ? 2 : 1, open(pt), !!wounds.stitched, skinAt(type, sex, pt, stage))
      : scarMark(styleBy(scarBy && scarBy[pt]), l)]);
  // a scarred animated sprite is drawn frame by frame, its scars following the body
  const base = sheet && scarred.length
    ? sheetArt(sheet, px * st.scale * size, babyLabel(type, sex), scarred.map(([part, mark]) => [scarAnchor(type, sex, part, stage), mark, part]).filter(([a]) => a), src)
    : babyArt(type, px * st.scale * size, sex, false, look ? asset(look.sprites[sex]) : own);
  // an outfit is a complete drawing, so accessories are only drawn on the baby's own sprite
  const worn = look ? [] : Object.entries(equip || {}).filter(([slot, id]) => DRAWN_SLOTS.includes(slot) && ITEM_ICONS[id]);
  if (!worn.length && !scarred.length) return base;
  const box = document.createElement('span');
  box.className = 'dino-art';
  base.classList.add('dino-base');
  box.appendChild(base);
  // (scars on the skin, under whatever it wears; on a sheet they are drawn in it)
  if (base.tagName !== 'CANVAS' || !base.sheet) for (const [part, mark] of scarred) {
    const a = scarAnchor(type, sex, part, stage);
    if (!a) continue;
    const layer = document.createElement('span');
    layer.className = `scar-layer scar-${mark.level || 'art'}`;
    layer.dataset.part = part;
    Object.assign(layer.style, { left: (a.x * 100) + '%', top: (a.y * 100) + '%', width: (a.w * (mark.level ? 1 : mark.scale) * 100) + '%', transform: `translate(-50%, -50%) rotate(${a.r || 0}deg)` });
    if (mark.level) layer.innerHTML = scarSVG(mark.level);
    else if (mark.tint) layer.appendChild(tintedCanvas(mark));
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
    // (sewn up, it heals from crimson into the skin around it, painted as the crimson is)
    const skin = mark.skin && [1, 3, 5].map(i => parseInt(mark.skin.slice(i, i + 2), 16) / 255);
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const r = px[i] / 255, gr = px[i + 1] / 255, b = px[i + 2] / 255, lum = 0.3 * r + 0.59 * gr + 0.11 * b;
      if (lum < 0.25) continue;
      const k = 0.55 + lum * 0.75, ridge = lum > 0.8;
      const red = [Math.min(1, 0.62 * k + (ridge ? 0.25 : 0)), Math.min(1, 0.07 * k + (ridge ? 0.12 : 0)), Math.min(1, 0.08 * k + (ridge ? 0.1 : 0))];
      const from = skin ? skin.map(v => Math.min(1, v * k * 1.1 + (ridge ? 0.12 : 0))) : [r, gr, b];
      px[i] = (from[0] * (1 - t) + red[0] * t) * 255; px[i + 1] = (from[1] * (1 - t) + red[1] * t) * 255; px[i + 2] = (from[2] * (1 - t) + red[2] * t) * 255;
    }
    g.putImageData(d, 0, 0);
  } catch (e) { /* a picture that can't be read stays as it is */ }
  return (tinted[key] = c);
}
const markImage = mark => (mark.tint ? tintOf(mark) : scarImage(mark));
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
export function drawFrame(cv, frame) {
  const s = cv.sheet, img = imageOf(sheetImages, s.sheet, asset(s.sheet));
  if (!img.complete || !img.naturalWidth) return;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s.w, s.h);
  ctx.drawImage(img, (frame % s.cols) * s.w, Math.floor(frame / s.cols) * s.h, s.w, s.h, 0, 0, s.w, s.h);
  ctx.globalCompositeOperation = 'source-atop';
  for (const [place, mark] of cv.scars) {
    const a = scarAt(place, frame, s.frames), img = markImage(mark);
    if (!markReady(mark)) { cv.dirty = true; continue; }
    const size = a.w * s.w * mark.scale;
    ctx.save();
    ctx.translate(a.x * s.w, a.y * s.h);
    ctx.rotate((a.r || 0) * Math.PI / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  cv.drawn = frame;
  cv.dirty = cv.scars.some(([, mark]) => !markReady(mark));
}
// scars: [place, mark (scarMark), part]; hold a frame by setting the canvas's hold (null plays it); fallback, the
// animated sprite itself, should the sheet not load
export function sheetArt(sheet, px, label, scars, fallback) {
  const cv = document.createElement('canvas');
  cv.width = sheet.w; cv.height = sheet.h;
  Object.assign(cv, { sheet, scars, hold: null, drawn: -1, dirty: true, born: performance.now() });
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
