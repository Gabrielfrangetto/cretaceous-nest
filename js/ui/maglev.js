// Boarding the maglev: a window in two steps. First the trains about to leave this station, one a way,
// each with the stations it calls at in order: a tap on one is where to get off. Then the train itself,
// its cars and their compartments: each of those going is dragged (or tapped, then its place tapped) from
// the platform into a compartment that fits it, and Done boards them. From then on they only wait for
// the train (or get off again, until its doors close, MAGLEV.board seconds before it leaves); the window
// closes by itself once the doors of the train it shows have closed.
import { PLAYER_ID, MAGLEV, TEAM_SLOTS } from '../config.js';
import { S } from '../state.js';
import { trainsFrom, rideTrip, woundsOf } from '../journey.js';
import { isAway, exploreProblem, cityAt, bodyOf, parseKey } from '../world.js';
import { sexOf, wornGear, stageOf } from '../economy.js';
import { dressedArt, playerArt } from '../art.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { esc, fmt } from '../util.js';

// the cars after the engine, each with its compartments, and what fits each kind of compartment
const CARS = [
  { name: 'Coach', kind: 'seat', places: 2 },
  { name: 'Stall car', kind: 'stall', places: 4 },
  { name: 'Stall car', kind: 'stall', places: 4 },
  { name: 'Pen car', kind: 'pen', places: 2 },
  { name: 'Flatcar', kind: 'flat', places: 1 },
];
const FITS = { seat: ['player'], stall: ['tiny', 'small', 'medium'], pen: ['large', 'huge'], flat: ['colossal'] };
const KIND_NAME = { seat: 'a seat', stall: 'a stall', pen: 'a pen', flat: 'the flatcar' };

const nameOf = k => (k === '0,0' ? 'Your nest' : cityAt(S.world.seed, parseKey(k)) || '?');
const sizeOf = id => (id === PLAYER_ID ? 'player' : bodyOf(S, id).size || 'medium');
const fits = (kind, id) => FITS[kind].includes(sizeOf(id)) || (kind === 'seat' && id === PLAYER_ID);
const leavesIn = (at, t) => (at - t <= MAGLEV.board * 1000 ? 'doors closed' : at - t < 60000 ? `doors close in ${Math.ceil((at - t) / 1000 - MAGLEV.board)} s` : `leaves in ${fmt(at - t)}`);

let state = null, timer = null;

// from: the station; party: the party waiting there that boards (all of it), or null from the nest (the
// player and the dinosaurs at home, any of them); done(message): told when it closes
export function openMaglev(from, party, done) {
  const dialog = document.getElementById('maglevDialog');
  state = { from, party, done, train: null, to: null, places: {}, held: null };
  render();
  if (!dialog.open) dialog.showModal();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

function close(message) {
  clearInterval(timer);
  const dialog = document.getElementById('maglevDialog');
  if (dialog.open) dialog.close();
  const d = state && state.done;
  state = null;
  if (d) d(message || '');
}

// who may board here: the party's own, or from the nest you (if you are home) and the dinosaurs at home
function candidates(t) {
  if (state.party) return state.party.members.map(id => ({ id, why: null }));
  const out = [];
  if (!isAway(S, PLAYER_ID, t)) out.push({ id: PLAYER_ID, why: null });
  for (const b of S.hatched) {
    if (isAway(S, b.id, t)) continue;
    const to = state.to || '0,0';
    const why = state.to ? exploreProblem(S, [{ kind: 'dino', id: b.id }], to, t, 'maglev') : null;
    out.push({ id: b.id, why: why && !['no-slot'].includes(why) ? why : null });
  }
  return out;
}

function artOf(id, px) {
  if (id === PLAYER_ID) return playerArt(S.player.equip, 58);
  const b = S.hatched.find(x => x.id === id);
  if (!b) return document.createElement('span');
  return dressedArt(b.type, px, sexOf(b), wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, now()), b.sewn, b.id, b.blind);
}
const labelOf = id => (id === PLAYER_ID ? 'You' : esc((S.hatched.find(x => x.id === id) || {}).name || '?'));

function render() {
  const dialog = document.getElementById('maglevDialog'), body = document.getElementById('maglevBody'), t = now();
  const trains = trainsFrom(S, state.from, t);
  if (state.train && !trains.some(x => x.ri === state.train.ri && x.way === state.train.way && x.j === state.train.j)) { close('The doors closed on that maglev: it left without you.'); return; }
  const step2 = !!(state.train && state.to);
  body.innerHTML = `<div class="maglev-slide${step2 ? ' on' : ''}">
    <section class="maglev-pane">
      <h3 id="maglevTitle">Maglev from ${state.from === '0,0' ? 'your nest' : esc(nameOf(state.from))}</h3>
      <p class="hint">Pick the station to get off at. A train stands here until it leaves; its doors close ${MAGLEV.board} s before.</p>
      ${trains.map((tr, i) => `<div class="maglev-train">
        <div class="maglev-head"><strong>${tr.way === 'cw' ? 'Clockwise' : 'Anticlockwise'}</strong> <span class="hint departs" data-at="${tr.departAt}">${leavesIn(tr.departAt, t)}</span></div>
        <ol class="maglev-stops">${tr.stops.map(st => `<li><button class="ghost" type="button" data-train="${i}" data-to="${esc(st.at)}">${esc(nameOf(st.at))} <span class="hint">${Math.max(1, Math.round((st.arriveAt - tr.departAt) / 60000))} min</span></button></li>`).join('')}</ol>
      </div>`).join('') || '<p class="hint">No train calls here.</p>'}
    </section>
    <section class="maglev-pane">${step2 ? boardHTML(t) : ''}</section>
  </div>`;
  body.querySelectorAll('[data-train]').forEach(b => b.addEventListener('click', () => {
    const tr = trains[+b.dataset.train];
    state.train = { ri: tr.ri, way: tr.way, j: tr.j, departAt: tr.departAt };
    state.to = b.dataset.to;
    state.places = {};
    render();
  }));
  if (step2) bindBoard(body);
  dialog.querySelector('.maglev-slide').getBoundingClientRect();
}

function boardHTML(t) {
  const who = candidates(t), placed = new Set(Object.values(state.places));
  const going = Object.values(state.places), trip = going.length ? rideTrip(S, going, state.from, state.train, state.to, t) : null;
  const tray = who.filter(c => !placed.has(c.id));
  const token = (id, why = null) => `<div class="maglev-token${state.held === id ? ' held' : ''}${why ? ' off' : ''}" data-who="${esc(id)}" ${why ? `title="${esc(why)}"` : ''}><span class="maglev-art"></span><span class="maglev-name">${labelOf(id)}</span></div>`;
  let n = 0;
  const cars = CARS.map(car => `<div class="maglev-car ${car.kind}"><span class="maglev-car-name">${car.name}</span><div class="maglev-places">${Array.from({ length: car.places }, () => {
    const k = `p${n++}`, id = Object.keys(state.places).includes(k) ? state.places[k] : null;
    return `<div class="maglev-place${id ? ' full' : ''}" data-place="${k}" data-kind="${car.kind}">${id ? token(id) : ''}</div>`;
  }).join('')}</div></div>`).join('');
  const all = state.party ? who.every(c => placed.has(c.id)) : going.length > 0;
  const tooMany = going.length > TEAM_SLOTS;
  return `<h3>${esc(nameOf(state.from))} → ${esc(nameOf(state.to))}</h3>
    <p class="hint"><span class="departs" data-at="${state.train.departAt}">${leavesIn(state.train.departAt, t)}</span>${trip && !trip.reason ? ` · there in ${trip.mins} min · ${trip.fare} coins` : ''}</p>
    <div class="maglev-cars"><div class="maglev-engine" aria-hidden="true"></div>${cars}</div>
    <p class="hint">${state.party ? 'Everyone in this team boards: drag each into a place that fits.' : 'Drag who goes into a place that fits: a seat for you, a stall for small and middling dinosaurs, a pen for large ones, the flatcar for the colossal.'}</p>
    <div class="maglev-tray">${tray.map(c => token(c.id, c.why)).join('') || '<p class="hint">Everyone is aboard.</p>'}</div>
    ${tooMany ? `<p class="hint warn-text">At most ${TEAM_SLOTS} in a team.</p>` : ''}
    ${trip && trip.reason ? `<p class="hint warn-text">${esc(trip.reason)}</p>` : ''}
    <div class="row"><button class="btn" type="button" id="maglevDone" ${!all || tooMany || !trip || trip.reason || S.coins < trip.fare ? 'disabled' : ''}>Done</button>
      <button class="ghost" type="button" id="maglevBack">Back</button></div>`;
}

function bindBoard(body) {
  // (each token shows its sprite, standing idle)
  body.querySelectorAll('.maglev-token').forEach(el => el.querySelector('.maglev-art').appendChild(artOf(el.dataset.who, 3.2)));
  const put = (id, place) => {
    for (const [k, v] of Object.entries(state.places)) if (v === id) delete state.places[k];
    if (place) state.places[place] = id;
    state.held = null;
    render();
  };
  const placeAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.maglev-place, .maglev-tray'); };
  const canTake = (target, id) => target && (target.classList.contains('maglev-tray') || (fits(target.dataset.kind, id) && !(target.dataset.place in state.places && state.places[target.dataset.place] !== id)));
  body.querySelectorAll('.maglev-token:not(.off)').forEach(el => {
    const id = el.dataset.who;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      const ghost = el.cloneNode(true), r = el.getBoundingClientRect();
      ghost.classList.add('maglev-ghost');
      Object.assign(ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
      ghost.querySelector('.maglev-art').replaceChildren(artOf(id, 3.2));
      document.getElementById('maglevDialog').appendChild(ghost);
      const dx = e.clientX - r.left, dy = e.clientY - r.top, start = [e.clientX, e.clientY];
      body.querySelectorAll('.maglev-place').forEach(p => p.classList.toggle('fits', canTake(p, id)));
      const move = m => { ghost.style.left = `${m.clientX - dx}px`; ghost.style.top = `${m.clientY - dy}px`; };
      const up = u => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost.remove();
        body.querySelectorAll('.maglev-place').forEach(p => p.classList.remove('fits'));
        // (a tap without moving picks it up, for a tap on its place after)
        if (Math.hypot(u.clientX - start[0], u.clientY - start[1]) < 6) { state.held = state.held === id ? null : id; render(); return; }
        const target = placeAt(u.clientX, u.clientY);
        if (canTake(target, id)) put(id, target.classList.contains('maglev-tray') ? null : target.dataset.place);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
  body.querySelectorAll('.maglev-place').forEach(p => p.addEventListener('click', () => {
    if (state.held && canTake(p, state.held)) put(state.held, p.dataset.place);
  }));
  const tray = body.querySelector('.maglev-tray');
  if (tray) tray.addEventListener('click', e => { if (state.held && e.target === tray) put(state.held, null); });
  body.querySelector('#maglevBack').addEventListener('click', () => { state.train = null; state.to = null; state.places = {}; render(); });
  body.querySelector('#maglevDone').addEventListener('click', () => {
    const going = Object.values(state.places), ride = { ri: state.train.ri, way: state.train.way, j: state.train.j };
    const r = state.party
      ? act('order', { id: state.party.id, hex: state.to, train: true, ride })
      : act('explore', { team: going.map(id => (id === PLAYER_ID ? { kind: 'player', id } : { kind: 'dino', id })), hex: state.to, train: true, ride });
    if (!r.ok) { const msg = document.createElement('p'); msg.className = 'hint warn-text'; msg.textContent = r.reason === 'train-gone' ? 'The doors closed on that maglev.' : `They could not board (${r.reason}).`; body.querySelector('.maglev-pane:last-child').appendChild(msg); return; }
    const names = going.map(labelOf).join(', ');
    close(`${names} boarded the maglev for ${esc(nameOf(state.to))}: waiting on the platform until it leaves.`);
  });
}

// every second: the countdowns, and the window closed once the doors of its train have closed
function tick() {
  if (!state) return;
  const t = now();
  if (state.train && t >= state.train.departAt - MAGLEV.board * 1000) { close('The doors closed on that maglev: it left without you.'); return; }
  document.querySelectorAll('#maglevBody .departs').forEach(el => { el.textContent = leavesIn(+el.dataset.at, t); });
  // (on the first step, a train whose doors closed gives way to the next)
  if (!state.train && [...document.querySelectorAll('#maglevBody .departs')].some(el => +el.dataset.at - t <= MAGLEV.board * 1000)) render();
}

export function initMaglev() {
  const dialog = document.getElementById('maglevDialog');
  document.getElementById('maglevClose').addEventListener('click', () => close(''));
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(''); });
}
