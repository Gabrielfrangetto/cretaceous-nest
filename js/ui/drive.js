// Land vehicles in the World tab: the garage at a station (buy one), the science teams setting out from
// it (a free ride out, or back from where one studies), and the window for a drive or a ride: the way
// (how long it takes), the compartments with who goes dragged into them (board.js), and
// Done to set off. Who doesn't fit stays behind.
import { PLAYER_ID, VEHICLES, SCIENCE, MAGLEV, TEAM_SLOTS } from '../config.js';
import { S } from '../state.js';
import { isAway, exploreProblem, cityAt, parseKey } from '../world.js';
import { drivePath, driveMins, vehiclesOf, driverOf, chargeOf, playerAt, scienceFrom, scienceTrip, scienceBackFrom } from '../vehicles.js';
import { isStation, cellAt } from '../map.js';
import { boardHTML, bindBoard, aboard } from './board.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { esc, plural, realSpan, realSpanMins } from '../util.js';
import { placeName } from './hexdraw.js';

const PROBLEMS = {
  'no-driver': 'You drive: you must be aboard.', 'no-room': 'Not everyone fits its compartments.', 'no-way': 'No way a vehicle can drive there (swamps, mountains and water stop it).',
  battery: 'Not enough battery to get there.', driving: 'It is on its way already.', coins: 'Not enough coins.', 'no-trip': 'No team sets out then.',
  'no-station': 'Only at a station: the nest or a city.', 'not-there': 'Your team isn\'t where it sets out.', 'no-slot': 'All your expedition slots are in use.',
};
const nameOf = k => (k === '0,0' ? 'your nest' : cityAt(S.world.seed, parseKey(k)) || placeName(cellAt(S.world.seed, parseKey(k))));
const leavesIn = (at, t) => (at - t <= MAGLEV.board * 1000 ? 'doors closed' : `leaves in ${realSpan(at - t)}`);

// The garage at a station where the player stands: their vehicles here, and the ones to buy
export function garageHTML(at, t) {
  if (!isStation(S.world.seed, at) || playerAt(S, t) !== at) return '';
  const room = c => `${c.places} ${{ seat: 'seat', small: 'small dinosaur', stall: 'stall', pen: 'large dinosaur', flat: 'colossal' }[c.kind]}${c.places > 1 ? 's' : ''}`;
  return `<section class="garage"><h4>Garage</h4>
    ${Object.entries(VEHICLES).map(([kind, v]) => `<div class="garage-row"><span><strong>${esc(v.name)}</strong> <span class="hint">${v.cars.map(room).join(', ')} · battery ${v.range} hexes</span></span>
      <div class="row"><button class="ghost small" type="button" data-buy="${kind}" ${S.coins < v.price ? 'disabled' : ''}>Buy <span class="hint">${v.price} coins</span></button></div></div>`).join('')}
  </section>`;
}

// The science teams setting out from a station where the player stands, a free ride to where each goes
export function scienceHTML(at, t) {
  if (!isStation(S.world.seed, at) || playerAt(S, t) !== at) return '';
  const trips = scienceFrom(S.world.seed, at, t);
  if (!trips.length) return '';
  return `<section class="garage"><h4>Science expeditions</h4>
    <p class="hint">The colony's scientists drive out to study the dinosaurs where they live. Ride along for free: they pick where to go, study there ${realSpanMins(SCIENCE.stay)}, and drive back.</p>
    ${trips.map(x => `<div class="row parked"><span>To <strong>${esc(nameOf(x.to))}</strong> <span class="hint"><span class="departs" data-at="${x.departAt}">${leavesIn(x.departAt, t)}</span> · there in ${realSpan(x.arriveAt - x.departAt)} · back here ${realSpan(x.homeAt - t)} from now</span></span>
      <button class="btn small" type="button" data-science="${esc(at)}" data-k="${x.k}">Ride along</button></div>`).join('')}
  </section>`;
}
// A science team studying the hex where the player's team waits: a ride back with it
export function scienceBackHTML(at, party, t) {
  const back = scienceBackFrom(S.world.seed, at, t);
  return back.map(x => `<div class="row parked"><span>A science team is studying here. <span class="hint">It drives back to ${esc(nameOf(x.station))}: <span class="departs" data-at="${x.backAt}">${leavesIn(x.backAt, t)}</span></span></span>
    <button class="btn small" type="button" data-science="${esc(x.station)}" data-k="${x.k}" data-back data-party="${esc(party.id)}">Ride back</button></div>`).join('');
}

// Your vehicles parked at a hex you (or your team) stand at, each with a button to drive it on
export function parkedHTML(at, t) {
  if (playerAt(S, t) !== at) return '';
  const here = vehiclesOf(S).filter(v => v.at === at && !driverOf(S, v, t));
  return here.map(v => `<div class="row parked"><span><strong>Your ${esc(VEHICLES[v.kind].name)}</strong> <span class="hint">battery ${Math.round(chargeOf(S, v))}/${VEHICLES[v.kind].range} hexes</span></span>
    <button class="btn small" type="button" data-drive="${esc(v.id)}">Drive somewhere</button></div>`).join('');
}

let state = null, timer = null;
// The window: a drive (vehicle: its id, to: where) or a ride with a science team (sci: { station, k,
// back }); party: the party waiting where it sets out (all of it), or null from the nest; done(message):
// told when it closes
export function openDrive(vehicle, to, party, done) { open({ vehicle, to, party, done }); }
export function openScience(sci, party, done) { open({ sci, party, done }); }
function open(o) {
  state = { ...o, board: { places: {}, held: null } };
  render();
  const dialog = document.getElementById('driveDialog');
  if (!dialog.open) dialog.showModal();
  clearInterval(timer);
  if (o.sci) timer = setInterval(tick, 1000);
}
function close(message) {
  clearInterval(timer);
  const dialog = document.getElementById('driveDialog');
  if (dialog.open) dialog.close();
  const d = state && state.done;
  state = null;
  if (d) d(message || '');
}
function candidates(t, to) {
  if (state.party) return state.party.members.map(id => ({ id, why: null }));
  const out = isAway(S, PLAYER_ID, t) ? [] : [{ id: PLAYER_ID, why: null }];
  for (const b of S.hatched) {
    if (isAway(S, b.id, t)) continue;
    const why = exploreProblem(S, [{ kind: 'player', id: PLAYER_ID }, { kind: 'dino', id: b.id }], to === '0,0' ? '1,0' : to, t, 'drive');
    out.push({ id: b.id, why: why && !['no-slot', 'team-full'].includes(why) ? why : null });
  }
  return out;
}
// what the window is about: { title, info, why, cars, to, departAt }
function ride(t) {
  if (state.sci) {
    const x = scienceTrip(S.world.seed, state.sci.station, state.sci.k), back = state.sci.back;
    const from = back ? x.to : x.station, to = back ? x.station : x.to, departAt = back ? x.backAt : x.departAt, arriveAt = back ? x.homeAt : x.arriveAt;
    return { title: `Science truck: ${nameOf(from)} → ${nameOf(to)}`, cars: SCIENCE.cars, to, departAt, why: departAt - t <= MAGLEV.board * 1000 ? 'gone' : null,
      info: `<span class="departs" data-at="${departAt}">${leavesIn(departAt, t)}</span> · there in ${realSpan(arriveAt - departAt)} · free. ${back ? '' : `They study there ${realSpanMins(SCIENCE.stay)}, then drive back: ride back with them, or stay.`}` };
  }
  const v = vehiclesOf(S).find(x => x.id === state.vehicle), way = v && drivePath(S.world.seed, v.at, state.to);
  if (!v) return null;
  const mins = way && driveMins(way.hours), battery = chargeOf(S, v);
  return { title: `${VEHICLES[v.kind].name}: ${nameOf(v.at)} → ${nameOf(state.to)}`, cars: VEHICLES[v.kind].cars, to: state.to,
    why: !way ? 'no-way' : way.charge > battery ? 'battery' : null,
    info: way ? `${realSpanMins(mins)} on the way, ${plural(way.path.length, 'hex', 'hexes')} · battery ${way.charge} of ${Math.round(battery)} hexes. Nothing happens on the way: the team gets out where it parks.` : '' };
}
function render() {
  const body = document.getElementById('driveBody'), t = now(), r = ride(t);
  if (!r) { close('That vehicle is gone.'); return; }
  if (r.why === 'gone') { close('The science truck has left without you.'); return; }
  const who = candidates(t, r.to), going = aboard(state.board);
  const all = state.party ? who.every(c => going.includes(c.id)) : going.includes(PLAYER_ID);
  body.innerHTML = `<h3 id="driveTitle">${esc(r.title)}</h3>
    <p class="hint">${r.info}</p>
    ${r.why ? `<p class="hint warn-text">${esc(PROBLEMS[r.why] || r.why)}</p>` : ''}
    ${boardHTML(state.board, r.cars, who, 'vehicle-cab')}
    <p class="hint">${state.party ? 'Everyone in this team goes: drag each into a place that fits.' : 'You go: put yourself in the cab, and drag who goes with you into a place that fits. Who does not fit stays at home.'}</p>
    ${going.length > TEAM_SLOTS ? `<p class="hint warn-text">At most ${TEAM_SLOTS} in a team.</p>` : ''}
    <div class="row"><button class="btn" type="button" id="driveDone" ${r.why || !all || going.length > TEAM_SLOTS ? 'disabled' : ''}>Done</button>
      <button class="ghost" type="button" id="driveCancel">Cancel</button></div>`;
  bindBoard(body, state.board, document.getElementById('driveDialog'), render);
  body.querySelector('#driveCancel').addEventListener('click', () => close(''));
  body.querySelector('#driveDone').addEventListener('click', () => {
    const team = aboard(state.board).map(id => (id === PLAYER_ID ? { kind: 'player', id } : { kind: 'dino', id })), by = state.party ? { id: state.party.id } : { team };
    const res = state.sci ? act('science', { station: state.sci.station, k: state.sci.k, back: !!state.sci.back, ...by }) : act('drive', { vehicle: state.vehicle, to: state.to, ...by });
    if (!res.ok) { const p = document.createElement('p'); p.className = 'hint warn-text'; p.textContent = res.reason === 'train-gone' ? 'The truck has left.' : PROBLEMS[res.reason] || `Could not set off (${res.reason}).`; body.appendChild(p); return; }
    close(state.sci ? `You ride with the science team to ${esc(nameOf(r.to))}: waiting for the truck to leave.` : `You drive to ${esc(nameOf(r.to))}: there in ${realSpanMins(res.mins)}.`);
  });
}
// every second: the countdown, and the window closed once the truck's doors have closed
function tick() {
  if (!state || !state.sci) return;
  const t = now(), r = ride(t);
  if (r.why === 'gone') { close('The science truck has left without you.'); return; }
  document.querySelectorAll('#driveBody .departs').forEach(el => { el.textContent = leavesIn(+el.dataset.at, t); });
}

export function initDrive() {
  const dialog = document.getElementById('driveDialog');
  document.getElementById('driveClose').addEventListener('click', () => close(''));
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(''); });
}
export { PROBLEMS as DRIVE_PROBLEMS };
