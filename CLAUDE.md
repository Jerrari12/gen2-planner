# GEN2 Planner — project memory

A **build-free static web tool** for planning a GEN2 QuickLock Modular System
setup (jerrari3d.com). No framework, no bundler, no install to run — open
`index.html` and it works. Vanilla JS + SVG.

## Files

- `index.html` — markup and the step structure (mount → printer → length →
  layout → parts list).
- `css/style.css` — all styles. CSS variables for the JERRARI brand palette at
  the top (`--accent` is the orange `#ff8a40`).
- `js/data.js` — **the catalog and single source of truth.** Sizes, fills,
  printers, lengths, BOM rules, part-name templates, download-link overrides,
  image overrides. Most "add a part / fix a quantity / change a size" requests
  are edits to THIS file only.
- `js/app.js` — all app logic, wrapped in one IIFE. Holds `state`, renders the
  board (SVG), the palette, the selected-unit toolbar, and the parts list.
- `ASSETS-TODO.md` — what renders/links the planner is still waiting on.
- **3D instructions handoff:** the "🧊 3D assembly instructions" button
  (bom-actions) opens the GEN2 instructions viewer with
  `#build=` + `encodeBuildHash()` — same encoding as share links. The viewer
  lives in the separate "GEN2 Visual Animator" project;
  `INSTRUCTIONS_VIEWER_URL` in app.js points at its GitHub Pages deploy
  (https://jerrari12.github.io/gen2-visual-animator/; swap for localhost:8123
  for local viewer dev). The viewer generates its own step-by-step manifest from the build
  (v1: tabletop + wall + under-table, 185 only; it shows a friendly message otherwise).
  `updateInstructionsButton()` (called from refresh) greys the button out with
  the reason as tooltip when the build isn't instructions-ready — currently:
  nothing placed, or a tabletop without a flat top (same `columnTops()`
  condition as the board warning).
- `test/planner.test.mjs` — headless jsdom tests (see Testing).

## Key model details (so you don't relearn them)

- `state.placed` holds units: `{ id, x, y, w, hh, fill, shelves }`.
- **Coordinates are in half-rows vertically.** `hh` and `y` are in half-`1H`
  units (a `1H` unit is `hh: 2`); `x`/`w` are whole `1W` columns. `rows()` =
  `gridH * 2`. This trips you up if you assume whole rows.
- 1 grid unit = 88mm wide (`1W`) × 56mm tall (`1H`).
- Fills: `classic`, `decor` (drawers, heights `GEN2.drawerHeights` =
  0.5–3H), and `shelf`, `cabinet` (built from a case + 1H extenders, heights
  `GEN2.caseHeights` = 1–6H, capped at 6). `heightsForFill(fill)` picks the set.
- **Structural validations** (all in app.js, run from `renderWarnings()`):
  both-ends support toward the mount surface (hard warning + "Fix structure"
  button), `bowRisks()` — narrower case loading a wider case's interior
  (soft amber, `.drawer.bow` golden dashed outline), and `sagRisks()` —
  rigidity flows from the mount surface (tabletop pushes up from below,
  rails hold from above), so a unit with NEITHER side wall landing on a
  wall of the case in the row toward the mount is carried only by the
  dovetails of its far-side neighbors (case/covers above on tabletop) and
  droops — e.g. 1W/2W drawers mid-span over a 4W-2H's open top on tabletop,
  or a unit hanging mid-span under a wider case on under-table/wall. Sag is
  a hard warning + `.drawer.sag` red dashed outline; one aligned wall =
  locked = allowed. Ends over EMPTY cells toward the mount belong to the
  both-ends warning, not sag. Plus `wallTopHalfHeight()` — a **wall** build can't
  put a 0.5H case (`hh === 1`) in the exposed top row (`topCases()`): 0.5H cases
  are too low-profile for wall-mount holes, so they can't attach to the wall at
  all (a hard blocker, unlike sag). Surfaced as a warning + `.drawer.lowtop`
  solid-red outline + greyed 3D-instructions button, with a one-click
  **`fixWallTops()`** ("Grow top row to 1H") that grows each offender IN PLACE
  (same unit → label/fill/closure all kept), cascades the stack below down, grows
  the grid to fit, and reverts cleanly (returns null, nothing deleted) if it'd
  exceed `capH()`. Capping a 0.5H with a taller unit above also clears it. All
  exported to tests.
- `GEN2.unavailableSizes` (3W-3H, 4W-3H) are rendered as **blank gaps** in the
  palette, not greyed tiles.
- **Mount ✕ length rules** live on the length in `data.js`: the `59` length
  carries `noTabletop` (a reason string) because the 59 collection is too
  shallow to stand as a rigid free-standing unit — it has **no foot rails and
  no feet slots** under its cases (feet/foot rails only ever appear in the
  tabletop BOM, so blocking tabletop is sufficient — no BOM change needed).
  `renderLengthCards()` greys the 59 card with a `nomount` "no tabletop" badge
  + the reason as `data-tip` when `state.mount === "tabletop"`;
  `enforceMountLength()` (called on mount change + in `applyBuild`) clears an
  invalid chosen length so the layout can't unlock on it. 59 stays fully
  available for Under-Table / Wall. `mountBlocksLength`/`enforceMountLength`
  are exported to tests.
- Selecting a placed unit shows the **toolbar below the grid** (`#unit-toolbar`):
  an arrow pad / keyboard arrows nudge it one cell (`nudgeSelected`), plus part
  info, cabinet shelf stepper, and Remove. (An earlier floating popover was
  removed — it was visually unreliable and untestable.)
- Moving works via mouse drag, touch drag, the arrow pad, and arrow keys.

## Images

`partImage(name)` maps a part name to `img/parts/` by changing the leading
`GEN2 ` to `GEN2_`, dropping every `.` (so `0.5H`→`05H`, `1.5H`→`15H`),
preserving the rest (spaces + capitalization), and appending the `_256p` suffix
+ `.png` — e.g. `GEN2 240-3W-0.5H Classic Drawer` → `img/parts/GEN2_240-3W-05H
Classic Drawer_256p.png`. `IMAGE_OVERRIDES` in `data.js` is checked first for
shared/off-pattern renders (QuickLock both sides). Newer render batches live in
per-length subfolders with a `"<Fill> <len>-<size>"` scheme (no dots) — e.g.
`img/parts/185/Decor Drawer 185-1W-05H.png`, wired explicitly in
`IMAGE_OVERRIDES`; follow that pattern for future batches. **A batch doesn't
have to cover all 18 sizes** — any size missing a render is assumed to not be
modeled yet and goes in `GEN2.unreleasedParts` (exact part name) instead, which
shows "coming soon" and suppresses download links for that one size (the 185
Classic Drawer batch is the example: 14 of 18 sizes rendered, 4 unreleased).
Missing files with no override fall back to `img/parts/placeholder.svg`.
**Filenames are case-sensitive once hosted on GitHub Pages** even though
Windows ignores case locally.

## Testing

`npm install` (one-time, pulls dev-only jsdom) then `npm test`. Tests load the
real `index.html` + scripts into jsdom and exercise the actual code via a
**guarded test hook**: `app.js` attaches `state` + helpers to
`window.__GEN2_PLANNER_TEST__` ONLY when a harness sets that flag truthy before
load (absent in normal browser use). Tests verify **logic, not pixels** — they
won't catch visual/layout regressions, so eyeball appearance in a browser.
`node_modules/` and `package-lock.json` are gitignored.

## Previewing (no browser in the sandbox)

There is no visual preview from inside this container — jsdom is headless and
the container isn't web-accessible. To see the UI: GitHub Pages
(`https://jerrari12.github.io/gen2-planner/`, Settings → Pages → build from a
branch) or open `index.html` locally.

## Workflow / conventions

- Develop on branch **`claude/gen2-planner-webtool-ji6jp3`**; push there. Don't
  push elsewhere without explicit permission. Don't open PRs unless asked.
- The repo owner (non-developer) usually pulls/merges via **GitHub Desktop**;
  keep git guidance simple and concrete.
- Match the existing code style: terse, well-commented vanilla JS; comments
  explain constraints/intent, not mechanics.
- This is the live project memory — keep it current when structure or
  conventions change, and remember it only persists because it's committed.
