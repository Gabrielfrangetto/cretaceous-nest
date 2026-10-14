// The screen modules touch the page as soon as they load, so the other tests can't import them.
// This at least makes sure every script in the game parses, so a typo never reaches the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);

test('every game script parses', () => {
  const broken = [];
  for (const file of files('js')) {
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
    catch (e) { broken.push(`${file}: ${String(e.stderr).split('\n').find(l => l.includes('Error')) || 'syntax error'}`); }
  }
  assert.deepEqual(broken, []);
});
