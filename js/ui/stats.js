// Stat and gene displays: bars on cards and eggs, the full sheet in the baby window, and the
// step-by-step calculation behind each stat.
import { STATS, GENES_MAX, LOAD_FREE, SPECIES, CLAW, KG } from '../config.js';
import { statSheet, geneGrade, genesPercent, carriedWeight, carryCapacity, loadFactor, massOf, hpForMass, biteForMass } from '../economy.js';

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

// how much it carries out of its capacity, and what the load costs in agility
export function loadHTML(b) {
  const w = carriedWeight(b), cap = carryCapacity(b), share = Math.min(1, w / cap), f = loadFactor(b);
  return `<div class="load"><span class="load-label">Load <strong>${w} / ${cap}</strong></span>
    <span class="load-bar" aria-hidden="true"><i class="${f < 1 ? 'heavy' : ''}" style="width:${(share * 100).toFixed(0)}%"></i><b style="left:${LOAD_FREE * 100}%"></b></span>
    <span class="hint">${f < 1 ? `Heavy: −${Math.round((1 - f) * 100)}% AGI` : 'Light: no penalty'}</span></div>`;
}

// combat numbers worked out from the stats
export function derivedHTML(thing) {
  const d = statSheet(thing).derived;
  // jaws and hide belong to the species (the player has neither)
  const sp = SPECIES[thing.type];
  // the health it fights with: its vitality's, grown with its weight at its stage
  const kg = massOf(thing), hp = Math.round(hpForMass(d.hp, kg) * ((sp && sp.fragile) || 1));
  return `<dl class="derived">
    <div title="From its vitality and its weight (${Math.round(kg)} kg)"><dt>Health</dt><dd>${hp}</dd></div>
    <div><dt>Damage</dt><dd>${d.damage}</dd></div>
    <div><dt>Dodge</dt><dd>${pct(d.dodge)}</dd></div>
    <div><dt>Damage reduction</dt><dd>${pct(d.reduction)}</dd></div>
    ${sp ? `<div title="The hardest one blow can land, whatever its genes or equipment: a growing one bites weaker"><dt>Strongest bite</dt><dd>${biteForMass(sp.bite, kg, KG[thing.type])}</dd></div>
    ${sp.claw ? `<div title="Its sickle claw on prey no bigger than itself"><dt>Strongest claw</dt><dd>${CLAW.bite}</dd></div>` : ''}
    <div title="Taken off every blow it takes, after damage reduction"><dt>Hide</dt><dd>${sp.hide}</dd></div>` : ''}
  </dl>`;
}

// one equipment bonus as players read it: "+5 STR", "+10% STR", "−25% AGI", "×1.10 STR"
const SHORT = Object.fromEntries(STATS.map(s => [s.id, s.short]));
export function modText(m) {
  const sign = m.value < 0 ? '−' : '+';
  if (m.type === 'flat') return `${sign}${Math.abs(m.value)} ${SHORT[m.stat]}`;
  if (m.type === 'increased') return `${sign}${Math.round(Math.abs(m.value) * 100)}% ${SHORT[m.stat]}`;
  return `×${m.value.toFixed(2)} ${SHORT[m.stat]}`;
}
export const modsHTML = mods => `<span class="mods">${mods.map(m => `<span class="mod ${(m.type === 'more' ? m.value < 1 : m.value < 0) ? 'down' : 'up'}">${modText(m)}</span>`).join('')}</span>`;

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
  }).join('')}${thing.care ? `<li class="hint">Raised among Hypacrosaurus: ×${(1 + thing.care).toFixed(2)} to every stat, for life</li>` : ''}${thing.stomach ? '<li class="hint">Raised in a Psittacosaurus creche: a strong stomach, it gets hungry more slowly</li>' : ''}</ul>`;
}
