/* GEN2 EdgeLabel generator - the LINK to the GEN2 Planner (Step 3 of the label plan).

   Everything here is pure: no DOM, no storage, no timers, no window. index.html owns the page (the rows, the link bar, the
   message listener, sessionStorage); this file owns the RULES, so they can be executed by `node --test test/` and, in the
   Planner's repo, against a sha-pinned copy of this exact file (test/label-link-contract.test.mjs there).

   The vocabulary is the Planner's job (planner -> generator, in the URL), the return (generator -> planner), and the
   planner's answers. The spec is D:/MODULITH/handoffs/label-plan-step3/STEP3-SPEC.md; section numbers below name it.

   Loaded as a classic script (exposes GEN2EdgeLabelLink) and, under node, as a CommonJS module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.GEN2EdgeLabelLink = api;
})(typeof window !== 'undefined' ? window : null, function () {
'use strict';

/* ---- constants (pinned equal to the Planner's label-return.js by the contract test, C-3 / C-4 / C-5 / C-6) ---- */
const PLANNER_ORIGINS = ['https://gen2planner.jerrari3d.com'];
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const JOB_ROWS_MAX = 400;
const JOB_JSON_MAX = 256 * 1024;      // UTF-8 bytes of the job JSON
const JOB_URL_MAX = 256 * 1024;       // characters of the Planner's full URL (checked by the Planner; kept here so both files carry one number)
const RETURN_JSON_MAX = 256 * 1024;   // the Planner's parse bound for a return
const JOB_VALUE_MAX = 512 * 1024;     // the raw `job=` value, checked BEFORE decoding
const TEXT_MAX = 40;                  // the Planner's LABEL_MAX
const TEXT_INPUT_MAX = 48;            // this page's own text field (extras keep it)
const ID_RE = /^[a-z0-9]{8,32}$/;
const ICON_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_MAX = 1e9;

/* The six label-style settings, and the page inputs they live in (section 4.7). STYLE_LIMITS are the inputs' own min/max
   (a test parses index.html and compares); STYLE_DEFAULTS are label-core.js DEFAULTS (a test compares). */
const STYLE_KEYS = ['capMm', 'depth', 'badgeSize', 'bold', 'allCaps', 'predictIcons'];
const STYLE_INPUT = { capMm: 'font-size', depth: 'text-depth', badgeSize: 'badge-size', bold: 'bold-text', allCaps: 'all-caps', predictIcons: 'predict-icons' };
const STYLE_FLAGS = ['bold', 'allCaps', 'predictIcons'];
const STYLE_LIMITS = { capMm: [2, 6.5], depth: [0.2, 1.2], badgeSize: [4, 22] };
const STYLE_DEFAULTS = Object.freeze({ capMm: 5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true });

/* ---- small helpers ---- */
const isObj = (v) => Object.prototype.toString.call(v) === '[object Object]';
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

function canon(v) {   // JSON with sorted keys: two values are "the same" when their canon is
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

function newId() {
  const a = new Uint8Array(12);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

/* ---- base64url, unpadded, of the UTF-8 bytes (section 4.2): no `=`, so a job can never contain `labels=` ---- */
function utf8ToB64u(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToBytes(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const encodeJob = (job) => utf8ToB64u(JSON.stringify(job));
function decodeJob(s) {
  const bytes = b64uToBytes(s);
  if (bytes.length > JOB_JSON_MAX) { const e = new Error('too big'); e.code = 'too-big'; throw e; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/* ---- origins (section 5.1) ---- */
function originAllowed(origin, opts) {
  if (typeof origin !== 'string') return false;
  if (PLANNER_ORIGINS.includes(origin)) return true;
  return !!(opts && opts.servedFromLocalhost && LOOPBACK_ORIGIN.test(origin));
}

/* ---- the job (section 4.2) and its validation (section 7.2) ---- */
function jobParam(hash) {
  const parts = String(hash || '').replace(/^#/, '').split('&');
  for (const p of parts) if (p.startsWith('job=')) return p.slice(4);
  return null;
}
const hasJobParam = (hash) => jobParam(hash) !== null;

function validBadge(b) {
  if (b === null) return true;
  if (!isObj(b)) return false;
  if (b.type === 'none') return true;
  if (b.type === 'char') return typeof b.value === 'string' && b.value.length >= 1 && b.value.length <= 4;
  if (b.type === 'icon') return typeof b.value === 'string' && b.value.length <= 40 && ICON_ID_RE.test(b.value);
  return false;
}

/* The order is the spec's. Returns { ok: true, job } or { ok: false, reason }. The job is returned verbatim. */
function validateJob(job, opts) {
  const fail = (reason) => ({ ok: false, reason });
  if (!isObj(job)) return fail('bad-json');
  if (job.v !== 1) return fail('bad-version');
  if (job.family !== 'edgelabel') return fail('wrong-family');
  for (const k of ['jobId', 'buildId', 'baseRev']) if (typeof job[k] !== 'string' || !ID_RE.test(job[k])) return fail('bad-id');
  if (!originAllowed(job.origin, opts)) return fail('bad-origin');
  if (!isInt(job.textMax, 1, TEXT_INPUT_MAX)) return fail('bad-textmax');
  const st = job.style;
  if (!isObj(st) || Object.keys(st).length !== STYLE_KEYS.length || !STYLE_KEYS.every((k) => k in st)) return fail('bad-style');
  for (const k of STYLE_KEYS) {
    if (STYLE_FLAGS.includes(k)) { if (typeof st[k] !== 'boolean') return fail('bad-style'); }
    else if (typeof st[k] !== 'number' || !Number.isFinite(st[k]) || st[k] < STYLE_LIMITS[k][0] || st[k] > STYLE_LIMITS[k][1]) return fail('bad-style');
  }
  if (!Array.isArray(job.rows) || job.rows.length > JOB_ROWS_MAX) return fail('bad-rows');
  const seen = new Set();
  for (const r of job.rows) {
    if (!isObj(r)) return fail('bad-row');
    if (!isInt(r.u, 1, ID_MAX) || seen.has(r.u)) return fail('bad-row');
    seen.add(r.u);
    if (!isInt(r.n, 1, JOB_ROWS_MAX)) return fail('bad-row');
    if (!Array.isArray(r.g) || r.g.length !== 4 || !r.g.every((x) => isInt(x, 0, 100))) return fail('bad-row');
    if (typeof r.t !== 'string' || r.t.length > job.textMax) return fail('bad-row');
    if (!validBadge(r.b)) return fail('bad-row');
  }
  return { ok: true, job };
}

/* hash -> { ok, job } | { ok: false, reason }. The raw value is bounded BEFORE it is decoded, the decoded JSON before it is parsed. */
function parseJob(hash, opts) {
  const raw = jobParam(hash);
  if (raw === null) return { ok: false, reason: 'no-job' };
  if (raw.length > JOB_VALUE_MAX) return { ok: false, reason: 'too-long' };
  let job;
  try { job = decodeJob(raw); }
  catch (e) { return { ok: false, reason: e && e.code === 'too-big' ? 'too-big' : 'bad-encoding' }; }
  return validateJob(job, opts);
}

/* The legacy `#labels=<base64 JSON array of strings>` hand-off, exactly as the page has always read it. */
function importedLabelsFromHash(hash) {
  try {
    const m = String(hash || '').match(/labels=([^&]+)/);
    if (!m) return [];
    const arr = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.length) : [];
  } catch (e) { return []; }
}

/* ---- row snapshots ----
   One row of the list as these rules see it (index.html's rowSnap() builds it from the DOM):
     { u, n, text, type: 'none'|'char'|'icon', value, svg, manual, held }
   u/n = the Planner drawer id and its position when the job was made (null on an extra); value = the letter or the icon id;
   svg = a custom uploaded icon; manual = the user (or the Planner) chose the badge, so prediction leaves it alone;
   held = the badge object a job carried that this generator cannot show (section 7.3), kept byte-for-byte. */
const hasWords = (s) => !!String(s.text || '').trim();
const isLinked = (s) => s.u !== null && s.u !== undefined;
const hasContent = (s) => hasWords(s) || (s.manual && (s.type === 'char' || s.type === 'icon')) || !!s.held;

/* section 4.6 */
function badgeRep(s, iconIds) {
  const icons = iconIds || [];
  const picked = s.manual && (s.type === 'char' || s.type === 'icon');
  if (!hasWords(s)) return (picked || s.held) ? { type: 'unsupplied', why: 'icon-only' } : null;
  if (s.held) return s.held;
  if (!s.manual) return null;
  if (s.type === 'none') return { type: 'none' };
  if (s.type === 'char') return { type: 'char', value: s.value };
  if (s.type === 'icon') {
    if (s.svg) return { type: 'unsupplied', why: 'custom' };
    if (s.value && icons.length && !icons.includes(s.value)) return { type: 'icon', value: s.value };   // not shown here: returned as it is
    return { type: 'icon', value: s.value };
  }
  return null;
}
const isUnsupplied = (b) => !!b && b.type === 'unsupplied';

/* A job row -> a row snapshot. A badge this generator cannot show is HELD, never converted to Auto (section 7.3). */
function jobToRows(job, iconIds) {
  const icons = iconIds || [];
  return job.rows.map((r) => {
    const snap = { u: r.u, n: r.n, text: r.t, type: 'none', value: undefined, svg: false, manual: false, held: null };
    const b = r.b;
    if (b === null) return snap;
    snap.manual = true;
    if (b.type === 'none') return snap;
    if (b.type === 'char') { snap.type = 'char'; snap.value = b.value; return snap; }
    if (icons.includes(b.value)) { snap.type = 'icon'; snap.value = b.value; return snap; }
    snap.held = b;   // shown as none, returned unchanged until the user picks a badge on this row
    return snap;
  });
}

/* ---- style (section 4.7) ---- */
function styleFromInputs(el) {   // el(id) -> an element-like { value, checked }
  const out = {};
  for (const k of STYLE_KEYS) {
    const e = el(STYLE_INPUT[k]);
    out[k] = STYLE_FLAGS.includes(k) ? !!(e && e.checked) : Number(e ? e.value : NaN);
  }
  return out;
}
function inputsFromStyle(style, el, only) {
  for (const k of STYLE_KEYS) {
    if (only && !only.includes(k)) continue;
    if (!(k in style)) continue;
    const e = el(STYLE_INPUT[k]);
    if (!e) continue;
    if (STYLE_FLAGS.includes(k)) e.checked = !!style[k]; else e.value = String(style[k]);
  }
}
const styleEqual = (a, b) => STYLE_KEYS.every((k) => a && b && a[k] === b[k]);

/* ---- the return (section 4.4) and the retry rule (section 5.2) ---- */
function returnCore(snaps, style, baseRev, iconIds) {
  return {
    baseRev,
    rows: snaps.filter(isLinked).map((s) => ({ u: s.u, t: s.text, b: badgeRep(s, iconIds) })),
    style: Object.assign({}, style),
    extras: snaps.filter((s) => !isLinked(s) && hasContent(s)).length,
  };
}
/* link = { job, baseRev, pending }. A Send whose payload equals the pending one re-uses its returnId (the Planner dedups);
   a Send after any edit mints a new one. Returns { msg, reused }. */
function buildReturn(link, snaps, style, opts) {
  const o = opts || {};
  const core = returnCore(snaps, style, link.baseRev, o.iconIds);
  const p = link.pending;
  const reused = !!(p && p.payload && p.returnId && canon(returnCore2(p.payload)) === canon(core));
  const returnId = reused ? p.returnId : (o.newId || newId)();
  const msg = { gen2label: 'return', v: 1, family: 'edgelabel', jobId: link.job.jobId, buildId: link.job.buildId, baseRev: link.baseRev,
    returnId, rows: core.rows, style: core.style, extras: core.extras };
  return { msg, reused };
}
const returnCore2 = (m) => ({ baseRev: m.baseRev, rows: m.rows, style: m.style, extras: m.extras });

/* ---- unsaved local work (section 7.9) ---- */
const norm = (t, max) => String(t || '').trim().slice(0, max);
function isUnsaved(link, snaps, style, opts) {
  const o = opts || {};
  const max = link.job.textMax;
  const base = new Map(link.baseline.rows.map((r) => [r.u, r]));
  let rows = false, extras = 0;
  for (const s of snaps) {
    if (!isLinked(s)) { if (hasContent(s)) extras++; continue; }
    const b = base.get(s.u);
    if (!b) { rows = true; continue; }
    const rep = badgeRep(s, o.iconIds);
    const sameBadge = isUnsupplied(rep) || canon(rep) === canon(b.b === undefined ? null : b.b);
    if (norm(s.text, max) !== norm(b.t, max) || !sameBadge) rows = true;
  }
  const pending = !!(link.pending && link.pending.state && link.pending.state !== 'abandoned');
  const styleChanged = !styleEqual(style, link.baseline.style);
  return { rows, extras, pending, style: styleChanged, any: rows || extras > 0 || pending || styleChanged };
}

/* ---- the Planner's answers (section 4.5) ---- */
function parseAnswer(data) {
  if (!isObj(data) || typeof data.gen2label !== 'string' || data.v !== 1) return null;
  const kind = data.gen2label;
  if (!['ack', 'received', 'applied', 'cancelled', 'superseded', 'refused'].includes(kind)) return null;
  if (typeof data.jobId !== 'string' || !ID_RE.test(data.jobId)) return null;
  if (data.returnId !== undefined && (typeof data.returnId !== 'string' || !ID_RE.test(data.returnId))) return null;
  if (kind === 'ack') {
    if (typeof data.baseRev !== 'string' || !ID_RE.test(data.baseRev) || !(data.review === 'normal' || data.review === 'full')) return null;
    if (!isInt(data.drawers, 0, JOB_ROWS_MAX + 1000)) return null;
  }
  if (kind === 'applied') {
    if (typeof data.baseRev !== 'string' || !ID_RE.test(data.baseRev) || typeof data.returnId !== 'string') return null;
    if (!Array.isArray(data.rows) || data.rows.length > JOB_ROWS_MAX + 1000 || !Array.isArray(data.gone)) return null;
    for (const r of data.rows) {
      if (!isObj(r) || !isInt(r.u, 1, ID_MAX) || typeof r.t !== 'string' || !validBadge(r.b === undefined ? undefined : r.b)) return null;
      if (typeof r.decision !== 'string') return null;
    }
    if (!data.gone.every((u) => isInt(u, 1, ID_MAX))) return null;
    if (!isObj(data.style) || !isObj(data.styleDecision || {})) return null;
    for (const k of STYLE_KEYS) if (k in data.style && (STYLE_FLAGS.includes(k) ? typeof data.style[k] !== 'boolean' : typeof data.style[k] !== 'number')) return null;
  }
  if ((kind === 'received' || kind === 'cancelled' || kind === 'superseded') && typeof data.returnId !== 'string') return null;
  if (kind === 'refused' && typeof data.reason !== 'string') return null;
  return data;
}

/* What an answer does to the send state (section 5.3). link = { job, baseRev, pending }, pending = { returnId, payload, state };
   working = the rows and style on screen now, as returnCore() (so a late `applied` can be compared with what was sent).
   Returns { effect, ... }; never touches anything. */
function onAnswer(link, answer, working) {
  const none = { effect: 'ignore' };
  if (!answer || answer.jobId !== link.job.jobId) return none;
  const p = link.pending;
  const mine = !!(p && answer.returnId === p.returnId);
  switch (answer.gen2label) {
    case 'received':
      if (mine && p.state === 'sending') return { effect: 'received', pendingState: 'reviewing' };
      return none;
    case 'applied': {
      if (!mine) return none;
      if (p.state === 'sending' || p.state === 'reviewing') return { effect: 'adopt' };
      if (p.state === 'abandoned') return working && canon(working) === canon(returnCore2(p.payload)) ? { effect: 'adopt' } : { effect: 'late-status' };
      return none;
    }
    case 'cancelled':
      if (mine && (p.state === 'sending' || p.state === 'reviewing')) return { effect: 'cancelled' };
      return none;
    case 'superseded':
      return none;   // a superseded return is never the latest one, so it can never name the current returnId
    case 'refused': {
      const other = answer.reason === 'other-build';
      if (answer.returnId === undefined) return other ? { effect: 'other-build' } : { effect: 'refused', reason: answer.reason, hello: true };
      if (mine && (p.state === 'sending' || p.state === 'reviewing')) return { effect: 'refused', reason: answer.reason, linkState: other ? 'other-build' : undefined };
      return none;
    }
    default: return none;
  }
}

/* ---- adopting an `applied` answer (section 7.5) ----
   Returns what to do to each row and to the style inputs, and the new baseline. Per-field decisions (tDecision / bDecision)
   win over the row's summary decision, so words applied + an icon left unticked do not drag each other along. */
function adoptApplied(link, snaps, answer, iconIds) {
  const icons = iconIds || [];
  const byU = new Map(answer.rows.map((r) => [r.u, r]));
  const gone = new Set(answer.gone);
  const actions = snaps.map((s, index) => {
    if (!isLinked(s)) return { index, kind: 'keep' };
    if (gone.has(s.u)) return { index, u: s.u, kind: 'detach' };
    const r = byU.get(s.u);
    if (!r) return { index, u: s.u, kind: 'keep' };
    const td = r.tDecision || r.decision, bd = r.bDecision || r.decision;
    const act = { index, u: s.u, kind: 'set' };
    if (td !== 'not-applied') act.text = r.t;
    const rep = badgeRep(s, icons);
    if (bd !== 'not-applied' && !isUnsupplied(rep)) {
      const b = r.b === undefined ? null : r.b;
      if (b === null) act.badge = { mode: 'auto' };
      else if (b.type === 'none') act.badge = { mode: 'manual', type: 'none' };
      else if (b.type === 'char') act.badge = { mode: 'manual', type: 'char', value: b.value };
      else if (b.type === 'icon' && icons.includes(b.value)) act.badge = { mode: 'manual', type: 'icon', value: b.value };
      else act.badge = { mode: 'held', b };
    }
    return act;
  });
  const styleSet = {};
  for (const k of STYLE_KEYS) if (answer.style && k in answer.style && (answer.styleDecision || {})[k] !== 'not-applied') styleSet[k] = answer.style[k];
  return {
    actions, styleSet, gone: answer.gone.slice(),
    baseline: { rows: answer.rows.map((r) => ({ u: r.u, t: r.t, b: r.b === undefined ? null : r.b })), style: Object.assign({}, answer.style) },
    baseRev: answer.baseRev,
  };
}

/* ---- boot order (section 7.1) ----
   An explicit incoming import always wins; nothing older silently replaces it. `session` is the parsed linked session (or
   null), `snapsOf(project)` is snapsFromProject. Returns what to DO; the page does it. */
function snapsFromProject(project) {
  return ((project && project.labels) || []).map((l) => {
    const b = l.badge || { type: 'none' };
    return { u: l.u === undefined ? null : l.u, n: l.n === undefined ? null : l.n, text: l.text || '', type: b.type || 'none',
      value: b.value, svg: !!b.svg, manual: !!l.manual, held: l.held ? b : null };
  });
}
function planBoot(input) {
  const { hash, session, servedFromLocalhost, iconIds } = input;
  let jobError = null;
  if (hasJobParam(hash)) {
    const r = parseJob(hash, { servedFromLocalhost });
    if (r.ok) {
      let backup = null;   // a linked session this tab holds with unsaved work, displaced by the newer job
      if (session && session.job && session.job.jobId !== r.job.jobId) {
        const un = isUnsaved({ job: session.job, baseline: session.baseline, pending: session.pending }, snapsFromProject(session.project),
          styleFromProject(session), { iconIds });
        if (un.any) backup = session;
      }
      return { action: 'linked-import', job: r.job, backup };
    }
    jobError = r.reason;
  }
  const labels = importedLabelsFromHash(hash);
  if (labels.length) return { action: 'legacy-import', labels, pause: session ? session : null, jobError };
  if (session && !session.paused) return { action: 'linked-restore', session, jobError };
  return { action: 'autosave', jobError, pausedSession: session && session.paused ? session : null };
}
function styleFromProject(session) {
  const s = (session.project && session.project.settings) || {};
  const out = {};
  for (const k of STYLE_KEYS) {
    const v = s[STYLE_INPUT[k]];
    out[k] = STYLE_FLAGS.includes(k) ? !!v : Number(v);
  }
  return out;
}

/* ---- the stored linked session (section 4.8) ---- */
function parseSession(raw, opts) {
  let s;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!isObj(s) || s.v !== 1) return null;
  const j = validateJob(s.job, opts);
  if (!j.ok) return null;
  if (typeof s.baseRev !== 'string' || !ID_RE.test(s.baseRev)) return null;
  const b = s.baseline;
  if (!isObj(b) || !Array.isArray(b.rows) || !isObj(b.style)) return null;
  if (!isObj(s.project) || !Array.isArray(s.project.labels) || !isObj(s.project.settings)) return null;
  if (s.pending !== null && s.pending !== undefined) {
    const p = s.pending;
    if (!isObj(p) || typeof p.returnId !== 'string' || !ID_RE.test(p.returnId) || !isObj(p.payload) || !['sending', 'reviewing', 'abandoned'].includes(p.state)) return null;
  }
  return { v: 1, job: s.job, baseRev: s.baseRev, baseline: b, project: s.project, pending: s.pending || null, paused: !!s.paused, savedAt: s.savedAt || 0 };
}

return {
  PLANNER_ORIGINS, LOOPBACK_ORIGIN, JOB_ROWS_MAX, JOB_JSON_MAX, JOB_URL_MAX, RETURN_JSON_MAX, JOB_VALUE_MAX, TEXT_MAX, TEXT_INPUT_MAX,
  STYLE_KEYS, STYLE_INPUT, STYLE_FLAGS, STYLE_LIMITS, STYLE_DEFAULTS,
  canon, newId, encodeJob, decodeJob, originAllowed, hasJobParam, validateJob, parseJob, importedLabelsFromHash,
  hasWords, isLinked, hasContent, badgeRep, isUnsupplied, jobToRows,
  styleFromInputs, inputsFromStyle, styleEqual,
  returnCore, buildReturn, isUnsaved, parseAnswer, onAnswer, adoptApplied,
  snapsFromProject, styleFromProject, planBoot, parseSession,
};
});
