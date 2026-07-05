# What the planner needs from you

Everything here is drop-in — no code changes required unless noted.

## 1. Part render PNGs → `img/parts/`

The parts list shows a thumbnail per line. It looks for a PNG named after the
part, and falls back to `placeholder.svg` when the file doesn't exist — so you
can add them in any order, a few at a time.

**Naming rule** (what `partImage()` in `js/data.js` looks for): take the part
name, change the leading `GEN2 ` to `GEN2_`, drop every `.` (so `0.5H`→`05H`,
`1.5H`→`15H`), keep the rest verbatim — spaces and capitalization included —
and append `_256p.png`. Case must match on disk (case-sensitive once hosted).

**Spec:** square, ~256×256px, transparent background, consistent camera angle
across the set. Different resolution suffix? Change `RENDER_SUFFIX` in
`js/data.js` (or use WebP by also changing the extension there).

Representative filenames (the pattern extends to every size/length):

| Part | Filename in `img/parts/` |
| --- | --- |
| GEN2 240-3W-1H Decor Drawer | `GEN2_240-3W-1H Decor Drawer_256p.png` |
| GEN2 240-3W-0.5H Classic Drawer | `GEN2_240-3W-05H Classic Drawer_256p.png` |
| GEN2 185 Case - 2W-1H | `GEN2_185 Case - 2W-1H_256p.png` |
| GEN2 185 Case Extender - 2W-1H | `GEN2_185 Case Extender - 2W-1H_256p.png` |
| GEN2 185 Shelf Insert - 2W | `GEN2_185 Shelf Insert - 2W_256p.png` |
| GEN2 185 Side Cover - 1H | `GEN2_185 Side Cover - 1H_256p.png` |
| GEN2 185 Essential Decor Faceplate - 2W-1H | `GEN2_185 Essential Decor Faceplate - 2W-1H_256p.png` |
| GEN2 185 EdgeLabel Door - 2W-2H | `GEN2_185 EdgeLabel Door - 2W-2H_256p.png` |
| GEN2 Cabinet Hinge (1H) | `GEN2_Cabinet Hinge (1H)_256p.png` |
| GEN2 Door Latch (1H) | `GEN2_Door Latch (1H)_256p.png` |
| GEN2 Rails - 185 | `GEN2_Rails - 185_256p.png` |
| GEN2 Table Top Kit V2 - 185 | `GEN2_Table Top Kit V2 - 185_256p.png` |
| GEN2 Wall Mount Kit - Lite - 185 | `GEN2_Wall Mount Kit - Lite - 185_256p.png` |

You don't need every variant — one render per family reads fine next to the
size in the part name. Priority order for impact: drawers (one per style),
cases, rails, the three mount kits, QuickLocks.

> **Overrides:** parts that share one render, or use an off-pattern filename,
> get a line in `IMAGE_OVERRIDES` in `js/data.js` instead — that's how
> `QuickLock.png` (both Left and Right) is wired, and how full render batches
> (e.g. the 185 Drawers/Cases) are wired when they land in their own
> `img/parts/<length>/` subfolder rather than following the auto-pattern
> exactly. So either name new renders by the rule above (they auto-resolve, no
> code change), or send a batch + I'll wire the overrides. Filenames are
> case-sensitive once hosted, even though Windows isn't.
>
> **Partial batches are fine.** You don't have to render all 18 sizes in one
> pass — send what you have. Any size you *don't* send is assumed to not be
> modeled yet and gets listed in `GEN2.unreleasedParts` (shows "coming soon",
> no download links) until a render for it arrives.

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

- **Classic handle overhang:** `classicHandleExtraMM` = **10mm** (confirmed via slicer: a 240 Classic 1W edge-fits a 250×220 Core One bed; was 20mm, which wrongly excluded 240 Classic 1W/2W)
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
