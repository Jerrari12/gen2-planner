/* =========================================================================
   REQUIREMENT SCOPE - the shared classification contract
   =========================================================================
   SOURCE OF TRUTH: gen2-planner-main/js/requirement-scope.js
   CONTRACT VERSION: 2
   ⚠ THIS FILE IS VENDORED BYTE-FOR-BYTE INTO THE VIEWER at
     viewer/js/vendor/requirement-scope.js
   Edit it HERE ONLY, then re-vendor. Both repos gate on byte equality, so a
   divergent copy fails their suites rather than quietly drifting.

   WHY IT IS SHARED, AND WHAT IS NOT SHARED
   ---------------------------------------------------------------------------
   The planner owns build legality and quantities; the viewer computes its own
   geometry, instances and counts because its architecture requires that. What
   must NOT be computed twice is the MEANING of core / option / enhancement /
   basis / reasons. Two independently authored rule engines that agree only
   because a parity test says so will eventually disagree, and the failure will
   look like a data bug rather than a policy split.
   So: the viewer keeps deriving its own facts, and passes those resolved facts
   into these pure classifiers. Policy has exactly one author.

   THE TAXONOMY
   ---------------------------------------------------------------------------
   A single `optional` boolean could not tell "you cannot build this" from
   "you cannot build it THIS WAY". A case is not-optional because nothing
   stands without it; a magnet clip is not-optional only because that drawer
   chose magnetic closure. That gap shipped a homepage claiming 8 bought items
   when the real requirement was 4.

   TWO ORTHOGONAL FACTS, never merged:
     requirement -> the OBLIGATION.  core | option | enhancement
     basis       -> the SELECTION explaining which variant is present. Legal
                    on ANY scope, and it never changes the scope. Forbidding
                    it on core is exactly what leaves feet and mount parts
                    unable to say why they are the ones here.

   THE TEST, in order:
     1. What obligation does this part satisfy?
     2. Does that obligation exist in EVERY valid build of the selected
        architecture?           -> core   (even if a variant swaps the part)
     3. Is it activated only by an independently disableable capability?
                                -> option (carries optionId)
     4. Can it be omitted with architecture and capabilities intact?
                                -> enhancement

   ⚠ "core" means core for THIS RESOLVED build, not common to every possible
   configuration. An under-table build's rails are core; changing mount
   legitimately swaps one set of core rows for another.

   THE FOUR TOTALS every consumer uses instead of improvising:
     minimum build = core
     selected plan = core + option      <- the viewer's "required"
     enhancements  = enhancement
     complete      = all three
   ========================================================================= */
(function (root, factory) {
  var api = factory();
  root.GEN2_REQ = api;                                  // classic script (both apps)
  if (typeof module === 'object' && module.exports) module.exports = api;   // node tests
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONTRACT_VERSION = 2;
  var SOURCE = 'gen2-planner-main/js/requirement-scope.js';
  var SCOPES = ['core', 'option', 'enhancement'];
  var SCOPE_RANK = { enhancement: 0, option: 1, core: 2 };

  /** An obligation present in every valid build of this architecture. */
  function core(obligationId) { return { scope: 'core', obligationId: obligationId }; }
  /** Required BECAUSE a capability was selected. `optionId` names which. */
  function option(obligationId, optionId) { return { scope: 'option', obligationId: obligationId, optionId: optionId }; }
  /** Omittable with the architecture and every selected capability intact. */
  function enhancement(obligationId) { return { scope: 'enhancement', obligationId: obligationId }; }

  /** Selection provenance. `selectedCount` is how many subjects chose it - the
   *  shared BOM stores TOTALS only; WHICH drawer stays in the viewer's assembly
   *  data, so there is deliberately no per-subject list here. */
  function basis(axis, choice, subjectType, selectedCount) {
    var b = { axis: axis, choice: choice, subjectType: subjectType };
    if (typeof selectedCount === 'number') b.selectedCount = selectedCount;
    return b;
  }

  /* ONE ROW, SEVERAL CAUSES.
     Some rows are in the bill for more than one reason at once, and the
     reasons can differ in strength - the Cover Lower is the case that forced
     this. ⚠ DO NOT SPLIT THE PHYSICAL ROW: the planner's build tracker keys on
     name+variant, so two rows for one part would share a checkbox and mark
     each other done. One row keeps the STRONGEST reason as its resolved
     `requirement` (what totals and grouping read) plus every explanation.
     ⚠ Totals read the row's resolved scope, never the reasons; a row is either
     in the minimum bill or it is not. Reasons answer "why is this here", which
     is a sentence, not a sum. */
  function resolveReasons(reasons) {
    var list = (reasons || []).filter(Boolean);
    if (!list.length) return {};
    var strongest = list.reduce(function (a, b) {
      return SCOPE_RANK[b.scope] > SCOPE_RANK[a.scope] ? b : a;
    });
    // the resolved requirement never claims an optionId unless the STRONGEST
    // reason is itself an option - a core row is not caused by an option, and
    // validate() rejects the contradiction
    var requirement = { scope: strongest.scope, obligationId: strongest.obligationId };
    if (strongest.scope === 'option' && strongest.optionId) requirement.optionId = strongest.optionId;
    return list.length === 1 ? { requirement: requirement } : { requirement: requirement, reasons: list };
  }

  /** Fail closed. Returns human-readable problems; empty means well-formed. */
  function validate(row) {
    var p = [], r = row.requirement;
    if (!r) return p;                    // unmigrated - counted by the ratchet, not fatal yet
    if (SCOPES.indexOf(r.scope) < 0) p.push('bad scope ' + JSON.stringify(r.scope));
    if (!r.obligationId) p.push('no obligationId');
    if (r.scope === 'option' && !r.optionId) p.push('option scope without an optionId');
    if (r.scope !== 'option' && r.optionId) p.push('optionId on a ' + r.scope + ' row');

    function checkBasis(b, where) {
      if (!b) return;
      if (!b.axis || !b.choice) p.push(where + 'basis needs an axis and a choice');
      if (['build', 'unit'].indexOf(b.subjectType) < 0) p.push(where + 'bad basis.subjectType ' + JSON.stringify(b.subjectType));
      if ('selectedCount' in b && !(b.selectedCount > 0)) p.push(where + 'basis.selectedCount must be a positive count');
    }
    checkBasis(row.basis, '');

    if (row.reasons) {
      if (row.reasons.length < 2) p.push('reasons is for rows with SEVERAL causes - drop it or add the others');
      var strongest = -1;
      row.reasons.forEach(function (rr, i) {
        var w = 'reason ' + i + ': ';
        if (SCOPES.indexOf(rr.scope) < 0) p.push(w + 'bad scope ' + JSON.stringify(rr.scope));
        if (!rr.obligationId) p.push(w + 'no obligationId');
        if (rr.scope === 'option' && !rr.optionId) p.push(w + 'option scope without an optionId');
        checkBasis(rr.basis, w);
        var rank = SCOPE_RANK[rr.scope];
        if (rank > strongest) strongest = rank;
      });
      // ⚠ the row's scope MUST equal the strongest reason, or the bill and the
      // explanation disagree - billed one way, explained another
      if (strongest >= 0 && SCOPE_RANK[r.scope] !== strongest) {
        p.push('row scope "' + r.scope + '" is not the strongest of its reasons');
      }
    }
    return p.map(function (m) { return (row.name || 'row') + ': ' + m; });
  }

  /* ---- the four totals, so no consumer invents its own ---- */
  var isEnhancement = function (row) { return row.requirement && row.requirement.scope === 'enhancement'; };
  var isCore = function (row) { return row.requirement && row.requirement.scope === 'core'; };
  /** What the build minimally requires. */
  function minimumRows(rows) { return (rows || []).filter(isCore); }
  /** What the SELECTED plan requires - core plus the options actually chosen.
   *  ⚠ This, not `core`, is the viewer's "required": instructions must never
   *  tell someone to skip the magnets they chose. */
  function selectedPlanRows(rows) { return (rows || []).filter(function (r) { return r.requirement && !isEnhancement(r); }); }
  function enhancementRows(rows) { return (rows || []).filter(isEnhancement); }

  /** One human sentence for WHY a row is required, for cards and BOM UI.
   *  "Required with magnetic closure" beats a generic "Required". */
  function explain(row, labels) {
    var L = labels || {};
    var r = row && row.requirement;
    if (!r) return '';
    var causes = row.reasons && row.reasons.length ? row.reasons : [r];
    var opts = causes.filter(function (c) { return c.scope === 'option' && c.optionId; });
    if (opts.length) {
      var named = opts.map(function (c) { return L[c.optionId] || c.optionId; });
      return 'Required with ' + named.join(' and ');
    }
    if (r.scope === 'core') {
      var withBasis = (row.reasons || []).concat([row]).find
        ? (row.reasons || [row]).filter(function (c) { return c.basis; })[0]
        : null;
      var b = (withBasis && withBasis.basis) || row.basis;
      return b ? 'Required for ' + (L[b.axis + ':' + b.choice] || b.choice) + ' builds' : 'Required';
    }
    return 'Optional';
  }

  return {
    CONTRACT_VERSION: CONTRACT_VERSION,
    SOURCE: SOURCE,
    SCOPES: SCOPES,
    SCOPE_RANK: SCOPE_RANK,
    core: core,
    option: option,
    enhancement: enhancement,
    basis: basis,
    resolveReasons: resolveReasons,
    validate: validate,
    minimumRows: minimumRows,
    selectedPlanRows: selectedPlanRows,
    enhancementRows: enhancementRows,
    explain: explain
  };
}));
