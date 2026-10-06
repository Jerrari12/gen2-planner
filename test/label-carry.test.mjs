/* THE LABEL LIST IS CARRIED, NEVER DROPPED (2026-10-06; handoffs/label-release/LABEL-LIST-FORMAT.md section 3a), on the real
   app.js in jsdom.

   A later planner keeps a build's labels as `labelList` + `labelAssign`. Sol 01a11238: an older planner that drops them on load
   and re-save loses, for good, every unassigned label, shared label, part record and text past 40 characters. So THIS planner
   carries both verbatim through every path a build travels - applyBuild (links, files, the session), serializeBuild (share
   link, save, auto-save), undo/redo - checks only their shape and size, and drops them only for a NEW build ("Surprise me",
   whose ids restart at 1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

// what a newer planner writes: a part label shared by two drawers, an unassigned label, an unknown future key
const LIST = {
  format: 'modulith-labels', version: 1,
  labels: [
    { id: 'k3f9w2m8q1zt', text: 'Coffee filters', badge: { type: 'icon', value: 'coffee-filter' } },
    { id: 'p0v7c4n2e6ry', text: 'M5 × 20 SOCKET HEAD CAP SCREW, A2 STAINLESS STEEL',
      part: { schema: 'part-record/1', family: 'screw', head: { status: 'listed', value: 'socket-cap' } },
      pins: ['thread.diameter', 'length.value'], copies: 2, future: { anything: [1, 2, 3] } },
    { id: 'u8n2b6x4c0qs', text: 'Spare', badge: { type: 'none' } },
  ],
};
const MIRROR = LIST.labels[1].text.slice(0, 40);   // the planner's 40-character cut of the part label's words
const ASSIGN = { 1: 'k3f9w2m8q1zt', 2: 'p0v7c4n2e6ry', 3: 'p0v7c4n2e6ry' };
const withList = (over = {}) => labelBuild({ gridH: 1, labelList: LIST, labelAssign: ASSIGN, ...over },
  [unit(1, 0, 0, { label: 'Coffee filters', labelBadge: { type: 'icon', value: 'coffee-filter' } }),
    unit(2, 1, 0, { label: MIRROR }), unit(3, 2, 0, { label: MIRROR })]);
function boot(build = withList()) {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  assert.ok(app.applyBuild(plain(build)));
  app.refresh();
  app.pushHistoryNow();
  return { app, window };
}

test('C-1: applyBuild -> serializeBuild carries labelList and labelAssign verbatim (deep-equal, unknown keys included)', () => {
  const { app, window } = boot();
  const out = plain(app.serializeBuild());
  assert.deepEqual(out.labelList, LIST);
  assert.deepEqual(out.labelAssign, plain(ASSIGN));
  assert.equal(out.placed[1].label, MIRROR, 'the mirror is untouched');
  window.close();
});

test('C-2: the share link round-trips them (encodeBuildHash -> applyBuildHash)', () => {
  const { app, window } = boot();
  const hash = app.encodeBuildHash();
  app.applyBuild(plain(labelBuild({ gridH: 1 }, [unit(1, 0, 0)])));        // something else in between
  assert.equal(app.state.labelList, null, 'a build without a list does not inherit the previous one');
  assert.ok(app.applyBuildHash(hash), 'the share link decodes');
  assert.deepEqual(plain(app.serializeBuild()).labelList, LIST);
  assert.deepEqual(plain(app.serializeBuild()).labelAssign, plain(ASSIGN));
  window.close();
});

test('C-3: undo and redo keep them, and editing a drawer\'s words here leaves the list alone (the newer planner reconciles)', () => {
  const { app, window } = boot();
  app.state.placed[0].label = 'Filters';      // an edit made in THIS planner: the mirror only
  app.refresh(); app.pushHistoryNow();
  app.undoRedo(-1);
  assert.equal(app.state.placed[0].label, 'Coffee filters');
  assert.deepEqual(plain(app.serializeBuild()).labelList, LIST);
  app.undoRedo(+1);
  assert.equal(app.state.placed[0].label, 'Filters');
  assert.deepEqual(plain(app.serializeBuild()).labelList, LIST, 'the list is carried, not edited');
  assert.deepEqual(plain(app.serializeBuild()).labelAssign, plain(ASSIGN));
  window.close();
});

test('C-4: the auto-save (the session) holds them', () => {
  const { app, window } = boot();
  const saved = JSON.parse(window.localStorage.getItem('gen2-last-build'));
  assert.deepEqual(saved.labelList, LIST);
  assert.deepEqual(saved.labelAssign, plain(ASSIGN));
  window.close();
});

test('C-5: removing every drawer ("Clear layout") keeps the list - the newer planner drops the stale assignments, not the labels', () => {
  const { app, window } = boot();
  app.state.placed = []; app.refresh();
  assert.deepEqual(plain(app.serializeBuild()).labelList, LIST);
  window.close();
});

test('C-6: "Surprise me" is a new build (ids restart at 1): the old list and assignments go with the old build', () => {
  const { app, window } = boot();
  app.surpriseMe();
  assert.equal(app.state.labelList, null);
  assert.equal(app.state.labelAssign, null);
  window.close();
});

test('C-7: only the shape is checked - wrong types and oversize data are dropped (null), never repaired', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  const c = (l, a) => plain(app.carryLabelData(l, a));
  assert.deepEqual(c(undefined, undefined), { labelList: null, labelAssign: null });
  assert.deepEqual(c([1, 2], 'x'), { labelList: null, labelAssign: null }, 'an array and a string are not plain objects');
  assert.deepEqual(c(LIST, null), { labelList: LIST, labelAssign: null }, 'each half is checked on its own');
  const big = { format: 'modulith-labels', version: 1, labels: [{ id: 'aaaaaaaa', text: 'x'.repeat(app.LABEL_DATA_MAX) }] };
  assert.deepEqual(c(big, ASSIGN), { labelList: null, labelAssign: null }, 'over the size bound: both dropped together');
  const copy = app.carryLabelData(LIST, ASSIGN);
  copy.labelList.labels[0].text = 'changed';
  assert.equal(LIST.labels[0].text, 'Coffee filters', 'a private copy: nothing shares a reference with the input');
  window.close();
});

test('C-8: a build with no list stays without one (both null), and its other fields are unchanged', () => {
  const plainBuild = labelBuild({ gridH: 1 }, [unit(1, 0, 0, { label: 'Nuts', labelBadge: { type: 'none' } })]);
  const { app, window } = boot(plainBuild);
  const out = plain(app.serializeBuild());
  assert.equal(out.labelList, null);
  assert.equal(out.labelAssign, null);
  assert.equal(out.placed[0].label, 'Nuts');
  assert.deepEqual(out.placed[0].labelBadge, { type: 'none' });
  window.close();
});
