// Tab bar. Other modules ask to be told when their tab opens instead of importing each other.
const TABS = { incubator: ['tabInc', 'panelInc'], nest: ['tabNest', 'panelNest'], inv: ['tabInv', 'panelInv'], shop: ['tabShop', 'panelShop'] };
const KEY = 'cretaceous-nest:tab';
const LEGACY_KEY = 'ninho-cretaceo:tab';

let current = 'incubator';
const changeHandlers = [];

export const currentTab = () => current;

// fn(name) runs every time a tab is shown, including the first one
export function onTabChange(fn) { changeHandlers.push(fn); }

export function setTab(next) {
  current = TABS[next] ? next : 'incubator';
  try { localStorage.setItem(KEY, current); } catch (e) {}
  for (const [name, [tabId, panelId]] of Object.entries(TABS)) {
    document.getElementById(tabId).setAttribute('aria-selected', String(name === current));
    document.getElementById(panelId).hidden = name !== current;
  }
  for (const fn of changeHandlers) fn(current);
}

export function initTabs() {
  let saved = null;
  try { saved = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY); } catch (e) {}
  for (const name of Object.keys(TABS)) document.getElementById(TABS[name][0]).addEventListener('click', () => setTab(name));
  setTab(saved);
}
