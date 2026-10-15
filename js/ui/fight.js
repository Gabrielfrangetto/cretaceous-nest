// The fight replay shown when an explorer comes back from a battle: both fighters face each other,
// and the blows the rules already decided play out one by one with health bars and damage numbers.
import { CREATURES, SEX } from '../config.js';
import { sexOf, stageOf, wornGear } from '../economy.js';
import { dressedArt, babyArt } from '../art.js';
import { esc } from '../util.js';

const STEP_MS = 520;
let timer = null;

function fighterBox(side, name, power, art, max) {
  const box = document.createElement('div');
  box.className = 'fighter fighter-' + side;
  box.innerHTML = `<div class="fighter-name"><strong>${esc(name)}</strong> <span class="hint">Power ${power}</span></div>
    <div class="hp" role="meter" aria-label="${esc(name)} health" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${max}"><i style="width:100%"></i><span>${max} / ${max}</span></div>
    <div class="fighter-art"></div>`;
  box.querySelector('.fighter-art').appendChild(art);
  return box;
}

export function playFight(baby, battle, summary) {
  const dialog = document.getElementById('fightDialog');
  const body = document.getElementById('fightBody');
  clearTimeout(timer);
  const c = CREATURES[battle.creature];
  const mine = dressedArt(baby.type, 6, sexOf(baby), wornGear(baby), baby.outfit, stageOf(baby).id);
  const theirs = babyArt(c.look, battle.lair ? 9 : 7.5, 'm');
  theirs.style.filter = c.tint;
  theirs.classList.add('foe-art');
  body.innerHTML = `<h2 id="fightTitle">${esc(baby.name)} ${SEX[sexOf(baby)].sym} vs ${esc(battle.foe.name)}</h2>
    <div class="arena"></div>
    <p class="fight-result hint" role="status" aria-live="polite">Fighting…</p>
    <div class="row"><button class="ghost" type="button" id="fightSkip">Skip</button><button class="btn" type="button" id="fightClose" hidden>Close</button></div>`;
  const arena = body.querySelector('.arena');
  const a = fighterBox('a', baby.name, battle.me.power, mine, battle.maxA);
  const b = fighterBox('b', battle.foe.name, battle.foe.power, theirs, battle.maxB);
  arena.append(a, b);
  const box = { a, b }, max = { a: battle.maxA, b: battle.maxB };
  const setHp = (side, hp) => {
    const bar = box[side].querySelector('.hp');
    bar.querySelector('i').style.width = (hp / max[side] * 100).toFixed(1) + '%';
    bar.querySelector('span').textContent = `${hp} / ${max[side]}`;
    bar.setAttribute('aria-valuenow', hp);
  };
  const pop = (side, text, cls) => {
    const p = document.createElement('span');
    p.className = 'hit ' + cls;
    p.textContent = text;
    box[side].querySelector('.fighter-art').appendChild(p);
    setTimeout(() => p.remove(), 900);
  };
  const finish = () => {
    clearTimeout(timer);
    setHp('a', battle.hpA); setHp('b', battle.hpB);
    box[battle.win ? 'b' : 'a'].classList.add('down');
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
    const target = blow.by === 'a' ? 'b' : 'a';
    box[blow.by].classList.remove('lunge'); void box[blow.by].offsetWidth; box[blow.by].classList.add('lunge');
    if (blow.miss) pop(target, 'Miss', 'miss');
    else {
      pop(target, '−' + blow.dmg, 'dmg');
      box[target].classList.remove('struck'); void box[target].offsetWidth; box[target].classList.add('struck');
      setHp(target, blow.left);
    }
    timer = setTimeout(step, STEP_MS);
  };
  body.querySelector('#fightSkip').addEventListener('click', finish);
  body.querySelector('#fightClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => clearTimeout(timer), { once: true });
  dialog.showModal();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else timer = setTimeout(step, 400);
}
