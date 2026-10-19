// The journey told as a flashback: the way the party went, drawn on a little map, a marker walking it
// and stopping wherever something happened, for the player to see (and watch the fights) and, when it
// comes to it, decide: fight or flee, hunt or let be, go on or turn back.
import { BIOMES, ITEMS, SPECIES, PLAYER_ID, SURVIVAL } from '../config.js';
import { S } from '../state.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { parseKey, cellAt, cityAt, explorerOf, teamUnits } from '../world.js';
import { partyOf, healthOf, standingUnits, legMins, HOME, levelOf, needWord, knows } from '../journey.js';
import { teamOdds, dangerOf } from '../combat.js';
import { playFight } from './fight.js';
import { SIZE, SQ3, center, placeName } from './hexdraw.js';
import { GRID, fit, drawHexes, hexesIn, cssVar } from './mapcanvas.js';
import { chanceOf, riskOf, cap, article, listNames, healthWord, wildName } from './words.js';
import { esc, fmt } from '../util.js';

const STEP_MS = 160;
const itemName = (id, n) => (n === 1 ? ITEMS[id].name : ITEMS[id].plural);
const lootText = list => list.filter(l => l.n > 0).map(l => `${l.n} ${esc(itemName(l.id, l.n))}${l.lost ? ` (${l.lost} lost, inventory full)` : ''}`);
const place = key => placeName(cellAt(S.world.seed, parseKey(key)));
const them = n => (n > 1 ? 'them' : 'it');

// the flashback being shown: { id, names, legs: Map(n, leg), leg: the leg drawn, pos: the marker's index
// on it (-1: where it set out), queue: what is still to tell, pending, party: the party after the last
// step (null once home or lost), timer, onChange }
let fb = null;

// what the party is like: everyone's health in words, and what it carries
export function partyStatusHTML(p) {
  const who = p.members.map(id => {
    const b = explorerOf(S, id), left = p.down.includes(id) ? 0 : healthOf(p, id);
    // (hunger and thirst only once they show)
    const needs = ['hunger', 'thirst'].filter(k => levelOf(p, k, id) >= SURVIVAL.words[k][0][0]).map(k => needWord(k, levelOf(p, k, id)).toLowerCase());
    const worn = Math.max(levelOf(p, 'hunger', id), levelOf(p, 'thirst', id)) >= SURVIVAL.faint;
    return `<span class="${left <= 0 || worn ? 'warn-text' : ''}">${esc(id === PLAYER_ID ? 'You' : b ? b.name : '?')} · ${healthWord(left)}${needs.length ? `, ${needs.join(', ')}` : ''}</span>`;
  }).join(', ');
  const sup = p.supplies || {};
  const packed = [sup.water_skin ? `${sup.water_skin} ${itemName('water_skin', sup.water_skin)} (${sup.water ? `${sup.water} ${sup.water === 1 ? 'drink' : 'drinks'} left` : 'empty'})` : '', sup.ration ? `${sup.ration} ${itemName('ration', sup.ration)}` : ''].filter(Boolean);
  const items = Object.entries(p.carry.items).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${esc(itemName(id, n))}`);
  if (p.carry.coins) items.push(`${p.carry.coins} coins`);
  for (const egg of p.carry.eggs) items.push(`a ${esc(SPECIES[egg.type].egg)}${egg.unseen ? ' (not yet held to the light)' : ''}`);
  return `<p class="hint party-health">${who}</p>${items.length ? `<p class="hint">Carrying ${listNames(items)}.</p>` : ''}${packed.length ? `<p class="hint">Supplies: ${listNames(packed)}.</p>` : ''}`;
}

export function openJourney(id, onChange) {
  const p = partyOf(S, id);
  if (!p) return { ok: false, reason: 'no-expedition' };
  const names = Object.fromEntries(p.members.map(m => [m, m === PLAYER_ID ? 'You' : (explorerOf(S, m) || {}).name || '?']));
  const r = act('journey', { id });
  if (!r.ok) return r;
  clearTimeout(fb && fb.timer);
  fb = { id, names, legs: new Map(), leg: null, pos: -1, queue: [], pending: null, party: null, timer: null, onChange };
  const dialog = document.getElementById('journeyDialog');
  dialog.querySelector('#journeyBody').innerHTML = `<h2 id="journeyTitle"></h2>
    <div class="journey-map"></div>
    <ol class="journey-log" aria-live="polite"></ol>
    <div class="journey-act"></div>`;
  dialog.addEventListener('close', () => { clearTimeout(fb && fb.timer); onChange(); }, { once: true });
  dialog.showModal();
  ingest(r);
  return { ok: true };
}

function ingest(r) {
  for (const leg of r.legs) if (!fb.legs.has(leg.n)) fb.legs.set(leg.n, leg);
  if (!fb.leg) setLeg(r.legs[0].n);
  fb.queue.push(...r.story);
  fb.pending = r.pending;
  fb.party = r.expedition;
  drawMap();
  next();
}

function setLeg(n) {
  const leg = fb.legs.get(n);
  fb.leg = leg;
  fb.pos = leg.step - 1;
  const body = document.getElementById('journeyBody');
  body.querySelector('#journeyTitle').textContent = leg.to === HOME ? 'The way home' : `The way to the ${place(leg.to)}`;
}

// the map: every hex around the ways told so far, the ways themselves (drawn once into a picture kept
// in fb.bg), and the marker walking on it
function drawMap() {
  const keys = [...fb.legs.values()].flatMap(l => [l.from, ...l.path]).map(parseKey);
  const xs = keys.map(h => center(h)[0]), ys = keys.map(h => center(h)[1]);
  const pad = SIZE * 2.2;
  let [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  // never too small to read, never a sliver
  const minW = SIZE * SQ3 * 7;
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  if (y1 - y0 < (x1 - x0) * 0.5) { const c = (y0 + y1) / 2, h = (x1 - x0) * 0.5; y0 = c - h / 2; y1 = c + h / 2; }
  const view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const box = document.querySelector('#journeyBody .journey-map');
  let canvas = box.querySelector('canvas');
  if (!canvas) { box.innerHTML = '<canvas class="world-map" aria-hidden="true"></canvas>'; canvas = box.querySelector('canvas'); }
  canvas.style.aspectRatio = `${view.w} / ${view.h}`;
  const f = fit(canvas, view), { ctx, scale } = f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b3a46';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  // (a long way drawn small: plainer hexes)
  const detail = SIZE * scale >= 9 ? 'full' : SIZE * scale >= 3 ? 'plain' : 'dots';
  drawHexes(ctx, S.world.seed, hexesIn(f.x0, f.y0, f.x0 + f.width / scale, f.y0 + f.height / scale), () => true, GRID, detail);
  // the ways: the one being told bright, the others faint
  for (const l of fb.legs.values()) {
    const now = l === fb.leg;
    ctx.save();
    ctx.beginPath();
    [l.from, ...l.path].forEach((k, i) => { const [x, y] = center(parseKey(k)); ctx[i ? 'lineTo' : 'moveTo'](x, y); });
    ctx.setLineDash([2, 7].map(n => n / scale * 1.4));
    ctx.lineCap = 'round';
    ctx.lineWidth = (now ? 5 : 4) / scale * 1.4;
    ctx.strokeStyle = now ? '#fff6dc' : 'rgba(255, 255, 255, .45)';
    ctx.stroke();
    ctx.restore();
  }
  // kept as a picture: the marker is drawn over it at each step
  const bg = document.createElement('canvas');
  bg.width = canvas.width; bg.height = canvas.height;
  bg.getContext('2d').drawImage(canvas, 0, 0);
  fb.bg = { canvas: bg, fit: f };
  moveMarker();
}
const atKey = () => (fb.pos < 0 ? fb.leg.from : fb.leg.path[Math.min(fb.pos, fb.leg.path.length - 1)]);
function moveMarker() {
  const canvas = document.querySelector('#journeyBody .journey-map canvas');
  if (!canvas || !fb.bg) return;
  const ctx = canvas.getContext('2d'), { fit: f } = fb.bg;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fb.bg.canvas, 0, 0);
  ctx.restore();
  const [x, y] = center(parseKey(atKey())), r = Math.max(10, 7 / f.scale);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = cssVar('--heart');
  ctx.fill();
  ctx.lineWidth = r * 0.3;
  ctx.strokeStyle = cssVar('--panel');
  ctx.stroke();
}
// walks the marker hex by hex to index i of the leg drawn, then goes on with done
function walkTo(i, done) {
  clearTimeout(fb.timer);
  const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepOn = () => {
    if (fb.pos === i) { done(); return; }
    fb.pos += fb.pos < i ? 1 : -1;
    if (quick) { fb.pos = i; moveMarker(); done(); return; }
    moveMarker();
    fb.timer = setTimeout(stepOn, STEP_MS);
  };
  stepOn();
}

const STOPS = ['fight', 'chase', 'standoff', 'sighting', 'witness', 'backedOff', 'lost', 'perished', 'collapse', 'nest'];
function next() {
  const actBox = document.querySelector('#journeyBody .journey-act');
  actBox.innerHTML = '';
  if (!fb.queue.length) {
    const lastLeg = [...fb.legs.values()].at(-1);
    if (fb.pending) {
      if (fb.leg !== lastLeg) { setLeg(lastLeg.n); drawMap(); }
      walkTo(fb.pending.idx, () => decide(fb.pending));
    } else end();
    return;
  }
  const e = fb.queue.shift();
  if (e.n != null && fb.legs.has(e.n) && fb.leg.n !== e.n) { setLeg(e.n); drawMap(); }
  // (an entry with no place on the way is told where the marker stands)
  const to = !Number.isInteger(e.idx) ? fb.pos : e.idx < 0 ? fb.leg.path.length - 1 : e.idx;
  walkTo(to, () => {
    tell(e);
    if (!STOPS.includes(e.kind)) { fb.timer = setTimeout(next, 500); return; }
    actBox.innerHTML = `<div class="row">${e.battle ? '<button class="ghost" type="button" data-watch>Watch the fight</button>' : ''}<button class="btn" type="button" data-next>Continue</button></div>`;
    const watch = actBox.querySelector('[data-watch]');
    if (watch) watch.addEventListener('click', () => playFight(e.battle, plain(entryHTML(e)), byId));
    actBox.querySelector('[data-next]').addEventListener('click', next);
    actBox.querySelector('[data-next]').focus();
  });
}
const byId = id => explorerOf(S, id) || { id, name: fb.names[id] || '?', type: null };
const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return esc(d.textContent); };

function tell(e) {
  const log = document.querySelector('#journeyBody .journey-log');
  const li = document.createElement('li');
  li.innerHTML = `<span class="where">${esc(e.kind === 'home' ? 'Home' : BIOMES[e.biome] ? BIOMES[e.biome].name : '')}</span> ${entryHTML(e)}`;
  log.appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
}

function end() {
  const actBox = document.querySelector('#journeyBody .journey-act');
  const p = fb.party;
  let text = '';
  const buttons = [];
  if (!p) text = '';
  else if (p.leg) text = `The team is on its way ${p.leg.to === HOME ? 'home' : `to the ${esc(place(p.leg.to))}`}: there in ${fmt(Math.max(0, p.leg.arriveAt - now()))}.`;
  else {
    text = `The team waits in the ${esc(place(p.at))} for your orders. Send it on from the World map, or call it home: the way back has its dangers too (${legMins(S, p.members, p.at, HOME)} min).`;
    buttons.push('<button class="ghost" type="button" data-home>Come home</button>');
  }
  actBox.innerHTML = `${text ? `<p class="hint">${text}</p>` : ''}${p && !p.leg ? partyStatusHTML(p) : ''}<div class="row">${buttons.join('')}<button class="btn" type="button" data-close>Close</button></div>`;
  const home = actBox.querySelector('[data-home]');
  if (home) home.addEventListener('click', () => {
    const r = act('order', { id: fb.id, hex: HOME });
    if (r.ok) { fb.party = r.expedition; end(); }
  });
  actBox.querySelector('[data-close]').addEventListener('click', () => document.getElementById('journeyDialog').close());
}

// ---------- decisions ----------
function choose(choice) {
  const actBox = document.querySelector('#journeyBody .journey-act');
  actBox.querySelectorAll('button').forEach(b => { b.disabled = true; });
  const r = act('journey', { id: fb.id, ...choice });
  if (!r.ok) { actBox.insertAdjacentHTML('beforeend', '<p class="hint warn-text">That could not be done.</p>'); return; }
  ingest(r);
}
function riskHTML(units, death) {
  const at = units.map((u, i) => ({ name: u.name, p: Math.max(...death[i]) })).filter(x => x.p >= 0.01);
  if (!at.length) return '<p class="hint">Nobody was likely to die had it come to a fight.</p>';
  return `<p class="hint warn-text">Had it come to a fight: ${at.map(x => `${esc(x.name)} would have been ${riskOf(x.p)}`).join('; ')}.</p>`;
}
const standText = (st, past = false) => {
  const what = `${st.lair ? 'Alpha ' : ''}${st.species}${st.group ? ' ' + st.group : ''}`;
  const ground = past ? (st.count > 1 ? `${st.count} stood their ground` : 'stood its ground') : (st.count > 1 ? `${st.count} stay their ground` : 'stays its ground');
  return `${cap(article(what))} <strong>${esc(what)}</strong> ${past ? 'spotted' : 'spots'} the team and ${ground} to drive it off.`;
};

function decide(v) {
  const actBox = document.querySelector('#journeyBody .journey-act');
  const p = partyOf(S, fb.id);
  const opts = { swamp: v.swamp, biome: v.biome, hp: v.hp };
  const btn = (choice, label, ghost = false) => `<button class="${ghost ? 'ghost' : 'btn small'}" type="button" data-choice='${esc(JSON.stringify(choice))}'>${label}</button>`;
  let html = '';
  if (v.kind === 'scatter') {
    const { win, death } = teamOdds(v.units, v.foe, 120, opts);
    const r = v.run, chance = r ? r.chance * (1 - r.safe) : 0;
    const runner = r && (r.id === PLAYER_ID ? 'you' : esc(r.fighter.name));
    const runText = !r || chance < 0.01 ? 'It couldn\'t catch any of you.'
      : r.fights ? `It had ${chanceOf(chance)} chance of catching ${runner}, and then there would be no escaping the fight.`
      : `It had ${chanceOf(chance)} chance of catching ${runner}, who would have been ${riskOf(chance * r.death)}.`;
    html = `<p>${esc(listNames(v.prey || []))} spotted ${article(v.name)} <strong>${esc(v.name)}</strong> charging the group and ${(v.prey || []).length > 1 ? 'scattered' : 'bolted'}. ${v.mounted ? 'You were still riding one of them.' : v.alone ? 'You were on your own.' : 'You stood with the rest.'}</p>
      <div class="row">${btn({ fight: true }, `${v.mounted ? 'Jumped down and faced it' : 'Faced it'} <span class="hint">(${dangerOf(win)})</span>`)}${btn({ flee: true }, v.mounted ? 'Rode off' : 'Ran for it', true)}</div>
      <p class="hint">${runText}</p>${riskHTML(v.units, death)}`;
  } else if (v.kind === 'standoff') {
    const { win, death } = teamOdds(v.units, v.foe, 120, opts);
    html = `<p>${standText(v, true)}</p><div class="row">${btn({ fight: true }, `Fought ${them(v.count)} <span class="hint">(${dangerOf(win)})</span>`)}${btn({}, `Left ${them(v.count)} be`, true)}</div>${riskHTML(v.units, death)}`;
  } else if (v.kind === 'sighting') {
    html = `<p>The team spotted ${article(v.name)} <strong>${esc(v.name)}</strong> at a distance. Did it hunt one of them?</p>
      <div class="row">${btn({ hunt: true }, `Hunted one <span class="hint">(${esc(v.hunter || '')}: ${chanceOf(v.chance)} chance)</span>`)}${btn({}, 'Left them be', true)}</div>`;
  } else if (v.kind === 'witness') {
    const live = standingUnits(S, p);
    const buttons = [], cant = [];
    for (const o of v.options || []) {
      if (o.prey.ok) buttons.push(btn({ witness: { act: 'prey', hunter: o.id } }, `Hunted the ${esc(v.prey.name)} with ${esc(o.name)} <span class="hint">(${chanceOf(o.prey.chance)} chance${o.prey.backsOff ? '' : ', then the hunter might fight you for it'})</span>`));
      if (o.predator.ok) {
        let tag = `it would run: ${chanceOf(o.predator.chance)} chance to catch it`;
        if (!o.predator.chase) {
          const who = live.filter(u => u.kind === 'player' || u.id === o.id);
          const f = teamOdds(teamUnits(S, who), v.hunterFoe, 120, { ...opts, hp: who.map(u => u.members.map(m => healthOf(p, m))), defend: true });
          tag = `a fight: ${dangerOf(f.win)}`;
        }
        buttons.push(btn({ witness: { act: 'predator', hunter: o.id } }, `Went after the ${esc(v.hunter.name)} with ${esc(o.name)} <span class="hint">(${tag})</span>`));
      }
      if (!o.prey.ok && !o.predator.ok) cant.push(`${esc(o.name)} (${esc(o.prey.reason === o.predator.reason ? o.prey.reason : `prey: ${o.prey.reason}; hunter: ${o.predator.reason}`)})`);
    }
    html = `<p>${cap(wildName(v.hunter))} ${v.hunter.count > 1 ? 'were' : 'was'} chasing ${wildName(v.prey)}. Did the team step in?</p>
      <div class="row wrap">${buttons.join('')}${btn({}, 'Left it be', true)}</div>${cant.length ? `<p class="hint">Couldn't step in: ${cant.join(', ')}.</p>` : ''}`;
  } else if (v.kind === 'nest') {
    const { win, death } = teamOdds(v.units, v.foe, 120, { ...opts, defend: true, guard: true });
    const fightBtn = label => btn({ nest: 'fight' }, `${label} <span class="hint">(${dangerOf(win)})</span>`);
    const sp = esc(v.name), eggs = n => `${n} ${n === 1 ? 'egg' : 'eggs'}`;
    // with no parent about, whose nest it was is only known for eggs the player has had
    const N = v.known ? `${article(v.name)} <strong>${sp}</strong> nest` : 'a nest';
    const whose = v.known ? '' : ' Whose it was, the team couldn\'t tell: nothing like these eggs had ever hatched at the nest.';
    const backHint = `<span class="hint">(${chanceOf(v.chance)} chance the parent came back meanwhile)</span>`;
    if (v.phase === 'empty') {
      html = `<p>${v.left === v.clutch ? `The parent had gone off to feed, leaving its ${eggs(v.clutch)}.` : `The parent was still away. ${cap(eggs(v.left))} ${v.left === 1 ? 'was' : 'were'} left to look at.`}</p>
        <div class="row wrap">${btn({ nest: 'candle' }, `Held ${v.left === v.clutch ? 'an egg' : 'another'} to the light ${backHint}`)}${btn({ nest: 'take' }, `Grabbed one without looking, and went`, true)}${btn({}, v.left === v.clutch ? 'Left it be' : 'Went on with what they had', true)}</div>`;
    } else if (v.phase === 'dud') {
      html = `<p>Against the light, the egg showed no life inside: it would never hatch.</p>
        <div class="row wrap">${btn({ nest: 'keep' }, 'Kept it as food')}${btn({}, 'Put it back', true)}</div>`;
    } else if (v.phase === 'duds') {
      html = `<p>Against the light, ${v.duds === 1 ? 'one egg showed' : `${v.duds} eggs showed`} no life inside: ${v.duds === 1 ? 'it' : 'they'} would never hatch.</p>
        <div class="row wrap">${btn({ nest: 'keep' }, `Took ${v.duds === 1 ? 'it' : 'them'} as food`)}${btn({}, `Left ${v.duds === 1 ? 'it' : 'them'}`, true)}</div>`;
    } else {
      const intro = {
        hatched: `The team came upon ${N}, the shells broken open and the young long gone. ${v.leftovers === 1 ? 'One egg had' : `${v.leftovers} eggs had`} never hatched.${whose}`,
        alone: v.nest === 'buried' ? `The team noticed a patch of churned, warm earth: ${N}, the eggs buried and left${v.volcano ? ' in the heat of a hot spring, where foul fumes rose' : ''}.${whose}` : `The team came upon ${N}, the eggs buried, and no parent in sight.${whose}`,
        empty: `The team came upon ${N} of ${eggs(v.clutch)}, still warm: the parent had gone off to feed, and it wouldn't be long.${whose}`,
        watched: v.nest === 'creche' ? `The team came upon ${article(v.name)} <strong>${sp}</strong> with its young and its nest, never leaving them.` : `The team came upon ${article(v.name)} <strong>${sp}</strong> nest, the eggs buried, and a parent close by, watching.`,
        colony: `The team came upon ${article(v.name)} <strong>${sp}</strong> nesting colony: nest after nest, and adults all about.`,
        unseen: `The team came upon ${article(v.name)} <strong>${sp}</strong> sitting on its nest. It hadn't seen the team yet.`,
        seen: `The team came upon ${article(v.name)} <strong>${sp}</strong> on its nest, and it had seen them: it rose, calling and threatening, warning them off. It wouldn't attack unless they came closer.`,
      }[v.state];
      const buttons = [];
      if (v.state === 'hatched') buttons.push(btn({ nest: 'keep' }, `Took ${v.leftovers === 1 ? 'it' : 'them'} as food`));
      else if (v.full) buttons.push(`<span class="hint">The team already carried ${v.eggs} eggs: it couldn't take another.</span>`);
      else if (v.state === 'alone') buttons.push(btn({ nest: 'take' }, 'Dug up the clutch and held each egg to the light'));
      else if (v.state === 'empty') {
        buttons.push(btn({ nest: 'take' }, 'Snatched an egg without looking, and went'));
        buttons.push(btn({ nest: 'candle' }, `Held an egg to the light first ${backHint}`));
      } else if (v.state === 'unseen') {
        buttons.push(btn({ nest: 'sneak' }, `Crept up and grabbed one <span class="hint">(${chanceOf(v.sneak)} chance it wouldn't notice)</span>`));
        buttons.push(fightBtn('Drove it off its nest'));
      } else buttons.push(fightBtn(v.state === 'colony' ? 'Raided the edge of the colony' : v.state === 'seen' ? 'Stood their ground and went for the nest' : 'Went for the nest by force'));
      // bait: one that would run from it anyway draws it off, then comes back; caught, it is killed
      if (!v.full) for (const d of v.decoys) buttons.push(btn({ nest: 'lure', decoy: d.id }, `Used ${esc(d.name)} as bait <span class="hint">(${chanceOf(d.chance)} chance to outrun it; caught, it would die)</span>`, true));
      const calmNote = v.state === 'colony' ? '<p class="hint">Even if the team won, the other adults would close in: there would only be time to grab one egg.</p>' : '';
      html = `<p>${intro}</p>${calmNote}<div class="row wrap">${buttons.join('')}${btn({}, 'Left it be', true)}</div>${v.full || ['alone', 'empty', 'hatched'].includes(v.state) ? '' : riskHTML(v.units, death)}`;
    }
  } else if (v.kind === 'go-on') {
    html = `<p>What then? Did the team go on to the ${esc(place(v.to))}, or turn back for home?</p>${partyStatusHTML(p)}
      ${v.down.length ? `<p class="hint warn-text">${cap(listNames(v.down.map(nm)))} ${v.down.length > 1 || v.down.includes(PLAYER_ID) ? 'were' : 'was'} down: carried, out of any fight.</p>` : ''}
      <div class="row">${btn({}, 'Went on')}${btn({ back: true }, 'Turned back', true)}</div>`;
  }
  actBox.innerHTML = html;
  actBox.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => choose(JSON.parse(b.dataset.choice))));
}

// ---------- what happened, in words ----------
const nm = id => (id === PLAYER_ID ? 'you' : esc((explorerOf(S, id) || {}).name || fb.names[id] || '?'));
const caughtText = c => (!c ? '' : ` In the escape, ${nm(c.id)} ${c.id === PLAYER_ID ? 'were' : 'was'} caught${c.died ? ' and did not survive.' : ' and went down, and must be carried.'}`);
function fightHTML(e) {
  const b = e.battle, foe = esc(b.foe.name);
  const sc = e.scatter;
  const intro = e.standoff ? `${standText(e.standoff, true)} The team went for ${them(e.standoff.count)}.`
    : sc ? `${esc(listNames(sc.prey))} spotted ${article(sc.name)} ${esc(sc.name)} charging the group and ${sc.prey.length > 1 ? 'scattered' : 'bolted'}. ${b.forced ? `You ran too, but it caught up with ${nm(b.forced)} and there was no escaping the fight.` : sc.mounted ? 'You were thrown in the scramble and stayed to fight.' : sc.alone ? 'You stayed to face it alone.' : 'You stayed to face it with the rest.'}`
    : `${cap(article(b.foe.name))} <strong>${foe}</strong> came for the team.`;
  const ran = (b.fled || []).map(i => b.team[i].name);
  const call = b.alerted === 'team' ? (b.log || []).find(x => x.alert) : null;
  const gaveUp = (b.log || []).some(x => x.gaveUp);
  const outcome = b.escaped ? ` Everyone ran from it.${caughtText(b.caught)}`
    : b.win ? (b.foeFled ? (gaveUp ? ` It couldn't get through the armor and gave up.` : ` Badly hurt, it fled and left nothing behind.`) : b.foeRouted ? ' Half of them down, the rest ran off.' : ' The team won.')
    : ' The team was beaten, and got away as best it could.';
  const got = b.win ? lootText(b.loot || []) : [];
  if (b.win && b.coins) got.push(`${b.coins} coins`);
  return `${intro}${call ? ` ${esc(b.team[call.by].name)} warned of the predator, leaving the group ready.` : ''}${outcome}`
    + `${ran.length && !b.escaped && !sc ? ` ${esc(listNames(ran))} ran from it and left the others to fight.` : ''}`
    + `${b.frenzy && b.frenzy.length ? ` ${esc(listNames(b.frenzy.map(i => b.team[i].name)))} turned on each other in a frenzy.` : ''}`
    + `${(b.downed || []).length ? ` ${cap(listNames(b.downed.map(nm)))} went down and must be carried.` : ''}`
    + `${(b.died || []).length ? ` ${esc(listNames(b.died.map(x => x.name)))} did not survive.` : ''}`
    + `${got.length ? ` Carried off: ${listNames(got)}.` : ''}`;
}
function witnessHTML(e) {
  const natural = e.outcome === 'kill' ? `bring down ${wildName(e.prey)}.`
    : `go for ${wildName(e.prey)}, ${e.outcome === 'repelled' ? `which drove ${them(e.hunter.count)} off.` : 'which got away.'}`;
  const got = lootText(e.loot || []);
  if (e.coins) got.push(`${e.coins} coins`);
  const tail = `${e.battle ? ` ${fightOutcome(e.battle)}` : ''}${got.length ? ` Carried off: ${listNames(got)}.` : ''}`;
  if (e.act === 'none') return `The team watched ${wildName(e.hunter)} ${natural}`;
  if (e.act === 'prey') {
    return `${cap(wildName(e.hunter))} was chasing ${wildName(e.prey)}, and ${esc(e.by)} went after it too: `
      + (e.caught ? (e.contested ? `it ran the ${esc(e.prey.name)} down, but the ${esc(e.hunter.name)} came for the kill.` : `it ran the ${esc(e.prey.name)} down, and the ${esc(e.hunter.name)} let it have it.`)
        : `the ${esc(e.prey.name)} got away${e.turned ? `, and the ${esc(e.hunter.name)} turned on the team.` : `, and the ${esc(e.hunter.name)} left.`}`) + tail;
  }
  return `${cap(wildName(e.hunter))} was chasing ${wildName(e.prey)}, and ${esc(e.by)} went after the ${esc(e.hunter.name)}: the ${esc(e.prey.name)} ran off, `
    + (e.battle ? 'and it stood its ground.' : e.caught ? `and the ${esc(e.hunter.name)} ran too, but was caught.` : `and the ${esc(e.hunter.name)} ran too, and got away.`) + tail;
}
const fightOutcome = b => (b.escaped ? 'Everyone ran from it.' : b.win ? 'The team won.' : 'The team was beaten, and got away as best it could.')
  + `${(b.downed || []).length ? ` ${cap(listNames(b.downed.map(nm)))} went down.` : ''}${(b.died || []).length ? ` ${esc(listNames(b.died.map(x => x.name)))} did not survive.` : ''}`;

// a nest found on the way, and what the team did
function nestHTML(e) {
  const sp = esc(e.name), list = e.eggs || [];
  const eggWord = n => (n === 1 ? 'egg' : 'eggs');
  const egg = list.length ? (e.unseen ? ` The team carried off a ${esc(SPECIES[list[0].type].egg)}, with no time to see whether it would hatch.`
    : ` The team carried off ${list.length === 1 ? `a fertile ${esc(SPECIES[list[0].type].egg)}` : `${list.length} fertile ${esc(SPECIES[list[0].type].egg)}s`}.`) : '';
  const full = e.full ? ' The team couldn\'t carry any more.' : '';
  const fought = e.battle ? ` ${e.battle.win ? 'The team won' : 'The team was beaten, and got away as best it could'}.${(e.battle.downed || []).length ? ` ${cap(listNames(e.battle.downed.map(nm)))} went down.` : ''}${(e.battle.died || []).length ? ` ${esc(listNames(e.battle.died.map(x => x.name)))} did not survive.` : ''}` : '';
  const an = article(e.name);
  const N = e.known === false ? 'a nest' : `${an} ${sp} nest`;
  const found = { hatched: `${N} that had already hatched`, alone: `${N} left alone`, empty: `${N}, the parent away`, watched: `${an} ${sp} nest with a parent close by`, colony: `${an} ${sp} nesting colony`, unseen: `${an} ${sp} on its nest`, seen: `${an} ${sp} on its nest, warning the team off` }[e.state];
  const n = e.looked, f = e.fertile;
  const looked = n ? ` Held to the light, ${!f ? `none of the ${n} ${eggWord(n)} was` : f === n ? (n === 1 ? 'the egg was' : `all ${n} eggs were`) : `${f} of the ${n} eggs ${f === 1 ? 'was' : 'were'}`} fertile${e.duds && f ? `, ${e.duds} would never hatch` : ''}.` : '';
  switch (e.act) {
    case 'leave': return e.duds ? `The team left ${e.duds === 1 ? 'the egg' : `the ${e.duds} eggs`} that would never hatch.` : `The team came upon ${found}, and left it be.`;
    case 'keep': return e.state === 'hatched' ? `The team came upon ${found}, and took ${e.duds === 1 ? 'the egg' : `the ${e.duds} eggs`} that never hatched, as food.` : 'The team kept what would never hatch, as food.';
    case 'putback': return 'The team put the egg that would never hatch back.';
    case 'went': return 'The team went on with what it had.';
    case 'take': return e.state === 'alone' ? `The team came upon ${found} and dug up the clutch.${e.fumes ? ` ${cap(nm(e.fumes))} breathed the hot spring's fumes while digging.` : ''}${looked}${egg}${full}`
      : `The team snatched an egg from ${found}.${egg}`;
    case 'candle': return `The team held an egg from the ${e.known === false ? '' : `${sp} `}nest up to the light.${e.back ? ` The parent came back and fell on the team.${fought}${looked}` : e.fertile ? ' There was life inside.' : ' There was no life inside.'}${egg}${e.none ? ' There were no eggs left.' : ''}${full}`;
    case 'sneak': return `The team crept up on ${found}.${e.spotted ? ` It noticed them and attacked.${fought}${looked}` : ''}${egg}${full}`;
    case 'lure': return `The team came upon ${found}. ${esc(e.decoy.name)} darted in as bait, and the ${sp} gave chase.${e.eggs && e.eggs.length ? ` ${esc(e.decoy.name)} outran it and circled back to the team.` : e.caught ? ` It ran ${esc(e.decoy.name)} down and killed it.` : ''}${egg}`;
    case 'fight': return `The team went for ${found}, and the ${e.state === 'colony' ? 'adults' : 'parent'} defended it to the end.${fought}${looked}${egg}${full}`;
    default: return '';
  }
}

// the land's own dangers met on the way (HAZARDS)
function hazardHTML(e) {
  const who = e.who ? esc(e.who.name) : '', lost = `, and lost about ${e.mins} min`;
  const is = e.who && e.who.id === PLAYER_ID ? 'were' : 'was';
  switch (e.hazard) {
    case 'sandstorm': return `A sandstorm swept over the dunes. The team sheltered in the lee of a dune until it blew itself out${lost}.`;
    case 'heat': return `The sun beat down and there was no water to be found. ${who} ${is} worn out by the heat and thirst.`;
    case 'fumes': return `Foul fumes drifted down from the vents. ${who} breathed them in and came away coughing and weak.`;
    case 'flood': return `The river had burst its banks. The team waited for the water to fall before crossing${lost}.`;
    case 'bog': return `The ground gave way to a bog. Hauling free took a long while${lost}${who ? `, and ${who} wrenched a leg` : ''}.`;
    case 'cold': return `A bitter night came down over the forest. ${who}, too small to keep warm, was chilled to the bone.`;
    case 'lost': return `The forest closed in, thick and dark: the team lost its way, and it took about ${e.mins} min to find it again.`;
    default: return '';
  }
}

function entryHTML(e) {
  switch (e.kind) {
    case 'fight': return fightHTML(e);
    case 'witness': return witnessHTML(e);
    case 'chase': {
      const sc = e.scatter;
      if (sc) return `${esc(listNames(sc.prey))} spotted ${article(sc.name)} ${esc(sc.name)} charging the group and ${sc.prey.length > 1 ? 'scattered' : 'bolted'}. `
        + (e.caught ? `You ran too.${caughtText(e.caught)}` : e.scattered ? 'You ran too, and it never got close: everyone regrouped.' : 'You ran too, and everyone got away and regrouped.');
      if (e.scattered) return `${cap(article(e.name))} ${esc(e.name)} was spotted before it struck. Everyone scattered in zigzags and got away.`;
      return `${cap(article(e.name))} ${esc(e.name)} was spotted first and the team ran.${e.caught ? caughtText(e.caught) : ' Everyone got away.'}`;
    }
    case 'standoff': return `${standText(e, true)} The team left ${them(e.count)} in peace.`;
    case 'sighting': {
      const base = `The team spotted ${article(e.name)} ${esc(e.name)} at a distance.`;
      if (!e.hunted) return `${base} It let them be.`;
      const got = lootText(e.loot || []);
      if (e.coins) got.push(`${e.coins} coins`);
      return e.caught ? `${base} ${esc(e.hunter)} ran one down. Carried off: ${listNames(got) || 'nothing'}.` : `${base} ${esc(e.hunter)} gave chase, but it got away.`;
    }
    case 'backedOff': return `${cap(article(e.name))} ${esc(e.name)} sized up ${esc(e.by)}'s sail and backed off.`;
    case 'hazard': return hazardHTML(e);
    case 'nest': return nestHTML(e);
    case 'gathered': return `Along the way the team gathered ${listNames(lootText(e.found || []))}.`;
    case 'forage': {
      const got = lootText(e.found || []);
      return e.by && e.by.length ? `${esc(listNames(e.by))} found ${listNames(got)} along the way.` : `The team picked up ${listNames(got)} along the way.`;
    }
    case 'train': {
      const name = k => (k === HOME ? 'your nest' : esc(cityAt(S.world.seed, parseKey(k)) || '?'));
      const via = (e.stops || []).slice(1, -1);
      return `The team boarded the maglev at ${name(e.from)}${via.length ? `, changed at ${listNames(via.map(name))}` : ''} and glided to ${name(e.to)} high above the land, fed and watered on board.`;
    }
    case 'city': return `The team reached ${esc(e.name)}. Its people gave everyone food and water, and filled the flasks.`;
    case 'water': return 'Fresh water at last: everyone drank their fill, and the flasks were filled again.';
    case 'dry': return 'The last of the water in the flasks was gone.';
    case 'faint': return e.need === 'thirst'
      ? `${esc(e.who.name)} ${e.who.id === PLAYER_ID ? 'were' : 'was'} weak with thirst, ${e.who.id === PLAYER_ID ? 'your' : 'its'} strength draining away.`
      : `${esc(e.who.name)} ${e.who.id === PLAYER_ID ? 'were' : 'was'} starving, ${e.who.id === PLAYER_ID ? 'your' : 'its'} strength draining away.`;
    case 'collapse': return `You collapsed, ${e.need === 'thirst' ? 'parched' : 'starved'}, and had to be carried.`;
    case 'perished': return `${esc(e.who.name)} ${e.need === 'thirst' ? 'died of thirst' : 'starved to death'} on the way.`;
    case 'turned': return e.recalled ? 'Called back, the team turned for home here.' : 'The team turned back for home.';
    case 'lost': return 'Nobody of the team is left. Everything it carried is lost.';
    case 'arrived': {
      if (e.beaten) return `The team reached the ${esc(place(e.hex))}, but beaten, it found nothing.`;
      const got = lootText(e.found || []);
      if (e.coins) got.push(`${e.coins} coins for a first visit`);
      if (e.egg) got.push(`a ${esc(SPECIES[e.egg.type].egg)}, carried with care`);
      return `The team reached the ${esc(place(e.hex))}${got.length ? ` and found ${listNames(got)}` : ', and found nothing'}.`;
    }
    case 'home': {
      const got = lootText(e.loot || []);
      if (e.coins) got.push(`${e.coins} coins`);
      const eggs = (e.duds || []).map(t => ` Held to the light, the ${esc(SPECIES[t].egg)} showed no life inside: it would never hatch, and went to the food.`).join('')
        + (e.eggs || []).map(g => (g.lost ? ` A ${esc(SPECIES[g.type].egg)} had to stay behind: your egg tray is full.` : ` A ${esc(SPECIES[g.type].egg)}${knows(S, g.type) ? ` (${esc(SPECIES[g.type].species)})` : ', whose no one knew until it hatched,'} is waiting in the Incubator!`)).join('');
      const hurt = (e.injured || []).map(x => `${cap(nm(x.id))} ${x.id === PLAYER_ID ? 'are' : 'is'} ${x.critical ? 'critically injured: herbs won\'t help, a Blood Transfusion will' : `injured for ${x.mins} min`}.`);
      const fed = (e.fedSelf || []).map(nm);
      const hungryIds = (e.hungry || (e.members || []).filter(id => id !== PLAYER_ID && !(e.fedSelf || []).includes(id))).filter(id => id !== PLAYER_ID);
      const dinos = (e.members || []).filter(id => id !== PLAYER_ID && !(e.died || []).some(d => d.id === id));
      const hungry = hungryIds.length;
      const meHungry = (e.hungry || []).includes(PLAYER_ID);
      const dead = (e.died || []).map(x => esc(x.name));
      return `Home! ${got.length ? `The team brought in ${listNames(got)}.` : 'The team brought nothing in.'}${eggs}`
        + `${hurt.length ? ` ${hurt.join(' ')}` : ''}${fed.length ? ` ${cap(listNames(fed))} hunted lizards and insects on the way and came home fed.` : ''}${hungry ? ` ${hungry === dinos.length ? (hungry > 1 ? 'They are' : 'It is') : `${cap(listNames(hungryIds.map(nm)))} ${hungry > 1 ? 'are' : 'is'}`} hungry.` : ''}${meHungry ? ' You could do with a meal yourself.' : ''}`
        + `${dead.length ? ` ${listNames(dead)} did not come home.` : ''}`;
    }
    default: return '';
  }
}
