/* GEN2 Planner - the EdgeLabel generator's RETURN (Step 3 of the label plan): the job the Planner sends out, the return it
   gets back, the merge between the two, and the little store that remembers each job.

   Everything here is PURE: no DOM, no `state` global, no timers. app.js passes in what it needs (the units, the cleaners it
   already owns - cleanLabelText / cleanLabelBadge / cleanLabelStyle - and labelOrder), so these rules are executed by the
   Planner's tests under plain node, and the cross-repo contract test runs them against a sha-pinned copy of the generator's
   label-link.js. The spec is D:/MODULITH/handoffs/label-plan-step3/STEP3-SPEC.md; section numbers below name it.

   ⚠ app.js reads `window.GEN2LabelReturn` ONLY inside handlers (the button click, the gen2label listener), never in refresh()
   or at load: harnesses that eval the Planner's scripts by name (the viewer's parity suite, the MODULITH site's
   tools/vendor-build-boms.mjs) then never need this file (the tabletop-completion lesson).

   A classic script (exposes GEN2LabelReturn) and, under node, a CommonJS module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.GEN2LabelReturn = api;
})(typeof window !== 'undefined' ? window : null, function () {
'use strict';

/* ---- constants (pinned equal to the generator's label-link.js by test/label-link-contract.test.mjs, C-3 .. C-6) ---- */
const JOB_ROWS_MAX = 400;
const JOB_JSON_MAX = 256 * 1024;
const JOB_URL_MAX = 256 * 1024;
const RETURN_JSON_MAX = 256 * 1024;
const TEXT_MAX = 40;   // the Planner's LABEL_MAX (app.js), which is what cleanLabelText cuts to; app.js passes its own as ctx.textMax
const ID_RE = /^[a-z0-9]{8,32}$/;
const ID_MAX = 1e9;
const STYLE_KEYS = ['capMm', 'depth', 'badgeSize', 'bold', 'allCaps', 'predictIcons'];
const STYLE_FLAGS = ['bold', 'allCaps', 'predictIcons'];
/* The generator's own defaults (label-core.js DEFAULTS; its inputs' value= attributes). The Planner stores a style only for the
   fields somebody changed, so "what the generator would build" is these merged under the stored ones. */
const LABEL_DEFAULTS = Object.freeze({ capMm: 5, depth: 0.6, badgeSize: 14, bold: false, allCaps: true, predictIcons: true });
const STORE_PREFIX = 'gen2-label-job:';
const ANSWERS_KEPT = 5;
const RECORD_MAX_AGE = 30 * 24 * 3600 * 1000;
const RECORDS_MAX = 20;
const RECORDS_QUOTA_RETRY = 10;
const STYLE_LABEL = { capMm: 'Text size', depth: 'Text depth', badgeSize: 'Badge size', bold: 'Bold text', allCaps: 'All caps', predictIcons: 'Predict icons' };
const STYLE_UNIT = { capMm: ' mm', depth: ' mm', badgeSize: ' mm' };

const isObj = (v) => Object.prototype.toString.call(v) === '[object Object]';
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
const same = (a, b) => canon(a) === canon(b);
function newId() {
  const a = new Uint8Array(12);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}
const byteLength = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);

/* ---- style ---- */
function effectiveStyle(styleSet) {   // LABEL_DEFAULTS under whatever is stored
  const out = Object.assign({}, LABEL_DEFAULTS);
  if (isObj(styleSet)) for (const k of STYLE_KEYS) if (k in styleSet) out[k] = styleSet[k];
  return out;
}

/* ---- the job (section 4.2) ---- */
/* view: { units: state.placed, faceStyle, labelStyle, buildId }
   ctx:  { origin, textMax, jobId?, baseRev?, newId?, cleanText, cleanBadge, cleanStyle, labelOrder }
   EVERY decor unit, in labelOrder (Classic drawers have no label slot). */
function buildLabelJob(view, ctx) {
  const decor = ctx.labelOrder(view.units.filter((u) => u.fill === 'decor'));
  const mint = ctx.newId || newId;
  return {
    v: 1, family: 'edgelabel', jobId: ctx.jobId || mint(), buildId: view.buildId, baseRev: ctx.baseRev || mint(),
    origin: ctx.origin, textMax: ctx.textMax,
    style: effectiveStyle(ctx.cleanStyle(view.labelStyle)),
    rows: decor.map((u, i) => {
      const t = ctx.cleanText(u.label);
      return { u: u.id, n: i + 1, g: [u.x, u.y, u.w, u.hh], t, b: t ? (ctx.cleanBadge(u.labelBadge) || null) : null };
    }),
  };
}

/* UTF-8 -> base64url, unpadded. encodeURIComponent is the UTF-8 encoder here (no TextEncoder: the planner's jsdom harnesses do not
   provide one). Safe because JSON.stringify escapes a lone surrogate as a backslash-u escape, so the text is always well-formed. */
function utf8ToB64u(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const encodeJob = (job) => utf8ToB64u(JSON.stringify(job));

/* `base + #labels=<legacy> & job=<job>`: the legacy part is EXACTLY today's updateLabelGenLink value and comes first, so an old
   generator imports the words as before; the unpadded job holds no `=`, so its regex stops at the `&`. No words -> `#job=` alone. */
/* EXACTLY today's updateLabelGenLink value. A word whose 40th UTF-16 unit is half a surrogate pair is fine here: JSON.stringify
   escapes a lone surrogate as a backslash-u escape before encodeURIComponent ever sees it (checked by the contract test's seed). */
function legacyHash(words) {
  return words.length ? 'labels=' + btoa(unescape(encodeURIComponent(JSON.stringify(words)))) : '';
}
function jobUrl(base, words, job) {
  const legacy = legacyHash(words);
  return base + '#' + (legacy ? legacy + '&' : '') + 'job=' + encodeJob(job);
}
/* The numbers the click checks BEFORE it opens anything (section 6.1 step 3). */
function measureJob(job, url) {
  const rows = job.rows.length, jsonBytes = byteLength(JSON.stringify(job)), urlChars = url.length;
  let reason = null;
  if (rows > JOB_ROWS_MAX) reason = 'rows';
  else if (jsonBytes > JOB_JSON_MAX) reason = 'json';
  else if (urlChars > JOB_URL_MAX) reason = 'url';
  return { ok: !reason, reason, rows, jsonBytes, urlChars };
}

/* The record the Planner keeps per job (section 4.3). */
function makeJobRecord(view, job, ctx) {
  const now = ctx.now || Date.now();
  return {
    v: 1, jobId: job.jobId, family: 'edgelabel', buildId: job.buildId, tab: ctx.plannerTabId, loadId: ctx.loadId,
    createdAt: now, lastActivity: now, baseRev: job.baseRev,
    baseline: { rows: job.rows.map((r) => ({ u: r.u, n: r.n, g: r.g.slice(), t: r.t, b: r.b })), style: Object.assign({}, job.style), styleSet: ctx.cleanStyle(view.labelStyle) },
    answers: {},
  };
}

/* ---- the return (section 4.4) and its parse (section 6.3 step 2) ---- */
function parseLabelReturn(data) {
  const bad = (reason) => ({ ok: false, reason });
  if (!isObj(data)) return bad('malformed');
  let json;
  try { json = JSON.stringify(data); } catch (e) { return bad('malformed'); }
  if (byteLength(json) > RETURN_JSON_MAX) return bad('malformed');
  if (data.v !== 1) return bad('malformed');
  if (data.family !== 'edgelabel') return bad('wrong-family');
  for (const k of ['jobId', 'buildId', 'baseRev', 'returnId']) if (typeof data[k] !== 'string' || !ID_RE.test(data[k])) return bad('malformed');
  if (!Array.isArray(data.rows) || data.rows.length > JOB_ROWS_MAX) return bad('malformed');
  const seen = new Set();
  for (const r of data.rows) {
    if (!isObj(r) || !isInt(r.u, 1, ID_MAX) || seen.has(r.u)) return bad('malformed');
    seen.add(r.u);
    if (typeof r.t !== 'string' || r.t.length > 200) return bad('malformed');
    if (!(r.b === null || isObj(r.b))) return bad('malformed');
  }
  if (!isObj(data.style)) return bad('malformed');
  if (!isInt(data.extras, 0, 10000)) return bad('malformed');
  return { ok: true, ret: data };
}

/* ---- the merge (section 6.4) ---- */
const badgeTag = (b) => (!b ? 'Auto' : b.type === 'none' ? 'No icon' : b.type === 'char' ? 'Letter ' + b.value : b.type === 'icon' ? b.value : 'Auto');
function styleText(key, v) {
  if (STYLE_FLAGS.includes(key)) return v ? 'on' : 'off';
  return v + (STYLE_UNIT[key] || '');
}
const posText = (u) => 'row ' + (u.y / 2 + 1) + ', column ' + (u.x + 1);

/* view: { units, faceStyle, labelStyle }, record: the stored record or null, ret: a parsed return (parseLabelReturn().ret),
   ctx: { loadId, textMax, cleanText, cleanBadge, cleanStyle, labelOrder }
   -> plan = { mode, modeText, rows, style, notApplied, notSaved, sig, jobUnits }
   Row classes: change (ticked), conflict (radio, default the Planner's), review (unticked). */
function mergeLabelReturn(view, record, ret, ctx) {
  const mode = !record ? 'untrusted' : (record.loadId !== ctx.loadId || ret.baseRev !== record.baseRev ? 'full' : 'normal');
  const hasBase = !!record && ret.baseRev === record.baseRev;
  const modeText = mode === 'normal' ? '' : mode === 'untrusted'
    ? 'These labels came from a generator session this planner tab has no record of.'
    : (record.loadId !== ctx.loadId
      ? 'The planner was reloaded, or opened a different build, since you opened the generator.'
      : 'The generator\'s labels were based on an older version than this planner has on record.') + ' So every difference is listed for you to check.';
  const units = new Map(view.units.map((u) => [u.id, u]));
  const order = ctx.labelOrder(view.units.filter((u) => u.fill === 'decor'));
  const nOf = new Map(order.map((u, i) => [u.id, i + 1]));
  const baseRows = new Map(hasBase ? record.baseline.rows.map((r) => [r.u, r]) : []);
  const nOfJob = new Map(record ? record.baseline.rows.filter((r) => r.n).map((r) => [r.u, r.n]) : []);
  const rows = [], style = [], notApplied = [], notSaved = [];
  const jobUnits = record ? record.baseline.rows.map((r) => r.u) : ret.rows.map((r) => r.u);

  const classify = (field, base, mine, theirs, hb, flags) => {
    if (hb && same(theirs, base)) return null;
    if (same(theirs, mine)) return null;
    if (flags.moved) return { cls: 'review', why: 'moved' };
    if (!hb) return { cls: 'review', why: mode === 'normal' ? 'unknown' : mode };
    if (mode !== 'normal') return { cls: 'review', why: mode };
    return same(mine, base) ? { cls: 'change', why: '' } : { cls: 'conflict', why: '' };
  };

  for (const r of ret.rows) {
    const unit = units.get(r.u);
    const jobN = nOfJob.get(r.u);
    if (!unit) { notApplied.push({ u: r.u, text: 'Drawer' + (jobN ? ' #' + jobN : '') + ' is no longer in the build - its label was left out.' }); continue; }
    if (unit.fill !== 'decor') { notApplied.push({ u: r.u, text: 'Drawer' + (jobN ? ' #' + jobN : '') + ' is now a Classic drawer - it has no label slot.' }); continue; }
    const n = nOf.get(unit.id);
    const baseRow = baseRows.get(r.u) || null;
    const hb = hasBase && !!baseRow;
    const moved = !!baseRow && !same(baseRow.g, [unit.x, unit.y, unit.w, unit.hh]);
    const flags = { moved };
    const note = [];

    const rawTrim = r.t.trim();
    const theirsText = ctx.cleanText(r.t);
    if (rawTrim.length > ctx.textMax) note.push('cut to ' + ctx.textMax + ' characters');
    const mineText = ctx.cleanText(unit.label);
    const baseText = baseRow ? ctx.cleanText(baseRow.t) : null;

    let theirsBadge, unsupplied = null;
    const b = r.b;
    if (b === null) theirsBadge = null;
    else if (b.type === 'unsupplied') { unsupplied = b.why === 'icon-only' ? 'icon-only' : 'custom'; theirsBadge = undefined; }
    else {
      const cb = ctx.cleanBadge(b);
      if (cb) theirsBadge = cb;
      else { unsupplied = 'invalid'; theirsBadge = undefined; note.push('badge not valid - not saved'); }
    }
    const mineBadge = mineText ? (ctx.cleanBadge(unit.labelBadge) || null) : null;
    const baseBadge = baseRow ? (baseRow.b ? (ctx.cleanBadge(baseRow.b) || null) : null) : null;
    if (theirsBadge === undefined) theirsBadge = baseRow ? baseBadge : mineBadge;   // "theirs = base": no change proposed

    if (unsupplied === 'custom') notApplied.push({ u: r.u, text: 'Drawer #' + n + ': a custom uploaded icon stays in the generator.' });
    if (unsupplied === 'icon-only') notSaved.push({ u: r.u, text: 'Drawer #' + n + ': icon-only label stays in the generator.' });

    const base = { u: unit.id, n, pos: posText(unit), g: [unit.x, unit.y, unit.w, unit.hh] };
    const t = classify('text', baseText, mineText, theirsText, hb, flags);
    if (t) rows.push({ ...base, field: 'text', class: t.cls, why: t.why, base: baseText, mine: mineText, theirs: theirsText, note: note.filter((x) => x.startsWith('cut')).join('; ') });
    // a cleared label returns b = null (the generator resets its badge with the words): that is not a second change
    if (theirsText) {
      const bc = classify('badge', baseBadge, mineBadge, theirsBadge, hb, flags);
      if (bc) rows.push({ ...base, field: 'badge', class: bc.cls, why: bc.why, base: baseBadge, mine: mineBadge, theirs: theirsBadge, note: note.filter((x) => !x.startsWith('cut')).join('; ') });
    }
  }

  /* label style: the same table per field, on EFFECTIVE values, so a Planner that stores nothing against a generator at its
     defaults is no change at all */
  const fixedFace = view.faceStyle !== 'edgelabel';
  const mineEff = effectiveStyle(ctx.cleanStyle(view.labelStyle));
  const baseEff = hasBase ? effectiveStyle(record.baseline.style) : null;
  const styleDropped = [];
  for (const key of STYLE_KEYS) {
    if (!(key in ret.style)) continue;
    const one = ctx.cleanStyle({ [key]: ret.style[key] });
    if (!one || !(key in one)) { styleDropped.push(key); notApplied.push({ key, text: STYLE_LABEL[key] + ' ' + String(ret.style[key]) + (STYLE_UNIT[key] || '') + ' is outside the allowed range - not saved.' }); continue; }
    const theirs = one[key];
    const c = classify('style', baseEff ? baseEff[key] : null, mineEff[key], theirs, hasBase, {});
    if (!c) continue;
    if (fixedFace) { notApplied.push({ key, text: STYLE_LABEL[key] + ': this build now uses another faceplate, so the label style is not changed.' }); continue; }
    style.push({ key, label: STYLE_LABEL[key], class: c.cls, why: c.why, base: baseEff ? baseEff[key] : null, mine: mineEff[key], theirs });
  }
  if (ret.extras > 0) notApplied.push({ text: ret.extras + ' extra label' + (ret.extras === 1 ? '' : 's') + ' you added in the generator ' + (ret.extras === 1 ? 'is' : 'are') + ' printed there only.' });

  const plan = { mode, modeText, rows, style, notApplied, notSaved, jobUnits, styleDropped, fixedFace };
  plan.sig = planSig(plan);
  return plan;
}

function planSig(plan) {
  return canon({ mode: plan.mode,
    rows: plan.rows.map((r) => [r.u, r.field, r.class, r.mine, r.theirs]),
    style: plan.style.map((s) => [s.key, s.class, s.mine, s.theirs]) });
}

/* A row's default: a change is ticked, a conflict keeps the Planner's, a review row is unticked. Keys: `u:field`, `style:key`. */
function defaultSelections(plan) {
  const sel = {};
  for (const r of plan.rows) sel[r.u + ':' + r.field] = r.class === 'change' ? true : r.class === 'conflict' ? 'planner' : false;
  for (const s of plan.style) sel['style:' + s.key] = s.class === 'change' ? true : s.class === 'conflict' ? 'planner' : false;
  return sel;
}
/* Ticks and choices the user made survive a recompute for every row whose (class, mine, theirs) did not change; a changed
   row falls back to its default (section 6.5 step 2). */
function carrySelections(oldPlan, oldSel, newPlan) {
  const next = defaultSelections(newPlan);
  const key = (it) => (it.field ? it.u + ':' + it.field : 'style:' + it.key);
  const old = new Map([...oldPlan.rows, ...oldPlan.style].map((it) => [key(it), it]));
  const changed = new Set();
  for (const it of [...newPlan.rows, ...newPlan.style]) {
    const o = old.get(key(it));
    if (o && o.class === it.class && same(o.mine, it.mine) && same(o.theirs, it.theirs) && (key(it) in oldSel)) next[key(it)] = oldSel[key(it)];
    else changed.add(key(it));
  }
  return { sel: next, changed };
}
const picked = (item, v) => (item.class === 'conflict' ? v === 'generator' : v === true);

/* What ticking does (section 6.5 step 3), as data: app.js applies it. sel: see defaultSelections.
   Merged words empty => the badge goes with them, and a ticked badge change on such a unit is skipped with a note. */
function applyPlan(view, plan, sel, ctx) {
  const ops = [], skipped = [], units = new Map(view.units.map((u) => [u.id, u]));
  const decisions = { rows: {}, style: {} };
  const byU = new Map();
  for (const r of plan.rows) { if (!byU.has(r.u)) byU.set(r.u, {}); byU.get(r.u)[r.field] = r; }
  let applied = 0;
  const decide = (item, v) => (picked(item, v) ? 'applied' : item.class === 'conflict' ? 'kept-planner' : 'not-applied');
  for (const [u, items] of byU) {
    const unit = units.get(u);
    const d = { t: 'unchanged', b: 'unchanged' };
    const wi = items.text, bi = items.badge;
    const useWords = !!wi && picked(wi, sel[u + ':text']);
    const mergedText = useWords ? wi.theirs : ctx.cleanText(unit.label);
    const op = { u, g: (wi || bi).g };
    if (wi) d.t = decide(wi, sel[u + ':text']);
    if (bi) {
      const useBadge = picked(bi, sel[u + ':badge']);
      if (useBadge && !mergedText) { skipped.push('Drawer #' + bi.n + ': an icon without words is not saved - the planner keeps a badge only with words.'); d.b = 'not-applied'; }
      else d.b = decide(bi, sel[u + ':badge']);
      if (useBadge && mergedText) op.badge = { set: bi.theirs };
    }
    if (useWords) op.text = { set: wi.theirs };
    if (d.t === 'applied') applied++;
    if (d.b === 'applied') applied++;
    decisions.rows[u] = { t: d.t, b: d.b, decision: summarize(d) };
    if (op.text || op.badge) ops.push(op);
  }
  let styleNext;
  if (plan.style.length) {
    const stored = Object.assign({}, ctx.cleanStyle(view.labelStyle) || {});
    let any = false;
    for (const s of plan.style) {
      const p = picked(s, sel['style:' + s.key]);
      decisions.style[s.key] = decide(s, sel['style:' + s.key]);
      if (p) { stored[s.key] = s.theirs; any = true; applied++; }
    }
    if (any) styleNext = ctx.cleanStyle(stored);
  }
  for (const k of STYLE_KEYS) if (!(k in decisions.style)) decisions.style[k] = (plan.styleDropped.includes(k) || plan.notApplied.some((n) => n.key === k)) ? 'not-applied' : 'unchanged';
  return { ops, styleNext, decisions, applied, skipped };
}
function summarize(d) {
  const vals = [d.t, d.b];
  if (vals.includes('applied')) return 'applied';
  if (vals.includes('not-applied')) return 'not-applied';
  if (vals.includes('kept-planner')) return 'kept-planner';
  return 'unchanged';
}

/* The state AFTER an apply, as the answer and the new baseline (section 6.5 steps 4-5). viewAfter: { units, labelStyle };
   jobUnits: the unit ids the job covered. */
function resultRows(viewAfter, jobUnits, decisions, ctx) {
  const units = new Map(viewAfter.units.map((u) => [u.id, u]));
  const rows = [], gone = [];
  for (const u of jobUnits) {
    const unit = units.get(u);
    if (!unit || unit.fill !== 'decor') { gone.push(u); continue; }
    const t = ctx.cleanText(unit.label);
    const d = (decisions && decisions.rows[u]) || { t: 'unchanged', b: 'unchanged', decision: 'unchanged' };
    rows.push({ u, t, b: t ? (ctx.cleanBadge(unit.labelBadge) || null) : null, decision: d.decision, tDecision: d.t, bDecision: d.b, g: [unit.x, unit.y, unit.w, unit.hh] });
  }
  return { rows, gone, style: effectiveStyle(ctx.cleanStyle(viewAfter.labelStyle)) };
}

/* ---- the job store (section 4.3): ONE localStorage key per job, never read-merged with another ---- */
function jobStore(storage, opts) {
  const o = opts || {};
  const now = () => (o.now ? o.now() : Date.now());
  const keys = () => { const out = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(STORE_PREFIX)) out.push(k); } return out; };
  const read = (k) => { try { const r = JSON.parse(storage.getItem(k)); return r && r.v === 1 && typeof r.jobId === 'string' ? r : null; } catch (e) { return null; } };
  const get = (jobId) => read(STORE_PREFIX + jobId);
  const scan = () => keys().map((k) => read(k)).filter(Boolean);
  const remove = (jobId) => { try { storage.removeItem(STORE_PREFIX + jobId); } catch (e) { /* gone */ } };
  /* delete what is too old, then the least recently active beyond `cap`; the record being written is never deleted */
  function prune(keep, cap) {
    const t = now();
    let recs = scan().filter((r) => r.jobId !== keep);
    for (const r of recs) if (t - (r.lastActivity || 0) > RECORD_MAX_AGE) remove(r.jobId);
    recs = scan().filter((r) => r.jobId !== keep).sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0));
    const keepOne = get(keep) ? 1 : 0;
    let over = recs.length + keepOne - cap;
    for (let i = 0; over > 0 && i < recs.length; i++, over--) remove(recs[i].jobId);
  }
  function put(rec) {
    const k = STORE_PREFIX + rec.jobId;
    const answers = Object.entries(rec.answers || {}).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, ANSWERS_KEPT);
    const toWrite = { ...rec, answers: Object.fromEntries(answers) };
    const json = JSON.stringify(toWrite);
    try { storage.setItem(k, json); }
    catch (e) {
      prune(rec.jobId, RECORDS_QUOTA_RETRY);
      try { storage.setItem(k, json); } catch (e2) { return { ok: false, reason: 'quota' }; }
    }
    prune(rec.jobId, RECORDS_MAX);
    return { ok: true };
  }
  return { get, scan, put, remove, keys };
}

return {
  JOB_ROWS_MAX, JOB_JSON_MAX, JOB_URL_MAX, RETURN_JSON_MAX, TEXT_MAX, ID_MAX, LABEL_DEFAULTS, STYLE_KEYS, STYLE_FLAGS, STORE_PREFIX,
  RECORD_MAX_AGE, RECORDS_MAX, ANSWERS_KEPT,
  canon, newId, effectiveStyle, buildLabelJob, encodeJob, legacyHash, jobUrl, measureJob, makeJobRecord,
  parseLabelReturn, mergeLabelReturn, planSig, defaultSelections, carrySelections, applyPlan, resultRows, summarize,
  badgeTag, styleText, jobStore,
};
});
