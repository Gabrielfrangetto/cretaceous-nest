// Boarding a train or a vehicle: its cars and their compartments, and the platform below with who may
// board. Each one going is dragged (or tapped, then its place tapped) into a compartment that fits its
// size (config.js COMPARTMENTS: a seat for the player, stalls, pens, the flatcar); a compartment holds one.
// board: { places: { [place]: id }, held: the one picked up by a tap, or null }, kept by the window using it.
import { PLAYER_ID, COMPARTMENTS } from '../config.js';
import { S } from '../state.js';
import { woundsOf } from '../journey.js';
import { bodyOf } from '../world.js';
import { sexOf, wornGear, stageOf } from '../economy.js';
import { dressedArt, playerArt } from '../art.js';
import { esc } from '../util.js';

const sizeOf = id => (id === PLAYER_ID ? 'player' : bodyOf(S, id).size || 'medium');
export const fits = (kind, id) => (COMPARTMENTS[kind] || []).includes(sizeOf(id));
export const labelOf = id => (id === PLAYER_ID ? 'You' : esc((S.hatched.find(x => x.id === id) || {}).name || '?'));
// who is aboard, in the order of their places
export const aboard = board => Object.values(board.places);

function artOf(id, px) {
  if (id === PLAYER_ID) return playerArt(S.player.equip, 58);
  const b = S.hatched.find(x => x.id === id);
  if (!b) return document.createElement('span');
  return dressedArt(b.type, px, sexOf(b), wornGear(b), b.outfit, stageOf(b).id, b.scars, b.scarBy, woundsOf(S, b, Date.now()), b.sewn, b.id, b.blind);
}

// cars: [{ name, kind, places }]; who: [{ id, why }] (why: what keeps it off, greyed); front: the engine
// or the cab's drawing class
export function boardHTML(board, cars, who, front = 'maglev-engine') {
  const placed = new Set(aboard(board));
  const token = (id, why = null) => `<div class="maglev-token${board.held === id ? ' held' : ''}${why ? ' off' : ''}" data-who="${esc(id)}" ${why ? `title="${esc(why)}"` : ''}><span class="maglev-art"></span><span class="maglev-name">${labelOf(id)}</span></div>`;
  let n = 0;
  const html = cars.map(car => `<div class="maglev-car ${car.kind}"><span class="maglev-car-name">${esc(car.name)}</span><div class="maglev-places">${Array.from({ length: car.places }, () => {
    const k = `p${n++}`, id = k in board.places ? board.places[k] : null;
    return `<div class="maglev-place${id ? ' full' : ''}" data-place="${k}" data-kind="${car.kind}">${id ? token(id) : ''}</div>`;
  }).join('')}</div></div>`).join('');
  const tray = who.filter(c => !placed.has(c.id));
  return `<div class="maglev-cars"><div class="${front}" aria-hidden="true"></div>${html}</div>
    <div class="maglev-tray">${tray.map(c => token(c.id, c.why)).join('') || '<p class="hint">Everyone is aboard.</p>'}</div>`;
}

// the dragging and tapping; layer: the element a dragged one is drawn on (the open dialog); changed():
// to draw it again
export function bindBoard(root, board, layer, changed) {
  root.querySelectorAll('.maglev-token').forEach(el => el.querySelector('.maglev-art').appendChild(artOf(el.dataset.who, 3.2)));
  const put = (id, place) => {
    for (const [k, v] of Object.entries(board.places)) if (v === id) delete board.places[k];
    if (place) board.places[place] = id;
    board.held = null;
    changed();
  };
  const placeAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.maglev-place, .maglev-tray'); };
  const canTake = (target, id) => target && (target.classList.contains('maglev-tray') || (fits(target.dataset.kind, id) && !(target.dataset.place in board.places && board.places[target.dataset.place] !== id)));
  root.querySelectorAll('.maglev-token:not(.off)').forEach(el => {
    const id = el.dataset.who;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      const ghost = el.cloneNode(true), r = el.getBoundingClientRect();
      ghost.classList.add('maglev-ghost');
      Object.assign(ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
      ghost.querySelector('.maglev-art').replaceChildren(artOf(id, 3.2));
      layer.appendChild(ghost);
      const dx = e.clientX - r.left, dy = e.clientY - r.top, start = [e.clientX, e.clientY];
      root.querySelectorAll('.maglev-place').forEach(p => p.classList.toggle('fits', !!canTake(p, id)));
      const move = m => { ghost.style.left = `${m.clientX - dx}px`; ghost.style.top = `${m.clientY - dy}px`; };
      const up = u => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost.remove();
        root.querySelectorAll('.maglev-place').forEach(p => p.classList.remove('fits'));
        // (a tap without moving picks it up, for a tap on its place after)
        if (Math.hypot(u.clientX - start[0], u.clientY - start[1]) < 6) { board.held = board.held === id ? null : id; changed(); return; }
        const target = placeAt(u.clientX, u.clientY);
        if (canTake(target, id)) put(id, target.classList.contains('maglev-tray') ? null : target.dataset.place);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
  root.querySelectorAll('.maglev-place').forEach(p => p.addEventListener('click', () => {
    if (board.held && canTake(p, board.held)) put(board.held, p.dataset.place);
  }));
  const tray = root.querySelector('.maglev-tray');
  if (tray) tray.addEventListener('click', e => { if (board.held && e.target === tray) put(board.held, null); });
}
