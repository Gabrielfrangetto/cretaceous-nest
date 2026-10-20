// Water reminder: a chosen baby pops up in the corner every few minutes, with an alarm-clock sound,
// to say it's time to drink water. Settings live in this browser only; they are a personal
// preference, not game progress.
import { SPECIES, SEX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, wornGear, stageOf } from '../economy.js';
import { dressedArt, spriteUrl } from '../art.js';
import { esc } from '../util.js';
import { unlockAudio, startAlarm, stopAlarm } from '../alarm.js';
import {
  defaults, clampEvery, nextDue, isDue, snooze, addGlass, glassesToday, PRESETS, MIN_EVERY, MAX_EVERY, SNOOZE_MIN,
} from '../reminder.js';

const KEY = 'cretaceous-nest:water';
const CHECK_MS = 10000;
const MESSAGE = 'Time to drink water!';
const DINO_PX = 10.5;            // babyArt size: sprites are 17 * px tall

let settings = defaults();
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
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const nextText = () => settings.on
  ? `Next reminder at ${timeFmt.format(new Date(Math.max(Date.now(), nextDue(settings))))}.`
  : 'Reminders are off.';

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
    <label class="check"><input type="checkbox" id="waterSound" ${settings.sound ? 'checked' : ''}> Play an alarm sound until I answer (up to 1 minute)</label>
    ${canNotify() ? `<label class="check"><input type="checkbox" id="waterNotify" ${settings.notify ? 'checked' : ''}> Also show a system notification when this page is in the background</label>` : ''}
    <p class="hint" id="waterStatus">${nextText()} Glasses today: ${glassesToday(settings, Date.now())}.</p>
    <p class="hint">Keep this page open in a tab. Browsers only play sound after you've clicked somewhere on the page since opening it.</p>
    <div class="row"><button class="ghost" type="button" id="waterTest">Show a test reminder</button></div>`;

  document.getElementById('waterBaby').addEventListener('change', e => { settings.babyId = e.target.value; save(); render(); });
  const every = document.getElementById('waterEvery');
  every.addEventListener('change', () => { settings.every = clampEvery(every.value); restart(); });
  body.querySelectorAll('[data-every]').forEach(b => b.addEventListener('click', () => { settings.every = +b.dataset.every; restart(); }));
  document.getElementById('waterOn').addEventListener('change', e => { settings.on = e.target.checked; restart(); });
  document.getElementById('waterSound').addEventListener('change', e => { settings.sound = e.target.checked; save(); });
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
  document.getElementById('waterTest').addEventListener('click', () => alertNow(true));
}

// changing the interval or switching on starts the countdown from now
function restart() {
  settings.lastAt = Date.now();
  save();
  render();
}

// ---------- the reminder itself ----------
function answer(kind) {
  const now = Date.now();
  if (kind === 'done') addGlass(settings, now);
  if (kind === 'snooze') snooze(settings, now);
  save();
  stopAlarm();
  pop.hidden = true;
  render();
}

function alertNow(test = false) {
  const baby = chosenBaby();
  if (!baby) return;
  const sex = sexOf(baby);
  const bubble = document.getElementById('waterBubble');
  bubble.innerHTML = `
    <button class="close" type="button" data-water="close" aria-label="Close">×</button>
    <p class="water-name">${esc(baby.name)} says:</p>
    <p class="water-msg">${MESSAGE}</p>
    <p class="hint">Glasses today: ${glassesToday(settings, Date.now())}</p>
    <div class="row">
      <button class="btn small" type="button" data-water="done">Done</button>
      <button class="ghost" type="button" data-water="snooze">Snooze ${SNOOZE_MIN} min</button>
    </div>`;
  bubble.querySelectorAll('[data-water]').forEach(b => b.addEventListener('click', () => answer(b.dataset.water)));
  const dino = document.getElementById('waterDino');
  dino.innerHTML = '';
  // the water scene has a fixed size, so every stage is drawn as big as a baby there
  dino.appendChild(dressedArt(baby.type, DINO_PX / stageOf(baby).scale, sex, wornGear(baby), baby.outfit, stageOf(baby).id, baby.scars, baby.scarBy));
  pop.hidden = false;
  pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');

  if (settings.sound) startAlarm(test ? 4 : 60);

  if (!test && settings.notify && document.hidden && canNotify() && Notification.permission === 'granted') {
    const icon = spriteUrl(baby.type, sex);
    try {
      const n = new Notification(MESSAGE, { body: `${baby.name} is reminding you.`, icon: icon ? new URL(icon, location.href).href : undefined, tag: 'water' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) { /* some browsers only allow notifications from a service worker */ }
  }
}

function check() {
  // another tab of the game may have shown the reminder already
  settings.lastAt = Math.max(settings.lastAt, read().lastAt);
  if (!isDue(settings, Date.now()) || !chosenBaby()) return;
  settings.lastAt = Date.now();
  save();
  alertNow();
  if (!document.getElementById('panelNest').hidden) render();
}

export function initWater() {
  settings = read();
  // the first click or key press on the page allows the alarm to play later, even in the background
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlockAudio, { once: true, capture: true });
  render();
  subscribe(() => { if (!body.contains(document.activeElement)) render(); });
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();
}
