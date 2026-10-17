/* The cutover forwarding script at the top of index.html (branch cutover-redirect): what the old address carries to the
   merged planner, and the build this browser had open last when the address carries nothing. The script runs only on
   gen2planner.jerrari3d.com, so here its function is taken from the page text and called directly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = /<!-- CUTOVER:[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html);
assert.ok(m, 'the cutover script is the first script of the page');
const forward = (() => {
  const w = {};
  new Function('window', 'location', 'localStorage', 'btoa', m[1])(w, undefined, undefined, (s) => Buffer.from(s, 'latin1').toString('base64'));
  return w.__gen2CutoverForward;
})();
const loc = (search = '', hash = '') => ({ search, hash });
const mem = (v) => ({ getItem: (k) => (k === 'gen2-last-build' ? v : null) });
const b64 = (s) => Buffer.from(unescape(encodeURIComponent(s)), 'latin1').toString('base64');

test('what the address carries goes along: a kit, the site ref, a store listing, a build hash, a labels link', () => {
  assert.equal(forward(loc('?build=185-tabletop-2w2h', ''), mem(null)), 'https://planner.modulith.systems/?ws=build&build=185-tabletop-2w2h');
  assert.equal(forward(loc('?ref=site', '#build=AAA'), mem(null)), 'https://planner.modulith.systems/?ws=build&ref=site#build=AAA');
  assert.equal(forward(loc('', '#labels-add=XYZ'), mem(null)), 'https://planner.modulith.systems/?ws=build#labels-add=XYZ');
  // ?from=<store>: the link printed in a listing's description; the merged planner counts it and seeds the store from it
  assert.equal(forward(loc('?from=makerworld', ''), mem(null)), 'https://planner.modulith.systems/?ws=build&from=makerworld');
  assert.equal(forward(loc('?from=thangs&build=185-tabletop-2w2h&ref=site', ''), mem(null)), 'https://planner.modulith.systems/?ws=build&build=185-tabletop-2w2h&ref=site&from=thangs');
  // anything else in the query stays behind (the old planner's own switches mean nothing there)
  assert.equal(forward(loc('?dev_viewer=http://localhost:9&theme=dark', ''), mem(null)), 'https://planner.modulith.systems/?ws=build');
});

test('an empty address carries the build this browser had open last, as the share-link form; a labels link stays beside it', () => {
  const rec = JSON.stringify({ mount: 'tabletop', length: 185, placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor' }], buildId: 'abcdefgh1234' });
  assert.equal(forward(loc('', ''), mem(rec)), 'https://planner.modulith.systems/?ws=build#build=' + b64(rec));
  assert.equal(forward(loc('', '#labels-add=XYZ'), mem(rec)), 'https://planner.modulith.systems/?ws=build#build=' + b64(rec) + '&labels-add=XYZ');
  // a store listing in the address is not a build: the slot still goes along
  assert.equal(forward(loc('?from=printables', ''), mem(rec)), 'https://planner.modulith.systems/?ws=build&from=printables#build=' + b64(rec));
  // a kit in the address, or a build in the hash, wins over the slot
  assert.equal(forward(loc('?build=185-tabletop-2w2h', ''), mem(rec)), 'https://planner.modulith.systems/?ws=build&build=185-tabletop-2w2h');
  assert.equal(forward(loc('', '#build=AAA'), mem(rec)), 'https://planner.modulith.systems/?ws=build#build=AAA');
});

test('a slot that is not a record, or no storage at all, forwards plain', () => {
  assert.equal(forward(loc('', ''), mem('not json')), 'https://planner.modulith.systems/?ws=build');
  assert.equal(forward(loc('', ''), mem('"a string"')), 'https://planner.modulith.systems/?ws=build');
  assert.equal(forward(loc('', ''), { getItem: () => { throw new Error('blocked'); } }), 'https://planner.modulith.systems/?ws=build');
});

test('a slot without a build forwards plain: nothing placed, or no mount or length chosen yet', () => {
  /* the first page load writes the slot, so most visitors hold one of these; forwarded, the merged planner shows
     "Can't show this build yet" ("null" mounts aren't supported) instead of its own start (loopback journey, 2026-10-17) */
  const unit = { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'decor' };
  for (const rec of [
    { mount: null, length: null, placed: [] },              // a fresh visit: the page's own first snapshot
    { mount: null, length: null, placed: [unit] },          // Surprise me before a mount was picked
    { mount: 'tabletop', length: null, placed: [unit] },
    { mount: 'tabletop', length: 185, placed: [] },         // a cleared build: this planner's own resume skips it too
    { mount: 'tabletop', length: 185 },
  ]) {
    assert.equal(forward(loc('', ''), mem(JSON.stringify(rec))), 'https://planner.modulith.systems/?ws=build', JSON.stringify(rec));
    assert.equal(forward(loc('?from=thangs', '#labels-add=XYZ'), mem(JSON.stringify(rec))), 'https://planner.modulith.systems/?ws=build&from=thangs#labels-add=XYZ', JSON.stringify(rec));
  }
});
