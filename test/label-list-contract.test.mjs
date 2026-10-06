/* PLANNER <-> THE LABEL LIST: THE CONTRACT (handoffs/label-release/LABEL-LIST-FORMAT.md; vault decisions.md "The label tool").

   The label list (the EdgeLabel generator's label-list.js) decides what a drawer's label IS when a build is converted and
   reconciled; the planner's own cleaners decide it everywhere else. Nothing else checks that they agree, so this test runs
   both in one process:
   - the module's cleanText / cleanBadge / cleanStyle against the planner's cleanLabelText / cleanLabelBadge / cleanLabelStyle on
     the same (hostile) inputs, and its constants against the planner's LABEL_MAX and GEN2.labelSpec;
   - the APPEARANCE RULE through the planner's REAL sanitizer: a build goes through applyBuild, and converting its drawers
     (fromLegacyUnits) must give back exactly the words and badges the planner holds - an explicit "no icon" stays, an absent
     badge stays absent, nothing is deduplicated.

   The module is loaded by the page as js/label-list.js (label tool step 3: the planner runs it) and sha256-PINNED. C-pin-2 compares it byte-for-byte with a
   generator checkout when one can be found (GEN2_EDGELABEL_ROOT or a sibling folder) and reports "not run" otherwise.
   To move the pin: copy the generator's label-list.js here, run `sha256sum`, edit PIN, and say why in the commit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { cleaners, bootPlanner, labelBuild, unit, plain, root } from './lib/label-env.mjs';

const require = createRequire(import.meta.url);
const PIN = 'e8df8966b82dbfd70f70c38061009bb0a3264ae5d7a15df0e8139d69e9f34b81';   // generator step3 e91500e: hardware labels, editInPlace (edits and clears), appendLabels
const VENDORED = join(root, 'js', 'label-list.js');
const L = require('../js/label-list.js');
const C = cleaners();

function generatorCandidates() {
  const c = [];
  if (process.env.GEN2_EDGELABEL_ROOT) c.push(resolve(process.env.GEN2_EDGELABEL_ROOT));
  for (const rel of ['../../EdgeLabel', '../../../GEN2 EdgeLabel Label Generator', '../GEN2 EdgeLabel Label Generator', '../../GEN2 EdgeLabel Label Generator', '../EdgeLabel'])
    c.push(resolve(root, rel));
  return c.filter((p) => existsSync(join(p, 'label-list.js')));
}

test('LC-pin-1: the vendored label-list.js is the pinned file', () => {
  assert.equal(createHash('sha256').update(readFileSync(VENDORED)).digest('hex'), PIN);
});

test('LC-pin-2: the vendored copy equals the generator checkout\'s label-list.js, byte for byte', (t) => {
  const found = generatorCandidates();
  if (!found.length) { t.skip('NOT RUN: no generator checkout with label-list.js found (set GEN2_EDGELABEL_ROOT) - the byte-equality check did not happen'); return; }
  const gen = found[0];
  let rev = 'unknown commit';
  try { rev = execFileSync('git', ['-C', gen, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { /* not a git folder */ }
  console.log(`# compared with ${gen} @ ${rev}`);
  assert.equal(readFileSync(join(gen, 'label-list.js')).compare(readFileSync(VENDORED)), 0, `the vendored copy differs from ${gen} @ ${rev}`);
});

// hostile inputs, the kind a share link can carry
const TEXTS = ['Nuts', '  Nuts  ', '', '   ', 'x'.repeat(60), '  ' + 'y'.repeat(45), 'M5 × 20', 'tab\tinside', '\n lead', 42, null, undefined, ['a'], { t: 'a' }, true];
const BADGES = [undefined, null, 'icon', 42, [], {}, { type: 'none' }, { type: 'none', value: 'x' }, { type: 'icon', value: 'nut' },
  { type: 'icon', value: 'Nut' }, { type: 'icon', value: 'nut-' }, { type: 'icon', value: 'a'.repeat(41) }, { type: 'icon', value: 'a'.repeat(40) },
  { type: 'icon', value: 7 }, { type: 'icon', svg: '<svg/>' }, { type: 'char', value: 'A' }, { type: 'char', value: ' M3 ' }, { type: 'char', value: 'ABCDE' },
  { type: 'char', value: '   ' }, { type: 'char', value: 5 }, { type: 'emoji', value: ':)' }, [{ type: 'none' }]];
const STYLES = [null, undefined, {}, [], 'x', { capMm: 5 }, { capMm: 9 }, { capMm: '5' }, { depth: 0.2, badgeSize: 22, bold: true, allCaps: 'no' },
  { capMm: NaN }, { capMm: Infinity }, { predictIcons: false, extra: 1 }];

test('LC-1: the module\'s cleaners ARE the planner\'s - every hostile input gives the same answer', () => {
  for (const v of TEXTS) assert.equal(L.cleanText(v), C.cleanText(v), `text ${JSON.stringify(v)}`);
  for (const b of BADGES) assert.deepEqual(plain(L.cleanBadge(b)), plain(C.cleanBadge(b)), `badge ${JSON.stringify(b)}`);
  for (const s of STYLES) assert.deepEqual(plain(L.cleanStyle(s)), plain(C.cleanStyle(s)), `style ${JSON.stringify(s)}`);
});

test('LC-2: the module\'s bounds are the planner\'s (LABEL_MAX 40, GEN2.labelSpec)', () => {
  assert.equal(L.MIRROR_MAX, C.textMax);
  assert.equal(L.CHAR_MAX, C.GEN2.labelSpec.charMax);
  assert.deepEqual(plain(L.STYLE_LIMITS), plain(C.GEN2.labelSpec.limits));
  assert.deepEqual(plain(L.STYLE_FLAGS), plain(C.GEN2.labelSpec.flags));
});

// a seeded PRNG so the sweep is the same every run
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('LC-3: THE APPEARANCE RULE through the planner\'s real sanitizer - 120 random hostile builds convert with every drawer unchanged', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  const r = rng(61006);
  const pick = (a) => a[Math.floor(r() * a.length)];
  for (let k = 0; k < 120; k++) {
    const units = [];
    for (let y = 0; y < 4; y += 2) for (let x = 0; x < 3; x++) {
      const o = {};
      if (r() < 0.8) o.label = pick(TEXTS);
      if (r() < 0.7) o.labelBadge = pick(BADGES);
      units.push(unit(units.length + 1, x, y, o));
    }
    assert.ok(app.applyBuild(plain(labelBuild({}, units.sort(() => r() - 0.5)))), `build ${k} loads`);
    const placed = plain(app.state.placed);
    const want = {};
    for (const u of placed) if (u.label) want[String(u.id)] = u.labelBadge ? { label: u.label, labelBadge: u.labelBadge } : { label: u.label };
    const c = L.fromLegacyUnits(placed);
    assert.deepEqual(plain(L.mirrorOf(c.list, c.assignments)), want, `build ${k}: a drawer's label changed on conversion`);
    assert.equal(c.list.labels.length, Object.keys(want).length, `build ${k}: one label per labelled drawer, no deduplication`);
    assert.deepEqual(L.reconcile(placed, c.list, c.assignments).changes, [], `build ${k}: a second load changed something`);
  }
  window.close();
});

test('LC-4: a carried list reconciles to no changes, and an edit made here is ALREADY in the list (step 3: this planner syncs itself)', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  const first = labelBuild({ gridH: 1 }, [unit(1, 0, 0, { label: 'Nuts' }), unit(2, 1, 0, { label: 'Nuts', labelBadge: { type: 'none' } }), unit(3, 2, 0)]);
  assert.ok(app.applyBuild(plain(first)));
  const c = L.fromLegacyUnits(plain(app.state.placed));
  assert.ok(app.applyBuild(plain({ ...first, labelList: c.list, labelAssign: c.assignments })));
  const out = plain(app.serializeBuild());
  assert.deepEqual(L.reconcile(out.placed, out.labelList, out.labelAssign).changes, []);
  app.state.placed[0].label = 'Washers'; app.refresh();            // the drawer's field: a sole plain label, edited in place
  const after = plain(app.serializeBuild());
  assert.equal(after.labelList.labels.find((l) => l.id === after.labelAssign['1']).text, 'Washers');
  assert.equal(after.labelAssign['1'], out.labelAssign['1'], 'the same label, edited - not a new one');
  assert.equal(after.labelList.labels.length, out.labelList.labels.length, 'no stray label left behind');
  assert.deepEqual(L.reconcile(after.placed, after.labelList, after.labelAssign).changes, [], 'a later load finds nothing to reconcile');
  window.close();
});

/* ICON-ONLY LABELS (Astra 2026-10-06): text only, icon only, and text with an icon are all labels. */
test('LC-5: today\'s planner never holds an icon-only drawer - a badge without words is dropped on load, exactly as before, and converts to no label', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  const b = labelBuild({ gridH: 1 }, [unit(1, 0, 0, { labelBadge: { type: 'icon', value: 'nut' } }), unit(2, 1, 0, { label: '  ', labelBadge: { type: 'char', value: 'A' } }), unit(3, 2, 0, { label: 'Bolts' })]);
  assert.ok(app.applyBuild(plain(b)));
  const placed = plain(app.state.placed);
  assert.equal(placed[0].labelBadge, undefined, 'the badge without words is dropped (cleanLabelBadge lives and dies with the words)');
  assert.equal(placed[1].labelBadge, undefined);
  const c = L.fromLegacyUnits(placed);
  assert.deepEqual(c.list.labels.map((l) => l.text), ['Bolts']);
  window.close();
});

test('LC-6: an icon-only label written by a newer planner survives THIS planner (carried) and keeps its drawer when reconciled', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  const list = { format: 'modulith-labels', version: 1, labels: [{ id: 'qqqqqqqqqqqq', text: '', badge: { type: 'icon', value: 'washer' } }, { id: 'rrrrrrrrrrrr', text: 'Nuts' }] };
  const b = labelBuild({ gridH: 1, labelList: list, labelAssign: { 1: 'qqqqqqqqqqqq', 2: 'rrrrrrrrrrrr' } }, [unit(1, 0, 0), unit(2, 1, 0, { label: 'Nuts' })]);
  assert.ok(app.applyBuild(plain(b)));
  const out = plain(app.serializeBuild());
  assert.deepEqual(out.labelList, list, 'carried verbatim');
  const r = L.reconcile(out.placed, out.labelList, out.labelAssign);
  assert.deepEqual(r.changes, []);
  assert.equal(r.assignments['1'], 'qqqqqqqqqqqq', 'the icon-only drawer keeps its label');
  window.close();
});
