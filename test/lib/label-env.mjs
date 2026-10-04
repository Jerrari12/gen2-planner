/* Shared fixtures for the label-return tests (not a test itself): boot the REAL planner in jsdom (so the cleaners the merge
   uses are the planner's own, not copies), load js/label-return.js the way the page does, and offer a few build fixtures.

   ⚠ node --test runs every .mjs under test/, this one included; it declares no tests, which is fine. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const read = (p) => readFileSync(join(root, p), 'utf8');
const require = createRequire(import.meta.url);
export const LR = require('../../js/label-return.js');
export const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* A planner with label-return.js loaded in BEFORE app.js (the order index.html uses). `url` makes it a local-dev planner. */
export function bootPlanner({ url, withLabelReturn = true, storage, beforeApp } = {}) {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', ...(url ? { url } : {}) });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  if (beforeApp) beforeApp(window);
  window.eval(read('js/requirement-scope.js') + '\n' + read('js/tabletop-completion.js') + '\n' + read('js/data.js') + '\n'
    + (withLabelReturn ? read('js/label-return.js') + '\n' : '') + read('js/app.js'));
  return { window, app: window.__GEN2_PLANNER_TEST__, dom };
}

let shared = null;
/* One planner for the pure tests that only need its cleaners. */
export function cleaners() {
  if (!shared) shared = bootPlanner();
  const { app } = shared;
  return { cleanText: app.cleanLabelText, cleanBadge: app.cleanLabelBadge, cleanStyle: app.cleanLabelStyle, labelOrder: app.labelOrder, textMax: 40, GEN2: app.GEN2 };
}

/* A tabletop 185 EdgeLabel build, two rows of three 1W-1H decor drawers (ids 1-3 top row, 4-6 bottom) plus nothing else.
   `units` overrides the placed list; gridH 2 puts a 1H row on the floor at y 2. */
export function labelBuild(over = {}, units) {
  const U = (id, x, y, o = {}) => ({ id, x, y, w: 1, hh: 2, fill: 'decor', shelves: 0, ...o });
  return {
    mount: 'tabletop', length: 185, faceStyle: 'edgelabel', handleStyle: 'deco', wallStagger: false, backCover: false, feet: 'tpu',
    removedStoppers: [], gridW: 3, gridH: 2,
    placed: units || [U(1, 0, 0), U(2, 1, 0), U(3, 2, 0), U(4, 0, 2), U(5, 1, 2), U(6, 2, 2)],
    nextId: 7, buildId: 'abcdefghij12', labelStyle: null, ...over,
  };
}
export const unit = (id, x, y, o = {}) => ({ id, x, y, w: 1, hh: 2, fill: 'decor', shelves: 0, ...o });

/* ---------------------------------------------------------------- the two-way label flow in jsdom (real app.js) */

/* A timer queue the test drives: the planner's own setTimeout/clearTimeout are replaced BEFORE app.js runs, so "60 s of review"
   costs nothing and nothing fires unless the test advances time. */
export function fakeTimers() {
  let now = 0, seq = 0;
  const q = new Map();
  return {
    setTimeout(fn, ms = 0) { const id = ++seq; q.set(id, { at: now + Math.max(0, ms), fn }); return id; },
    clearTimeout(id) { q.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...q.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        q.delete(due[0]); now = due[1].at; due[1].fn();
      }
      now = end;
    },
    pending: () => q.size,
  };
}

/* jsdom has no <dialog>.showModal(): the TEST supplies one (the production code has no fallback by design, section 6.3 step 6).
   `opts.noModal` leaves it out, to prove the refusal. */
export function stubDialog(window, { noModal = false, log } = {}) {
  const proto = window.HTMLDialogElement.prototype;
  if (!noModal) {
    proto.showModal = function () { if (log) log.push('showModal'); this.setAttribute('open', ''); };
    proto.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  } else { delete proto.showModal; }
}

const GEN_ORIGIN = 'http://localhost:8702';
const VIEWER_ORIGIN = 'http://localhost:8723';
export { GEN_ORIGIN, VIEWER_ORIGIN };

/* A local-dev planner (origin http://localhost:8124) that trusts the generator at GEN_ORIGIN (?dev_labelgen), with:
   - `gen`: a stand-in generator window (an iframe's contentWindow, so it is a real other window) whose posts are captured in
     `fromPlanner` as { d, o } (data, targetOrigin);
   - `viewer`: the same for the 3D viewer (a viewerReady handshake already done), captured in `toViewer`;
   - `open`: what window.open was called with (it returns `gen`, or null when `blockOpen`);
   - `timers`, and helpers to send messages. */
export function labelPlanner({ units, build, qs = '?dev_labelgen=' + GEN_ORIGIN, noModal = false, withLabelReturn = true, blockOpen = false, storage, session, crypto } = {}) {
  const timers = fakeTimers();
  const dlgLog = [];
  const { window, app } = bootPlanner({
    url: 'http://localhost:8124/' + qs, withLabelReturn,
    beforeApp(w) {
      stubDialog(w, { noModal, log: dlgLog });
      w.setTimeout = timers.setTimeout; w.clearTimeout = timers.clearTimeout;
      if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      if (session) for (const [k, v] of Object.entries(session)) w.sessionStorage.setItem(k, v);
      if (crypto) Object.defineProperty(w, 'crypto', { value: crypto, configurable: true });
    },
  });
  if (!app.applyBuild(JSON.parse(JSON.stringify(build || labelBuild({}, units))))) throw new Error('planner rejected the fixture build');
  app.refresh();
  const fromPlanner = [], toViewer = [], open = [];
  const mkWin = (sink) => { const f = window.document.createElement('iframe'); window.document.body.appendChild(f); const w = f.contentWindow; w.postMessage = (d, o) => sink.push({ d: JSON.parse(JSON.stringify(d)), o }); w.focus = () => {}; return w; };
  const gen = mkWin(fromPlanner);
  const viewer = mkWin(toViewer);
  window.open = (url, name) => { open.push({ url, name }); return blockOpen ? null : gen; };
  window.dispatchEvent(new window.MessageEvent('message', { data: { gen2: 'viewerReady' }, source: viewer, origin: VIEWER_ORIGIN }));
  const post = (data, { source = gen, origin = GEN_ORIGIN } = {}) => window.dispatchEvent(new window.MessageEvent('message', { data, source, origin }));
  const anchor = () => window.document.getElementById('label-gen-link');
  const click = (init = {}) => { const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }); anchor().dispatchEvent(ev); return ev; };
  const answers = (kind) => fromPlanner.map((x) => x.d).filter((d) => d.gen2label && (!kind || d.gen2label === kind));
  return { window, app, timers, gen, viewer, fromPlanner, toViewer, open, post, anchor, click, answers, dlgLog, mkWin, close: () => window.close() };
}

/* open the generator the way the user does, then play its hello; returns the job as the generator received it */
export function startJob(p) {
  const ev = p.click();
  if (!p.open.length) return { ev, job: null };
  const url = p.open[p.open.length - 1].url;
  const hash = url.slice(url.indexOf('#') + 1);
  const raw = hash.split('&').find((x) => x.startsWith('job='));
  const job = JSON.parse(Buffer.from(raw.slice(4), 'base64url').toString('utf8'));
  return { ev, job, url };
}
export const helloOf = (job, over = {}) => ({ gen2label: 'hello', v: 1, family: 'edgelabel', jobId: job.jobId, buildId: job.buildId, baseRev: job.baseRev, ...over });
export function returnOf(job, rows, over = {}) {
  return { gen2label: 'return', v: 1, family: 'edgelabel', jobId: job.jobId, buildId: job.buildId, baseRev: job.baseRev, returnId: 'ret' + Math.random().toString(36).slice(2, 11).padEnd(9, 'x'),
    rows: job.rows.map((r) => ({ u: r.u, t: r.t, b: r.b, ...(rows[r.u] || {}) })), style: { ...job.style }, extras: 0, ...over };
}
