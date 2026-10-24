// Boarding the maglev: a window in two steps. First the trains about to leave this station, one a way,
// each with the stations it calls at in order: a tap on one is where to get off. Then the train itself,
// its cars and their compartments: each of those going is dragged (or tapped, then its place tapped) from
// the platform into a compartment that fits it, and Done boards them. From then on they only wait for
// the train (or get off again, until its doors close, MAGLEV.board seconds before it leaves); the window
// closes by itself once the doors of the train it shows have closed.
import { PLAYER_ID, MAGLEV, TEAM_SLOTS } from '../config.js';
import { S } from '../state.js';
import { trainsFrom, rideTrip } from '../journey.js';
import { isAway, exploreProblem, cityAt, parseKey } from '../world.js';
import { boardHTML as carsHTML, bindBoard as bindCars, aboard, labelOf } from './board.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { esc, worldSpan } from '../util.js';

// the cars after the engine, each with its compartments, and what fits each kind of compartment
const CARS = [
  { name: 'Coach', kind: 'seat', places: 2 },
  { name: 'Stall car', kind: 'stall', places: 4 },
  { name: 'Stall car', kind: 'stall', places: 4 },
  { name: 'Pen car', kind: 'pen', places: 2 },
  { name: 'Flatcar', kind: 'flat', places: 1 },
];

const nameOf = k => (k === '0,0' ? 'Your nest' : cityAt(S.world.seed, parseKey(k)) || '?');
const leavesIn = (at, t) => (at - t <= MAGLEV.board * 1000 ? 'doors closed' : at - t < 60000 ? `doors close in ${worldSpan(at - t - MAGLEV.board * 1000)}` : `leaves in ${worldSpan(at - t)}`);

let state = null, timer = null;

// from: the station; party: the party waiting there that boards (all of it), or null from the nest (the
// player and the dinosaurs at home, any of them); done(message): told when it closes
export function openMaglev(from, party, done) {
  const dialog = document.getElementById('maglevDialog');
  state = { from, party, done, train: null, to: null, board: { places: {}, held: null } };
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
        <ol class="maglev-stops">${tr.stops.map(st => `<li><button class="ghost" type="button" data-train="${i}" data-to="${esc(st.at)}">${esc(nameOf(st.at))} <span class="hint">${worldSpan(st.arriveAt - tr.departAt)}</span></button></li>`).join('')}</ol>
      </div>`).join('') || '<p class="hint">No train calls here.</p>'}
    </section>
    <section class="maglev-pane">${step2 ? boardHTML(t) : ''}</section>
  </div>`;
  body.querySelectorAll('[data-train]').forEach(b => b.addEventListener('click', () => {
    const tr = trains[+b.dataset.train];
    state.train = { ri: tr.ri, way: tr.way, j: tr.j, departAt: tr.departAt };
    state.to = b.dataset.to;
    state.board = { places: {}, held: null };
    render();
  }));
  if (step2) bindBoard(body);
  dialog.querySelector('.maglev-slide').getBoundingClientRect();
}

function boardHTML(t) {
  const who = candidates(t), going = aboard(state.board), placed = new Set(going);
  const trip = going.length ? rideTrip(S, going, state.from, state.train, state.to, t) : null;
  const all = state.party ? who.every(c => placed.has(c.id)) : going.length > 0;
  const tooMany = going.length > TEAM_SLOTS;
  return `<h3>${esc(nameOf(state.from))} → ${esc(nameOf(state.to))}</h3>
    <p class="hint"><span class="departs" data-at="${state.train.departAt}">${leavesIn(state.train.departAt, t)}</span>${trip && !trip.reason ? ` · there in ${worldSpan(trip.arriveAt - trip.departAt)} · ${trip.fare} coins` : ''}</p>
    ${carsHTML(state.board, CARS, who)}
    <p class="hint">${state.party ? 'Everyone in this team boards: drag each into a place that fits.' : 'Drag who goes into a place that fits: a seat for you, a stall for small and middling dinosaurs, a pen for large ones, the flatcar for the colossal.'}</p>
    ${tooMany ? `<p class="hint warn-text">At most ${TEAM_SLOTS} in a team.</p>` : ''}
    ${trip && trip.reason ? `<p class="hint warn-text">${esc(trip.reason)}</p>` : ''}
    <div class="row"><button class="btn" type="button" id="maglevDone" ${!all || tooMany || !trip || trip.reason || S.coins < trip.fare ? 'disabled' : ''}>Done</button>
      <button class="ghost" type="button" id="maglevBack">Back</button></div>`;
}

function bindBoard(body) {
  bindCars(body.querySelector('.maglev-pane:last-child'), state.board, document.getElementById('maglevDialog'), render);
  body.querySelector('#maglevBack').addEventListener('click', () => { state.train = null; state.to = null; state.board = { places: {}, held: null }; render(); });
  body.querySelector('#maglevDone').addEventListener('click', () => {
    const going = aboard(state.board), ride = { ri: state.train.ri, way: state.train.way, j: state.train.j };
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
