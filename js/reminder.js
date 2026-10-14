// Water reminder timing. Pure, so it can be tested; the screen part is js/ui/water.js.
//
// settings: { on, babyId, every (minutes), notify, lastAt (ms), day ('YYYY-M-D'), glasses }

export const MIN_EVERY = 1;
export const MAX_EVERY = 480;
export const PRESETS = [15, 30, 45, 60];
export const SNOOZE_MIN = 5;

export function clampEvery(m) {
  const n = Number(m);
  if (m === '' || m == null || !Number.isFinite(n)) return 30;
  return Math.min(MAX_EVERY, Math.max(MIN_EVERY, Math.round(n)));
}

export const defaults = () => ({ on: false, babyId: null, every: 30, notify: false, lastAt: 0, day: '', glasses: 0 });

export const nextDue = s => s.lastAt + clampEvery(s.every) * 60000;

export const isDue = (s, now) => !!s.on && !!s.babyId && now >= nextDue(s);

// the reminder waits another SNOOZE_MIN minutes, whatever the interval
export function snooze(s, now) {
  s.lastAt = now + SNOOZE_MIN * 60000 - clampEvery(s.every) * 60000;
}

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export const glassesToday = (s, now) => s.day === dayKey(now) ? s.glasses : 0;

export function addGlass(s, now) {
  const today = dayKey(now);
  if (s.day !== today) { s.day = today; s.glasses = 0; }
  s.glasses += 1;
}
