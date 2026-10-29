// The landing page shown before sign-in (index.html #landing): a landscape scene with the game's own
// art standing on its ground, sections that slide in from alternating sides as they scroll into view,
// and the sign-in window opened from every Play button. Pictures below the first screen are only made
// as they come near, so the page starts light.
import { SPECIES, STARTERS, ROLES, DIET, WORLD_SEED } from '../config.js';
import { eggSVG, NEST, dressedArt, sleepArt, playerArt, playerHeightAt } from '../art.js';
import { sampleMapSVG } from './world.js';
import { openSignIn } from './gate.js';

const el = (cls, ...kids) => {
  const e = document.createElement('div');
  e.className = cls;
  for (const k of kids) if (k) typeof k === 'string' ? e.insertAdjacentHTML('beforeend', k) : e.appendChild(k);
  return e;
};
const label = text => `<span class="art-label">${text}</span>`;
// a sprite drawn at a set share of its box's height (its own inline size dropped), so it scales with the page
const sized = (art, h) => {
  const img = art.tagName === 'IMG' ? art : art.querySelector('img');
  if (img) { img.style.height = ''; img.style.width = ''; }
  art.classList.add('land-sprite');
  if (h != null) art.style.setProperty('--h', h);
  return art;
};
// the fight's scale: the explorer about 210 px tall (a little less on a phone)
const FIGHT_PX = matchMedia('(max-width: 480px)').matches ? 9.5 : 12;
const flipped = art => { art.classList.add('land-flip'); return art; };
// eggs in a nest: the nest in front, the eggs sat in it
const nest = (types, cls = '') => el('land-nest ' + cls, el('land-nest-eggs', ...types.map((t, i) => el('land-egg', eggSVG(SPECIES[t], i === 1 ? 1 : 0)))), NEST);

// ---------- the hero's landscape: hills, a volcano and tree ferns, standing on the ground band ----------
function fern(x, base, h, flip = 1) {
  const top = base - h;
  const frond = (dx, dy) => `<path d="M${x} ${top} q${dx * 0.5} ${dy - 26} ${dx} ${dy}" />`;
  return `<g class="fern" style="transform-origin:${x}px ${base}px">
    <path class="trunk" d="M${x - 5} ${base} q${3 * flip} ${-h / 2} 3 ${-h} h4 q${-1 * flip} ${h / 2} 4 ${h} z"/>
    <g class="fronds">${frond(-70, 30)}${frond(-46, 46)}${frond(-20, 54)}${frond(70, 30)}${frond(46, 46)}${frond(20, 54)}${frond(-60, 8)}${frond(60, 8)}</g></g>`;
}
function sceneSVG() {
  const smoke = [0, 1, 2].map(i => `<circle class="smoke s${i}" cx="840" cy="112" r="${18 + i * 5}"/>`).join('');
  return `<svg class="scene-hills" viewBox="0 0 1600 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><filter id="landBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <linearGradient id="landLava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--land-lava)"/><stop offset="1" stop-color="var(--land-lava)" stop-opacity="0"/></linearGradient></defs>
    <g class="smokes" filter="url(#landBlur)">${smoke}</g>
    <path class="volcano" d="M660 360 Q760 250 812 128 L828 136 L840 126 L854 136 L868 128 Q920 250 1020 360 Z"/>
    <path d="M824 134 Q832 168 822 214 Q836 180 842 140 Q850 176 858 200 Q852 160 856 134 Z" fill="url(#landLava)" opacity=".7"/>
    <path class="far" d="M0 250 Q140 196 300 228 T620 224 T940 214 T1260 226 T1600 196 V360 H0 Z"/>
    <path class="mid" d="M0 300 Q200 252 420 284 T860 272 T1240 286 T1600 262 V360 H0 Z"/>
    ${fern(40, 330, 110, -1)}${fern(1420, 300, 150, -1)}${fern(1540, 324, 96)}
    <path class="near" d="M0 336 Q260 310 560 330 T1100 324 T1600 318 V360 H0 Z"/>
  </svg><div class="scene-ground"></div>`;
}
// the closing scene at night: stars, a moon and dark hills
function nightSVG() {
  let seed = 7;
  const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const stars = Array.from({ length: 70 }, () => `<circle cx="${(r() * 1600).toFixed(0)}" cy="${(r() * 300).toFixed(0)}" r="${(0.8 + r() * 1.8).toFixed(1)}" style="animation-delay:${(r() * 4).toFixed(2)}s"/>`).join('');
  return `<svg class="night-sky" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><g class="stars">${stars}</g></svg><span class="moon"></span>
    <svg class="scene-hills" viewBox="0 0 1600 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path class="far" d="M0 250 Q140 200 300 236 T620 226 T940 206 T1260 232 T1600 200 V360 H0 Z"/>
    ${fern(220, 300, 130)}${fern(1340, 296, 150, -1)}
    <path class="near" d="M0 330 Q260 300 560 326 T1100 318 T1600 312 V360 H0 Z"/></svg><div class="scene-ground"></div>`;
}

const ICONS = {
  egg: '<path d="M12 3c-3.6 0-6.5 5.2-6.5 9.6A6.5 6.5 0 0 0 12 19.5a6.5 6.5 0 0 0 6.5-6.9C18.5 8.2 15.6 3 12 3Z"/><path d="m8.5 11 2 1.5 1.5-2 1.5 2 2-1.5"/>',
  grow: '<path d="M4 20h16"/><path d="M6 20v-3M11 20v-7M17 20V7"/><path d="m14 9 3-3 3 3"/>',
  map: '<path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
  claw: '<path d="M6 4c1 5 4 9 9 12"/><path d="M11 4c.6 4 2.6 7 6 9"/><path d="M16 4c.3 2.6 1.4 4.6 3.5 6"/><path d="M4 20c3-1.5 5-1.5 8 0"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
};

const ART = {
  logo: () => eggSVG(SPECIES.rex),
  scene: () => sceneSVG(),
  night: () => nightSVG(),
  stats() {
    return [[Object.keys(SPECIES).length, 'species'], [STARTERS.length, 'starters to choose from'], [1, 'world shared by every nest']]
      .map(([n, t]) => `<li><b>${n}</b> ${t}</li>`).join('');
  },
  hero() {
    return el('hero-pair', sized(dressedArt('rex', 9, 'm', null, null, 'adult')), nest(['raptor', 'rex', 'coelo'], 'hero-nest'));
  },
  hatch() {
    const card = t => el('starter-card', el('land-egg', eggSVG(SPECIES[t])), `<strong>${SPECIES[t].species}</strong>`,
      `<span class="chips"><span class="chip">${DIET[t].includes('meat') ? 'Meat eater' : 'Plant eater'}</span><span class="chip role">${ROLES[t].role}</span></span>`);
    return el('starters', ...STARTERS.map(card));
  },
  raise() {
    // (baby in front, the adult it becomes behind)
    const stage = s => el('grow-stage is-' + s, sized(dressedArt('rex', 6, 'm', null, null, s)), label(s[0].toUpperCase() + s.slice(1)));
    return el('grow-row', stage('baby'), stage('juvenile'), stage('adult'));
  },
  explore() {
    return el('art-map', sampleMapSVG(WORLD_SEED, 2), '<p class="map-key"><span class="q">?</span> unexplored · your nest in the middle</p>');
  },
  fight() {
    const side = (name, art, hp, cls) => el('art-fighter ' + cls, `<strong>${name}</strong><span class="hp" role="img" aria-label="${hp}% health"><i style="width:${hp}%"></i></span>`, art);
    return el('art-fight',
      // (both at one scale, as tall as they stood: a grown Velociraptor comes up to a person's hip)
      side('You', el('player-box', playerArt({ weapon: 'bone_sword', shield: 'bone_shield', head: 'hide_cap', body: 'clay_armor', feet: 'feather_boots' }, playerHeightAt(FIGHT_PX))), 82, 'me'),
      '<span class="art-vs">VS</span>',
      side('Velociraptor', flipped(dressedArt('raptor', FIGHT_PX, 'm', null, null, 'adult')), 35, 'foe'));
  },
  breed() {
    return el('art-breed',
      el('mate', sized(dressedArt('coelo', 6, 'm', null, null, 'adult')), label('♂ Male')),
      el('art-heart', '<span aria-hidden="true">♥</span>', el('land-egg', eggSVG(SPECIES.coelo))),
      el('mate', flipped(sized(dressedArt('coelo', 6, 'f', null, null, 'adult'))), label('♀ Female')));
  },
  sleep() {
    const z = sleepArt('coelo', 6, 'm', 'adult');
    return el('night-pair', z && sized(z), nest(['psitta', 'coelo', 'proto'], 'night-nest'));
  },
};

function fill(spot) {
  const make = ART[spot.dataset.art];
  if (!make || spot.dataset.filled) return;
  spot.dataset.filled = '1';
  const art = make();
  if (art) typeof art === 'string' ? spot.insertAdjacentHTML('beforeend', art) : spot.appendChild(art);
}

export function initLanding() {
  const root = document.getElementById('landing');
  root.querySelectorAll('[data-ico]').forEach(s => { s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[s.dataset.ico]}</svg>`; });
  // sections alternate sides: odd ones put the picture first
  root.querySelectorAll('.land-sec').forEach((sec, i) => sec.classList.add(i % 2 ? 'flip' : 'straight'));
  root.querySelectorAll('.land-steps li').forEach((li, i) => li.style.setProperty('--i', i));
  root.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => openSignIn(b.dataset.play || 'login')));

  // the first screen's pictures now, the rest as they come near
  const spots = [...root.querySelectorAll('[data-art]')];
  // (watched by their section: an empty spot has no size of its own to be seen by)
  const near = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.querySelectorAll('[data-art]').forEach(fill); near.unobserve(e.target); }
  }, { rootMargin: '900px 0px' });
  for (const s of spots) if (!near || s.closest('.land-hero, .land-nav')) fill(s);
  if (near) root.querySelectorAll('.land-sec, .land-final').forEach(sec => near.observe(sec));

  // slide each section in when it scrolls into view (the first one as the page loads)
  const items = root.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(x => x.classList.add('in'));
    return;
  }
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); }
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  items.forEach(x => seen.observe(x));
}
