// Making the player's explorer: who they are (man or woman), their build (each a little of one stat
// for a little of another), their skin, features and hair and their name, with the explorer drawn as
// it is chosen. Opens by itself when a game has no look yet (before the tutorial), and from the player's panel later.
import { LOOK, DEFAULT_LOOK, PLAYER_ID, STATS } from '../config.js';
import { S, subscribe } from '../state.js';
import { act } from '../actions.js';
import { devMode } from '../state.js';
import { inGame } from '../cloud.js';
import { isAway } from '../world.js';
import { playerArt } from '../art.js';
import { esc } from '../util.js';
import { skinsOf, skinOf } from '../economy.js';

let draft = null;
const statName = id => (STATS.find(s => s.id === id) || { name: id }).name;
const modsText = mods => mods.map(m => `${m.value > 0 ? '+' : '−'}${Math.round(Math.abs(m.value) * 100)}% ${statName(m.stat)}`).join(', ');
// whether the game is waiting for the explorer to be made (the tutorial waits for it)
export const lookPending = () => !!S.player && !S.player.look;

export function openLook() {
  draft = { ...(S.player.look || DEFAULT_LOOK), name: S.player.name === 'You' ? '' : S.player.name };
  render();
  const dialog = document.getElementById('lookDialog');
  if (!dialog.open) dialog.showModal();
}
function render() {
  const body = document.getElementById('lookBody'), first = !S.player.look;
  const pick = (group, value, label, extra = '') => `<button type="button" class="${draft[group] === value ? 'btn' : 'ghost'} small" data-${group}="${esc(value)}" aria-pressed="${draft[group] === value}">${label}${extra}</button>`;
  body.innerHTML = `<h2 id="lookTitle">${first ? 'Who are you?' : 'Your look'}</h2>
    <div class="look-layout"><div class="look-preview"></div>
    <div class="look-fields">
      <label class="field"><span class="label">Name</span><input type="text" id="lookName" maxlength="24" placeholder="Your name" value="${esc(draft.name || '')}"></label>
      <div class="field"><span class="label">Explorer</span><div class="look-row">${Object.entries(LOOK.sexes).map(([k, n]) => pick('sex', k, n)).join('')}</div></div>
      <div class="field"><span class="label">Build</span><div class="look-row">${Object.entries(LOOK.builds).map(([k, b]) => pick('build', k, b.name)).join('')}</div>
        <p class="hint">${LOOK.builds[draft.build].mods.length ? modsText(LOOK.builds[draft.build].mods) : 'Balanced: no strength or weakness.'}</p></div>
      ${Object.keys(LOOK.faces[draft.sex] || {}).length ? `<div class="field"><span class="label">Features</span><div class="look-row">${Object.entries(LOOK.faces[draft.sex]).map(([k, n]) => pick('face', k, n)).join('')}</div></div>` : ''}
      <div class="field"><span class="label">Hair</span><div class="look-row">${Object.entries(LOOK.hairs[draft.sex] || { none: 'Bald' }).map(([k, n]) => pick('hair', k, n)).join('')}</div>
        ${draft.hair !== 'none' ? `<div class="look-row">${Object.entries(LOOK.hairColors).map(([id, c]) => `<button type="button" class="look-swatch${draft.hairColor === id ? ' on' : ''}" data-hair-color="${id}" style="--c:${c}" aria-label="Hair colour: ${id}" aria-pressed="${draft.hairColor === id}"></button>`).join('')}</div>` : ''}</div>
      <div class="field"><span class="label">Skin</span><div class="look-row">${skinsOf(draft.sex).map(id => [id, LOOK.skins[id]]).map(([id, c]) => `<button type="button" class="look-swatch${draft.skin === id ? ' on' : ''}" data-skin="${id}" style="--c:${c}" aria-label="Skin tone: ${id}" aria-pressed="${draft.skin === id}"></button>`).join('')}</div></div>
      ${LOOK.drawn[draft.sex] ? '' : '<p class="hint">This explorer is still being drawn: for now they look like the other.</p>'}
      <p class="hint warn-text" id="lookWhy" hidden></p>
      <div class="row"><button class="btn" type="button" id="lookDone">${first ? 'Start exploring' : 'Done'}</button>${first ? '' : '<button class="ghost" type="button" id="lookCancel">Cancel</button>'}</div>
    </div></div>`;
  // (as tall as fits: about half the window, at most 420 px)
  body.querySelector('.look-preview').appendChild(playerArt(S.player.equip, Math.round(Math.min(420, Math.max(240, innerHeight * 0.5))), draft));
  const name = body.querySelector('#lookName');
  name.addEventListener('input', () => { draft.name = name.value; });
  for (const group of ['sex', 'build', 'skin', 'face', 'hair']) body.querySelectorAll(`[data-${group}]`).forEach(b => b.addEventListener('click', () => {
    draft[group] = b.dataset[group];
    // (a style, tone or face the other sex has none of)
    if (!(LOOK.hairs[draft.sex] || {})[draft.hair]) draft.hair = 'none';
    draft.skin = skinOf(draft.sex, draft.skin);
    const faces = Object.keys(LOOK.faces[draft.sex] || {});
    if (faces.length && !faces.includes(draft.face)) draft.face = faces.includes(DEFAULT_LOOK.face) ? DEFAULT_LOOK.face : faces[0];
    render();
  }));
  body.querySelectorAll('[data-hair-color]').forEach(b => b.addEventListener('click', () => { draft.hairColor = b.dataset.hairColor; render(); }));
  body.querySelector('#lookDone').addEventListener('click', () => {
    const r = act('setLook', { look: { sex: draft.sex, build: draft.build, skin: draft.skin, face: draft.face, hair: draft.hair, hairColor: draft.hairColor }, name: draft.name });
    if (!r.ok) { const why = body.querySelector('#lookWhy'); why.hidden = false; why.textContent = r.reason === 'away' ? 'Not while you are out exploring.' : 'That could not be set.'; return; }
    document.getElementById('lookDialog').close();
  });
  const cancel = body.querySelector('#lookCancel');
  if (cancel) cancel.addEventListener('click', () => document.getElementById('lookDialog').close());
}

export function initLook() {
  const dialog = document.getElementById('lookDialog');
  // (the first time it can't be put off)
  dialog.addEventListener('cancel', e => { if (lookPending()) e.preventDefault(); });
  const check = () => { if (lookPending() && !dialog.open && (devMode() || inGame()) && !isAway(S, PLAYER_ID)) openLook(); };
  subscribe(check);
  setInterval(check, 1500);
  check();
}
