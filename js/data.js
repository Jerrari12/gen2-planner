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

  // Classic drawers have a print-in-place handle that overhangs the front:
  // their print footprint is this much longer than the case. (To confirm.)
  classicHandleExtraMM: 20,

  // Footprints offered in the palette (width units × height units)
  drawerWidths: [1, 2, 3, 4],
  drawerHeights: [0.5, 1, 1.5, 2, 3],

  // Size combos that don't exist in the GEN2 lineup
  unavailableSizes: ["3W-3H", "4W-3H"],

  // What a case can be filled with
  fills: [
    {
      id: "classic",
      label: "Classic Drawer",
      blurb: "Print-in-place handle. No assembly, no extra parts.",
    },
    {
      id: "decor",
      label: "Decor Drawer",
      blurb: "Swappable faceplate + handle/knob. Clips included in the drawer download (v2602).",
    },
    {
      id: "shelf",
      label: "Shelf",
      blurb: "Open shelf — case + shelf insert.",
      soon: true,
    },
    {
      id: "cabinet",
      label: "Cabinet",
      blurb: "Shelf with a door — case (+ extenders), shelf insert, hinges, latches, door.",
      soon: true,
      integerHeightsOnly: true,
      minHeight: 1,
    },
  ],

  // Appearance styles for Decor faceplates and (future) cabinet doors
  faceplateStyles: [
    { id: "essential",  label: "Essential" },
    { id: "edgelabel",  label: "EdgeLabel" },
    { id: "classicpro", label: "Classic Pro" },
  ],
  doorStyles: [
    { id: "essential",  label: "Essential" },
    { id: "edgelabel",  label: "EdgeLabel" },
    { id: "classicpro", label: "Classic Pro" },
  ],

  // Printer presets — usable bed size in mm (X × Y).
  // A part fits if its footprint fits the bed in either orientation.
  printers: [
    { id: "any",       label: "Any printer / not sure", x: null, y: null },
    { id: "a1mini",    label: "Bambu Lab A1 Mini",      x: 180, y: 180 },
    { id: "a1",        label: "Bambu Lab A1",           x: 256, y: 256 },
    { id: "p1s",       label: "Bambu Lab P1P / P1S",    x: 256, y: 256 },
    { id: "x1c",       label: "Bambu Lab X1C",          x: 256, y: 256 },
    { id: "h2d",       label: "Bambu Lab H2D",          x: 350, y: 320 },
    { id: "prusamini", label: "Prusa MINI+",            x: 180, y: 180 },
    { id: "mk4s",      label: "Prusa MK4S",             x: 250, y: 210 },
    { id: "coreone",   label: "Prusa Core One",         x: 250, y: 220 },
    { id: "xl",        label: "Prusa XL",               x: 360, y: 360 },
    { id: "ender3v3",  label: "Creality Ender-3 V3",    x: 220, y: 220 },
    { id: "k1max",     label: "Creality K1 Max",        x: 300, y: 300 },
    { id: "custom",    label: "Custom…",                x: null, y: null },
  ],

  // Install locations. `askSpace` adds "available width/height in mm" inputs
  // that cap the layout grid (88mm per 1W, 56mm per 1H).
  mounts: [
    {
      id: "under-table",
      label: "Under-Table",
      blurb: "GEN2 Rails screw to the underside of any surface. Drawers slide in and QuickLock in place.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/instructions-hanging",
      askSpace: true,
      spaceHint: "Measure the flat area on the underside of your table.",
    },
    {
      id: "tabletop",
      label: "Tabletop",
      blurb: "Table Top Kit V2 — covers and foot rails create a rigid standalone unit on any surface.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/table-top-kit",
      askSpace: false,
    },
    {
      id: "wall",
      label: "Wall Mount",
      blurb: "Wall Mount Kit – Lite attaches GEN2 units directly to the wall with wood screws.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/wall-mount",
      askSpace: true,
      spaceHint: "Measure the wall area you want to fill.",
    },
  ],

  // Drawer lengths (depth in mm). `color` matches the official lineup art.
  lengths: [
    { id: 59,  label: "59",  color: "#f2f2f2", tagline: "Ultra-shallow — wall storage specialist",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 115, label: "115", color: "#9ea3a8", tagline: "Medium — fits the majority of printer beds",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 165, label: "165", color: "#3aa0e8", tagline: "Mini Edition — for 180mm beds (A1 Mini, Prusa Mini)",
      page: "https://www.jerrari3d.com/gen2-modular-system/mini" },
    { id: 185, label: "185", color: "#ff8a40", tagline: "The GEN2 Standard — best all-around, start here",
      page: "https://www.jerrari3d.com/gen2-modular-system/standard", recommended: true },
    { id: 240, label: "240", color: "#3ecfa0", tagline: "Deep storage for extended build plates (X1C, Core One)",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 270, label: "270", color: "#e8453c", tagline: "Large — the deepest drawer in the lineup",
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
          note: "All rail widths are in the same download — print the section sizes listed.",
        });
      });
      items.push({
        name: "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)",
        qty: ctx.railScrews,
        note: "Hardware store item — minimum 4 / 6 / 8 / 10 screws per 1W / 2W / 3W / 4W rail section.",
        hardware: true,
      });
      return items;
    },
    "tabletop": (ctx) => [
      {
        name: `GEN2 Table Top Kit V2 - ${ctx.len}`,
        qty: ctx.cols,
        note: "1 kit (cover + foot rail L/R + feet) per 1W of the structure.",
      },
    ],
    "wall": (ctx) => {
      const items = [];
      Object.entries(ctx.wallMix).sort((a, b) => b[0] - a[0]).forEach(([w, count]) => {
        items.push({
          name: `GEN2 Wall Mount Kit - Lite - ${ctx.len}`,
          variant: `${w}W section`,
          qty: count,
          note: "All widths are in the same download — sections install side by side to expand the area.",
        });
      });
      items.push({
        name: "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)",
        qty: ctx.cols * GEN2.wallMount.screwsPer1W,
        note: "Hardware store item — 2 screws per 1W. Use anchors appropriate for your wall type.",
        hardware: true,
      });
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
      name: () => "Handle or knob (any GEN2-compatible design)",
      qtyPerDrawer: 1,
      note: "Pick any style — handles and knobs are swappable.",
    },
    {
      name: () => "Magnets 10×2mm or 6×2mm (optional soft-close)",
      qtyPerDrawer: 2,
      note: "Optional — only for soft-close configurations.",
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
   Exact download links, keyed by the generated part name.
   Values: { p: printablesURL, t: thangsURL } — either may be omitted.
   Anything not listed falls back to a search on each platform.
   --------------------------------------------------------------------------- */
const LINK_OVERRIDES = {
  // Mount kits
  "GEN2 Rails - 185": {
    p: "https://www.printables.com/model/1052357-gen2-rails-185-standard",
  },
  "GEN2 Table Top Kit V2 - 115": {
    p: "https://www.printables.com/model/1146353-gen2-table-top-kit-v2-115-medium",
  },
  "GEN2 Table Top Kit V2 - 185": {
    p: "https://www.printables.com/model/1118906-gen2-table-top-kit-v2-185-standard",
    t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20STANDARD-1231757",
  },
  "GEN2 Table Top Kit V2 - 270": {
    p: "https://www.printables.com/model/1163955-gen2-table-top-kit-v2-large",
  },
  "GEN2 Wall Mount Kit - Lite - 59": {
    p: "https://www.printables.com/model/1513322-gen2-wall-mount-kit-lite-59",
  },
  "GEN2 Wall Mount Kit - Lite - 165": {
    p: "https://www.printables.com/model/1605963-gen2-wall-mount-kit-lite-165",
  },

  // Universal hardware (QuickLocks etc.)
  "GEN2 Hardware": {
    p: "https://www.printables.com/model/1012796-gen2-hardware",
  },

  // Starter kits (shown as a tip)
  "GEN2 Under Table Starter Kit - 185": {
    p: "https://www.printables.com/model/231288-gen2-under-table-starter-kit-185",
  },
  "GEN2 Under Table Starter Kit - 270": {
    p: "https://www.printables.com/model/312837-gen2-under-table-starter-kit-270",
  },

  // Individual drawer SKUs with confirmed listings
  "GEN2 185-1W-3H Classic Drawer": {
    p: "https://www.printables.com/model/262035-gen2-185-1w-3h-classic-drawer",
  },
  "GEN2 185-2W-1H Decor Drawer": {
    p: "https://www.printables.com/model/964551-gen2-185-2w-1h-decor-drawer",
  },
  "GEN2 185-1W-1H Decor Drawer": {
    t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185-1W-1H%20Decor%20Drawer-1116945",
  },
  "GEN2 185-4W-0.5H Decor Drawer": {
    p: "https://www.printables.com/model/1413275-gen2-185-4w-05h-decor-drawer",
  },
  "GEN2 240-2W-2H Decor Drawer": {
    p: "https://www.printables.com/model/1365853-gen2-240-2w-2h-decor-drawer",
  },
  "GEN2 240-2W-0.5H Classic Drawer": {
    p: "https://www.printables.com/model/1324543-gen2-240-2w-05h-classic-drawer",
  },
};

/* Resolve links for a part name: exact overrides, else platform searches. */
function partLinks(name) {
  const o = LINK_OVERRIDES[name] || {};
  const q = encodeURIComponent(name);
  return {
    printables: o.p || "https://www.printables.com/search/models?q=" + q,
    thangs: o.t || "https://thangs.com/search/" + q,
    exactP: !!o.p,
    exactT: !!o.t,
  };
}

/* Parts that share one render, or whose file doesn't follow the naming rule.
   Exact part name → path. Checked before the automatic slug below.
   NOTE: filenames are case-sensitive once hosted (GitHub Pages), even though
   Windows doesn't care locally. */
const IMAGE_OVERRIDES = {
  "GEN2 QuickLock - Left": "img/parts/Quicklock.png",
  "GEN2 QuickLock - Right": "img/parts/Quicklock.png",
};

/* Thumbnail path for a part: the part name lowercased with non-alphanumerics
   collapsed to "-", e.g. "GEN2 185-2W-1H Decor Drawer" →
   img/parts/gen2-185-2w-1h-decor-drawer.png
   Missing files fall back to img/parts/placeholder.svg automatically. */
function partImage(name) {
  if (IMAGE_OVERRIDES[name]) return IMAGE_OVERRIDES[name];
  const slug = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return "img/parts/" + slug + ".png";
}

/* Human-readable size token, e.g. (2, 0.5) -> "2W-0.5H" */
function sizeToken(w, h) {
  return `${w}W-${h}H`;
}
