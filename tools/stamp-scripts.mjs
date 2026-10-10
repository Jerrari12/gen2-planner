// Version-stamp every local <script src> and stylesheet <link href> in index.html with a hash of the file it loads.
//
// GitHub Pages caches each file for 10 minutes. Without stamps, a tab refreshed (or opened) soon after a deploy gets the NEW
// index.html with the OLD cached app.js, data.js ... - and runs old code inside the new page: a share link carrying a label
// list was dropped that way, the new masthead button never appeared, and "Refresh the planner tab" did not help until the
// cache ran out (stale-tab deploy test, 2026-10-10). The planner deploys straight from the branch with no build step, so the
// stamps live in index.html itself: `src="js/app.js?v=<8 hex>"`, the hex being the first 8 of the sha256 of the file (CRLF
// read as LF, so every checkout agrees). A changed file gets a new URL; an unchanged one keeps its cached copy. Same tool as
// the Label Studio's. test/script-stamps.test.mjs fails while any stamp is stale - re-run this after editing any js/ or css/
// file the page loads (npm run sync:contract rewrites js/requirement-scope.js, so run it after that too).
//
//   node tools/stamp-scripts.mjs          rewrite the stamps in index.html (byte-exact everywhere else)
//   node tools/stamp-scripts.mjs --check  exit 1 and list the stale stamps
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// local paths only (no scheme, no query of another kind); any other attributes are kept as they are
const REFS = [
  /(<script\b[^>]*?\bsrc=")([^"?#:]+\.js)(\?v=[0-9a-f]*)?(")/g,
  /(<link\b[^>]*?\bhref=")([^"?#:]+\.css)(\?v=[0-9a-f]*)?(")/g,
];

export const stampOf = (bytes) =>
  createHash('sha256').update(Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex').slice(0, 8);

// -> { html (latin1 string, stamps current), stale: [{ path, had, want }], refs: [path] }
export function stampPlan(htmlBytes, read = (p) => readFileSync(join(ROOT, p))) {
  let html = htmlBytes.toString('latin1');
  const stale = [], refs = [];
  for (const re of REFS) {
    html = html.replace(re, (whole, open, path, q, close) => {
      const want = stampOf(read(path));
      const had = q ? q.slice(3) : null;
      refs.push(path);
      if (had !== want) stale.push({ path, had, want });
      return `${open}${path}?v=${want}${close}`;
    });
  }
  return { html, stale, refs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(ROOT, 'index.html');
  const { html, stale } = stampPlan(readFileSync(file));
  if (process.argv.includes('--check')) {
    for (const s of stale) console.log(`stale: ${s.path} has ${s.had ?? 'no stamp'}, wants ${s.want}`);
    process.exit(stale.length ? 1 : 0);
  }
  writeFileSync(file, Buffer.from(html, 'latin1'));
  console.log(stale.length ? `stamped ${stale.length}: ${stale.map((s) => s.path).join(', ')}` : 'all stamps current');
}
