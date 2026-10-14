// Water reminder: a chosen baby pops up in the corner every few minutes to say it's time to drink
// water. Settings live in this browser only; they are a personal preference, not game progress.
import { SPECIES, SEX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf } from '../economy.js';
import { babyArt, spriteUrl } from '../art.js';
import { esc, plural } from '../util.js';
import {
  defaults, clampEvery, nextDue, isDue, snooze, addGlass, glassesToday, PRESETS, MIN_EVERY, MAX_EVERY, SNOOZE_MIN,
} from '../reminder.js';

const KEY = 'cretaceous-nest:water';
const CHECK_MS = 10000;
const MESSAGE = 'Time to drink water!';

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

function render() {
  if (!S.hatched.length) {
    body.innerHTML = '<p class="hint">Hatch a baby first, then pick one to remind you.</p>';
    return;
  }
  if (!chosenBaby()) { settings.babyId = S.hatched[0].id; save(); }
  const now = Date.now();
  const status = settings.on
    ? `Next reminder at ${timeFmt.format(new Date(Math.max(now, nextDue(settings))))}.`
    : 'Reminders are off.';
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
    <p class="hint" id="waterStatus">${status} Glasses today: ${glassesToday(settings, now)}.</p>
    <div class="row"><button class="ghost" type="button" id="waterTest">Show a test reminder</button></div>`;

  document.getElementById('waterBaby').addEventListener('change', e => { settings.babyId = e.target.value; save(); render(); });
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
  document.getElementById('waterTest').addEventListener('click', () => show(true));
}

// changing the interval or switching on starts the countdown from now
function restart() {
  settings.lastAt = Date.now();
  save();
  render();
}

function show(test = false) {
  const baby = chosenBaby();
  if (!baby) return;
  const sex = sexOf(baby);
  const dino = document.getElementById('waterDino');
  dino.innerHTML = '';
  dino.appendChild(babyArt(baby.type, 7, sex));
  document.getElementById('waterPopName').textContent = baby.name + ' says:';
  document.getElementById('waterPopCount').textContent = `Glasses today: ${glassesToday(settings, Date.now())}`;
  pop.hidden = false;
  pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');

  if (!test && settings.notify && document.hidden && canNotify() && Notification.permission === 'granted') {
    const icon = spriteUrl(baby.type, sex);
    try {
      new Notification(MESSAGE, { body: `${baby.name} is reminding you.`, icon: icon ? new URL(icon, location.href).href : undefined, tag: 'water' });
    } catch (e) { /* some browsers only allow notifications from a service worker */ }
  }
}

function hide() { pop.hidden = true; }

function check() {
  // another tab of the game may have shown the reminder already
  const latest = read();
  settings.lastAt = Math.max(settings.lastAt, latest.lastAt);
  if (!isDue(settings, Date.now()) || !chosenBaby()) return;
  settings.lastAt = Date.now();
  save();
  show();
  if (!document.getElementById('panelNest').hidden) render();
}

export function initWater() {
  settings = read();
  document.getElementById('waterDone').addEventListener('click', () => {
    addGlass(settings, Date.now());
    save(); hide(); render();
  });
  document.getElementById('waterSnooze').addEventListener('click', () => {
    snooze(settings, Date.now());
    save(); hide(); render();
  });
  document.getElementById('waterClose').addEventListener('click', hide);
  document.getElementById('waterSnooze').textContent = `Snooze ${SNOOZE_MIN} min`;
  render();
  subscribe(() => { if (!document.activeElement || !body.contains(document.activeElement)) render(); });
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();
}
