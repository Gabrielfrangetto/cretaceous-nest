// Small stat bars shown on baby cards, the hatch screen and the breeding panel.
import { STATS, STAT_MAX } from '../config.js';
import { statTotal } from '../economy.js';

export function statsHTML(stats, { compact = false } = {}) {
  if (!stats) return '';
  return `<dl class="stat-list ${compact ? 'compact' : ''}">${STATS.map(({ id, name, short }) => `
    <div class="stat" title="${name}">
      <dt>${compact ? short : name}</dt>
      <dd><span class="stat-bar" aria-hidden="true"><i style="width:${(stats[id] / STAT_MAX * 100).toFixed(0)}%"></i></span><b>${stats[id]}</b></dd>
    </div>`).join('')}
  </dl>`;
}

export const totalText = stats => `Total ${statTotal(stats)}`;
