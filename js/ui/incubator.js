// Incubator tab: pick an egg, warm it, hatch it and name the baby.
import { SPECIES, ORDER, SEX, ITEMS } from '../config.js';
import { S, subscribe } from '../state.js';
import { eggProgress } from '../economy.js';
import { act, hatch as hatchEgg } from '../actions.js';
import { now } from '../clock.js';
import { eggSVG, NEST, babyArt } from '../art.js';
import { fmt, minsLabel, esc } from '../util.js';
import { setTab } from './tabs.js';

const stage = document.getElementById('stage');
let reveal = null;        // the fresh hatchling while it is being named
let hatching = false;     // the shell-opening animation is playing
let shownStage = -1, tick = null;
let confirmGiveUp = false, giveUpTimer = null;

const crackStage = f => f >= .75 ? 3 : f >= .5 ? 2 : f >= .25 ? 1 : 0;

function render() {
  clearInterval(tick); tick = null; shownStage = -1;
  if (reveal) renderReveal();
  else if (S.current) renderIncubator();
  else renderChooser();
}

function renderChooser() {
  stage.innerHTML = `
    <div><h2>Pick an egg to hatch</h2>
    <p class="sub">Every egg hides a species. The rarer the egg, the longer it takes to hatch.</p></div>
    <div class="eggs">${ORDER.map(k => {
      const sp = SPECIES[k];
      return `<button class="egg-card" type="button" data-k="${k}">
        ${eggSVG(sp)}<strong>${sp.egg}</strong><span>Hatches in ${minsLabel(sp.mins)}</span>
        <span class="rarity">${sp.rarity}</span></button>`;
    }).join('')}</div>`;
  stage.querySelectorAll('.egg-card').forEach(b => b.addEventListener('click', () => {
    if (act('startEgg', { type: b.dataset.k }).ok) render();
  }));
}

function renderIncubator() {
  const sp = SPECIES[S.current.type];
  stage.innerHTML = `
    <div class="incubator">
      <div class="nest-area" id="nestArea">
        <button class="egg-btn" id="egg" type="button" aria-label="Warm the egg"></button>
        ${NEST}
      </div>
      <div class="info">
        <p class="eyebrow">${sp.egg} · ${sp.rarity}</p>
        <div class="timer" id="timer">0:00</div>
        <div>
          <div class="bar"><i id="fill"></i><b style="left:25%"></b><b style="left:50%"></b><b style="left:75%"></b></div>
          <div class="stages" id="stages"><span>Still</span><span>Wiggling</span><span>Chipping</span><span>Cracking</span><span>Ready</span></div>
        </div>
        <p class="hint" id="hint">Tap the egg to warm it. Each tap saves 1 second.</p>
        <div class="row" id="actions"></div>
      </div>
    </div>`;
  document.getElementById('egg').addEventListener('click', onEggTap);
  renderActions();
  update();
  tick = setInterval(update, 250);
}

function renderActions() {
  const a = document.getElementById('actions');
  if (!a || !S.current) return;
  const ready = eggProgress(S.current, now()).frac >= 1;
  a.innerHTML = ready
    ? `<button class="btn" id="hatch" type="button">Hatch!</button>`
    : `<button class="ghost ${confirmGiveUp ? 'warn' : ''}" id="giveup" type="button">${confirmGiveUp ? 'Tap again to throw this egg away' : 'Change egg'}</button>`;
  if (ready) document.getElementById('hatch').addEventListener('click', hatch);
  else document.getElementById('giveup').addEventListener('click', () => {
    if (confirmGiveUp) { confirmGiveUp = false; act('giveUpEgg'); render(); return; }
    confirmGiveUp = true; renderActions();
    clearTimeout(giveUpTimer);
    giveUpTimer = setTimeout(() => { confirmGiveUp = false; renderActions(); }, 4000);
  });
}

function update() {
  if (!S.current) return;
  const { frac, left } = eggProgress(S.current, now());
  const ready = frac >= 1;
  document.getElementById('timer').textContent = ready ? 'Ready!' : fmt(left);
  document.getElementById('fill').style.width = (frac * 100).toFixed(2) + '%';
  const idx = ready ? 4 : Math.min(3, Math.floor(frac * 4));
  document.querySelectorAll('#stages span').forEach((s, i) => s.classList.toggle('on', i === idx));
  const egg = document.getElementById('egg');
  egg.style.setProperty('--amp', (1 + frac * 7).toFixed(2));
  egg.style.animationDuration = ready ? '1.1s' : (3 - frac * 1.6).toFixed(2) + 's';
  const st = crackStage(frac) + (ready ? 1 : 0);
  if (st !== shownStage) {
    const wasReady = shownStage === 4;
    shownStage = st;
    egg.innerHTML = eggSVG(SPECIES[S.current.type], Math.min(3, st));
    egg.classList.toggle('ready', ready);
    egg.setAttribute('aria-label', ready ? 'Hatch the egg' : 'Warm the egg');
    document.getElementById('hint').textContent = ready
      ? 'The baby is tapping on the shell. Tap the egg or Hatch!'
      : 'Tap the egg to warm it. Each tap saves 1 second.';
    if (ready !== wasReady) renderActions();
  }
}

function onEggTap(e) {
  if (!S.current) return;
  if (eggProgress(S.current, now()).frac >= 1) { hatch(); return; }
  const egg = e.currentTarget;
  const saved = act('warmEgg', { taps: 1 }).ok;
  egg.classList.remove('tap'); void egg.offsetWidth; egg.classList.add('tap');
  const area = document.getElementById('nestArea');
  const f = document.createElement('span');
  f.className = 'float';
  f.textContent = saved ? '+1 s' : 'Already toasty';
  const r = area.getBoundingClientRect();
  f.style.left = ((e.clientX || r.left + r.width / 2) - r.left - 14) + 'px';
  f.style.top = ((e.clientY || r.top + 60) - r.top - 20) + 'px';
  area.appendChild(f);
  setTimeout(() => f.remove(), 900);
  if (saved) update();
}

async function hatch() {
  if (!S.current || reveal || hatching) return;
  if (eggProgress(S.current, now()).frac < 1) return;
  const type = S.current.type;
  hatching = true;
  clearInterval(tick); tick = null;
  const egg = document.getElementById('egg');
  egg.disabled = true;
  document.getElementById('actions').innerHTML = '<p class="hint">Hatching…</p>';
  // signed-in players wait for the server, which rolls the baby
  const result = await hatchEgg();
  if (!result.ok) {
    hatching = false;
    render();
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = result.reason === 'not-ready'
      ? 'Almost there. The egg needs a few more seconds.'
      : "Couldn't reach the server. Check your connection and try again.";
    return;
  }
  egg.classList.remove('ready');
  egg.innerHTML = eggSVG(SPECIES[type], 3, true);
  document.getElementById('actions').innerHTML = '';
  requestAnimationFrame(() => requestAnimationFrame(() => egg.classList.add('open')));
  const baby = babyArt(type, 7, result.baby.sex);
  baby.className = 'baby-pop';
  const area = document.getElementById('nestArea');
  setTimeout(() => area.appendChild(baby), 350);
  // the baby is already saved with a default name, so closing the page now loses nothing
  const loot = `+${result.coins} coins. ` + (result.lost
    ? 'Your inventory is full, so the shell was lost.'
    : `+1 ${ITEMS[result.lootId].name} in your inventory.`);
  setTimeout(() => {
    hatching = false;
    reveal = { baby: result.baby, loot };
    render();
  }, 1500);
}

function renderReveal() {
  const { baby, loot } = reveal;
  const sp = SPECIES[baby.type], sx = SEX[baby.sex];
  stage.innerHTML = `
    <div class="incubator">
      <div class="nest-area" id="nestArea">${NEST}</div>
      <div class="info">
        <p class="eyebrow">It's a ${baby.sex === 'm' ? 'boy' : 'girl'}! A ${sx.word.toLowerCase()} ${sp.species} ${sx.sym}</p>
        <h2>Name your baby</h2>
        <p class="fact">${esc(sp.fact)}</p>
        <p class="hint">${baby.sex === 'm' ? 'Males have bright colors and extra feathers, crests or stripes.' : 'Females have a single base color and no decorations.'} ${esc(loot)}</p>
        <form class="info" id="nameForm">
          <div class="field"><label for="babyName">Name</label>
          <input type="text" id="babyName" maxlength="24" value="${esc(baby.name)}" autocomplete="off"></div>
          <div class="row"><button class="btn" type="submit">Take to the nest</button></div>
        </form>
      </div>
    </div>`;
  const art = babyArt(baby.type, 7, baby.sex);
  art.className = 'baby-pop';
  document.getElementById('nestArea').prepend(art);
  const input = document.getElementById('babyName');
  input.focus({ preventScroll: true }); input.select();
  document.getElementById('nameForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = input.value.trim() || baby.name;
    const saved = S.hatched.find(x => x.id === baby.id);
    reveal = null;
    if (saved && saved.name !== name) act('rename', { id: baby.id, name });
    render();
    setTab('nest');
  });
}

export function initIncubator() {
  render();
  // only a replaced save redraws from scratch; normal changes are drawn by the actions above
  subscribe(kind => { if (kind === 'reset' && !hatching) { reveal = null; render(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.current && !reveal && !hatching) update(); });
}
