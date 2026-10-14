import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stamp, PAGES } from '../scripts/version.js';

test('pages point at the current version of every script and stylesheet', () => {
  for (const page of Object.keys(PAGES)) {
    const html = readFileSync(page, 'utf8');
    assert.ok(stamp(page, html) === html, `${page} is out of date: run node scripts/version.js`);
  }
});
