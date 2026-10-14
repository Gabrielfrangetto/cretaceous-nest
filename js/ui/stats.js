// Stat and gene displays: bars on cards and eggs, the full sheet in the baby window, and the
// step-by-step calculation behind each stat.
import { STATS, GENES_MAX } from '../config.js';
import { statSheet, geneGrade, genesPercent } from '../economy.js';

const BAR_SCALE = 100;   // stats can pass 100 with equipment; the bar just fills up
const pct = x => `${Math.round(x * 100)}%`;

// a baby or a bred egg: anything with a type and genes
export const sheetOf = thing => statSheet(thing);
export const powerText = thing => `Power ${statSheet(thing).power}`;

// final stats, each with its gene grade
export function statsHTML(thing, { compact = false } = {}) {
  const sheet = statSheet(thing);
  return `<dl class="stat-list ${compact ? 'compact' : ''}">${STATS.map(({ id, name, short }) => {
    const value = sheet.stats[id], genes = thing.genes[id];
    return `<div class="stat" title="${name} ${value} · genes ${genes} (${geneGrade(genes)})">
      <dt>${compact ? short : name}</dt>
      <dd><span class="stat-bar" aria-hidden="true"><i style="width:${Math.min(100, value / BAR_SCALE * 100).toFixed(0)}%"></i></span><b>${value}</b><span class="grade g-${geneGrade(genes)}" aria-label="genes grade ${geneGrade(genes)}">${geneGrade(genes)}</span></dd>
    </div>`;
  }).join('')}</dl>`;
}

// genes alone, for breeding (they are what a baby inherits)
export function genesHTML(genes) {
  return `<dl class="stat-list compact">${STATS.map(({ id, name, short }) => `
    <div class="stat" title="${name} genes ${genes[id]}">
      <dt>${short}</dt>
      <dd><span class="stat-bar genes" aria-hidden="true"><i style="width:${(genes[id] / GENES_MAX * 100).toFixed(0)}%"></i></span><b>${genes[id]}</b><span class="grade g-${geneGrade(genes[id])}">${geneGrade(genes[id])}</span></dd>
    </div>`).join('')}</dl>`;
}

export const genesText = genes => `Genes ${genesPercent(genes)}%`;

// combat numbers worked out from the stats
export function derivedHTML(thing) {
  const d = statSheet(thing).derived;
  return `<dl class="derived">
    <div><dt>Health</dt><dd>${d.hp}</dd></div>
    <div><dt>Damage</dt><dd>${d.damage}</dd></div>
    <div><dt>Dodge</dt><dd>${pct(d.dodge)}</dd></div>
    <div><dt>Damage reduction</dt><dd>${pct(d.reduction)}</dd></div>
  </dl>`;
}

// "Base 90 × genes 80 (90%) = 81", then any equipment steps
export function breakdownHTML(thing) {
  const sheet = statSheet(thing);
  return `<ul class="breakdown">${STATS.map(({ id, name }) => {
    const st = sheet.steps[id];
    const parts = [`base ${st.base} × genes ${st.genes} (${pct(st.factor)}) = ${Math.round(st.fromGenes)}`];
    if (st.flat) parts.push(`${st.flat > 0 ? '+' : '−'}${Math.abs(st.flat)} from items`);
    if (st.increased) parts.push(`${st.increased > 0 ? '+' : '−'}${pct(Math.abs(st.increased))}`);
    if (st.more !== 1) parts.push(`×${st.more.toFixed(2)}`);
    return `<li><strong>${name} ${st.value}</strong>: ${parts.join(', then ')}</li>`;
  }).join('')}</ul>`;
}
