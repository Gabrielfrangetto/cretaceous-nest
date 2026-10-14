// Detail window for one baby, opened from its card in "Your babies".
import { SPECIES, SEX } from '../config.js';
import { S } from '../state.js';
import { sexOf } from '../economy.js';
import { babyArt } from '../art.js';
import { esc, plural } from '../util.js';
import { statsHTML, powerText, genesText, derivedHTML, breakdownHTML } from './stats.js';

const dialog = document.getElementById('babyDialog');
const body = document.getElementById('babyBody');
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function parentsText(b) {
  if (!b.parents || !b.parents.length) return 'Hatched from a free egg';
  const names = b.parents.map(id => {
    const p = S.hatched.find(x => x.id === id);
    return p ? `${p.name} ${SEX[sexOf(p)].sym}` : 'a baby no longer in the nest';
  });
  return names.join(' and ');
}

export function openBabyInfo(id) {
  const b = S.hatched.find(x => x.id === id);
  if (!b) return;
  const sex = sexOf(b);
  body.innerHTML = `
    <div class="info-head">
      <div class="info-art"></div>
      <div>
        <h2 id="babyTitle">${esc(b.name)} ${SEX[sex].sym}</h2>
        <p class="hint">${SPECIES[b.type].species} · ${SEX[sex].word} · Gen ${b.gen || 1}</p>
        <p class="info-total">${powerText(b)}</p>
        <p class="hint">${genesText(b.genes)}</p>
      </div>
    </div>
    ${statsHTML(b)}
    <p class="hint grade-key">Letters grade the genes behind each stat: S 90+, A 75+, B 55+, C 35+, D below. Breed the best genes to raise them.</p>
    <h3>In combat</h3>
    ${derivedHTML(b)}
    <details class="how">
      <summary>How these numbers are worked out</summary>
      ${breakdownHTML(b)}
      <p class="hint">Each stat is the species' base scaled by the genes, from 50% at genes 0 to 100% at genes 100. Equipment will add flat bonuses, then percentage bonuses, then multipliers.</p>
    </details>
    <dl class="info-facts">
      <div><dt>Parents</dt><dd>${esc(parentsText(b))}</dd></div>
      <div><dt>Hatched</dt><dd>${dateFmt.format(new Date(b.at))}</dd></div>
      <div><dt>Meals</dt><dd>${plural(b.fed || 0, 'meal', 'meals')}</dd></div>
    </dl>`;
  const art = babyArt(b.type, 8, sex);
  body.querySelector('.info-art').appendChild(art);
  dialog.showModal();
}

export function initBabyInfo() {
  document.getElementById('babyClose').addEventListener('click', () => dialog.close());
  // a click on the dimmed backdrop closes it too
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
}
