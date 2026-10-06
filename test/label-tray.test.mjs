/* THE LABEL TRAY (label tool step 3; MODULITH handoffs/label-release/step3/STEP3-PLAN.md section 3), on the real app.js in jsdom.

   Astra's test: create 12 M5 labels, assign them to 12 drawers, correct two assignments and undo the last operation, without
   opening 12 editors - and ordinary typed labels keep working throughout. Pinned here, before anything ships (Astra 2026-10-06):
   one Undo step per operation (atomic), id collisions on import, replay protection on a #labels-add= link, and that a build
   with no labels never gains a list. The real board tap is driven in the headed end-to-end test; here trayTap() is called with
   the unit the tap resolves to. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

const ITEM = (len) => ({ schema: 'part-picker-label-item/1', id: 'rec_m5x' + len, family: 'screw', head: 'socket-cap', units: 'mm',
  fields: ['M5', '× ' + len], value_missing: [],
  attributes: [{ path: 'head', text: 'SHCS', meaning: 'Socket head cap' }, { path: 'material.base', text: 'STEEL', meaning: 'Steel' }],
  pinned: ['head'], optional: ['material.base'] });
const LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50];
const BATCH = (over = {}) => ({ format: 'modulith-labels', version: 1, batchId: 'batch000m5set',
  labels: LENGTHS.map((n) => ({ text: `M5 × ${n} · SHCS`, hardware: ITEM(n) })), ...over });
// 12 decor drawers (4 x 3 of 1W-1H, ids 1-12 in reading order) + 2 more with typed labels (13, 14)
const TWELVE = () => labelBuild({ gridW: 4, gridH: 4 }, [
  ...Array.from({ length: 12 }, (_, i) => unit(i + 1, i % 4, Math.floor(i / 4) * 2)),
  unit(13, 0, 6, { label: 'Coffee filters', labelBadge: { type: 'icon', value: 'coffee-filter' } }), unit(14, 1, 6, { label: 'Spare fuses' })]);
const b64u = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

function boot(build = TWELVE(), opts = {}) {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' + (opts.hash || ''), beforeApp: opts.beforeApp });
  window.confirm = () => (opts.confirm === undefined ? true : opts.confirm);
  if (build) { assert.ok(app.applyBuild(plain(build))); app.refresh(); app.pushHistoryNow(); }
  return { app, window };
}
const U = (app, id) => app.state.placed.find((u) => u.id === id);
const steps = (app) => app.history.stack.length;
const labelOn = (app, id) => app.state.labelAssign && app.state.labelList.labels.find((l) => l.id === app.state.labelAssign[id]);
const tapAll = (app, ids) => { for (const id of ids) assert.ok(app.trayTap(U(app, id)), `drawer ${id} took the tap`); };

test('TR-1: a build with no labels never gains a list - opening, editing and saving it keep its exact shape', () => {
  const { app, window } = boot(labelBuild({ gridH: 1 }, [unit(1, 0, 0), unit(2, 1, 0, { label: 'Nuts' })]));
  U(app, 1).label = 'Bolts'; app.refresh(); app.pushHistoryNow();
  const out = plain(app.serializeBuild());
  assert.equal(out.labelList, null);
  assert.equal(out.labelAssign, null);
  assert.equal(window.document.getElementById('label-tray').hidden, false, 'the tray is offered (Add labels) on a build with decor drawers');
  assert.equal(window.document.getElementById('lt-list').children.length, 0);
  window.close();
});

test('TR-2: adding 12 labels appends them unassigned as ONE Undo step, converts the typed labels first, and picks the first', () => {
  const { app, window } = boot();
  const before = steps(app);
  assert.equal(app.importLabels(BATCH()), 'added');
  assert.equal(steps(app), before + 1, 'one history entry');
  const ls = app.state.labelList.labels;
  assert.equal(ls.length, 14, 'the 2 typed drawers became list labels, then the 12 were appended');
  assert.deepEqual(plain(ls.slice(0, 2).map((l) => l.text)), ['Coffee filters', 'Spare fuses']);
  assert.deepEqual(plain(Object.keys(app.state.labelAssign).sort()), ['13', '14'], 'only the typed drawers are assigned');
  assert.deepEqual(plain(ls[2].hardware), ITEM(6), 'the hardware item is kept verbatim');
  assert.equal(app.tray.pick, ls[2].id, 'the first new label is picked');
  assert.match(window.document.getElementById('lt-status').textContent, /Added 12 labels/);
  assert.equal(window.document.querySelectorAll('#lt-list .lt-chip').length, 12);
  app.undoRedo(-1);
  assert.equal(app.state.labelList, null, 'one Undo removes the whole import (and the list it created)');
  assert.equal(U(app, 13).label, 'Coffee filters', 'the typed labels are untouched');
  window.close();
});

test('TR-3: the 12-drawer run - 12 taps, no editor; correct two; undo the last; every operation exactly one Undo step', () => {
  const { app, window } = boot();
  app.importLabels(BATCH());
  const ids = app.state.labelList.labels.slice(2).map((l) => l.id);
  let n = steps(app);
  for (let k = 0; k < 12; k++) {
    assert.equal(app.tray.pick, ids[k], `the pick advanced to label ${k + 1}`);
    tapAll(app, [k + 1]);
    assert.equal(steps(app), ++n, `tap ${k + 1}: one history entry`);
  }
  assert.equal(app.tray.pick, null, 'nothing left to place');
  for (let k = 0; k < 12; k++) {
    assert.equal(app.state.labelAssign[k + 1], ids[k]);
    assert.equal(U(app, k + 1).label, `M5 × ${LENGTHS[k]} · SHCS`, 'the mirror is written');
    assert.equal(U(app, k + 1).labelBadge, undefined, 'no badge: older tools predict from the words');
  }
  assert.equal(app.state.selectedUnit, null, 'no drawer was selected - no editor opened');
  // correction 1: M5 x 10 (on drawer 3) belongs on drawer 4 -> replace asks, the label MOVES, M5 x 12 goes back to the tray
  let asked = [];
  window.confirm = (m) => { asked.push(m); return true; };
  app.setPick(ids[2]);
  tapAll(app, [4]);
  assert.equal(asked.length, 1);
  assert.match(asked[0], /Drawer 4 has “M5 × 12 · SHCS”\. Replace it with “M5 × 10 · SHCS”\?/);
  assert.equal(app.state.labelAssign[4], ids[2]);
  assert.equal(app.state.labelAssign[3], undefined, 'moved, not copied');
  assert.equal(U(app, 3).label, undefined);
  assert.equal(app.tray.pick, ids[3], 'the pick advanced to the displaced label');
  assert.equal(steps(app), ++n);
  // correction 2: put the displaced M5 x 12 on drawer 3
  tapAll(app, [3]);
  assert.equal(app.state.labelAssign[3], ids[3]);
  assert.equal(steps(app), ++n);
  const afterTwo = JSON.stringify(app.serializeBuild());
  // undo the last operation: exactly correction 2, nothing more
  app.undoRedo(-1);
  assert.equal(app.state.labelAssign[3], undefined, 'drawer 3 is empty again');
  assert.equal(app.state.labelAssign[4], ids[2], 'correction 1 stands');
  assert.equal(U(app, 3).label, undefined);
  assert.equal(app.state.labelList.labels.length, 14, 'no label lost or duplicated');
  app.undoRedo(+1);
  assert.equal(JSON.stringify(app.serializeBuild()), afterTwo, 'redo returns exactly');
  // the typed drawers kept their labels throughout
  assert.equal(U(app, 13).label, 'Coffee filters');
  assert.deepEqual(plain(U(app, 13).labelBadge), { type: 'icon', value: 'coffee-filter' });
  assert.equal(U(app, 14).label, 'Spare fuses');
  window.close();
});

test('TR-4: a declined replace changes nothing and records nothing; a tap on a non-decor unit only explains', () => {
  const b = TWELVE(); b.placed.push(unit(15, 2, 6, { fill: 'classic' }));
  const { app, window } = boot(b, { confirm: false });
  app.importLabels(BATCH());
  tapAll(app, [1]);
  const n = steps(app), snap = JSON.stringify(app.serializeBuild());
  app.setPick(app.state.labelList.labels[5].id);
  tapAll(app, [1]);
  assert.equal(steps(app), n, 'no history entry');
  assert.equal(JSON.stringify(app.serializeBuild()), snap, 'nothing changed');
  tapAll(app, [15]);
  assert.equal(steps(app), n);
  assert.match(window.document.getElementById('lt-status').textContent, /decor drawers, not on a classic/i);
  window.close();
});

test('TR-5: a #labels-add= link adds once - the fragment is cleared, and the same batch again (reload, second open) is refused', () => {
  const hash = '#labels-add=' + b64u(BATCH());
  const { app, window } = boot(null, { hash, beforeApp: (w) => w.localStorage.setItem('gen2-last-build', JSON.stringify(TWELVE())) });
  assert.equal(app.state.placed.length, 14, 'the session resumed - the labels join the open build, never replace it');
  assert.equal(app.state.labelList.labels.length, 14);
  assert.equal(window.location.hash, '', 'the fragment is cleared');
  // the same link opened again in this tab
  window.location.hash = hash.slice(1);
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.equal(app.state.labelList.labels.length, 14, 'not added twice');
  assert.match(window.document.getElementById('lt-status').textContent, /already added/);
  // and in a fresh tab (a reload): the batch id is remembered in this browser
  const saved = window.localStorage.getItem('gen2-label-batches');
  const again = boot(null, { hash, beforeApp: (w) => { w.localStorage.setItem('gen2-last-build', JSON.stringify(TWELVE())); w.localStorage.setItem('gen2-label-batches', saved); } });
  assert.equal(again.app.state.labelList, null, 'refused');
  again.window.close();
  window.close();
});

test('TR-6: ids never collide - an import whose ids the build already uses gets fresh ones; a file added twice makes copies', () => {
  const { app, window } = boot();
  const doc = BATCH({ batchId: undefined, labels: BATCH().labels.slice(0, 3).map((l, i) => ({ ...l, id: 'fixedid0000' + i })) });
  app.importLabels(doc);
  const first = app.state.labelList.labels.map((l) => l.id);
  assert.ok(first.includes('fixedid00000'), 'a free id is kept');
  app.importLabels(doc);
  const ids = app.state.labelList.labels.map((l) => l.id);
  assert.equal(ids.length, first.length + 3, 'copies, not an overwrite');
  assert.equal(new Set(ids).size, ids.length, 'no duplicate id');
  assert.match(window.document.getElementById('lt-status').textContent, /3 given new ids/);
  window.close();
});

test('TR-7: the labels survive a reload, a share link and a saved file - assignments, hardware items and the mirror', () => {
  const { app, window } = boot();
  app.importLabels(BATCH());
  tapAll(app, LENGTHS.map((_, k) => k + 1));
  const want = plain(app.serializeBuild());
  // the session (reload)
  const resumed = boot(null, { beforeApp: (w) => w.localStorage.setItem('gen2-last-build', window.localStorage.getItem('gen2-last-build')) });
  assert.deepEqual(plain(resumed.app.serializeBuild()).labelList, want.labelList);
  assert.deepEqual(plain(resumed.app.serializeBuild()).labelAssign, want.labelAssign);
  resumed.window.close();
  // the share link
  const hash = app.encodeBuildHash();
  const linked = boot(null, { hash: '#build=' + hash });
  const got = plain(linked.app.serializeBuild());
  assert.deepEqual(got.labelList, want.labelList);
  assert.deepEqual(got.labelAssign, want.labelAssign);
  assert.deepEqual(got.placed.map((u) => [u.id, u.label]), want.placed.map((u) => [u.id, u.label]));
  linked.window.close();
  // a saved file is serializeBuild as JSON: applyBuild reads it back the same way
  const filed = boot(JSON.parse(JSON.stringify(want)));
  assert.deepEqual(plain(filed.app.serializeBuild()).labelList, want.labelList);
  filed.window.close();
  window.close();
});

test('TR-8: the label job carries each hardware drawer\'s item (hw), and a drawer typed over since prints the words, not the old part', () => {
  const { app, window } = boot();
  app.importLabels(BATCH());
  tapAll(app, [1, 2]);
  let hw = app.hardwareByUnit();
  assert.deepEqual(plain(Object.keys(hw)), ['1', '2']);
  assert.deepEqual(plain(hw[1]), ITEM(6));
  const LR = window.GEN2LabelReturn;
  const job = LR.buildLabelJob({ units: app.state.placed, faceStyle: 'edgelabel', labelStyle: null, buildId: app.state.buildId, hardware: hw },
    { origin: 'http://localhost:8124', textMax: 40, cleanText: app.cleanLabelText, cleanBadge: app.cleanLabelBadge, cleanStyle: app.cleanLabelStyle, labelOrder: app.labelOrder });
  const row = (u) => job.rows.find((r) => r.u === u);
  assert.deepEqual(plain(row(1).hw), ITEM(6));
  assert.equal(row(1).t, 'M5 × 6 · SHCS');
  assert.equal(row(3).hw, undefined, 'an unlabelled drawer has none');
  assert.equal(row(13).hw, undefined, 'a typed label has none');
  U(app, 1).label = 'Something else';        // typed over, before any sync
  hw = app.hardwareByUnit();
  assert.equal(hw[1], undefined, 'the stale item is not sent');
  window.close();
});

test('TR-9: typing - over a hardware label makes a plain one (the part goes back to the tray); clearing a plain label deletes it', () => {
  const { app, window } = boot();
  app.importLabels(BATCH());
  tapAll(app, [1]);
  const hwId = app.state.labelAssign[1];
  const field = window.document.getElementById('ut-label');
  app.state.selectedUnit = 1; app.refresh();
  field.value = 'Mixed M5'; field.dispatchEvent(new window.Event('input'));
  field.dispatchEvent(new window.Event('change'));
  const now = labelOn(app, 1);
  assert.notEqual(now.id, hwId, 'a new label for this drawer');
  assert.equal(now.text, 'Mixed M5');
  assert.equal(now.hardware, undefined);
  const hwLabel = app.state.labelList.labels.find((l) => l.id === hwId);
  assert.deepEqual(plain(hwLabel.hardware), ITEM(6), 'the hardware label keeps its item');
  assert.ok(!Object.values(app.state.labelAssign).includes(hwId), 'and is back in the tray');
  const count = app.state.labelList.labels.length;
  field.value = ''; field.dispatchEvent(new window.Event('input')); field.dispatchEvent(new window.Event('change'));
  assert.equal(app.state.labelList.labels.length, count - 1, 'the plain label is deleted, not left in the tray');
  assert.equal(app.state.labelAssign[1], undefined);
  // and the typed drawer outside the batch: an edit in place
  const fuses = app.state.labelAssign[14];
  app.state.selectedUnit = 14; app.refresh();
  field.value = 'Fuses 5A'; field.dispatchEvent(new window.Event('input')); field.dispatchEvent(new window.Event('change'));
  assert.equal(app.state.labelAssign[14], fuses, 'the same label');
  assert.equal(labelOn(app, 14).text, 'Fuses 5A');
  window.close();
});

test('TR-10: Unassign puts a drawer\'s label back in the tray; × removes a tray label; the last label gone drops the list', () => {
  const { app, window } = boot(labelBuild({ gridH: 1 }, [unit(1, 0, 0), unit(2, 1, 0)]));
  app.importLabels(BATCH({ labels: BATCH().labels.slice(0, 1) }));
  tapAll(app, [1]);
  const id = app.state.labelAssign[1];
  app.state.selectedUnit = 1; app.refresh();
  const btn = window.document.getElementById('ut-unassign');
  assert.equal(btn.hidden, false);
  const n = steps(app);
  btn.click();
  assert.equal(steps(app), n + 1);
  assert.equal(app.state.labelAssign[1], undefined);
  assert.equal(U(app, 1).label, undefined, 'the mirror is cleared');
  assert.ok(app.state.labelList.labels.some((l) => l.id === id), 'the label stays, in the tray');
  window.document.querySelector(`[data-remove="${id}"]`).click();
  assert.equal(app.state.labelList, null, 'no labels left: the build has no list again');
  assert.equal(app.state.labelAssign, null);
  window.close();
});

test('TR-11: while the newer-build notice is up, added labels are refused and the link is kept for after the refresh', () => {
  const newer = labelBuild({ gridH: 1, schema: 2 }, [unit(1, 0, 0)]);
  const hash = '#labels-add=' + b64u(BATCH());
  const { app, window } = boot(null, { hash, beforeApp: (w) => w.localStorage.setItem('gen2-last-build', JSON.stringify(newer)) });
  assert.equal(app.state.labelList, null);
  assert.match(window.location.hash, /labels-add=/, 'kept: the refreshed tab adds them');
  assert.equal(window.localStorage.getItem('gen2-label-batches'), null, 'not remembered as added');
  window.close();
});

test('TR-12: a Part Picker label-items file adds hardware labels whose words are the value and the pinned attributes', () => {
  const { app, window } = boot();
  assert.equal(app.itemWords(ITEM(20)), 'M5 × 20 · SHCS', 'pinned SHCS prints; optional STEEL is up to the layout');
  app.importLabels({ schema: 'part-picker-label-items/1', items: [ITEM(20), { ...ITEM(25), fields: [], value_missing: ['length'] }] });
  const ls = app.state.labelList.labels.slice(2);
  assert.deepEqual(plain(ls.map((l) => l.text)), ['M5 × 20 · SHCS', 'SHCS']);
  assert.ok(ls.every((l) => l.hardware));
  const tags = [...window.document.querySelectorAll('#lt-list .lt-tag')].map((t) => t.textContent);
  assert.deepEqual(tags, ['hardware', 'not ready']);
  // and something that is not a labels file is refused in words
  assert.equal(app.importLabels({ hello: 1 }), 'bad');
  assert.match(window.document.getElementById('lt-status').textContent, /not a labels file/);
  window.close();
});

test('TR-13: without js/label-list.js (a harness that evals the planner by name) the planner boots, refreshes and offers no tray', () => {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/', beforeApp: (w) => { Object.defineProperty(w, 'GEN2LabelList', { get: () => undefined, set: () => {}, configurable: true }); } });
  assert.ok(app.applyBuild(plain(TWELVE())));
  app.refresh();
  assert.equal(window.document.getElementById('label-tray').hidden, true);
  assert.equal(app.syncLabels(), false);
  window.close();
});

test('TR-14: a change still waiting to become its own Undo step (the 350 ms coalescer) is not swept into the tray operation', () => {
  const { app, window } = boot();
  app.importLabels(BATCH());
  U(app, 14).x = 2; app.refresh();               // moved, not yet in history (the coalesced snapshot is pending)
  app.trayTap(U(app, 1));
  app.undoRedo(-1);
  assert.equal(app.state.labelAssign[1], undefined, 'the undo took back the tap');
  assert.equal(U(app, 14).x, 2, 'and only the tap: the move is its own step');
  app.undoRedo(-1);
  assert.equal(U(app, 14).x, 1, 'the next undo takes back the move');
  window.close();
});

/* THE APPEARANCE INVARIANT (STEP3-PLAN section 5; spec section 3), now that this planner reconciles on load: across 300 seeded
   hostile builds - lists that agree with the drawers, lists an older tool has edited past (words typed over, cleared, a drawer
   removed), shared labels, icon-only labels, unassigned hardware labels - loading a build NEVER changes what a drawer shows
   (the mirror equals what the sanitizer alone reads), every worded drawer ends on a label whose mirror is exactly its words,
   no hardware item is altered or lost, and a second load changes nothing. */
const seeded = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
test('TR-15: 300 hostile builds with lists - loading never changes a drawer, hardware items survive, a second load is a no-op', () => {
  const { app, window } = boot(null);
  const L = window.GEN2LabelList;
  const r = seeded(61007);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const TEXTS = ['Nuts', '  Nuts  ', '', '   ', 'x'.repeat(60), 'M5 × 20 · SHCS', 'tab\tinside', 42, null];
  const BADGES = [undefined, null, { type: 'none' }, { type: 'icon', value: 'nut' }, { type: 'icon', value: 'Nut' }, { type: 'char', value: 'A' }, { type: 'char', value: 'ABCDE' }, {}];
  const mirrorOf = (placed) => placed.map((u) => [u.id, u.label === undefined ? null : u.label, u.labelBadge === undefined ? null : u.labelBadge]);
  let hwSeen = 0, edits = 0;
  for (let k = 0; k < 300; k++) {
    const units = [];
    for (let y = 0; y < 4; y += 2) for (let x = 0; x < 3; x++) {
      const o = {};
      if (r() < 0.75) o.label = pick(TEXTS);
      if (r() < 0.6) o.labelBadge = pick(BADGES);
      units.push(unit(units.length + 1, x, y, o));
    }
    assert.ok(app.applyBuild(plain(labelBuild({}, units))));
    // a list made from those drawers, then disturbed the way older tools and other planners disturb one
    const conv = L.fromLegacyUnits(plain(app.state.placed));
    const list = conv.list, assign = { ...conv.assignments };
    const hwIn = [];
    if (r() < 0.6) { const l = { id: 'hw' + String(k).padStart(8, '0'), text: 'M5 × ' + k + ' · SHCS', hardware: ITEM(k) }; list.labels.push(l); hwIn.push(l); if (r() < 0.5) assign[String(1 + Math.floor(r() * 6))] = l.id; }
    if (r() < 0.3) list.labels.push({ id: 'icon' + String(k).padStart(8, '0'), text: '', badge: { type: 'icon', value: 'nut' } });
    if (r() < 0.3) { const ids = Object.values(assign); if (ids.length) assign[String(1 + Math.floor(r() * 6))] = pick(ids); }   // shared
    if (r() < 0.2) assign['99'] = Object.values(assign)[0] || 'missing00000';                                               // a removed drawer
    const placed = plain(app.state.placed);
    // the mirror an older tool then edits (that tool's own sanitizer rules: words cleaned, a badge only with words)
    const tool = placed.map((u) => { const v = { ...u }; if (r() < 0.25) { edits++; const t = app.cleanLabelText(pick(TEXTS)); if (t) v.label = t; else { delete v.label; delete v.labelBadge; } } return v; });
    const toolBuild = labelBuild({ labelList: list, labelAssign: assign }, tool);
    assert.ok(app.applyBuild(plain(labelBuild({}, tool))));
    const want = mirrorOf(plain(app.state.placed));            // what that build shows, read without its list
    assert.ok(app.applyBuild(plain(toolBuild)), `build ${k} loads`);
    app.refresh(); app.pushHistoryNow();
    const got = plain(app.serializeBuild());
    assert.deepEqual(mirrorOf(got.placed), want, `build ${k}: loading changed what a drawer shows`);
    if (got.labelList) {
      const byId = new Map(got.labelList.labels.map((l) => [l.id, l]));
      for (const u of got.placed) {
        const id = got.labelAssign[u.id];
        if (u.label) assert.ok(id && L.mirrorOfLabel(byId.get(id)).label === u.label, `build ${k}: drawer ${u.id} is not on a label with its words`);
      }
      for (const h of hwIn) { hwSeen++; assert.deepEqual(byId.get(h.id) && byId.get(h.id).hardware, h.hardware, `build ${k}: a hardware item changed or went`); }
    }
    assert.ok(app.applyBuild(plain(got))); app.refresh();
    assert.equal(JSON.stringify(plain(app.serializeBuild())), JSON.stringify(got), `build ${k}: a second load changed something`);
  }
  assert.ok(hwSeen > 100 && edits > 200, `the sweep exercised hardware labels (${hwSeen}) and older-tool edits (${edits})`);
  window.close();
});
