// Rewards tab: the daily reward streak and the achievements, plus the badge on the tab.
import { DAILY_REWARDS, ITEMS, EGG_TRAY_SIZE } from '../config.js';
import { S, subscribe } from '../state.js';
import { dailyStatus, nextDayAt, achievementList, claimableCount, roomFor } from '../economy.js';
import { act, redeem } from '../actions.js';
import { now } from '../clock.js';
import { ITEM_ICONS } from '../art.js';
import { esc, plural } from '../util.js';
import { currentTab, onTabChange } from './tabs.js';

const COIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#e9b83a" stroke="#a87812"/><path d="M8 12.2 C6.6 12.2 6.2 10.8 6.9 9.6 L5.2 6.3 M8 9.2 L8 4.4 M9.1 9.6 L10.8 6.3" stroke="#7d5408" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>';
const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v4a5 5 0 0 1-10 0V3Z" fill="#e9b83a" stroke="#a87812" stroke-width="1.2"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" fill="none" stroke="#a87812" stroke-width="1.4"/><path d="M10.5 12h3l.7 4h-4.4l.7-4Z" fill="#c9952a"/><rect x="7.5" y="16" width="9" height="3.2" rx="1" fill="#9c7240"/></svg>';

let message = '';
let codeMessage = '', codeOk = false;
const CODE_PROBLEMS = {
  invalid: 'That code doesn\'t exist. Check it and try again.',
  used: 'You have already redeemed this code.',
  expired: 'This code has expired.',
  offline: 'Could not reach the server. Check your connection and try again.',
  'tray-full': `Your egg tray is full (${EGG_TRAY_SIZE} eggs). Hatch one first, then redeem the code.`,
};

const itemsText = items => Object.entries(items || {}).map(([id, n]) => n + ' ' + (n === 1 ? ITEMS[id].name.toLowerCase() : ITEMS[id].plural)).join(', ');
const rewardText = r => [`${r.coins} coins`, itemsText(r.items)].filter(Boolean).join(' and ');

function untilText(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

function updateBadge() {
  const n = claimableCount(S, now());
  const pill = document.getElementById('rewardsPill');
  pill.hidden = n === 0;
  pill.textContent = n;
}

function render() {
  const box = document.getElementById('rewardsBox');
  const t = now();
  const st = dailyStatus(S, t);
  const doneThrough = st.claimedToday ? st.index : st.index - 1;   // days of this cycle already claimed

  const strip = DAILY_REWARDS.map((r, i) => {
    const state = i <= doneThrough ? 'got' : i === st.index ? 'today' : 'later';
    const icons = Object.keys(r.items || {}).map(id => `<span class="mini">${ITEM_ICONS[id]}</span>`).join('');
    return `<li class="day ${state}" aria-label="Day ${i + 1}: ${esc(rewardText(r))}${state === 'got' ? ', claimed' : ''}">
      <span class="day-n">Day ${i + 1}</span>
      <span class="day-coins">${COIN}${r.coins}</span>
      <span class="day-items">${icons}</span>
      ${state === 'got' ? '<span class="tick" aria-hidden="true">✓</span>' : ''}
    </li>`;
  }).join('');

  const noRoom = Object.entries(st.reward.items || {}).filter(([id, n]) => roomFor(S, id) < n).map(([id]) => ITEMS[id].plural);
  const nextIndex = (st.index + 1) % DAILY_REWARDS.length;
  const daily = st.claimedToday
    ? `<p class="hint">Come back in <strong>${untilText(nextDayAt(t) - t)}</strong> for day ${nextIndex + 1}: ${esc(rewardText(DAILY_REWARDS[nextIndex]))}.</p>`
    : `<div class="row"><button class="btn" id="claimDaily" type="button">Claim day ${st.index + 1}: ${esc(rewardText(st.reward))}</button></div>
       ${noRoom.length ? `<p class="hint warn-text">Your inventory is full, so the ${esc(noRoom.join(' and '))} won't fit. Make room first to keep them.</p>` : ''}`;

  const list = achievementList(S);
  const claimedCount = list.filter(a => a.claimed).length;
  const cards = list.map(a => `
    <li class="ach ${a.claimed ? 'claimed' : a.done ? 'ready' : ''}">
      <div class="ach-icon">${TROPHY}</div>
      <div class="ach-body">
        <h3>${esc(a.title)}</h3>
        <p class="hint">${esc(a.desc)}</p>
        <div class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${a.target}" aria-valuenow="${a.progress}" aria-label="${esc(a.title)} progress"><i style="width:${(a.progress / a.target * 100).toFixed(1)}%"></i></div>
        <p class="ach-count">${a.progress.toLocaleString('en-US')} / ${a.target.toLocaleString('en-US')}</p>
      </div>
      <div class="ach-reward">
        <span class="ach-coins">${COIN}+${a.coins}</span>
        ${a.claimed ? '<span class="hint">Claimed</span>' : a.done ? `<button class="btn small" type="button" data-claim="${a.id}">Claim</button>` : ''}
      </div>
    </li>`).join('');

  box.innerHTML = `
    <section class="daily">
      <div class="daily-head">
        <h2>Daily reward</h2>
        <p class="hint">Streak: <strong>${plural(st.streak, 'day', 'days')}</strong> · Best: ${plural(st.best, 'day', 'days')}. Miss a day and the streak starts over.</p>
      </div>
      <ol class="days">${strip}</ol>
      ${daily}
    </section>
    ${message ? `<p class="hint" role="status">${esc(message)}</p>` : ''}
    <section class="codes">
      <h2>Event codes</h2>
      <p class="hint">Got a code from an event? Type it here. Each code works once.</p>
      <form class="row" id="codeForm"><input type="text" id="codeInput" maxlength="32" autocomplete="off" spellcheck="false" placeholder="XXX-XXXX-XXXX" aria-label="Event code">
        <button class="btn" type="submit">Redeem</button></form>
      ${codeMessage ? `<p class="hint ${codeOk ? '' : 'warn-text'}" role="status">${esc(codeMessage)}</p>` : ''}
    </section>
    <section class="achievements">
      <div class="collection-head"><h2>Achievements</h2><span class="count">${claimedCount} of ${list.length} claimed</span></div>
      <ul class="ach-list">${cards}</ul>
    </section>`;

  const claim = document.getElementById('claimDaily');
  if (claim) claim.addEventListener('click', () => {
    const r = act('claimDaily');
    if (!r.ok) return;
    const lost = itemsText(r.lost);
    message = `Claimed day ${((r.streak - 1) % DAILY_REWARDS.length) + 1}: ${rewardText(r.reward)}.` + (lost ? ` The ${lost} didn't fit in your inventory.` : '');
    render();
  });
  document.getElementById('codeForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const code = document.getElementById('codeInput').value;
    if (!code.trim()) return;
    ev.target.querySelector('button').disabled = true;
    const r = await redeem(code);
    codeOk = r.ok;
    codeMessage = r.ok ? (r.egg ? 'Code redeemed: an egg is waiting in your egg tray, in the Incubator.' : 'Code redeemed.') : CODE_PROBLEMS[r.reason] || 'That code could not be redeemed.';
    render();
  });
  box.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => {
    const r = act('claimAchievement', { id: b.dataset.claim });
    if (!r.ok) return;
    message = `Achievement claimed: +${r.coins} coins.`;
    render();
  }));
}

export function initRewards() {
  updateBadge();
  subscribe(() => { updateBadge(); if (currentTab() === 'rewards') render(); });
  onTabChange(name => { if (name === 'rewards') { message = ''; codeMessage = ''; render(); } });
  // the day can change while the page is open
  setInterval(() => { updateBadge(); if (currentTab() === 'rewards' && !document.hidden) render(); }, 30000);
}
