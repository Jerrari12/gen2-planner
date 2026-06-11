# What the planner needs from you

Everything here is drop-in — no code changes required unless noted.

## 1. Part render PNGs → `img/parts/`

The parts list shows a thumbnail per line. It looks for a PNG named after the
part (lowercased, anything that isn't a letter/number/dot becomes `-`), and
falls back to `placeholder.svg` when the file doesn't exist. So you can add
them in any order, a few at a time.

**Spec:** square, ~256×256px, transparent background, consistent camera angle
across the set. PNG (or rename the extension in `partImage()` in `js/data.js`
if you prefer WebP).

Representative filenames (the pattern extends to every size/length):

| Part | Filename |
| --- | --- |
| GEN2 185-2W-1H Decor Drawer | `gen2-185-2w-1h-decor-drawer.png` |
| GEN2 185-1W-0.5H Classic Drawer | `gen2-185-1w-0.5h-classic-drawer.png` |
| GEN2 185 Case - 2W-1H | `gen2-185-case-2w-1h.png` |
| GEN2 185 Case Extender - 2W-1H | `gen2-185-case-extender-2w-1h.png` |
| GEN2 185 Shelf Insert - 2W | `gen2-185-shelf-insert-2w.png` |
| GEN2 185 Side Cover - 1H | `gen2-185-side-cover-1h.png` |
| GEN2 185 Essential Decor Faceplate - 2W-1H | `gen2-185-essential-decor-faceplate-2w-1h.png` |
| GEN2 185 EdgeLabel Door - 2W-2H | `gen2-185-edgelabel-door-2w-2h.png` |
| GEN2 Cabinet Hinge (1H) | `gen2-cabinet-hinge-1h.png` |
| GEN2 Door Latch (1H) | `gen2-door-latch-1h.png` |
| GEN2 QuickLock - Left | `gen2-quicklock-left.png` |
| GEN2 QuickLock - Right | `gen2-quicklock-right.png` |
| GEN2 Rails - 185 | `gen2-rails-185.png` |
| GEN2 Table Top Kit V2 - 185 | `gen2-table-top-kit-v2-185.png` |
| GEN2 Wall Mount Kit - Lite - 185 | `gen2-wall-mount-kit-lite-185.png` |

You don't need every variant — one render per family reads fine next to the
size in the part name. Priority order for impact: drawers (one per style),
cases, rails, the three mount kits, QuickLocks.

## 2. Explainer image → `img/explainer.png` (optional)

The "New to GEN2?" card currently uses a built-in schematic sketch. If you
have a nicer exploded-view render (case + drawer + mount, ~600×440 or any
~4:3 crop, transparent or dark background), drop it in as `img/explainer.png`
and tell me — I'll swap it in (one-line change in `index.html`).

## 3. Exact listing URLs → `LINK_OVERRIDES` in `js/data.js`

Anything not listed there falls back to a Printables/Thangs search for the
exact part name. Currently wired: Rails 185, Table Top Kit V2 115/185/270,
Wall Mount Lite 59/165, GEN2 Hardware, both starter kits, and a handful of
drawer SKUs. Highest-value additions:

- Rails for 59 / 115 / 165 / 240 / 270
- Wall Mount Kit – Lite for 115 / 185 / 240 / 270
- Table Top Kit V2 for 59 / 165 / 240
- Case listings per length
- Decor/Classic drawer collection listings per length
- Faceplate listings per style (Essential / EdgeLabel / Classic Pro)
- Thangs (`t:`) URLs for everything that has them — most entries only have
  Printables (`p:`) so far

Format: `"GEN2 Rails - 240": { p: "https://...", t: "https://..." },`

## 4. Numbers & names to confirm (all in `js/data.js`)

- **Classic handle overhang:** `classicHandleExtraMM` = 20mm (you said you'd confirm)
- **Wall mount 3W diagonal fit:** encoded as bed ≥ 250×220mm (`GEN2.wallMount.maxW`)
- **Tabletop kit quantity:** 1 kit per 1W of structure — correct?
- **Do case extenders need QuickLocks?** Currently assumed no
- **Unreleased part names** (link searches will use these exactly when they ship):
  `GEN2 {len} Shelf Insert - {w}W` · `GEN2 {len} Side Cover - {h}H` ·
  `GEN2 {len} {Style} Door - {size}` · `GEN2 Cabinet Hinge (1H)` ·
  `GEN2 Door Latch (1H)` — rename in `GEN2.partNames` if your listings differ,
  and remove each from `GEN2.unreleased` at launch to activate links
- **jerrari3d.com collection pages** for 59 / 115 / 240 (`GEN2.lengths[].page`
  currently points at the system overview page for those)

## 5. Nice-to-haves

- Logo SVG/PNG for the top bar (currently styled text)
- Favicon
- Brand font name if you want it to match the site (currently Segoe UI/system)
