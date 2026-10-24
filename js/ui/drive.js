// Land vehicles in the World tab: the garage at a station (rent or buy), and the window for a drive: the
// way there (its time in the world's hours, the battery it takes), the vehicle's compartments with who
// goes dragged into them (board.js), and Done to set off. The player drives; who doesn't fit stays
// behind.
import { PLAYER_ID, VEHICLES, DRIVE, TEAM_SLOTS } from '../config.js';
import { S } from '../state.js';
import { isAway, exploreProblem, cityAt, parseKey } from '../world.js';
import { drivePath, driveMins, vehiclesOf, driverOf, chargeOf, playerAt } from '../vehicles.js';
import { isStation } from '../map.js';
import { boardHTML, bindBoard, aboard, labelOf } from './board.js';
import { act } from '../actions.js';
import { now } from '../clock.js';
import { esc, plural, worldSpan, worldSpanMins } from '../util.js';
import { placeName } from './hexdraw.js';
import { cellAt } from '../map.js';

const PROBLEMS = {
  'no-driver': 'You drive: you must be aboard.', 'no-room': 'Not everyone fits its compartments.', 'no-way': 'No way a vehicle can drive there (swamps, mountains and water stop it).',
  battery: 'Not enough battery to get there.', 'rental-ends': 'The rental ends before it would get there.', driving: 'It is on its way already.', coins: 'Not enough coins.',
  'no-station': 'Only at a station: the nest or a city.', 'not-there': 'Your team isn\'t where it is parked.', 'no-slot': 'All your expedition slots are in use.',
};
const nameOf = k => (k === '0,0' ? 'your nest' : cityAt(S.world.seed, parseKey(k)) || placeName(cellAt(S.world.seed, parseKey(k))));
export const vehicleLabel = v => `${VEHICLES[v.kind].name}${v.owned ? '' : ' (rented)'}`;

// The garage at a station where the player stands: their vehicles here, and the ones to rent or buy
export function garageHTML(at, t) {
  if (!isStation(S.world.seed, at) || playerAt(S, t) !== at) return '';
  const here = vehiclesOf(S, t).filter(v => v.at === at && !driverOf(S, v, t));
  return `<section class="garage"><h4>Garage</h4>
    ${here.length ? `<p class="hint">Here: ${here.map(v => `${esc(vehicleLabel(v))}${v.until ? `, ${worldSpan(v.until - t)} left` : ''}`).join(' · ')}.</p>` : ''}
    ${Object.entries(VEHICLES).map(([kind, v]) => `<div class="garage-row"><strong>${esc(v.name)}</strong> <span class="hint">${v.cars.map(c => `${c.places} ${c.kind === 'seat' ? 'seat' : c.kind === 'small' ? 'small dinosaur' : c.kind === 'stall' ? 'stall' : c.kind === 'pen' ? 'large dinosaur' : 'colossal'}${c.places > 1 && c.kind !== 'small' ? 's' : c.kind === 'small' && c.places > 1 ? 's' : ''}`).join(', ')} · battery ${v.range} hexes</span>
      <div class="row">${DRIVE.days.map(d => `<button class="ghost small" type="button" data-rent="${kind}" data-days="${d}" ${S.coins < v.rent * d ? 'disabled' : ''}>Rent ${plural(d, 'day', 'days')} <span class="hint">${v.rent * d} coins</span></button>`).join('')}<button class="ghost small" type="button" data-buy="${kind}" ${S.coins < v.price ? 'disabled' : ''}>Buy <span class="hint">${v.price} coins</span></button></div></div>`).join('')}
  </section>`;
}

// Your vehicles parked at a hex you (or your team) stand at, each with a button to drive it on
export function parkedHTML(at, t) {
  if (playerAt(S, t) !== at) return '';
  const here = vehiclesOf(S, t).filter(v => v.at === at && !driverOf(S, v, t));
  return here.map(v => `<div class="row parked"><span><strong>${esc(vehicleLabel(v))}</strong> <span class="hint">battery ${Math.round(chargeOf(S, v))}/${VEHICLES[v.kind].range} hexes${v.until ? ` · ${worldSpan(v.until - t)} of rental left` : ''}</span></span>
    <button class="btn small" type="button" data-drive="${esc(v.id)}">Drive somewhere</button></div>`).join('');
}

let state = null;
// The drive window: vehicle (its id), to (where), party (the party waiting where it is parked, all of it,
// or null from the nest); done(message): told when it closes
export function openDrive(vehicle, to, party, done) {
  state = { vehicle, to, party, done, board: { places: {}, held: null } };
  render();
  const dialog = document.getElementById('driveDialog');
  if (!dialog.open) dialog.showModal();
}
function close(message) {
  const dialog = document.getElementById('driveDialog');
  if (dialog.open) dialog.close();
  const d = state && state.done;
  state = null;
  if (d) d(message || '');
}
function candidates(t) {
  if (state.party) return state.party.members.map(id => ({ id, why: null }));
  const out = isAway(S, PLAYER_ID, t) ? [] : [{ id: PLAYER_ID, why: null }];
  for (const b of S.hatched) {
    if (isAway(S, b.id, t)) continue;
    const why = exploreProblem(S, [{ kind: 'player', id: PLAYER_ID }, { kind: 'dino', id: b.id }], state.to === '0,0' ? '1,0' : state.to, t, 'drive');
    out.push({ id: b.id, why: why && !['no-slot', 'team-full'].includes(why) ? why : null });
  }
  return out;
}
function render() {
  const body = document.getElementById('driveBody'), t = now(), v = vehiclesOf(S, t).find(x => x.id === state.vehicle);
  if (!v) { close('That vehicle is gone: its rental has ended.'); return; }
  const spec = VEHICLES[v.kind], way = drivePath(S.world.seed, v.at, state.to), who = candidates(t), going = aboard(state.board);
  const mins = way && driveMins(way.hours), battery = chargeOf(S, v);
  const why = !way ? 'no-way' : way.charge > battery ? 'battery' : v.until && t + mins * 60000 > v.until ? 'rental-ends' : null;
  const all = state.party ? who.every(c => going.includes(c.id)) : going.includes(PLAYER_ID);
  body.innerHTML = `<h3 id="driveTitle">${esc(spec.name)}: ${esc(nameOf(v.at))} → ${esc(nameOf(state.to))}</h3>
    <p class="hint">${way ? `${worldSpanMins(mins)} on the way, ${plural(way.path.length, 'hex', 'hexes')} · battery ${way.charge} of ${Math.round(battery)} hexes. Nothing happens on the way: the team gets out where it parks.` : ''}</p>
    ${why ? `<p class="hint warn-text">${esc(PROBLEMS[why])}</p>` : ''}
    ${boardHTML(state.board, spec.cars, who, 'vehicle-cab')}
    <p class="hint">${state.party ? 'Everyone in this team goes: drag each into a place that fits.' : 'You drive: put yourself in the cab, and drag who goes with you into a place that fits. Who does not fit stays at home.'}</p>
    ${going.length > TEAM_SLOTS ? `<p class="hint warn-text">At most ${TEAM_SLOTS} in a team.</p>` : ''}
    <div class="row"><button class="btn" type="button" id="driveDone" ${why || !all || going.length > TEAM_SLOTS ? 'disabled' : ''}>Done</button>
      <button class="ghost" type="button" id="driveCancel">Cancel</button></div>`;
  bindBoard(body, state.board, document.getElementById('driveDialog'), render);
  body.querySelector('#driveCancel').addEventListener('click', () => close(''));
  body.querySelector('#driveDone').addEventListener('click', () => {
    const team = aboard(state.board).map(id => (id === PLAYER_ID ? { kind: 'player', id } : { kind: 'dino', id }));
    const r = state.party ? act('drive', { vehicle: v.id, to: state.to, id: state.party.id }) : act('drive', { vehicle: v.id, to: state.to, team });
    if (!r.ok) { const p = document.createElement('p'); p.className = 'hint warn-text'; p.textContent = PROBLEMS[r.reason] || `Could not set off (${r.reason}).`; body.appendChild(p); return; }
    close(`You drive the ${esc(spec.name)} to ${esc(nameOf(state.to))}: there in ${worldSpanMins(r.mins)}.`);
  });
}

export function initDrive() {
  const dialog = document.getElementById('driveDialog');
  document.getElementById('driveClose').addEventListener('click', () => close(''));
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(''); });
}
export { PROBLEMS as DRIVE_PROBLEMS };
