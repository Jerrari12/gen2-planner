/* THE REQUIREMENT-SCOPE SLICE — one fixture, three closure states.
 *
 * The contract's first vertical: a two-drawer tabletop build run through
 * neither / one / both drawers magnetic, asserting what MOVES and, more
 * importantly, what MUST NOT. A parameterised sweep proves more here than
 * disconnected snapshots would, because every demanded outcome is a statement
 * about change.
 *
 * Why it exists: a single `optional` boolean could not tell "you cannot build
 * this" from "you cannot build it THIS WAY". The homepage shipped "8 bought
 * items" when the true requirement was 4, and prose was the only place the
 * distinction could live.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function boot(mount = 'tabletop') {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only' });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  /* ⚠ GEN2 comes back as the COMPLETION VALUE of the same eval. `const GEN2`
     is a global LEXICAL binding, so it is neither a window property nor
     visible to a second, separate window.eval() call - both tried first, both
     gave "GEN2 is not defined". */
  const GEN2 = window.eval(
    read('js/requirement-scope.js') + '\n' + read('js/tabletop-completion.js') + '\n' + read('js/data.js') + '\n' + read('js/app.js') + '\n;GEN2');
  const app = window.__GEN2_PLANNER_TEST__;
  app.state.mount = mount;
  app.state.length = 185;
  app.state.gridW = 6;
  app.state.gridH = 4;
  app.refresh();
  return { app, GEN2 };
}

// Array.from re-homes jsdom arrays into this realm; without it strict
// deepEqual reports "same structure but not reference-equal" on []. 
const rows = (app) => Array.from(app.computeBom() || []).flatMap((s) => Array.from(s.items));
const find = (app, sub) => rows(app).filter((r) => r.name.includes(sub));
const names = (list) => Array.from(list).map((r) => r.name);
const scopeOf = (r) => (r.requirement ? r.requirement.scope : null);

/** The two-drawer fixture, with `magnetic` of them opting into magnets. */
function fixture(magnetic) {
  const { app, GEN2 } = boot('tabletop');
  for (const id of [1, 2]) {
    app.state.placed.push({
      id, x: id - 1, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0,
      closure: id <= magnetic ? 'magnet' : 'none',
    });
  }
  app.refresh();
  return { app, GEN2 };
}

/* ---------- the contract itself ---------- */

test('the scope vocabulary and its constructors are well-formed', () => {
  const { GEN2 } = boot();
  assert.deepEqual(Array.from(GEN2.req.SCOPES), ['core', 'option', 'enhancement']);
  assert.equal(GEN2.bomSchemaVersion, 2);
  assert.deepEqual({ ...GEN2.req.core('x') }, { scope: 'core', obligationId: 'x' });
  assert.deepEqual({ ...GEN2.req.option('x', 'x.y') }, { scope: 'option', obligationId: 'x', optionId: 'x.y' });
  assert.deepEqual({ ...GEN2.req.enhancement('x') }, { scope: 'enhancement', obligationId: 'x' });
  // basis is orthogonal - it carries no scope and never implies one
  assert.deepEqual({ ...GEN2.req.basis('mount', 'wall', 'build') }, { axis: 'mount', choice: 'wall', subjectType: 'build' });
  assert.equal(GEN2.req.basis('a', 'b', 'unit', 3).selectedCount, 3);
});

test('validation FAILS CLOSED on a contradiction', () => {
  const { GEN2 } = boot();
  const bad = (row) => Array.from(GEN2.req.validate(Object.assign({ name: 'row' }, row)));
  assert.deepEqual(bad({ requirement: GEN2.req.core('o') }), [], 'sanity: a good row is silent');
  // the exact shape of the shipped defect: a scope nothing can route
  assert.ok(bad({ requirement: { scope: 'option', obligationId: 'o' } }).length, 'option without optionId');
  assert.ok(bad({ requirement: { scope: 'nonsense', obligationId: 'o' } }).length, 'unknown scope');
  assert.ok(bad({ requirement: { scope: 'core' } }).length, 'no obligationId');
  assert.ok(bad({ requirement: { scope: 'core', obligationId: 'o', optionId: 'x' } }).length,
    'a core row must not claim an optionId');
  assert.ok(bad({ requirement: GEN2.req.core('o'), basis: { axis: 'a', choice: 'b', subjectType: 'planet' } }).length,
    'basis.subjectType is build|unit');
  assert.ok(bad({ requirement: GEN2.req.core('o'), basis: GEN2.req.basis('a', 'b', 'unit', 0) }).length,
    'a selectedCount of 0 means the row should not exist');
});

test('every emitted row that carries a requirement is well-formed', () => {
  for (const magnetic of [0, 1, 2]) {
    const { app, GEN2 } = fixture(magnetic);
    const problems = rows(app).flatMap((r) => Array.from(GEN2.req.validate(r)));
    assert.deepEqual(problems, [], `closure state ${magnetic}`);
  }
});

/* ---------- the three closure states ---------- */

test('magnets appear ONLY with magnetic closure, and scale with the count', () => {
  const seen = [];
  for (const magnetic of [0, 1, 2]) {
    const { app } = fixture(magnetic);
    const clips = find(app, 'Magnet Clip');
    const magnets = find(app, 'Magnets 10');
    seen.push({
      magnetic,
      clipQty: clips.reduce((n, r) => n + r.qty, 0),
      magnetQty: magnets.reduce((n, r) => n + r.qty, 0),
      selectedCount: magnets[0] ? magnets[0].basis.selectedCount : 0,
      scope: magnets[0] ? scopeOf(magnets[0]) : null,
    });
  }
  // 0 drawers -> the rows do not exist at all
  assert.deepEqual(seen[0], { magnetic: 0, clipQty: 0, magnetQty: 0, selectedCount: 0, scope: null });
  // then 2 per drawer, and selectedCount walks with the drawers that chose it
  assert.deepEqual(seen[1], { magnetic: 1, clipQty: 2, magnetQty: 2, selectedCount: 1, scope: 'option' });
  assert.deepEqual(seen[2], { magnetic: 2, clipQty: 4, magnetQty: 4, selectedCount: 2, scope: 'option' });
});

test('the magnet rows name the option that caused them', () => {
  const { app } = fixture(2);
  for (const r of find(app, 'Magnet Clip').concat(find(app, 'Magnets 10'))) {
    assert.equal(r.requirement.scope, 'option');
    assert.equal(r.requirement.obligationId, 'drawer.closure');
    assert.equal(r.requirement.optionId, 'drawer.closure.magnet');
    // ⚠ per-DRAWER, so one aggregated row can be caused by a subset of the build
    assert.equal(r.basis.axis, 'drawer.closure');
    assert.equal(r.basis.choice, 'magnet');
    assert.equal(r.basis.subjectType, 'unit');
  }
});

test('⚠ THE MINIMUM BUILD NEVER MOVES when closure changes', () => {
  /* The point of the whole contract. Choosing magnets adds to the selected
     plan; it must not change what the build minimally requires. */
  const mins = [0, 1, 2].map((m) => {
    const { app } = fixture(m);
    const core = rows(app).filter((r) => scopeOf(r) === 'core');
    return core.reduce((n, r) => n + r.qty, 0);
  });
  assert.equal(mins[0], mins[1], 'one magnetic drawer must not change the minimum');
  assert.equal(mins[1], mins[2], 'nor two');
});

test('no row is BOTH core and caused by the closure choice', () => {
  const { app } = fixture(2);
  const contradictions = rows(app).filter(
    (r) => scopeOf(r) === 'core' && r.basis && r.basis.axis === 'drawer.closure');
  assert.deepEqual(names(contradictions), []);
});

/* ---------- mounting as an authoritative basis ---------- */

test('mount parts are CORE for the resolved build, and say which mount', () => {
  /* Not `option`: an under-table build cannot hang without its rails, so
     typing them optional would make the minimum build claim otherwise. */
  const { app } = boot('under-table');
  app.state.placed.push({ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'none' });
  app.refresh();
  const rails = find(app, 'Under Table Rails');
  assert.ok(rails.length, 'an under-table build bills rails');
  for (const r of rails) {
    assert.equal(r.requirement.scope, 'core');
    assert.equal(r.requirement.obligationId, 'mount.install');
    assert.equal(r.basis.axis, 'mount');
    assert.equal(r.basis.choice, 'under-table');
    assert.equal(r.basis.subjectType, 'build');
  }
  const screws = find(app, 'Countersunk wood screws');
  assert.ok(screws.length, 'and the screws that fix them');
  assert.equal(screws[0].requirement.scope, 'core', 'the rail does not mount without them');
  assert.equal(screws[0].basis.choice, 'under-table');
});

test('a tabletop build bills no under-table mount parts', () => {
  const { app } = fixture(0);
  assert.deepEqual(names(find(app, 'Under Table Rails')), []);
  const wrongBasis = rows(app).filter(
    (r) => r.basis && r.basis.axis === 'mount' && r.basis.choice !== 'tabletop');
  assert.deepEqual(names(wrongBasis), [], 'no row may claim another mount');
});

/* ---------- the migration ratchet ---------- */

test('⚠ RATCHET: unmigrated rows may only ever DECREASE', () => {
  /* Bulk migration comes after this slice, so rows without a requirement are
     tolerated - but the count is pinned so the number cannot grow while the
     migration is half-done. Lower it as rows are stamped; never raise it. */
  /* MEASURED 2026-08-22, at the end of the closure + mount slice. The rows
     still unstamped are structural and enhancement ones - case, drawer,
     faceplate, handles, QuickLock, covers, foot rails, feet, stoppers, M3.
     ⚠ Every `option`-scoped row is already migrated, which is the class that
     actually caused the shipped defect; what remains is the mechanical part. */
  const BASELINE = { tabletop: 13, 'under-table': 8 };
  for (const mount of Object.keys(BASELINE)) {
    const { app } = boot(mount);
    app.state.placed.push({ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: 'decor', shelves: 0, closure: 'magnet' });
    app.refresh();
    const un = rows(app).filter((r) => !r.requirement);
    assert.ok(un.length <= BASELINE[mount],
      `${mount}: ${un.length} unmigrated rows, baseline ${BASELINE[mount]} - lower the baseline, never raise it:\n  `
      + un.map((r) => r.name).join('\n  '));
  }
});

/* ---------- the Cover Lower: one row, several causes ---------- */

/** A tabletop build of `width` 1W columns, with stoppers kept or all removed. */
function coverFixture(width, { stoppers }) {
  const { app, GEN2 } = boot('tabletop');
  app.state.placed.push({ id: 1, x: 0, y: 0, w: width, hh: 2, fill: 'decor', shelves: 0, closure: 'none' });
  // stoppers are per-1W and removable; clearing every key is how a build has none
  app.state.removedStoppers = stoppers ? [] : Array.from({ length: width }, (_, k) => `1:${k}`);
  app.refresh();
  return { app, GEN2 };
}
const lowerRow = (app) => find(app, 'Cover Lower')[0];
const reasonScopes = (row) => (row.reasons ? Array.from(row.reasons).map((r) => r.scope).sort() : null);

test('COVER LOWER a: simple layout, no stoppers -> enhancement', () => {
  /* 2W is a single-piece cover run, so the stagger does not need the lower
     layer; with no stoppers to seat, it is there for rigidity alone. */
  const { app } = coverFixture(2, { stoppers: false });
  const row = lowerRow(app);
  assert.ok(row, 'a covered build still bills a Cover Lower');
  assert.equal(row.requirement.scope, 'enhancement');
  assert.equal(row.requirement.obligationId, 'top.rigidity');
  assert.equal(row.reasons, undefined, 'one cause needs no reasons array');
});

test('COVER LOWER b: stoppers on an otherwise-unnecessary layer -> option', () => {
  const { app } = coverFixture(2, { stoppers: true });
  const row = lowerRow(app);
  assert.equal(row.requirement.scope, 'option');
  assert.equal(row.requirement.optionId, 'drawer.stoppers',
    'it must name the feature that made it required');
  assert.equal(row.requirement.obligationId, 'drawer.stopper.seat');
});

test('COVER LOWER c: staggered multi-piece layout -> core, with a layout basis', () => {
  /* 3W tiles as 1W+2W across both layers with offset seams, and brickTiling
     marks lowerOptional false: the layers tie the sections together. */
  const { app } = coverFixture(3, { stoppers: false });
  const row = lowerRow(app);
  assert.equal(row.requirement.scope, 'core');
  assert.equal(row.requirement.obligationId, 'top.enclosure');
  assert.equal(row.basis, undefined, 'a single reason carries its basis on the reason, not the row');
});

test('COVER LOWER d: staggered AND stoppers -> core, BOTH reasons preserved', () => {
  const { app } = coverFixture(3, { stoppers: true });
  const row = lowerRow(app);
  assert.equal(row.requirement.scope, 'core', 'the strongest reason wins the row');
  assert.deepEqual(reasonScopes(row), ['core', 'option'], 'and neither explanation is lost');
  const opt = Array.from(row.reasons).find((r) => r.scope === 'option');
  assert.equal(opt.optionId, 'drawer.stoppers');
  const cor = Array.from(row.reasons).find((r) => r.scope === 'core');
  assert.equal(cor.basis.axis, 'cover.layout');
  assert.equal(cor.basis.choice, 'staggered');
  // ⚠ the row-level requirement must NOT claim the option's id - it is core
  assert.equal(row.requirement.optionId, undefined);
});

test('⚠ the Cover Lower stays ONE row however many causes it has', () => {
  /* Splitting by cause would collide with the build tracker, whose key is
     name + variant: two rows for one part share a checkbox and mark each
     other done. */
  for (const [w, st] of [[2, false], [2, true], [3, false], [3, true]]) {
    const { app } = coverFixture(w, { stoppers: st });
    const byName = {};
    for (const r of find(app, 'Cover Lower')) {
      const key = r.name + (r.variant ? ' · ' + r.variant : '');
      byName[key] = (byName[key] || 0) + 1;
    }
    for (const [key, n] of Object.entries(byName)) {
      assert.equal(n, 1, `${w}W stoppers=${st}: "${key}" appeared ${n} times`);
    }
  }
});

test('a resolved row always validates, whatever its reasons', () => {
  for (const [w, st] of [[2, false], [2, true], [3, false], [3, true]]) {
    const { app, GEN2 } = coverFixture(w, { stoppers: st });
    const problems = rows(app).flatMap((r) => Array.from(GEN2.req.validate(r)));
    assert.deepEqual(problems, [], `${w}W stoppers=${st}`);
  }
});
