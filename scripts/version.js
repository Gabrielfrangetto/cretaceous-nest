// Stamps every script and stylesheet address with a hash of its contents, so after a deploy no
// browser or CDN cache can mix an old file with new ones. Run before committing: node scripts/version.js
//
// The modules import each other by plain paths ('./config.js'); an import map in index.html sends
// each of those paths to its hashed address. Files that did not change keep their address and cache.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const START = '<!-- assets:start -->';
const END = '<!-- assets:end -->';
const PAGES = ['index.html', 'privacy.html', 'terms.html'];

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name).replaceAll('\\', '/')] : []);
// line endings differ between checkouts on Windows and Linux, so they don't count towards the hash
export const hashOf = file => createHash('sha1').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);

export function assetsBlock() {
  const imports = Object.fromEntries(files('js').sort().map(f => [`./${f}`, `./${f}?v=${hashOf(f)}`]));
  return [
    START,
    `<link rel="stylesheet" href="css/style.css?v=${hashOf('css/style.css')}">`,
    `<script type="importmap">${JSON.stringify({ imports }, null, 1).replace(/\n\s*/g, ' ')}</script>`,
    `<script type="module" src="js/main.js?v=${hashOf('js/main.js')}"></script>`,
    END,
  ].join('\n');
}

export const cssOnlyBlock = () => [START, `<link rel="stylesheet" href="css/style.css?v=${hashOf('css/style.css')}">`, END].join('\n');

export function stamp(page, html) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`${page} has no ${START} … ${END} block`);
  return html.slice(0, a) + (page === 'index.html' ? assetsBlock() : cssOnlyBlock()) + html.slice(b + END.length);
}

if (process.argv[1] && process.argv[1].endsWith('version.js')) {
  for (const page of PAGES) writeFileSync(page, stamp(page, readFileSync(page, 'utf8')));
  console.log('Stamped asset versions in ' + PAGES.join(', '));
}
