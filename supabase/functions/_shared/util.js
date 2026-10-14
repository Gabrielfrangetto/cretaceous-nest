export function fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

export const minsLabel = m => m >= 60 ? (m / 60) + ' h' : m + ' min';

export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function hashId(id) {
  let s = 0;
  for (const ch of String(id)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return s;
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
