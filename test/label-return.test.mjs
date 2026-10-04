/* THE EDGELABEL RETURN - the Planner's pure rules (js/label-return.js), executed with the Planner's OWN cleaners.
   Test ids (P-unit, P-merge) are the ones STEP3-SPEC.md section 10.2 names. Nothing here matches source text.

   The merge is the heart of step 3: what comes back from the generator is proposed, never trusted. A drawer's WORDS and its
   BADGE merge as separate fields against a stored baseline (what the Planner sent), and anything the Planner cannot vouch
   for - a reload, an older version of the build, a drawer that moved - is listed for a human to check, never pre-ticked. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LR, cleaners, bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

const C = cleaners();
const ID = (c) => c.repeat(12);
const jobCtx = (o = {}) => ({ origin: 'https://gen2planner.jerrari3d.com', textMax: 40, jobId: ID('j'), baseRev: ID('r'), cleanText: C.cleanText, cleanBadge: C.cleanBadge, cleanStyle: C.cleanStyle, labelOrder: C.labelOrder, ...o });
const mergeCtx = (o = {}) => ({ loadId: ID('l'), textMax: 40, cleanText: C.cleanText, cleanBadge: C.cleanBadge, cleanStyle: C.cleanStyle, labelOrder: C.labelOrder, ...o });
const view = (units, o = {}) => ({ units: plain(units), faceStyle: 'edgelabel', labelStyle: null, buildId: 'abcdefghij12', ...o });

/* the Planner's state at job time -> job + record; then `ret(...)` plays the generator */
function setup(units, o = {}) {
  const v = view(units, o);
  const job = LR.buildLabelJob(v, jobCtx());
  const record = LR.makeJobRecord(v, job, { plannerTabId: ID('t'), loadId: ID('l'), cleanStyle: C.cleanStyle, now: 1000 });
  return { v, job, record };
}
/* an unedited return, then the edits: rows = { u: { t?, b? } } */
function ret(job, edits = {}, o = {}) {
  const rows = job.rows.map((r) => ({ u: r.u, t: r.t, b: r.b, ...(edits[r.u] || {}) }));
  return { gen2label: 'return', v: 1, family: 'edgelabel', jobId: job.jobId, buildId: job.buildId, baseRev: job.baseRev, returnId: ID('x'), rows, style: { ...job.style }, extras: 0, ...o };
}
const U = (id, x, y, o = {}) => unit(id, x, y, o);
const three = (o = {}) => [U(1, 0, 0, { label: 'One', ...(o[1] || {}) }), U(2, 1, 0, { label: 'Two', ...(o[2] || {}) }), U(3, 2, 0, { ...(o[3] || {}) })];
const merge = (s, r, o = {}) => LR.mergeLabelReturn(o.view || s.v, o.record === undefined ? s.record : o.record, r, mergeCtx(o.ctx));
const find = (plan, u, field) => plan.rows.find((r) => r.u === u && r.field === field);

/* ---------------------------------------------------------------- P-unit */
test('P-unit-1: the job lists EVERY decor drawer in labelOrder with n and g, Classic excluded; the style is EFFECTIVE', () => {
  const units = [U(1, 2, 2, { label: 'Late' }), U(2, 0, 0, { label: 'First', labelBadge: { type: 'char', value: 'A' } }), U(3, 1, 0), U(4, 0, 2, { fill: 'classic' }), U(5, 1, 2, { label: 'Second row' })];
  const job = LR.buildLabelJob(view(units, { labelStyle: { capMm: 4.5 } }), jobCtx());
  assert.deepEqual(plain(job.rows), [
    { u: 2, n: 1, g: [0, 0, 1, 2], t: 'First', b: { type: 'char', value: 'A' } },
    { u: 3, n: 2, g: [1, 0, 1, 2], t: '', b: null },
    { u: 5, n: 3, g: [1, 2, 1, 2], t: 'Second row', b: null },
    { u: 1, n: 4, g: [2, 2, 1, 2], t: 'Late', b: null }]);
  assert.deepEqual(plain(job.style), { capMm: 4.5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true });
  assert.deepEqual([job.v, job.family, job.buildId, job.textMax, job.origin], [1, 'edgelabel', 'abcdefghij12', 40, 'https://gen2planner.jerrari3d.com']);
  assert.ok(/^[a-z0-9]{12}$/.test(job.jobId) && /^[a-z0-9]{12}$/.test(job.baseRev));
});

test('P-unit-2: a badge is carried only on a drawer WITH words, cleaned', () => {
  const job = LR.buildLabelJob(view([U(1, 0, 0, { label: 'x', labelBadge: { type: 'icon', value: 'nut' } }), U(2, 1, 0, { labelBadge: { type: 'icon', value: 'nut' } })]), jobCtx());
  assert.deepEqual(plain(job.rows.map((r) => r.b)), [{ type: 'icon', value: 'nut' }, null]);
});

test('P-unit-3: the legacy part comes FIRST and is byte-identical to today\'s updateLabelGenLink value; no words -> #job= alone', () => {
  const { window, app } = bootPlanner();
  app.state.mount = 'tabletop'; app.state.length = 185; app.state.faceStyle = 'edgelabel';
  assert.ok(app.applyBuild(labelBuild({}, [U(1, 0, 0, { label: 'Zip Ties & Clips' }), U(2, 1, 0, { label: 'M3 Screws' }), U(3, 2, 0)])));
  app.refresh();
  const href = window.document.getElementById('label-gen-link').href;
  const words = C.labelOrder(app.state.placed.filter((p) => p.fill === 'decor' && p.label)).map((p) => p.label);
  const job = LR.buildLabelJob({ units: plain(app.state.placed), faceStyle: 'edgelabel', labelStyle: null, buildId: app.state.buildId }, jobCtx());
  const base = href.split('#')[0];
  const url = LR.jobUrl(base, words, job);
  assert.ok(url.startsWith(href + '&job='), 'the legacy link is the prefix, unchanged\n' + href + '\n' + url.slice(0, href.length + 10));
  assert.ok(href.includes('#labels='));
  const none = LR.jobUrl('https://x.example/', [], job);
  assert.ok(none.startsWith('https://x.example/#job='), 'no words: the job alone, no `labels=`');
  window.close();
});

test('P-unit-4: the job is UNPADDED base64url of the UTF-8 JSON (no `=`, `+` or `/`), so an old generator\'s labels= regex stops at the `&`', () => {
  const job = LR.buildLabelJob(view([U(1, 0, 0, { label: 'A é漢 &amp; <b>' })]), jobCtx());
  const enc = LR.encodeJob(job);
  assert.ok(!/[=+/]/.test(enc));
  // padding depends on the byte length (mod 3): try jobs of every residue, and prove the sweep really contains padded standard base64
  let padded = 0;
  for (let n = 1; n <= 6; n++) {
    const j = LR.buildLabelJob(view([U(1, 0, 0, { label: 'x'.repeat(n) })]), jobCtx());
    const e = LR.encodeJob(j);
    assert.ok(!/[=+/]/.test(e), 'padded or unsafe base64url at label length ' + n);
    if (/=$/.test(Buffer.from(JSON.stringify(j)).toString('base64'))) padded++;
    assert.deepEqual(JSON.parse(Buffer.from(e, 'base64url').toString('utf8')), plain(j));
  }
  assert.ok(padded >= 2, 'the fixtures never needed padding, so they cannot catch a padded encoder');
  const url = LR.jobUrl('https://g.example/', ['x'], job);
  const legacy = url.match(/labels=([^&]+)/)[1];
  assert.deepEqual(JSON.parse(decodeURIComponent(escape(atob(legacy)))), ['x'], 'the old regex reads only the legacy value');
  assert.ok(!legacy.includes('job'), 'the job is not inside the legacy capture');
  assert.deepEqual(JSON.parse(Buffer.from(enc, 'base64url').toString('utf8')), plain(job));
  // a padded value would break the old regex's `[^&]+` capture of `labels=` only if it contained & - it must never contain `=` either
  assert.equal(LR.legacyHash([]), '');
});

test('P-unit-5: the WORST CASE (288 drawers x 40 CJK characters x 40-char icon ids) is under every limit', () => {
  const t = '漢'.repeat(40);
  const icon = 'a'.repeat(19) + '-' + 'b'.repeat(20);
  const units = Array.from({ length: 288 }, (_, i) => U(i + 1, i % 12, (i % 24), { label: t, labelBadge: { type: 'icon', value: icon } }));
  const job = LR.buildLabelJob(view(units), jobCtx());
  const words = C.labelOrder(units).map((u) => u.label);
  const url = LR.jobUrl('https://edgelabel.jerrari3d.com/', words, job);
  const m = LR.measureJob(job, url);
  assert.equal(m.ok, true, JSON.stringify(m));
  assert.deepEqual([m.rows, m.jsonBytes < LR.JOB_JSON_MAX, m.urlChars < LR.JOB_URL_MAX], [288, true, true]);
  assert.ok(m.urlChars > 100000, 'a measured size, not a guess: ' + m.urlChars);
});

test('P-unit-6: an over-limit build is REPORTED with its size, before anything opens', () => {
  const t = '漢'.repeat(40);
  const units = Array.from({ length: 288 }, (_, i) => U(i + 1, i % 12, i % 24, { label: t }));
  const job = LR.buildLabelJob(view(units), jobCtx());
  const m = LR.measureJob(job, 'x'.repeat(LR.JOB_URL_MAX + 1));
  assert.deepEqual([m.ok, m.reason], [false, 'url']);
  assert.ok(m.urlChars > LR.JOB_URL_MAX);
  const many = { ...job, rows: Array.from({ length: LR.JOB_ROWS_MAX + 1 }, () => job.rows[0]) };
  assert.equal(LR.measureJob(many, 'x').reason, 'rows');
  const fat = { ...job, pad: 'x'.repeat(LR.JOB_JSON_MAX + 1) };
  assert.equal(LR.measureJob(fat, 'x').reason, 'json');
});

test('P-unit-7: parseLabelReturn: every refusal, and the shape it accepts', () => {
  const s = setup(three());
  const ok = ret(s.job);
  assert.equal(LR.parseLabelReturn(ok).ok, true);
  const bad = (o, reason = 'malformed') => assert.deepEqual(LR.parseLabelReturn(o), { ok: false, reason }, JSON.stringify(o).slice(0, 90));
  bad(null); bad('x'); bad([]); bad({ ...ok, v: 2 });
  bad({ ...ok, family: 'classicpro' }, 'wrong-family');
  for (const k of ['jobId', 'buildId', 'baseRev', 'returnId']) { bad({ ...ok, [k]: 'short' }); bad({ ...ok, [k]: 5 }); bad({ ...ok, [k]: 'UPPERCASE1234' }); }
  bad({ ...ok, rows: 'x' });
  bad({ ...ok, rows: Array.from({ length: 401 }, (_, i) => ({ u: i + 1, t: '', b: null })) });
  bad({ ...ok, rows: [{ u: 1, t: '', b: null }, { u: 1, t: '', b: null }] });
  for (const u of [0, -1, 1.5, '1', 1e9 + 1, null]) bad({ ...ok, rows: [{ u, t: '', b: null }] });
  bad({ ...ok, rows: [{ u: 1, t: 'x'.repeat(201), b: null }] });
  bad({ ...ok, rows: [{ u: 1, t: 5, b: null }] });
  bad({ ...ok, rows: [{ u: 1, t: 'x', b: 'nope' }] });
  bad({ ...ok, rows: [{ u: 1, t: 'x', b: [1] }] });
  bad({ ...ok, style: 'x' });
  for (const extras of [-1, 1.5, '1', 10001, undefined]) bad({ ...ok, extras });
  assert.equal(LR.parseLabelReturn({ ...ok, extras: 10000 }).ok, true);
  const huge = { ...ok, rows: [{ u: 1, t: 'x', b: null }], pad: 'x'.repeat(LR.RETURN_JSON_MAX + 1) };
  bad(huge);
  // a worst-case honest return is accepted
  const big = { ...ok, rows: Array.from({ length: 288 }, (_, i) => ({ u: i + 1, t: '漢'.repeat(40), b: { type: 'icon', value: 'a'.repeat(19) + '-' + 'b'.repeat(20) } })) };
  assert.equal(LR.parseLabelReturn(big).ok, true);
});

/* ---------------------------------------------------------------- P-merge: the section 6.4 table */
test('P-merge-1: theirs == base -> unchanged: not listed (the generator did not touch it)', () => {
  const s = setup(three());
  const plan = merge(s, ret(s.job));
  assert.equal(plan.rows.length + plan.style.length, 0);
  assert.equal(plan.mode, 'normal');
});

test('P-merge-2: theirs == mine -> already the same: not listed (both sides made the same edit)', () => {
  const s = setup(three());
  const mine = view(three({ 1: { label: 'One!' } }));
  const plan = merge(s, ret(s.job, { 1: { t: 'One!' } }), { view: mine });
  assert.equal(plan.rows.length, 0);
});

test('P-merge-3: mine == base -> a CHANGE, ticked by default', () => {
  const s = setup(three());
  const plan = merge(s, ret(s.job, { 1: { t: 'One!' } }));
  const r = find(plan, 1, 'text');
  assert.deepEqual([r.class, r.base, r.mine, r.theirs, r.n, r.pos], ['change', 'One', 'One', 'One!', 1, 'row 1, column 1']);
  assert.equal(LR.defaultSelections(plan)['1:text'], true);
});

test('P-merge-4: mine != base and theirs != mine -> a CONFLICT, default Keep the planner\'s; never ticked toward the generator', () => {
  const s = setup(three());
  const mine = view(three({ 1: { label: 'Planner edit' } }));
  const plan = merge(s, ret(s.job, { 1: { t: 'Generator edit' } }), { view: mine });
  const r = find(plan, 1, 'text');
  assert.deepEqual([r.class, r.base, r.mine, r.theirs], ['conflict', 'One', 'Planner edit', 'Generator edit']);
  assert.equal(LR.defaultSelections(plan)['1:text'], 'planner');
});

test('P-merge-5: a drawer missing from the build is skipped and listed under Not applied', () => {
  const s = setup(three());
  const plan = merge(s, ret(s.job, { 2: { t: 'Two!' } }), { view: view([U(1, 0, 0, { label: 'One' }), U(3, 2, 0)]) });
  assert.equal(plan.rows.length, 0);
  assert.ok(plan.notApplied.some((n) => n.u === 2 && /no longer in the build/.test(n.text)), JSON.stringify(plan.notApplied));
});

test('P-merge-6: a drawer that is no longer decor is skipped: "now a Classic drawer - no label slot"', () => {
  const s = setup(three());
  const plan = merge(s, ret(s.job, { 2: { t: 'Two!' } }), { view: view([U(1, 0, 0, { label: 'One' }), U(2, 1, 0, { fill: 'classic' }), U(3, 2, 0)]) });
  assert.equal(plan.rows.length, 0);
  assert.ok(plan.notApplied.some((n) => /Classic drawer - it has no label slot/.test(n.text)));
});

test('P-merge-7: words and badge merge as SEPARATE fields', () => {
  const s = setup(three({ 1: { labelBadge: { type: 'char', value: 'A' } } }));
  // generator changed ONLY the badge; the planner changed ONLY the words: two independent, non-conflicting results
  const mine = view(three({ 1: { label: 'One planner', labelBadge: { type: 'char', value: 'A' } } }));
  const plan = merge(s, ret(s.job, { 1: { b: { type: 'char', value: 'B' } } }), { view: mine });
  assert.equal(find(plan, 1, 'text'), undefined, 'the generator did not touch the words');
  const b = find(plan, 1, 'badge');
  assert.deepEqual([b.class, plain(b.base), plain(b.mine), plain(b.theirs)], ['change', { type: 'char', value: 'A' }, { type: 'char', value: 'A' }, { type: 'char', value: 'B' }]);
  // and the reverse: words in conflict, badge a plain change
  const plan2 = merge(s, ret(s.job, { 1: { t: 'One generator', b: { type: 'icon', value: 'nut' } } }), { view: mine });
  assert.equal(find(plan2, 1, 'text').class, 'conflict');
  assert.equal(find(plan2, 1, 'badge').class, 'change');
});

test('P-merge-8: words past the planner\'s 40 are cut with a note, and an unchanged-after-cut value is not a change', () => {
  const s = setup(three());
  const long = 'x'.repeat(48);
  const plan = merge(s, ret(s.job, { 1: { t: long } }));
  const r = find(plan, 1, 'text');
  assert.equal(r.theirs, 'x'.repeat(40));
  assert.match(r.note, /cut to 40 characters/);
  // exactly what the planner already holds after the cut: nothing to list
  const s2 = setup(three({ 1: { label: 'x'.repeat(40) } }));
  assert.equal(merge(s2, ret(s2.job, { 1: { t: 'x'.repeat(48) } })).rows.length, 0);
  // padded with spaces: the planner trims, so it is not a change either
  assert.equal(merge(s, ret(s.job, { 1: { t: '  One  ' } })).rows.length, 0);
});

test('P-merge-9: an `unsupplied` badge NEVER changes the planner\'s badge; icon-only is listed under Not saved, custom under Not applied; the words still merge', () => {
  const s = setup(three({ 1: { labelBadge: { type: 'char', value: 'A' } }, 3: {} }));
  const plan = merge(s, ret(s.job, {
    1: { t: 'One!', b: { type: 'unsupplied', why: 'custom' } },
    3: { t: '', b: { type: 'unsupplied', why: 'icon-only' } } }));
  assert.equal(find(plan, 1, 'badge'), undefined, 'custom: no badge proposal');
  assert.equal(find(plan, 1, 'text').class, 'change', 'the words still merge');
  assert.ok(plan.notApplied.some((n) => /custom uploaded icon stays in the generator/.test(n.text)));
  assert.deepEqual(plain(plan.notSaved.map((n) => n.text)), ['Drawer #3: icon-only label stays in the generator.']);
  assert.equal(find(plan, 3, 'badge'), undefined);
  // applying everything changes no badge and invents none
  const sel = LR.defaultSelections(plan);
  const out = LR.applyPlan(s.v, plan, sel, mergeCtx());
  assert.deepEqual(plain(out.ops), [{ u: 1, g: [0, 0, 1, 2], text: { set: 'One!' } }]);
  // an invalid badge is treated the same way, with a note
  const bad = merge(s, ret(s.job, { 1: { b: { type: 'icon', value: 'NOT VALID' } } }));
  assert.equal(find(bad, 1, 'badge'), undefined);
});

test('P-merge-10: merged words EMPTY => the badge goes too, and a ticked badge change on such a drawer is skipped with a note', () => {
  const s = setup(three({ 1: { labelBadge: { type: 'char', value: 'A' } } }));
  // the generator cleared the words (it resets the badge with them): ONE change, not two
  const cleared = merge(s, ret(s.job, { 1: { t: '', b: null } }));
  assert.equal(cleared.rows.length, 1);
  assert.equal(find(cleared, 1, 'badge'), undefined, 'the badge reset that comes with cleared words is not a second change');
  const out = LR.applyPlan(s.v, cleared, LR.defaultSelections(cleared), mergeCtx());
  assert.deepEqual(plain(out.ops), [{ u: 1, g: [0, 0, 1, 2], text: { set: '' } }], 'empty words: app.js deletes the label AND its badge');
  // a drawer with no words in the planner: the generator adds a badge only (no words) -> the badge proposal is skipped
  const s2 = setup(three());
  const badgeOnly = merge(s2, ret(s2.job, { 3: { t: 'New', b: { type: 'char', value: 'Z' } } }));
  const sel = LR.defaultSelections(badgeOnly);
  sel['3:text'] = false;   // the user unticks the words but leaves the badge ticked
  const o2 = LR.applyPlan(s2.v, badgeOnly, sel, mergeCtx());
  assert.deepEqual(plain(o2.ops), [], 'a badge on a drawer with no words is not kept');
  assert.ok(o2.skipped.some((x) => /icon without words/.test(x)));
  assert.equal(o2.decisions.rows[3].b, 'not-applied');
});

test('P-merge-11: a drawer whose position or size changed since the job -> REVIEW, unticked, even when the planner never edited its label', () => {
  const s = setup(three());
  const moved = view([U(1, 0, 2, { label: 'One' }), U(2, 1, 0, { label: 'Two' }), U(3, 2, 0)]);   // drawer 1 moved down a row
  const plan = merge(s, ret(s.job, { 1: { t: 'One!' } }), { view: moved });
  const r = find(plan, 1, 'text');
  assert.deepEqual([r.class, r.why], ['review', 'moved']);
  assert.equal(LR.defaultSelections(plan)['1:text'], false);
  const resized = view([U(1, 0, 0, { label: 'One', w: 2 }), U(2, 2, 0, { label: 'Two' }), U(3, 3, 0)]);
  assert.equal(find(merge(s, ret(s.job, { 1: { t: 'One!' } }), { view: resized }), 1, 'text').class, 'review');
  // the same drawer where it was: a plain change
  assert.equal(find(merge(s, ret(s.job, { 1: { t: 'One!' } })), 1, 'text').class, 'change');
});

test('P-merge-12: FULL mode from the loadId: the planner was reloaded or opened another build -> every difference is review, unticked; unchanged rows stay unlisted', () => {
  const s = setup(three());
  const plan = merge(s, ret(s.job, { 1: { t: 'One!' }, 2: { b: { type: 'char', value: 'Q' } } }), { ctx: { loadId: ID('z') } });
  assert.equal(plan.mode, 'full');
  assert.match(plan.modeText, /reloaded, or opened a different build/);
  assert.ok(plan.rows.length === 2 && plan.rows.every((r) => r.class === 'review'), JSON.stringify(plan.rows.map((r) => r.class)));
  const sel = LR.defaultSelections(plan);
  assert.ok(Object.values(sel).every((v) => v === false), 'mutant: review rows pre-ticked');
});

test('P-merge-13: FULL mode from the baseRev: the generator\'s copy was older than the record -> the baseline is not used', () => {
  const s = setup(three());
  // the generator echoes words that equal the BASELINE for drawer 2, but the planner changed it since; with an unknown base
  // there is no "theirs == base", so it is listed for review rather than silently treated as "no change"
  const mine = view(three({ 2: { label: 'Two (planner)' } }));
  const plan = merge(s, ret(s.job, {}, { baseRev: ID('q') }), { view: mine });
  assert.equal(plan.mode, 'full');
  assert.match(plan.modeText, /older version/);
  const r = find(plan, 2, 'text');
  assert.deepEqual([r.class, r.theirs, r.mine], ['review', 'Two', 'Two (planner)']);
  assert.equal(r.base, null);
});

test('P-merge-14: planSig does NOT change when something unrelated in the planner changes (a colour, a moved magnet, another drawer)', () => {
  const s = setup(three());
  const r = ret(s.job, { 1: { t: 'One!' } });
  const sig0 = merge(s, r).sig;
  const unrelated = view(three({ 3: { label: 'a drawer the generator did not touch' } }), { labelStyle: null });
  unrelated.units.forEach((u) => { u.closure = 'magnet'; });
  assert.equal(merge(s, r, { view: unrelated }).sig, sig0);
});

test('P-merge-15: planSig CHANGES when a listed drawer is edited elsewhere (the dock), and when the mode changes', () => {
  const s = setup(three());
  const r = ret(s.job, { 1: { t: 'One!' } });
  const sig0 = merge(s, r).sig;
  assert.notEqual(merge(s, r, { view: view(three({ 1: { label: 'One (dock)' } })) }).sig, sig0);
  assert.notEqual(merge(s, r, { ctx: { loadId: ID('z') } }).sig, sig0, 'a load crossing while the dialog is open');
});

test('P-merge-16: ticks and choices carry over for rows whose (class, mine, theirs) are unchanged; only changed rows reset', () => {
  const s = setup(three());
  const r = ret(s.job, { 1: { t: 'One!' }, 2: { t: 'Two!' } });
  const p1 = merge(s, r);
  const sel1 = LR.defaultSelections(p1);
  sel1['1:text'] = false;   // the user unticked drawer 1, kept drawer 2
  const p2 = merge(s, r, { view: view(three({ 2: { label: 'Two (dock)' } })) });   // drawer 2 changed in the dock
  const { sel, changed } = LR.carrySelections(p1, sel1, p2);
  assert.equal(sel['1:text'], false, 'untouched row keeps the user\'s choice');
  assert.ok(changed.has('2:text'), 'the dock-edited row is flagged');
  assert.ok(!changed.has('1:text'));
  assert.equal(p2.rows.find((x) => x.u === 2).class, 'conflict');
  assert.equal(sel['2:text'], 'planner', 'a changed row falls back to its default');
});

test('P-merge-17: UNTRUSTED (no record): everything is review, nothing ticked, the head explains', () => {
  const s = setup(three());
  const plan = merge(s, ret(s.job, { 1: { t: 'One!' }, 3: { t: 'Three!' } }), { record: null });
  assert.equal(plan.mode, 'untrusted');
  assert.match(plan.modeText, /no record of/);
  assert.ok(plan.rows.length === 2 && plan.rows.every((r) => r.class === 'review'));
  assert.ok(Object.values(LR.defaultSelections(plan)).every((v) => v === false));
  assert.deepEqual(plain(plan.jobUnits), [1, 2, 3]);
});

/* ---------------------------------------------------------------- P-merge: style */
test('P-merge-18: style compares EFFECTIVE values: a planner that stores nothing against a generator at its defaults is ZERO changes', () => {
  const s = setup(three());
  assert.equal(merge(s, ret(s.job)).style.length, 0);
  // a planner with an explicit default stored equals a generator at defaults, too
  const s2 = setup(three(), { labelStyle: { capMm: 5 } });
  assert.equal(merge(s2, ret(s2.job)).style.length, 0);
  // and a generator change is exactly one change on that field
  const plan = merge(s, ret(s.job, {}, { style: { ...s.job.style, capMm: 4.5 } }));
  assert.deepEqual(plain(plan.style.map((x) => [x.key, x.class, x.mine, x.theirs])), [['capMm', 'change', 5, 4.5]]);
  assert.equal(LR.defaultSelections(plan)['style:capMm'], true);
});

test('P-merge-19: a style the generator sends that the planner would DROP (out of range) is not saved and is explained; a non-EdgeLabel build skips every style field', () => {
  const s = setup(three());
  const bad = merge(s, ret(s.job, {}, { style: { ...s.job.style, capMm: 7, depth: 0.8 } }));
  assert.deepEqual(plain(bad.style.map((x) => x.key)), ['depth']);
  assert.ok(bad.notApplied.some((n) => n.key === 'capMm' && /outside the allowed range/.test(n.text)), JSON.stringify(bad.notApplied));
  const other = merge(s, ret(s.job, { 1: { t: 'One!' } }, { style: { ...s.job.style, capMm: 4.5 } }), { view: view(three(), { faceStyle: 'classicpro' }) });
  assert.equal(other.style.length, 0);
  assert.ok(other.notApplied.some((n) => /another faceplate/.test(n.text)));
  assert.equal(find(other, 1, 'text').class, 'change', 'words and badges still merge');
});

test('P-merge-20: style conflicts and full mode', () => {
  const s = setup(three());
  const r = ret(s.job, {}, { style: { ...s.job.style, bold: true } });
  const conflict = merge(s, r, { view: view(three(), { labelStyle: { bold: false, capMm: 4 } }) });
  // the planner's bold is false = the baseline's false, so this is a change; its capMm differs but the generator did not move it
  assert.deepEqual(plain(conflict.style.map((x) => [x.key, x.class])), [['bold', 'change']]);
  const both = merge(s, r, { view: view(three(), { labelStyle: { bold: true } }) });
  assert.equal(both.style.length, 0, 'already the same');
  const c2 = merge(s, ret(s.job, {}, { style: { ...s.job.style, capMm: 3 } }), { view: view(three(), { labelStyle: { capMm: 4 } }) });
  assert.deepEqual(plain(c2.style.map((x) => [x.key, x.class, x.mine, x.theirs])), [['capMm', 'conflict', 4, 3]]);
  assert.equal(LR.defaultSelections(c2)['style:capMm'], 'planner');
  const full = merge(s, r, { ctx: { loadId: ID('z') } });
  assert.equal(full.style[0].class, 'review');
});

test('P-merge-21: extras are named under Not applied', () => {
  const s = setup(three());
  assert.ok(merge(s, ret(s.job, {}, { extras: 3 })).notApplied.some((n) => /3 extra labels you added in the generator are printed there only/.test(n.text)));
  assert.ok(merge(s, ret(s.job, {}, { extras: 1 })).notApplied.some((n) => /1 extra label you added in the generator is printed there only/.test(n.text)));
  assert.equal(merge(s, ret(s.job, {}, { extras: 0 })).notApplied.length, 0);
});

/* ---------------------------------------------------------------- applyPlan + resultRows */
test('P-merge-22: applyPlan: ticked -> applied, a conflict kept -> kept-planner, unticked change/review -> not-applied, absent -> unchanged; per-field and summarized', () => {
  const s = setup(three({ 1: { labelBadge: { type: 'char', value: 'A' } } }));
  const mine = view(three({ 1: { label: 'One planner', labelBadge: { type: 'char', value: 'A' } }, 2: { label: 'Two planner' } }));
  const plan = merge(s, ret(s.job, { 1: { t: 'One gen', b: { type: 'char', value: 'B' } }, 2: { t: 'Two gen' } }, { style: { ...s.job.style, depth: 0.8 } }), { view: mine });
  const sel = LR.defaultSelections(plan);
  sel['1:badge'] = false;          // the user unticks the icon change
  const out = LR.applyPlan(mine, plan, sel, mergeCtx());
  assert.deepEqual(plain(out.decisions.rows[1]), { t: 'kept-planner', b: 'not-applied', decision: 'not-applied' });
  assert.deepEqual(plain(out.decisions.rows[2]), { t: 'kept-planner', b: 'unchanged', decision: 'kept-planner' });
  assert.deepEqual([out.decisions.style.depth, out.decisions.style.capMm], ['applied', 'unchanged']);
  assert.deepEqual(plain(out.styleNext), { depth: 0.8 });
  assert.equal(out.applied, 1, 'only the style change was applied');
  assert.deepEqual(plain(out.ops), []);
  sel['2:text'] = 'generator';
  const out2 = LR.applyPlan(mine, plan, sel, mergeCtx());
  assert.deepEqual(plain(out2.ops), [{ u: 2, g: [1, 0, 1, 2], text: { set: 'Two gen' } }]);
  assert.equal(out2.decisions.rows[2].decision, 'applied');
  // summary precedence: applied beats not-applied beats kept-planner beats unchanged
  assert.equal(LR.summarize({ t: 'applied', b: 'not-applied' }), 'applied');
  assert.equal(LR.summarize({ t: 'kept-planner', b: 'not-applied' }), 'not-applied');
  assert.equal(LR.summarize({ t: 'kept-planner', b: 'unchanged' }), 'kept-planner');
  assert.equal(LR.summarize({ t: 'unchanged', b: 'unchanged' }), 'unchanged');
});

test('P-merge-23: styleNext writes only the ticked fields over what is STORED (a stored default stays; an unstored field stays absent); an emptied style is null', () => {
  const s = setup(three(), { labelStyle: { bold: false, capMm: 4 } });
  const plan = merge(s, ret(s.job, {}, { style: { ...s.job.style, capMm: 5.5, badgeSize: 12 } }));
  const out = LR.applyPlan(s.v, plan, LR.defaultSelections(plan), mergeCtx());
  assert.deepEqual(plain(out.styleNext), { bold: false, capMm: 5.5, badgeSize: 12 });
  const sel = LR.defaultSelections(plan); sel['style:capMm'] = false; sel['style:badgeSize'] = false;
  assert.equal(LR.applyPlan(s.v, plan, sel, mergeCtx()).styleNext, undefined, 'nothing ticked: no style change at all');
});

test('P-merge-24: resultRows: the planner\'s values AFTER the apply for every job unit still present and decor; `gone` for the rest', () => {
  const s = setup(three({ 1: { labelBadge: { type: 'char', value: 'A' } } }));
  const after = view([U(1, 0, 0, { label: 'One!', labelBadge: { type: 'char', value: 'A' } }), U(2, 1, 0, { fill: 'classic' })]);   // 2 became classic, 3 was deleted
  const res = LR.resultRows(after, [1, 2, 3], { rows: { 1: { t: 'applied', b: 'unchanged', decision: 'applied' } } }, mergeCtx());
  assert.deepEqual(plain(res.rows), [{ u: 1, t: 'One!', b: { type: 'char', value: 'A' }, decision: 'applied', tDecision: 'applied', bDecision: 'unchanged', g: [0, 0, 1, 2] }]);
  assert.deepEqual(plain(res.gone), [2, 3]);
  assert.deepEqual(plain(res.style), { capMm: 5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true });
});

test('P-merge-25: badgeTag and styleText read the way the dialog shows them', () => {
  assert.deepEqual([null, { type: 'none' }, { type: 'char', value: 'M3' }, { type: 'icon', value: 'nut' }].map(LR.badgeTag), ['Auto', 'No icon', 'Letter M3', 'nut']);
  assert.deepEqual([LR.styleText('capMm', 4.5), LR.styleText('bold', true), LR.styleText('allCaps', false)], ['4.5 mm', 'on', 'off']);
});
