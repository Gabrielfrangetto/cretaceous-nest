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

export function initHeader() {
  render();
  subscribe(render);
}
