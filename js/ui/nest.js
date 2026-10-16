// Nest tab: the walking babies, their hunger and feeding, and the collection of hatched babies.
import { SPECIES, SEX, DIET, ITEMS, STAGES } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, isHungry, countItem, wornGear, stageOf, nextStage, mealFor } from '../economy.js';
import { act } from '../actions.js';
import { expeditionOf, injuredLeft, isCritical } from '../world.js';
import { now as gameNow } from '../clock.js';
import { dressedArt, ITEM_ICONS } from '../art.js';
import { plural, fmt } from '../util.js';
import { powerText } from './stats.js';
import { openBabyInfo } from './baby-info.js';
import { currentTab, onTabChange } from './tabs.js';

// every food a dinosaur can eat, in the order the stock line lists them
const FOODS = ['leaf', 'meat', 'insect', 'fish', 'raw_egg'];

const scene = document.getElementById('scene');
const walkers = new Map();
const sceneW = () => scene.clientWidth || 600;
const findBaby = id => S.hatched.find(b => b.id === id);
const nameTag = b => b.name + ' ' + SEX[sexOf(b)].sym;
// "Juvenile · 4 meals to Adult"
export function growthText(b) {
  const next = nextStage(b);
  return stageOf(b).name + (next ? ` · ${plural(next.mealsLeft, 'meal', 'meals')} to ${next.stage.name}` : '');
}
// what a baby looks like right now, for redrawing when it changes
const lookKey = b => JSON.stringify([wornGear(b), b.outfit || null, stageOf(b).id]);

function renderBabies() {
  const box = document.getElementById('babies');
  const n = S.hatched.length;
  document.getElementById('count').textContent = plural(n, 'baby', 'babies');
  box.innerHTML = '';
  if (!n) {
    box.className = '';
    box.innerHTML = '<p class="empty">The nest is still empty. Babies show up here once they hatch.</p>';
  } else {
    box.className = 'babies';
    const df = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    for (const b of S.hatched) {
      const sp = SPECIES[b.type], sex = sexOf(b);
      // the whole card opens the baby's details
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'baby';
      card.setAttribute('aria-label', `${b.name}, ${sp.species}. Show stats`);
      card.addEventListener('click', () => openBabyInfo(b.id));
      card.appendChild(dressedArt(b.type, 5, sex, wornGear(b), b.outfit, stageOf(b).id));
      const nm = document.createElement('strong'); nm.textContent = nameTag(b);
      const sps = document.createElement('span'); sps.textContent = sp.species + ' · ' + SEX[sex].word;
      const dt = document.createElement('span'); dt.textContent = 'Hatched ' + df.format(new Date(b.at));
      const grow = document.createElement('span'); grow.className = 'growth'; grow.textContent = growthText(b);
      const fed = document.createElement('span'); fed.className = 'fed'; fed.dataset.id = b.id;
      const gen = document.createElement('span'); gen.className = 'gen'; gen.textContent = `Gen ${b.gen || 1} · ${powerText(b)}`;
      const gear = document.createElement('span'); gear.className = 'gear-icons';
      gear.innerHTML = Object.values(wornGear(b)).map(id => `<span class="gear-icon" title="${ITEMS[id].name}">${ITEM_ICONS[id]}</span>`).join('');
      const more = document.createElement('span'); more.className = 'more'; more.textContent = 'See stats';
      card.append(nm, sps, grow, dt, fed, gen, gear, more);
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
    const trip = expeditionOf(S, b.id);
    // explorers are away: they get fed when they come home
    const hungry = !trip && isHungry(b, now);
    if (hungry) hungryCount++;
    const w = walkers.get(b.id);
    if (w && w.hungry !== hungry) {
      w.hungry = hungry;
      w.bubble.hidden = !hungry;
      w.el.setAttribute('aria-label', b.name + (hungry ? ', hungry. Tap to feed.' : ', full.'));
    }
    const fed = document.querySelector(`.fed[data-id="${b.id}"]`);
    if (fed) {
      const hurt = injuredLeft(b, now);
      fed.textContent = trip ? (!trip.leg ? 'Out in the world, waiting for orders · see the World tab'
          : now >= trip.leg.arriveAt ? 'A journey to tell! See the World tab'
          : (trip.leg.to === '0,0' ? 'On the way home · back in ' : 'Exploring · there in ') + fmt(trip.leg.arriveAt - now))
        : hungry ? 'Hungry!' : hurt ? (isCritical(b, now) ? 'Critically injured · heals in ' : 'Injured · heals in ') + fmt(hurt) : 'Ate ' + plural(b.fed || 0, 'time', 'times');
      fed.classList.toggle('hungry', hungry);
    }
  }
  // hungry babies ask for the food they would eat now, or say none of their foods is left
  for (const w of walkers.values()) {
    if (!w.hungry) continue;
    const b = findBaby(w.id); if (!b) continue;
    const meal = mealFor(S, b.type);
    const key = meal || 'none';
    if (w.askFor === key) continue;
    w.askFor = key;
    w.bubble.innerHTML = ITEM_ICONS[meal || DIET[b.type][0]] + `<span>${meal ? 'Wants ' + ITEMS[meal].plural : 'Out of food!'}</span>`;
  }
  const fs = document.getElementById('foodStock');
  const have = FOODS.map(id => [id, countItem(S, id)]).filter(([, n]) => n);
  const fsText = have.length
    ? `Food in your inventory: ${have.map(([id, n]) => `${n} ${n === 1 ? ITEMS[id].name.toLowerCase() : ITEMS[id].plural}`).join(', ')}. Each meal uses 1 of a food the baby eats.`
    : 'No food in your inventory. Buy some in the Shop, or bring it back from the World.';
  if (fs.textContent !== fsText) fs.textContent = fsText;
  const pill = document.getElementById('hungryPill');
  pill.hidden = hungryCount === 0;
  pill.textContent = hungryCount + ' hungry';
}

function syncWalkers() {
  // dinosaurs out exploring are not in the nest
  const home = S.hatched.filter(b => !expeditionOf(S, b.id));
  const ids = new Set(home.map(b => b.id));
  for (const [id, w] of walkers) if (!ids.has(id)) { w.el.remove(); walkers.delete(id); }
  for (const b of home) {
    const have = walkers.get(b.id);
    if (have) {
      have.name.textContent = nameTag(b);
      // redraw when the baby grows, or puts on or takes off equipment
      const key = lookKey(b);
      if (have.gearKey !== key) {
        const art = dressedArt(b.type, 4, sexOf(b), wornGear(b), b.outfit, stageOf(b).id);
        art.style.transform = have.art.style.transform;
        have.art.replaceWith(art);
        have.art = art;
        have.gearKey = key;
      }
      continue;
    }
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'walker';
    const bubble = document.createElement('span');
    bubble.className = 'bubble'; bubble.hidden = true;
    bubble.innerHTML = ITEM_ICONS[DIET[b.type][0]] + '<span>Hungry</span>';
    const art = dressedArt(b.type, 4, sexOf(b), wornGear(b), b.outfit, stageOf(b).id);
    const name = document.createElement('span'); name.className = 'nm'; name.textContent = nameTag(b);
    el.append(bubble, art, name);
    const depth = Math.random();
    el.style.bottom = Math.round(12 + depth * 60) + 'px';
    el.style.zIndex = String(200 - Math.round(depth * 100));
    const w = {
      id: b.id, el, art, bubble, name, hungry: null, gearKey: lookKey(b),
      x: Math.random() * (sceneW() - 70), dir: Math.random() < .5 ? 1 : -1,
      speed: 28 + Math.random() * 26, pause: Math.random() * 1.5, walk: 1 + Math.random() * 3, t: Math.random() * 6, hop: 0,
    };
    el.addEventListener('click', () => feed(w));
    scene.appendChild(el);
    walkers.set(b.id, w);
  }
  const empty = document.getElementById('sceneEmpty');
  empty.hidden = walkers.size > 0;
  empty.textContent = S.hatched.length ? 'Everyone is out exploring. Check the World tab.' : 'No babies yet. Hatch an egg in the Incubator tab.';
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
    const b = S.hatched.find(x => x.id === w.id);
    popText(w, 'say', 'It eats ' + DIET[b.type].map(id => ITEMS[id].plural).join(' or '));
  } else if (result.reason === 'full') {
    w.hop = 0.45;
    popText(w, 'say', "I'm full");
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
    if (w.pause > 0) w.pause -= dt;
    else {
      moving = true;
      w.x += w.dir * w.speed * (w.hungry ? 0.45 : 1) * dt;
      w.walk -= dt; w.t += dt * 12;
      if (w.x < 4) { w.x = 4; w.dir = 1; }
      if (w.x > maxX) { w.x = maxX; w.dir = -1; }
      if (w.walk <= 0) { w.pause = 0.6 + Math.random() * 2.4; w.walk = 1.5 + Math.random() * 4; if (Math.random() < .45) w.dir *= -1; }
    }
    let lift = moving ? Math.abs(Math.sin(w.t)) * 3 : 0;
    if (w.hop > 0) { w.hop -= dt; lift += Math.sin(Math.PI * (1 - Math.max(0, w.hop) / 0.45)) * 16; }
    w.el.style.transform = `translate(${w.x.toFixed(1)}px, ${(-lift).toFixed(1)}px)`;
    w.art.style.transform = `scaleX(${w.dir})`;
  }
  raf = requestAnimationFrame(step);
}
function runScene(on) {
  if (on && !raf) { lastT = performance.now(); raf = requestAnimationFrame(step); }
  if (!on && raf) { cancelAnimationFrame(raf); raf = null; }
}
const sceneVisible = () => currentTab() === 'nest' && !document.hidden;

export function initNest() {
  renderBabies();
  // the cards and walkers are rebuilt only while the tab is open; the hungry badge updates everywhere
  subscribe(() => currentTab() === 'nest' ? renderBabies() : checkHunger());
  setInterval(checkHunger, 1000);
  onTabChange(name => {
    if (name === 'nest') {
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
