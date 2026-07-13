# GEN2 Planner — project memory

A **build-free static web tool** for planning a GEN2 QuickLock Modular System
setup (jerrari3d.com). No framework, no bundler, no install to run — open
`index.html` and it works. Vanilla JS + SVG.

## Files

- `index.html` — markup and the step structure (1 mount → 2 printer → 3 length
  → 4 layout → **5 Customize** → 6 parts list). **2026-07-10 "payoff" pass**
  (from a UI review Joey ran; the theme: surface the BOM+guide as the product):
  hero carries a value statement + outcome chips (`.hero-tagline`, hero grew to
  250px); the parts list opens with a **build summary card** (`bomSummaryHtml`:
  mount/length/drawers/dims, printed pieces vs UNIQUE model files, the
  buy-list, and an availability line that says whether every REQUIRED part is
  downloadable — optional/unreleased don't scare the build); the 3D button is
  the one solid `primary-action` ("Generate my 3D assembly guide"), exports
  are utilities after it; selected mount/length/faceplate cards get a ✓ badge
  (a11y — the fp-card ✓ sits top-LEFT, the club sparkle owns top-right);
  copy/CSV exports open with a `buildMeta()` header (date, mount, length,
  printer, dims, faceplate, handle, reopen-#build link). **Undo/redo**
  (`history` in app.js): snapshots of serializeBuild() captured at the end of
  every refresh() — coalesced 350ms so drags land as one entry; baseline
  snapshots immediately; restore via applyBuild + a `restoring` guard, then
  the entry is RESYNCED to the post-restore state (sanitize reassigns nextId —
  without the resync every second undo press was a no-op); buttons above the
  board + Ctrl+Z/Y/Shift+Z (inputs exempt); exported to tests. **Session
  auto-resume** rides the same snapshot: pushHistoryNow also writes
  localStorage `gen2-last-build`; on boot (after loadBuildFromHash) the build
  restores IF nothing else loaded one — a #build= hash wins, an empty saved
  state (deliberate pre-close clear) stays blank. NB the stored value is
  captured at SCRIPT LOAD (`LAST_BUILD_RAW`) because init's own baseline
  snapshot overwrites the key before the resume code runs — reading it later
  would always find the fresh empty state. This + the tracker's by-part-name
  keying = the whole session (layout, options, checklist) survives a closed
  tab. **Build tracker** (`tracker`/`bindBomTracker`): per-row done-checkboxes over the
  BOM, piece-weighted progress in the summary card, keyed by part
  name+variant (NOT build id — a layout tweak mid-build must not wipe
  progress), persisted as JSON in localStorage `gen2-bom-tracker`, delegated
  listeners so re-renders keep working. Toggle styling: off = ghost, on =
  solid (`.btn`'s base is already solid accent — an accent-text active state
  rendered the label invisible, Joey's screenshot). **The 3D viewer is branded
  "3D Build Studio"** (2026-07-10 — it customizes colors/faceplates/hardware,
  not just instructions): primary button "🧊 Open my 3D Build Studio", plus a
  **floating `#fab-3d` twin** (fixed bottom-right, `updateInstructionsButton`
  drives it: hidden until units are placed, greyed with the reason until the
  layout is legal, print-hidden) so the star feature isn't only at the page
  bottom. Hero chips are plain ✓-prefixed text, NOT pills (they read as dead
  buttons). **Palette panel tidy-up (Joey 2026-07-10):** the Product/Schematic
  board-colors toggle is GONE — product colors are permanent
  (`applyBoardColors()` just adds the class; the schematic CSS grays remain
  but unreachable; localStorage `gen2-board-colors` is orphaned). Save & share
  lost its collapsible summary — the block sits open under a thin rule: SAVE +
  LOAD side by side (a `.tool-row`, same flex pattern as Load example/Clear),
  "🔗 Copy share link" full-width below. Step 5 (added 2026-07-10) holds
  everything that changes WHICH parts get billed: the faceplate style cards
  (+ back-cover toggle), the **handle picker NESTED under the faceplate cards**
  (`#handle-style-pick` inside `#faceplate-style-pick`, `.nested-pick` — it
  only shows when the chosen faceplate has no built-in handle, so it reads as
  a follow-up to that choice; more handled faceplates are coming), the cabinet
  door style, and **master drawer-hardware toggles** (`renderHardwareMasters`
  in app.js): Drawer closures (None/Magnets/Push-Click-soon) + Drawer stoppers
  (All/None) — bulk-set every drawer, mirroring the 3D viewer's Build options;
  a button lights only when EVERY drawer matches (mixed lights nothing); the
  per-drawer picker in the unit toolbar stays the fine-tune path; stopper keys
  are the viewer's `"<unitId>:<localCol>"` removedStoppers protocol. The whole
  step hides when nothing applies (no drawers/cabinets placed) and is
  print-hidden. refresh() ends with syncOptionsToViewer(), so master changes
  live-sync to an open viewer tab like any option change.
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
  (2026-07-10: tabletop + wall for ALL SIX lengths; under-table only 165/185 —
  no rail GLBs for the rest; 59 is hanging-only per mountBlocksLength, which the
  viewer mirrors; it shows a friendly message otherwise).
  `updateInstructionsButton()` (called from refresh) greys the button out with
  the reason as tooltip when the build isn't instructions-ready — currently:
  nothing placed, a tabletop without a flat top (same `columnTops()`
  condition as the board warning), a wall build with a 0.5H top row, or an
  under-table build on a length other than 165/185 (viewer has no rail GLBs
  yet — added 2026-07-10). **Live options sync** (both ways, echo-
  guarded): `syncOptionsToViewer()` posts {gen2:"buildOptions"} with closures/
  removedStoppers/wallStagger/handleStyle/**faceStyle/backCover** (last two
  added 2026-07-08 — the viewer now models EdgeLabel natively and renders the
  optional back cover); the message listener validates + applies the same
  fields coming back. `state.backCover` (BUILD_FIELDS + sanitized `!!`) drives
  an Off/On toggle under the faceplate style cards (renderFaceplateCards) and
  per-size `P.backCover` BOM rows (optional; released 2026-07-12 — the cover
  files ship INSIDE every faceplate series download since v2602, so the rows
  linkAs the chosen style's series page). NB faceplate + back-cover BOM names
  carry NO length prefix (2026-07-12): they're universal shared hardware
  (width × height only), and "GEN2 240 …Faceplate" read as length-specific.
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
- **Per-collection catalogs** (`GEN2.collectionCases`, 2026-07-10): the 59 mini
  collection ships only 4 cases (1W/2W × 0.5H/1H). `sizeExists(w, h, fill,
  length?)` enforces it — width caps EVERY fill (no wider case exists), height
  caps only the drawer fills (shelves/cabinets stack extenders above a 1H case;
  59 extenders exist). The palette drops fully-missing height rows entirely
  (renderPalette bail) so 59 shows exactly 4 tiles. Placed units that stop
  existing after a length switch get a board warning + grey the 3D button
  (never auto-deleted); `sanitizeBuild` judges restored units against the
  INCOMING build's length (the optional `length` param — restoring a 270 link
  while 59 is selected must not drop its 3W units). `sizeExists` is exported to
  tests.
- **Surprise me weights widths** (2026-07-10): 3W/4W units draw at ⅓ the weight
  of 1W/2W (`pickWidth` in surpriseMe) — measured share fell ~21% → ~11% of
  units; tweak the `Array(w >= 3 ? 1 : 3)` weight to taste. It also passes its
  `buildFill` into `sizeExists` (state.fill may be a shelf while the surprise
  rolls drawers — matters for per-collection drawer caps).
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
