// The landing page shown before sign-in (index.html #landing): fills each section's picture with the
// game's own art, slides sections in from alternating sides as they scroll into view, and opens the
// sign-in window from every Play button.
import { SPECIES, STARTERS, CREATURES } from '../config.js';
import { eggSVG, babyArt, dressedArt, playerArt } from '../art.js';
import { sampleMapSVG } from './world.js';
import { openSignIn } from './gate.js';

const el = (cls, ...kids) => {
  const e = document.createElement('div');
  e.className = cls;
  for (const k of kids) typeof k === 'string' ? e.insertAdjacentHTML('beforeend', k) : e.appendChild(k);
  return e;
};
const label = text => `<span class="art-label">${text}</span>`;

const ART = {
  hero() {
    return el('art-hero', el('art-glow'), dressedArt('rex', 9, 'm', null, null, 'adult'), el('art-hero-egg', eggSVG(SPECIES.rex, 1)));
  },
  hatch() {
    return el('art-row', ...STARTERS.map(t => el('art-egg', eggSVG(SPECIES[t]), label(SPECIES[t].species))));
  },
  raise() {
    return el('art-row art-grow', ...['baby', 'juvenile', 'adult'].map(stage =>
      el('art-stage', dressedArt('rex', 5.2, 'm', null, null, stage), label(stage[0].toUpperCase() + stage.slice(1)))));
  },
  explore() {
    return el('art-map', sampleMapSVG(7, 2));
  },
  fight() {
    const foe = babyArt(CREATURES.wild_raptor.look, 5.5, 'm');
    foe.style.filter = CREATURES.wild_raptor.tint;
    const side = (name, art, hp, cls) => el('art-fighter ' + cls, `<strong>${name}</strong><span class="hp"><i style="width:${hp}%"></i></span>`, art);
    return el('art-fight',
      side('You', playerArt({ weapon: 'bone_sword', shield: 'bone_shield', head: 'hide_cap', body: 'clay_armor', feet: 'feather_boots' }, 120), 82, 'me'),
      '<span class="art-vs">VS</span>',
      side('Wild Raptor', foe, 35, 'foe'));
  },
  breed() {
    return el('art-row art-breed', el('art-stage', babyArt('raptor', 5, 'm'), label('♂')), el('art-heart', '♥', eggSVG(SPECIES.raptor)), el('art-stage', babyArt('raptor', 5, 'f'), label('♀')));
  },
};

export function initLanding() {
  const root = document.getElementById('landing');
  for (const spot of root.querySelectorAll('[data-art]')) {
    const make = ART[spot.dataset.art];
    if (make) spot.appendChild(make());
  }
  // sections alternate sides: odd ones put the picture first
  root.querySelectorAll('.land-sec').forEach((sec, i) => sec.classList.add(i % 2 ? 'flip' : 'straight'));
  root.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', openSignIn));

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
