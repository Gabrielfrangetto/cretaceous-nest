// Which save wins when a player signs in, and the limits applied to a guest save brought into an
// account. Pure, so the browser, the server and the tests share it.
//
// local.owner is the account id the browser's save belongs to, or null for a guest game.
import { SPECIES, TAP_CAP } from './config.js';
import { countItem, removeItem, WILD_GENES_MAX, isGear } from './economy.js';
import { ITEMS } from './config.js';

export const hasProgress = s => !!s && (s.hatched.length > 0 || !!s.current || s.coins > 0);

// 'claim' | 'use-remote' | 'start-fresh' | 'ask'
export function chooseSave(local, remote, userId) {
  const mine = local.owner === userId;
  const guest = !local.owner;
  if (!remote) {
    // a first sign-in takes the guest game along; a save left by another account is not theirs to take
    return mine || guest ? 'claim' : 'start-fresh';
  }
  // the server keeps the real copy of an account's save, so it always wins for its owner
  if (mine) return 'use-remote';
  if (guest && hasProgress(local)) return 'ask';
  return 'use-remote';
}

export function summarize(s) {
  const babies = s.hatched.length;
  const parts = [`${babies} ${babies === 1 ? 'baby' : 'babies'}`, `${s.coins} coins`];
  if (s.current) parts.push('an egg in the incubator');
  return parts.join(', ');
}

// A guest save lives in the browser and can be edited, so the server accepts it into an account
// only within limits a real player could plausibly reach.
export const GUEST_LIMITS = {
  coins: 1000,
  babies: 40,
  invSize: 30,
  items: { leaf: 150, meat: 150, amber: 1 },   // shells are capped by the babies they came from
  mealsPerBaby: 300,
};

export function capGuestSave(s, now) {
  s.coins = Math.min(s.coins, GUEST_LIMITS.coins);
  s.invSize = Math.min(s.invSize, GUEST_LIMITS.invSize);
  for (let i = s.invSize; i < s.inv.length; i++) s.inv[i] = null;

  s.hatched = s.hatched.slice(0, GUEST_LIMITS.babies).map(b => ({
    ...b,
    at: Math.min(Number(b.at) || now, now),
    lastFed: b.lastFed ? Math.min(Number(b.lastFed) || now, now) : undefined,
    fed: Math.min(GUEST_LIMITS.mealsPerBaby, Math.max(0, Math.floor(Number(b.fed) || 0))),
  }));

  const limits = {
    ...GUEST_LIMITS.items,
    shell: s.hatched.filter(b => b.type !== 'rex').length,
    golden_shell: s.hatched.filter(b => b.type === 'rex').length,
  };
  for (const [id, max] of Object.entries(limits)) {
    const extra = countItem(s, id) - max;
    if (extra > 0) removeItem(s, id, extra);
  }

  // running totals and the streak can't be checked, so they restart from what the save shows
  s.stats = { coinsEarned: s.coins, meals: s.hatched.reduce((t, b) => t + b.fed, 0), purchases: 0, eggsLaid: 0 };
  s.daily = { last: null, streak: 0, best: 0 };

  // bred genes can't be checked either, so nothing may beat what a free egg can give
  const capGenes = g => g ? Object.fromEntries(Object.entries(WILD_GENES_MAX).map(([id, m]) => [id, Math.min(m, g[id])])) : g;
  s.hatched = s.hatched.map(b => ({ ...b, genes: capGenes(b.genes), gen: 1 }));
  s.eggs = (s.eggs || []).map(e => ({ ...e, genes: capGenes(e.genes), gen: 1 }));
  s.breeding = null;

  // outfits will be earned or bought, which a browser save can't prove, so they stay out of accounts
  s.wardrobe = [];
  s.hatched = s.hatched.map(({ outfit, ...b }) => b);

  // equipment costs coins, so a guest save keeps at most one of each piece, worn or in the bag
  const owned = new Set();
  s.hatched = s.hatched.map(b => {
    const equip = {};
    for (const [slot, id] of Object.entries(b.equip || {})) if (isGear(id) && !owned.has(id)) { owned.add(id); equip[slot] = id; }
    return { ...b, equip };
  });
  for (const id of Object.keys(ITEMS).filter(isGear)) {
    const keep = owned.has(id) ? 0 : 1;
    const extra = countItem(s, id) - keep;
    if (extra > 0) removeItem(s, id, extra);
  }

  if (s.current) {
    const egg = s.current;
    const duration = SPECIES[egg.type].mins * 60000;
    s.current = {
      type: egg.type,
      startedAt: Math.min(Number(egg.startedAt) || now, now),
      duration,
      bonus: Math.min(Math.max(0, Number(egg.bonus) || 0), duration * TAP_CAP),
    };
    // a bred egg keeps its genes, held to free-egg limits like everything else
    if (egg.genes) Object.assign(s.current, { genes: capGenes(egg.genes), gen: 1 });
  }
  return s;
}
