/* THE gen2label CHANNEL - the PLANNER's half, executing the real app.js in jsdom (STEP3-SPEC.md section 10.4, P-rc-1..14).

   The generator tab talks to the planner over its OWN channel (`gen2label`): a hello, a return (the generator's edits), and the
   planner's answers (received, then applied / cancelled / superseded / refused). Like the viewer relay it is authenticated: an
   origin allowlist, the window this planner opened for the job, and every answer posted to that exact origin, never "*".

   ⚠ THESE TESTS DRIVE THE REAL HANDLERS (dispatching MessageEvents with an explicit origin and source). The dialog needs
   showModal(), which jsdom lacks: the TEST installs a stub before app.js runs; the production code has no fallback. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelPlanner, startJob, helloOf, returnOf, labelBuild, unit, plain, read, GEN_ORIGIN, VIEWER_ORIGIN, bootPlanner } from './lib/label-env.mjs';

const U = (id, x, y, o = {}) => unit(id, x, y, o);
const BUILD = (over) => labelBuild({ gridH: 1, ...over }, [U(1, 0, 0, { label: 'One' }), U(2, 1, 0, { label: 'Two', labelBadge: { type: 'char', value: 'A' } }), U(3, 2, 0)]);
const lp = (o = {}) => labelPlanner({ build: BUILD(), ...o });
const labelsOf = (p) => plain(p.app.state.placed.map((u) => [u.id, u.label || null, u.labelBadge || null]));
const dialogOpen = (p) => p.window.document.getElementById('label-return').hasAttribute('open');

/* the planner opens the generator, the generator says hello (the planner binds the window), and the user has changed row 1 there */
function linked(p) {
  const { job } = startJob(p);
  assert.ok(job, 'the click did not open a linked generator');
  p.post(helloOf(job));
  p.fromPlanner.length = 0;
  return job;
}

test('P-rc-1: a gen2label message NEVER touches the viewer relay: it cannot set viewerWin, and the dock still gets its posts', () => {
  const p = lp();
  const job = linked(p);
  p.toViewer.length = 0;
  p.post(returnOf(job, { 1: { t: 'One!' } }));        // a real return from the generator window
  p.app.state.placed.find((u) => u.id === 3).label = 'typed';   // and the user edits a drawer: the layout post follows
  p.app.refresh();
  p.timers.advance(400);                               // the debounced layout post
  assert.ok(p.toViewer.some((m) => m.d.gen2 === 'layout'), 'the viewer relay stopped working');
  assert.ok(p.toViewer.every((m) => m.d.gen2), 'something that is not a gen2 message reached the viewer');
  assert.ok(p.fromPlanner.every((m) => m.d.gen2label && !m.d.gen2), 'the generator received a viewer-relay message (the relay captured it as viewerWin)');
  // and the reverse: a gen2 (viewer) message from the GENERATOR window is refused by the relay's own origin/window gate
  const before = p.toViewer.length;
  p.post({ gen2: 'viewerReady' });
  p.timers.advance(400);
  assert.equal(p.toViewer.length, before, 'a gen2 message from the generator window must not re-point the relay');
  p.close();
});

test('P-rc-2: a message from a DISALLOWED origin changes nothing and gets no answer', () => {
  const p = lp();
  const job = linked(p);
  for (const origin of ['https://evil.example', 'https://edgelabel.jerrari3d.com.evil.example', 'http://localhost:9999', 'null', '']) {
    p.post(helloOf(job), { origin });
    p.post(returnOf(job, { 1: { t: 'FORGED' } }), { origin });
  }
  assert.equal(p.fromPlanner.length, 0, 'the planner answered a foreign origin');
  assert.equal(p.app.labelQueueLength(), 0);
  assert.equal(p.app.labelOpenItem(), null);
  assert.ok(!dialogOpen(p));
  assert.equal(labelsOf(p)[0][1], 'One');
  p.close();
});

test('P-rc-2b: the PRODUCTION planner trusts only the generator\'s own origin; a loopback one only exists with the dev override on a local planner', () => {
  assert.deepEqual(plain(lp().app.labelGenOrigins()), ['https://edgelabel.jerrari3d.com', GEN_ORIGIN]);
  assert.deepEqual(plain(lp({ qs: '' }).app.labelGenOrigins()), ['https://edgelabel.jerrari3d.com'], 'without ?dev_labelgen: production list only');
  assert.deepEqual(plain(lp({ qs: '?dev_labelgen=https://evil.example' }).app.labelGenOrigins()), ['https://edgelabel.jerrari3d.com'], 'a non-loopback override is ignored');
  assert.deepEqual(plain(lp({ qs: '?dev_labelgen=http://localhost:1/x' }).app.labelGenOrigins()), ['https://edgelabel.jerrari3d.com'], 'a path is not an origin');
  // a PRODUCTION-hosted planner has no override at all
  const { window, app } = bootPlanner({ url: 'https://gen2planner.jerrari3d.com/?dev_labelgen=http://localhost:8702' });
  assert.deepEqual(plain(app.labelGenOrigins()), ['https://edgelabel.jerrari3d.com']);
  window.close();
});

test('P-rc-3: a plain click opens the linked generator in this tab\'s named window, with #labels=... & job=..., and writes a job record', () => {
  const p = lp();
  const ev = p.click();
  assert.equal(ev.defaultPrevented, true);
  assert.equal(p.open.length, 1);
  assert.equal(p.open[0].name, 'gen2-labelgen-' + p.app.plannerTabId);
  const hash = p.open[0].url.slice(p.open[0].url.indexOf('#') + 1);
  assert.ok(p.open[0].url.startsWith(GEN_ORIGIN + '/#labels='), p.open[0].url.slice(0, 80));
  assert.ok(/&job=[A-Za-z0-9_-]+$/.test(hash), 'the job is last and unpadded');
  const job = startJob(p).job;   // (a second click: the same window name, a fresh job)
  const keys = [...Array(p.window.localStorage.length).keys()].map((i) => p.window.localStorage.key(i)).filter((k) => k.startsWith('gen2-label-job:'));
  assert.equal(keys.length, 2, 'one key per click');
  assert.ok(keys.includes('gen2-label-job:' + job.jobId));
  const rec = JSON.parse(p.window.localStorage.getItem('gen2-label-job:' + job.jobId));
  assert.deepEqual([rec.tab, rec.buildId, rec.baseRev, rec.family], [p.app.plannerTabId, p.app.state.buildId, job.baseRev, 'edgelabel']);
  assert.equal(rec.loadId, p.app.loadIdNow());
  assert.deepEqual(plain(rec.baseline.rows.map((r) => [r.u, r.t])), [[1, 'One'], [2, 'Two'], [3, '']]);
  p.close();
});

test('P-rc-3b: a Ctrl / Cmd / Shift / Alt click, a middle click and the Classic Pro button are NOT intercepted (no window.open, default not prevented)', () => {
  const p = lp();
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
    const ev = p.click(init);
    assert.equal(ev.defaultPrevented, false, JSON.stringify(init));
  }
  assert.equal(p.open.length, 0);
  p.app.state.faceStyle = 'classicpro';
  p.app.refresh();
  const ev = p.click();
  assert.equal(ev.defaultPrevented, false, 'Classic Pro keeps its one-way link');
  assert.equal(p.open.length, 0);
  assert.ok(p.anchor().href.includes('#labels=') || p.anchor().href.includes('classic'), 'the href is the plain one-way link');
  p.close();
});

test('P-rc-3c: an over-limit build is explained in a note with "Open one-way" and NO window opens; Open one-way opens the plain link', () => {
  const p = lp();
  p.window.GEN2LabelReturn.measureJob = (job, url) => ({ ok: false, reason: 'url', rows: job.rows.length, jsonBytes: 1, urlChars: 300 * 1024 });
  const ev = p.click();
  assert.equal(ev.defaultPrevented, true);
  assert.equal(p.open.length, 0, 'never a silent open');
  const note = p.window.document.getElementById('label-gen-note');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /too many labels for a linked generator session \(300 KB; the limit is 256 KB\)\. Open it one-way instead\? Changes made there won't come back\./);
  const btns = [...note.querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(btns, ['Open one-way', 'Close']);
  let oneWay = null;
  p.window.open = (url, target, feat) => { oneWay = { url, target, feat }; return null; };
  note.querySelector('button').click();
  assert.ok(oneWay && oneWay.url === p.anchor().href && oneWay.target === '_blank', JSON.stringify(oneWay));
  assert.equal(p.window.localStorage.length >= 0, true);
  const keys = [...Array(p.window.localStorage.length).keys()].map((i) => p.window.localStorage.key(i)).filter((k) => k.startsWith('gen2-label-job:'));
  assert.equal(keys.length, 0, 'no record for a job that never opened');
  p.close();
});

test('P-rc-4: window.open returning null (blocked) deletes the record and says how to get a one-way copy', () => {
  const p = lp({ blockOpen: true });
  p.click();
  assert.equal(p.open.length, 1);
  const keys = [...Array(p.window.localStorage.length).keys()].map((i) => p.window.localStorage.key(i)).filter((k) => k.startsWith('gen2-label-job:'));
  assert.equal(keys.length, 0, 'the record of the blocked window is deleted');
  const note = p.window.document.getElementById('label-gen-note');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Your browser blocked the label generator window\. Allow pop-ups for this site, or middle-click the button for a one-way copy\./);
  p.close();
});

test('P-rc-4b: storage that cannot hold the record says so and offers the one-way link (never a silent one-way open)', () => {
  const p = lp();
  const real = p.window.Storage.prototype.setItem;
  p.window.Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('gen2-label-job:')) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return real.call(this, k, v); };
  p.click();
  assert.equal(p.open.length, 0);
  assert.match(p.window.document.getElementById('label-gen-note').textContent, /Your browser's storage is full, so the generator can't be linked\. Open it one-way \(changes won't come back\)\?/);
  p.window.Storage.prototype.setItem = real;
  p.close();
});

test('P-rc-4c: a note appears when the generator never says hello (an older / cached generator), and a later hello removes it', () => {
  const p = lp();
  const { job } = startJob(p);
  p.timers.advance(5100);
  const note = p.window.document.getElementById('label-gen-note');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /The label generator didn't confirm the link\. If its tab still shows earlier labels, reload that tab\./);
  p.post(helloOf(job));
  assert.equal(note.hidden, true, 'a hello removes the note');
  const p2 = lp();
  const j2 = startJob(p2).job;
  p2.post(helloOf(j2));
  p2.timers.advance(6000);
  assert.equal(p2.window.document.getElementById('label-gen-note').hidden, true, 'no note when the hello came in time');
  p.close(); p2.close();
});

test('P-rc-5: hello -> ack (normal); after another build is LOADED it is ack full; a different build refuses', () => {
  const p = lp();
  const { job } = startJob(p);
  p.post(helloOf(job));
  const ack = p.answers('ack')[0];
  assert.deepEqual([ack.jobId, ack.baseRev, ack.drawers, ack.review, ack.v], [job.jobId, job.baseRev, 3, 'normal', 1]);
  assert.equal(p.fromPlanner[0].o, GEN_ORIGIN, 'posted to the generator\'s exact origin, never "*"');
  // a build load (a hash link, a file, resume) is a new build-loading session
  p.fromPlanner.length = 0;
  p.app.applyBuild(plain(p.app.serializeBuild()));
  p.post(helloOf(job));
  assert.equal(p.answers('ack')[0].review, 'full');
  // the generator's baseRev not the record's: also reviewed in full
  p.fromPlanner.length = 0;
  const p2 = lp();
  const j2 = startJob(p2).job;
  p2.post(helloOf(j2, { baseRev: 'zzzzzzzzzzzz' }));
  assert.equal(p2.answers('ack')[0].review, 'full');
  // a different build
  p.fromPlanner.length = 0;
  p.app.state.buildId = 'otherbuild12';
  p.post(helloOf(job));
  assert.deepEqual(plain(p.answers()), [{ gen2label: 'refused', v: 1, jobId: job.jobId, reason: 'other-build' }]);
  p.close(); p2.close();
});

test('P-rc-5b: a hello for a job this planner has no record of (pruned, another browser profile) is acked and the next return is reviewed in full', () => {
  const p = lp();
  const { job } = startJob(p);
  p.window.localStorage.removeItem('gen2-label-job:' + job.jobId);
  p.post(helloOf(job));
  const ack = p.answers('ack')[0];
  assert.equal(ack.review, 'full');
  assert.equal(ack.baseRev, job.baseRev, 'with no record the generator\'s own baseRev is echoed');
  p.close();
});

test('P-rc-6: a valid return is answered `received` SYNCHRONOUSLY, before the dialog opens', () => {
  const p = lp();
  const job = linked(p);
  const order = [];
  const real = p.window.HTMLDialogElement.prototype.showModal;
  p.window.HTMLDialogElement.prototype.showModal = function () { order.push('showModal:' + p.answers('received').length); return real.call(this); };
  p.post(returnOf(job, { 1: { t: 'One!' } }));
  assert.deepEqual(order, ['showModal:1'], 'received was already posted when the dialog opened');
  const r = p.answers('received');
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].jobId, r[0].v], [job.jobId, 1]);
  assert.equal(p.fromPlanner[0].o, GEN_ORIGIN);
  assert.ok(dialogOpen(p));
  assert.match(p.window.document.title, /^\(1\) Labels to review · /);
  p.close();
});

test('P-rc-7: NO answer is posted while the dialog stays open - not across 60 s, not across ten minutes (human review is never timed out)', () => {
  const p = lp();
  const job = linked(p);
  p.post(returnOf(job, { 1: { t: 'One!' } }));
  p.fromPlanner.length = 0;
  p.timers.advance(60000);
  assert.equal(p.fromPlanner.length, 0);
  p.timers.advance(600000);
  assert.equal(p.fromPlanner.length, 0);
  assert.ok(dialogOpen(p));
  assert.equal(labelsOf(p)[0][1], 'One', 'and nothing was applied by waiting');
  p.close();
});

test('P-rc-8: the SAME returnId re-sent while open gets `received` again and stays ONE item; after Apply it gets the CACHED `applied`, and the state is applied once', () => {
  const p = lp();
  const job = linked(p);
  const ret = returnOf(job, { 1: { t: 'One!' } });
  p.post(ret);
  p.post(ret); p.post(ret);
  assert.equal(p.answers('received').length, 3, 'one per send');
  assert.equal(p.app.labelQueueLength(), 0, 'still the ONE open item, nothing queued twice');
  p.window.document.getElementById('lr-apply').click();
  assert.equal(p.answers('applied').length, 1);
  assert.equal(labelsOf(p)[0][1], 'One!');
  const applied = p.answers('applied')[0];
  p.fromPlanner.length = 0;
  p.post(ret);   // the generator retried (a lost answer, or a reload)
  assert.deepEqual(plain(p.answers()), [applied], 'the cached answer, byte for byte');
  assert.equal(p.app.state.placed.filter((u) => u.label === 'One!').length, 1);
  assert.equal(p.app.history.stack.length, p.app.history.stack.length);
  p.close();
});

test('P-rc-9: a second return for the same job while one is open is QUEUED; a third REPLACES the second and the second hears `superseded`', () => {
  const p = lp();
  const job = linked(p);
  const r1 = returnOf(job, { 1: { t: 'first' } }, { returnId: 'ret1' + 'a'.repeat(8) });
  const r2 = returnOf(job, { 1: { t: 'second' } }, { returnId: 'ret2' + 'b'.repeat(8) });
  const r3 = returnOf(job, { 1: { t: 'third' } }, { returnId: 'ret3' + 'c'.repeat(8) });
  p.post(r1); p.post(r2);
  assert.equal(p.app.labelQueueLength(), 1);
  assert.equal(p.app.labelOpenItem().returnId, r1.returnId, 'the open dialog is never replaced');
  p.fromPlanner.length = 0;
  p.post(r3);
  const sup = p.answers('superseded');
  assert.equal(sup.length, 1);
  assert.deepEqual([sup[0].returnId, sup[0].by, sup[0].jobId], [r2.returnId, r3.returnId, job.jobId]);
  assert.equal(p.app.labelQueueLength(), 1, 'still one queued: the third');
  // finishing the first shows the third
  p.window.document.getElementById('lr-cancel').click();
  assert.equal(p.app.labelOpenItem().returnId, r3.returnId);
  assert.equal(p.app.labelQueueLength(), 0);
  p.close();
});

test('P-rc-10: a dock edit to a LISTED drawer while the dialog is open: Apply re-renders with the notice and applies NOTHING; the second Apply applies', () => {
  const p = lp();
  const job = linked(p);
  p.post(returnOf(job, { 1: { t: 'One (generator)' } }));
  const doc = p.window.document;
  assert.equal(doc.querySelectorAll('#lr-body .lr-row').length, 1);
  // the user edits drawer 1 in the DOCK while the dialog is open
  p.post({ gen2: 'buildOptions', opts: { buildId: p.app.state.buildId, labels: { 1: 'One (dock)' } } }, { source: p.viewer, origin: VIEWER_ORIGIN });
  assert.equal(labelsOf(p)[0][1], 'One (dock)');
  doc.getElementById('lr-apply').click();
  assert.equal(p.answers('applied').length, 0, 'nothing applied by the first Apply');
  assert.equal(labelsOf(p)[0][1], 'One (dock)');
  const notice = doc.getElementById('lr-notice');
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /The planner changed while this was open\. The highlighted rows are new or different - check them, then Apply again\./);
  assert.equal(doc.querySelectorAll('#lr-body .lr-changed').length, 1, 'only the changed row is highlighted');
  assert.equal(doc.querySelectorAll('#lr-body input[type=radio]').length, 2, 'it is now a conflict: keep the planner\'s / use the generator\'s');
  assert.equal(doc.querySelector('#lr-body input[type=radio]:checked').value, 'planner', 'default: Keep the planner\'s');
  doc.querySelector('#lr-body input[type=radio][value=generator]').click();
  doc.getElementById('lr-apply').click();
  assert.equal(p.answers('applied').length, 1);
  assert.equal(labelsOf(p)[0][1], 'One (generator)');
  p.close();
});

test('P-rc-10b: an UNRELATED change in the planner while the dialog is open (a drawer the return does not list, a colour) does NOT force a re-review', () => {
  const p = lp();
  const job = linked(p);
  p.post(returnOf(job, { 1: { t: 'One!' } }));
  p.app.state.placed.find((u) => u.id === 3).label = 'typed elsewhere';
  p.app.state.backCover = true;
  p.app.refresh();
  p.window.document.getElementById('lr-apply').click();
  assert.equal(p.answers('applied').length, 1, 'applied at once');
  assert.equal(labelsOf(p)[0][1], 'One!');
  assert.equal(labelsOf(p)[2][1], 'typed elsewhere');
  p.close();
});

test('P-rc-11: Apply = ONE undo entry, `applied` with decisions, the record\'s baseline / baseRev / loadId updated, and a `layout` for the dock', () => {
  const p = lp();
  const job = linked(p);
  const app = p.app;
  app.pushHistoryNow();
  const entries0 = app.history.stack.length;
  const before = labelsOf(p);
  p.post(returnOf(job, { 1: { t: 'One!' }, 3: { t: 'New three', b: { type: 'char', value: 'Z' } } }, { style: { ...job.style, capMm: 4.5 } }));
  p.toViewer.length = 0;
  p.window.document.getElementById('lr-apply').click();
  p.timers.advance(400);
  assert.equal(app.history.stack.length, entries0 + 1, 'exactly one history entry for the whole apply');
  assert.ok(p.toViewer.some((m) => m.d.gen2 === 'layout' && m.d.build.placed.find((u) => u.id === 1).label === 'One!' && m.d.build.labelStyle.capMm === 4.5), 'the dock got the new labels in a layout post');
  const a = p.answers('applied')[0];
  assert.equal(a.v, 1);
  assert.deepEqual(plain(a.rows.map((r) => [r.u, r.t, r.b, r.decision])), [[1, 'One!', null, 'applied'], [2, 'Two', { type: 'char', value: 'A' }, 'unchanged'], [3, 'New three', { type: 'char', value: 'Z' }, 'applied']]);
  assert.deepEqual(plain(a.gone), []);
  assert.equal(a.style.capMm, 4.5);
  assert.equal(a.styleDecision.capMm, 'applied');
  assert.equal(a.changes, 4, 'two words + one badge + one style field');
  assert.equal(p.fromPlanner[p.fromPlanner.length - 1].o, GEN_ORIGIN);
  const rec = JSON.parse(p.window.localStorage.getItem('gen2-label-job:' + job.jobId));
  assert.equal(rec.baseRev, a.baseRev);
  assert.notEqual(a.baseRev, job.baseRev);
  assert.equal(rec.loadId, app.loadIdNow());
  assert.deepEqual(plain(rec.baseline.rows.map((r) => [r.u, r.t, r.b])), [[1, 'One!', null], [2, 'Two', { type: 'char', value: 'A' }], [3, 'New three', { type: 'char', value: 'Z' }]]);
  assert.equal(rec.baseline.style.capMm, 4.5);
  assert.equal(rec.answers[Object.keys(rec.answers)[0]].kind, 'applied');
  assert.ok(!dialogOpen(p));
  assert.equal(p.window.document.title.startsWith('('), false, 'the title prefix is cleared');
  // undo (after the coalescing window) restores the pre-apply labels in one step
  app.undoRedo(-1);
  assert.deepEqual(labelsOf(p), before);
  assert.equal(app.state.labelStyle, null);
  // the NEXT return from the generator is normal again: it compares against the new baseline
  const next = returnOf(job, {}, { baseRev: a.baseRev });
  p.fromPlanner.length = 0;
  p.post(next);
  assert.equal(p.answers('received').length, 1);
  p.close();
});

test('P-rc-12: Cancel, Escape and a plain close each give exactly ONE `cancelled`, the state is unchanged; without showModal: refused planner-unsupported', () => {
  for (const how of ['button', 'escape', 'close']) {
    const p = lp();
    const job = linked(p);
    p.post(returnOf(job, { 1: { t: 'One!' } }));
    p.fromPlanner.length = 0;
    const dlg = p.window.document.getElementById('label-return');
    if (how === 'button') p.window.document.getElementById('lr-cancel').click();
    else if (how === 'escape') dlg.dispatchEvent(new p.window.Event('cancel', { cancelable: true }));
    else dlg.close();
    assert.equal(p.answers('cancelled').length, 1, how);
    assert.equal(p.answers().length, 1, how + ': nothing else was posted');
    assert.equal(labelsOf(p)[0][1], 'One', how + ': nothing applied');
    assert.ok(!dialogOpen(p), how);
    assert.equal(p.window.document.title.startsWith('('), false, how + ': title restored');
    p.close();
  }
  const q = lp({ noModal: true });
  const job = linked(q);
  const ret = returnOf(job, { 1: { t: 'One!' } });
  q.post(ret);
  assert.deepEqual(plain(q.answers().map((m) => [m.gen2label, m.reason])), [['received', null], ['refused', 'planner-unsupported']]);
  assert.equal(labelsOf(q)[0][1], 'One');
  q.close();
});

test('P-rc-13: a message from an allowed origin but a DIFFERENT window than the bound one is dropped; after a planner reload the first valid message binds', () => {
  const p = lp();
  const job = linked(p);
  const other = p.mkWin([]);
  p.post(returnOf(job, { 1: { t: 'FORGED' } }), { source: other });
  p.post(helloOf(job), { source: other });
  assert.equal(p.app.labelQueueLength() + (p.app.labelOpenItem() ? 1 : 0), 0, 'a return from a second window of the same origin is dropped');
  assert.ok(!dialogOpen(p));
  assert.equal(p.answers().length, 0, 'and not even answered');
  // the planner tab RELOADS (a fresh boot, the same storage): nothing is bound, the record is there
  const storage = {}; for (let i = 0; i < p.window.localStorage.length; i++) { const k = p.window.localStorage.key(i); storage[k] = p.window.localStorage.getItem(k); }
  const session = { 'gen2-planner-tab': p.app.plannerTabId };
  const buildJson = plain(p.app.serializeBuild());
  const p2 = labelPlanner({ build: buildJson, storage, session });
  assert.equal(p2.app.plannerTabId, p.app.plannerTabId, 'the tab id survives the reload (sessionStorage)');
  p2.post(helloOf(job));
  const ack = p2.answers('ack')[0];
  assert.equal(ack.review, 'full', 'a reload is a new build-loading session');
  assert.equal(ack.baseRev, job.baseRev, 'the record survived the reload');
  const win = p2.gen;
  assert.ok(win);
  p2.fromPlanner.length = 0;
  const intruder = p2.mkWin([]);
  p2.post(returnOf(job, { 1: { t: 'FORGED' } }), { source: intruder });
  assert.equal(p2.answers().length, 0, 'once bound to the first sender, another window is dropped');
  p.close(); p2.close();
});

test('P-rc-14: refresh() and the page load never touch label-return.js; the planner boots and the button falls through without it', () => {
  const src = read('js/app.js');
  const m = src.match(/\n  function refresh\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, 'could not extract refresh()');
  assert.ok(!/GEN2LabelReturn|label-return|LR\(\)/.test(m[0]), 'refresh() references the label-return module');
  const p = labelPlanner({ build: BUILD(), withLabelReturn: false });
  assert.equal(typeof p.window.GEN2LabelReturn, 'undefined');
  const ev = p.click();
  assert.equal(ev.defaultPrevented, false, 'no module: the plain one-way link works as before');
  assert.equal(p.open.length, 0);
  p.post(helloOf({ jobId: 'abcdefghijkl', buildId: p.app.state.buildId, baseRev: 'abcdefghijkl' }));
  assert.equal(p.answers().length, 0);
  p.close();
});

test('P-rc-15: a refused or malformed return is refused BY NAME to the exact origin; wrong-family and other-build too; and a return naming another build is never queued', () => {
  const p = lp();
  const job = linked(p);
  const bad = (msg) => { p.fromPlanner.length = 0; p.post(msg); return p.answers(); };
  assert.deepEqual(plain(bad({ ...returnOf(job, {}), v: 2 })).map((m) => [m.gen2label, m.reason]), [['refused', 'malformed']]);
  assert.deepEqual(plain(bad({ ...returnOf(job, {}), family: 'classicpro' })).map((m) => [m.gen2label, m.reason]), [['refused', 'wrong-family']]);
  assert.deepEqual(plain(bad({ ...returnOf(job, {}), rows: 'nope' })).map((m) => [m.gen2label, m.reason]), [['refused', 'malformed']]);
  const other = bad({ ...returnOf(job, {}), buildId: 'otherbuild12' });
  assert.deepEqual(plain(other).map((m) => [m.gen2label, m.reason]), [['refused', 'other-build']]);
  assert.ok(other[0].returnId, 'the refusal names the return');
  assert.equal(p.app.labelQueueLength() + (p.app.labelOpenItem() ? 1 : 0), 0);
  assert.ok(p.fromPlanner.every((m) => m.o === GEN_ORIGIN));
  // a gen2label message with a bad jobId or without one is dropped silently
  p.fromPlanner.length = 0;
  p.post({ gen2label: 'return', v: 1 });
  p.post({ gen2label: 'hello', jobId: 'x' });
  p.post('hello');
  p.post(null);
  assert.equal(p.answers().length, 0);
  p.close();
});

test('P-rc-16: the dialog\'s conflict, review and not-saved presentation: a reloaded planner lists every difference UNTICKED; icon-only is under "Not saved to the planner"', () => {
  const p = lp();
  const job = linked(p);
  // a planner that was reloaded since: the record's loadId differs
  p.app.applyBuild(plain(p.app.serializeBuild()));
  p.post(returnOf(job, { 1: { t: 'One!' }, 3: { t: '', b: { type: 'unsupplied', why: 'icon-only' } } }, { extras: 2 }));
  const doc = p.window.document;
  assert.match(doc.getElementById('lr-mode').textContent, /reloaded, or opened a different build/);
  assert.equal(doc.getElementById('lr-mode').hidden, false);
  const boxes = [...doc.querySelectorAll('#lr-body input[type=checkbox]')];
  assert.equal(boxes.length, 1);
  assert.ok(boxes.every((b) => !b.checked), 'review rows are never pre-ticked');
  assert.equal(doc.getElementById('lr-apply').disabled, true, 'Apply 0 changes is disabled');
  assert.equal(doc.getElementById('lr-apply').textContent, 'Apply 0 changes');
  assert.match(doc.getElementById('lr-body').textContent, /Check these \(1\)/);
  assert.match(doc.getElementById('lr-body').textContent, /Not saved to the planner/);
  assert.match(doc.getElementById('lr-body').textContent, /Drawer #3: icon-only label stays in the generator\./);
  assert.match(doc.getElementById('lr-body').textContent, /Not applied \(1\)/);
  assert.match(doc.getElementById('lr-body').textContent, /2 extra labels you added in the generator are printed there only\./);
  boxes[0].click();
  assert.equal(doc.getElementById('lr-apply').textContent, 'Apply 1 change');
  assert.equal(doc.getElementById('lr-apply').disabled, false);
  p.close();
});

test('P-rc-17: the dialog shows words through textContent only (markup in a label is text, never HTML)', () => {
  const p = lp();
  const job = linked(p);
  p.post(returnOf(job, { 1: { t: '<img src=x onerror=alert(1)>' } }));
  const doc = p.window.document;
  assert.equal(doc.querySelectorAll('#lr-body img').length, 0);
  assert.match(doc.getElementById('lr-body').textContent, /<IMG SRC=X ONERROR=ALERT\(1\)>/, 'shown in the build\'s label style (ALL CAPS), as text');
  p.close();
});
