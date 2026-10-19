// Day and night at the nest, as they are right now on the player's own clock: the sun's height over the
// nest's latitude (latOf) on today's date, so summer days are long and winter nights longer, and the
// moon in its real phase. Only the screens use it; the rules don't.
import { latOf } from './map.js';

const RAD = Math.PI / 180;
export const NEST_LAT = latOf([0, 0]);
// the sun's altitude (degrees) at the nest. The clock is taken as local solar time, an hour back in
// daylight saving time.
export function sunAltitude(date, lat = NEST_LAT) {
  const decl = declination(date);
  const hourAngle = 15 * (solarHours(date) - 12);
  return Math.asin(Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(hourAngle * RAD)) / RAD;
}
const dayOfYear = d => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
const declination = d => -23.44 * Math.cos(2 * Math.PI / 365 * (dayOfYear(d) + 10));
// hours ahead of standard time (daylight saving)
const dst = d => {
  const y = d.getFullYear(), std = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
  return (std - d.getTimezoneOffset()) / 60;
};
const solarHours = d => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 - dst(d);

// today's sunrise and sunset on the clock (Dates), the sun's rim on the horizon; null where it never sets
// or never rises
export function sunTimes(date, lat = NEST_LAT) {
  const decl = declination(date);
  const cos = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  if (Math.abs(cos) > 1) return null;
  const half = Math.acos(cos) / RAD / 15;
  const at = h => { const t = new Date(date); t.setHours(0, 0, 0, 0); return new Date(+t + (h + dst(date)) * 3600000); };
  return { rise: at(12 - half), set: at(12 + half) };
}

// 'day', 'dawn', 'dusk' or 'night' (the sun more than 6° below the horizon), and how dark it is, from 0
// (the sun 6° up) to 1 (12° below)
export function skyAt(date, lat = NEST_LAT) {
  const alt = sunAltitude(date, lat);
  const phase = alt >= 6 ? 'day' : alt >= -6 ? (solarHours(date) < 12 ? 'dawn' : 'dusk') : 'night';
  return { alt, phase, dark: Math.min(1, Math.max(0, (6 - alt) / 18)) };
}

// the moon's age through its month, 0 new, 0.5 full (from a known new moon, 6 Jan 2000)
export const moonPhase = date => ((((date - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) / 29.530588853) % 1 + 1) % 1;
