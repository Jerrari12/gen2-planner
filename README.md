# GEN2 Planner

A web tool for designing and planning a [GEN2 QuickLock Modular System](https://www.jerrari3d.com/gen2-modular-system) setup.

**How it works for the user:**

1. **Choose a location** — Under-Table (GEN2 Rails), Tabletop (Table Top Kit V2), or Wall Mount (Kit – Lite)
2. **Choose a printer** — preset or custom bed size. Lengths whose narrowest (1W) case can't fit the bed are greyed out immediately.
3. **Choose a length** — 59 / 115 / 165 / 185 / 240 / 270, colored to match the official lineup art
4. **Design the layout** — under-table and wall mount ask for the workable area in mm (e.g. 480mm wide → grid capped at 5W, 88mm per 1W); tabletop height is automatic (default 1H, grows/shrinks with the build) and covers require a flat top — uneven columns are flagged. Choose what fills each case (Classic Drawer, Decor Drawer, Shelf, or Cabinet), pick a size (1W–4W × 0.5H–3H; 2.5H and 3W/4W-3H don't exist and are excluded), and click it onto the 2D grid; sizes whose **case** won't fit the bed are greyed out (Classic drawers are additionally checked with ~20mm of handle overhang). Drag placed units to move them; click one to open the inspector. Classic drawers render with their integrated handle lip, Decor drawers with the open front + faceplate rails. The mount surface and required mount parts are illustrated around the layout — rail/wall-mount bars span their real section widths, wall mounts show 2 screw dots per 1W, tabletop covers sit on the stack tops.
5. **Get the parts list** — drawers, cases & extenders, QuickLocks (1 Left + 1 Right per case, linked to the universal GEN2 Hardware pack), shelf inserts, doors, hinges, latches, optional side covers (paired per case height — cabinets take 1H covers per level), faceplates, and mount kits with quantities and **Printables + Thangs** links. Decor faceplate and cabinet door styles (Essential / EdgeLabel / Classic Pro) are picked in a menu above the parts list and feed into part names/links. Under-table rails and wall mounts are computed as an optimal section mix for the user's printer (rails 1W–4W with 4/6/8/10 screws; wall mounts 1W–3W with 2 screws per 1W — the 3W section fits diagonally on beds ≥ Core One size). Export as text, CSV, or print.

## Running it

It's a zero-dependency static site — no build step.

- Open `index.html` directly in a browser, or
- Serve the folder: `python3 -m http.server 8000`, or
- Host on GitHub Pages (Settings → Pages → deploy from branch), or
- Embed in jerrari3d.com via an `<iframe>` pointing at the hosted page.

## Maintaining the catalog — `js/data.js`

Everything the planner knows about GEN2 lives in **`js/data.js`**. No other file needs editing for catalog changes:

| What | Where |
| --- | --- |
| Drawer widths/heights in the palette | `GEN2.drawerWidths` / `GEN2.drawerHeights` |
| Fill types (drawers, shelves, cabinets) | `GEN2.fills` — drop the `soon` flag when shelves/cabinets launch |
| Faceplate / door styles | `GEN2.faceplateStyles` / `GEN2.doorStyles` |
| Printer presets (bed sizes) | `GEN2.printers` |
| Classic-drawer handle overhang | `GEN2.classicHandleExtraMM` (currently 20mm — to confirm) |
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
