// Packs, under the babies in the Nest tab: dinosaurs of a pack-hunting species grouped into one unit
// that takes a single place in an expedition team (rules in packs.js).
import { SPECIES, SEX, PACK_LIMITS, PACK_MIN, PACK_BONUS } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf } from '../economy.js';
import { act } from '../actions.js';
import { isAway } from '../world.js';
import { packOf, alphaOf } from '../packs.js';
import { esc } from '../util.js';
import { currentTab, onTabChange } from './tabs.js';

let message = '';
const PROBLEMS = {
  'too-few': `A pack needs at least ${PACK_MIN}.`,
  'too-many': 'That is more than this species keeps in one pack.',
  'too-young': 'Babies are too young to run with a pack.',
  'in-other-pack': 'One of them is already in another pack.',
  away: 'Part of the pack is out exploring. Wait until it is home.',
  'bad-members': 'Those dinosaurs cannot form a pack together.',
};
// the dinosaurs that could run in a pack of this species: old enough, and not in another pack
const free = (type, pack = null) => S.hatched.filter(b => b.type === type && stageOf(b).id !== 'baby' && (!packOf(S, b.id) || (pack && packOf(S, b.id) === pack)));
const label = (b, lead = false) => `${esc(b.name)} ${SEX[sexOf(b)].sym} <span class="hint">${stageOf(b).name}${lead ? ' · alpha' : ''}${isAway(S, b.id) ? ' · away' : ''}</span>`;

// a species whose full pack fights better says so, and how far this pack is from it
function fullNote(type, n) {
  const sp = SPECIES[type];
  if (!sp.fullPack) return '';
  const full = n >= PACK_LIMITS[type];
  return `<p class="hint ${full ? 'pack-full' : ''}">${full ? 'Full pack' : `${PACK_LIMITS[type] - n} more for a full pack`}: every member gets +${Math.round(sp.fullPack * 100)}% to every stat in a fight.</p>`;
}

// (lead: the pack's alpha, its strongest)
function picks(list, chosen, group, lead = null) {
  return `<ul class="pack-picks">${list.map(b => `<li><label><input type="checkbox" data-group="${esc(group)}" value="${esc(b.id)}" ${chosen.includes(b.id) ? 'checked' : ''}> ${label(b, b.id === lead)}</label></li>`).join('')}</ul>`;
}

function render() {
  const box = document.getElementById('packsBox');
  if (!box) return;
  const packs = S.packs || [];
  const types = Object.keys(PACK_LIMITS).filter(t => free(t).length >= PACK_MIN);
  // nothing to show until the nest has two of a pack species old enough, or a pack
  box.hidden = !packs.length && !types.length && !S.hatched.some(b => PACK_LIMITS[b.type]);
  if (box.hidden) return;
  const packCards = packs.map(p => {
    const away = p.members.some(id => isAway(S, id));
    return `<div class="pack-card">
      <div class="pack-title"><input type="text" maxlength="24" value="${esc(p.name)}" data-pack-name="${esc(p.id)}" aria-label="Pack name" ${away ? 'disabled' : ''}>
        <span class="hint">${p.members.length} / ${PACK_LIMITS[p.type]} ${esc(SPECIES[p.type].species)}${away ? ' · out exploring' : ''}</span></div>
      ${fullNote(p.type, p.members.length)}
      ${away ? '' : `${picks(free(p.type, p), p.members, p.id, alphaOf(S, p))}
      <div class="row"><button class="ghost" type="button" data-pack-save="${esc(p.id)}">Save changes</button>
        <button class="ghost" type="button" data-pack-off="${esc(p.id)}">Break up the pack</button></div>`}
    </div>`;
  }).join('');
  const forms = types.map(t => `<div class="pack-card new">
      <div class="pack-title"><strong>New ${esc(SPECIES[t].species)} pack</strong> <span class="hint">up to ${PACK_LIMITS[t]}</span></div>
      ${fullNote(t, 0)}
      ${picks(free(t), [], 'new-' + t)}
      <div class="row"><input type="text" maxlength="24" placeholder="${esc(SPECIES[t].species)} pack" data-new-name="${t}" aria-label="Name of the new pack">
        <button class="btn small" type="button" data-pack-form="${t}">Form pack</button></div>
    </div>`).join('');
  box.innerHTML = `<div class="sec-head"><h2>Packs</h2><span class="count">${packs.length || ''}</span>
      <details class="info"><summary aria-label="How packs work">?</summary><p>Some species hunted together. Group them into a pack and it takes a single place in an expedition team, however many run in it. Each one still fights as itself: on the pack's turn they all strike at once (as many as fit around the foe), each ${Math.round(PACK_BONUS * 100)}% harder for every other one striking with it. Packs: ${Object.entries(PACK_LIMITS).map(([t, n]) => `${esc(SPECIES[t].species)} up to ${n}`).join(', ')}.</p></details></div>
    ${packCards}${forms || (packs.length ? '' : `<p class="hint">Raise at least ${PACK_MIN} juveniles or adults of one of these species to form a pack.</p>`)}
    ${message ? `<p class="hint" role="status">${esc(message)}</p>` : ''}`;
  const chosen = group => [...box.querySelectorAll(`input[data-group="${CSS.escape(group)}"]:checked`)].map(x => x.value);
  const done = (r, ok) => { message = r.ok ? ok : PROBLEMS[r.reason] || 'That did not work.'; render(); };
  box.querySelectorAll('[data-pack-form]').forEach(btn => btn.addEventListener('click', () => {
    const type = btn.dataset.packForm;
    const name = box.querySelector(`[data-new-name="${type}"]`).value;
    done(act('formPack', { type, members: chosen('new-' + type), name }), 'Pack formed. Add it to a team in the World tab.');
  }));
  box.querySelectorAll('[data-pack-save]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.packSave;
    const name = box.querySelector(`[data-pack-name="${CSS.escape(id)}"]`).value;
    const r = act('setPackMembers', { id, members: chosen(id) });
    if (r.ok && !r.disbanded) act('renamePack', { id, name });
    done(r, r.disbanded ? 'Too few were left, so the pack broke up.' : 'Pack saved.');
  }));
  box.querySelectorAll('[data-pack-off]').forEach(btn => btn.addEventListener('click', () => {
    done(act('disbandPack', { id: btn.dataset.packOff }), 'The pack broke up.');
  }));
}

export function initPacks() {
  subscribe(() => { if (currentTab() === 'nest') render(); });
  onTabChange(tab => { if (tab === 'nest') { message = ''; render(); } });
  render();
}
