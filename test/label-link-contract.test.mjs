/* PLANNER <-> EDGELABEL GENERATOR: THE LINK CONTRACT (STEP3-SPEC.md section 10.3).

   The two repos each hold a half of the same conversation and nothing else checks that they agree. This test runs BOTH halves
   in one process: the Planner's js/label-return.js (the job it sends, the return it parses, the merge) and the generator's
   label-link.js (what the generator does with the job and what it sends back), against each other.

   The generator's file is vendored at test/vendor/edgelabel-label-link.js and sha256-PINNED. A second test compares that copy
   byte-for-byte with a generator checkout when one can be found (GEN2_EDGELABEL_ROOT, or a sibling folder) and says which
   generator commit it compared; with no checkout it reports "not run" - a skip, never a pass.

   To move the pin: copy the generator's label-link.js here, run `sha256sum`, edit PIN below, and say why in the commit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { LR, cleaners, bootPlanner, labelBuild, unit, plain, root } from './lib/label-env.mjs';

const require = createRequire(import.meta.url);
const PIN = '087ae9f25f5969a3ea89665e105e366a494bbc04ebf8da61e1e9ee12381b4193';
const VENDORED = join(root, 'test', 'vendor', 'edgelabel-label-link.js');
const GL = require('./vendor/edgelabel-label-link.js');
require('./vendor/edgelabel-label-link.js');
const C = cleaners();
const ID = (c) => c.repeat(12);
const PLANNER_ORIGIN = 'https://' + readFileSync(join(root, 'CNAME'), 'utf8').trim();

/* the generator's icon library, so "unknown icon" is decided the way the generator decides it */
function generatorIconIds() {
  for (const p of generatorCandidates()) {
    const core = join(p, 'label-core.js');
    if (existsSync(core)) { require(core); return globalThis.GEN2EdgeLabelCore.create({ THREE: {} }).ICON_LIBRARY.map((i) => i.id); }
  }
  return null;
}
function generatorCandidates() {
  const c = [];
  if (process.env.GEN2_EDGELABEL_ROOT) c.push(resolve(process.env.GEN2_EDGELABEL_ROOT));
  for (const rel of ['../../EdgeLabel', '../../../GEN2 EdgeLabel Label Generator', '../GEN2 EdgeLabel Label Generator', '../../GEN2 EdgeLabel Label Generator', '../EdgeLabel'])
    c.push(resolve(root, rel));
  return c.filter((p) => existsSync(join(p, 'label-link.js')));
}
const ICONS = generatorIconIds() || ['nut', 'washer', 'screw-hex-socket', 'star'];   // a fixed list is fine for the shape tests; the unknown id below is not in any real library

/* ---------------------------------------------------------------- the pin */
test('C-pin: the vendored generator file is the pinned one', () => {
  const sha = createHash('sha256').update(readFileSync(VENDORED)).digest('hex');
  assert.equal(sha, PIN, 'test/vendor/edgelabel-label-link.js changed without moving the pin (or the pin is stale). Copy the generator\'s label-link.js over it on purpose, then update PIN.');
});

test('C-pin-2: the vendored copy equals the generator checkout\'s label-link.js, byte for byte', (t) => {
  const found = generatorCandidates();
  if (!found.length) { t.skip('NOT RUN: no generator checkout found (set GEN2_EDGELABEL_ROOT) - the byte-equality check did not happen'); return; }
  const gen = found[0];
  let rev = 'unknown commit';
  try { rev = execFileSync('git', ['-C', gen, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { /* not a git folder */ }
  console.log(`# compared with ${gen} @ ${rev}`);
  assert.equal(readFileSync(join(gen, 'label-link.js')).compare(readFileSync(VENDORED)), 0, `the vendored copy differs from ${gen} @ ${rev}`);
});

/* ---------------------------------------------------------------- one trip through both halves */
const U = (id, x, y, o = {}) => unit(id, x, y, o);
const ctxJob = (o = {}) => ({ origin: PLANNER_ORIGIN, textMax: 40, cleanText: C.cleanText, cleanBadge: C.cleanBadge, cleanStyle: C.cleanStyle, labelOrder: C.labelOrder, ...o });
const ctxMerge = (o = {}) => ({ loadId: ID('l'), textMax: 40, cleanText: C.cleanText, cleanBadge: C.cleanBadge, cleanStyle: C.cleanStyle, labelOrder: C.labelOrder, ...o });
const LOCAL = { servedFromLocalhost: PLANNER_ORIGIN.startsWith('http://localhost') };

/* Planner state -> job URL hash -> generator parse -> generator row snapshots. Returns everything the next hops need. */
function toGenerator(units, o = {}) {
  const view = { units: plain(units), faceStyle: 'edgelabel', labelStyle: o.labelStyle ?? null, buildId: 'abcdefghij12' };
  const job = LR.buildLabelJob(view, ctxJob());
  const words = C.labelOrder(view.units.filter((u) => u.fill === 'decor' && u.label)).map((u) => u.label);
  const url = LR.jobUrl('https://edgelabel.jerrari3d.com/', words, job);
  const hash = url.slice(url.indexOf('#'));
  const parsed = GL.parseJob(hash, { servedFromLocalhost: false });
  assert.equal(parsed.ok, true, 'the generator refused the planner\'s own job: ' + parsed.reason);
  const record = LR.makeJobRecord(view, job, { plannerTabId: ID('t'), loadId: ID('l'), cleanStyle: C.cleanStyle, now: 1 });
  const snaps = GL.jobToRows(parsed.job, ICONS);
  return { view, job, parsed: parsed.job, record, snaps, url, hash };
}
/* the generator's side of Send for an edited row list, then the planner's side of receiving it */
function roundTrip(g, snaps, style, ctx = {}) {
  const link = { job: g.parsed, baseRev: g.parsed.baseRev, baseline: { rows: g.parsed.rows.map((r) => ({ u: r.u, t: r.t, b: r.b })), style: g.parsed.style }, pending: null };
  const { msg } = GL.buildReturn(link, snaps, style, { iconIds: ICONS, newId: () => ID('x') });
  const wire = JSON.parse(JSON.stringify(msg));   // it crosses postMessage's structured clone; JSON stands in
  const parsed = LR.parseLabelReturn(wire);
  assert.equal(parsed.ok, true, 'the planner refused the generator\'s own return: ' + parsed.reason);
  return { msg, plan: LR.mergeLabelReturn(ctx.view || g.view, g.record, parsed.ret, ctxMerge(ctx.merge)), unsaved: GL.isUnsaved(link, snaps, style, { iconIds: ICONS }) };
}

const SEEDS = {
  'words with badges of every kind': [
    U(1, 0, 0, { label: 'Plain words' }),
    U(2, 1, 0, { label: 'No icon', labelBadge: { type: 'none' } }),
    U(3, 2, 0, { label: 'Letter', labelBadge: { type: 'char', value: 'M3' } }),
    U(4, 0, 2, { label: 'Icon', labelBadge: { type: 'icon', value: 'nut' } }),
    U(5, 1, 2, { label: 'Held icon', labelBadge: { type: 'icon', value: 'not-an-icon' } }),
    U(6, 2, 2)],
  'empty drawers only': [U(1, 0, 0), U(2, 1, 0), U(3, 2, 0)],
  'tricky text': [
    U(1, 0, 0, { label: 'A &amp; B' }), U(2, 1, 0, { label: 'say &#34;hi&#34;' }), U(3, 2, 0, { label: '<b>bold</b> & <i>' }),
    U(4, 0, 2, { label: 'Café 漢字 Ü' }), U(5, 1, 2, { label: 'x'.repeat(39) + '\ud83d' }), U(6, 2, 2, { label: ' padded ' })],
  'a classic drawer is not in the job': [U(1, 0, 0, { label: 'Decor' }), U(2, 1, 0, { fill: 'classic', label: 'Ignored' }), U(3, 2, 0)],
};
const STYLES = { 'null': null, 'partial': { capMm: 4.5 }, 'full': { capMm: 4, depth: 0.8, badgeSize: 12, bold: true, allCaps: false, predictIcons: false }, 'explicit defaults': { capMm: 5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true } };

test('C-1: an UNEDITED round trip lists ZERO changes - every seed, every style', () => {
  for (const [sname, units] of Object.entries(SEEDS)) {
    for (const [stname, st] of Object.entries(STYLES)) {
      const g = toGenerator(units, { labelStyle: st });
      const style = { ...g.parsed.style };
      const r = roundTrip(g, g.snaps, style);
      const where = `${sname} / style ${stname}`;
      assert.equal(r.plan.mode, 'normal', where);
      assert.deepEqual(plain(r.plan.rows), [], `${where}: the planner lists a change nobody made`);
      assert.deepEqual(plain(r.plan.style), [], `${where}: a style change nobody made`);
      assert.deepEqual(plain(r.plan.notSaved), [], where);
      assert.equal(r.unsaved.any, false, `${where}: the generator thinks there is unsaved work`);
    }
  }
});

test('C-1b: a HELD badge (an icon id this generator does not have) returns byte-for-byte and lists nothing', () => {
  const g = toGenerator(SEEDS['words with badges of every kind']);
  const held = g.snaps.find((s) => s.u === 5);
  assert.ok(held.held, 'the generator held the unknown icon rather than converting it to Auto');
  const r = roundTrip(g, g.snaps, g.parsed.style);
  assert.equal(r.msg.rows.find((x) => x.u === 5).b.value, 'not-an-icon');
  assert.equal(r.plan.rows.length, 0);
  // the mutant: a generator that converts it to Auto would REMOVE the planner's badge - the merge must show that as a change
  const mutated = g.snaps.map((s) => (s.u === 5 ? { ...s, held: null, manual: false } : s));
  const bad = roundTrip(g, mutated, g.parsed.style);
  assert.equal(bad.plan.rows.some((x) => x.u === 5 && x.field === 'badge'), true, 'an Auto conversion is visible as a badge change');
});

test('C-2: each kind of generator edit lands as exactly ONE change', () => {
  const g = toGenerator(SEEDS['words with badges of every kind']);
  const edit = (u, patch) => g.snaps.map((s) => (s.u === u ? { ...s, ...patch } : s));
  const one = (snaps, style, field, u) => {
    const r = roundTrip(g, snaps, style || g.parsed.style);
    const items = [...r.plan.rows, ...r.plan.style];
    assert.equal(items.length, 1, `${field}: ${JSON.stringify(plain(items.map((i) => [i.u, i.field, i.key])))}`);
    assert.equal(r.plan.rows.length ? r.plan.rows[0].field : 'style', field);
    if (u) assert.equal(items[0].u, u);
    assert.equal(items[0].class, 'change');
    return items[0];
  };
  assert.equal(one(edit(1, { text: 'Plain words!' }), null, 'text', 1).theirs, 'Plain words!');
  assert.deepEqual(plain(one(edit(1, { type: 'char', value: 'Q', manual: true }), null, 'badge', 1).theirs), { type: 'char', value: 'Q' });
  assert.deepEqual(plain(one(edit(2, { type: 'icon', value: 'nut', manual: true }), null, 'badge', 2).theirs), { type: 'icon', value: 'nut' });
  assert.equal(one(edit(3, { type: 'none', value: undefined, manual: true }), null, 'badge', 3).theirs.type, 'none');
  assert.equal(one(edit(4, { manual: false, type: 'none' }), null, 'badge', 4).theirs, null, 'back to Auto');
  assert.equal(one(g.snaps, { ...g.parsed.style, capMm: 4.5 }, 'style').theirs, 4.5);
  assert.equal(one(g.snaps, { ...g.parsed.style, bold: true }, 'style').key, 'bold');
  // clearing the words clears the badge with them: ONE change (the words), not two
  const cleared = edit(3, { text: '', manual: false, type: 'none', value: undefined });
  const r = roundTrip(g, cleared, g.parsed.style);
  assert.deepEqual(plain(r.plan.rows.map((x) => [x.u, x.field, x.theirs])), [[3, 'text', '']]);
  // removing a row with "don't print it" is NO change, never a clear
  const dropped = g.snaps.filter((s) => s.u !== 1);
  assert.equal(roundTrip(g, dropped, g.parsed.style).plan.rows.length, 0, 'mutant: a missing row treated as a clear');
  // an extra the user added is counted and listed, not applied
  const extra = [...g.snaps, { u: null, n: null, text: 'mine', type: 'none', value: undefined, svg: false, manual: false, held: null }];
  const re = roundTrip(g, extra, g.parsed.style);
  assert.equal(re.msg.extras, 1);
  assert.ok(re.plan.notApplied.some((n) => /1 extra label/.test(n.text)));
  assert.equal(re.plan.rows.length, 0);
});

test('C-2b: an icon-only label and a custom upload come back as `unsupplied` and change nothing', () => {
  const g = toGenerator(SEEDS['words with badges of every kind']);
  const snaps = g.snaps.map((s) => (s.u === 6 ? { ...s, type: 'char', value: 'Z', manual: true } : s.u === 4 ? { ...s, type: 'icon', value: undefined, svg: true, manual: true } : s));
  const r = roundTrip(g, snaps, g.parsed.style);
  assert.deepEqual(plain(r.msg.rows.find((x) => x.u === 6).b), { type: 'unsupplied', why: 'icon-only' });
  assert.deepEqual(plain(r.msg.rows.find((x) => x.u === 4).b), { type: 'unsupplied', why: 'custom' });
  assert.equal(r.plan.rows.length, 0);
  assert.equal(r.plan.notSaved.length, 1);
  assert.ok(r.plan.notApplied.some((n) => /custom uploaded icon/.test(n.text)));
});

test('C-2c: the generator adopts the planner\'s answer to an apply and ends with the planner\'s values (a full round trip)', () => {
  const g = toGenerator(SEEDS['words with badges of every kind']);
  const snaps = g.snaps.map((s) => (s.u === 1 ? { ...s, text: 'Plain words!' } : s.u === 3 ? { ...s, type: 'icon', value: 'nut', manual: true } : s));
  const r = roundTrip(g, snaps, { ...g.parsed.style, depth: 0.8 });
  // the planner applies everything ticked by default
  const after = { units: g.view.units.map((u) => ({ ...u })), labelStyle: null };
  const sel = LR.defaultSelections(r.plan);
  const out = LR.applyPlan(g.view, r.plan, sel, ctxMerge());
  for (const op of out.ops) { const u = after.units.find((x) => x.id === op.u); if (op.text) { if (op.text.set) u.label = op.text.set; else { delete u.label; delete u.labelBadge; } } if (op.badge) { if (op.badge.set) u.labelBadge = op.badge.set; else delete u.labelBadge; } }
  after.labelStyle = out.styleNext ?? null;
  const res = LR.resultRows(after, r.plan.jobUnits, out.decisions, ctxMerge());
  const answer = { gen2label: 'applied', v: 1, jobId: g.job.jobId, returnId: ID('x'), baseRev: ID('q'), rows: plain(res.rows), gone: res.gone, style: res.style, styleDecision: out.decisions.style, changes: out.applied };
  assert.ok(GL.parseAnswer(plain(answer)), 'the generator accepts the planner\'s answer');
  const link = { job: g.parsed, baseRev: g.parsed.baseRev, baseline: {}, pending: { returnId: ID('x'), payload: r.msg, state: 'reviewing' } };
  assert.equal(GL.onAnswer(link, plain(answer), null).effect, 'adopt');
  const adopted = GL.adoptApplied(link, snaps, plain(answer), ICONS);
  assert.equal(adopted.actions.find((a) => a.u === 1).text, 'Plain words!');
  assert.deepEqual(adopted.actions.find((a) => a.u === 3).badge, { mode: 'manual', type: 'icon', value: 'nut' });
  assert.equal(adopted.styleSet.depth, 0.8);
  assert.equal(adopted.baseRev, ID('q'));
  // and the NEXT unedited send lists nothing against the new baseline
  const snaps2 = snaps.slice();
  const g2 = { ...g, parsed: { ...g.parsed, baseRev: ID('q'), rows: adopted.baseline.rows.map((x, i) => ({ ...g.parsed.rows[i], ...x })), style: adopted.baseline.style },
    record: { ...g.record, baseRev: ID('q'), baseline: { rows: res.rows.map((x) => ({ u: x.u, g: x.g, t: x.t, b: x.b })), style: res.style, styleSet: after.labelStyle } }, view: { ...g.view, units: after.units, labelStyle: after.labelStyle } };
  const r2 = roundTrip(g2, snaps2, adopted.baseline.style);
  assert.deepEqual(plain(r2.plan.rows), []);
});

test('C-3: the origins match: the generator knows the Planner\'s production origin; the Planner knows the generator\'s', () => {
  assert.equal(PLANNER_ORIGIN, 'https://gen2planner.jerrari3d.com', 'the Planner\'s CNAME');
  assert.ok(GL.PLANNER_ORIGINS.includes(PLANNER_ORIGIN));
  const { app, window } = bootPlanner();
  const gen = app.GEN2.faceplateStyles.find((s) => s.id === 'edgelabel').labelGen;
  assert.ok(app.labelGenOrigins().includes(new URL(gen).origin), 'the planner allows the origin it opens: ' + gen);
  assert.ok(!app.labelGenOrigins().some((o) => /localhost|127\.0\.0\.1/.test(o)), 'production planner: no loopback origin');
  window.close();
});

test('C-4: the text limit is 40 on both sides and in the job', () => {
  assert.equal(GL.TEXT_MAX, 40);
  assert.equal(LR.TEXT_MAX, 40);
  assert.equal(C.cleanText('x'.repeat(50)).length, 40, 'the planner\'s own cleanLabelText cuts at 40 (LABEL_MAX)');
  const g = toGenerator([U(1, 0, 0, { label: 'x'.repeat(60) })]);
  assert.equal(g.job.textMax, 40);
  assert.equal(g.job.rows[0].t.length, 40);
  assert.ok(GL.TEXT_INPUT_MAX >= GL.TEXT_MAX);
});

test('C-5: the label-style defaults are one set: planner LABEL_DEFAULTS = generator STYLE_DEFAULTS (= label-core DEFAULTS, = the viewer\'s vendored copy when present)', () => {
  assert.deepEqual(plain(LR.LABEL_DEFAULTS), plain(GL.STYLE_DEFAULTS));
  assert.deepEqual(LR.STYLE_KEYS, GL.STYLE_KEYS);
  assert.deepEqual(LR.STYLE_FLAGS, GL.STYLE_FLAGS);
  // the planner's own limits (labelSpec) are the generator's input limits, so a value the generator can send the planner keeps
  assert.deepEqual(plain(C.GEN2.labelSpec.limits), plain(GL.STYLE_LIMITS));
  assert.deepEqual([...C.GEN2.labelSpec.flags].sort(), [...GL.STYLE_FLAGS].sort());
  const viewers = [process.env.GEN2_VIEWER_ROOT && resolve(process.env.GEN2_VIEWER_ROOT), resolve(root, '../GEN2 Visual Animator'), resolve(root, '../../GEN2 Visual Animator'), resolve(root, '../../../GEN2 Visual Animator'), resolve(root, '../../../GEN2 relay-auth/GEN2 Visual Animator')]
    .filter(Boolean).map((p) => join(p, 'viewer', 'js', 'vendor', 'edgelabel-core.js')).filter(existsSync);
  if (viewers.length) {
    delete globalThis.GEN2EdgeLabelCore;
    require(viewers[0]);
    const d = globalThis.GEN2EdgeLabelCore.create({ THREE: {} }).DEFAULTS;
    for (const k of GL.STYLE_KEYS) assert.equal(LR.LABEL_DEFAULTS[k], d[k], `${k} vs the viewer's vendored label-core (${viewers[0]})`);
  } else console.log('# viewer checkout not found: the viewer-side defaults comparison did not run');
});

test('C-6: every limit constant is equal in both files', () => {
  for (const k of ['JOB_ROWS_MAX', 'JOB_JSON_MAX', 'JOB_URL_MAX', 'RETURN_JSON_MAX']) {
    assert.ok(Number.isFinite(LR[k]) && Number.isFinite(GL[k]), k + ' missing');
    assert.equal(LR[k], GL[k], k);
  }
  assert.equal(LR.ID_MAX, 1e9);
});

test('C-7: the planner\'s job round-trips through the generator\'s decode to the SAME object', () => {
  for (const units of Object.values(SEEDS)) {
    const g = toGenerator(units);
    assert.equal(GL.canon(g.parsed), GL.canon(plain(g.job)));
  }
});

test('C-8: the legacy part of the URL is what an old generator still imports', () => {
  const g = toGenerator(SEEDS['tricky text']);
  const legacy = GL.importedLabelsFromHash(g.hash);
  const words = C.labelOrder(g.view.units.filter((u) => u.fill === 'decor' && u.label)).map((u) => u.label);
  assert.deepEqual(legacy, words, 'every word, a half surrogate pair included (JSON escapes it before the URL encoding sees it)');
  assert.ok(words.some((w) => w.charCodeAt(w.length - 1) === 0xd83d), 'the seed really contains a word cut in half through a surrogate pair');
});
