# GEN2 Planner

A web tool for designing and planning a [GEN2 QuickLock Modular System](https://www.jerrari3d.com/gen2-modular-system) setup.

**How it works for the user:**

1. **Choose a location** — Under-Table (GEN2 Rails), Tabletop (Table Top Kit V2), or Wall Mount (Kit – Lite)
2. **Choose a printer** — preset or custom bed size. Lengths whose narrowest (1W) case can't fit the bed are greyed out immediately.
3. **Choose a length** — 59 / 115 / 165 / 185 / 240 / 270
4. **Design the layout** — under-table and wall mount ask for the workable area in mm (e.g. 480mm wide → grid capped at 5W, 88mm per 1W); tabletop is left open. Choose what fills each case (Classic Drawer, Decor Drawer, Shelf, or Cabinet), pick a size (1W–4W × 0.5H–3H), and click it onto the 2D grid; sizes whose **case** won't fit the bed are greyed out (Classic drawers are additionally checked with ~20mm of handle overhang). Drag placed units to move them; click one to open the inspector (remove, or add internal cabinet shelves — each swaps a case extender for a full case + insert). Decor faceplate and cabinet door styles (EdgeLabel / Classic / Essential) have their own selectors. The mount surface and required mount parts are illustrated around the layout — rail bars span their real section widths — and floating units and printer misfits are flagged.
5. **Get the parts list** — drawers, cases & extenders, QuickLocks (1 Left + 1 Right per case, linked to the universal GEN2 Hardware pack), shelf inserts, doors, hinges, latches, optional side covers for the outermost cases, faceplates, and mount kits with quantities and **Printables + Thangs** links. Under-table rails are computed as an optimal section mix for the user's printer (e.g. 5W on a Core One → 2× 2W + 1× 1W) with screw counts (4/6/8/10 per 1W/2W/3W/4W section). Export as text, CSV, or print.

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

- **Wall Mount:** 1 Kit – Lite + 2 screws per 1W of the top row (kit widths/sectioning unconfirmed)
- **Tabletop:** 1 Table Top Kit V2 per 1W
- **Case extenders:** assumed to need no QuickLocks of their own; internal cabinet shelves assumed to need a shelf insert each
- **Side covers:** assumed one per exposed side of each outermost unit, sized by the unit's height (`GEN2 {len} Side Cover - {h}H`)
