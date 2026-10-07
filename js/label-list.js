/* GEN2 EdgeLabel generator - THE LABEL LIST (2026-10-06): one format for a build's labels, a standalone label project and AI
   input. Spec: D:/MODULITH/handoffs/label-release/LABEL-LIST-FORMAT.md (design review Sol 01a11238); the decisions behind it:
   the MODULITH vault, decisions.md, "The label tool: one fast tool, one label-list format, the build as the store".

   Three things are kept apart: a PART RECORD (what the item is), a LABEL (how it is described and shown) and an ASSIGNMENT
   (which drawer carries it). A label can exist with no drawer, one label can be carried by several drawers, and an
   unassigned label is still printable.

   Everything here is pure: no DOM, no storage, no window. Loaded as a classic script (exposes GEN2LabelList) and, under node,
   as a CommonJS module. The GEN2 Planner vendors this exact file (sha-pinned); its contract test runs the planner's own
   cleanLabelText / cleanLabelBadge and cleanText / cleanBadge here on the same inputs, so the two can never disagree about
   what a drawer's label IS.

   Validation (validateLabelList) and fit are separate: a valid label may not fit the EdgeLabel label and still fit a larger
   one. Nothing here measures a label. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.GEN2LabelList = api;
})(typeof window !== 'undefined' ? window : null, function () {
'use strict';

const FORMAT = 'modulith-labels';
const VERSION = 1;
const ID_RE = /^[a-z0-9]{8,32}$/;           // the planner's BUILD_ID_RE and label-link.js ID_RE
const ICON_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_ID_MAX = 40;
const TEXT_MAX = 200;                        // the format's own bound on a label's words
const MIRROR_MAX = 40;                       // the planner's LABEL_MAX: unit.label, the mirror older tools read
const CHAR_MAX = 4;                          // the planner's GEN2.labelSpec.charMax: a letter / number badge
const SVG_MAX = 64 * 1024;                   // an uploaded icon (standalone projects only, never a build)
const COPIES_MAX = 99;
const PINS_MAX = 32;
const PIN_RE = /^[a-z_]+(?:\.[a-z_]+)*$/;    // a part-record field path: thread.diameter, length.value
const PART_SCHEMA = 'part-record/1';
const PART_MAX = 16 * 1024;                  // characters of JSON of one part snapshot, NOT counting its photo
const PHOTO_MAX = 256 * 1024;                // a part's own photo (a data: URL), kept in a full project, never in a build
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const STYLE_LIMITS = { capMm: [2, 6.5], depth: [0.2, 1.2], badgeSize: [4, 22] };   // label-link.js STYLE_LIMITS
const HW_ITEM = 'part-picker-label-item/1';  // a HARDWARE label's layout input: the Part Picker's label item (step 3)
// the generator's own import limits for a hardware item (index.html HW_MAX): they bound the layout's 3^n search
const HW_MAX = { printable: 8, attributes: 24, fields: 6, text: 60, json: 8 * 1024 };
const STYLE_FLAGS = ['bold', 'allCaps', 'predictIcons'];

const isObj = (v) => Object.prototype.toString.call(v) === '[object Object]';
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const copy = (v) => JSON.parse(JSON.stringify(v));
function canon(v) {   // JSON with sorted keys: two values are "the same" when their canon is
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

function newLabelId() {
  const a = new Uint8Array(12);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}
function freshId(taken) {
  let id;
  do { id = newLabelId(); } while (taken.has(id));
  taken.add(id);
  return id;
}

/* ---- what a drawer's label IS, in the planner's terms (its contract test runs both on the same inputs) ---- */

// the planner's cleanLabelText: trim, THEN cut. The mirror cuts to 40; the format's own bound is TEXT_MAX.
function cleanText(v, max = MIRROR_MAX) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// the planner's cleanLabelBadge exactly - plus, where opts.svg allows it (a standalone project, AI input; never a build), an
// uploaded icon { type: 'icon', svg }, its id optional. Absent (null) = let the generator predict from the words.
function cleanBadge(b, opts) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'none') return { type: 'none' };
  if (b.type === 'icon') {
    const idOk = typeof b.value === 'string' && b.value.length <= ICON_ID_MAX && ICON_ID_RE.test(b.value);
    const svgOk = !!(opts && opts.svg) && typeof b.svg === 'string' && b.svg.length <= SVG_MAX && /^\s*<svg[\s>/]/i.test(b.svg);
    if (svgOk) return idOk ? { type: 'icon', value: b.value, svg: b.svg } : { type: 'icon', svg: b.svg };
    return idOk ? { type: 'icon', value: b.value } : null;
  }
  if (b.type === 'char' && typeof b.value === 'string') {
    const v = b.value.trim();
    if (v && v.length <= CHAR_MAX) return { type: 'char', value: v };
  }
  return null;
}

function cleanStyle(s) {   // the planner's cleanLabelStyle: in range and typed, or DROPPED (never clamped); {} -> null
  if (!isObj(s)) return null;
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(STYLE_LIMITS)) {
    const v = s[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v;
  }
  for (const k of STYLE_FLAGS) if (typeof s[k] === 'boolean') out[k] = s[k];
  return Object.keys(out).length ? out : null;
}

/* ---- one label ---- */

// a HARDWARE label's item (label tool step 3): the Part Picker's part-picker-label-item/1, the whole input of the hardware layout
// (hardware-layout.js) - the value's fields, the attribute texts with their field paths, which are pinned and which optional.
// It is label CONTENT, kept in a build like an uploaded icon. Checked exactly as the generator's import checks it.
function cleanHardware(h) {
  if (!isObj(h) || h.schema !== HW_ITEM || typeof h.id !== 'string' || !h.id || h.id.length > 64) return null;
  const strs = (a, max) => Array.isArray(a) && a.length <= max && a.every((x) => typeof x === 'string' && x.length <= HW_MAX.text);
  if (!strs(h.fields, HW_MAX.fields)) return null;
  if (!Array.isArray(h.attributes) || h.attributes.length > HW_MAX.attributes) return null;
  if (!h.attributes.every((a) => isObj(a) && typeof a.path === 'string' && typeof a.text === 'string' && a.text.length <= HW_MAX.text)) return null;
  for (const k of ['pinned', 'optional']) if (h[k] !== undefined && !strs(h[k], HW_MAX.printable)) return null;
  const printable = [...(h.pinned || []), ...(h.optional || [])];
  if (printable.length > HW_MAX.printable || !printable.every((p) => h.attributes.some((a) => a.path === p))) return null;
  let out;
  try { out = copy(h); } catch (e) { return null; }
  return JSON.stringify(out).length <= HW_MAX.json ? out : null;
}
const isHardware = (l) => !!l && isObj(l.hardware);

// a part snapshot: a part-record/1 with a family, at most PART_MAX characters of JSON besides its photo. The photo is judged on
// its own (Astra 2026-10-06: a compact build leaves it out, but the full project backup must not lose it silently).
function partOk(p) {
  if (!isObj(p) || p.schema !== PART_SCHEMA || typeof p.family !== 'string' || !p.family) return false;
  if (p.photo !== undefined && !photoOk(p.photo)) return false;
  try { return JSON.stringify(Object.assign({}, p, { photo: undefined })).length <= PART_MAX; } catch (e) { return false; }
}
const photoOk = (v) => typeof v === 'string' && v.length <= PHOTO_MAX && PHOTO_RE.test(v);
function cleanPins(p) {
  if (!Array.isArray(p) || p.length > PINS_MAX || !p.every((x) => typeof x === 'string' && PIN_RE.test(x))) return null;
  return [...new Set(p)];
}

// One label from untrusted data, or null when it is not a label at all. Unknown keys are KEPT, verbatim, so a newer tool's
// data survives this one. opts.inBuild: the COMPACT form a planner build stores - no part PHOTO (a reference, not label
// content, and too big for a share link); the FULL form (a standalone project, the backup) keeps it, and a part whose photo is
// malformed or too big keeps its record and loses only the photo (validation says so). An uploaded ICON is label content and
// is kept in BOTH forms (Astra 2026-10-06: a build must reproduce its labels; a build too big for a share link gets a
// full-file route, never a silently stripped icon).
function cleanLabel(l, opts) {
  const inBuild = !!(opts && opts.inBuild);
  if (!isObj(l) || typeof l.text !== 'string' || l.text.length > TEXT_MAX) return null;
  let out;
  try { out = copy(l); } catch (e) { return null; }
  if (!(typeof l.id === 'string' && ID_RE.test(l.id))) delete out.id;   // minted by cleanLabelList
  if ('badge' in out) {
    const b = cleanBadge(l.badge, { svg: true });
    if (b) out.badge = b; else delete out.badge;
  }
  if ('part' in out) {
    if (isObj(out.part) && (inBuild || !photoOk(out.part.photo))) delete out.part.photo;
    if (!partOk(out.part)) delete out.part;
  }
  if ('pins' in out) { const p = cleanPins(l.pins); if (p) out.pins = p; else delete out.pins; }
  if ('copies' in out && !isInt(l.copies, 1, COPIES_MAX)) delete out.copies;
  if ('hardware' in out) { const h = cleanHardware(l.hardware); if (h) out.hardware = h; else delete out.hardware; }
  return out;
}

/* What a label SHOWS (Astra 2026-10-06): text only, icon only, and text with an icon are all labels; neither is an EMPTY label,
   which stays in a list but is never assigned to a drawer (Sol 01a11238, finding 2: the mirror cannot carry it, and the next
   load would read it as an older tool clearing the drawer). A visible badge is an icon (by id or an uploaded SVG - kept in a
   build too) or a letter; { type: 'none' } and an absent badge show nothing when there are no words (prediction needs words).
   (`opts` is accepted for older callers and ignored.) */
const hasWords = (l) => !!l && cleanText(l.text) !== '';
function visibleBadge(l, opts) {
  const b = l ? cleanBadge(l.badge, { svg: true }) : null;
  return !!b && (b.type === 'char' || (b.type === 'icon' && (!!b.value || !!b.svg)));
}
const iconOnly = (l, opts) => !hasWords(l) && visibleBadge(l, opts);
const isEmpty = (l, opts) => !hasWords(l) && !visibleBadge(l, opts);
const assignable = (l) => !!l && !isEmpty(l, { inBuild: true });

/* ---- the list ---- */

// opts.inBuild: the planner's labelList (no style, no output, no part photo). Malformed labels are dropped;
// a missing or duplicate id gets a fresh one (the first label keeps a shared id). Unknown top-level keys are kept.
function cleanLabelList(doc, opts) {
  const inBuild = !!(opts && opts.inBuild);
  const src = isObj(doc) ? doc : {};
  const out = {};
  for (const k of Object.keys(src)) if (!['format', 'version', 'labels', 'style', 'output', 'assignments'].includes(k)) {
    try { out[k] = copy(src[k]); } catch (e) { /* not JSON: dropped */ }
  }
  out.format = FORMAT; out.version = VERSION;
  const taken = new Set();
  out.labels = [];
  for (const l of Array.isArray(src.labels) ? src.labels : []) {
    const c = cleanLabel(l, { inBuild });
    if (!c) continue;
    if (!c.id || taken.has(c.id)) c.id = freshId(taken); else taken.add(c.id);
    out.labels.push(c);
  }
  if (!inBuild) {
    const st = cleanStyle(src.style);
    if (st) out.style = st;
    if (isObj(src.output)) { try { out.output = copy(src.output); } catch (e) { /* dropped */ } }
  }
  return out;
}

// assignments: drawer unit id (decimal string) -> label id. Kept only when the unit is one of unitIds (when given), the label
// exists in the list, and it is assignable.
function cleanAssignments(assign, list, unitIds) {
  const out = {};
  if (!isObj(assign)) return out;
  const byId = new Map(((list && list.labels) || []).map((l) => [l.id, l]));
  const units = unitIds ? new Set([...unitIds].map(String)) : null;
  for (const [k, v] of Object.entries(assign)) {
    if (!/^[1-9]\d{0,9}$/.test(k) || (units && !units.has(k))) continue;
    if (typeof v === 'string' && assignable(byId.get(v))) out[k] = v;
  }
  return out;
}

/* ---- the mirror older tools read, and reconciling it on load ---- */

// what a drawer's mirror says for a label: the words cut to 40, the badge as older tools know it - a built-in icon id or a
// letter; an UPLOADED icon is beyond them, so its mirror has no badge and an older tool shows the words with its own predicted
// icon (a documented degradation; the build itself keeps the artwork). An
// icon-only label has NO mirror: an older tool cannot show a drawer with an icon and no words (it degrades to an empty drawer).
function mirrorOfLabel(l) {
  const label = cleanText(l.text);
  if (!label) return null;
  const b = cleanBadge(l.badge);
  return b ? { label, labelBadge: b } : { label };
}
// { unitId: { label, labelBadge? } } for every assigned drawer
function mirrorOf(list, assignments) {
  const byId = new Map(((list && list.labels) || []).map((l) => [l.id, l]));
  const out = {};
  for (const [k, id] of Object.entries(assignments || {})) {
    const m = byId.get(id) && mirrorOfLabel(byId.get(id));
    if (m) out[k] = m;
  }
  return out;
}

/* Reconcile the units' mirror with the list (LABEL-LIST-FORMAT.md section 3, step 3). `units` are the planner's units as its
   sanitizer leaves them: unit.label through cleanLabelText, unit.labelBadge through cleanLabelBadge and only with words.
   Drawers are processed in the planner's one drawer order (y, then x); a label created here is appended in that order.
   - mirror words, no assignment (an older tool added a label): a new label from the mirror, assigned;
   - an assignment whose label's mirror equals the drawer's: kept;
   - an assignment whose label's mirror differs (an older tool edited the drawer): the mirror wins FOR THIS DRAWER ONLY - a new
     label from the mirror, the drawer reassigned; the old label stays (still on any other drawer that carries it);
   - an assignment with no mirror words (an older tool cleared the drawer): unassigned; the label stays in the list.
   opts.editInPlace (the planner's live sync) changes the last two for a PLAIN label carried by that one drawer only: an edit
   changes it in place, and clearing the words deletes it (kinds 'edited-in-place', 'removed-in-place').
   A build with no list converts by the same rules: one new label per labelled drawer, no deduplication, badge absence kept.
   Returns { list, assignments, changes }. `changes` lists the drawer-level reconciliations only; an assignment naming a drawer
   that is gone, or a label that is gone or has no words, is dropped without an entry (removing a drawer removes its
   assignment). When the mirror matches, `changes` is empty and a second reconcile returns the same list and assignments. */
function reconcile(units, list, assignments, opts) {
  const inPlace = !!(opts && opts.editInPlace);
  const base = list ? cleanLabelList(list, { inBuild: true }) : { format: FORMAT, version: VERSION, labels: [] };
  const labels = base.labels;
  const byId = new Map(labels.map((l) => [l.id, l]));
  const taken = new Set(byId.keys());
  const assign = cleanAssignments(assignments, base, (units || []).map((u) => u.id));
  const out = {};
  const changes = [];
  const fromMirror = (words, badge) => {
    const l = { id: freshId(taken), text: words };
    if (badge) l.badge = badge;
    labels.push(l); byId.set(l.id, l);
    return l.id;
  };
  // a plain label (no hardware item, no part record) on exactly one drawer: what that drawer's field may edit or delete
  const soleCarrier = (l) => !isHardware(l) && !l.part && Object.values(assign).filter((v) => v === l.id).length === 1;
  const ordered = (units || []).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const u of ordered) {
    const key = String(u.id);
    const words = cleanText(u.label);
    const badge = words ? cleanBadge(u.labelBadge) : null;
    const l = byId.get(assign[key]);
    if (!l) {
      if (words) { out[key] = fromMirror(words, badge); changes.push({ unit: u.id, kind: 'added', label: out[key] }); }
      continue;
    }
    if (!words) {
      // an ICON-ONLY label: no older tool can show or clear an icon-only drawer (the old planner keeps a badge only with
      // words), so a mirror with no words says nothing about it - the assignment stands. Words in the mirror (below) mean an
      // older tool typed a name there: that is an edit.
      if (iconOnly(l, { inBuild: true })) { out[key] = l.id; continue; }
      // opts.editInPlace: clearing a drawer's words deletes a PLAIN label carried by that drawer alone - the field IS that
      // label, and leaving its last words in the tray would turn every cleared or retyped name into a stray label. A hardware
      // or part label, or a shared one, is only unassigned (back in the tray); the tray's Unassign is the explicit way back.
      if (inPlace && soleCarrier(l)) {
        labels.splice(labels.indexOf(l), 1); byId.delete(l.id);
        changes.push({ unit: u.id, kind: 'removed-in-place', label: l.id }); continue;
      }
      changes.push({ unit: u.id, kind: 'cleared', label: l.id }); continue;
    }
    const m = mirrorOfLabel(l);
    if (m && m.label === words && canon(m.labelBadge || null) === canon(badge)) { out[key] = l.id; continue; }
    // opts.editInPlace (the planner's live sync, label tool step 3): a PLAIN label carried by this drawer alone takes the edit
    // in place, so typing in a drawer's field does not leave the old words behind as an unassigned label. A hardware or part
    // label, or one shared by other drawers, still gets a new label for this drawer only: its structure and its other drawers
    // never change behind the user's back.
    if (inPlace && soleCarrier(l)) {
      l.text = words;
      // the mirror carries a built-in icon id or a letter, never an UPLOADED icon: when the label's badge is one the mirror
      // cannot show, a mirror with no badge says nothing about it, and the icon stays (typing a word used to delete it)
      if (badge) l.badge = badge; else if (!(visibleBadge(l) && !cleanBadge(l.badge))) delete l.badge;
      out[key] = l.id;
      changes.push({ unit: u.id, kind: 'edited-in-place', label: l.id });
      continue;
    }
    out[key] = fromMirror(words, badge);
    changes.push({ unit: u.id, kind: 'edited', from: l.id, label: out[key] });
  }
  const outList = Object.assign({}, base, { labels });
  return { list: outList, assignments: out, changes };
}
const fromLegacyUnits = (units) => reconcile(units, null, null);

/* ---- today's generator project file -> a standalone label list (LABEL-LIST-FORMAT.md section 4) ----
   { fmt, v: 1, labels: [{ text, badge, manual, u?, n?, held? }], settings: { <input id>: value } }:
   - a badge with manual:false came from prediction, so it becomes ABSENT (predict), never a frozen snapshot (Astra); a manual
     badge is kept, an uploaded icon as { type: 'icon', svg };
   - the six label settings map to `style` through label-link.js's STYLE_INPUT (dropped when missing or out of range); every
     other setting (printer preset, plate, export format, colours) goes to `output` unchanged;
   - the link-only keys (u, n, held) are not label data and are not carried. */
const STYLE_INPUT = { capMm: 'font-size', depth: 'text-depth', badgeSize: 'badge-size', bold: 'bold-text', allCaps: 'all-caps', predictIcons: 'predict-icons' };
function fromGeneratorProject(project) {
  const p = isObj(project) ? project : {};
  const labels = (Array.isArray(p.labels) ? p.labels : []).filter(isObj).map((l) => {
    const out = { text: typeof l.text === 'string' ? l.text : '' };
    if (l.manual && l.badge) { const b = cleanBadge(l.badge, { svg: true }); if (b) out.badge = b; }
    return out;
  });
  const settings = isObj(p.settings) ? p.settings : {};
  const style = {}; const output = {};
  const inputOf = new Map(Object.entries(STYLE_INPUT).map(([k, id]) => [id, k]));
  for (const [id, v] of Object.entries(settings)) {
    const k = inputOf.get(id);
    if (!k) { output[id] = v; continue; }
    style[k] = STYLE_FLAGS.includes(k) ? (typeof v === 'boolean' ? v : undefined) : (v === '' || v === null ? undefined : Number(v));
  }
  const doc = { format: FORMAT, version: VERSION, labels };
  const st = cleanStyle(style);
  if (st) doc.style = st;
  if (Object.keys(output).length) doc.output = output;
  return cleanLabelList(doc);
}

/* ---- editing: state = { list, assignments } in, a new state out (never mutated) ---- */

const clone = (state) => ({ list: copy(state.list), assignments: Object.assign({}, state.assignments) });
function assignedUnits(state, labelId) {
  return Object.entries(state.assignments || {}).filter(([, v]) => v === labelId).map(([k]) => Number(k)).sort((a, b) => a - b);
}
function addLabel(state, label, opts) {
  const c = cleanLabel(label, opts);
  if (!c) return { ok: false, reason: 'not a label', state };
  const s = clone(state);
  c.id = freshId(new Set(s.list.labels.map((l) => l.id)));
  s.list.labels.push(c);
  return { ok: true, state: s, id: c.id };
}
// append labels from an import (a planner tray upload, a #labels-add= link): each is cleaned like any label, keeps its id when the
// list does not already use it, and otherwise gets a fresh one (Sol 01a112c2 finding 3: an import never overwrites a label and
// never creates a duplicate id). Returns { state, added: [ids], remapped, dropped }.
function appendLabels(state, labels, opts) {
  const s = clone(state);
  const taken = new Set(s.list.labels.map((l) => l.id));
  const added = []; let remapped = 0; let dropped = 0;
  for (const l of Array.isArray(labels) ? labels : []) {
    const c = cleanLabel(l, opts || { inBuild: true });
    if (!c) { dropped++; continue; }
    if (!c.id || taken.has(c.id)) { if (c.id) remapped++; c.id = freshId(taken); } else taken.add(c.id);
    s.list.labels.push(c);
    added.push(c.id);
  }
  return { state: s, added, remapped, dropped };
}
// assign a label to a drawer. `replaced` names the label it displaces, so a UI can make a replacement explicit before calling.
function assign(state, unitId, labelId) {
  const l = state.list.labels.find((x) => x.id === labelId);
  if (!l) return { ok: false, reason: 'no such label', state };
  if (!assignable(l)) return { ok: false, reason: 'an empty label (no words and no icon) cannot be assigned to a drawer', state };
  const s = clone(state);
  const key = String(unitId);
  const replaced = s.assignments[key] && s.assignments[key] !== labelId ? s.assignments[key] : null;
  s.assignments[key] = labelId;
  return { ok: true, state: s, replaced };
}
function unassign(state, unitId) {
  const s = clone(state);
  delete s.assignments[String(unitId)];
  return { ok: true, state: s };
}
const removeDrawer = unassign;   // removing a drawer removes its assignment, never the prepared label

// edit a label. scope 'all' changes it everywhere it is assigned; scope 'this' (with unitId) changes only that drawer: when the
// label is shared, a clone carries the edit and the drawer is reassigned to it, so independent drawers never change.
function editLabel(state, labelId, patch, scope, unitId) {
  const i = state.list.labels.findIndex((x) => x.id === labelId);
  if (i < 0) return { ok: false, reason: 'no such label', state };
  if (scope !== 'all' && scope !== 'this') return { ok: false, reason: 'scope must be "this" or "all"', state };
  const merged = Object.assign(copy(state.list.labels[i]), copy(patch || {}));
  for (const k of Object.keys(patch || {})) if (patch[k] === undefined || patch[k] === null) delete merged[k];
  const c = cleanLabel(merged, { inBuild: true });
  if (!c) return { ok: false, reason: 'not a label', state };
  const s = clone(state);
  const shared = assignedUnits(state, labelId);
  if (scope === 'this' && unitId !== undefined && unitId !== null && shared.length > 1 && shared.includes(Number(unitId))) {
    c.id = freshId(new Set(s.list.labels.map((l) => l.id)));
    s.list.labels.splice(i + 1, 0, c);
    s.assignments[String(unitId)] = c.id;
    return { ok: true, state: s, id: c.id, cloned: true };
  }
  c.id = labelId;
  s.list.labels[i] = c;
  // an edit that leaves a label EMPTY (no words, no icon) unassigns it everywhere; it stays in the list
  if (!assignable(c)) for (const u of shared) delete s.assignments[String(u)];
  return { ok: true, state: s, id: labelId, cloned: false };
}

/* ---- validation: plain-word problems, never a silent repair (the cleaner drops what this reports) ---- */

function validateLabelList(doc, opts) {
  const p = [];
  const say = (m) => p.push(m);
  if (!isObj(doc)) { say('This is not a label list (it must be a JSON object).'); return p; }
  if (doc.format !== FORMAT) say(`The "format" must be "${FORMAT}".`);
  if (!isInt(doc.version, 1, 1e6)) say('The "version" must be a whole number.');
  else if (doc.version > VERSION) say(`This list was made by a newer version (${doc.version}); this tool reads version ${VERSION}.`);
  if (!Array.isArray(doc.labels)) { say('The list must have a "labels" array.'); return p; }
  const ids = new Map();
  doc.labels.forEach((l, i) => {
    const n = `Label ${i + 1}`;
    if (!isObj(l)) { say(`${n} is not an object.`); return; }
    if (l.id !== undefined) {
      if (typeof l.id !== 'string' || !ID_RE.test(l.id)) say(`${n}: the id must be 8-32 lowercase letters and digits.`);
      else if (ids.has(l.id)) say(`${n}: the id "${l.id}" is already used by label ${ids.get(l.id) + 1}.`);
      else ids.set(l.id, i);
    }
    if (typeof l.text !== 'string') say(`${n}: "text" must be a string (it can be empty).`);
    else if (l.text.length > TEXT_MAX) say(`${n}: the text is longer than ${TEXT_MAX} characters.`);
    if (l.badge !== undefined && !cleanBadge(l.badge, { svg: true })) {
      say(`${n}: the badge must be {"type":"none"}, {"type":"icon","value":"<icon id>"}, an uploaded {"type":"icon","svg":"<svg ...>"}, or {"type":"char","value":"<up to ${CHAR_MAX} characters>"}.`);
    }
    if (l.part !== undefined) {
      const noPhoto = isObj(l.part) ? Object.assign({}, l.part, { photo: undefined }) : l.part;
      if (!partOk(noPhoto)) say(`${n}: "part" must be a ${PART_SCHEMA} record (with a "family"), at most ${PART_MAX} characters of JSON besides its photo.`);
      else if (l.part.photo !== undefined && !photoOk(l.part.photo)) say(`${n}: the part's photo must be a JPEG, PNG or WebP data URL under ${PHOTO_MAX / 1024} KB; it will be left out (the part record is kept).`);
    }
    if (l.pins !== undefined && !cleanPins(l.pins)) say(`${n}: "pins" must be a list of up to ${PINS_MAX} field paths such as "thread.diameter".`);
    if (l.copies !== undefined && !isInt(l.copies, 1, COPIES_MAX)) say(`${n}: "copies" must be a whole number from 1 to ${COPIES_MAX} (how many of this label to print).`);
    if (l.hardware !== undefined && !cleanHardware(l.hardware)) say(`${n}: "hardware" must be a ${HW_ITEM} item (fields, attributes with their paths, pinned and optional among them; at most ${HW_MAX.printable} printable attributes and ${HW_MAX.text}-character texts); it will be left out (the words are kept).`);
  });
  if (doc.style !== undefined && doc.style !== null) {
    if (!isObj(doc.style)) say('"style" must be an object.');
    else for (const k of Object.keys(doc.style)) {
      if (STYLE_LIMITS[k]) { const [lo, hi] = STYLE_LIMITS[k]; const v = doc.style[k]; if (!(typeof v === 'number' && v >= lo && v <= hi)) say(`Style "${k}" must be a number from ${lo} to ${hi}.`); }
      else if (STYLE_FLAGS.includes(k)) { if (typeof doc.style[k] !== 'boolean') say(`Style "${k}" must be true or false.`); }
      else say(`Style "${k}" is not a label setting this tool knows.`);
    }
  }
  if (doc.assignments !== undefined) {
    if (!isObj(doc.assignments)) say('"assignments" must be an object of drawer id -> label id.');
    else for (const [k, v] of Object.entries(doc.assignments)) {
      if (!/^[1-9]\d{0,9}$/.test(k)) say(`Assignment "${k}": a drawer id is a positive whole number.`);
      const at = typeof v === 'string' ? ids.get(v) : undefined;
      if (at === undefined) say(`Assignment for drawer ${k}: no label has the id "${v}".`);
      else if (isEmpty(doc.labels[at])) say(`Assignment for drawer ${k}: label ${at + 1} is empty (no words and no icon), so it cannot go on a drawer.`);
    }
  }
  return p;
}

return {
  FORMAT, VERSION, ID_RE, TEXT_MAX, MIRROR_MAX, CHAR_MAX, COPIES_MAX, PART_SCHEMA, STYLE_LIMITS, STYLE_FLAGS, HW_ITEM, HW_MAX,
  canon, newLabelId, cleanText, cleanBadge, cleanStyle, cleanLabel, cleanLabelList, cleanAssignments, assignable,
  hasWords, visibleBadge, iconOnly, isEmpty, cleanHardware, isHardware,
  mirrorOfLabel, mirrorOf, reconcile, fromLegacyUnits, STYLE_INPUT, fromGeneratorProject,
  assignedUnits, addLabel, appendLabels, assign, unassign, removeDrawer, editLabel,
  validateLabelList,
};
});
