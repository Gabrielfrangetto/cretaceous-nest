// Breeding panel in the Nest tab: pick a male and a female of the same species; after a while
// they lay an egg that goes to the egg tray, ready to hatch in the Incubator.
import { SPECIES, SEX, STATS, STAT_MAX, BREED_MINS, BREED_STAT_CHANGE, EGG_TRAY_SIZE } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, breedProblem } from '../economy.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { esc, fmt, minsLabel } from '../util.js';
import { statsHTML, totalText } from './stats.js';
import { currentTab, onTabChange } from './tabs.js';

const body = document.getElementById('breedBody');
let maleId = null, femaleId = null, confirmCancel = false, message = '';

const PROBLEMS = {
  'tray-full': `The egg tray is full (${EGG_TRAY_SIZE} eggs). Hatch some eggs first.`,
  busy: 'A pair is already breeding.',
};

const label = b => `${b.name} ${SEX[sexOf(b)].sym} · ${SPECIES[b.type].species} · Gen ${b.gen || 1} · ${totalText(b.stats)}`;
const byId = id => S.hatched.find(b => b.id === id);

function rangeHTML(m, f) {
  const [down, up] = BREED_STAT_CHANGE;
  return `<ul class="breed-range">${STATS.map(({ id, short }) => {
    const lo = Math.max(1, Math.min(m.stats[id], f.stats[id]) + down);
    const hi = Math.min(STAT_MAX, Math.max(m.stats[id], f.stats[id]) + up);
    return `<li><span>${short}</span> ${lo}–${hi}</li>`;
  }).join('')}</ul>`;
}

function render() {
  const t = now();
  const tray = (S.eggs || []).length;
  const trayLine = `<p class="hint">Egg tray: <strong>${tray} / ${EGG_TRAY_SIZE}</strong>${tray ? '. Hatch them from the Incubator.' : '.'}</p>`;
  const note = message ? `<p class="hint" role="status">${esc(message)}</p>` : '';

  if (S.breeding) {
    const br = S.breeding, m = byId(br.maleId), f = byId(br.femaleId);
    const total = br.readyAt - br.startedAt, left = br.readyAt - t, ready = left <= 0;
    body.innerHTML = `
      <p><strong>${esc(m ? m.name : '?')} ${SEX.m.sym}</strong> and <strong>${esc(f ? f.name : '?')} ${SEX.f.sym}</strong> are nesting together (${SPECIES[br.type].species}).</p>
      <div class="bar"><i style="width:${Math.min(100, (1 - Math.max(0, left) / total) * 100).toFixed(1)}%"></i></div>
      <p class="hint">${ready ? 'Their egg is ready!' : `Egg in ${fmt(left)}`}</p>
      <div class="row">
        ${ready ? '<button class="btn" type="button" id="collectEgg">Collect the egg</button>' : ''}
        <button class="ghost ${confirmCancel ? 'warn' : ''}" type="button" id="cancelBreed">${confirmCancel ? 'Tap again to stop breeding' : 'Stop breeding'}</button>
      </div>
      ${trayLine}${note}`;
    const collect = document.getElementById('collectEgg');
    if (collect) collect.addEventListener('click', () => {
      const r = act('collectEgg');
      message = r.ok ? `A new ${SPECIES[r.egg.type].egg} (Gen ${r.egg.gen}) is in the egg tray.` : PROBLEMS[r.reason] || 'The egg could not be collected.';
      render();
    });
    document.getElementById('cancelBreed').addEventListener('click', () => {
      if (!confirmCancel) { confirmCancel = true; render(); setTimeout(() => { confirmCancel = false; render(); }, 4000); return; }
      confirmCancel = false;
      act('cancelBreeding');
      message = '';
      render();
    });
    return;
  }

  const males = S.hatched.filter(b => sexOf(b) === 'm');
  const pairable = males.filter(m => S.hatched.some(f => f.type === m.type && sexOf(f) === 'f'));
  if (!pairable.length) {
    body.innerHTML = `<p class="hint">To breed you need a male and a female of the same species. Babies inherit their parents' stats, so pick your best pair.</p>${trayLine}${note}`;
    return;
  }
  if (!pairable.some(m => m.id === maleId)) maleId = pairable[0].id;
  const male = byId(maleId);
  const females = S.hatched.filter(f => f.type === male.type && sexOf(f) === 'f');
  if (!females.some(f => f.id === femaleId)) femaleId = females[0].id;
  const female = byId(femaleId);
  const problem = breedProblem(S, maleId, femaleId);

  body.innerHTML = `
    <div class="breed-grid">
      <div class="field"><label for="breedMale">Male ${SEX.m.sym}</label>
        <select id="breedMale">${pairable.map(b => `<option value="${esc(b.id)}" ${b.id === maleId ? 'selected' : ''}>${esc(label(b))}</option>`).join('')}</select>
        ${statsHTML(male.stats, { compact: true })}
      </div>
      <div class="field"><label for="breedFemale">Female ${SEX.f.sym}</label>
        <select id="breedFemale">${females.map(b => `<option value="${esc(b.id)}" ${b.id === femaleId ? 'selected' : ''}>${esc(label(b))}</option>`).join('')}</select>
        ${statsHTML(female.stats, { compact: true })}
      </div>
    </div>
    <div class="breed-expect"><span class="hint">Their baby's stats will land around:</span>${rangeHTML(male, female)}</div>
    <div class="row">
      <button class="btn" type="button" id="startBreed" ${problem ? 'disabled' : ''}>Breed them (${minsLabel(BREED_MINS[male.type])})</button>
    </div>
    ${problem && PROBLEMS[problem] ? `<p class="hint warn-text">${PROBLEMS[problem]}</p>` : ''}
    ${trayLine}${note}`;

  document.getElementById('breedMale').addEventListener('change', e => { maleId = e.target.value; femaleId = null; message = ''; render(); });
  document.getElementById('breedFemale').addEventListener('change', e => { femaleId = e.target.value; message = ''; render(); });
  document.getElementById('startBreed').addEventListener('click', () => {
    const r = act('startBreeding', { maleId, femaleId });
    message = r.ok ? '' : PROBLEMS[r.reason] || 'They cannot breed right now.';
    render();
  });
}

export function initBreeding() {
  const visible = () => currentTab() === 'nest' && !document.hidden;
  subscribe(() => { if (visible() && !body.contains(document.activeElement)) render(); });
  onTabChange(name => { if (name === 'nest') { message = ''; render(); } });
  // countdown while a pair is nesting
  setInterval(() => { if (S.breeding && visible()) render(); }, 1000);
}
