/* RELEASE B: THE STALE-TAB PROTECTIONS (LABEL-LIST-FORMAT.md section 3a item 3; MODULITH handoffs/label-release/step3/
   RELEASE-B-PROTECTIONS.md, revised after Sol 01a11446), on the real app.js in jsdom.
   1. every label job declares what this planner can take back (caps);
   2. the tab notices a newer deploy (exact for app.js: its own source vs the served file; two equal answers a minute apart),
      then starts no new structured-label session, and "Refresh now" keeps the build in this tab's sessionStorage;
   3. same-browser recovery of a list an older tab dropped: the copy, its detection on an external load (never an undo), and a
      restore under the older-tool rules that never deletes a label and never attaches one to a drawer that changed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain, read, LR, cleaners } from './lib/label-env.mjs';

const b64u = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const SERVED = () => ({ 'js/app.js': read('js/app.js'), 'js/label-list.js': read('js/label-list.js'),
  'js/label-return.js': read('js/label-return.js'), 'js/data.js': read('js/data.js') });

// a fetch the test controls: `files` is what the site serves now; calls are logged with their cache mode
function fakeFetch(files, log) {
  return async (url, opts) => {
    if (log) log.push([String(url), opts && opts.cache]);
    if (files.fail) throw new TypeError('Failed to fetch');
    const t = files[String(url)];
    return t === undefined ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => t };
  };
}
function boot({ build, hash = '', url = 'http://localhost:8124/', files, log, before } = {}) {
  const { app, window } = bootPlanner({ url: url + hash, beforeApp: (w) => {
    if (files) w.fetch = fakeFetch(files, log);
    if (before) before(w);
  } });
  window.confirm = () => true;
  window.open = () => null;
  if (build) { assert.ok(app.applyBuild(plain(build))); app.refresh(); app.pushHistoryNow(); }
  return { app, window };
}
const L1 = (id, text, extra = {}) => ({ id, text, ...extra });
// a build with a label list: labels a..e, a/b/c/d on drawers 1-4 (their mirrors written), e unassigned
function listedBuild(over = {}) {
  const list = { format: 'modulith-labels', version: 1, labels: [L1('labela0001', 'Bolts'), L1('labelb0002', 'Nuts'), L1('labelc0003', 'Washers'),
    L1('labeld0004', 'Torx bits'), L1('labele0005', 'Spare')] };
  return labelBuild({ labelList: list, labelAssign: { 1: 'labela0001', 2: 'labelb0002', 3: 'labelc0003', 4: 'labeld0004' }, ...over },
    [unit(1, 0, 0, { label: 'Bolts' }), unit(2, 1, 0, { label: 'Nuts' }), unit(3, 2, 0, { label: 'Washers' }),
      unit(4, 0, 2, { label: 'Torx bits' }), unit(5, 1, 2), unit(6, 2, 2)]);
}
// the same build as an OLDER tab saves it: no list, the drawers' words kept (the mirror), anything else changed by `units`
const droppedBuild = (units) => { const b = listedBuild(); delete b.labelList; delete b.labelAssign; if (units) b.placed = units; return b; };
const copies = (window) => JSON.parse(window.localStorage.getItem('gen2-label-copies') || 'null');
const flush = () => new Promise((r) => setTimeout(r, 0));
// the planner's Date.now, driven by the test: the deploy check needs two equal answers at least a minute apart
function clock(window, start = 1.8e12) { let t = start; window.Date.now = () => t; return { tick: (ms) => { t += ms; } }; }

/* ------------------------------------------------------------------------------------------------ 1. the capability field */

test('RB-1: every label job says it comes from a planner that can take a label list back (caps), and stays a valid job', () => {
  const c = cleaners();
  const job = LR.buildLabelJob({ units: labelBuild().placed, labelStyle: null, buildId: 'abcdefghij12' },
    { origin: 'https://gen2planner.jerrari3d.com', textMax: 40, cleanText: c.cleanText, cleanBadge: c.cleanBadge, cleanStyle: c.cleanStyle, labelOrder: c.labelOrder });
  assert.deepEqual(plain(job.caps), ['label-list']);
  assert.deepEqual(plain(LR.JOB_CAPS), ['label-list']);
  job.caps.push('x');
  assert.deepEqual(plain(LR.JOB_CAPS), ['label-list'], 'each job gets its own copy');
});

/* ------------------------------------------------------------------------------------------------ 2. a newer deploy */

test('RB-2: an unchanged site never raises the notice; the boot baseline uses force-cache and the checks no-cache', async () => {
  const log = [];
  const { app, window } = boot({ files: SERVED(), log });
  await app.deployBaseline();
  assert.ok(log.some(([u, c]) => u === 'js/data.js' && c === 'force-cache'), 'the baseline is the copy the browser holds');
  assert.ok(!log.some(([u]) => u === 'js/app.js' && log.find((x) => x[0] === 'js/app.js')[1] === 'force-cache'), 'app.js needs no baseline: its own source is exact');
  assert.equal(await app.checkDeploy(true), 'same');
  assert.ok(log.some(([u, c]) => u === 'js/app.js' && c === 'no-cache'));
  assert.equal(app.deploy.newer, false);
  assert.equal(window.document.getElementById('newer-deploy-note'), null);
  window.close();
});

test('RB-3: a changed app.js is declared only when two checks give the SAME answer; a flapping CDN never raises it', async () => {
  const files = SERVED();
  const { app, window } = boot({ files });
  const c = clock(window);
  await app.deployBaseline();
  const changed = (tag) => read('js/app.js').replace('"use strict";', '"use strict"; /* ' + tag + ' */');
  files['js/app.js'] = read('js/app.js') + '\n// appended after the script';
  assert.equal(await app.checkDeploy(true), 'same', 'text outside the running function is not a change to what runs');
  files['js/app.js'] = changed('deploy A');
  assert.equal(await app.checkDeploy(true), 'pending', 'one sighting is not enough');
  files['js/app.js'] = changed('deploy B');
  assert.equal(await app.checkDeploy(true), 'pending', 'a different answer starts over');
  files['js/app.js'] = read('js/app.js');
  assert.equal(await app.checkDeploy(true), 'same', 'back to the bytes this tab runs: nothing pending');
  assert.equal(app.deploy.seen, null);
  files['js/app.js'] = changed('deploy B');
  assert.equal(await app.checkDeploy(true), 'pending');
  c.tick(5000);
  assert.equal(await app.checkDeploy(true), 'pending', 'the same answer 5 s later (an "online" event, say) is not yet a deploy (Sol 01a11481)');
  assert.equal(app.deploy.newer, false);
  c.tick(60000);
  assert.equal(await app.checkDeploy(true), 'newer', 'the same answer a minute after the first: declared');
  assert.equal(app.deploy.newer, true);
  const note = window.document.getElementById('newer-deploy-note');
  assert.ok(note, 'the soft notice is up');
  assert.match(note.textContent, /updated since this tab opened/);
  assert.equal(await app.checkDeploy(true), 'skip', 'once declared, no more checks');
  window.close();
});

test('RB-4: a deploy touching only label-list.js is caught against the boot copy; throttling, no fetch, file: and offline', async () => {
  const files = SERVED();
  const { app, window } = boot({ files });
  const c = clock(window);
  await app.deployBaseline();
  assert.equal(await app.checkDeploy(true), 'same');
  assert.equal(await app.checkDeploy(false), 'skip', 'at most once a minute unless forced');
  files['js/label-list.js'] = read('js/label-list.js') + '\n// newer';
  c.tick(61000);
  assert.equal(await app.checkDeploy(false), 'pending', 'a minute later, an unforced check runs');
  c.tick(61000);
  assert.equal(await app.checkDeploy(false), 'newer');
  window.close();
  const off = SERVED(); off.fail = true;
  const b = boot({ files: off });
  assert.equal(await b.app.checkDeploy(true), 'error', 'offline: an error, never a verdict');
  assert.equal(b.app.deploy.newer, false);
  b.window.close();
  const nf = boot({});
  assert.equal(await nf.app.checkDeploy(true), 'skip', 'no fetch (an older browser, a harness): nothing happens');
  nf.window.close();
});

test('RB-5: after a newer deploy, labels wait for a refresh - #labels-add= is refused and stays in the address; the linked generator is not opened', async () => {
  const doc = { format: 'modulith-labels', version: 1, batchId: 'batchdeploy01', labels: [{ text: 'Torx' }] };
  const { app, window } = boot({ build: labelBuild({ faceStyle: 'edgelabel' }), files: SERVED() });
  app.deploy.newer = true;
  window.location.hash = '#labels-add=' + b64u(doc);
  assert.equal(app.importFromHash(), 'refused');
  assert.match(window.location.hash, /labels-add=/, 'the link stays, so the refreshed tab adds the labels');
  assert.equal(app.state.labelList, null, 'nothing was added');
  const opened = [];
  window.open = (u) => { opened.push(u); return {}; };
  const a = window.document.getElementById('label-gen-link');
  a.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  assert.equal(opened.length, 0, 'no linked session from a stale tab');
  const note = window.document.getElementById('label-gen-note');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Refresh this tab before linking/);
  assert.deepEqual([...note.querySelectorAll('button')].map((b) => b.textContent), ['Refresh now', 'Open one-way', 'Close']);
  window.close();
});

test('RB-6: Refresh now keeps the CURRENT build in this tab (sessionStorage), drops #build= and keeps #labels-add=; boot applies it first', () => {
  const linkBuild = labelBuild({ buildId: 'linkbuild001' });
  const { app, window } = boot({ build: linkBuild });
  window.history.replaceState(null, '', '/#build=' + Buffer.from(JSON.stringify(linkBuild)).toString('base64') + '&labels-add=QUJD');
  app.state.placed.find((u) => u.id === 1).label = 'Edited after the link';
  app.refresh();
  assert.equal(app.refreshKeepingBuild(), true);
  const kept = JSON.parse(window.sessionStorage.getItem(app.REFRESH_KEY));
  assert.equal(kept.placed.find((u) => u.id === 1).label, 'Edited after the link', 'the edit made since the link is what comes back');
  assert.equal(window.location.hash, '#labels-add=QUJD');
  window.close();
  // the reload: the kept build wins over a #build= link AND over the shared session slot
  const other = labelBuild({ buildId: 'otherbuild01' }, [unit(1, 0, 0, { label: 'Not this one' })]);
  const b = boot({ hash: '#build=' + Buffer.from(JSON.stringify(other)).toString('base64'), before: (w) => {
    w.sessionStorage.setItem('gen2-refresh-build', JSON.stringify(kept));
    w.localStorage.setItem('gen2-last-build', JSON.stringify(other));
  } });
  assert.equal(b.app.state.buildId, 'linkbuild001');
  assert.equal(b.app.state.placed.find((u) => u.id === 1).label, 'Edited after the link');
  assert.equal(b.window.sessionStorage.getItem('gen2-refresh-build'), null, 'used once');
  b.window.close();
});

test('RB-7: if the build cannot be kept, Refresh now does not reload and says to save the file first', () => {
  const { app, window } = boot({ build: labelBuild(), hash: '#build=abc' });
  Object.defineProperty(window, 'sessionStorage', { value: { setItem() { throw new Error('QuotaExceededError'); }, getItem: () => null, removeItem() {} } });
  app.state.mount = 'tabletop';
  assert.equal(app.refreshKeepingBuild(), false);
  assert.equal(window.location.hash, '#build=abc', 'the address is untouched');
  assert.match(app.tray.status, /Save the build file first/);
  window.close();
});

/* ------------------------------------------------------------------------------------------------ 3. same-browser recovery */

test('RB-8: a build with a list leaves a copy (list, assignments, each assigned drawer\'s geometry); a build without one leaves none', () => {
  const { app, window } = boot({ build: listedBuild() });
  const c = copies(window).copies.abcdefghij12;
  assert.equal(c.list.labels.length, 5);
  assert.deepEqual(plain(c.assign), { 1: 'labela0001', 2: 'labelb0002', 3: 'labelc0003', 4: 'labeld0004' });
  const g = (id) => { const u = app.state.placed.find((x) => x.id === id); return [u.x, u.y, u.w, u.hh]; };
  assert.deepEqual(plain(c.geom), { 1: g(1), 2: g(2), 3: g(3), 4: g(4) }, "as placed after the planner's own load");
  assert.equal(typeof c.savedAt, 'number');
  window.close();
  const b = boot({ build: labelBuild({ buildId: 'nolistbuild1' }) });
  assert.equal(copies(b.window), null);
  b.window.close();
});

test('RB-9: the copy follows only THIS tab\'s list changes; emptying the list here deletes it; an oversized list leaves no copy', () => {
  const { app, window } = boot({ build: listedBuild() });
  window.localStorage.removeItem('gen2-label-copies');   // as if another tab deleted it (its user removed the labels there)
  app.state.placed.find((u) => u.id === 6).x = 2; app.state.gridW = 3;
  app.state.placed.push(unit(7, 2, 4)); app.state.gridH = 6; app.state.nextId = 8;
  app.refresh(); app.pushHistoryNow();
  assert.equal(copies(window), null, 'a layout-only edit does not write this tab\'s older list back');
  app.state.labelList.labels.push({ id: 'labelf0006', text: 'New here' });
  app.refresh(); app.pushHistoryNow();
  assert.equal(copies(window).copies.abcdefghij12.list.labels.length, 6, 'a list change here does write');
  app.state.labelList = null; app.state.labelAssign = null;
  for (const u of app.state.placed) delete u.label;
  app.refresh(); app.pushHistoryNow();
  assert.equal(copies(window), null, 'the list is gone here, so is its copy');
  app.state.labelList = { format: 'modulith-labels', version: 1, labels: [{ id: 'labelg0007', text: 'x' }], note: 'y'.repeat(app.COPY_MAX_CHARS) };
  app.refresh(); app.pushHistoryNow();
  assert.equal(copies(window), null, 'too big to hold: no copy (never a stale one)');
  window.close();
});

test('RB-10: a resumed build that came back WITHOUT its list, with a copy here, is offered back - and the boot\'s own save keeps the copy', () => {
  const seed = boot({ build: listedBuild() });
  const store = seed.window.localStorage.getItem('gen2-label-copies');
  seed.window.close();
  const { app, window } = boot({ before: (w) => {
    w.localStorage.setItem('gen2-label-copies', store);
    w.localStorage.setItem('gen2-last-build', JSON.stringify(droppedBuild()));
  } });
  assert.equal(app.state.buildId, 'abcdefghij12');
  assert.equal(app.state.labelList, null);
  assert.ok(app.labelCopyOffer.pending, 'offered');
  assert.equal(app.labelCopyOffer.pending.n, 5);
  const box = window.document.getElementById('label-copy-offer');
  assert.ok(box);
  assert.match(box.textContent, /came back without its label list/);
  assert.deepEqual([...box.querySelectorAll('button')].map((b) => b.textContent), ['Restore labels', 'Not now', 'Discard the copy']);
  app.pushHistoryNow();   // the resume's coalesced snapshot, which fires 350 ms after the load and saves the session
  assert.ok(copies(window).copies.abcdefghij12, 'still there after the load saved the session');
  app.state.placed.find((u) => u.id === 5).label = 'Typed meanwhile'; app.refresh(); app.pushHistoryNow();
  assert.ok(copies(window).copies.abcdefghij12, '... and after further edits while the offer is open');
  window.close();
});

test('RB-11: an Undo back to before the labels is this tab\'s own history: no offer, and the copy goes', () => {
  const { app, window } = boot({ build: labelBuild() });
  assert.ok(app.importLabels({ format: 'modulith-labels', version: 1, labels: [{ text: 'Torx' }] }) === 'added');
  assert.ok(copies(window).copies.abcdefghij12);
  app.undoRedo(-1);
  assert.equal(app.state.labelList, null);
  assert.equal(app.labelCopyOffer.pending, null);
  assert.equal(window.document.getElementById('label-copy-offer'), null);
  assert.equal(copies(window), null);
  window.close();
});

test('RB-12: Restore - kept where the drawer is unchanged, dropped where it moved, the older tab\'s clears and edits win their drawer without deleting anything; ONE Undo step', () => {
  const seed = boot({ build: listedBuild({ gridW: 4 }) });
  const store = seed.window.localStorage.getItem('gen2-label-copies');
  seed.window.close();
  // the older tab: drawer 2 moved (its id now names a drawer elsewhere), drawer 3 cleared, drawer 4 renamed, a new drawer 7 typed
  const older = listedBuild({ gridW: 4, nextId: 8 });
  delete older.labelList; delete older.labelAssign;
  older.placed = [unit(1, 0, 0, { label: 'Bolts' }), unit(2, 3, 0, { label: 'Nuts' }), unit(3, 2, 0),
    unit(4, 0, 2, { label: 'Hex keys' }), unit(5, 1, 2), unit(6, 2, 2), unit(7, 3, 2, { label: 'Fuses' })];
  const { app, window } = boot({ before: (w) => { w.localStorage.setItem('gen2-label-copies', store); w.localStorage.setItem('gen2-last-build', JSON.stringify(older)); } });
  assert.ok(app.labelCopyOffer.pending);
  app.pushHistoryNow();   // the resume's own coalesced snapshot (it fires 350 ms after a load)
  const before = app.history.stack.length;
  assert.equal(app.restoreLabelCopy(), true);
  assert.equal(app.history.stack.length, before + 1, 'one history entry');
  const ls = app.state.labelList.labels, A = app.state.labelAssign;
  const text = (id) => ls.find((l) => l.id === A[id]).text;
  for (const id of ['labela0001', 'labelb0002', 'labelc0003', 'labeld0004', 'labele0005']) assert.ok(ls.some((l) => l.id === id), id + ' kept in the list');
  assert.equal(A[1], 'labela0001', 'drawer 1: unchanged, its label restored');
  assert.notEqual(A[2], 'labelb0002', 'drawer 2 moved: the old assignment is not trusted');
  assert.equal(text(2), 'Nuts', '... its words become a label of their own');
  assert.equal(A[3], undefined, 'drawer 3 was cleared by the older tab: Washers goes to the tray, not back on the drawer');
  assert.equal(text(4), 'Hex keys', 'drawer 4: the older tab\'s words win that drawer');
  assert.notEqual(A[4], 'labeld0004', '... as a new label; Torx bits waits in the tray');
  assert.equal(text(7), 'Fuses', 'a drawer the older tab added keeps its words');
  assert.equal(app.state.placed.find((u) => u.id === 1).label, 'Bolts', 'the mirror follows');
  assert.equal(app.labelCopyOffer.pending, null);
  assert.equal(window.document.getElementById('label-copy-offer'), null);
  assert.equal(copies(window).copies.abcdefghij12.list.labels.length, ls.length, 'the copy now holds the restored list');
  app.undoRedo(-1);
  assert.equal(app.state.labelList, null, 'Undo takes the whole restore back');
  window.close();
});

test('RB-13: an icon-only label stays on its unchanged drawer; Not now keeps the copy and holds new labels back; Discard ends it and adds them', () => {
  const b = listedBuild();
  b.labelList.labels.push({ id: 'labelh0008', text: '', badge: { type: 'icon', value: 'coffee-filter' } });
  b.labelAssign[5] = 'labelh0008';
  const seed = boot({ build: b });
  const store = seed.window.localStorage.getItem('gen2-label-copies');
  seed.window.close();
  const boot2 = () => boot({ before: (w) => { w.localStorage.setItem('gen2-label-copies', store); w.localStorage.setItem('gen2-last-build', JSON.stringify(droppedBuild())); } });
  let { app, window } = boot2();
  assert.equal(app.restoreLabelCopy(), true);
  assert.equal(app.state.labelAssign[5], 'labelh0008', 'no words could ever be shown for it by an older tab: it stays put');
  window.close();
  ({ app, window } = boot2());
  window.document.querySelector('#label-copy-offer button:nth-of-type(2)').click();   // Not now
  assert.equal(window.document.getElementById('label-copy-offer'), null);
  assert.ok(app.labelCopyOffer.pending && app.labelCopyOffer.pending.setAside);
  const doc = { format: 'modulith-labels', version: 1, batchId: 'batchwaiting1', labels: [{ text: 'Waiting' }] };
  window.location.hash = '#labels-add=' + b64u(doc);
  assert.equal(app.importFromHash(), 'refused', 'a new list would replace the copy at the next save');
  assert.ok(copies(window).copies.abcdefghij12, 'the copy is kept');
  assert.equal(app.discardLabelCopy(), true);
  assert.equal(app.labelCopyOffer.pending, null);
  assert.ok(app.state.labelList && app.state.labelList.labels.some((l) => l.text === 'Waiting'), 'the waiting labels were added');
  const now = copies(window).copies.abcdefghij12.list.labels;
  assert.ok(now.some((l) => l.text === 'Waiting'), 'the copy is the NEW list');
  assert.ok(!now.some((l) => /^label[a-h]000\d$/.test(l.id)), 'nothing of the discarded copy came back');
  window.close();
});

test('RB-14: no offer for a copy over 30 days old, for another build, or when the build arrives WITH a list', () => {
  const seed = boot({ build: listedBuild() });
  const o = copies(seed.window);
  seed.window.close();
  const tryWith = (store, build) => {
    const r = boot({ before: (w) => { w.localStorage.setItem('gen2-label-copies', JSON.stringify(store)); w.localStorage.setItem('gen2-last-build', JSON.stringify(build)); } });
    const offered = !!r.app.labelCopyOffer.pending; r.window.close(); return offered;
  };
  const old = JSON.parse(JSON.stringify(o)); old.copies.abcdefghij12.savedAt -= 31 * 24 * 3600 * 1000;
  assert.equal(tryWith(old, droppedBuild()), false, 'too old');
  assert.equal(tryWith(o, { ...droppedBuild(), buildId: 'anotherbuild' }), false, 'another build');
  assert.equal(tryWith(o, listedBuild()), false, 'it has its list');
  assert.equal(tryWith(o, droppedBuild()), true, 'control: the same copy and a dropped build ARE offered');
});

/* ------------------------------------------------------------------------------------------------ Sol 01a11481 */

test('RB-15: LOADING a build never replaces a copy this browser holds; a change made in this tab does', () => {
  const seed = boot({ build: listedBuild() });
  seed.app.state.labelList.labels.push({ id: 'labelz0099', text: 'Newest here' });
  seed.app.refresh(); seed.app.pushHistoryNow();
  const store = seed.window.localStorage.getItem('gen2-label-copies');
  seed.window.close();
  // another tab opens an OLDER labelled version of the same build (an old link): its load and its saves leave the copy alone
  const b = boot({ before: (w) => w.localStorage.setItem('gen2-label-copies', store) });
  assert.ok(b.app.applyBuild(plain(listedBuild()))); b.app.refresh(); b.app.pushHistoryNow();
  b.app.state.placed.find((u) => u.id === 6).label = ''; b.app.refresh(); b.app.pushHistoryNow();   // a layout-only edit
  assert.ok(copies(b.window).copies.abcdefghij12.list.labels.some((l) => l.id === 'labelz0099'), 'the newer copy is kept');
  b.app.state.labelList.labels.push({ id: 'labely0098', text: 'Changed in tab B' });
  b.app.refresh(); b.app.pushHistoryNow();
  assert.ok(copies(b.window).copies.abcdefghij12.list.labels.some((l) => l.id === 'labely0098'), 'a list change in this tab does write');
  b.window.close();
  // with no copy at all, a loaded list is written at the first save
  const c = boot({ build: listedBuild({ buildId: 'freshcopy012' }) });
  assert.ok(copies(c.window).copies.freshcopy012);
  c.window.close();
});

test('RB-16: Refresh now refuses when the kept build does not read back; Discard keeps the offer when the delete is refused', () => {
  const { app, window } = boot({ build: labelBuild(), hash: '#build=abc' });
  Object.defineProperty(window, 'sessionStorage', { value: { setItem() {}, getItem: () => null, removeItem() {} } });
  assert.equal(app.refreshKeepingBuild(), false, 'written but unreadable: nothing reloads');
  assert.equal(window.location.hash, '#build=abc');
  window.close();
  const seed = boot({ build: listedBuild() });
  const store = seed.window.localStorage.getItem('gen2-label-copies');
  seed.window.close();
  const b = boot({ before: (w) => { w.localStorage.setItem('gen2-label-copies', store); w.localStorage.setItem('gen2-last-build', JSON.stringify(droppedBuild())); } });
  assert.ok(b.app.labelCopyOffer.pending);
  // (assigning ls.setItem would only store an ITEM named "setItem": Storage's named-property setter - so wrap the object instead)
  const ls = b.window.localStorage;
  const refuse = (k) => { if (k === 'gen2-label-copies') throw new Error('SecurityError'); };
  Object.defineProperty(b.window, 'localStorage', { configurable: true, value: {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => { refuse(k); ls.setItem(k, v); },
    removeItem: (k) => { refuse(k); ls.removeItem(k); },
  } });
  assert.equal(b.app.discardLabelCopy(), false);
  assert.ok(b.app.labelCopyOffer.pending, 'the offer stays: the copy is still there');
  assert.match(b.app.tray.status, /could not be deleted/);
  b.window.close();
});

test('RB-17: a check whose request never answers is aborted, so the next check can run', async () => {
  const pending = [];
  const { app, window } = boot({ before: (w) => {
    w.fetch = (url, opts) => new Promise((resolve, reject) => {
      pending.push(url);
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  } });
  const timers = [];
  window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  window.clearTimeout = () => {};
  const run = app.checkDeploy(true);
  await flush();
  assert.equal(app.deploy.busy, true);
  const abortTimer = timers.find((t) => t.ms === 15000);
  assert.ok(abortTimer, 'each request carries a 15 s abort');
  abortTimer.fn();
  assert.equal(await run, 'error');
  assert.equal(app.deploy.busy, false, 'not wedged');
  window.close();
});

/* ------------------------------------------------------------------------------------------------ found 2026-10-07 */

test('RB-18: typing new words over a label in the drawer field keeps its UPLOADED icon (the mirror cannot carry it)', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
  const b = labelBuild({ labelList: { format: 'modulith-labels', version: 1, labels: [{ id: 'iconlabel001', text: 'Bolts', badge: { type: 'icon', svg } }] },
    labelAssign: { 1: 'iconlabel001' } }, [unit(1, 0, 0, { label: 'Bolts' }), unit(2, 1, 0)]);
  const { app, window } = boot({ build: b });
  app.state.selectedUnit = 1; app.refresh();
  const f = window.document.getElementById('ut-label');
  f.value = 'Bolts M5'; f.dispatchEvent(new window.Event('input'));
  app.pushHistoryNow();
  const l = app.state.labelList.labels.find((x) => x.id === app.state.labelAssign[1]);
  assert.equal(l.id, 'iconlabel001', 'edited in place');
  assert.equal(l.text, 'Bolts M5');
  assert.deepEqual(plain(l.badge), { type: 'icon', svg }, 'the artwork survives');
  window.close();
});

/* ------------------------------------------------------------------------------------------------ LABEL-LIST-FORMAT.md 3c */

function iconDrawer(badge, extra = {}) {
  const b = labelBuild({ labelList: { format: 'modulith-labels', version: 1, labels: [{ id: 'iconlabel001', text: 'Bolts', badge, ...extra }] },
    labelAssign: { 1: 'iconlabel001' } }, [unit(1, 0, 0, badge && badge.value ? { label: 'Bolts', labelBadge: badge } : { label: 'Bolts' }), unit(2, 1, 0)]);
  const r = boot({ build: b });
  r.app.state.selectedUnit = 1; r.app.refresh();
  const f = r.window.document.getElementById('ut-label');
  f.focus();
  const type = (v) => { f.value = v; f.dispatchEvent(new r.window.Event('input')); };
  const commit = () => f.dispatchEvent(new r.window.Event('change'));
  return { ...r, f, type, commit };
}
const labelOf = (app, unitId) => app.state.labelAssign && app.state.labelList && app.state.labelList.labels.find((l) => l.id === app.state.labelAssign[unitId]);

test('RB-19: clearing the words of a sole label with an icon HOLDS it while editing, then asks; OK keeps an icon-only label (one Undo step)', () => {
  const { app, window, type, commit } = iconDrawer({ type: 'icon', value: 'nut' });
  type('');
  app.pushHistoryNow();   // the 350 ms snapshot while the field is still empty
  assert.equal(app.iconHoldNow(), 1, 'held');
  assert.equal(labelOf(app, 1).text, 'Bolts', 'the label is not deleted while the field is being edited');
  const asked = [];
  window.confirm = (m) => { asked.push(m); return true; };
  const before = app.history.stack.length;
  commit();
  assert.equal(asked.length, 1);
  assert.match(asked[0], /Keep the icon on this drawer/);
  const l = labelOf(app, 1);
  assert.equal(l.id, 'iconlabel001');
  assert.equal(l.text, '', 'an icon-only label');
  assert.deepEqual(plain(l.badge), { type: 'icon', value: 'nut' });
  assert.equal(app.state.placed.find((u) => u.id === 1).label, undefined, 'the mirror has no words (an older tool cannot show an icon-only drawer)');
  assert.equal(app.history.stack.length, before + 1, 'one Undo step');
  app.pushHistoryNow();
  assert.equal(labelOf(app, 1).text, '', 'a later sync keeps it (icon-only labels survive an empty mirror)');
  window.close();
});

test('RB-20: Cancel removes the label as before; a label with no icon is removed without a question; retyping keeps the icon', () => {
  let r = iconDrawer({ type: 'icon', value: 'nut' });
  r.type(''); r.app.pushHistoryNow();
  r.window.confirm = () => false;
  r.commit();
  assert.equal(r.app.state.labelList, null, 'Cancel: the label (the only one) is gone');
  r.window.close();
  r = iconDrawer(null);
  let asked = 0;
  r.window.confirm = () => { asked++; return true; };
  r.type(''); r.commit();
  assert.equal(asked, 0, 'no icon: no question');
  assert.equal(r.app.state.labelList, null);
  r.window.close();
  r = iconDrawer({ type: 'icon', value: 'nut' });
  r.type(''); r.app.pushHistoryNow(); r.type('Bolts M5'); r.app.pushHistoryNow();
  assert.equal(r.app.iconHoldNow(), null, 'retyping releases the hold');
  assert.equal(labelOf(r.app, 1).text, 'Bolts M5');
  assert.deepEqual(plain(labelOf(r.app, 1).badge), { type: 'icon', value: 'nut' }, 'clear-and-retype keeps the icon');
  r.window.close();
});

test('RB-21: a shared or hardware label is never held (clearing only unassigns it, the icon stays with it in the tray)', () => {
  const b = labelBuild({ labelList: { format: 'modulith-labels', version: 1, labels: [{ id: 'sharedlab001', text: 'Bolts', badge: { type: 'icon', value: 'nut' } }] },
    labelAssign: { 1: 'sharedlab001', 2: 'sharedlab001' } }, [unit(1, 0, 0, { label: 'Bolts', labelBadge: { type: 'icon', value: 'nut' } }), unit(2, 1, 0, { label: 'Bolts', labelBadge: { type: 'icon', value: 'nut' } })]);
  const { app, window } = boot({ build: b });
  app.state.selectedUnit = 1; app.refresh();
  const f = window.document.getElementById('ut-label');
  f.focus(); f.value = ''; f.dispatchEvent(new window.Event('input'));
  assert.equal(app.iconHoldNow(), null);
  let asked = 0; window.confirm = () => { asked++; return true; };
  f.dispatchEvent(new window.Event('change'));
  assert.equal(asked, 0);
  assert.ok(app.state.labelList.labels.some((l) => l.id === 'sharedlab001'), 'the shared label stays (on drawer 2)');
  assert.equal(app.state.labelAssign[1], undefined);
  window.close();
});
