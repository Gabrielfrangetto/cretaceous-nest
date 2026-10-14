// Decides which save wins when a player signs in. Pure, so it can be tested without a server.
//
// local.owner is the account id the browser's save belongs to, or null for a guest game.

export const hasProgress = s => !!s && (s.hatched.length > 0 || !!s.current || s.coins > 0);

// 'upload-local' | 'use-remote' | 'start-fresh' | 'ask'
export function chooseSave(local, remote, userId) {
  const mine = local.owner === userId;
  const guest = !local.owner;
  if (!remote) {
    // a first sign-in takes the guest game along; a save left by another account is not theirs to take
    return mine || guest ? 'upload-local' : 'start-fresh';
  }
  if (mine) return (local.updatedAt || 0) > (remote.updatedAt || 0) ? 'upload-local' : 'use-remote';
  if (guest && hasProgress(local)) return 'ask';
  return 'use-remote';
}

export function summarize(s) {
  const babies = s.hatched.length;
  const parts = [`${babies} ${babies === 1 ? 'baby' : 'babies'}`, `${s.coins} coins`];
  if (s.current) parts.push('an egg in the incubator');
  return parts.join(', ');
}
