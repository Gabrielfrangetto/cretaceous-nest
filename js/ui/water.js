// Water reminder: a chosen baby pops up in the corner every few minutes to say it's time to drink
// water. Settings live in this browser only; they are a personal preference, not game progress.
//
// A web page cannot draw inside other tabs, so two things reach the player outside the game:
// a floating always-on-top window (Document Picture-in-Picture, Chrome and Edge on desktop) and
// optional system notifications.
import { SPECIES, SEX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf } from '../economy.js';
import { babyArt, spriteUrl } from '../art.js';
import { esc } from '../util.js';
import {
  defaults, clampEvery, nextDue, isDue, snooze, addGlass, glassesToday, PRESETS, MIN_EVERY, MAX_EVERY, SNOOZE_MIN,
} from '../reminder.js';

const KEY = 'cretaceous-nest:water';
const CHECK_MS = 10000;
const MESSAGE = 'Time to drink water!';
const DINO_PX = 10.5;            // babyArt size: sprites are 17 * px tall
const PIP_SIZE = { width: 340, height: 330 };

let settings = defaults();
let alerting = false;            // a reminder is showing and waits for Done or Snooze
let pip = null;                  // the floating window, while open
const body = document.getElementById('waterBody');
const pop = document.getElementById('waterPop');

function read() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
}

const chosenBaby = () => S.hatched.find(b => b.id === settings.babyId) || null;
const canNotify = () => 'Notification' in window;
const canFloat = () => 'documentPictureInPicture' in window;
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const nextText = () => settings.on
  ? `Next reminder at ${timeFmt.format(new Date(Math.max(Date.now(), nextDue(settings))))}.`
  : 'Reminders are off.';

// the baby's picture, mirrored so it faces the speech bubble on its left
function dinoArt(baby, absolute = false) {
  const art = babyArt(baby.type, DINO_PX, sexOf(baby));
  // the floating window has no address of its own, so image paths must be absolute there
  if (absolute && art.tagName === 'IMG') art.src = new URL(art.getAttribute('src'), location.href).href;
  return art;
}

// ---------- settings panel ----------
function render() {
  if (!S.hatched.length) {
    body.innerHTML = '<p class="hint">Hatch a baby first, then pick one to remind you.</p>';
    return;
  }
  if (!chosenBaby()) { settings.babyId = S.hatched[0].id; save(); }
  body.innerHTML = `
    <div class="water-grid">
      <div class="field"><label for="waterBaby">Baby</label>
        <select id="waterBaby">${S.hatched.map(b => `<option value="${esc(b.id)}" ${b.id === settings.babyId ? 'selected' : ''}>${esc(b.name)} ${SEX[sexOf(b)].sym} · ${esc(SPECIES[b.type].species)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="waterEvery">Every</label>
        <div class="row every-row">
          <input type="number" id="waterEvery" min="${MIN_EVERY}" max="${MAX_EVERY}" step="1" value="${clampEvery(settings.every)}" inputmode="numeric">
          <span>minutes</span>
          ${PRESETS.map(m => `<button type="button" class="chip ${clampEvery(settings.every) === m ? 'on' : ''}" data-every="${m}">${m}</button>`).join('')}
        </div>
      </div>
    </div>
    <label class="check"><input type="checkbox" id="waterOn" ${settings.on ? 'checked' : ''}> Remind me to drink water</label>
    ${canNotify() ? `<label class="check"><input type="checkbox" id="waterNotify" ${settings.notify ? 'checked' : ''}> Also show a system notification when this page is in the background</label>` : ''}
    <p class="hint" id="waterStatus">${nextText()} Glasses today: ${glassesToday(settings, Date.now())}.</p>
    <div class="row">
      ${canFloat() ? `<button class="btn small" type="button" id="waterFloat">${pip ? 'Close floating window' : 'Keep on top of other tabs'}</button>` : ''}
      <button class="ghost" type="button" id="waterTest">Show a test reminder</button>
    </div>
    ${canFloat()
      ? '<p class="hint">The floating window stays on top of every tab and app while this game is open in any tab.</p>'
      : '<p class="hint">To see reminders over other tabs, turn on system notifications above. A floating window is available in Chrome and Edge on a computer.</p>'}`;

  document.getElementById('waterBaby').addEventListener('change', e => { settings.babyId = e.target.value; save(); render(); renderPip(); });
  const every = document.getElementById('waterEvery');
  every.addEventListener('change', () => { settings.every = clampEvery(every.value); restart(); });
  body.querySelectorAll('[data-every]').forEach(b => b.addEventListener('click', () => { settings.every = +b.dataset.every; restart(); }));
  document.getElementById('waterOn').addEventListener('change', e => { settings.on = e.target.checked; restart(); });
  const notify = document.getElementById('waterNotify');
  if (notify) notify.addEventListener('change', async e => {
    settings.notify = e.target.checked;
    if (settings.notify && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (err) {}
    }
    if (settings.notify && Notification.permission === 'denied') {
      settings.notify = false;
      save(); render();
      document.getElementById('waterStatus').textContent = 'Notifications are blocked for this site. Allow them in your browser settings to use this option.';
      return;
    }
    save();
  });
  const float = document.getElementById('waterFloat');
  if (float) float.addEventListener('click', () => { if (pip) pip.close(); else openPip(); });
  document.getElementById('waterTest').addEventListener('click', () => alertNow(true));
}

// changing the interval or switching on starts the countdown from now
function restart() {
  settings.lastAt = Date.now();
  save();
  render();
  renderPip();
}

// ---------- the reminder itself ----------
function bubbleHTML(baby) {
  return `
    <button class="close" type="button" data-water="close" aria-label="Close">×</button>
    <p class="water-name">${esc(baby.name)} says:</p>
    <p class="water-msg">${MESSAGE}</p>
    <p class="hint">Glasses today: ${glassesToday(settings, Date.now())}</p>
    <div class="row">
      <button class="btn small" type="button" data-water="done">Done</button>
      <button class="ghost" type="button" data-water="snooze">Snooze ${SNOOZE_MIN} min</button>
    </div>`;
}

function wireButtons(root) {
  root.querySelectorAll('[data-water]').forEach(b => b.addEventListener('click', () => {
    const now = Date.now();
    if (b.dataset.water === 'done') addGlass(settings, now);
    if (b.dataset.water === 'snooze') snooze(settings, now);
    save();
    alerting = false;
    pop.hidden = true;
    render();
    renderPip();
  }));
}

function showInPage(baby) {
  document.getElementById('waterBubble').innerHTML = bubbleHTML(baby);
  wireButtons(document.getElementById('waterBubble'));
  const dino = document.getElementById('waterDino');
  dino.innerHTML = '';
  dino.appendChild(dinoArt(baby));
  pop.hidden = false;
  pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
}

function alertNow(test = false) {
  const baby = chosenBaby();
  if (!baby) return;
  alerting = true;
  if (pip) renderPip();
  else showInPage(baby);

  if (!test && !pip && settings.notify && document.hidden && canNotify() && Notification.permission === 'granted') {
    const icon = spriteUrl(baby.type, sexOf(baby));
    try {
      new Notification(MESSAGE, { body: `${baby.name} is reminding you.`, icon: icon ? new URL(icon, location.href).href : undefined, tag: 'water' });
    } catch (e) { /* some browsers only allow notifications from a service worker */ }
  }
}

function check() {
  // another tab of the game may have shown the reminder already
  settings.lastAt = Math.max(settings.lastAt, read().lastAt);
  if (isDue(settings, Date.now()) && chosenBaby()) {
    settings.lastAt = Date.now();
    save();
    alertNow();
    if (!document.getElementById('panelNest').hidden) render();
  } else if (pip && !alerting) {
    renderPip();   // keeps "next reminder at" current
  }
}

// ---------- floating window ----------
async function openPip() {
  try {
    pip = await window.documentPictureInPicture.requestWindow(PIP_SIZE);
  } catch (e) {
    document.getElementById('waterStatus').textContent = "This browser couldn't open the floating window. Turn on system notifications above to see reminders over other tabs.";
    return;
  }
  const doc = pip.document;
  doc.title = 'Water reminder · Cretaceous Nest';
  for (const link of document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]')) {
    const copy = doc.createElement('link');
    copy.rel = link.rel;
    copy.href = link.href;
    if (link.crossOrigin) copy.crossOrigin = link.crossOrigin;
    doc.head.appendChild(copy);
  }
  doc.body.className = 'pip-body';
  doc.body.innerHTML = '<div class="pip"><div class="water-bubble" id="pipBubble"></div><div class="water-dino" id="pipDino"></div></div>';
  pip.addEventListener('pagehide', () => { pip = null; render(); });
  pop.hidden = true;
  renderPip();
  render();
}

function renderPip() {
  if (!pip) return;
  const doc = pip.document;
  const baby = chosenBaby();
  const bubble = doc.getElementById('pipBubble');
  const dino = doc.getElementById('pipDino');
  if (!bubble || !dino) return;
  if (!baby) { bubble.innerHTML = '<p class="hint">Pick a baby in the game first.</p>'; dino.innerHTML = ''; return; }
  if (alerting) {
    bubble.innerHTML = bubbleHTML(baby);
    bubble.classList.add('alert');
    wireButtons(bubble);
    bubble.querySelector('[data-water="close"]').remove();   // the window's own × closes it
  } else {
    bubble.classList.remove('alert');
    bubble.innerHTML = `<p class="water-name">${esc(baby.name)}</p><p class="hint">${settings.on ? `I'll tell you when it's time to drink water. ${nextText()}` : 'Water reminders are off. Turn them on in the game.'}</p>`;
  }
  if (dino.dataset.baby !== baby.id) {
    dino.dataset.baby = baby.id;
    dino.innerHTML = '';
    dino.appendChild(doc.adoptNode(dinoArt(baby, true)));
  }
}

export function initWater() {
  settings = read();
  render();
  subscribe(() => { if (!body.contains(document.activeElement)) render(); });
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();
}
