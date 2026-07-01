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

  // What a case can be filled with
  fills: [
    {
      id: "classic",
      label: "Classic Drawer",
      blurb: "Print-in-place handle. No assembly, no extra parts.",
      previewImg: "img/parts/GEN2_185-1W-1H Classic Drawer_256p.png",
    },
    {
      id: "decor",
      label: "Decor Drawer",
      blurb: "Swappable faceplate + handle/knob. Clips included in the drawer download (v2602).",
      previewImg: "img/parts/185-1W-1H Decor Drawer.png",
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
      blurb: "The free core faceplate — a clean, complete drawer front. No labels or accents, just the standard GEN2 look." },
    { id: "edgelabel",  label: "EdgeLabel",   integratedHandle: true, club: true, sub: "Swappable labels + accents", labelGen: "https://edgelabel.jerrari3d.com/",
      img: "img/parts/Faceplate-EdgeLabel.jpg",
      blurb: "Swappable labels and accents with the signature edge-label look — restyle and relabel any drawer in seconds. Built-in handle. Included with the GEN2 Club." },
    { id: "classicpro", label: "Classic Pro", integratedHandle: true, club: true, sub: "Swappable labels + accents", labelGen: "https://classic.jerrari3d.com/",
      img: "img/parts/Faceplate-ClassicPro.jpg",
      blurb: "Swappable labels and accents with a classic, premium finish — restyle and relabel any drawer in seconds. Built-in handle. Included with the GEN2 Club." },
  ],
  doorStyles: [
    { id: "essential",  label: "Essential" },
    { id: "edgelabel",  label: "EdgeLabel" },
    { id: "classicpro", label: "Classic Pro" },
  ],
  // Handle series for Decor drawers whose faceplate has no built-in handle.
  handleStyles: [
    { id: "blockbar", label: "BlockBar" },
    { id: "deco",     label: "Deco" },
    { id: "crystal",  label: "Crystal" },
  ],

  // Printer presets — usable bed size in mm (X × Y).
  // A part fits if its footprint fits the bed in either orientation.
  printers: [
    { id: "any",        label: "Any printer / not sure", x: null, y: null },
    { id: "coreone",    label: "Prusa Core One",         x: 250, y: 220 },
    { id: "coreonel",   label: "Prusa Core One L",       x: 300, y: 300 },
    { id: "mk4",        label: "Prusa MK4 / MK3.9",      x: 250, y: 210 },
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
      blurb: "Table Top Kit V2 · covers and foot rails create a rigid standalone unit on any surface.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/table-top-kit",
      askSpace: false,
      planTip: "Tabletop: this builds a free-standing unit, so size is entirely up to you. The Table Top Kit V2 adds the covers and foot rails that make it rigid.",
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
      const cov = buildCoverItems(ctx.len, ctx.runs, kit);
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
        mixLines(fru, P.footRailUpper, ctx.len, { linkAs: kit, note: "From the Table Top Kit V2 download." })
          .forEach((i) => items.push(i));
        mixLines(frl, P.footRailLower, ctx.len, { linkAs: kit, note: "From the Table Top Kit V2 download. Needed when the bottom row is more than one case." })
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
      // Wall builds cap the top with the same covers as the Table Top Kit (they
      // close the exposed top and carry the top-row drawer-stopper slots). No
      // foot rails or feet — a wall build hangs off the ground.
      // Staggered = one connected top (tile the whole run). Per-column = each
      // top case gets its own cover (1W/2W = a single piece; 3W/4W still tile
      // internally to reach the width), so columns lift off independently.
      const kit = `GEN2 Table Top Kit V2 - ${ctx.len}`;
      const coverUnits = ctx.wallStagger ? ctx.runs : ctx.topCases.map((w) => ({ width: w }));
      const cov = buildCoverItems(ctx.len, coverUnits, kit);
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

  // Optional extras for Decor drawers
  decorExtras: [
    {
      id: "handle",
      name: () => "Handle or knob (any GEN2-compatible design)",
      qtyPerDrawer: 1,
      note: "Pick any style · handles and knobs are swappable.",
    },
    {
      name: () => "Magnets 10×2mm or 6×2mm (optional soft-close)",
      qtyPerDrawer: 2,
      note: "Optional · only for soft-close configurations.",
      hardware: true,
      optional: true,
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
    faceplate:   (len, size, style)     => `GEN2 ${len} ${style} Decor Faceplate - ${size}`,
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
  unreleased: ["shelfInsert", "door", "hinge", "latch", "sideCover"],
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
function buildCoverItems(len, runs, kit) {
  const P = GEN2.partNames;
  const cu = {}, cl = {};
  let screws = 0;
  runs.forEach((run) => {
    const t = brickTiling(run.width);
    addMix(cu, t.upper);
    addMix(cl, t.lower);
    screws += run.width;
  });
  const items = [];
  mixLines(cu, P.coverUpper, len, { linkAs: kit, note: "From the GEN2 Table Top Kit V2 download." })
    .forEach((i) => items.push(i));
  mixLines(cl, P.coverLower, len, { linkAs: kit, note: "From the Table Top Kit V2 download. Optional on 1W/2W-only builds, but needed for drawer stoppers and rigidity." })
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
  // ---- Under-table rails (verified Thangs; Printables only where published) ----
  "GEN2 Rails - 59":  { t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20SMALL-1165763" },
  "GEN2 Rails - 115": { t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20MEDIUM-1165720" },
  "GEN2 Rails - 165": { t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20165-1165793" },
  "GEN2 Rails - 185": { p: "https://www.printables.com/model/1052357-gen2-rails-185-standard", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20STANDARD-1163830" },
  "GEN2 Rails - 240": { t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20240%20Lite-1360077" },
  "GEN2 Rails - 270": { t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20LARGE-1165816" },

  // ---- Cases — one "{len} Cases - All" collection page per length ----
  "GEN2 59 Cases - All":  { p: "https://www.printables.com/model/1658749-gen2-59-cases-all" },
  "GEN2 115 Cases - All": { p: "https://www.printables.com/model/1658744-gen2-115-cases-all" },
  "GEN2 165 Cases - All": { p: "https://www.printables.com/model/1658722-gen2-165-cases-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Cases%20-%20All-1535457" },
  "GEN2 185 Cases - All": { p: "https://www.printables.com/model/1658700-gen2-185-cases-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Cases%20-%20All-1535455" },
  "GEN2 240 Cases - All": { p: "https://www.printables.com/model/1658608-gen2-240-cases-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20240%20Cases%20-%20All-1535459" },
  "GEN2 270 Cases - All": { p: "https://www.printables.com/model/1658688-gen2-270-cases-all" },

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
  "GEN2 240 Classic Drawers - All": { p: "https://www.printables.com/model/1324538-gen2-240-classic-drawers-all" },
  "GEN2 270 Classic Drawers - All": { p: "https://www.printables.com/model/1164306-gen2-270-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Drawers%20-%20Large-1093398" },

  // ---- Decor drawers — per-length "…Decor Drawers - All" collection ----
  "GEN2 59 Decor Drawers - All":  { p: "https://www.printables.com/model/1070454-gen2-59-decor-drawers-all" },
  "GEN2 115 Decor Drawers - All": { p: "https://www.printables.com/model/1307794-gen2-115-decor-drawers-all" },
  "GEN2 165 Decor Drawers - All": { p: "https://www.printables.com/model/1100978-gen2-165-decor-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Decor%20Drawers%20-%20All-1493950" },
  "GEN2 185 Decor Drawers - All": { t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Decor%20Drawers%20-%20All-1116945" },
  "GEN2 240 Decor Drawers - All": { p: "https://www.printables.com/model/1322479-gen2-240-decor-drawers-all" },
  "GEN2 270 Decor Drawers - All": { p: "https://www.printables.com/model/1062961-gen2-270-decor-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20270%20Decor%20Drawers%20-%20All-1171387" },

  // ---- Table Top Kit V2 (covers / foot rails / feet funnel here via linkAs) ----
  "GEN2 Table Top Kit V2 - 115": { p: "https://www.printables.com/model/1146353-gen2-table-top-kit-v2-115-medium", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20115-1245167" },
  "GEN2 Table Top Kit V2 - 165": { p: "https://www.printables.com/model/1124278-gen2-table-top-kit-v2-165-mini", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20165-1233752" },
  "GEN2 Table Top Kit V2 - 185": { p: "https://www.printables.com/model/1118906-gen2-table-top-kit-v2-185-standard", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20185-1231757" },
  "GEN2 Table Top Kit V2 - 240": { p: "https://www.printables.com/model/1324501-gen2-table-top-kit-v2-240", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20240-1360073" },
  "GEN2 Table Top Kit V2 - 270": { p: "https://www.printables.com/model/1163955-gen2-table-top-kit-v2-270-large", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20270-1253780" },

  // ---- Wall Mount Kit – Lite ----
  "GEN2 Wall Mount Kit - Lite - 59":  { p: "https://www.printables.com/model/1513322-gen2-wall-mount-kit-lite-59" },
  "GEN2 Wall Mount Kit - Lite - 115": { p: "https://www.printables.com/model/1537169-gen2-wall-mount-kit-lite-115" },
  "GEN2 Wall Mount Kit - Lite - 165": { p: "https://www.printables.com/model/1605963-gen2-wall-mount-kit-lite-165" },

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

/* Size-varying parts (cases, drawers, extenders, faceplates) all point at one
   shared "collection" model page. Map a generated part name to that collection
   key — the key itself lives in LINK_OVERRIDES above. Extender before Case so
   "Case Extender - " never matches the plain "Case - " rule. */
const COLLECTION_RULES = [
  [/^GEN2 (\d+) Case Extender - /,      (m) => `GEN2 ${m[1]} Case Extenders`],
  [/^GEN2 (\d+) Case - /,               (m) => `GEN2 ${m[1]} Cases - All`],
  [/^GEN2 (\d+)-.+ Classic Drawer$/,    (m) => `GEN2 ${m[1]} Classic Drawers - All`],
  [/^GEN2 (\d+)-.+ Decor Drawer$/,      (m) => `GEN2 ${m[1]} Decor Drawers - All`],
  [/^GEN2 \d+ (.+) Decor Faceplate - /, (m) => `GEN2 Decor - Faceplates - ${m[1]} Series`],
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
  "GEN2 QuickLock - Right": "img/parts/QuickLock.png",
  "GEN2 185-1W-1H Decor Drawer": "img/parts/185-1W-1H Decor Drawer.png",
};

/* Thumbnail path for a part. Render files mirror the part name with "GEN2 " →
   "GEN2_", every "." dropped (we avoid dots mid-filename, so 0.5H → 05H and
   1.5H → 15H), and a resolution suffix — e.g. "GEN2 185-2W-0.5H Classic Drawer"
   → img/parts/GEN2_185-2W-05H Classic Drawer_256p.png. Off-pattern or shared art
   goes in IMAGE_OVERRIDES above; anything missing falls back to placeholder.svg. */
const RENDER_SUFFIX = "_256p";
function partImage(name) {
  if (IMAGE_OVERRIDES[name]) return IMAGE_OVERRIDES[name];
  const file = name.replace(/^GEN2 /, "GEN2_").replace(/\./g, "") + RENDER_SUFFIX + ".png";
  return "img/parts/" + file;
}

/* Human-readable size token, e.g. (2, 0.5) -> "2W-0.5H" */
function sizeToken(w, h) {
  return `${w}W-${h}H`;
}
