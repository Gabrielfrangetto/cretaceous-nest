// The guide: Professor Ivy Fern pops up in the corner, like the water reminder, to teach the game one
// tip at a time (GUIDE in config.js). A tip is shown once per account: reading it to the end records
// it in the save, so it does not come back on another device either.
import { GUIDE } from '../config.js';
import { S, subscribe } from '../state.js';
import { act } from '../actions.js';
import { inGame } from '../cloud.js';
import { devMode } from '../state.js';
import { guideArt } from '../art.js';
import { esc } from '../util.js';
import { setTab } from './tabs.js';

const pop = document.getElementById('guidePop');
const bubble = document.getElementById('guideBubble');
const who = document.getElementById('guideChar');
// the game fades behind the guide while she talks
const shade = document.getElementById('guideShade');
let showing = null, page = 0, timer = null;

const playing = () => devMode() || inGame();
const unseen = id => S.tutorial && !S.tutorial.seen.includes(id);
let lit = null;   // the part of the page lit up above the shade

// when each tip may pop up by itself (the welcome first; the rest also need the tip before them read)
const READY = {
  welcome: () => true,
  starters: () => !S.starter && !unseen('welcome'),
};

// lights up a part of the page and scrolls it to the top of the screen, clear of the guide in the
// bottom corner (the page gets room below so even a short page can scroll that far)
function spotlight(selector) {
  if (lit) lit.classList.remove('guide-spot');
  lit = selector ? document.querySelector(selector) : null;
  document.body.classList.toggle('guide-room', !!lit);
  if (lit) {
    lit.classList.add('guide-spot');
    lit.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

function close(finished) {
  const id = showing;
  pop.hidden = true;
  shade.hidden = true;
  focusOn(null);
  spotlight(null);
  showing = null;
  if (!id) return;
  act('seeGuide', { id });
  // the next tip follows straight away; replays (the Tutorial button) chain through every tip
  const next = finished && GUIDE[id].next;
  if (next && (replaying || READY[next]())) setTimeout(() => showGuide(next), 450);
  else replaying = false;
}

// a page is a string, or { text, focus } to single out part of the lit-up area
const pageText = p => typeof p === 'string' ? p : p.text;
function focusOn(selector) {
  for (const x of document.querySelectorAll('.guide-focus, .guide-dim')) x.classList.remove('guide-focus', 'guide-dim');
  if (!lit || !selector) return;
  const chosen = new Set(lit.querySelectorAll(selector));
  // every sibling group the chosen ones belong to dims, apart from the chosen
  for (const el of chosen) for (const sib of el.parentElement.children) sib.classList.add(chosen.has(sib) ? 'guide-focus' : 'guide-dim');
}

function render() {
  const tip = GUIDE[showing];
  const last = page === tip.pages.length - 1;
  focusOn(typeof tip.pages[page] === 'string' ? null : tip.pages[page].focus);
  bubble.innerHTML = `
    <button class="close" type="button" data-guide="skip" aria-label="Close">×</button>
    <p class="water-name">Professor Ivy Fern</p>
    <p class="guide-msg">${esc(pageText(tip.pages[page]))}</p>
    <div class="row guide-row">
      <span class="guide-dots" aria-hidden="true">${tip.pages.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')}</span>
      ${page ? '<button class="ghost" type="button" data-guide="back">Back</button>' : ''}
      <button class="btn small" type="button" data-guide="next">${last ? esc(tip.done || 'Got it') : 'Next'}</button>
    </div>`;
  bubble.querySelector('[data-guide="next"]').addEventListener('click', () => { if (last) close(true); else { page++; render(); } });
  const back = bubble.querySelector('[data-guide="back"]');
  if (back) back.addEventListener('click', () => { page--; render(); });
  bubble.querySelector('[data-guide="skip"]').addEventListener('click', () => close(false));
  bubble.querySelector('[data-guide="next"]').focus({ preventScroll: true });
}

let replaying = false;
export function showGuide(id) {
  if (!GUIDE[id] || showing) return;
  const tip = GUIDE[id];
  showing = id; page = 0;
  if (tip.tab) setTab(tip.tab);
  pop.classList.toggle('left', tip.side === 'left');
  who.innerHTML = '';
  who.appendChild(guideArt(180));
  render();
  pop.hidden = false;
  shade.hidden = false;
  spotlight(tip.spot);
  pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
}

// the first tip that is due pops up once the game is on screen, a moment later so the page settles
function check() {
  if (showing || !playing()) return;
  const due = Object.keys(GUIDE).find(id => unseen(id) && READY[id] && READY[id]());
  if (!due) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (!showing && playing() && unseen(due) && READY[due]()) showGuide(due); }, 700);
}

export function initGuide() {
  // TEMPORARY: the header's Tutorial button replays the tutorial from the start while it is being built
  const replay = document.getElementById('guideReplay');
  if (replay) replay.addEventListener('click', () => { replaying = true; showGuide('welcome'); });
  subscribe(check);
  setInterval(check, 1500);
  check();
}
