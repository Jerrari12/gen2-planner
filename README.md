# GEN2 Planner

A web tool for designing and planning a [GEN2 QuickLock Modular System](https://www.jerrari3d.com/gen2-modular-system) setup.

**How it works for the user:**

1. **Choose a location** — Under-Table (GEN2 Rails), Tabletop (Table Top Kit V2), or Wall Mount (Kit – Lite)
2. **Choose a printer** — preset or custom bed size. Lengths whose narrowest (1W) case can't fit the bed are greyed out immediately.
3. **Choose a length** — 59 / 115 / 165 / 185 / 240 / 270, colored to match the official lineup art
4. **Design the layout** — under-table and wall mount ask for the workable area in mm (e.g. 480mm wide → grid capped at 5W, 88mm per 1W); tabletop height is automatic (default 1H, grows/shrinks with the build) and covers require a flat top — uneven columns are flagged. Choose what fills each case (Classic Drawer, Decor Drawer, Shelf, or Cabinet), pick a size, and click it onto the 2D grid. Drawers come in 1W–4W × 0.5H–3H; Shelves and Cabinets stack 1H case extenders so they offer whole-unit heights up to 6H (door/insert sizes 1W-1H … 4W-6H). 3W-3H and 4W-3H don't exist and are shown as blank gaps. Sizes whose **case** won't fit the bed are greyed out (Classic drawers are additionally checked with ~20mm of handle overhang). Move a placed unit by dragging it, or click it to select and use the **arrow pad** below the grid (or the keyboard arrows) to nudge it one cell at a time; the toolbar also shows the part and a Remove button. Touch works too — drag with a finger to move, tap to select. Classic drawers render with their integrated handle lip, Decor drawers with the open front + faceplate rails. The mount surface and required mount parts are illustrated around the layout — rail/wall-mount bars span their real section widths, wall mounts show 2 screw dots per 1W, tabletop covers sit on the stack tops.
5. **Get the parts list** — drawers, cases & extenders, QuickLocks (1 Left + 1 Right per case, linked to the universal GEN2 Hardware pack), shelf inserts, doors, hinges, latches, optional side covers (paired per case height — cabinets take 1H covers per level), faceplates, and mount kits with quantities and **Printables + Thangs** links. Decor faceplate and cabinet door styles (Essential / EdgeLabel / Classic Pro) are picked in a menu above the parts list and feed into part names/links. Under-table rails and wall mounts are computed as an optimal section mix for the user's printer (rails 1W–4W with 4/6/8/10 screws; wall mounts 1W–3W with 2 screws per 1W — the 3W section fits diagonally on beds ≥ Core One size). Export as text, CSV, or print.

First-time users get a dismissible "How GEN2 works" card, a contextual helper line above the board, a **Load example layout** button, visible fill-type descriptions, a unit legend (1W = 88mm · 1H = 56mm), and part thumbnails in the list (drop renders into `img/parts/` — see **ASSETS-TODO.md** for the naming rule and everything else the planner is waiting on).

## Running it

It's a zero-dependency static site — no build step.

- Open `index.html` directly in a browser, or
- Serve the folder: `python3 -m http.server 8000`, or
- Host on GitHub Pages (Settings → Pages → deploy from branch), or
- Embed in jerrari3d.com via an `<iframe>` pointing at the hosted page.

## Tests

There's a small headless test suite that loads the real `index.html` + scripts
into [jsdom](https://github.com/jsdom/jsdom) and drives the actual code — it
covers the size rules and the selected-unit toolbar (arrow-pad nudge, edge/
collision blocking, remove). Node 18+ required:

```
npm install   # one-time, pulls in jsdom (dev-only)
npm test
```

These run logic, not pixels, so they catch behaviour regressions but not visual
ones — eyeball the layout in a browser for anything appearance-related.

## Working on it locally

The whole tool is just this folder — copy it anywhere and it works.

**Get it onto your computer:**

1. On GitHub, switch to the branch you want (branch dropdown, top-left of the file list)
2. Green **Code** button → **Download ZIP**
3. Unzip anywhere (e.g. `Documents/gen2-planner`)

(Or, if you have git: `git clone https://github.com/Jerrari12/gen2-planner.git`)

**Use it locally:**

- Double-click `index.html` — no server or install needed
- Drop your part renders straight into `img/parts/` (see `ASSETS-TODO.md`
  for filenames) and refresh the browser to see them in the parts list
- Edit `js/data.js` for catalog changes, refresh to see the result

**Get changes back to GitHub later:**

- Easiest (no git): on GitHub open the branch → **Add file → Upload files**
  → drag the changed files/folders in → Commit. Same-named files are replaced.
- With git: `git add -A && git commit -m "..." && git push`

## Maintaining the catalog — `js/data.js`

Everything the planner knows about GEN2 lives in **`js/data.js`**. No other file needs editing for catalog changes:

| What | Where |
| --- | --- |
| Drawer widths/heights in the palette | `GEN2.drawerWidths` / `GEN2.drawerHeights` |
| Shelf/cabinet heights (stack via extenders) | `GEN2.caseHeights` / `GEN2.maxCaseHeight` (capped at 6H) |
| Fill types (drawers, shelves, cabinets) | `GEN2.fills` — drop the `soon` flag when shelves/cabinets launch |
| Faceplate / door styles | `GEN2.faceplateStyles` / `GEN2.doorStyles` |
| Printer presets (bed sizes) | `GEN2.printers` |
| Classic-drawer handle overhang | `GEN2.classicHandleExtraMM` (10mm — confirmed via slicer edge-fit) |
| Lengths and their jerrari3d.com pages | `GEN2.lengths` |
| Rail widths & screw counts | `GEN2.railWidths` / `GEN2.railScrews` |
| Wall mount sections & fit rule | `GEN2.wallMount` (incl. the 3W diagonal-fit threshold) |
| Sizes that don't exist | `GEN2.unavailableSizes` |
| Mount kit quantity formulas | `GEN2.mountBom` |
| Part-name templates | `GEN2.partNames` — link searches use these exact names |
| Unreleased parts ("coming soon" tag) | `GEN2.unreleased` — remove entries as they ship |
| **Exact download URLs per part** | `LINK_OVERRIDES` |

### Download links

Part names are generated from `GEN2.partNames` (e.g. `GEN2 185-2W-1H Decor Drawer`). For each name:

1. If `LINK_OVERRIDES` has the name, its `p:` (Printables) / `t:` (Thangs) URLs render as solid **Download** buttons.
2. Otherwise the buttons fall back to a search on each platform for the exact name.
3. Parts listed in `GEN2.unreleased` show a "coming soon" tag instead of links.

### Quantity assumptions to verify

- **Tabletop:** 1 Table Top Kit V2 per 1W
- **Case extenders:** assumed to need no QuickLocks of their own; internal cabinet shelves assumed to need a shelf insert each
- **Side covers:** one per exposed side of each outermost unit, matched to case height (cabinets count as stacked 1H cases)
- **Wall mount 3W diagonal fit:** encoded as "bed at least 250×220mm" — adjust in `GEN2.wallMount.maxW` if the real threshold differs
