/* =========================================================================
   GEN2 Planner — system catalog & BOM rules
   =========================================================================
   This file is the single source of truth for everything the planner knows
   about the GEN2 QuickLock Modular System. To correct a quantity rule, add
   a size/printer/style, or point a part at its exact download pages, edit
   this file only — no other code changes needed.

   Link resolution for any part works in two steps:
     1. If LINK_OVERRIDES has the part name (keyed exactly), use those URLs.
     2. Otherwise fall back to a Printables / Thangs search for the name.
   Parts flagged `unreleased` show a "coming soon" tag instead of links.
   ========================================================================= */

const GEN2 = {

  // Physical size of one grid unit
  units: {
    widthMM: 88,   // 1W
    heightMM: 56,  // 1H
  },

  // Usable drawer interior (mm) = pitch × units − wall. Width/height offsets track
  // the 88/56 pitch exactly (true for Classic & Decor). Depth = length − 14, VERIFIED
  // for all six lengths: 59/115/165/185/240/270 → 45/101/151/171/226/256mm (the 270
  // page also lists a legacy 286mm variant; 256 is the current spec per the designer).
  interior: { wWall: 17, hWall: 8, dWall: 14 },

  // Classic drawers have a print-in-place handle that overhangs the front:
  // their print footprint is this much longer than the case. (To confirm.)
  classicHandleExtraMM: 10,

  // Footprints offered in the palette (width units × height units)
  drawerWidths: [1, 2, 3, 4],
  drawerHeights: [0.5, 1, 1.5, 2, 3],   // Classic & Decor drawers

  // Shelves and Cabinets are built from a case plus 1H case extenders, so they
  // stack to whole-unit heights well beyond the drawer sizes. Capped at 6H so
  // the door/insert catalog stays finite (1W-1H up to 4W-6H).
  caseHeights: [1, 2, 3, 4, 5, 6],
  maxCaseHeight: 6,

  // Size combos that don't exist in the GEN2 lineup. These are hidden from the
  // palette entirely (rendered as blank gaps) rather than greyed out.
  unavailableSizes: ["3W-3H", "4W-3H"],

  // Per-collection case catalogs, where a length ships fewer sizes than the
  // full lineup. The 59 mini collection has only 4 cases (1W/2W × 0.5H/1H):
  // maxW caps EVERY fill's width (no wider case exists to build on), while
  // maxDrawerH caps only the drawer fills — shelves/cabinets stack extenders
  // above a 1H case (59 extenders exist), so their heights stay open.
  collectionCases: {
    59: { maxW: 2, maxDrawerH: 1 },
  },

  // What a case can be filled with
  fills: [
    {
      id: "classic",
      label: "Classic Drawer",
      blurb: "Print-in-place handle. No assembly, no extra parts.",
      previewImg: "img/parts/185/Classic Drawer 185-1W-1H.png",
    },
    {
      id: "decor",
      label: "Decor Drawer",
      blurb: "Swappable faceplate + handle/knob. Clips included in the drawer download (v2602).",
      previewImg: "img/parts/185/Decor Drawer 185-1W-1H.png",
    },
    {
      id: "shelf",
      label: "Shelf",
      blurb: "Open shelf · case + shelf insert.",
      soon: true,
      integerHeightsOnly: true,
      minHeight: 1,
    },
    {
      id: "cabinet",
      label: "Cabinet",
      blurb: "Shelf with a door · case (+ extenders), shelf insert, hinges, latches, door.",
      soon: true,
      integerHeightsOnly: true,
      minHeight: 1,
    },
  ],

  // Appearance styles for Decor faceplates and (future) cabinet doors
  faceplateStyles: [
    // `img` (a hero shot, subject on the right) drives the fade-in card
    // background + the full-image hover preview.
    { id: "essential",  label: "Essential",   sub: "Free core faceplate",
      img: "img/parts/Faceplate-Essential.jpg",
      blurb: "The free core faceplate · a clean, complete drawer front. No labels or accents, just the standard GEN2 look." },
    { id: "edgelabel",  label: "EdgeLabel",   integratedHandle: true, club: true, sub: "Swappable labels + accents", labelGen: "https://edgelabel.jerrari3d.com/",
      img: "img/parts/Faceplate-EdgeLabel.jpg",
      blurb: "Swappable labels and accents with the signature edge-label look · restyle and relabel any drawer in seconds. Built-in handle. Included with the GEN2 Club." },
    { id: "classicpro", label: "Classic Pro", integratedHandle: true, club: true, sub: "Swappable labels + accents", labelGen: "https://classic.jerrari3d.com/",
      img: "img/parts/Faceplate-ClassicPro.jpg",
      blurb: "Swappable labels and accents with a classic, premium finish · restyle and relabel any drawer in seconds. Built-in handle. Included with the GEN2 Club." },
  ],
  doorStyles: [
    { id: "essential",  label: "Essential" },
    { id: "edgelabel",  label: "EdgeLabel" },
    { id: "classicpro", label: "Classic Pro" },
  ],
  // Handle series for Decor drawers whose faceplate has no built-in handle.
  // ORDER MATTERS: [0] is the default for new builds AND the sanitize
  // fallback (Deco per Joey 2026-07-19). Families pick their exact variant on
  // the handle itself in the 3D studio (BlockBar A–F, Crystal A/B Wide — all
  // modeled as of 2026-07-20). `img` follows the BOM partImage scheme so one
  // render batch serves these cards AND the parts-list rows.
  handleStyles: [
    { id: "deco", label: "Deco", sub: "The default series",
      img: "img/parts/GEN2_Decor Handles - Deco Series_256p.png",
      blurb: "Swap styles anytime · every handle uses the same 2-screw faceplate mount." },
    { id: "blockbar", label: "BlockBar", sub: "6 styles (A–F) · pick the exact one in 3D",
      img: "img/parts/GEN2_Decor Handles - BlockBar Series_256p.png",
      blurb: "A family of interchangeable bars — flip through A–F on the handle itself in the 3D Build Studio." },
    { id: "crystal", label: "Crystal", sub: "2 styles (A · B Wide) · pick in 3D",
      img: "img/parts/GEN2_Decor Handles - Crystal Series_256p.png",
      blurb: "Faceted crystal bars in standard and wide — flip between them on the handle in the 3D Build Studio." },
  ],

  // Printer presets — usable bed size in mm (X × Y).
  // A part fits if its footprint fits the bed in either orientation.
  printers: [
    { id: "any",        label: "Any printer / not sure", x: null, y: null },
    { id: "coreone",    label: "Prusa Core One",         x: 250, y: 220 },
    { id: "coreonel",   label: "Prusa Core One L",       x: 300, y: 300 },
    { id: "mk4",        label: "Prusa MK4 / MK3.9",      x: 250, y: 210 },
    { id: "mini",       label: "Prusa Mini",             x: 180, y: 180 },
    { id: "xl",         label: "Prusa XL",               x: 360, y: 360 },
    { id: "bambux1",    label: "Bambu X1 / P1 / A1",     x: 256, y: 256 },
    { id: "a1mini",     label: "Bambu A1 mini",          x: 180, y: 180 },
    { id: "h2d",        label: "Bambu H2D / H2C / H2S",  x: 325, y: 320 },
    { id: "x2d",        label: "Bambu X2D",              x: 256, y: 256 },
    { id: "p2s",        label: "Bambu P2S",              x: 256, y: 256 },
    { id: "snapmakeru1",label: "Snapmaker U1",           x: 270, y: 270 },
    { id: "ender3",     label: "Ender 3 / Neo",          x: 220, y: 220 },
    { id: "ender5plus", label: "Ender 5 Plus",           x: 300, y: 300 },
    { id: "voron24",    label: "Voron 2.4 / Trident",    x: 350, y: 350 },
    { id: "custom",     label: "Custom…",                x: null, y: null },
  ],

  // Install locations. `askSpace` adds "available width/height in mm" inputs
  // that cap the layout grid (88mm per 1W, 56mm per 1H).
  mounts: [
    {
      id: "under-table",
      label: "Under-Table",
      img: "img/parts/mount-under-table.jpg",
      blurb: "GEN2 Rails screw to the underside of any surface. Drawers slide in and QuickLock in place.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/instructions-hanging",
      askSpace: true,
      spaceHint: "Measure the flat area on the underside of your table.",
      planTip: "Under-Table: rails screw to the underside and drawers slide up into them. Set the Workable area to your usable underside space so the grid can't outgrow it.",
    },
    {
      id: "tabletop",
      label: "Tabletop",
      img: "img/parts/mount-tabletop.jpg",
      blurb: "Table Top Kit · covers and foot rails create a rigid standalone unit on any surface.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/table-top-kit",
      askSpace: false,
      planTip: "Tabletop: this builds a free-standing unit, so size is entirely up to you. The Table Top Kit adds the covers and foot rails that make it rigid.",
    },
    {
      id: "wall",
      label: "Wall Mount",
      img: "img/parts/mount-wall.jpg",
      blurb: "Wall Mount Kit – Lite attaches GEN2 units directly to the wall with wood screws.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/wall-mount",
      askSpace: true,
      spaceHint: "Measure the wall area you want to fill.",
      planTip: "Wall Mount: mounts are sectional in 1W / 2W / 3W pieces, so plan in full rows. Use wall anchors rated for your surface · drywall needs more than the screws alone.",
    },
  ],

  // Drawer lengths (depth in mm). `color` matches the official lineup art.
  lengths: [
    { id: 59,  label: "59",  color: "#f2f2f2", tagline: "Ultra-shallow · 45mm inside · cards, bits, screws, small flat parts",
      // 59 cases are too shallow to stand as a rigid free-standing unit: the
      // collection has no foot rails and no feet slots in the case undersides,
      // so there's nothing to make a Table Top build stable. Under-Table / Wall
      // only (those hang off rails / the wall, no feet needed).
      noTabletop: "The 59 collection is too shallow for a Table Top build · its cases have no foot rails and no feet slots to stand on. Use Under-Table or Wall mount.",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 115, label: "115", color: "#9ea3a8", tagline: "Medium · 101mm inside · pens, cables, tape, small parts & tins",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 165, label: "165", color: "#3aa0e8", tagline: "Mini Edition · 151mm inside · sockets, calipers, small tools, hobby bits",
      page: "https://www.jerrari3d.com/gen2-modular-system/mini" },
    { id: 185, label: "185", color: "#ff8a40", tagline: "Standard · 171mm inside · the versatile all-rounder for everyday gear",
      page: "https://www.jerrari3d.com/gen2-modular-system/standard" },
    { id: 240, label: "240", color: "#3ecfa0", tagline: "Deep · 226mm inside · power tools, spray cans, boxed sets, tall bottles",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 270, label: "270", color: "#e8453c", tagline: "Large · 256mm inside · long tools, cordless kits, big spools",
      page: "https://www.jerrari3d.com/gen2-modular-system/large" },
  ],

  /* -----------------------------------------------------------------------
     Rails: available section widths and screws per section.
     All sections live under the one Rails listing per length.
     Screw minimums: 1W=4, 2W=6, 3W=8, 4W=10  →  2 + 2×W
     ----------------------------------------------------------------------- */
  railWidths: [1, 2, 3, 4],
  railScrews: (w) => 2 + 2 * w,

  /* -----------------------------------------------------------------------
     Wall mounts: sectional like rails, in 1W / 2W / 3W. Sections install
     side by side to expand the mountable area. 2 screws per 1W.
     Fit rule: 1W/2W fit if the section length fits either bed axis; the
     3W section (264mm) can be printed diagonally on beds at least Prusa
     Core One sized (~250×220mm and up).
     ----------------------------------------------------------------------- */
  wallMount: {
    widths: [1, 2, 3],
    screwsPer1W: 2,
    maxW(bed) {
      if (!bed) return 3;
      const long = Math.max(bed.x, bed.y), short = Math.min(bed.x, bed.y);
      if (long >= 250 && short >= 220) return 3; // diagonal trick
      if (long >= 2 * 88) return 2;
      return 1;
    },
  },

  /* -----------------------------------------------------------------------
     Mount-specific BOM. Each function returns an array of items.
     `ctx` provides:
       ctx.len        — selected length (mm)
       ctx.cols       — number of occupied 1W columns
       ctx.railMix    — {width: count} rail sections chosen to fit the
                        user's printer (e.g. {2:2, 1:1} for 5W on a Core One)
       ctx.railScrews — total screws for that mix
     ----------------------------------------------------------------------- */
  mountBom: {
    "under-table": (ctx) => {
      const items = [];
      const sections = Object.entries(ctx.railMix).sort((a, b) => b[0] - a[0]);
      sections.forEach(([w, count]) => {
        items.push({
          name: `GEN2 Rails - ${ctx.len}`,
          variant: `${w}W section`,
          qty: count,
          note: "All rail widths are in the same download · print the section sizes listed.",
        });
      });
      items.push({
        name: "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)",
        qty: ctx.railScrews,
        note: "Hardware store item · minimum 4 / 6 / 8 / 10 screws per 1W / 2W / 3W / 4W rail section.",
        hardware: true,
      });
      return items;
    },
    "tabletop": (ctx) => {
      const P = GEN2.partNames;
      const kit = `GEN2 Table Top Kit V2 - ${ctx.len}`;
      const cov = buildCoverItems(ctx.len, ctx.runs);
      const items = cov.items.slice();

      // Foot rails only where a run's bottom row is more than one case (separate
      // bottom cases need tying together). Both FR layers always, full run width.
      const fru = {}, frl = {};
      let frScrews = 0, feet = 0, frUsed = false;
      ctx.runs.forEach((run) => {
        feet += 2 * (run.width + 1);
        if (run.bottomCases >= 2) {
          frUsed = true;
          const t = brickTiling(run.width);
          addMix(fru, t.upper);
          addMix(frl, t.lower);
          frScrews += run.width;
        }
      });
      if (frUsed) {
        // foot rails got their own per-length product pages 2026-07-11
        const fr = `GEN2 ${ctx.len} Foot Rails`;
        mixLines(fru, P.footRailUpper, ctx.len, { linkAs: fr, note: "Locks into the dovetail slots under the bottom cases." })
          .forEach((i) => items.push(i));
        mixLines(frl, P.footRailLower, ctx.len, { linkAs: fr, note: "Slides into the upper rail. Needed when the bottom row is more than one case." })
          .forEach((i) => items.push(i));
      }

      items.push({
        name: P.foot(), qty: feet, linkAs: kit,
        note: "Snap into the bottom of the build · or use store-bought adhesive rubber feet instead.",
      });

      // Optional M3 hardware, 1 per W. Nuts are shared by covers + foot rails.
      const nuts = cov.screws + frScrews;
      items.push({ name: "M3×6mm screw", qty: cov.screws, hardware: true, optional: true,
        note: "Optional · secures the covers, 1 per 1W (threads into an M3 nut in the Cover Lower)." });
      if (frUsed) items.push({ name: "M3×12mm screw", qty: frScrews, hardware: true, optional: true,
        note: "Optional · screws the foot rails into the case's M3 nut slots, 1 per 1W." });
      items.push({ name: "M3 hex nut", qty: nuts, hardware: true, optional: true,
        note: "Optional · pairs with the M3 cover / foot-rail screws above." });
      return items;
    },
    "wall": (ctx) => {
      const items = [];
      Object.entries(ctx.wallMix).sort((a, b) => b[0] - a[0]).forEach(([w, count]) => {
        items.push({
          name: `GEN2 Wall Mount Kit - Lite - ${ctx.len}`,
          variant: `${w}W section`,
          qty: count,
          note: "All widths are in the same download · sections install side by side to expand the area.",
        });
      });
      items.push({
        name: "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)",
        qty: ctx.cols * GEN2.wallMount.screwsPer1W,
        note: "Hardware store item · 2 screws per 1W. Use anchors appropriate for your wall type.",
        hardware: true,
      });
      // Wall builds cap the top with the same covers (they close the exposed
      // top and carry the top-row drawer-stopper slots). No foot rails or
      // feet — a wall build hangs off the ground.
      // Staggered = one connected top (tile the whole run). Per-column = each
      // top case gets its own cover (1W/2W = a single piece; 3W/4W still tile
      // internally to reach the width), so columns lift off independently.
      const coverUnits = ctx.wallStagger ? ctx.runs : ctx.topCases.map((w) => ({ width: w }));
      const cov = buildCoverItems(ctx.len, coverUnits);
      cov.items.forEach((i) => items.push(i));
      items.push({ name: "M3×6mm screw", qty: cov.screws, hardware: true, optional: true,
        note: "Optional · secures the covers, 1 per 1W." });
      items.push({ name: "M3 hex nut", qty: cov.screws, hardware: true, optional: true,
        note: "Optional · pairs with the M3 cover screws above." });
      return items;
    },
  },

  // QuickLocks: every case takes one Left + one Right. Included with each
  // case model, also available in the universal GEN2 Hardware download.
  quickLock: {
    note: "Included with each case model, or print from the universal GEN2 Hardware pack.",
    linkName: "GEN2 Hardware",
  },

  // Faceplate handle for Decor drawers whose faceplate has no built-in handle.
  // (Other drawer/case hardware — closures, QuickLocks — lives in the Hardware
  // section, built from `closures` + `quickLock`.)
  decorExtras: [
    {
      id: "handle",
      name: () => "Handle or knob (any GEN2-compatible design)",
      qtyPerDrawer: 1,
      boltOnOnly: true,
      note: "Pick any style · handles and knobs are swappable.",
    },
    // The one REQUIRED hardware item on a bolt-on-handle build: the handle
    // screws onto the faceplate from behind. Gated on the same
    // `integratedHandle` test as the handle row (EdgeLabel / Classic Pro print
    // their grip in, so they need none).
    {
      id: "handleScrew",
      name: () => "M3×6mm button head screw",
      qtyPerDrawer: 2,
      hardware: true,
      boltOnOnly: true,
      note: "Fastens the handle to the faceplate · 2 per handle, driven in from behind the plate.",
    },
  ],

  /* How a drawer closes — chosen PER DRAWER in the unit toolbar ("Drawer
     close"), default none. A closure's `parts` bill once per opted-in drawer.
     Classic and Decor share the same clip slot on the back, so closures apply
     to both. `soon` renders the option disabled with its `tip` as the reason;
     `noWall` disables it on wall builds (once released) — PR-001 sticks out
     the back of the case, which a wall doesn't allow. */
  closures: [
    { id: "none", label: "None" },
    {
      id: "magnet", label: "Magnets",
      tip: "Soft-close: a magnet clip bridges the drawer and its case.",
      parts: [
        { name: () => "GEN2 Magnet Clip", qtyPerDrawer: 1, linkAs: "GEN2 Hardware",
          note: "Bridges the drawer and its case for a magnetic soft-close catch. Wider drawers have extra slots if you'd like to add more." },
        { name: () => "Magnets 10×2mm or 6×2mm", qtyPerDrawer: 2, hardware: true,
          note: "Seat in the magnet clips. Standard strength suits most builds · the N52s hold noticeably harder (can be too strong for smaller drawers)." },
      ],
    },
    {
      id: "pushclick", label: "Push-Click", soon: true, noWall: true,
      tip: "PR-001 push-to-open · coming soon. Not for wall builds: it sticks out the back of the case.",
    },
  ],

  /* -----------------------------------------------------------------------
     Part-name templates. Edit these if listing names change — link fallback
     searches use the exact generated name.
     `size` is e.g. "2W-1H"; `style` is a faceplate/door style label.
     ----------------------------------------------------------------------- */
  partNames: {
    drawer:      (len, size, fillLabel) => `GEN2 ${len}-${size} ${fillLabel}`,
    case:        (len, size)            => `GEN2 ${len} Case - ${size}`,
    extender:    (len, w)               => `GEN2 ${len} Case Extender - ${w}W-1H`,
    shelfInsert: (len, w)               => `GEN2 ${len} Shelf Insert - ${w}W`,
    // Faceplates + back covers are UNIVERSAL across lengths (width × height
    // only — shared hardware), so their names carry no length. `len` stays in
    // the signature for caller symmetry. (2026-07-12, Joey: a "240" prefix on
    // a universal part read as length-specific and confused people.)
    faceplate:   (len, size, style)     => `GEN2 ${style} Decor Faceplate - ${size}`,
    backCover:   (len, size)            => `GEN2 Decor Faceplate Back Cover - ${size}`,
    door:        (len, size, style)     => `GEN2 ${len} ${style} Door - ${size}`,
    sideCover:   (len, h)               => `GEN2 ${len} Side Cover - ${h}H`,
    coverUpper:    (len, w)             => `GEN2 ${len} Cover Upper (CU) - ${w}W`,
    coverLower:    (len, w)             => `GEN2 ${len} Cover Lower (CL) - ${w}W`,
    footRailUpper: (len, w)             => `GEN2 ${len} Foot Rail Upper (FR-U) - ${w}W`,
    footRailLower: (len, w)             => `GEN2 ${len} Foot Rail Lower (FR-L) - ${w}W`,
    foot:          ()                   => "GEN2 Foot (TPU)",
    hinge:       ()                     => "GEN2 Cabinet Hinge (1H)",
    latch:       ()                     => "GEN2 Door Latch (1H)",
    quickLockL:  ()                     => "GEN2 QuickLock - Left",
    quickLockR:  ()                     => "GEN2 QuickLock - Right",
  },

  // Parts that aren't published yet — shown with a "coming soon" tag
  // instead of download links. Remove entries as they're released.
  // (backCover left this list 2026-07-12 — the covers ship inside every
  // faceplate series download since v2602, so its rows link the chosen
  // style's series page via linkAs.)
  unreleased: ["shelfInsert", "door", "hinge", "latch", "sideCover"],

  // Exact part names not modeled yet, same "coming soon" treatment as
  // `unreleased` above but for SPECIFIC size/length combos rather than a whole
  // part type — e.g. some drawer sizes exist for one length but not another.
  // A missing render in a batch usually means the model itself isn't done, so
  // this is populated alongside IMAGE_OVERRIDES from what a render batch left out.
  unreleasedParts: [
    // Classic Drawers: the 2026-07-11 all-lengths batch closed every gap
    // except the 3H sizes at 115/240/270 (185/165 have them; the short
    // collections don't cut a 3H).
    "GEN2 270-1W-3H Classic Drawer",
    "GEN2 270-2W-3H Classic Drawer",
    "GEN2 115-1W-3H Classic Drawer",
    "GEN2 115-2W-3H Classic Drawer",
    "GEN2 240-1W-3H Classic Drawer",
    "GEN2 240-2W-3H Classic Drawer",
    // 270 Decor Drawer: one gap in an otherwise-complete batch.
    "GEN2 270-4W-1H Decor Drawer",
  ],

  /* Short instructional YouTube videos, played in the in-page modal. Surfaced
     as "▶ Watch" chips wherever the context matches: `fills` → shown in the
     toolbar when a unit of that fill is selected; `mounts` → shown next to
     that mount's parts-list section; `faceStyles` → shown in the faceplate
     style picker when that style is chosen. Adding a video = adding a row. */
  videos: [
    { id: "b2xK4EpuWog", title: "Cabinet assembly & wall installation",
      fills: ["cabinet"], mounts: ["wall"] },
    { id: "3rPmE_q4KH0", title: "EdgeLabel faceplate assembly",
      faceStyles: ["edgelabel"] },
  ],
};

/* ---------------------------------------------------------------------------
   Cover / foot-rail brick-stagger solver + BOM helpers.
   Tiles a width N (W units) into 1W/2W pieces across two staggered layers
   (upper + lower) so their seams never align. Returns piece counts per layer.
   - 1W / 2W: single piece, lower layer optional (snaps to the case).
   - odd ≥3 : one 1W per layer on opposite ends, rest 2W; both layers required.
   - even ≥4: one all-2W layer, the other with a 1W cap at both ends; both req'd.
   --------------------------------------------------------------------------- */
function brickTiling(n) {
  if (n <= 0) return { upper: {}, lower: {}, lowerOptional: true };
  if (n === 1) return { upper: { 1: 1 }, lower: { 1: 1 }, lowerOptional: true };
  if (n === 2) return { upper: { 2: 1 }, lower: { 2: 1 }, lowerOptional: true };
  if (n % 2 === 1) {
    const twos = (n - 1) / 2;
    return { upper: { 1: 1, 2: twos }, lower: { 1: 1, 2: twos }, lowerOptional: false };
  }
  return { upper: { 2: n / 2 }, lower: { 1: 2, 2: (n - 2) / 2 }, lowerOptional: false };
}

function addMix(target, mix) {
  for (const w in mix) target[w] = (target[w] || 0) + mix[w];
}

// One BOM line per width present (2W first, then 1W), merging `extra` fields.
function mixLines(mix, nameFn, len, extra) {
  const out = [];
  [2, 1].forEach((w) => {
    if (mix[w]) out.push(Object.assign({ name: nameFn(len, w), qty: mix[w] }, extra));
  });
  return out;
}

// Covers (CU + CL) tiled over each contiguous run. Shared by tabletop + wall.
// Returns { items, screws } where screws = optional M3-6mm count (1 per W).
// Covers got their own per-length product pages 2026-07-11 — rows link there
// now, not to the Table Top Kit bundle.
function buildCoverItems(len, runs) {
  const P = GEN2.partNames;
  const cu = {}, cl = {};
  let screws = 0;
  runs.forEach((run) => {
    const t = brickTiling(run.width);
    addMix(cu, t.upper);
    addMix(cl, t.lower);
    screws += run.width;
  });
  const covers = `GEN2 ${len} Covers`;
  const items = [];
  mixLines(cu, P.coverUpper, len, { linkAs: covers, note: "Snaps over the Cover Lower for a smooth finished top." })
    .forEach((i) => items.push(i));
  mixLines(cl, P.coverLower, len, { linkAs: covers, note: "Optional on 1W/2W-only builds, but needed for drawer stoppers and rigidity." })
    .forEach((i) => items.push(i));
  return { items, screws };
}

/* ---------------------------------------------------------------------------
   Download links. Keyed by the generated part name OR by a shared "collection"
   key that many sizes resolve to (see partLinks / COLLECTION_RULES below —
   e.g. every 185 case size points at "GEN2 185 Cases - All").
   Values: { p: printablesURL, t: thangsURL } — either may be omitted.
   Resolution order per platform: exact name → collection page → platform search.
   URLs sourced from the verified GEN2 Printables/Thangs link inventory.
   --------------------------------------------------------------------------- */
const LINK_OVERRIDES = {
  // ---- Under-table rails (Printables pages for every length, 2026-07-12) ----
  "GEN2 Rails - 59":  { p: "https://www.printables.com/model/1053797-gen2-rails-59-small", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20SMALL-1165763" },
  "GEN2 Rails - 115": { p: "https://www.printables.com/model/1053795-gen2-rails-115-medium", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20MEDIUM-1165720" },
  "GEN2 Rails - 165": { p: "https://www.printables.com/model/1053557-gen2-rails-165-mini", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20165-1165793" },
  "GEN2 Rails - 185": { p: "https://www.printables.com/model/1052357-gen2-rails-185-standard", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20STANDARD-1163830" },
  "GEN2 Rails - 240": { p: "https://www.printables.com/model/1322484-gen2-rails-240", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20240%20Lite-1360077" },
  "GEN2 Rails - 270": { p: "https://www.printables.com/model/1053793-gen2-rails-270-large", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20LARGE-1165816" },

  // ---- Cases — one "{len} Cases - All" collection page per length ----
  "GEN2 59 Cases - All":  { p: "https://www.printables.com/model/1658749-gen2-59-cases-all", t: "https://than.gs/m/1535454" },
  "GEN2 115 Cases - All": { p: "https://www.printables.com/model/1658744-gen2-115-cases-all", t: "https://than.gs/m/1535435" },
  "GEN2 165 Cases - All": { p: "https://www.printables.com/model/1658722-gen2-165-cases-all", t: "https://than.gs/m/1535457" },
  "GEN2 185 Cases - All": { p: "https://www.printables.com/model/1658700-gen2-185-cases-all", t: "https://than.gs/m/1535455" },
  "GEN2 240 Cases - All": { p: "https://www.printables.com/model/1658608-gen2-240-cases-all", t: "https://than.gs/m/1535459" },
  "GEN2 270 Cases - All": { p: "https://www.printables.com/model/1658688-gen2-270-cases-all", t: "https://than.gs/m/1535458" },

  // ---- Case extenders ----
  "GEN2 59 Case Extenders":  { p: "https://www.printables.com/model/1563420-gen2-59-case-extenders" },
  "GEN2 115 Case Extenders": { p: "https://www.printables.com/model/1563509-gen2-115-case-extenders" },
  "GEN2 165 Case Extenders": { p: "https://www.printables.com/model/1710717-gen2-165-case-extenders" },
  "GEN2 185 Case Extenders": { p: "https://www.printables.com/model/1706520-gen2-185-case-extenders" },
  "GEN2 240 Case Extenders": { p: "https://www.printables.com/model/1702093-gen2-240-case-extenders" },
  "GEN2 270 Case Extenders": { p: "https://www.printables.com/model/1706499-gen2-270-case-extenders" },

  // ---- Classic drawers — per-length "…Classic Drawers - All" collection ----
  "GEN2 59 Classic Drawers - All":  { p: "https://www.printables.com/model/234780-gen2-59-classic-drawers-all" },
  "GEN2 115 Classic Drawers - All": { p: "https://www.printables.com/model/1143243-gen2-115-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20115%20Classic%20Drawers-1069181" },
  "GEN2 165 Classic Drawers - All": { p: "https://www.printables.com/model/625776-gen2-165-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Classic%20Drawers-1044262" },
  "GEN2 185 Classic Drawers - All": { p: "https://www.printables.com/model/278293-gen2-185-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20-%20Classic%20Drawers-1042322" },
  "GEN2 240 Classic Drawers - All": { p: "https://www.printables.com/model/1324538-gen2-240-classic-drawers-all", t: "https://than.gs/m/1360091" },
  "GEN2 270 Classic Drawers - All": { p: "https://www.printables.com/model/1164306-gen2-270-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Drawers%20-%20Large-1093398" },

  // ---- Decor drawers — per-length "…Decor Drawers - All" collection ----
  "GEN2 59 Decor Drawers - All":  { p: "https://www.printables.com/model/1070454-gen2-59-decor-drawers-all", t: "https://than.gs/m/1481534" },
  "GEN2 115 Decor Drawers - All": { p: "https://www.printables.com/model/1307794-gen2-115-decor-drawers-all", t: "https://than.gs/m/1158598" },
  "GEN2 165 Decor Drawers - All": { p: "https://www.printables.com/model/1100978-gen2-165-decor-drawers-all", t: "https://than.gs/m/1493950" },
  "GEN2 185 Decor Drawers - All": { p: "https://www.printables.com/model/964551-gen2-185-decor-drawers-all", t: "https://than.gs/m/1116945" },
  "GEN2 240 Decor Drawers - All": { p: "https://www.printables.com/model/1322479-gen2-240-decor-drawers-all", t: "https://than.gs/m/1360074" },
  "GEN2 270 Decor Drawers - All": { p: "https://www.printables.com/model/1062961-gen2-270-decor-drawers-all", t: "https://than.gs/m/1171387" },

  // ---- Covers — dedicated per-length pages (Thangs added 2026-07-12; CL/CU rows funnel here) ----
  "GEN2 59 Covers":  { p: "https://www.printables.com/model/1777881-gen2-59-cover", t: "https://than.gs/m/1574324" },
  "GEN2 115 Covers": { p: "https://www.printables.com/model/1777837-gen2-115-cover", t: "https://than.gs/m/1574330" },
  "GEN2 165 Covers": { p: "https://www.printables.com/model/1774498-gen2-165-covers", t: "https://than.gs/m/1574320" },
  "GEN2 185 Covers": { p: "https://www.printables.com/model/1777844-gen2-185-cover", t: "https://than.gs/m/1574319" },
  "GEN2 240 Covers": { p: "https://www.printables.com/model/1777846-gen2-240-cover", t: "https://than.gs/m/1574326" },
  "GEN2 270 Covers": { p: "https://www.printables.com/model/1777849-gen2-270-cover", t: "https://than.gs/m/1574325" },

  // ---- Foot Rails — dedicated per-length pages (Thangs added 2026-07-12; FR rows
  //      funnel here; no 59 — that collection has no foot rails) ----
  "GEN2 115 Foot Rails": { p: "https://www.printables.com/model/1777819-gen2-115-foot-rails", t: "https://than.gs/m/1574331" },
  "GEN2 165 Foot Rails": { p: "https://www.printables.com/model/1775386-gen2-165-foot-rails", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Foot%20Rails-1574329" },
  "GEN2 185 Foot Rails": { p: "https://www.printables.com/model/1777823-gen2-185-foot-rails", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Foot%20Rails-1574328" },
  "GEN2 240 Foot Rails": { p: "https://www.printables.com/model/1777826-gen2-240-foot-rails", t: "https://than.gs/m/1574322" },
  "GEN2 270 Foot Rails": { p: "https://www.printables.com/model/1777830-gen2-270-foot-rails", t: "https://than.gs/m/1574327" },

  // ---- Table Top Kit V2 (feet still funnel here via linkAs) ----
  "GEN2 Table Top Kit V2 - 115": { p: "https://www.printables.com/model/1146353-gen2-table-top-kit-v2-115-medium", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20115-1245167" },
  "GEN2 Table Top Kit V2 - 165": { p: "https://www.printables.com/model/1124278-gen2-table-top-kit-v2-165-mini", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20165-1233752" },
  "GEN2 Table Top Kit V2 - 185": { p: "https://www.printables.com/model/1118906-gen2-table-top-kit-v2-185-standard", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20185-1231757" },
  "GEN2 Table Top Kit V2 - 240": { p: "https://www.printables.com/model/1324501-gen2-table-top-kit-v2-240", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20240-1360073" },
  "GEN2 Table Top Kit V2 - 270": { p: "https://www.printables.com/model/1163955-gen2-table-top-kit-v2-270-large", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20270-1253780" },

  // ---- Wall Mount Kit – Lite — ONE universal brackets page for every length
  //      (2026-07-12, Joey: the 1W/2W/3W sections are shared hardware, so the
  //      per-length pages were retired in favor of the single brackets page) ----
  "GEN2 Wall Mount Kit - Lite - 59":  { p: "https://www.printables.com/model/1777719-gen2-wall-mount-brackets", t: "https://than.gs/m/1574321" },
  "GEN2 Wall Mount Kit - Lite - 115": { p: "https://www.printables.com/model/1777719-gen2-wall-mount-brackets", t: "https://than.gs/m/1574321" },
  "GEN2 Wall Mount Kit - Lite - 165": { p: "https://www.printables.com/model/1777719-gen2-wall-mount-brackets", t: "https://than.gs/m/1574321" },
  "GEN2 Wall Mount Kit - Lite - 185": { p: "https://www.printables.com/model/1777719-gen2-wall-mount-brackets", t: "https://than.gs/m/1574321" },
  "GEN2 Wall Mount Kit - Lite - 240": { p: "https://www.printables.com/model/1777719-gen2-wall-mount-brackets", t: "https://than.gs/m/1574321" },
  "GEN2 Wall Mount Kit - Lite - 270": { p: "https://www.printables.com/model/1777719-gen2-wall-mount-brackets", t: "https://than.gs/m/1574321" },

  // ---- Universal hardware (QuickLocks funnel here via linkAs) ----
  "GEN2 Hardware": { p: "https://www.printables.com/model/1012796-gen2-hardware", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Hardware-1141439" },

  // ---- Decor faceplate series — one page per style (Essential is Thangs-only) ----
  "GEN2 Decor - Faceplates - EdgeLabel Series":   { p: "https://www.printables.com/model/1093933-gen2-decor-faceplates-edgelabel-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplate%20-%20EdgeLabel-1215609" },
  "GEN2 Decor - Faceplates - Classic Pro Series": { p: "https://www.printables.com/model/1291210-gen2-decor-faceplates-classic-pro-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Classic%20Pro%20Series-1332444" },
  "GEN2 Decor - Faceplates - Essential Series":   { p: "https://www.printables.com/model/964559-gen2-decor-faceplates-essential-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Essential%20Series-1116946" },

  // ---- Decor handle series (parts-list handle row links the chosen style) ----
  "GEN2 Decor Handles - BlockBar Series": { p: "https://www.printables.com/model/965604-gen2-decor-handles-blockbar-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20BlockBar-1116949" },
  "GEN2 Decor Handles - Deco Series":     { p: "https://www.printables.com/model/1044972-gen2-decor-handles-deco-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20Handles%20-%20Deco%20Series-1159960" },
  "GEN2 Decor Handles - Crystal Series":  { p: "https://www.printables.com/model/1001155-gen2-decor-handles-crystal", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20Crystal-1134382" },

  // ---- Individual drawer SKUs with a more specific page than their collection ----
  "GEN2 185-1W-3H Classic Drawer":   { p: "https://www.printables.com/model/262035-gen2-185-1w-3h-classic-drawer" },
  "GEN2 185-2W-1H Decor Drawer":     { p: "https://www.printables.com/model/964551-gen2-185-2w-1h-decor-drawer" },
  "GEN2 185-4W-0.5H Decor Drawer":   { p: "https://www.printables.com/model/1413275-gen2-185-4w-05h-decor-drawer" },
  "GEN2 240-2W-2H Decor Drawer":     { p: "https://www.printables.com/model/1365853-gen2-240-2w-2h-decor-drawer" },
  "GEN2 240-2W-0.5H Classic Drawer": { p: "https://www.printables.com/model/1324543-gen2-240-2w-05h-classic-drawer" },

  // ---- Starter kits (shown as a tip) ----
  "GEN2 Under Table Starter Kit - 185": { p: "https://www.printables.com/model/231288-gen2-under-table-starter-kit-185" },
  "GEN2 Under Table Starter Kit - 270": { p: "https://www.printables.com/model/312837-gen2-under-table-starter-kit-270" },
};

/* Amazon affiliate links for the hardware-store items (Joey's, 2026-07-12).
   Keyed by the EXACT BOM row name; each entry renders as a labeled buy button
   in the row's link cell (renderBom adds the affiliate disclosure line).
   Magnets come in two strengths because people complained the standard ones
   were too weak: standard suits most builds, the N52s hold noticeably harder
   (can be too strong for smaller drawers) — the row note says so. No link for
   the M3 hex nut yet — it keeps the plain "hardware store" tag. */
const HARDWARE_BUY = {
  "M3×6mm screw": [
    { label: "Stainless", url: "https://amzn.to/4ymX5G8" },
    { label: "Steel", url: "https://amzn.to/4gA0NWl" },
  ],
  "M3×12mm screw": [
    { label: "Stainless", url: "https://amzn.to/4ymX5G8" },
    { label: "Steel", url: "https://amzn.to/4gA0NWl" },
  ],
  // the handle fastener — the one REQUIRED buy on a bolt-on-handle build
  "M3×6mm button head screw": [
    { label: "Buy M3×6 button head", url: "https://amzn.to/4x4opHK" },
  ],
  "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)": [
    { label: "#6", url: "https://amzn.to/4s487gc" },
    { label: "#8", url: "https://amzn.to/4pTWDuq" },
  ],
  "Magnets 10×2mm or 6×2mm": [
    { label: "10×2mm", url: "https://amzn.to/4sesPKm" },
    { label: "6×2mm", url: "https://amzn.to/4aH1ASw" },
    { label: "N52 10×2mm", url: "https://amzn.to/4q4JX3Z" },
    { label: "N52 6×2mm", url: "https://amzn.to/49BZyC0" },
  ],
};

/* Size-varying parts (cases, drawers, extenders, faceplates) all point at one
   shared "collection" model page. Map a generated part name to that collection
   key — the key itself lives in LINK_OVERRIDES above. Extender before Case so
   "Case Extender - " never matches the plain "Case - " rule. */
const COLLECTION_RULES = [
  [/^GEN2 (\d+) Case Extender - /,      (m) => `GEN2 ${m[1]} Case Extenders`],
  [/^GEN2 (\d+) Case - /,               (m) => `GEN2 ${m[1]} Cases - All`],
  [/^GEN2 (\d+)-.+ Classic Drawer$/,    (m) => `GEN2 ${m[1]} Classic Drawers - All`],
  [/^GEN2 (\d+)-.+ Decor Drawer$/,      (m) => `GEN2 ${m[1]} Decor Drawers - All`],
  // NB anchored so "GEN2 Decor Faceplate Back Cover - …" (no style token)
  // can't false-match — the back cover links via linkAs instead.
  [/^GEN2 (.+) Decor Faceplate - /,     (m) => `GEN2 Decor - Faceplates - ${m[1]} Series`],
];
function collectionKeyFor(name) {
  for (const [re, fn] of COLLECTION_RULES) {
    const m = name.match(re);
    if (m) return fn(m);
  }
  return null;
}

/* Resolve links for a part name. Per platform: an exact name override wins,
   else the part's collection page, else a search on that platform. */
function partLinks(name) {
  const exact = LINK_OVERRIDES[name] || {};
  const ck = collectionKeyFor(name);
  const coll = (ck && LINK_OVERRIDES[ck]) || {};
  const p = exact.p || coll.p;
  const t = exact.t || coll.t;
  const q = encodeURIComponent(name);
  return {
    printables: p || "https://www.printables.com/search/models?q=" + q,
    thangs: t || "https://thangs.com/search/" + q,
    exactP: !!p,
    exactT: !!t,
  };
}

/* Parts that share one render, or whose file doesn't follow the naming rule.
   Exact part name → path. Checked before the automatic slug below.
   NOTE: filenames are case-sensitive once hosted (GitHub Pages), even though
   Windows doesn't care locally. */
const IMAGE_OVERRIDES = {
  "GEN2 QuickLock - Left": "img/parts/QuickLock.png",
  "GEN2 QuickLock - Right": "img/parts/QuickLock-R.png", // the Left render flipped horizontally (2026-07-10) — they're mirror parts
  "GEN2 Magnet Clip": "img/parts/Magnet Clip.png",
  // L/R stoppers are mirrored parts sharing one render
  "GEN2 Drawer Stopper - Left": "img/parts/Drawer Stopper.png",
  "GEN2 Drawer Stopper - Right": "img/parts/Drawer Stopper.png",
  // Hardware-store items (bought, not printed) — real reference photos instead
  // of the generic wrench icon, so a user knows exactly what to pick up.
  // renderBom() looks these up specially: it.hardware skips partImage()'s
  // auto-pattern (these names don't follow the "GEN2 ..." convention anyway)
  // and falls back to hardware.svg, never the "coming soon" placeholder.
  "M3×6mm screw": "img/parts/Screw.png",
  "M3×12mm screw": "img/parts/Screw.png",
  "M3×6mm button head screw": "img/parts/ButtonHeadScrew_M3-6.png",
  "M3 hex nut": "img/parts/Nut.png",
  "Magnets 10×2mm or 6×2mm": "img/parts/Magnets.png",
  "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)": "img/parts/Wood Screw.png",
  // 185 Decor Drawer renders (2026-07) live in img/parts/185/ with a
  // "Decor Drawer 185-<size>" scheme — no dots in filenames (0.5H → 05H).
  // All 18 catalog sizes; case-sensitive once hosted on GitHub Pages.
  "GEN2 185-1W-0.5H Decor Drawer": "img/parts/185/Decor Drawer 185-1W-05H.png",
  "GEN2 185-1W-1H Decor Drawer":   "img/parts/185/Decor Drawer 185-1W-1H.png",
  "GEN2 185-1W-1.5H Decor Drawer": "img/parts/185/Decor Drawer 185-1W-15H.png",
  "GEN2 185-1W-2H Decor Drawer":   "img/parts/185/Decor Drawer 185-1W-2H.png",
  "GEN2 185-1W-3H Decor Drawer":   "img/parts/185/Decor Drawer 185-1W-3H.png",
  "GEN2 185-2W-0.5H Decor Drawer": "img/parts/185/Decor Drawer 185-2W-05H.png",
  "GEN2 185-2W-1H Decor Drawer":   "img/parts/185/Decor Drawer 185-2W-1H.png",
  "GEN2 185-2W-1.5H Decor Drawer": "img/parts/185/Decor Drawer 185-2W-15H.png",
  "GEN2 185-2W-2H Decor Drawer":   "img/parts/185/Decor Drawer 185-2W-2H.png",
  "GEN2 185-2W-3H Decor Drawer":   "img/parts/185/Decor Drawer 185-2W-3H.png",
  "GEN2 185-3W-0.5H Decor Drawer": "img/parts/185/Decor Drawer 185-3W-05H.png",
  "GEN2 185-3W-1H Decor Drawer":   "img/parts/185/Decor Drawer 185-3W-1H.png",
  "GEN2 185-3W-1.5H Decor Drawer": "img/parts/185/Decor Drawer 185-3W-15H.png",
  "GEN2 185-3W-2H Decor Drawer":   "img/parts/185/Decor Drawer 185-3W-2H.png",
  "GEN2 185-4W-0.5H Decor Drawer": "img/parts/185/Decor Drawer 185-4W-05H.png",
  "GEN2 185-4W-1H Decor Drawer":   "img/parts/185/Decor Drawer 185-4W-1H.png",
  "GEN2 185-4W-1.5H Decor Drawer": "img/parts/185/Decor Drawer 185-4W-15H.png",
  "GEN2 185-4W-2H Decor Drawer":   "img/parts/185/Decor Drawer 185-4W-2H.png",
  // 185 Case renders (2026-07) — all 18 valid sizes (no 3W-3H/4W-3H; those
  // combos don't exist, see GEN2.unavailableSizes).
  "GEN2 185 Case - 1W-0.5H": "img/parts/185/Case 185-1W-05H.png",
  "GEN2 185 Case - 1W-1H":   "img/parts/185/Case 185-1W-1H.png",
  "GEN2 185 Case - 1W-1.5H": "img/parts/185/Case 185-1W-15H.png",
  "GEN2 185 Case - 1W-2H":   "img/parts/185/Case 185-1W-2H.png",
  "GEN2 185 Case - 1W-3H":   "img/parts/185/Case 185-1W-3H.png",
  "GEN2 185 Case - 2W-0.5H": "img/parts/185/Case 185-2W-05H.png",
  "GEN2 185 Case - 2W-1H":   "img/parts/185/Case 185-2W-1H.png",
  "GEN2 185 Case - 2W-1.5H": "img/parts/185/Case 185-2W-15H.png",
  "GEN2 185 Case - 2W-2H":   "img/parts/185/Case 185-2W-2H.png",
  "GEN2 185 Case - 2W-3H":   "img/parts/185/Case 185-2W-3H.png",
  "GEN2 185 Case - 3W-0.5H": "img/parts/185/Case 185-3W-05H.png",
  "GEN2 185 Case - 3W-1H":   "img/parts/185/Case 185-3W-1H.png",
  "GEN2 185 Case - 3W-1.5H": "img/parts/185/Case 185-3W-15H.png",
  "GEN2 185 Case - 3W-2H":   "img/parts/185/Case 185-3W-2H.png",
  "GEN2 185 Case - 4W-0.5H": "img/parts/185/Case 185-4W-05H.png",
  "GEN2 185 Case - 4W-1H":   "img/parts/185/Case 185-4W-1H.png",
  "GEN2 185 Case - 4W-1.5H": "img/parts/185/Case 185-4W-15H.png",
  "GEN2 185 Case - 4W-2H":   "img/parts/185/Case 185-4W-2H.png",
  // 185 Classic Drawer renders — all 18 catalog sizes (the 3W/4W × 1.5H/2H
  // models + renders landed with the 2026-07-11 all-lengths batch).
  "GEN2 185-1W-0.5H Classic Drawer": "img/parts/185/Classic Drawer 185-1W-05H.png",
  "GEN2 185-1W-1H Classic Drawer":   "img/parts/185/Classic Drawer 185-1W-1H.png",
  "GEN2 185-1W-1.5H Classic Drawer": "img/parts/185/Classic Drawer 185-1W-15H.png",
  "GEN2 185-1W-2H Classic Drawer":   "img/parts/185/Classic Drawer 185-1W-2H.png",
  "GEN2 185-1W-3H Classic Drawer":   "img/parts/185/Classic Drawer 185-1W-3H.png",
  "GEN2 185-2W-0.5H Classic Drawer": "img/parts/185/Classic Drawer 185-2W-05H.png",
  "GEN2 185-2W-1H Classic Drawer":   "img/parts/185/Classic Drawer 185-2W-1H.png",
  "GEN2 185-2W-1.5H Classic Drawer": "img/parts/185/Classic Drawer 185-2W-15H.png",
  "GEN2 185-2W-2H Classic Drawer":   "img/parts/185/Classic Drawer 185-2W-2H.png",
  "GEN2 185-2W-3H Classic Drawer":   "img/parts/185/Classic Drawer 185-2W-3H.png",
  "GEN2 185-3W-0.5H Classic Drawer": "img/parts/185/Classic Drawer 185-3W-05H.png",
  "GEN2 185-3W-1H Classic Drawer":   "img/parts/185/Classic Drawer 185-3W-1H.png",
  "GEN2 185-3W-1.5H Classic Drawer": "img/parts/185/Classic Drawer 185-3W-15H.png",
  "GEN2 185-3W-2H Classic Drawer":   "img/parts/185/Classic Drawer 185-3W-2H.png",
  "GEN2 185-4W-0.5H Classic Drawer": "img/parts/185/Classic Drawer 185-4W-05H.png",
  "GEN2 185-4W-1H Classic Drawer":   "img/parts/185/Classic Drawer 185-4W-1H.png",
  "GEN2 185-4W-1.5H Classic Drawer": "img/parts/185/Classic Drawer 185-4W-15H.png",
  "GEN2 185-4W-2H Classic Drawer":   "img/parts/185/Classic Drawer 185-4W-2H.png",
  // 185 Case Extender renders (2026-07) — width-only, all 4 sizes (1W-4W).
  "GEN2 185 Case Extender - 1W-1H": "img/parts/185/Case Extender 185-1W.png",
  "GEN2 185 Case Extender - 2W-1H": "img/parts/185/Case Extender 185-2W.png",
  "GEN2 185 Case Extender - 3W-1H": "img/parts/185/Case Extender 185-3W.png",
  "GEN2 185 Case Extender - 4W-1H": "img/parts/185/Case Extender 185-4W.png",
  // 165 Classic Drawer renders — all 18 catalog sizes (3W/4W × 1.5H/2H landed
  // with the 2026-07-11 all-lengths batch, same as 185).
  "GEN2 165-1W-0.5H Classic Drawer": "img/parts/165/Classic Drawer 165-1W-05H.png",
  "GEN2 165-1W-1H Classic Drawer":   "img/parts/165/Classic Drawer 165-1W-1H.png",
  "GEN2 165-1W-1.5H Classic Drawer": "img/parts/165/Classic Drawer 165-1W-15H.png",
  "GEN2 165-1W-2H Classic Drawer":   "img/parts/165/Classic Drawer 165-1W-2H.png",
  "GEN2 165-1W-3H Classic Drawer":   "img/parts/165/Classic Drawer 165-1W-3H.png",
  "GEN2 165-2W-0.5H Classic Drawer": "img/parts/165/Classic Drawer 165-2W-05H.png",
  "GEN2 165-2W-1H Classic Drawer":   "img/parts/165/Classic Drawer 165-2W-1H.png",
  "GEN2 165-2W-1.5H Classic Drawer": "img/parts/165/Classic Drawer 165-2W-15H.png",
  "GEN2 165-2W-2H Classic Drawer":   "img/parts/165/Classic Drawer 165-2W-2H.png",
  "GEN2 165-2W-3H Classic Drawer":   "img/parts/165/Classic Drawer 165-2W-3H.png",
  "GEN2 165-3W-0.5H Classic Drawer": "img/parts/165/Classic Drawer 165-3W-05H.png",
  "GEN2 165-3W-1H Classic Drawer":   "img/parts/165/Classic Drawer 165-3W-1H.png",
  "GEN2 165-3W-1.5H Classic Drawer": "img/parts/165/Classic Drawer 165-3W-15H.png",
  "GEN2 165-3W-2H Classic Drawer":   "img/parts/165/Classic Drawer 165-3W-2H.png",
  "GEN2 165-4W-0.5H Classic Drawer": "img/parts/165/Classic Drawer 165-4W-05H.png",
  "GEN2 165-4W-1H Classic Drawer":   "img/parts/165/Classic Drawer 165-4W-1H.png",
  "GEN2 165-4W-1.5H Classic Drawer": "img/parts/165/Classic Drawer 165-4W-15H.png",
  "GEN2 165-4W-2H Classic Drawer":   "img/parts/165/Classic Drawer 165-4W-2H.png",
  // 165 Decor Drawer renders (2026-07) — all 18 catalog sizes.
  "GEN2 165-1W-0.5H Decor Drawer": "img/parts/165/Decor Drawer 165-1W-05H.png",
  "GEN2 165-1W-1H Decor Drawer":   "img/parts/165/Decor Drawer 165-1W-1H.png",
  "GEN2 165-1W-1.5H Decor Drawer": "img/parts/165/Decor Drawer 165-1W-15H.png",
  "GEN2 165-1W-2H Decor Drawer":   "img/parts/165/Decor Drawer 165-1W-2H.png",
  "GEN2 165-1W-3H Decor Drawer":   "img/parts/165/Decor Drawer 165-1W-3H.png",
  "GEN2 165-2W-0.5H Decor Drawer": "img/parts/165/Decor Drawer 165-2W-05H.png",
  "GEN2 165-2W-1H Decor Drawer":   "img/parts/165/Decor Drawer 165-2W-1H.png",
  "GEN2 165-2W-1.5H Decor Drawer": "img/parts/165/Decor Drawer 165-2W-15H.png",
  "GEN2 165-2W-2H Decor Drawer":   "img/parts/165/Decor Drawer 165-2W-2H.png",
  "GEN2 165-2W-3H Decor Drawer":   "img/parts/165/Decor Drawer 165-2W-3H.png",
  "GEN2 165-3W-0.5H Decor Drawer": "img/parts/165/Decor Drawer 165-3W-05H.png",
  "GEN2 165-3W-1H Decor Drawer":   "img/parts/165/Decor Drawer 165-3W-1H.png",
  "GEN2 165-3W-1.5H Decor Drawer": "img/parts/165/Decor Drawer 165-3W-15H.png",
  "GEN2 165-3W-2H Decor Drawer":   "img/parts/165/Decor Drawer 165-3W-2H.png",
  "GEN2 165-4W-0.5H Decor Drawer": "img/parts/165/Decor Drawer 165-4W-05H.png",
  "GEN2 165-4W-1H Decor Drawer":   "img/parts/165/Decor Drawer 165-4W-1H.png",
  "GEN2 165-4W-1.5H Decor Drawer": "img/parts/165/Decor Drawer 165-4W-15H.png",
  "GEN2 165-4W-2H Decor Drawer":   "img/parts/165/Decor Drawer 165-4W-2H.png",
  // 165 Case renders (2026-07) — all 18 valid sizes (no 3W-3H/4W-3H).
  "GEN2 165 Case - 1W-0.5H": "img/parts/165/Case 165-1W-05H.png",
  "GEN2 165 Case - 1W-1H":   "img/parts/165/Case 165-1W-1H.png",
  "GEN2 165 Case - 1W-1.5H": "img/parts/165/Case 165-1W-15H.png",
  "GEN2 165 Case - 1W-2H":   "img/parts/165/Case 165-1W-2H.png",
  "GEN2 165 Case - 1W-3H":   "img/parts/165/Case 165-1W-3H.png",
  "GEN2 165 Case - 2W-0.5H": "img/parts/165/Case 165-2W-05H.png",
  "GEN2 165 Case - 2W-1H":   "img/parts/165/Case 165-2W-1H.png",
  "GEN2 165 Case - 2W-1.5H": "img/parts/165/Case 165-2W-15H.png",
  "GEN2 165 Case - 2W-2H":   "img/parts/165/Case 165-2W-2H.png",
  "GEN2 165 Case - 2W-3H":   "img/parts/165/Case 165-2W-3H.png",
  "GEN2 165 Case - 3W-0.5H": "img/parts/165/Case 165-3W-05H.png",
  "GEN2 165 Case - 3W-1H":   "img/parts/165/Case 165-3W-1H.png",
  "GEN2 165 Case - 3W-1.5H": "img/parts/165/Case 165-3W-15H.png",
  "GEN2 165 Case - 3W-2H":   "img/parts/165/Case 165-3W-2H.png",
  "GEN2 165 Case - 4W-0.5H": "img/parts/165/Case 165-4W-05H.png",
  "GEN2 165 Case - 4W-1H":   "img/parts/165/Case 165-4W-1H.png",
  "GEN2 165 Case - 4W-1.5H": "img/parts/165/Case 165-4W-15H.png",
  "GEN2 165 Case - 4W-2H":   "img/parts/165/Case 165-4W-2H.png",
  // 270 Case renders (2026-07) — all 18 valid sizes (no 3W-3H/4W-3H).
  "GEN2 270 Case - 1W-0.5H": "img/parts/270/Case 270-1W-05H.png",
  "GEN2 270 Case - 1W-1H":   "img/parts/270/Case 270-1W-1H.png",
  "GEN2 270 Case - 1W-1.5H": "img/parts/270/Case 270-1W-15H.png",
  "GEN2 270 Case - 1W-2H":   "img/parts/270/Case 270-1W-2H.png",
  "GEN2 270 Case - 1W-3H":   "img/parts/270/Case 270-1W-3H.png",
  "GEN2 270 Case - 2W-0.5H": "img/parts/270/Case 270-2W-05H.png",
  "GEN2 270 Case - 2W-1H":   "img/parts/270/Case 270-2W-1H.png",
  "GEN2 270 Case - 2W-1.5H": "img/parts/270/Case 270-2W-15H.png",
  "GEN2 270 Case - 2W-2H":   "img/parts/270/Case 270-2W-2H.png",
  "GEN2 270 Case - 2W-3H":   "img/parts/270/Case 270-2W-3H.png",
  "GEN2 270 Case - 3W-0.5H": "img/parts/270/Case 270-3W-05H.png",
  "GEN2 270 Case - 3W-1H":   "img/parts/270/Case 270-3W-1H.png",
  "GEN2 270 Case - 3W-1.5H": "img/parts/270/Case 270-3W-15H.png",
  "GEN2 270 Case - 3W-2H":   "img/parts/270/Case 270-3W-2H.png",
  "GEN2 270 Case - 4W-0.5H": "img/parts/270/Case 270-4W-05H.png",
  "GEN2 270 Case - 4W-1H":   "img/parts/270/Case 270-4W-1H.png",
  "GEN2 270 Case - 4W-1.5H": "img/parts/270/Case 270-4W-15H.png",
  "GEN2 270 Case - 4W-2H":   "img/parts/270/Case 270-4W-2H.png",
  // 270 Case Extender renders (2026-07) — width-only, all 4 sizes.
  "GEN2 270 Case Extender - 1W-1H": "img/parts/270/Case Extender 270-1W.png",
  "GEN2 270 Case Extender - 2W-1H": "img/parts/270/Case Extender 270-2W.png",
  "GEN2 270 Case Extender - 3W-1H": "img/parts/270/Case Extender 270-3W.png",
  "GEN2 270 Case Extender - 4W-1H": "img/parts/270/Case Extender 270-4W.png",
  // 270 Classic Drawer renders — 16 of 18 catalog sizes (3W/4W × 1.5H/2H
  // landed with the 2026-07-11 all-lengths batch). Still unmodeled: 1W/2W-3H
  // (unlike 185/165) — those stay in GEN2.unreleasedParts.
  "GEN2 270-1W-0.5H Classic Drawer": "img/parts/270/Classic Drawer 270-1W-05H.png",
  "GEN2 270-1W-1H Classic Drawer":   "img/parts/270/Classic Drawer 270-1W-1H.png",
  "GEN2 270-1W-1.5H Classic Drawer": "img/parts/270/Classic Drawer 270-1W-15H.png",
  "GEN2 270-1W-2H Classic Drawer":   "img/parts/270/Classic Drawer 270-1W-2H.png",
  "GEN2 270-2W-0.5H Classic Drawer": "img/parts/270/Classic Drawer 270-2W-05H.png",
  "GEN2 270-2W-1H Classic Drawer":   "img/parts/270/Classic Drawer 270-2W-1H.png",
  "GEN2 270-2W-1.5H Classic Drawer": "img/parts/270/Classic Drawer 270-2W-15H.png",
  "GEN2 270-2W-2H Classic Drawer":   "img/parts/270/Classic Drawer 270-2W-2H.png",
  "GEN2 270-3W-0.5H Classic Drawer": "img/parts/270/Classic Drawer 270-3W-05H.png",
  "GEN2 270-3W-1H Classic Drawer":   "img/parts/270/Classic Drawer 270-3W-1H.png",
  "GEN2 270-3W-1.5H Classic Drawer": "img/parts/270/Classic Drawer 270-3W-15H.png",
  "GEN2 270-3W-2H Classic Drawer":   "img/parts/270/Classic Drawer 270-3W-2H.png",
  "GEN2 270-4W-0.5H Classic Drawer": "img/parts/270/Classic Drawer 270-4W-05H.png",
  "GEN2 270-4W-1H Classic Drawer":   "img/parts/270/Classic Drawer 270-4W-1H.png",
  "GEN2 270-4W-1.5H Classic Drawer": "img/parts/270/Classic Drawer 270-4W-15H.png",
  "GEN2 270-4W-2H Classic Drawer":   "img/parts/270/Classic Drawer 270-4W-2H.png",
  // 270 Decor Drawer renders (2026-07). 17 of 18 sizes — see unreleasedParts
  // for the one gap (4W-1H).
  "GEN2 270-1W-0.5H Decor Drawer": "img/parts/270/Decor Drawer 270-1W-05H.png",
  "GEN2 270-1W-1H Decor Drawer":   "img/parts/270/Decor Drawer 270-1W-1H.png",
  "GEN2 270-1W-1.5H Decor Drawer": "img/parts/270/Decor Drawer 270-1W-15H.png",
  "GEN2 270-1W-2H Decor Drawer":   "img/parts/270/Decor Drawer 270-1W-2H.png",
  "GEN2 270-1W-3H Decor Drawer":   "img/parts/270/Decor Drawer 270-1W-3H.png",
  "GEN2 270-2W-0.5H Decor Drawer": "img/parts/270/Decor Drawer 270-2W-05H.png",
  "GEN2 270-2W-1H Decor Drawer":   "img/parts/270/Decor Drawer 270-2W-1H.png",
  "GEN2 270-2W-1.5H Decor Drawer": "img/parts/270/Decor Drawer 270-2W-15H.png",
  "GEN2 270-2W-2H Decor Drawer":   "img/parts/270/Decor Drawer 270-2W-2H.png",
  "GEN2 270-2W-3H Decor Drawer":   "img/parts/270/Decor Drawer 270-2W-3H.png",
  "GEN2 270-3W-0.5H Decor Drawer": "img/parts/270/Decor Drawer 270-3W-05H.png",
  "GEN2 270-3W-1H Decor Drawer":   "img/parts/270/Decor Drawer 270-3W-1H.png",
  "GEN2 270-3W-1.5H Decor Drawer": "img/parts/270/Decor Drawer 270-3W-15H.png",
  "GEN2 270-3W-2H Decor Drawer":   "img/parts/270/Decor Drawer 270-3W-2H.png",
  "GEN2 270-4W-0.5H Decor Drawer": "img/parts/270/Decor Drawer 270-4W-05H.png",
  "GEN2 270-4W-1.5H Decor Drawer": "img/parts/270/Decor Drawer 270-4W-15H.png",
  "GEN2 270-4W-2H Decor Drawer":   "img/parts/270/Decor Drawer 270-4W-2H.png",
  // 59 Decor Drawer renders (2026-07) — 59 has only the 4 short sizes
  "GEN2 59-1W-0.5H Decor Drawer": "img/parts/59/Decor Drawer 59-1W-05H.png",
  "GEN2 59-1W-1H Decor Drawer": "img/parts/59/Decor Drawer 59-1W-1H.png",
  "GEN2 59-2W-0.5H Decor Drawer": "img/parts/59/Decor Drawer 59-2W-05H.png",
  "GEN2 59-2W-1H Decor Drawer": "img/parts/59/Decor Drawer 59-2W-1H.png",
  // 59 Classic Drawer renders (2026-07)
  "GEN2 59-1W-0.5H Classic Drawer": "img/parts/59/Classic Drawer 59-1W-05H.png",
  "GEN2 59-1W-1H Classic Drawer": "img/parts/59/Classic Drawer 59-1W-1H.png",
  "GEN2 59-2W-0.5H Classic Drawer": "img/parts/59/Classic Drawer 59-2W-05H.png",
  "GEN2 59-2W-1H Classic Drawer": "img/parts/59/Classic Drawer 59-2W-1H.png",
  // 59 Case renders (2026-07)
  "GEN2 59 Case - 1W-0.5H": "img/parts/59/Case 59-1W-05H.png",
  "GEN2 59 Case - 1W-1H": "img/parts/59/Case 59-1W-1H.png",
  "GEN2 59 Case - 2W-0.5H": "img/parts/59/Case 59-2W-05H.png",
  "GEN2 59 Case - 2W-1H": "img/parts/59/Case 59-2W-1H.png",
  // 59 Case Extender renders (2026-07)
  "GEN2 59 Case Extender - 1W-1H": "img/parts/59/Case Extender 59-1W.png",
  "GEN2 59 Case Extender - 2W-1H": "img/parts/59/Case Extender 59-2W.png",
  "GEN2 59 Case Extender - 3W-1H": "img/parts/59/Case Extender 59-3W.png",
  "GEN2 59 Case Extender - 4W-1H": "img/parts/59/Case Extender 59-4W.png",
  // 115 Decor Drawer renders (2026-07) — all 18 sizes
  "GEN2 115-1W-0.5H Decor Drawer": "img/parts/115/Decor Drawer 115-1W-05H.png",
  "GEN2 115-1W-1.5H Decor Drawer": "img/parts/115/Decor Drawer 115-1W-15H.png",
  "GEN2 115-1W-1H Decor Drawer": "img/parts/115/Decor Drawer 115-1W-1H.png",
  "GEN2 115-1W-2H Decor Drawer": "img/parts/115/Decor Drawer 115-1W-2H.png",
  "GEN2 115-1W-3H Decor Drawer": "img/parts/115/Decor Drawer 115-1W-3H.png",
  "GEN2 115-2W-0.5H Decor Drawer": "img/parts/115/Decor Drawer 115-2W-05H.png",
  "GEN2 115-2W-1.5H Decor Drawer": "img/parts/115/Decor Drawer 115-2W-15H.png",
  "GEN2 115-2W-1H Decor Drawer": "img/parts/115/Decor Drawer 115-2W-1H.png",
  "GEN2 115-2W-2H Decor Drawer": "img/parts/115/Decor Drawer 115-2W-2H.png",
  "GEN2 115-2W-3H Decor Drawer": "img/parts/115/Decor Drawer 115-2W-3H.png",
  "GEN2 115-3W-0.5H Decor Drawer": "img/parts/115/Decor Drawer 115-3W-05H.png",
  "GEN2 115-3W-1.5H Decor Drawer": "img/parts/115/Decor Drawer 115-3W-15H.png",
  "GEN2 115-3W-1H Decor Drawer": "img/parts/115/Decor Drawer 115-3W-1H.png",
  "GEN2 115-3W-2H Decor Drawer": "img/parts/115/Decor Drawer 115-3W-2H.png",
  "GEN2 115-4W-0.5H Decor Drawer": "img/parts/115/Decor Drawer 115-4W-05H.png",
  "GEN2 115-4W-1.5H Decor Drawer": "img/parts/115/Decor Drawer 115-4W-15H.png",
  "GEN2 115-4W-1H Decor Drawer": "img/parts/115/Decor Drawer 115-4W-1H.png",
  "GEN2 115-4W-2H Decor Drawer": "img/parts/115/Decor Drawer 115-4W-2H.png",
  // 115 Classic Drawer renders — all 16 catalog sizes (3W/4W landed with the
  // 2026-07-11 all-lengths batch; no 3H at this length — see unreleasedParts)
  "GEN2 115-1W-0.5H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-05H.png",
  "GEN2 115-1W-1.5H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-15H.png",
  "GEN2 115-1W-1H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-1H.png",
  "GEN2 115-1W-2H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-2H.png",
  "GEN2 115-2W-0.5H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-05H.png",
  "GEN2 115-2W-1.5H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-15H.png",
  "GEN2 115-2W-1H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-1H.png",
  "GEN2 115-2W-2H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-2H.png",
  "GEN2 115-3W-0.5H Classic Drawer": "img/parts/115/Classic Drawer 115-3W-05H.png",
  "GEN2 115-3W-1.5H Classic Drawer": "img/parts/115/Classic Drawer 115-3W-15H.png",
  "GEN2 115-3W-1H Classic Drawer": "img/parts/115/Classic Drawer 115-3W-1H.png",
  "GEN2 115-3W-2H Classic Drawer": "img/parts/115/Classic Drawer 115-3W-2H.png",
  "GEN2 115-4W-0.5H Classic Drawer": "img/parts/115/Classic Drawer 115-4W-05H.png",
  "GEN2 115-4W-1.5H Classic Drawer": "img/parts/115/Classic Drawer 115-4W-15H.png",
  "GEN2 115-4W-1H Classic Drawer": "img/parts/115/Classic Drawer 115-4W-1H.png",
  "GEN2 115-4W-2H Classic Drawer": "img/parts/115/Classic Drawer 115-4W-2H.png",
  // 115 Case renders (2026-07) — all 18 sizes
  "GEN2 115 Case - 1W-0.5H": "img/parts/115/Case 115-1W-05H.png",
  "GEN2 115 Case - 1W-1.5H": "img/parts/115/Case 115-1W-15H.png",
  "GEN2 115 Case - 1W-1H": "img/parts/115/Case 115-1W-1H.png",
  "GEN2 115 Case - 1W-2H": "img/parts/115/Case 115-1W-2H.png",
  "GEN2 115 Case - 1W-3H": "img/parts/115/Case 115-1W-3H.png",
  "GEN2 115 Case - 2W-0.5H": "img/parts/115/Case 115-2W-05H.png",
  "GEN2 115 Case - 2W-1.5H": "img/parts/115/Case 115-2W-15H.png",
  "GEN2 115 Case - 2W-1H": "img/parts/115/Case 115-2W-1H.png",
  "GEN2 115 Case - 2W-2H": "img/parts/115/Case 115-2W-2H.png",
  "GEN2 115 Case - 2W-3H": "img/parts/115/Case 115-2W-3H.png",
  "GEN2 115 Case - 3W-0.5H": "img/parts/115/Case 115-3W-05H.png",
  "GEN2 115 Case - 3W-1.5H": "img/parts/115/Case 115-3W-15H.png",
  "GEN2 115 Case - 3W-1H": "img/parts/115/Case 115-3W-1H.png",
  "GEN2 115 Case - 3W-2H": "img/parts/115/Case 115-3W-2H.png",
  "GEN2 115 Case - 4W-0.5H": "img/parts/115/Case 115-4W-05H.png",
  "GEN2 115 Case - 4W-1.5H": "img/parts/115/Case 115-4W-15H.png",
  "GEN2 115 Case - 4W-1H": "img/parts/115/Case 115-4W-1H.png",
  "GEN2 115 Case - 4W-2H": "img/parts/115/Case 115-4W-2H.png",
  // 115 Case Extender renders (2026-07)
  "GEN2 115 Case Extender - 1W-1H": "img/parts/115/Case Extender 115-1W.png",
  "GEN2 115 Case Extender - 2W-1H": "img/parts/115/Case Extender 115-2W.png",
  "GEN2 115 Case Extender - 3W-1H": "img/parts/115/Case Extender 115-3W.png",
  "GEN2 115 Case Extender - 4W-1H": "img/parts/115/Case Extender 115-4W.png",
  // 240 Decor Drawer renders (2026-07) — all 18 sizes
  "GEN2 240-1W-0.5H Decor Drawer": "img/parts/240/Decor Drawer 240-1W-05H.png",
  "GEN2 240-1W-1.5H Decor Drawer": "img/parts/240/Decor Drawer 240-1W-15H.png",
  "GEN2 240-1W-1H Decor Drawer": "img/parts/240/Decor Drawer 240-1W-1H.png",
  "GEN2 240-1W-2H Decor Drawer": "img/parts/240/Decor Drawer 240-1W-2H.png",
  "GEN2 240-1W-3H Decor Drawer": "img/parts/240/Decor Drawer 240-1W-3H.png",
  "GEN2 240-2W-0.5H Decor Drawer": "img/parts/240/Decor Drawer 240-2W-05H.png",
  "GEN2 240-2W-1.5H Decor Drawer": "img/parts/240/Decor Drawer 240-2W-15H.png",
  "GEN2 240-2W-1H Decor Drawer": "img/parts/240/Decor Drawer 240-2W-1H.png",
  "GEN2 240-2W-2H Decor Drawer": "img/parts/240/Decor Drawer 240-2W-2H.png",
  "GEN2 240-2W-3H Decor Drawer": "img/parts/240/Decor Drawer 240-2W-3H.png",
  "GEN2 240-3W-0.5H Decor Drawer": "img/parts/240/Decor Drawer 240-3W-05H.png",
  "GEN2 240-3W-1.5H Decor Drawer": "img/parts/240/Decor Drawer 240-3W-15H.png",
  "GEN2 240-3W-1H Decor Drawer": "img/parts/240/Decor Drawer 240-3W-1H.png",
  "GEN2 240-3W-2H Decor Drawer": "img/parts/240/Decor Drawer 240-3W-2H.png",
  "GEN2 240-4W-0.5H Decor Drawer": "img/parts/240/Decor Drawer 240-4W-05H.png",
  "GEN2 240-4W-1.5H Decor Drawer": "img/parts/240/Decor Drawer 240-4W-15H.png",
  "GEN2 240-4W-1H Decor Drawer": "img/parts/240/Decor Drawer 240-4W-1H.png",
  "GEN2 240-4W-2H Decor Drawer": "img/parts/240/Decor Drawer 240-4W-2H.png",
  // 240 Classic Drawer renders — 16 of 18 catalog sizes (3W/4W × 1.5H/2H
  // landed with the 2026-07-11 all-lengths batch). Still unmodeled: 1W/2W-3H
  // — those stay in GEN2.unreleasedParts.
  "GEN2 240-1W-0.5H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-05H.png",
  "GEN2 240-1W-1.5H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-15H.png",
  "GEN2 240-1W-1H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-1H.png",
  "GEN2 240-1W-2H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-2H.png",
  "GEN2 240-2W-0.5H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-05H.png",
  "GEN2 240-2W-1.5H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-15H.png",
  "GEN2 240-2W-1H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-1H.png",
  "GEN2 240-2W-2H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-2H.png",
  "GEN2 240-3W-0.5H Classic Drawer": "img/parts/240/Classic Drawer 240-3W-05H.png",
  "GEN2 240-3W-1.5H Classic Drawer": "img/parts/240/Classic Drawer 240-3W-15H.png",
  "GEN2 240-3W-1H Classic Drawer": "img/parts/240/Classic Drawer 240-3W-1H.png",
  "GEN2 240-3W-2H Classic Drawer": "img/parts/240/Classic Drawer 240-3W-2H.png",
  "GEN2 240-4W-0.5H Classic Drawer": "img/parts/240/Classic Drawer 240-4W-05H.png",
  "GEN2 240-4W-1.5H Classic Drawer": "img/parts/240/Classic Drawer 240-4W-15H.png",
  "GEN2 240-4W-1H Classic Drawer": "img/parts/240/Classic Drawer 240-4W-1H.png",
  "GEN2 240-4W-2H Classic Drawer": "img/parts/240/Classic Drawer 240-4W-2H.png",
  // 240 Case renders (2026-07) — all 18 sizes
  "GEN2 240 Case - 1W-0.5H": "img/parts/240/Case 240-1W-05H.png",
  "GEN2 240 Case - 1W-1.5H": "img/parts/240/Case 240-1W-15H.png",
  "GEN2 240 Case - 1W-1H": "img/parts/240/Case 240-1W-1H.png",
  "GEN2 240 Case - 1W-2H": "img/parts/240/Case 240-1W-2H.png",
  "GEN2 240 Case - 1W-3H": "img/parts/240/Case 240-1W-3H.png",
  "GEN2 240 Case - 2W-0.5H": "img/parts/240/Case 240-2W-05H.png",
  "GEN2 240 Case - 2W-1.5H": "img/parts/240/Case 240-2W-15H.png",
  "GEN2 240 Case - 2W-1H": "img/parts/240/Case 240-2W-1H.png",
  "GEN2 240 Case - 2W-2H": "img/parts/240/Case 240-2W-2H.png",
  "GEN2 240 Case - 2W-3H": "img/parts/240/Case 240-2W-3H.png",
  "GEN2 240 Case - 3W-0.5H": "img/parts/240/Case 240-3W-05H.png",
  "GEN2 240 Case - 3W-1.5H": "img/parts/240/Case 240-3W-15H.png",
  "GEN2 240 Case - 3W-1H": "img/parts/240/Case 240-3W-1H.png",
  "GEN2 240 Case - 3W-2H": "img/parts/240/Case 240-3W-2H.png",
  "GEN2 240 Case - 4W-0.5H": "img/parts/240/Case 240-4W-05H.png",
  "GEN2 240 Case - 4W-1.5H": "img/parts/240/Case 240-4W-15H.png",
  "GEN2 240 Case - 4W-1H": "img/parts/240/Case 240-4W-1H.png",
  "GEN2 240 Case - 4W-2H": "img/parts/240/Case 240-4W-2H.png",
  // 240 Case Extender renders (2026-07)
  "GEN2 240 Case Extender - 1W-1H": "img/parts/240/Case Extender 240-1W.png",
  "GEN2 240 Case Extender - 2W-1H": "img/parts/240/Case Extender 240-2W.png",
  "GEN2 240 Case Extender - 3W-1H": "img/parts/240/Case Extender 240-3W.png",
  "GEN2 240 Case Extender - 4W-1H": "img/parts/240/Case Extender 240-4W.png",
  // Cover renders (2026-07-10) — CL + CU, all six lengths × 1W/2W. Filenames
  // are the library part codes, so images and GLBs share names.
  "GEN2 59 Cover Lower (CL) - 1W": "img/parts/59/CL-59-1W.png",
  "GEN2 59 Cover Lower (CL) - 2W": "img/parts/59/CL-59-2W.png",
  "GEN2 59 Cover Upper (CU) - 1W": "img/parts/59/CU-59-1W.png",
  "GEN2 59 Cover Upper (CU) - 2W": "img/parts/59/CU-59-2W.png",
  "GEN2 115 Cover Lower (CL) - 1W": "img/parts/115/CL-115-1W.png",
  "GEN2 115 Cover Lower (CL) - 2W": "img/parts/115/CL-115-2W.png",
  "GEN2 115 Cover Upper (CU) - 1W": "img/parts/115/CU-115-1W.png",
  "GEN2 115 Cover Upper (CU) - 2W": "img/parts/115/CU-115-2W.png",
  "GEN2 165 Cover Lower (CL) - 1W": "img/parts/165/CL-165-1W.png",
  "GEN2 165 Cover Lower (CL) - 2W": "img/parts/165/CL-165-2W.png",
  "GEN2 165 Cover Upper (CU) - 1W": "img/parts/165/CU-165-1W.png",
  "GEN2 165 Cover Upper (CU) - 2W": "img/parts/165/CU-165-2W.png",
  "GEN2 185 Cover Lower (CL) - 1W": "img/parts/185/CL-185-1W.png",
  "GEN2 185 Cover Lower (CL) - 2W": "img/parts/185/CL-185-2W.png",
  "GEN2 185 Cover Upper (CU) - 1W": "img/parts/185/CU-185-1W.png",
  "GEN2 185 Cover Upper (CU) - 2W": "img/parts/185/CU-185-2W.png",
  "GEN2 240 Cover Lower (CL) - 1W": "img/parts/240/CL-240-1W.png",
  "GEN2 240 Cover Lower (CL) - 2W": "img/parts/240/CL-240-2W.png",
  "GEN2 240 Cover Upper (CU) - 1W": "img/parts/240/CU-240-1W.png",
  "GEN2 240 Cover Upper (CU) - 2W": "img/parts/240/CU-240-2W.png",
  "GEN2 270 Cover Lower (CL) - 1W": "img/parts/270/CL-270-1W.png",
  "GEN2 270 Cover Lower (CL) - 2W": "img/parts/270/CL-270-2W.png",
  "GEN2 270 Cover Upper (CU) - 1W": "img/parts/270/CU-270-1W.png",
  "GEN2 270 Cover Upper (CU) - 2W": "img/parts/270/CU-270-2W.png",
  // Foot Rail renders (2026-07-10) — FR-L + FR-U × 1W/2W, five lengths (the 59
  // has no foot rails at all — hanging-only collection).
  "GEN2 115 Foot Rail Lower (FR-L) - 1W": "img/parts/115/FR-L_115-1W.png",
  "GEN2 115 Foot Rail Lower (FR-L) - 2W": "img/parts/115/FR-L_115-2W.png",
  "GEN2 115 Foot Rail Upper (FR-U) - 1W": "img/parts/115/FR-U_115-1W.png",
  "GEN2 115 Foot Rail Upper (FR-U) - 2W": "img/parts/115/FR-U_115-2W.png",
  "GEN2 165 Foot Rail Lower (FR-L) - 1W": "img/parts/165/FR-L_165-1W.png",
  "GEN2 165 Foot Rail Lower (FR-L) - 2W": "img/parts/165/FR-L_165-2W.png",
  "GEN2 165 Foot Rail Upper (FR-U) - 1W": "img/parts/165/FR-U_165-1W.png",
  "GEN2 165 Foot Rail Upper (FR-U) - 2W": "img/parts/165/FR-U_165-2W.png",
  "GEN2 185 Foot Rail Lower (FR-L) - 1W": "img/parts/185/FR-L_185-1W.png",
  "GEN2 185 Foot Rail Lower (FR-L) - 2W": "img/parts/185/FR-L_185-2W.png",
  "GEN2 185 Foot Rail Upper (FR-U) - 1W": "img/parts/185/FR-U_185-1W.png",
  "GEN2 185 Foot Rail Upper (FR-U) - 2W": "img/parts/185/FR-U_185-2W.png",
  "GEN2 240 Foot Rail Lower (FR-L) - 1W": "img/parts/240/FR-L_240-1W.png",
  "GEN2 240 Foot Rail Lower (FR-L) - 2W": "img/parts/240/FR-L_240-2W.png",
  "GEN2 240 Foot Rail Upper (FR-U) - 1W": "img/parts/240/FR-U_240-1W.png",
  "GEN2 240 Foot Rail Upper (FR-U) - 2W": "img/parts/240/FR-U_240-2W.png",
  "GEN2 270 Foot Rail Lower (FR-L) - 1W": "img/parts/270/FR-L_270-1W.png",
  "GEN2 270 Foot Rail Lower (FR-L) - 2W": "img/parts/270/FR-L_270-2W.png",
  "GEN2 270 Foot Rail Upper (FR-U) - 1W": "img/parts/270/FR-U_270-1W.png",
  "GEN2 270 Foot Rail Upper (FR-U) - 2W": "img/parts/270/FR-U_270-2W.png",
};

/* Thumbnail path for a part. Render files mirror the part name with "GEN2 " →
   "GEN2_", every "." dropped (we avoid dots mid-filename, so 0.5H → 05H and
   1.5H → 15H), and a resolution suffix — e.g. "GEN2 240-3W-0.5H Classic Drawer"
   → img/parts/GEN2_240-3W-05H Classic Drawer_256p.png. Off-pattern or shared art
   goes in IMAGE_OVERRIDES above; anything missing falls back to placeholder.svg. */
const RENDER_SUFFIX = "_256p";
function partImage(name, variant) {
  if (IMAGE_OVERRIDES[name]) return IMAGE_OVERRIDES[name];
  // Wall Mount Lite rows share one name per length with a "<w>W section"
  // variant — the render set (2026-07-11 batch) is per WIDTH, universal
  // across lengths, so the variant picks the file.
  if (variant && /^GEN2 Wall Mount Kit - Lite/.test(name)) {
    const w = variant.match(/^(\d)W/);
    if (w) return "img/parts/WallMount_Lite_" + w[1] + "W.png";
  }
  // Decor faceplates are SHARED hardware — one render set serves every length,
  // so their files can't carry a length. EdgeLabel (2026-07-08 batch) and
  // Classic Pro (2026-07-13 batch) have per-size renders — <Family>_<size>.png,
  // dots dropped like everywhere else; Essential shows its hero card art until
  // a per-size batch exists.
  // Under-table rails: per-length + per-width renders (2026-07-19 batch) live
  // in img/parts/<len>/Rails <len>-<w>W.png — the BOM row's "<w>W section"
  // variant picks the file, same pattern as Wall Mount Lite above. All six
  // lengths have a render batch (2026-07-19).
  if (variant && /^GEN2 Rails - \d+$/.test(name)) {
    const rl = name.match(/(\d+)$/)[1];
    const rw = variant.match(/^(\d)W/);
    if (rw && ["59", "115", "165", "185", "240", "270"].includes(rl))
      return "img/parts/" + rl + "/Rails " + rl + "-" + rw[1] + "W.png";
  }
  const fp = name.match(/^GEN2 (Essential|EdgeLabel|Classic Pro) Decor Faceplate - (.+)$/);
  if (fp) {
    if (fp[1] === "EdgeLabel") return "img/parts/EdgeLabel_" + fp[2].replace(/\./g, "") + ".png";
    if (fp[1] === "Classic Pro") return "img/parts/ClassicPro_" + fp[2].replace(/\./g, "") + ".png";
    return "img/parts/Faceplate-" + fp[1].replace(" ", "") + ".jpg";
  }
  // universal faceplate back covers: per-size renders (2026-07-13 batch),
  // shared by every faceplate family — same dots-dropped size token
  const bc = name.match(/^GEN2 Decor Faceplate Back Cover - (.+)$/);
  if (bc) return "img/parts/BackCover_" + bc[1].replace(/\./g, "") + ".png";
  const file = name.replace(/^GEN2 /, "GEN2_").replace(/\./g, "") + RENDER_SUFFIX + ".png";
  return "img/parts/" + file;
}

/* Human-readable size token, e.g. (2, 0.5) -> "2W-0.5H" */
function sizeToken(w, h) {
  return `${w}W-${h}H`;
}
