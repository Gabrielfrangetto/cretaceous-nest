import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAt, sunTimes, moonPhase, sunHours, placeOf, worldTime, NEST_LON, toReal, WORLD_DAY } from '../js/sun.js';
import { SPECIES, CREATURES, NIGHT, MAP, WORLD } from '../js/config.js';
import { encounterChance, awake } from '../js/world.js';

const NEST = placeOf([0, 0]);
// (all on the world's clock: an instant of it as the real one it falls on; an hour of it in real ms)
const HOUR = 3600000 / WORLD.speed;
const hours = t => (t.set - t.rise) / HOUR;
const at = (y, m, d, h = 12) => toReal(Date.UTC(y, m, d, h));

test("a real hour is a day of the world, its year about 15 real days", () => {
  assert.equal(WORLD_DAY, 60 * 60000);
  assert.ok(Math.abs(at(2027, 0, 1, 0) - at(2026, 0, 1, 0) - 365 * WORLD_DAY) < 1);
  const t = at(2026, 9, 19, 18);
  assert.ok(Math.abs(sunTimes(t + WORLD_DAY, NEST).rise - sunTimes(t, NEST).rise - WORLD_DAY) < 60000);
});

test('the nest lies as far north as Minnesota, on the meridian of the game clock (UTC): long summer days, short winter ones', () => {
  assert.ok(NEST.lat > 40 && NEST.lat < 50);
  assert.equal(NEST.lon, 0);
  assert.equal(new Date(worldTime(toReal(Date.UTC(2026, 9, 19, 15, 30)))).getUTCHours(), 15);
  const june = hours(sunTimes(at(2026, 5, 21, 18), NEST)), dec = hours(sunTimes(at(2026, 11, 21, 18), NEST));
  assert.ok(june > 15 && june < 16, String(june));
  assert.ok(dec > 8.5 && dec < 9.2, String(dec));
});

test('every place has its own sun time: night comes about three hours later in the far west', () => {
  const west = placeOf([-MAP.west, 0]), east = placeOf([MAP.cols - MAP.west - 1, 0]);
  const t = at(2026, 9, 19, 18);
  const lag = (sunTimes(t, west).set - sunTimes(t, east).set) / HOUR;
  assert.ok(lag > 3 && lag < 3.5, String(lag));
  // the same instant, different hours: noon at the nest is still morning in the west
  const noon = t + (12 - sunHours(t, NEST.lon)) * HOUR;
  assert.ok(Math.abs(sunHours(noon, NEST.lon) - 12) < 1e-9);
  assert.ok(sunHours(noon, west.lon) < 11);
});

test("day, dawn, dusk and night by the sun's height", () => {
  const { rise, set } = sunTimes(at(2026, 9, 19, 18), NEST);
  assert.equal(skyAt((rise + set) / 2, NEST).phase, 'day');
  assert.equal(skyAt((rise + set) / 2, NEST).dark, 0);
  assert.equal(skyAt(rise, NEST).phase, 'dawn');
  assert.equal(skyAt(set, NEST).phase, 'dusk');
  assert.equal(skyAt(set + 5 * HOUR, NEST).phase, 'night');
  assert.equal(skyAt(set + 5 * HOUR, NEST).dark, 1);
});

test("the moon's real phase: full on 24 Nov 2026, new on 9 Nov", () => {
  assert.ok(Math.abs(moonPhase(toReal(Date.UTC(2026, 10, 24, 14, 53))) - 0.5) < 0.03);
  const p = moonPhase(toReal(Date.UTC(2026, 10, 9, 7, 2)));
  assert.ok(p < 0.03 || p > 0.97);
});

test('awake by day, but a Velociraptor by night, a Protoceratops or a Deinosuchus either way (eye rings)', () => {
  assert.equal(SPECIES.raptor.active, 'night');
  assert.equal(SPECIES.proto.active, 'both');
  assert.equal(CREATURES.deinosuchus.active, 'both');
  assert.equal(SPECIES.coelo.active, undefined);
  // asleep, met far less often; a night hunter more at night; in the twilight, everyone is about
  assert.equal(awake(undefined, 'night'), NIGHT.asleep);
  assert.equal(awake('night', 'day'), NIGHT.asleep);
  assert.equal(awake('night', 'night'), NIGHT.prowl);
  assert.equal(awake(undefined, 'dusk'), 1);
  assert.equal(awake('both', 'night'), 1);
});

test('in the dark a team stands out less, but not to a night hunter', () => {
  const units = [{ members: [{ size: 'large' }] }];
  const threat = (species, role = 'attacker') => ({ chance: 0.4, entry: { species }, foe: { members: [{ role }] } });
  // (a Deinosuchus is awake either way: only how much the team stands out changes)
  const croc = { chance: 0.4, entry: { creature: 'deinosuchus' }, foe: { members: [{ role: 'attacker' }] } };
  assert.equal(encounterChance(croc, units, 'meadow', false, 'night'), encounterChance(croc, units, 'meadow', false, 'day'));
  const day = encounterChance(threat('dilo'), units, 'meadow', false, 'day');
  assert.ok(Math.abs(encounterChance(threat('dilo'), units, 'meadow', false, 'night') - day * NIGHT.asleep * NIGHT.unseen) < 1e-9);
  const raptorDay = encounterChance(threat('raptor'), units, 'meadow', false, 'day') / NIGHT.asleep;
  assert.ok(Math.abs(encounterChance(threat('raptor'), units, 'meadow', false, 'night') - Math.min(1, raptorDay * NIGHT.prowl)) < 1e-9);
});

test("the world's clock is the same for every player: the place's sun time, noon when the sun is highest", () => {
  const t = at(2026, 9, 19, 18), noon = t + (12 - sunHours(t, NEST.lon)) * HOUR;
  assert.equal(NEST_LON, NEST.lon);
  assert.equal(new Date(worldTime(noon)).getUTCHours(), 12);
  const west = placeOf([-MAP.west, 0]);
  assert.ok(new Date(worldTime(noon, west.lon)).getUTCHours() < 12);
});
