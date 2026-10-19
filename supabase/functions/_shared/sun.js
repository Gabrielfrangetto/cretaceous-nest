// The sun and the moon over the world: day and night at a place (its latitude and longitude, latOf and
// lonOf) at an instant, worked out from the instant alone (UTC), so the browser and the server see the
// same night. Each place keeps its own sun time, 4 minutes to a degree of longitude: across a continent
// this wide, as across the United States, the night comes some three hours later in the west than in
// the east. Summer days are long and winter nights longer, more so the further north.
import { latOf, lonOf } from './map.js';

const RAD = Math.PI / 180, DAY = 86400000;
const dayOfYear = t => Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 0)) / DAY);
const declination = t => -23.44 * Math.cos(2 * Math.PI / 365 * (dayOfYear(t) + 10));
// the place's sun time (hours, noon when the sun is highest)
export const sunHours = (t, lon) => ((((t % DAY) + DAY) % DAY) / 3600000 + lon / 15 + 48) % 24;
export const placeOf = h => ({ lat: latOf(h), lon: lonOf(h) });
// The world's clock, the same for every player: an instant as the place's sun time reads it, to be
// shown in UTC (new Date(worldTime(t, lon)) with timeZone 'UTC'); the nest's time unless told otherwise
export const NEST_LON = lonOf([0, 0]);
export const worldTime = (t, lon = NEST_LON) => t + lon / 15 * 3600000;

// the sun's altitude (degrees) at a place
export function sunAltitude(t, { lat, lon }) {
  const decl = declination(t), hourAngle = 15 * (sunHours(t, lon) - 12);
  return Math.asin(Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(hourAngle * RAD)) / RAD;
}

// that day's sunrise and sunset there (instants, the sun's rim on the horizon), or null where it never
// sets or never rises
export function sunTimes(t, { lat, lon }) {
  const decl = declination(t);
  const cos = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  if (Math.abs(cos) > 1) return null;
  const half = Math.acos(cos) / RAD / 15, noon = t + (12 - sunHours(t, lon)) * 3600000;
  return { rise: noon - half * 3600000, set: noon + half * 3600000 };
}

// 'day', 'dawn', 'dusk' or 'night' (the sun more than 6° down), and how dark, from 0 (the sun 6° up)
// to 1 (12° down)
export function skyAt(t, place) {
  const alt = sunAltitude(t, place);
  const phase = alt >= 6 ? 'day' : alt >= -6 ? (sunHours(t, place.lon) < 12 ? 'dawn' : 'dusk') : 'night';
  return { alt, phase, dark: Math.min(1, Math.max(0, (6 - alt) / 18)) };
}

// the moon's age through its month, 0 new, 0.5 full (from a known new moon, 6 Jan 2000); it trails the
// sun by as much of a day: full, it rises as the sun sets
export const moonPhase = t => ((((t - Date.UTC(2000, 0, 6, 18, 14)) / DAY) / 29.530588853) % 1 + 1) % 1;
export const moonAltitude = (t, place) => sunAltitude(t - moonPhase(t) * DAY, place);
