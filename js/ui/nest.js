// Nest tab: the walking babies, their growth capsules, and the collection of hatched babies.
import { SPECIES, SEX, ITEMS, STAGES, CAPSULE } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, needsCapsule, hungerEvery, isAdult, ageOf, countItem, wornGear, stageOf, nextStage, mealsFor } from '../economy.js';
import { act } from '../actions.js';
import { expeditionOf, isAway, injuredLeft, isCritical, inHospital, flyingLeft } from '../world.js';
import { now as gameNow } from '../clock.js';
import { scarLevels, woundsOf } from '../journey.js';
import { dressedArt, sleepArt, ITEM_ICONS, adultWalk, sheetFor, face } from '../art.js';
import { plural, fmt, ageLabel, realSpanMins } from '../util.js';
import { skyAt, sunTimes, sunHours, moonPhase, moonAltitude, placeOf, worldTime, WORLD_DAY } from '../sun.js';
import { powerText } from './stats.js';
import { openBabyInfo } from './baby-info.js';
import { currentTab, onTabChange } from './tabs.js';

const scene = document.getElementById('scene');
const walkers = new Map();
// An adult with a walk cycle of its own (and no outfit over it) walks with it, at the pace its feet carry
// it: { speed in px/s, swap(walking): to its walk and back }, or null
function gaitOf(b, art) {
  const g = stageOf(b).id === 'adult' && !b.outfit ? adultWalk(b.type, sexOf(b)) : null;
  const img = art.tagName === 'IMG' || art.tagName === 'CANVAS' ? art : art.querySelector('.dino-base');
  if (!g || !img) return null;
  const tall = parseFloat(img.style.height) || 70, speed = g.step * tall / (g.frames / 2 * g.ms / 1000);
  // (drawn from its sheets, with its scars and equipment: the walk's sheet while it walks)
  if (img.tagName === 'CANVAS') {
    const walk = sheetFor(g.src), idle = img.sheet;
    return walk && idle ? { speed, swap: on => { img.sheet = on ? walk : idle; img.dirty = true; } } : null;
  }
  const still = img.src;
  return { speed, swap: on => { img.src = on ? g.src : still; } };
}
const sceneW = () => scene.clientWidth || 600;
const findBaby = id => S.hatched.find(b => b.id === id);
const nameTag = b => b.name + ' ' + SEX[sexOf(b)].sym;
// how far through its stage it is, from 0 to 1
function growthShare(b) {
  const next = nextStage(b);
  if (!next) return 1;
  const from = mealsFor(b, stageOf(b)), to = mealsFor(b, next.stage);
  return Math.min(1, Math.max(0, ((b.fed || 0) - from) / Math.max(1, to - from)));
}
// what a baby looks like right now, for redrawing when it changes
const lookKey = b => JSON.stringify([wornGear(b), b.outfit || null, stageOf(b).id, scarLevels(b), b.scarBy || null, woundsOf(S, b, gameNow()), b.sewn || null]);

function renderBabies() {
  const box = document.getElementById('babies');
  const n = S.hatched.length;
  document.getElementById('count').textContent = n ? String(n) : '';
  box.innerHTML = '';
  if (!n) {
    box.className = '';
    box.innerHTML = '<p class="empty">The nest is still empty. Dinosaurs show up here once they hatch.</p>';
  } else {
    box.className = 'babies';
    for (const b of S.hatched) {
      const sp = SPECIES[b.type], sex = sexOf(b);
      // the whole card opens the baby's details
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'baby';
      card.setAttribute('aria-label', `${b.name}, ${sp.species}. Show stats`);
      card.addEventListener('click', () => openBabyInfo(b.id));
      const art = document.createElement('span'); art.className = 'baby-art';
      art.appendChild(dressedArt(b.type, 3, sex, wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, gameNow()), b.sewn, b.id, b.blind));
      const info = document.createElement('span'); info.className = 'baby-info-col';
      const nm = document.createElement('strong'); nm.textContent = nameTag(b);
      const sps = document.createElement('span'); sps.className = 'meta'; sps.textContent = `${sp.species} · ${ageLabel(ageOf(b, gameNow()))}`;
      // the stage, and how far it is to the next
      const next = nextStage(b), st = stageOf(b);
      const grow = document.createElement('span'); grow.className = 'growth';
      grow.innerHTML = `<span>${st.name}${next ? ` <span class="meta">· ${plural(next.mealsLeft, 'capsule', 'capsules')} to ${next.stage.name}</span>` : ''}</span>${next ? `<i class="bar"><b style="width:${Math.round(growthShare(b) * 100)}%"></b></i>` : ''}`;
      const fed = document.createElement('span'); fed.className = 'fed'; fed.dataset.id = b.id;
      const gen = document.createElement('span'); gen.className = 'meta'; gen.textContent = `Gen ${b.gen || 1} · ${powerText(b)}`;
      const gear = document.createElement('span'); gear.className = 'gear-icons';
      gear.innerHTML = Object.values(wornGear(b)).map(id => `<span class="gear-icon" title="${ITEMS[id].name}">${ITEM_ICONS[id]}</span>`).join('');
      info.append(nm, sps, grow, fed, gen, gear);
      card.append(art, info);
      box.appendChild(card);
    }
  }
  syncWalkers();
  checkHunger();
}

function checkHunger() {
  const now = gameNow();
  let hungryCount = 0;
  for (const b of S.hatched) {
    // (one flown home is home once it lands, its report still to read)
    const trip = isAway(S, b.id, now) ? expeditionOf(S, b.id) : null;
    // explorers are away: they don't grow until they are home again
    const hungry = !trip && needsCapsule(b, now);
    if (hungry) hungryCount++;
    const w = walkers.get(b.id);
    if (w && w.hungry !== hungry) {
      w.hungry = hungry;
      w.bubble.hidden = !hungry;
      w.el.setAttribute('aria-label', b.name + (hungry ? ', needs a growth capsule. Tap to give it one.' : ''));
    }
    const fed = document.querySelector(`.fed[data-id="${b.id}"]`);
    if (fed) {
      const hurt = injuredLeft(b, now);
      fed.textContent = trip ? (!trip.leg ? 'Out in the world, waiting for orders · see the World tab'
          : now >= trip.leg.arriveAt ? 'A journey to tell! See the World tab'
          : (trip.leg.to === '0,0' ? 'On the way home · back in ' : 'Exploring · there in ') + fmt(trip.leg.arriveAt - now))
        : flyingLeft(b, now) ? 'Flown home by air · lands in ' + fmt(flyingLeft(b, now))
        : inHospital(b, now) ? 'In the hospital · out in ' + fmt(hurt)
        : hungry ? 'Needs a growth capsule!' : hurt ? (isCritical(b, now) ? 'Critically injured · heals in ' : 'Injured · heals in ') + fmt(hurt)
        : isAdult(b) ? '' : 'Growing · next capsule in ' + fmt(b.lastFed + hungerEvery(b) - now);
      fed.classList.toggle('hungry', hungry);
    }
  }
  // young ones whose capsule wore off ask for the next, or say there is none left
  const caps = countItem(S, CAPSULE.item);
  for (const w of walkers.values()) {
    if (!w.hungry) continue;
    const key = caps ? 'ask' : 'none';
    if (w.askFor === key) continue;
    w.askFor = key;
    w.bubble.innerHTML = ITEM_ICONS[CAPSULE.item] + `<span>${caps ? 'Needs a capsule' : 'Out of capsules!'}</span>`;
  }
  const fs = document.getElementById('foodStock');
  const fsText = `${ITEM_ICONS[CAPSULE.item]}<span><b>${caps}</b> growth ${caps === 1 ? 'capsule' : 'capsules'}${caps ? '' : ' · buy some in the Shop'}</span><span class="meta">One a day for a baby or a juvenile (a day here is ${realSpanMins(CAPSULE.every.baby * 60)}). The keepers feed everyone.</span>`;
  if (fs.dataset.html !== fsText) { fs.dataset.html = fsText; fs.innerHTML = fsText; }
  bills();
  const pill = document.getElementById('hungryPill');
  pill.hidden = hungryCount === 0;
  pill.textContent = hungryCount;
  pill.title = plural(hungryCount, 'growth capsule', 'growth capsules') + ' due';
}

function syncWalkers() {
  // dinosaurs out exploring, in the air or in the hospital are not in the nest
  const t = gameNow();
  const home = S.hatched.filter(b => !isAway(S, b.id, t) && !flyingLeft(b, t) && !inHospital(b, t));
  const ids = new Set(home.map(b => b.id));
  for (const [id, w] of walkers) if (!ids.has(id)) { w.el.remove(); walkers.delete(id); }
  for (const b of home) {
    const have = walkers.get(b.id);
    if (have) {
      have.name.textContent = nameTag(b);
      // redraw when the baby grows, or puts on or takes off equipment
      const key = lookKey(b);
      if (have.gearKey !== key) {
        const art = dressedArt(b.type, 4, sexOf(b), wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, gameNow()), b.sewn, b.id, b.blind);
        art.style.transform = have.art.style.transform; have.faced = null;
        have.art.replaceWith(art);
        have.art = art;
        setSleepArt(have, b);
        have.gearKey = key;
        have.gait = gaitOf(b, art); have.walking = false;
        if (have.gait) have.speed = have.gait.speed;
      }
      continue;
    }
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'walker';
    const bubble = document.createElement('span');
    bubble.className = 'bubble'; bubble.hidden = true;
    bubble.innerHTML = ITEM_ICONS[CAPSULE.item] + '<span>Needs a capsule</span>';
    const art = dressedArt(b.type, 4, sexOf(b), wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, gameNow()), b.sewn, b.id, b.blind);
    const name = document.createElement('span'); name.className = 'nm'; name.textContent = nameTag(b);
    // (its awake and its sleeping drawing on the same spot, one fading into the other: .pose)
    const pose = document.createElement('span'); pose.className = 'pose'; pose.append(art);
    el.append(bubble, pose, name);
    const depth = Math.random();
    el.style.bottom = Math.round(12 + depth * 60) + 'px';
    el.style.zIndex = String(200 - Math.round(depth * 100));
    const w = {
      id: b.id, el, art, bubble, name, hungry: null, gearKey: lookKey(b),
      x: Math.random() * (sceneW() - 70), dir: Math.random() < .5 ? 1 : -1,
      speed: 28 + Math.random() * 26, pause: Math.random() * 1.5, walk: 1 + Math.random() * 3, t: Math.random() * 6, hop: 0,
      gait: gaitOf(b, art), walking: false,
    };
    if (w.gait) w.speed = w.gait.speed;
    setSleepArt(w, b);
    el.addEventListener('click', () => feed(w));
    scene.appendChild(el);
    walkers.set(b.id, w);
    sleep(w);
  }
  const empty = document.getElementById('sceneEmpty');
  empty.hidden = walkers.size > 0;
  empty.textContent = S.hatched.length ? 'Everyone is out exploring. Check the World tab.' : 'No babies yet. Hatch an egg in the Incubator tab.';
}

// its sleeping drawing, when its kind has one at its stage (SLEEP_SPRITES): asleep, it fades into it
function setSleepArt(w, b) {
  const img = sleepArt(b.type, 4, sexOf(b), stageOf(b).id, b.outfit, b.scars, b.scarBy, woundsOf(S, b, gameNow()), b.sewn, b.id);
  if (w.sleepImg) w.sleepImg.remove();
  w.sleepImg = img;
  if (img) { w.art.after(img); w.faced = null; }
  w.el.classList.toggle('can-sleep', !!img);
}

// the sanctuary's bills, paid when the player chooses (every coin that comes in goes to them meanwhile)
function bills() {
  const box = document.getElementById('bills');
  box.hidden = !S.debt;
  if (!S.debt) { box.innerHTML = ''; return; }
  const can = Math.min(S.coins, S.debt);
  const html = `<p><strong>${S.debt} coins owed</strong> <span class="meta">for air rescues and the hospital. Every coin you earn goes to it until it is paid.</span></p>
    <button class="btn small" type="button" id="payDebt" ${can ? '' : 'disabled'}>${can ? `Pay ${can} coins${can < S.debt ? ' of it' : ''}` : 'No coins to pay with'}</button>`;
  if (box.dataset.html === html) return;
  box.dataset.html = html;
  box.innerHTML = html;
  box.querySelector('#payDebt').addEventListener('click', () => act('payDebt', {}));
}

// ---------- day and night ----------
// the nest's own sun time (its longitude's, sun.js), the world's clock for every player
const NEST_PLACE = placeOf([0, 0]);
const clockFmt = { format: t => nestClock.format(new Date(worldTime(t))) };
const nestClock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
// the moon's lit side: right while it waxes, left as it wanes (seen from the north)
function moonPath(p) {
  const k = Math.cos(2 * Math.PI * p), rx = (Math.abs(k) * 10).toFixed(2), waxing = p < 0.5;
  return `M0 -10 A10 10 0 0 ${waxing ? 1 : 0} 0 10 A${rx} 10 0 0 ${waxing === (k > 0) ? 0 : 1} 0 -10Z`;
}
// where a body stands on the scene: across it from rising to setting, as high as its altitude
const across = hours => (6 + Math.min(1, Math.max(0, (hours - 6) / 12)) * 88).toFixed(1) + '%';
const height = alt => (42 - Math.max(-10, alt) / 75 * 36).toFixed(1) + '%';
let asleepKey = null;
function updateSky() {
  const d = gameNow(), sky = skyAt(d, NEST_PLACE), st = scene.style;
  st.setProperty('--dark', sky.dark.toFixed(3));
  st.setProperty('--glow', Math.max(0, 1 - Math.abs(sky.alt) / 8).toFixed(3));
  st.setProperty('--stars', Math.max(0, (sky.dark - 0.6) / 0.4).toFixed(3));
  const hours = sunHours(d, NEST_PLACE.lon);
  st.setProperty('--sun-x', across(hours)); st.setProperty('--sun-y', height(sky.alt));
  st.setProperty('--sun-o', sky.alt > -4 ? '1' : '0');
  // the moon trails the sun by its age through the month: full, it rises at sunset
  const p = moonPhase(d), lag = p * 24, moonAlt = moonAltitude(d, NEST_PLACE);
  st.setProperty('--moon-x', across(((hours - lag) % 24 + 24) % 24)); st.setProperty('--moon-y', height(moonAlt));
  st.setProperty('--moon-o', moonAlt > -4 && p > 0.03 && p < 0.97 ? (0.35 + 0.65 * sky.dark).toFixed(2) : '0');
  scene.querySelector('.moon path').setAttribute('d', moonPath(p));
  const t = sunTimes(d, NEST_PLACE), tomorrow = sunTimes(d + WORLD_DAY, NEST_PLACE);
  const label = clockFmt.format(d) + ' · ' + (!t ? (sky.phase === 'night' ? 'Polar night' : 'Midnight sun')
    : sky.phase === 'day' ? `Day · sunset ${clockFmt.format(t.set)}`
    : sky.phase === 'dusk' ? (d < t.set ? `Dusk · sunset ${clockFmt.format(t.set)}` : 'Dusk')
    : sky.phase === 'dawn' ? (d < t.rise ? `Dawn · sunrise ${clockFmt.format(t.rise)}` : 'Dawn')
    : `Night · sunrise ${clockFmt.format(d < t.rise ? t.rise : tomorrow.rise)}`);
  const chip = document.getElementById('skyTime');
  if (chip.textContent !== label) chip.textContent = label;
  // most sleep at night; a night hunter by day; some are awake either way (SPECIES active)
  asleepKey = sky.phase;
  for (const w of walkers.values()) sleep(w);
}
function sleep(w) {
  const b = findBaby(w.id), active = b && SPECIES[b.type].active;
  w.asleep = !!b && active !== 'both' && (asleepKey === 'night' ? active !== 'night' : asleepKey === 'day' && active === 'night');
  w.el.classList.toggle('asleep', w.asleep);
  w.el.title = w.asleep ? `${b.name} is asleep` : '';
}

function popText(w, cls, text) {
  const p = document.createElement('span');
  p.className = cls; p.textContent = text;
  p.style.left = (w.x + 22) + 'px';
  p.style.bottom = (parseInt(w.el.style.bottom, 10) + 70) + 'px';
  scene.appendChild(p);
  setTimeout(() => p.remove(), cls === 'grew' ? 2400 : 1200);
}

function feed(w) {
  const result = act('feed', { id: w.id });
  if (result.ok) {
    w.hop = 0.45;
    w.askFor = null;
    popText(w, 'heart', '♥ +' + result.coins);
    if (result.grewTo) {
      const b = S.hatched.find(x => x.id === w.id);
      const st = STAGES.find(x => x.id === result.grewTo);
      if (b && st) setTimeout(() => popText(w, 'grew', `${b.name} grew into ${st.id === 'adult' ? 'an adult' : 'a juvenile'}!`), 500);
    }
  } else if (result.reason === 'no-food') {
    popText(w, 'say', `No ${ITEMS[CAPSULE.item].plural} left: buy some in the Shop`);
  } else if (result.reason === 'full' || result.reason === 'grown') {
    w.hop = 0.45;
    popText(w, 'say', result.reason === 'grown' ? "I'm all grown up" : 'My capsule is still working');
  }
}

// ---------- walking ----------
let raf = null, lastT = 0;
function step(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  const sw = sceneW();
  for (const w of walkers.values()) {
    const maxX = sw - (w.el.offsetWidth || 70) - 4;
    let moving = false;
    if (w.asleep) { /* (lying still) */ }
    else if (w.pause > 0) w.pause -= dt;
    else {
      moving = true;
      // (one walking with its own feet keeps their pace, hungry or not)
      w.x += w.dir * w.speed * (w.hungry && !w.gait ? 0.45 : 1) * dt;
      w.walk -= dt; w.t += dt * 12;
      if (w.x < 4) { w.x = 4; w.dir = 1; }
      if (w.x > maxX) { w.x = maxX; w.dir = -1; }
      if (w.walk <= 0) { w.pause = 0.6 + Math.random() * 2.4; w.walk = 1.5 + Math.random() * 4; if (Math.random() < .45) w.dir *= -1; }
    }
    // its own walk when it has one (its body already bobs in it), a little bounce otherwise
    if (w.gait && moving !== w.walking) { w.walking = moving; w.gait.swap(moving); }
    let lift = moving && !w.gait ? Math.abs(Math.sin(w.t)) * 3 : 0;
    if (w.hop > 0) { w.hop -= dt; lift += Math.sin(Math.PI * (1 - Math.max(0, w.hop) / 0.45)) * 16; }
    w.el.style.transform = `translate(${w.x.toFixed(1)}px, ${(-lift).toFixed(1)}px)`;
    if (w.dir !== w.faced) { w.faced = w.dir; face(w.art, w.dir); if (w.sleepImg) face(w.sleepImg, w.dir); }
  }
  raf = requestAnimationFrame(step);
}
function runScene(on) {
  if (on && !raf) { lastT = performance.now(); raf = requestAnimationFrame(step); }
  if (!on && raf) { cancelAnimationFrame(raf); raf = null; }
}
const sceneVisible = () => currentTab() === 'nest' && !document.hidden;

export function initNest() {
  updateSky();
  // (the world's day passes in about half a real hour: the sky moves on every couple of seconds)
  setInterval(updateSky, 2000);
  renderBabies();
  // the cards and walkers are rebuilt only while the tab is open; the hungry badge updates everywhere
  subscribe(() => currentTab() === 'nest' ? renderBabies() : checkHunger());
  setInterval(checkHunger, 1000);
  // (ones landing, or out of the hospital, join the others)
  setInterval(() => { if (currentTab() === 'nest') syncWalkers(); }, 5000);
  onTabChange(name => {
    if (name === 'nest') {
      updateSky();
      renderBabies();
      for (const w of walkers.values()) w.x = Math.min(w.x, sceneW() - 70);
    }
    runScene(sceneVisible());
  });
  document.addEventListener('visibilitychange', () => {
    runScene(sceneVisible());
    if (!document.hidden) checkHunger();
  });
}
