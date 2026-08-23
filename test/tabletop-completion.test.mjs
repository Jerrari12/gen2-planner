/* THE TABLETOP-COMPLETION CONTRACT - the planner's half of its pin chain,
 * plus the behaviour both tools depend on.
 *
 * js/tabletop-completion.js is vendored BYTE-FOR-BYTE into the viewer
 * (viewer/js/vendor/tabletop-completion.js). There is no sync tool or receipt
 * for it (a lighter chain than requirement-scope's, on purpose: two consumers,
 * one pure function): both repos pin the file's sha256 in a test, so an edit
 * here fails THIS suite until the pin moves, and the viewer's own test fails
 * until its copy and pin move too. The viewer additionally asserts byte
 * equality against this file whenever the planner checkout is present.
 *
 * ⚠ Bump the pin ONLY after editing the source on purpose, then copy the file
 * to the viewer and bump its pin (test/tabletop-completion-vendor.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'js', 'tabletop-completion.js');
const PINNED_SHA256 = 'b65de204cd8c900bd2f2247508eda2eb68395bf9eff002db5779a433d456a65d';
const require = createRequire(import.meta.url);
const { completion, CONTRACT_VERSION } = require(SOURCE);

test('the source matches its pin (an edit must move the pin here AND the viewer copy + pin)', () => {
  const actual = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
  assert.equal(actual, PINNED_SHA256,
    `js/tabletop-completion.js changed (sha256 ${actual.slice(0, 16)}…).\n` +
    '  If that was intended: update PINNED_SHA256 here, copy the file to the viewer\n' +
    '  (viewer/js/vendor/tabletop-completion.js) and update its pin as well.');
  assert.equal(CONTRACT_VERSION, 1);
});

const u = (x, y, w, hh) => ({ x, y, w, hh });

test('a level run is complete; empty input is complete', () => {
  assert.equal(completion([]).complete, true);
  const r = completion([u(0, 4, 2, 2), u(0, 6, 1, 2), u(1, 6, 1, 2)]);   // the starter: a 2W over two 1W
  assert.equal(r.complete, true);
  assert.deepEqual(r.runs, [{ c0: 0, c1: 1, top: 4 }]);
  assert.deepEqual(r.cells, []);
  assert.deepEqual(r.areas, []);
});

test('one short column: the deficit spans from the run target down to that column\'s top', () => {
  const r = completion([u(0, 4, 1, 2), u(0, 6, 1, 2), u(1, 6, 1, 2)]);
  assert.equal(r.complete, false);
  assert.deepEqual(r.columns, [{ x: 1, y0: 4, y1: 6 }]);
  assert.deepEqual(r.cells, [{ x: 1, y: 4 }, { x: 1, y: 5 }]);
  assert.equal(r.areas.length, 1);
  assert.deepEqual([r.areas[0].x0, r.areas[0].x1, r.areas[0].y0, r.areas[0].y1], [1, 1, 4, 5]);
});

test('a 2W unit counts for both of its columns', () => {
  const r = completion([u(0, 4, 2, 2), u(0, 6, 1, 2), u(1, 6, 1, 2), u(2, 6, 1, 2)]);   // col 2 is short under a run of three
  assert.deepEqual(r.runs, [{ c0: 0, c1: 2, top: 4 }]);
  assert.deepEqual(r.columns, [{ x: 2, y0: 4, y1: 6 }]);
});

test('areas are 4-connected components, never the number of boxes it takes to draw them', () => {
  // staircase: tops at y=2, 4, 6 across three columns -> 2 + 4 = 6 cells, ONE area
  const stair = completion([u(0, 2, 1, 2), u(0, 4, 1, 2), u(0, 6, 1, 2), u(1, 4, 1, 2), u(1, 6, 1, 2), u(2, 6, 1, 2)]);
  assert.equal(stair.cells.length, 6);
  assert.equal(stair.areas.length, 1, 'a staircase is one connected area');
  assert.equal(stair.columns.length, 2, '…drawn as two column boxes');
  // two deficits separated by a level column -> two areas
  const two = completion([u(0, 6, 1, 2), u(1, 4, 1, 2), u(1, 6, 1, 2), u(2, 6, 1, 2)]);
  assert.equal(two.areas.length, 2);
  // adjacent columns with different gaps (1H and 2H) -> one area, two column boxes
  const mixed = completion([u(0, 2, 1, 2), u(0, 4, 1, 2), u(0, 6, 1, 2), u(1, 6, 1, 2), u(2, 4, 1, 2), u(2, 6, 1, 2)]);
  assert.equal(mixed.areas.length, 1);
  assert.deepEqual(mixed.columns, [{ x: 1, y0: 2, y1: 6 }, { x: 2, y0: 2, y1: 4 }]);
});

test('the rule is PER contiguous run: separate stacks of different heights are each complete', () => {
  const r = completion([u(0, 4, 1, 2), u(0, 6, 1, 2), u(3, 6, 1, 2)]);
  assert.equal(r.complete, true);
  assert.deepEqual(r.runs, [{ c0: 0, c1: 0, top: 4 }, { c0: 3, c1: 3, top: 6 }]);
  // …and one incomplete run beside a complete one reports only its own deficit
  const r2 = completion([u(0, 4, 1, 2), u(0, 6, 1, 2), u(1, 6, 1, 2), u(3, 6, 1, 2)]);
  assert.equal(r2.complete, false);
  assert.deepEqual(r2.columns, [{ x: 1, y0: 4, y1: 6 }]);
  assert.equal(r2.areas.length, 1);
});

test('0.5H units: the deficit is measured in half-rows, exactly', () => {
  const r = completion([u(0, 3, 1, 1), u(0, 4, 1, 2), u(1, 4, 1, 2)]);   // col 0 has a 0.5H on top
  assert.deepEqual(r.columns, [{ x: 1, y0: 3, y1: 4 }]);
  assert.deepEqual(r.cells, [{ x: 1, y: 3 }]);
});
