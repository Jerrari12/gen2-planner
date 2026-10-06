/* A BUILD NEWER THAN THIS PLANNER IS REFUSED, NEVER STRIPPED (label tool step 3, Astra 2026-10-06: "an older planner instance
   should not be able to overwrite a build containing newer label-list data and silently discard it. A refresh/reload
   requirement is preferable to data loss"), on the real app.js in jsdom.

   A build may carry `schema` (absent = 1). This planner understands BUILD_SCHEMA. A build saying more arrives by a share link, a
   saved file or the browser's saved session; on every path it is refused with a refresh prompt, the board is left as it was,
   and the saved-session slot holding it is never overwritten by this tab. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

const NEWER = (over = {}) => labelBuild({ gridH: 1, schema: 2, labelList: { format: 'modulith-labels', version: 2, labels: [] }, ...over },
  [unit(1, 0, 0, { label: 'From the future' })]);
const CURRENT = () => labelBuild({ gridH: 1 }, [unit(1, 0, 0, { label: 'Today' })]);
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const notice = (window) => window.document.getElementById('newer-build-warn');

test('S-1: applyBuild refuses a newer build, keeps the board, and says to refresh', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  assert.ok(app.applyBuild(plain(CURRENT())));
  const before = JSON.stringify(app.serializeBuild());
  assert.equal(app.applyBuild(plain(NEWER())), false);
  assert.equal(JSON.stringify(app.serializeBuild()), before, 'nothing on the board changed');
  assert.ok(notice(window), 'the refresh notice is shown');
  assert.match(notice(window).textContent, /newer version of the planner/);
  assert.match(notice(window).textContent, /Refresh this tab/);
  window.close();
});

test('S-2: what counts as newer - absent, 1 and the current schema open; 2, 0, -1, 1.5 and junk are refused', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  assert.equal(app.BUILD_SCHEMA, 1);
  for (const s of [undefined, null, 1]) assert.equal(app.buildTooNew({ placed: [], schema: s }), false, String(s));
  for (const s of [2, 99, 0, -1, 1.5, '1', 'x', {}]) assert.equal(app.buildTooNew({ placed: [], schema: s }), true, JSON.stringify(s));
  window.close();
});

test('S-3: a newer share link at boot is not opened, keeps its hash for the refresh, and blocks the session resume', () => {
  const { app, window } = bootPlanner({
    url: 'http://localhost:8124/#build=' + b64(NEWER()),
    beforeApp: (w) => w.localStorage.setItem('gen2-last-build', JSON.stringify(CURRENT())),
  });
  assert.equal(app.state.placed.length, 0, 'neither the newer build nor the saved session was opened');
  assert.ok(notice(window));
  assert.match(window.location.hash, /build=/, 'the link stays, so Refresh opens it');
  assert.equal(window.document.getElementById('share-link-warn'), null, 'it is not called damaged');
  window.close();
});

test('S-4: a newer build in the saved-session slot is not opened and NEVER overwritten by this tab', () => {
  const stored = JSON.stringify(NEWER());
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/', beforeApp: (w) => w.localStorage.setItem('gen2-last-build', stored) });
  assert.equal(app.sessionHoldsNewer(), true);
  assert.equal(app.state.placed.length, 0);
  assert.ok(notice(window));
  assert.match(notice(window).textContent, /won't overwrite your saved build/);
  // work in this tab: place a build, edit it, undo - the slot keeps the newer build
  assert.ok(app.applyBuild(plain(CURRENT())));
  app.state.placed[0].label = 'Edited'; app.refresh(); app.pushHistoryNow();
  app.undoRedo(-1);
  assert.equal(window.localStorage.getItem('gen2-last-build'), stored, 'the saved newer build is untouched');
  window.close();
});

test('S-5: a current build still auto-saves to the session slot (the guard is only for a newer one)', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  assert.equal(app.sessionHoldsNewer(), false);
  assert.ok(app.applyBuild(plain(CURRENT())));
  app.refresh(); app.pushHistoryNow();
  assert.equal(JSON.parse(window.localStorage.getItem('gen2-last-build')).placed[0].label, 'Today');
  window.close();
});

test('S-6: a newer link pasted into an open tab is refused the same way and does not replace the live build', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  assert.ok(app.applyBuild(plain(CURRENT())));
  app.refresh(); app.pushHistoryNow();
  window.location.hash = 'build=' + b64(NEWER());
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.equal(app.state.placed[0].label, 'Today', 'the live build is still on the board');
  assert.ok(notice(window));
  assert.equal(window.document.getElementById('share-link-warn'), null);
  window.close();
});

test('S-7: two tabs - a newer planner writes the saved-session slot AFTER this tab loaded; this tab\'s next auto-save leaves it', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  assert.ok(app.applyBuild(plain(CURRENT())));
  app.refresh(); app.pushHistoryNow();
  const newer = JSON.stringify(NEWER());
  window.localStorage.setItem('gen2-last-build', newer);        // the other, newer tab saves
  app.state.placed[0].label = 'Edited here'; app.refresh(); app.pushHistoryNow();
  app.undoRedo(-1);
  assert.equal(window.localStorage.getItem('gen2-last-build'), newer, 'this older tab did not overwrite the newer build');
  window.close();
});
