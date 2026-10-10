/* A drawer's UPLOADED label icon on the trip to the EdgeLabel generator and back (2026-10-09; ChatGPT's review, relayed by Joey:
   "a user's uploaded icon must survive the intended generator -> planner -> viewer -> saved-build round trip").

   The build keeps an uploaded icon in its label list; the drawer's mirror (unit.label / unit.labelBadge, what the job's `b` is
   made from) cannot hold one. So the job row carries it as `up`, beside `b`. Executed against the real app (jsdom), the
   generator's vendored label-link.js (the one that reads `up`) and the DEPLOYED generator's copy (which must ignore it). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { LR, labelPlanner, labelBuild, startJob, unit, returnOf, helloOf, GEN_ORIGIN } from './lib/label-env.mjs';

const require = createRequire(import.meta.url);
const GL = require('./vendor/edgelabel-label-link.js');
const GD = require('./vendor/edgelabel-label-link.deployed.js');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z"/></svg>';
const LOCAL = { servedFromLocalhost: true };

/* six drawers; drawer 1 carries "Logo parts" with an uploaded icon, drawer 2 "Nuts" with the nut icon, both in the label list */
function buildWithUpload(svg = SVG, extra = {}) {
  const units = [unit(1, 0, 0, { label: 'Logo parts' }), unit(2, 1, 0, { label: 'Nuts', labelBadge: { type: 'icon', value: 'nut' } }),
    unit(3, 2, 0), unit(4, 0, 2), unit(5, 1, 2), unit(6, 2, 2)];
  return labelBuild({
    labelList: { format: 'modulith-labels', version: 1, labels: [
      { id: 'lbllogo00001', text: 'Logo parts', badge: { type: 'icon', svg }, manual: true },
      { id: 'lblnuts00002', text: 'Nuts', badge: { type: 'icon', value: 'nut' }, manual: true },
      ...(extra.labels || [])] },
    labelAssign: { 1: 'lbllogo00001', 2: 'lblnuts00002', ...(extra.assign || {}) },
  }, extra.units ? units.map((u) => extra.units[u.id] ? { ...u, ...extra.units[u.id] } : u) : units);
}
const hashOf = (url) => url.slice(url.indexOf('#'));

test('P-up-1: the job row of a drawer with an uploaded icon carries it as `up`; its `b` stays the mirror\'s', () => {
  const p = labelPlanner({ build: buildWithUpload() });
  assert.equal(p.app.state.labelList.labels[0].badge.svg, SVG, 'the fixture build kept its upload');
  const { job } = startJob(p);
  const r1 = job.rows.find((r) => r.u === 1), r2 = job.rows.find((r) => r.u === 2);
  assert.equal(r1.up, SVG);
  assert.equal(r1.b, null, 'an upload has no id: the mirror has no badge');
  assert.equal(r2.up, undefined, 'a built-in icon needs no upload');
  assert.deepEqual(r2.b, { type: 'icon', value: 'nut' });
  for (const r of job.rows.filter((x) => x.u > 2)) assert.equal(r.up, undefined);
  p.close();
});

test('P-up-2: the DEPLOYED generator still opens the job and shows the row as before; the new one shows the upload and keeps the badge', () => {
  const p = labelPlanner({ build: buildWithUpload() });
  const { url } = startJob(p);
  const old = GD.parseJob(hashOf(url), LOCAL);
  assert.equal(old.ok, true, 'the deployed validator ignores the unknown row key: ' + old.reason);
  const oldRow = GD.jobToRows(old.job, ['nut'])[0];
  assert.equal(oldRow.manual, false, 'the deployed generator predicts for it, as it always has');
  const now = GL.parseJob(hashOf(url), LOCAL);
  assert.equal(now.ok, true);
  const row = GL.jobToRows(now.job, ['nut'])[0];
  assert.deepEqual([row.type, row.svg, row.keep], ['icon', true, { b: null }]);
  p.close();
});

test('P-up-3: an unedited return from the new generator changes nothing, and the build keeps its uploaded icon', () => {
  const p = labelPlanner({ build: buildWithUpload() });
  const { job } = startJob(p);
  p.post(helloOf(job));
  const snaps = GL.jobToRows(job, ['nut']);
  const link = { job, baseRev: job.baseRev, baseline: { rows: job.rows.map((r) => ({ u: r.u, t: r.t, b: r.b })), style: job.style }, pending: null };
  const { msg } = GL.buildReturn(link, snaps, job.style, { iconIds: ['nut'], newId: () => 'x'.repeat(12) });
  assert.equal(msg.rows.find((r) => r.u === 1).b, null, 'the kept badge goes back as it came');
  p.post(JSON.parse(JSON.stringify(msg)));
  p.timers.advance(1000);
  const applied = p.answers('applied').concat(p.answers('received'));
  assert.ok(applied.length, 'the planner answered');
  assert.equal(p.app.state.labelList.labels.find((l) => l.id === 'lbllogo00001').badge.svg, SVG, 'the upload is still in the build');
  p.close();
});

test('P-up-4: past the per-job budget a row says the drawer has one (`up: true`), and the job still fits the URL limit', () => {
  const big = '<svg xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0H1V1H0Z"/>'.repeat(2500) + '</svg>';   // ~60 KB
  assert.ok(big.length > 55000 && big.length < 64 * 1024);
  const labels = [], assign = {};
  for (let i = 3; i <= 6; i++) { labels.push({ id: 'lblbig00000' + i, text: 'Big ' + i, badge: { type: 'icon', svg: big }, manual: true }); assign[i] = 'lblbig00000' + i; }
  const units = {}; for (let i = 3; i <= 6; i++) units[i] = { label: 'Big ' + i };
  const p = labelPlanner({ build: buildWithUpload(big, { labels, assign, units }) });
  const { job, url } = startJob(p);
  const ups = job.rows.filter((r) => r.up !== undefined).map((r) => (r.up === true ? true : 'svg'));
  assert.deepEqual(ups, ['svg', true, true, true, true], 'one ~60 KB upload fits the 96 KB budget, the rest say they exist');
  assert.ok(url.length <= LR.JOB_URL_MAX, `the URL is ${url.length} characters`);
  const row = GL.jobToRows(GL.parseJob(hashOf(url), LOCAL).job, ['nut']).find((r) => r.u === 3);
  assert.deepEqual([row.type, row.keep], ['none', { b: null }], 'the generator says the drawer has one rather than guessing an icon');
  p.close();
});

test('P-up-5: an older tool renamed the drawer: the label is edited in place and keeps its upload, which rides with the new words; an older tool that PICKED an icon replaced the upload, and none is sent', () => {
  const renamed = labelPlanner({ build: buildWithUpload(SVG, { units: { 1: { label: 'Renamed elsewhere' } } }) });
  const l1 = renamed.app.state.labelList.labels.find((l) => l.id === 'lbllogo00001');
  assert.deepEqual([l1.text, l1.badge.svg], ['Renamed elsewhere', SVG]);
  const r1 = startJob(renamed).job.rows.find((r) => r.u === 1);
  assert.deepEqual([r1.t, r1.up], ['Renamed elsewhere', SVG]);
  renamed.close();
  const picked = labelPlanner({ build: buildWithUpload(SVG, { units: { 1: { labelBadge: { type: 'icon', value: 'star' } } } }) });
  const p1 = picked.app.state.labelList.labels.find((l) => l.id === picked.app.state.labelAssign[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(p1.badge)), { type: 'icon', value: 'star' }, "the older tool's pick wins over the upload it could not see");
  const q1 = startJob(picked).job.rows.find((r) => r.u === 1);
  assert.equal(q1.up, undefined);
  assert.deepEqual(q1.b, { type: 'icon', value: 'star' });
  picked.close();
});

test('P-up-6: a change to a drawer\'s uploaded icon ALONE re-posts the layout to the docked viewer, carrying the new label list', () => {
  const p = labelPlanner({ build: buildWithUpload() });
  p.timers.advance(2000);
  const layouts = () => p.toViewer.map((x) => x.d).filter((d) => d.gen2 === 'layout');
  const before = layouts().length;
  p.app.refresh(); p.timers.advance(2000);
  assert.equal(layouts().length, before, 'nothing changed: nothing re-posted');
  const SVG2 = SVG.replace('M0 0H10', 'M1 1H9');
  p.app.state.labelList.labels.find((l) => l.id === 'lbllogo00001').badge.svg = SVG2;
  p.app.refresh(); p.timers.advance(2000);
  const after = layouts();
  assert.equal(after.length, before + 1, 'the upload alone moved the layout signature');
  assert.equal(after.at(-1).build.labelList.labels.find((l) => l.id === 'lbllogo00001').badge.svg, SVG2);
  p.close();
});

/* ChatGPT's second review, relayed by Joey 2026-10-09: an icon the job could not carry must not quietly drop out of the print -
   the linked generator ASKS for it over the link and the planner answers; and an icon-only label reaches the generator instead
   of arriving as an empty row. */
function bigBuild() {
  const big = '<svg xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0H1V1H0Z"/>'.repeat(2500) + '</svg>';   // ~60 KB each
  const labels = [], assign = {}, units = {};
  for (let i = 3; i <= 6; i++) { labels.push({ id: 'lblbig00000' + i, text: 'Big ' + i, badge: { type: 'icon', svg: big + '<!--' + i + '-->' }, manual: true }); assign[i] = 'lblbig00000' + i; units[i] = { label: 'Big ' + i }; }
  return { big, build: buildWithUpload(big, { labels, assign, units }) };
}

test('P-up-7: a linked generator asks for the icons its job could not carry, and gets exactly those, from this build, in that window only', () => {
  const { big, build } = bigBuild();
  const p = labelPlanner({ build });
  const { job } = startJob(p);
  p.post(helloOf(job));
  const waiting = job.rows.filter((r) => r.up === true).map((r) => r.u);
  assert.deepEqual(waiting, [3, 4, 5, 6]);
  p.post(GL.uploadsRequest({ job }, [...waiting, 99]));
  const ans = p.answers('uploads');
  assert.equal(ans.length, 1);
  assert.ok(GL.parseAnswer(ans[0]), 'the generator accepts the answer');
  assert.equal(ans[0].jobId, job.jobId);
  assert.deepEqual(ans[0].rows.map((r) => r.u), [3, 4, 5, 6], 'a drawer with no upload (99) is left out');
  for (const r of ans[0].rows) assert.equal(GL.upOf(r), big + '<!--' + r.u + '-->', `drawer ${r.u}'s own upload`);
  assert.equal(p.fromPlanner.at(-1).o, GEN_ORIGIN, 'posted to the generator origin, never "*"');
  // not the window bound to the job, not the generator's origin, another build, a bad shape: no uploads
  const other = p.mkWin([]);
  p.post(GL.uploadsRequest({ job }, [3]), { source: other });
  p.post(GL.uploadsRequest({ job }, [3]), { origin: 'https://evil.example' });
  p.post({ ...GL.uploadsRequest({ job }, [3]), units: 'all' });
  assert.equal(p.answers('uploads').length, 1, 'none of those got an answer');
  p.post({ ...GL.uploadsRequest({ job }, [3]), buildId: 'z'.repeat(12) });
  assert.equal(p.answers('refused').at(-1).reason, 'other-build');
  assert.equal(p.answers('uploads').length, 1);
  p.close();
});

test('P-io-1: an icon-only label goes in the job as `io` (icon id, letter, or an upload in `up`); the deployed generator ignores it; an untouched return keeps it', () => {
  const units = { 3: { label: undefined }, 4: { label: undefined }, 5: { label: undefined } };
  const p = labelPlanner({ build: buildWithUpload(SVG, {
    labels: [
      { id: 'lblionly0003', text: '', badge: { type: 'icon', value: 'nut' }, manual: true },
      { id: 'lblionly0004', text: '', badge: { type: 'char', value: 'A' }, manual: true },
      { id: 'lblionly0005', text: '', badge: { type: 'icon', svg: SVG }, manual: true },
    ],
    assign: { 3: 'lblionly0003', 4: 'lblionly0004', 5: 'lblionly0005' }, units }) });
  assert.equal(p.app.state.labelAssign[3], 'lblionly0003', 'the icon-only labels stay assigned');
  const { job, url } = startJob(p);
  const row = (u) => job.rows.find((r) => r.u === u);
  assert.deepEqual([row(3).t, row(3).b, row(3).io, row(3).up], ['', null, { value: 'nut' }, undefined]);
  assert.deepEqual([row(4).io, row(4).up], [{ char: 'A' }, undefined]);
  assert.deepEqual([row(5).io, row(5).up], [{}, SVG]);
  assert.equal(row(6).io, undefined, 'an empty drawer has none');
  const old = GD.parseJob(hashOf(url), LOCAL);
  assert.equal(old.ok, true, 'the deployed generator still opens the job');
  for (const r of GD.jobToRows(old.job, ['nut']).filter((x) => [3, 4, 5].includes(x.u))) assert.deepEqual([r.type, r.manual], ['none', false], 'and shows the empty row it always did');
  const snaps = GL.jobToRows(GL.parseJob(hashOf(url), LOCAL).job, ['nut']);
  assert.deepEqual(snaps.filter((s) => [3, 4, 5].includes(s.u)).map((s) => [s.type, s.value === undefined ? null : s.value, s.svg]),
    [['icon', 'nut', false], ['char', 'A', false], ['icon', null, true]]);
  p.post(helloOf(job));
  p.post(GL.uploadsRequest({ job }, [5]));
  assert.deepEqual(p.answers('uploads').at(-1).rows, [{ u: 5, up: SVG }], 'an icon-only upload is answered too');
  const link = { job, baseRev: job.baseRev, baseline: { rows: job.rows.map((r) => ({ u: r.u, t: r.t, b: r.b })), style: job.style }, pending: null };
  const { msg } = GL.buildReturn(link, snaps, job.style, { iconIds: ['nut'], newId: () => 'y'.repeat(12) });
  assert.deepEqual(msg.rows.filter((r) => [3, 4, 5].includes(r.u)).map((r) => [r.t, r.b]), [['', null], ['', null], ['', null]], 'nothing goes back');
  p.post(JSON.parse(JSON.stringify(msg)));
  p.timers.advance(1000);
  const L = p.app.state.labelList.labels;
  assert.deepEqual([3, 4, 5].map((u) => p.app.state.labelAssign[u]), ['lblionly0003', 'lblionly0004', 'lblionly0005']);
  assert.deepEqual(L.find((l) => l.id === 'lblionly0005').badge.svg, SVG, 'the icon-only upload is still in the build');
  p.close();
});
