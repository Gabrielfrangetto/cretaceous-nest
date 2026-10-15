// The fight replay shown when a team comes back from a battle: the team stands on the left, one card
// per dinosaur, the player or pack, the creature on the right, and the blows the rules already decided
// play out one by one with health bars and damage numbers.
import { CREATURES, SEX, PLAYER_ID } from '../config.js';
import { sexOf, stageOf, wornGear } from '../economy.js';
import { dressedArt, babyArt, playerArt } from '../art.js';
import { esc } from '../util.js';

const STEP_MS = 520;
let timer = null;

function fighterBox(side, name, power, art, max, note = '') {
  const box = document.createElement('div');
  box.className = 'fighter fighter-' + side;
  box.innerHTML = `<div class="fighter-name"><strong>${esc(name)}</strong> <span class="hint">Power ${power}</span><span class="hint pack-left">${note}</span></div>
    <div class="hp" role="meter" aria-label="${esc(name)} health" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${max}"><i style="width:100%"></i><span>${max} / ${max}</span></div>
    <div class="fighter-art"></div>`;
  box.querySelector('.fighter-art').appendChild(art);
  return box;
}

// a team member's picture, smaller the bigger the team
function unitArt(unit, who, n) {
  const b = who(unit.members[0]);
  if (!b) return document.createElement('span');
  const scale = n > 2 ? 0.6 : n > 1 ? 0.8 : 1;
  if (b.id === PLAYER_ID) return playerArt(b.equip, 130 * scale);
  const art = dressedArt(b.type, 6 * scale, sexOf(b), wornGear(b), b.outfit, stageOf(b).id);
  if (unit.kind !== 'pack') return art;
  // a pack: its leader with a few of the others peeking out behind
  const group = document.createElement('div');
  group.className = 'pack-art';
  for (const id of unit.members.slice(1, 3)) {
    const m = who(id);
    if (m) group.appendChild(dressedArt(m.type, 4.5 * scale, sexOf(m), null, null, stageOf(m).id));
  }
  group.appendChild(art);
  return group;
}

// battle: what collectTrip returned; who(id) finds a team member
export function playFight(battle, summary, who) {
  const dialog = document.getElementById('fightDialog');
  const body = document.getElementById('fightBody');
  clearTimeout(timer);
  const c = CREATURES[battle.creature];
  const team = battle.team;
  const theirs = babyArt(c.look, battle.lair ? 9 : 7.5, 'm');
  theirs.style.filter = c.tint;
  theirs.classList.add('foe-art');
  const one = team.length === 1 && team[0].kind !== 'pack' ? who(team[0].members[0]) : null;
  const title = one ? `${esc(one.name)}${one.id === PLAYER_ID ? '' : ' ' + SEX[sexOf(one)].sym}` : team.length === 1 ? esc(team[0].name) : 'Your team';
  body.innerHTML = `<h2 id="fightTitle">${title} vs ${esc(battle.foe.name)}</h2>
    <div class="arena"><div class="team-side"></div></div>
    <p class="fight-result hint" role="status" aria-live="polite">Fighting…</p>
    <div class="row"><button class="ghost" type="button" id="fightSkip">Skip</button><button class="btn" type="button" id="fightClose" hidden>Close</button></div>`;
  const arena = body.querySelector('.arena');
  const side = arena.querySelector('.team-side');
  // every member's health as the fight goes, per unit
  const hp = team.map(u => [...u.hp]);
  const sum = list => list.reduce((t, h) => t + h, 0);
  const standing = i => hp[i].filter(h => h > 0).length;
  const packNote = i => team[i].kind === 'pack' ? `${standing(i)} / ${hp[i].length} standing` : '';
  const boxes = team.map((u, i) => fighterBox('a', u.name, u.power, unitArt(u, who, team.length), sum(u.hp), packNote(i)));
  side.append(...boxes);
  side.classList.toggle('crowd', team.length > 2);
  const foeBox = fighterBox('b', battle.foe.name, battle.foe.power, theirs, battle.foeMax);
  arena.append(foeBox);
  const setHp = (box, now, max) => {
    const bar = box.querySelector('.hp');
    bar.querySelector('i').style.width = (now / max * 100).toFixed(1) + '%';
    bar.querySelector('span').textContent = `${now} / ${max}`;
    bar.setAttribute('aria-valuenow', now);
  };
  const showUnit = i => {
    setHp(boxes[i], sum(hp[i]), sum(team[i].hp));
    boxes[i].querySelector('.pack-left').textContent = packNote(i);
    boxes[i].classList.toggle('down', !standing(i));
  };
  const pop = (box, text, cls) => {
    const p = document.createElement('span');
    p.className = 'hit ' + cls;
    p.textContent = text;
    box.querySelector('.fighter-art').appendChild(p);
    setTimeout(() => p.remove(), 900);
  };
  const strike = box => { box.classList.remove('struck'); void box.offsetWidth; box.classList.add('struck'); };
  const lunge = box => { box.classList.remove('lunge'); void box.offsetWidth; box.classList.add('lunge'); };
  const finish = () => {
    clearTimeout(timer);
    battle.hp.forEach((list, i) => { hp[i] = [...list]; showUnit(i); });
    setHp(foeBox, battle.foeHp, battle.foeMax);
    if (battle.win) foeBox.classList.add('down');
    else boxes.forEach(b => b.classList.add('down'));
    const res = body.querySelector('.fight-result');
    res.innerHTML = `<strong class="${battle.win ? 'win' : 'loss'}">${battle.win ? 'Victory!' : 'Defeat'}</strong> ${summary}`;
    body.querySelector('#fightSkip').hidden = true;
    const close = body.querySelector('#fightClose');
    close.hidden = false;
    close.focus();
  };
  let i = 0;
  const step = () => {
    if (i >= battle.log.length) { finish(); return; }
    const blow = battle.log[i++];
    if (blow.by === 'foe') {
      lunge(foeBox);
      const box = boxes[blow.to];
      if (blow.miss) pop(box, 'Miss', 'miss');
      else if (!blow.dmg) pop(box, 'No effect', 'miss');
      else {
        pop(box, '−' + blow.dmg, 'dmg');
        strike(box);
        hp[blow.to][blow.member] = blow.left;
        showUnit(blow.to);
      }
    } else {
      lunge(boxes[blow.by]);
      if (blow.miss) pop(foeBox, 'Miss', 'miss');
      // a bite its hide stops
      else if (!blow.dmg) pop(foeBox, 'No effect', 'miss');
      else {
        pop(foeBox, '−' + blow.dmg, 'dmg');
        strike(foeBox);
        setHp(foeBox, blow.left, battle.foeMax);
      }
    }
    // bigger teams trade more blows, so they go a little faster
    timer = setTimeout(step, team.length > 2 ? STEP_MS * 0.6 : STEP_MS);
  };
  body.querySelector('#fightSkip').addEventListener('click', finish);
  body.querySelector('#fightClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => clearTimeout(timer), { once: true });
  dialog.showModal();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else timer = setTimeout(step, 400);
}
