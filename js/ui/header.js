import { S, subscribe } from '../state.js';

let shown = null;

function render() {
  const coins = S.coins || 0;
  document.getElementById('coinsVal').textContent = coins;
  // the sanctuary's bills not yet paid
  const debt = document.getElementById('debtVal');
  debt.hidden = !S.debt;
  debt.textContent = S.debt ? `−${S.debt} owed` : '';
  if (shown !== null && coins !== shown) {
    const c = document.querySelector('.coins');
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }
  shown = coins;
}

// the menu in the top bar: the account, the water reminder, the tutorial; it closes on any choice or
// a click elsewhere
function initMenu() {
  const btn = document.getElementById('menuBtn'), menu = document.getElementById('menu');
  const show = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
  btn.addEventListener('click', e => { e.stopPropagation(); show(menu.hidden); });
  menu.addEventListener('click', e => { if (e.target.closest('button')) show(false); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });
  const water = document.getElementById('waterDialog');
  document.getElementById('waterBtn').addEventListener('click', () => water.showModal());
  document.getElementById('waterClose').addEventListener('click', () => water.close());
}

export function initHeader() {
  render();
  subscribe(render);
  initMenu();
}
