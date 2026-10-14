import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stamp } from '../scripts/version.js';

test('pages point at the current version of every script and stylesheet', () => {
  for (const page of ['index.html', 'privacy.html', 'terms.html']) {
    const html = readFileSync(page, 'utf8');
    assert.ok(stamp(page, html) === html, `${page} is out of date: run node scripts/version.js`);
  }
});
