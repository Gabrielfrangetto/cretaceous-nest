// Team tab: the teams that go with the player (presets, rules in teams.js), picked on the World map.
// Each place opens a picker with a card for every dinosaur and pack that could fill it.
import { SPECIES, SEX } from '../config.js';
import { S, subscribe } from '../state.js';
import { sexOf, stageOf, wornGear } from '../economy.js';
import { act } from '../actions.js';
import { isAway, injuredLeft } from '../world.js';
import { packOf, alphaOf } from '../packs.js';
import { cleanTeams, PRESET_SLOTS } from '../teams.js';
import { dressedArt } from '../art.js';
import { esc } from '../util.js';
import { now } from '../clock.js';
import { currentTab, onTabChange } from './tabs.js';

let picked = 0;           // the preset shown
let picking = null;       // the place being filled: its index
let message = '';

const PROBLEMS = { 'too-young': 'Babies are too young to explore.', 'in-pack': 'It runs with its pack: put the pack in instead.', missing: 'That one is gone.' };

const presets = () => cleanTeams(S);
const dinoOf = id => S.hatched.find(b => b.id === id);
const packById = id => (S.packs || []).find(p => p.id === id);
// whatever keeps one home right now, in a word
function status(ids) {
  const t = now();
  for (const id of ids) {
    const b = dinoOf(id);
    if (!b) continue;
    if (isAway(S, id)) return 'away';
    if (injuredLeft(b, t) > 0) return 'injured';
  }
  return '';
}
// everyone who could fill a place: each dinosaur old enough and not in a pack, each pack
const candidates = () => [
  ...(S.packs || []).map(p => ({ kind: 'pack', id: p.id })),
  ...S.hatched.filter(b => stageOf(b).id !== 'baby' && !packOf(S, b.id)).map(b => ({ kind: 'dino', id: b.id })),
];
const same = (a, b) => a && b && a.kind === b.kind && a.id === b.id;

// a unit's card: its picture, name and what it is
function cardHTML(u, extra = '') {
  if (u.kind === 'pack') {
    const p = packById(u.id), st = status(p.members);
    return `<span class="team-art" data-pack="${esc(p.id)}"></span><strong>${esc(p.name)}</strong>
      <span class="hint">Pack of ${p.members.length} ${esc(SPECIES[p.type].species)}${(() => { const a = dinoOf(alphaOf(S, p)); return a ? `, led by ${esc(a.name)}` : ''; })()}</span>${st ? `<span class="hint warn-text">${st}</span>` : ''}${extra}`;
  }
  const b = dinoOf(u.id), st = status([b.id]);
  return `<span class="team-art" data-dino="${esc(b.id)}"></span><strong>${esc(b.name)} ${SEX[sexOf(b)].sym}</strong>
    <span class="hint">${esc(SPECIES[b.type].species)} · ${stageOf(b).name}</span>${st ? `<span class="hint warn-text">${st}</span>` : ''}${extra}`;
}
// the pictures, once the cards are on the page
function drawArt(root) {
  root.querySelectorAll('[data-dino]').forEach(el => {
    const b = dinoOf(el.dataset.dino);
    if (b) el.appendChild(dressedArt(b.type, 3.2, sexOf(b), wornGear(b), b.outfit, stageOf(b).id, b.scars));
  });
  root.querySelectorAll('[data-pack]').forEach(el => {
    const p = packById(el.dataset.pack);
    for (const id of p ? p.members.slice(0, 3) : []) { const b = dinoOf(id); if (b) el.appendChild(dressedArt(b.type, 2.2, sexOf(b), null, null, stageOf(b).id)); }
  });
}

function render() {
  const box = document.getElementById('teamBox');
  if (!box || currentTab() !== 'team') return;
  // (anything that goes wrong drawing the tab is shown, never a blank page)
  try { draw(box); } catch (e) {
    console.error(e);
    box.innerHTML = `<div><h2>Teams</h2><p class="hint warn-text">The teams could not be shown: ${esc(e && e.message)}</p></div>`;
  }
}
function draw(box) {
  const all = presets(), t = all[picked];
  box.innerHTML = `<div class="sec-head"><h2>Teams</h2>
      <details class="info"><summary aria-label="How teams work">?</summary><p>Set up the teams that go with you. On the World map, pick one to take along: your dinosaurs never set out without you.</p></details></div>
    <div class="team-presets" role="tablist" aria-label="Teams">${all.map((x, i) => `<button class="tab ${i === picked ? 'on' : ''}" type="button" role="tab" aria-selected="${i === picked}" data-preset="${i}">${esc(x.name)} <span class="hint">${x.slots.filter(Boolean).length}</span></button>`).join('')}</div>
    <div class="row team-name"><input type="text" maxlength="24" id="teamName" value="${esc(t.name)}" aria-label="Team name"><button class="ghost" type="button" id="teamRename">Rename</button></div>
    <div class="team-slots">
      ${t.slots.map((u, j) => `<button class="team-slot ${u ? '' : 'empty'}" type="button" data-slot="${j}" aria-label="${u ? 'Change' : 'Fill'} place ${j + 1}">
        ${u ? cardHTML(u) : '<span class="team-plus" aria-hidden="true">+</span><span class="hint">Empty place</span>'}</button>`).join('')}
    </div>
    <p class="hint">A pack takes one place. ${PRESET_SLOTS} places, and you along besides.</p>
    ${message ? `<p class="hint warn-text">${esc(message)}</p>` : ''}`;
  drawArt(box);
  box.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { picked = +b.dataset.preset; message = ''; render(); }));
  box.querySelector('#teamRename').addEventListener('click', () => {
    const r = act('renameTeam', { team: picked, name: box.querySelector('#teamName').value });
    message = r.ok ? '' : 'The name could not be changed.';
    render();
  });
  box.querySelector('#teamName').addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('#teamRename').click(); });
  box.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => openPicker(+b.dataset.slot)));
}

// the picker: a card for each one who could take the place
function openPicker(j) {
  picking = j;
  const dialog = document.getElementById('teamDialog'), body = document.getElementById('teamPickBody');
  const t = presets()[picked], here = t.slots[j];
  const list = candidates();
  body.innerHTML = `<h2 id="teamPickTitle">Place ${j + 1} of ${esc(t.name)}</h2>
    ${list.length ? `<div class="team-cards">${list.map(u => {
      const elsewhere = t.slots.findIndex((x, k) => k !== j && same(x, u));
      return `<button class="team-card ${same(here, u) ? 'on' : ''}" type="button" data-pick="${esc(u.kind)}:${esc(u.id)}">${cardHTML(u, elsewhere >= 0 ? `<span class="hint">in place ${elsewhere + 1}: moves here</span>` : '')}</button>`;
    }).join('')}</div>` : '<p class="hint">No dinosaur old enough yet: babies stay in the nest until they are juveniles.</p>'}
    <div class="row">${here ? '<button class="ghost" type="button" data-clear>Leave the place empty</button>' : ''}<button class="btn" type="button" data-cancel>Cancel</button></div>`;
  drawArt(body);
  body.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    const [kind, ...rest] = b.dataset.pick.split(':');
    const r = act('setTeamSlot', { team: picked, slot: picking, unit: { kind, id: rest.join(':') } });
    message = r.ok ? '' : PROBLEMS[r.reason] || 'That one cannot take this place.';
    dialog.close();
    render();
  }));
  const clear = body.querySelector('[data-clear]');
  if (clear) clear.addEventListener('click', () => { act('setTeamSlot', { team: picked, slot: picking, unit: null }); dialog.close(); render(); });
  body.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.showModal();
}

export function initTeam() {
  onTabChange(name => { if (name === 'team') render(); });
  subscribe(() => { if (!document.getElementById('teamDialog').open) render(); });
  document.getElementById('teamClose').addEventListener('click', () => document.getElementById('teamDialog').close());
}
