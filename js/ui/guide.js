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

function close(finished) {
  const id = showing;
  pop.hidden = true;
  shade.hidden = true;
  showing = null;
  if (!id) return;
  act('seeGuide', { id });
  if (finished && GUIDE[id].go) setTab(GUIDE[id].go);
}

function render() {
  const tip = GUIDE[showing];
  const last = page === tip.pages.length - 1;
  bubble.innerHTML = `
    <button class="close" type="button" data-guide="skip" aria-label="Close">×</button>
    <p class="water-name">Professor Ivy Fern</p>
    <p class="guide-msg">${esc(tip.pages[page])}</p>
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

export function showGuide(id) {
  if (!GUIDE[id] || showing) return;
  showing = id; page = 0;
  who.innerHTML = '';
  who.appendChild(guideArt(180));
  render();
  pop.hidden = false;
  shade.hidden = false;
  pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
}

// the welcome waits until the game is on screen, then a moment more so the page settles first
function check() {
  if (showing || !playing() || !unseen('welcome')) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (playing() && unseen('welcome')) showGuide('welcome'); }, 700);
}

export function initGuide() {
  subscribe(check);
  setInterval(check, 1500);
  check();
}
