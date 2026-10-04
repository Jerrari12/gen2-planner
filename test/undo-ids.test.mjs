/* IDENTITY ACROSS UNDO AND LOADS (STEP3-SPEC.md section 6.6, tests P-id-1..5), on the real app.js in jsdom.

   A label job names a drawer by (build id, unit id). Two holes let a stale job land on the wrong drawer:
   - Undo restored the snapshot's smaller `nextId`, so "place, undo, place" handed the SAME id out twice inside one build;
   - one build can come back in an older form (a share link, a saved file, Undo through a load) with the same ids and
     geometry. A `loadId` (a build-loading session) says which; a return from another session is reviewed line by line. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

const U = (id, x, y, o = {}) => unit(id, x, y, o);
const baseBuild = (over) => labelBuild({ gridH: 1, ...over }, [U(1, 0, 0, { label: 'One' }), U(2, 1, 0)]);
function boot(opts = {}) {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/', ...opts });
  assert.ok(app.applyBuild(plain(baseBuild())));
  app.refresh();
  app.pushHistoryNow();
  return { app, window };
}
// place a 1W-1H decor drawer the way a click does (the next id), then let the history snapshot it
const place = (app, x) => {
  const id = app.state.nextId++;
  app.state.placed.push({ id, x, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0 });
  app.refresh();
  app.pushHistoryNow();
  return id;
};

test('P-id-1: place -> undo -> place gives a FRESH id inside one build (the id is never handed out twice)', () => {
  const { app, window } = boot();
  const first = place(app, 2);
  app.undoRedo(-1);
  assert.ok(!app.state.placed.some((u) => u.id === first), 'the undo removed the drawer');
  assert.ok(app.state.nextId > first, `nextId went DOWN to ${app.state.nextId}: the freed id ${first} would be handed out again`);
  const second = place(app, 2);
  assert.notEqual(second, first, 'the freed id was reused');
  window.close();
});

test('P-id-2: redo keeps the maximum; going back and forth never lowers nextId', () => {
  const { app, window } = boot();
  const a = place(app, 2);
  const high = app.state.nextId;
  app.undoRedo(-1);
  app.undoRedo(+1);
  assert.equal(app.state.nextId >= high, true);
  app.undoRedo(-1); app.undoRedo(+1); app.undoRedo(-1);
  assert.ok(app.state.nextId >= high, 'back and forth within the build keeps the watermark');
  assert.equal(app.state.placed.length, 2);
  void a;
  window.close();
});

test('P-id-2b: a DIFFERENT build restored by undo does not inherit the old watermark', () => {
  const { app, window } = boot();
  const old = app.serializeBuild();
  place(app, 2); place(app, 0 + 3);
  const hi = app.state.nextId;
  // a different build (new buildId) arrives, then undo lands back on the first build's entries
  const other = plain(baseBuild({ buildId: 'zzzzzzzzzz99', nextId: 3 }));
  app.applyBuild(other);
  app.refresh(); app.pushHistoryNow();
  assert.equal(app.state.nextId, 3);
  app.undoRedo(-1);
  assert.equal(app.state.buildId, old.buildId);
  assert.equal(app.state.nextId, hi, 'the earlier build comes back with ITS OWN watermark, not the other build\'s');
  window.close();
});

test('P-id-3: every external load mints a new loadId: a hash link, Surprise me, a file / saved build, and the page start; a plain edit does not', () => {
  const { app, window } = boot();
  const seen = [app.loadIdNow()];
  const mark = (what) => { const id = app.loadIdNow(); assert.ok(!seen.includes(id), `${what} did not mint a new loadId`); seen.push(id); };
  app.state.placed.find((u) => u.id === 1).label = 'edited';
  app.refresh(); app.pushHistoryNow();
  assert.equal(app.loadIdNow(), seen[0], 'an ordinary edit is not a load');
  app.applyBuild(plain(app.serializeBuild()));
  mark('applyBuild (a file / saved build / restore)');
  const hash = app.encodeBuildHash();
  assert.equal(app.applyBuildHash(hash), true);
  mark('a #build= share link');
  app.surpriseMe();
  mark('Surprise me');
  window.confirm = () => true;
  window.document.getElementById('start-fresh').click();
  mark('Start fresh');
  window.close();
});

test('P-id-3b: a RESUME at boot (the saved last build) is a load too', () => {
  const build = JSON.stringify(plain(baseBuild()));
  // deterministic ids: the Nth newBuildId() call returns N, so two boots are comparable
  const det = () => { let n = 0; return { getRandomValues(a) { n++; for (let i = 0; i < a.length; i++) a[i] = (n * 7 + i) % 256; return a; } }; };
  const plainBoot = bootPlanner({ url: 'http://localhost:8124/', beforeApp: (w) => Object.defineProperty(w, 'crypto', { value: det(), configurable: true }) });
  const resumed = bootPlanner({ url: 'http://localhost:8124/', beforeApp: (w) => { Object.defineProperty(w, 'crypto', { value: det(), configurable: true }); w.localStorage.setItem('gen2-last-build', build); } });
  assert.ok(resumed.app.state.placed.length > 0, 'the saved build was resumed');
  assert.equal(plainBoot.app.state.placed.length, 0);
  assert.notEqual(resumed.app.loadIdNow(), plainBoot.app.loadIdNow(), 'resuming minted a new loadId beyond the one every boot starts with');
  plainBoot.window.close(); resumed.window.close();
});

test('P-id-4: an undo that crosses a load mints a new loadId; one inside a single load keeps it', () => {
  const { app, window } = boot();
  const L1 = app.loadIdNow();
  place(app, 2);
  app.undoRedo(-1);
  app.undoRedo(+1);
  assert.equal(app.loadIdNow(), L1, 'undo/redo inside one load keeps it');
  app.applyBuild(plain(baseBuild({ buildId: 'yyyyyyyyyy11', nextId: 3 })));
  app.refresh(); app.pushHistoryNow();
  const L2 = app.loadIdNow();
  assert.notEqual(L2, L1);
  app.undoRedo(-1);   // lands on the entry made under L1
  const L3 = app.loadIdNow();
  assert.notEqual(L3, L2, 'crossing back over the load mints a new session');
  assert.notEqual(L3, L1);
  window.close();
});

test('P-id-5: a job from before the crossing is reviewed in FULL afterwards (the loadId rule end to end)', async () => {
  const { app, window } = boot();
  const { buildLabelJob, makeJobRecord, mergeLabelReturn } = window.GEN2LabelReturn;
  const ctx = (extra) => ({ origin: 'http://localhost:8124', textMax: 40, loadId: app.loadIdNow(), plannerTabId: 'tab' + 'x'.repeat(9), cleanText: app.cleanLabelText, cleanBadge: app.cleanLabelBadge, cleanStyle: app.cleanLabelStyle, labelOrder: app.labelOrder, ...extra });
  const view = () => ({ units: app.state.placed, faceStyle: 'edgelabel', labelStyle: null, buildId: app.state.buildId });
  const job = buildLabelJob(view(), ctx());
  const rec = makeJobRecord(view(), job, ctx());
  const ret = { gen2label: 'return', v: 1, family: 'edgelabel', jobId: job.jobId, buildId: job.buildId, baseRev: job.baseRev, returnId: 'r'.repeat(12),
    rows: job.rows.map((r) => ({ u: r.u, t: r.u === 1 ? 'One!' : r.t, b: r.b })), style: { ...job.style }, extras: 0 };
  assert.equal(mergeLabelReturn(view(), rec, ret, ctx()).mode, 'normal');
  app.applyBuild(plain(app.serializeBuild()));   // the same build opened again (a link, a file)
  const plan = mergeLabelReturn(view(), rec, ret, ctx());
  assert.equal(plan.mode, 'full');
  assert.ok(plan.rows.every((r) => r.class === 'review'));
  window.close();
});
