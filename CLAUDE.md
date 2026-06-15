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
- `GEN2.unavailableSizes` (3W-3H, 4W-3H) are rendered as **blank gaps** in the
  palette, not greyed tiles.
- Selecting a placed unit shows the **toolbar below the grid** (`#unit-toolbar`):
  an arrow pad / keyboard arrows nudge it one cell (`nudgeSelected`), plus part
  info, cabinet shelf stepper, and Remove. (An earlier floating popover was
  removed — it was visually unreliable and untestable.)
- Moving works via mouse drag, touch drag, the arrow pad, and arrow keys.

## Images

`partImage(name)` slugifies the part name to `img/parts/<slug>.png`, with
explicit `IMAGE_OVERRIDES` in `data.js` for shared/oddly-named renders. Missing
files fall back to `img/parts/placeholder.svg`. **Filenames are case-sensitive
once hosted on GitHub Pages** even though Windows ignores case locally.

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
