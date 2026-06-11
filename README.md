# GEN2 Planner

A web tool for designing and planning a [GEN2 QuickLock Modular System](https://www.jerrari3d.com/gen2-modular-system) setup.

**How it works for the user:**

1. **Choose a location** — Under-Table (GEN2 Rails), Tabletop (Table Top Kit V2), or Wall Mount (Kit – Lite)
2. **Choose a length** — 59 / 115 / 165 / 185 / 240 / 270
3. **Design the layout** — pick drawer sizes (1W–4W × 0.5H–3H) from the palette and click them onto a 2D grid. The mount surface and required mount parts (rails / covers / brackets) are illustrated around the layout automatically, and floating drawers are flagged.
4. **Get the parts list** — drawers, cases, faceplates/handles (Decor), and mount kits with quantities and download links. Copy as text, download CSV, or print.

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
| Available drawer widths/heights in the palette | `GEN2.drawerWidths` / `GEN2.drawerHeights` |
| Lengths and their jerrari3d.com pages | `GEN2.lengths` |
| Mount kit quantity formulas | `GEN2.mountBom` (plain functions of the layout summary) |
| Decor extras (handles, magnets) | `GEN2.decorExtras` |
| **Exact download URLs per part** | `LINK_OVERRIDES` |

### Download links

Part names are generated (e.g. `GEN2 185-2W-1H Decor Drawer`). For each name:

1. If `LINK_OVERRIDES` has an exact URL, the parts list shows a **Download** button.
2. Otherwise it falls back to a Printables search for the exact name (**Find on Printables** button).

To wire up a new listing, add one line to `LINK_OVERRIDES` with the exact generated part name as the key.

### Quantity assumptions to verify

The mount-hardware quantities are best-effort estimates encoded in `GEN2.mountBom` — adjust the formulas there if real installs differ:

- **Under-Table:** 1 rail set + 4 screws per 1W of the top row
- **Tabletop:** 1 Table Top Kit V2 (cover + foot rails + feet) per 1W
- **Wall Mount:** 1 Wall Mount Kit – Lite + 2 screws per 1W of the top row
