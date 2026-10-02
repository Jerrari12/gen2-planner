/* DRAWER LABELS - the foundation the label tools build on (2026-10-02, Joey: "start on step 1").
 *
 * What a drawer's label needs to be the same label in the planner, the 3D Build Studio and the label generator:
 *   - the words, stored AS TYPED (they used to be uppercased on entry, which made an "All caps off" style impossible)
 *     and shown in the build's label style - ALL CAPS unless that is turned off;
 *   - `labelBadge`, the left icon or letter, whose ABSENCE means "let the generator predict one";
 *   - `labelStyle`, the generator's set-wide settings, null for its defaults;
 *   - `buildId`, the build's own identity: unit ids restart at 1 ("Surprise me", every fresh session), so a label job
 *     from outside the planner has to name the build as well as the drawer (Sol 01a0fd07);
 *   - ONE drawer order for every list of labels, top row first, left to right.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function boot() {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only' });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  window.eval(read('js/requirement-scope.js') + '\n' + read('js/tabletop-completion.js') + '\n'
    + read('js/data.js') + '\n' + read('js/app.js'));
  const app = window.__GEN2_PLANNER_TEST__;
  app.state.mount = 'tabletop';
  app.state.length = 185;
  app.state.gridW = 6;
  app.state.gridH = 4;
  app.state.faceStyle = 'edgelabel';
  app.refresh();
  return { app, window };
}

// three decor drawers PLACED bottom-right, bottom-left, top-left: the drawer order is top-left, bottom-left, bottom-right
const UNITS = [
  { id: 1, x: 1, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, label: 'Zip Ties & Clips' },
  { id: 2, x: 0, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, label: 'M3 Screws' },
  { id: 3, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0, label: 'Torx Bits' },
];
const withUnits = (app, units = UNITS, extra = {}) => {
  const b = app.serializeBuild();
  b.placed = JSON.parse(JSON.stringify(units));
  b.nextId = 4;
  // ⚠ an EMPTY board serializes gridH 1 (refresh shrinks the grid to its content), and sanitize rightly drops a unit
  // below the grid - two 1H rows need gridH 2
  b.gridH = 2;
  Object.assign(b, extra);
  assert.ok(app.applyBuild(b), 'applyBuild refused the fixture');
  return app.state;
};
const unit = (app, id) => app.state.placed.find((u) => u.id === id);
// values made inside the jsdom window carry ITS Object prototype, which strict deepEqual counts as a difference
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

test('a label badge survives a round trip only in a shape the generator can print', () => {
  const { app } = boot();
  const badges = [
    [{ type: 'icon', value: 'screw-torx-head' }, { type: 'icon', value: 'screw-torx-head' }],
    [{ type: 'none' }, { type: 'none' }],
    [{ type: 'char', value: ' m3 ' }, { type: 'char', value: 'm3' }],      // trimmed, case kept (the style decides caps)
    [{ type: 'char', value: 'ABCDE' }, undefined],                          // the generator's letter field takes 4
    [{ type: 'char', value: '   ' }, undefined],
    [{ type: 'icon', value: 'Torx Head!' }, undefined],                     // not an icon id's shape
    [{ type: 'icon', value: 'a-'.repeat(30) + 'b' }, undefined],            // longer than any id
    [{ type: 'icon', value: 'a-brand-new-icon' }, { type: 'icon', value: 'a-brand-new-icon' }],  // shape only, not a list
    [{ type: 'svg', value: '<svg/>' }, undefined],                          // custom SVGs are not build state
    ['screw-torx-head', undefined],
    [null, undefined],
  ];
  for (const [input, want] of badges) {
    withUnits(app, [{ ...UNITS[2], labelBadge: input }]);
    assert.deepEqual(plain(unit(app, 3).labelBadge), want, `labelBadge ${JSON.stringify(input)}`);
  }
});

test('a badge is only kept on a drawer that has words', () => {
  const { app } = boot();
  withUnits(app, [{ id: 3, x: 0, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0, labelBadge: { type: 'icon', value: 'nut' } }]);
  assert.equal(unit(app, 3).labelBadge, undefined, 'a badge with no label would reappear on the next name typed (Sol 01a0fd07)');
});

test('the label style keeps only values the generator would accept, and never clamps', () => {
  const { app } = boot();
  const cases = [
    [{ capMm: 6, depth: 0.8, badgeSize: 10, bold: true, allCaps: false, predictIcons: false },
      { capMm: 6, depth: 0.8, badgeSize: 10, bold: true, allCaps: false, predictIcons: false }],
    [{ capMm: 7 }, null],                      // above the generator's 6.5 - dropped, not clamped to 6.5
    [{ capMm: 2, depth: 0.1 }, { capMm: 2 }],  // the lower bound is valid; 0.1 is below 0.2
    [{ capMm: '5', bold: 'yes', allCaps: 0 }, null],
    [{ capMm: NaN, badgeSize: Infinity }, null],
    [{ colorText: '#ff0000', affix: 'x' }, null],   // colours are the viewer's filament picks, not label style
    [[], null], ['big', null], [null, null], [undefined, null],
  ];
  for (const [input, want] of cases) {
    withUnits(app, UNITS, { labelStyle: input });
    assert.deepEqual(plain(app.state.labelStyle), want, `labelStyle ${JSON.stringify(input)}`);
  }
});

test('a build keeps its identity through a share link, and gets one when it has none', () => {
  const { app } = boot();
  withUnits(app, UNITS, { buildId: 'k3x9q2m7z1p0' });
  assert.equal(app.state.buildId, 'k3x9q2m7z1p0', 'a valid build id must be kept');
  const hash = app.encodeBuildHash();
  const other = boot().app;
  other.applyBuildHash(hash);
  assert.equal(other.state.buildId, 'k3x9q2m7z1p0', 'the share link must carry the build id');
  assert.equal(unit(other, 3).label, 'Torx Bits', 'the share link must carry the typed case');

  for (const bad of [undefined, null, '', 'ABCDEFGHIJ', 'short', 'a'.repeat(33), 'k3x9-q2m7z1', 12345678]) {
    withUnits(app, UNITS, { buildId: bad });
    assert.match(app.state.buildId, /^[a-z0-9]{8,32}$/, `${JSON.stringify(bad)} must be replaced by a minted id`);
    assert.notEqual(app.state.buildId, bad);
  }
  assert.notEqual(app.newBuildId(), app.newBuildId(), 'two minted ids collided');
});

test('"Surprise me" restarts the unit ids, so it starts a NEW build', () => {
  const { app } = boot();
  withUnits(app, UNITS, { buildId: 'k3x9q2m7z1p0' });
  app.surpriseMe();
  assert.ok(app.state.placed.some((u) => u.id === 1), 'surpriseMe is expected to restart ids at 1 - the reason for this rule');
  assert.notEqual(app.state.buildId, 'k3x9q2m7z1p0', 'a job for the old build could otherwise write into the new drawer 1');
  assert.match(app.state.buildId, /^[a-z0-9]{8,32}$/);
});

test('a label is stored as typed, and clearing it clears its badge', () => {
  const { app, window } = boot();
  withUnits(app, [{ ...UNITS[2], label: 'OLD', labelBadge: { type: 'icon', value: 'nut' } }]);
  app.state.selectedUnit = 3;
  app.refresh();
  const input = window.document.getElementById('ut-label');
  input.value = 'Torx Bits';
  input.dispatchEvent(new window.Event('input'));
  assert.equal(unit(app, 3).label, 'Torx Bits', 'the typed case must be kept (it was uppercased on entry)');
  assert.deepEqual(plain(unit(app, 3).labelBadge), { type: 'icon', value: 'nut' }, 'editing the words keeps the icon');
  assert.ok(input.classList.contains('caps'), 'the field must show the label as it will print');
  input.value = '   ';
  input.dispatchEvent(new window.Event('input'));
  assert.equal(unit(app, 3).label, undefined);
  assert.equal(unit(app, 3).labelBadge, undefined, 'the icon must go with the words');
});

test('the board shows labels in the build\'s style - ALL CAPS unless it is turned off', () => {
  const { app, window } = boot();
  const shown = () => [...window.document.querySelectorAll('.d-userlabel')].map((t) => t.textContent).join(' ');
  withUnits(app, UNITS);
  assert.match(shown(), /TORX BITS/, 'the default is the generator\'s ALL CAPS');
  assert.doesNotMatch(shown(), /Torx/);
  withUnits(app, UNITS, { labelStyle: { allCaps: false } });
  assert.match(shown(), /Torx Bits/, 'with ALL CAPS off the board shows the typed case');
  assert.equal(app.shownLabel('Zip Ties'), 'Zip Ties');
});

test('the generator handoff lists labels in the ONE drawer order, as typed', () => {
  const { app, window } = boot();
  withUnits(app, UNITS);
  const href = window.document.getElementById('label-gen-link').getAttribute('href') || '';
  const m = href.match(/#labels=(.+)$/);
  assert.ok(m, `no #labels= on the generator link: ${href}`);
  const labels = JSON.parse(decodeURIComponent(escape(window.atob(m[1]))));
  assert.deepEqual(labels, ['Torx Bits', 'M3 Screws', 'Zip Ties & Clips'],
    'top row first, left to right - not the order the drawers were placed');
  assert.deepEqual(plain(app.labelOrder(app.state.placed).map((u) => u.id)), [3, 2, 1]);
  assert.deepEqual(plain(app.state.placed.map((u) => u.id)), [1, 2, 3], 'the fixture must still be in PLACEMENT order, or this proves nothing');
});

test('the layout signature moves when only a badge or the label style changes', () => {
  const { app } = boot();
  withUnits(app, UNITS);
  const base = app.layoutSig();
  assert.equal(app.layoutSig(), base, 'layoutSig is not deterministic');
  unit(app, 3).labelBadge = { type: 'icon', value: 'screw-torx-head' };
  const withBadge = app.layoutSig();
  assert.notEqual(withBadge, base, 'a badge-only change would never be posted to the 3D viewer');
  app.state.labelStyle = { capMm: 6 };
  assert.notEqual(app.layoutSig(), withBadge, 'a style-only change would never be posted to the 3D viewer');
});
