// Stamps every script and stylesheet address with a hash of its contents, so after a deploy no
// browser or CDN cache can mix an old file with new ones. Run before committing: node scripts/version.js
//
// The modules import each other by plain paths ('./config.js'); an import map in each page sends
// each of those paths to its hashed address. Files that did not change keep their address and cache.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const START = '<!-- assets:start -->';
const END = '<!-- assets:end -->';

// each page: where it sits relative to the site root, and the module it starts (if any)
export const PAGES = {
  'index.html': { up: './', entry: 'js/main.js' },
  'privacy.html': { up: './' },
  'terms.html': { up: './' },
  'tools/anchors.html': { up: '../', entry: 'tools/anchors.js' },
};

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name).split(sep).join('/')] : []);
// line endings differ between checkouts on Windows and Linux, so they don't count towards the hash
export const hashOf = file => createHash('sha1').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);

export function block(page) {
  const { up, entry } = PAGES[page];
  const lines = [START, `<link rel="stylesheet" href="${up}css/style.css?v=${hashOf('css/style.css')}">`];
  if (entry) {
    const modules = [...files('js'), ...files('tools')].sort();
    const imports = Object.fromEntries(modules.map(f => [`${up}${f}`, `${up}${f}?v=${hashOf(f)}`]));
    lines.push(`<script type="importmap">${JSON.stringify({ imports }, null, 1).replace(/\n\s*/g, ' ')}</script>`);
    lines.push(`<script type="module" src="${up}${entry}?v=${hashOf(entry)}"></script>`);
  }
  lines.push(END);
  return lines.join('\n');
}

export function stamp(page, html) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`${page} has no ${START} … ${END} block`);
  return html.slice(0, a) + block(page) + html.slice(b + END.length);
}

if (process.argv[1] && process.argv[1].endsWith('version.js')) {
  for (const page of Object.keys(PAGES)) writeFileSync(page, stamp(page, readFileSync(page, 'utf8')));
  console.log('Stamped asset versions in ' + Object.keys(PAGES).join(', '));
}
