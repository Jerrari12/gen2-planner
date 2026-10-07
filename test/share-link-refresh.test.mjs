/* A #build= link stops claiming the board once the board changes (js/app.js forgetLink): a refresh reloads the CURRENT address,
   so a link left there after an edit reopened the link's build on F5 and silently dropped every edit since. Each "refresh" below
   is a second planner booted from the first one's CURRENT address and its localStorage, which is what F5 does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

const URL0 = 'http://localhost:8124/';
const enc = (b) => Buffer.from(JSON.stringify(b), 'utf8').toString('base64');
const LINKED = labelBuild({}, [unit(1, 0, 0, { label: 'Bolts' }), unit(2, 1, 0, { label: 'Nuts' })]);

function boot(url, storage) {
  const { app, window } = bootPlanner({ url, beforeApp: (w) => { for (const [k, v] of Object.entries(storage || {})) w.localStorage.setItem(k, v); } });
  window.confirm = () => true;
  window.open = () => null;
  return { app, window };
}
function storageOf(window) {
  const out = {};
  for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); out[k] = window.localStorage.getItem(k); }
  return out;
}
// F5: the same address the tab shows now, the same browser storage
const refresh = ({ window }) => boot(window.location.href, storageOf(window));
const labels = (app) => app.state.placed.map((u) => u.label || '').join(',');
function edit(app, label) {
  app.state.placed[0].label = label;
  app.refresh();
  app.pushHistoryNow();
}

test('SL-1: open a link, edit, refresh - the edits stay (they used to be replaced by the link\'s build)', () => {
  const a = boot(URL0 + '#build=' + enc(LINKED));
  assert.equal(labels(a.app), 'Bolts,Nuts', 'the link opened');
  assert.match(a.window.location.hash, /build=/, 'the link stays while the board is the link\'s build');
  edit(a.app, 'Screws');
  assert.doesNotMatch(a.window.location.hash, /build=/, 'the edit drops build= from the address');
  const b = refresh(a);
  assert.equal(labels(b.app), 'Screws,Nuts', 'the refreshed tab shows the edited build');
});

test('SL-2: an untouched link keeps its address, so a refresh reopens the same build', () => {
  const a = boot(URL0 + '#build=' + enc(LINKED));
  a.app.refresh(); a.app.pushHistoryNow();   // settling, selection and re-renders are not edits
  assert.match(a.window.location.hash, /build=/);
  const b = refresh(a);
  assert.equal(labels(b.app), 'Bolts,Nuts');
});

test('SL-3: other parts of the fragment are kept when build= is dropped', () => {
  const a = boot(URL0 + '#build=' + enc(LINKED) + '&keep=1');
  edit(a.app, 'Screws');
  assert.equal(a.window.location.hash, '#keep=1');
});

test('SL-4: a damaged link keeps its hash after an edit (its notice owns it)', () => {
  const a = boot(URL0 + '#build=not-a-build');
  assert.ok(a.window.document.getElementById('share-link-warn'), 'the damaged-link notice is up');
  assert.ok(a.app.applyBuild(plain(LINKED)));
  edit(a.app, 'Screws');
  assert.match(a.window.location.hash, /build=not-a-build/);
});

test('SL-5: a link opened into an open tab, then edited: dropped from the address too', () => {
  const a = boot(URL0);
  a.window.location.hash = '#build=' + enc(LINKED);
  a.window.dispatchEvent(new a.window.HashChangeEvent('hashchange'));
  assert.equal(labels(a.app), 'Bolts,Nuts');
  assert.match(a.window.location.hash, /build=/);
  edit(a.app, 'Screws');
  assert.doesNotMatch(a.window.location.hash, /build=/);
});

test('SL-6: undo back past the link load drops it too, and a refresh resumes the undone-to build', () => {
  const start = labelBuild({}, [unit(1, 0, 0, { label: 'Mine' })]);
  const a = boot(URL0);
  assert.ok(a.app.applyBuild(plain(start))); a.app.refresh(); a.app.pushHistoryNow();
  a.window.location.hash = '#build=' + enc(LINKED);
  a.window.dispatchEvent(new a.window.HashChangeEvent('hashchange'));
  assert.match(a.window.location.hash, /build=/);
  a.app.undoRedo(-1);
  assert.equal(labels(a.app), 'Mine');
  assert.doesNotMatch(a.window.location.hash, /build=/, 'the board is no longer the link\'s build');
  const b = refresh(a);
  assert.equal(labels(b.app), 'Mine', 'the refresh resumes the undone-to build');
});
