// The fight replay shown when a team comes back from a battle: the team stands on the left, one card
// per dinosaur, the player or pack, the creature on the right, and the blows the rules already decided
// play out one by one with health bars and damage numbers.
import { CREATURES, SPECIES, SEX, PLAYER_ID, FRILL } from '../config.js';
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

// the foe's picture: an animal that isn't a dinosaur in its tint, or a wild dinosaur (a few of a pack)
function foeArt(battle) {
  const c = CREATURES[battle.creature];
  if (c) {
    const art = babyArt(c.look, battle.lair ? 9 : 7.5, 'm');
    art.style.filter = c.tint;
    return art;
  }
  const big = { tiny: 3.5, small: 5, medium: 6.5, large: 7.5, huge: 8.5, colossal: 9 }[SPECIES[battle.creature].size] || 6;
  const lead = dressedArt(battle.creature, big * (battle.lair ? 1.1 : 1), 'm', null, null, 'adult');
  if (!battle.foe.pack) return lead;
  const group = document.createElement('div');
  group.className = 'pack-art';
  for (let k = 1; k < Math.min(3, battle.foe.count); k++) group.appendChild(dressedArt(battle.creature, big * 0.75, k % 2 ? 'f' : 'm', null, null, 'adult'));
  group.appendChild(lead);
  return group;
}

// battle: what collectTrip returned; who(id) finds a team member
export function playFight(battle, summary, who) {
  const dialog = document.getElementById('fightDialog');
  const body = document.getElementById('fightBody');
  clearTimeout(timer);
  const team = battle.team;
  const theirs = foeArt(battle);
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
  const fled = new Set(battle.fled || []);
  const packNote = i => fled.has(i) ? 'Ran off' : team[i].kind === 'pack' ? `${standing(i)} / ${hp[i].length} standing` : '';
  const boxes = team.map((u, i) => fighterBox('a', u.name, u.power, unitArt(u, who, team.length), sum(u.hp), packNote(i)));
  // a Triceratops' frill shows as its own little bar under its health
  const frillBar = (i, f) => {
    let bar = boxes[i].querySelector('.frill-bar');
    if (!bar) { bar = document.createElement('span'); bar.className = 'frill-bar'; bar.title = 'Frill'; boxes[i].querySelector('.hp').after(bar); }
    bar.innerHTML = Array.from({ length: FRILL.hp }, (_, k) => `<i class="${k < f ? 'on' : ''}"></i>`).join('');
  };
  team.forEach((u, i) => { if (u.frill && u.frill[0] !== null) frillBar(i, u.frill[0]); });
  // those who ran before the fight are shown faded
  boxes.forEach((b, i) => b.classList.toggle('fled', fled.has(i)));
  side.append(...boxes);
  side.classList.toggle('crowd', team.length > 2);
  // a wild pack's members all start with the same health
  const foeHp = Array.from({ length: battle.foe.count || 1 }, () => battle.foeMax / (battle.foe.count || 1));
  const foeNote = () => battle.foe.pack ? `${foeHp.filter(h => h > 0).length} / ${foeHp.length} standing` : '';
  const foeBox = fighterBox('b', battle.foe.name, battle.foe.power, theirs, battle.foeMax, foeNote());
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
    (battle.frill || []).forEach((list, i) => { if (list && list[0] !== null) frillBar(i, list[0]); });
    for (const i of battle.frenzy || []) boxes[i].classList.add('frenzy');
    setHp(foeBox, battle.foeHp, battle.foeMax);
    battle.foeHps.forEach((h, k) => { foeHp[k] = h; });
    foeBox.querySelector('.pack-left').textContent = foeNote();
    if (battle.win) foeBox.classList.add('down');
    else boxes.forEach((b, k) => { if (!fled.has(k)) b.classList.add('down'); });
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
    if (blow.by === 'bleed') {
      // a gored foe bleeding
      pop(foeBox, '−' + blow.dmg + ' bleeding', 'dmg');
      foeHp[blow.member] = blow.left;
      setHp(foeBox, blow.foeLeft, battle.foeMax);
      foeBox.querySelector('.pack-left').textContent = foeNote();
    } else if (blow.fell) {
      // fell off the foe it clung to: on its feet, or knocked down for a turn
      pop(boxes[blow.by], blow.landed ? 'Fell off, landed!' : 'Fell off!', 'miss');
    } else if (blow.recovering) {
      pop(boxes[blow.by], 'Getting up…', 'miss');
    } else if (blow.broke) {
      // it wrenched free of the hold
      lunge(foeBox);
      pop(boxes[blow.to], 'Broke free!', 'miss');
    } else if (blow.shake) {
      // the foe threw off a claw latched on to it
      lunge(foeBox);
      pop(boxes[blow.to], 'Shaken off!', 'miss');
    } else if (blow.pinned) {
      // pinned to the ground, it can't strike
      pop(foeBox, 'Pinned down!', 'mad');
    } else if (blow.immune) {
      // clinging to the foe's body, out of its reach
      lunge(foeBox);
      pop(boxes[blow.to], 'Out of reach!', 'miss');
    } else if (blow.blocked) {
      // the frill took it
      lunge(foeBox);
      pop(boxes[blow.to], 'Blocked by the frill!', 'miss');
      frillBar(blow.to, blow.frill);
    } else if (blow.by === 'foe') {
      lunge(foeBox);
      const box = boxes[blow.to];
      if (blow.miss) pop(box, 'Miss', 'miss');
      else if (!blow.dmg) pop(box, 'No effect', 'miss');
      else {
        pop(box, '−' + blow.dmg, 'dmg');
        strike(box);
        hp[blow.to][blow.member] = blow.left;
        // a stomp or a swipe that caught more of a pack
        for (const x of blow.also || []) hp[blow.to][x.member] = x.left;
        // a bone-breaking bite: a lamed leg or a neck
        if (blow.kill) pop(box, blow.part === 'neck' ? 'Neck bite!' : 'One bite!', 'mad');
        else if (blow.lame) pop(box, 'Leg broken!', 'mad');
        // armor plates took most of it, or the bare belly was hit
        else if (blow.armored) pop(box, 'Armor!', 'mad');
        else if (blow.tough) pop(box, 'Still standing!', 'mad');
        else if (blow.part === 'belly') pop(box, 'Belly!', 'mad');
        if (blow.also) pop(box, `×${blow.also.length + 1}`, 'mad');
        showUnit(blow.to);
      }
    } else if (blow.ally !== undefined) {
      // a rival biting one of its own team, or a frenzied one lashing out
      lunge(boxes[blow.by]);
      const box = boxes[blow.ally];
      if (blow.clash) for (const i of [blow.by, blow.ally]) { boxes[i].classList.add('frenzy'); pop(boxes[i], 'Frenzy!', 'mad'); }
      pop(box, '−' + blow.dmg, 'dmg');
      strike(box);
      hp[blow.ally][blow.member] = blow.left;
      showUnit(blow.ally);
    } else {
      lunge(boxes[blow.by]);
      // a defender's charge, striking back when attacked, or a noncombatant's blow through an opening
      const move = blow.hold ? 'Holding on!' : blow.grab === 'hold' ? 'Got a hold!' : blow.grab === 'kill' ? 'Seized!' : blow.grab === 'freed' ? 'Wrenched free!' : blow.latched ? 'Claw!' : blow.latch === 'cling' ? 'Clinging on!' : blow.latch === 'pin' ? 'Pinned it!' : blow.slash ? 'Slash!' : blow.grab === 'cling' ? 'Grabbed on!' : blow.thorns ? 'Spikes!' : blow.gore ? 'Gored!' : blow.charge ? 'Charge!' : blow.counter ? 'Counter!' : blow.opening ? 'Opening!' : '';
      if (move) pop(boxes[blow.by], move, 'mad');
      if (blow.miss) pop(foeBox, 'Miss', 'miss');
      // a bite its hide stops
      else if (!blow.dmg) pop(foeBox, 'No effect', 'miss');
      else {
        pop(foeBox, '−' + blow.dmg, 'dmg');
        strike(foeBox);
        foeHp[blow.member] = blow.left;
        for (const x of blow.also || []) foeHp[x.member] = x.left;
        if (blow.kill) pop(foeBox, blow.part === 'neck' ? 'Neck bite!' : 'One bite!', 'mad');
        else if (blow.lame) pop(foeBox, blow.club ? 'Shin broken!' : 'Leg broken!', 'mad');
        setHp(foeBox, blow.foeLeft, battle.foeMax);
        foeBox.querySelector('.pack-left').textContent = foeNote();
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
