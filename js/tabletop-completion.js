/* =========================================================================
   TABLETOP COMPLETION - the shared "is the top finished yet" contract
   =========================================================================
   SOURCE OF TRUTH: gen2-planner-main/js/tabletop-completion.js
   CONTRACT VERSION: 1
   ⚠ THIS FILE IS VENDORED BYTE-FOR-BYTE INTO THE VIEWER at
     viewer/js/vendor/tabletop-completion.js
   Edit it HERE ONLY, then copy it there. Both repos pin its sha256
   (planner: test/tabletop-completion.test.mjs; viewer:
   test/tabletop-completion-vendor.test.mjs, which also asserts byte equality
   with this file whenever the planner checkout is present), so an edit on
   either side fails a suite until both move together. A lighter chain than
   requirement-scope's receipt + sync tool, on purpose: two consumers, no
   policy taxonomy, one pure function.

   WHY IT IS SHARED
   ---------------------------------------------------------------------------
   While a tabletop kit is being laid out column by column, one column is
   shorter than the tallest for a while. The planner draws that missing
   volume on its board as guidance; the viewer renders the same volume as
   ghost boxes on the live preview. Two implementations of "what is missing"
   would drift, and the drift would read as a bug in whichever tool a person
   happened to be looking at. So the deficit is computed here, once, and both
   tools render what it returns.

   THE RULE (2026-08-23, replacing the planner's global flat-top check)
   ---------------------------------------------------------------------------
   Completeness is PER CONTIGUOUS OCCUPIED RUN of columns. A run's target is
   its tallest column's top; every column in the run must reach that target,
   because the covers tie a run together and cannot attach until it is level.
   Two separate stacks of different heights are each complete - they share no
   cover and no structure, so the old global rule (every column on the board
   at one height) was a false positive, and guided completion would have made
   it worse by drawing missing volume over a finished short stack.

   WHAT THIS IS NOT
   ---------------------------------------------------------------------------
   Not a structural validator. Floating units, illegal sizes, overlaps and
   mount-specific limits are errors that BLOCK, and they take precedence over
   completion guidance; the caller decides that order. This only answers:
   given these units, which empty cells must be filled before every run's top
   is level, and how many connected areas do they form.

   COORDINATES: the planner's grid. x = column index, y = half-row index from
   the TOP of the grid (smaller = higher), w = width in columns, hh = height in
   half-rows. The viewer converts to its own bottom-origin millimetres.

   OUTPUT: { complete, runs, columns, cells, areas }
     runs    [{ c0, c1, top }]   contiguous occupied column runs and each
                                  run's target top (its smallest y)
     columns [{ x, y0, y1 }]     per SHORT column, the deficit span of
                                  half-rows [y0, y1): y0 = the run's target,
                                  y1 = the column's own top
     cells   [{ x, y }]          every missing cell (one per half-row)
     areas   [{ cells, x0, x1, y0, y1 }]  4-connected components of the cells
                                  - what a person counts as "one area to
                                  fill". A staircase deficit is ONE area even
                                  though it needs several boxes to draw; two
                                  deficits separated by a complete column are
                                  two. Render primitives never define areas.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GEN2_TABLETOP = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var CONTRACT_VERSION = 1;

  function completion(placed) {
    var colTop = new Map();
    (placed || []).forEach(function (p) {
      for (var dx = 0; dx < p.w; dx++) {
        var c = p.x + dx;
        colTop.set(c, colTop.has(c) ? Math.min(colTop.get(c), p.y) : p.y);
      }
    });
    var cols = Array.from(colTop.keys()).sort(function (a, b) { return a - b; });
    var runs = [];
    cols.forEach(function (c) {
      var r = runs[runs.length - 1];
      if (r && r.c1 === c - 1) { r.c1 = c; r.top = Math.min(r.top, colTop.get(c)); }
      else runs.push({ c0: c, c1: c, top: colTop.get(c) });
    });
    var cells = [], columns = [];
    runs.forEach(function (r) {
      for (var c = r.c0; c <= r.c1; c++) {
        var t = colTop.get(c);
        if (t > r.top) {
          columns.push({ x: c, y0: r.top, y1: t });
          for (var y = r.top; y < t; y++) cells.push({ x: c, y: y });
        }
      }
    });
    // 4-connected components of the deficit cells
    var key = function (x, y) { return x + ',' + y; };
    var set = new Set(cells.map(function (c) { return key(c.x, c.y); }));
    var seen = new Set(), areas = [];
    cells.forEach(function (c) {
      var k = key(c.x, c.y);
      if (seen.has(k)) return;
      seen.add(k);
      var comp = [], stack = [c];
      while (stack.length) {
        var q = stack.pop();
        comp.push(q);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nx = q.x + d[0], ny = q.y + d[1], nk = key(nx, ny);
          if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push({ x: nx, y: ny }); }
        });
      }
      areas.push({
        cells: comp,
        x0: Math.min.apply(null, comp.map(function (q) { return q.x; })),
        x1: Math.max.apply(null, comp.map(function (q) { return q.x; })),
        y0: Math.min.apply(null, comp.map(function (q) { return q.y; })),
        y1: Math.max.apply(null, comp.map(function (q) { return q.y; }))
      });
    });
    return { complete: cells.length === 0, runs: runs, columns: columns, cells: cells, areas: areas };
  }

  return { CONTRACT_VERSION: CONTRACT_VERSION, completion: completion };
}));
