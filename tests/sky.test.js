import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAt, sunTimes, moonPhase, NEST_LAT } from '../js/sky.js';
import { SPECIES } from '../js/config.js';

const hours = t => (t.set - t.rise) / 3600000;

test('the nest lies about where Oregon or Minnesota would: long summer days, short winter ones', () => {
  assert.ok(NEST_LAT > 40 && NEST_LAT < 50);
  const june = hours(sunTimes(new Date(2026, 5, 21, 12))), dec = hours(sunTimes(new Date(2026, 11, 21, 12)));
  assert.ok(june > 15 && june < 16, String(june));
  assert.ok(dec > 8.5 && dec < 9.2, String(dec));
  const equinox = hours(sunTimes(new Date(2026, 2, 20, 12)));
  assert.ok(Math.abs(equinox - 12.1) < 0.3, String(equinox));
});

test('day, dawn, dusk and night by the sun\'s height on the clock', () => {
  const at = h => skyAt(new Date(2026, 9, 19, h, 0));
  assert.equal(at(13).phase, 'day');
  assert.equal(at(13).dark, 0);
  assert.equal(at(23).phase, 'night');
  assert.equal(at(23).dark, 1);
  const t = sunTimes(new Date(2026, 9, 19, 12));
  assert.equal(skyAt(t.rise).phase, 'dawn');
  assert.equal(skyAt(t.set).phase, 'dusk');
});

test("the moon's real phase: full on 24 Nov 2026, new on 9 Nov", () => {
  assert.ok(Math.abs(moonPhase(Date.UTC(2026, 10, 24, 14, 53)) - 0.5) < 0.03);
  const p = moonPhase(Date.UTC(2026, 10, 9, 7, 2));
  assert.ok(p < 0.03 || p > 0.97);
});

test('awake by day, but a Velociraptor by night and a Protoceratops either way (eye rings)', () => {
  assert.equal(SPECIES.raptor.active, 'night');
  assert.equal(SPECIES.proto.active, 'both');
  assert.equal(SPECIES.coelo.active, undefined);
});
