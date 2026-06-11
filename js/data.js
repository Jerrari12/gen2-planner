/* =========================================================================
   GEN2 Planner — system catalog & BOM rules
   =========================================================================
   This file is the single source of truth for everything the planner knows
   about the GEN2 QuickLock Modular System. To correct a quantity rule, add
   a size, or point a part at its exact download page, edit this file only —
   no other code changes needed.

   Link resolution for any part works in two steps:
     1. If an exact URL exists in LINK_OVERRIDES (keyed by part name), use it.
     2. Otherwise fall back to a Printables search for the exact part name.
   ========================================================================= */

const GEN2 = {

  // Physical size of one grid unit (used for the dimension readout)
  units: {
    widthMM: 88,   // 1W
    heightMM: 56,  // 1H
  },

  // Drawer footprints offered in the palette (width units × height units).
  // Trim or extend these arrays to match the published size lineup.
  drawerWidths: [1, 2, 3, 4],
  drawerHeights: [0.5, 1, 1.5, 2, 2.5, 3],

  // Drawer styles
  styles: [
    {
      id: "classic",
      label: "Classic",
      blurb: "Print-in-place handle. No assembly, no extra parts.",
    },
    {
      id: "decor",
      label: "Decor",
      blurb: "Swappable faceplate + handle/knob. Clips are included in the drawer download (v2602).",
    },
  ],

  // Install locations
  mounts: [
    {
      id: "under-table",
      label: "Under-Table",
      blurb: "GEN2 Rails screw to the underside of any surface. Drawers slide in and QuickLock in place.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/instructions-hanging",
    },
    {
      id: "tabletop",
      label: "Tabletop",
      blurb: "Table Top Kit V2 — covers and foot rails create a rigid standalone unit on any surface.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/table-top-kit",
    },
    {
      id: "wall",
      label: "Wall Mount",
      blurb: "Wall Mount Kit – Lite attaches GEN2 units directly to the wall with wood screws.",
      instructions: "https://www.jerrari3d.com/gen2-modular-system/instructions/wall-mount",
    },
  ],

  // Drawer lengths (depth in mm). `page` is the collection page on jerrari3d.com.
  lengths: [
    { id: 59,  label: "59",  tagline: "Ultra-shallow — wall storage specialist",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 115, label: "115", tagline: "Medium — fits the majority of printer beds",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 165, label: "165", tagline: "Mini Edition — for 180mm beds (A1 Mini, Prusa Mini)",
      page: "https://www.jerrari3d.com/gen2-modular-system/mini" },
    { id: 185, label: "185", tagline: "The GEN2 Standard — best all-around, start here",
      page: "https://www.jerrari3d.com/gen2-modular-system/standard", recommended: true },
    { id: 240, label: "240", tagline: "Deep storage for extended build plates (X1C, Core One)",
      page: "https://www.jerrari3d.com/gen2-modular-system" },
    { id: 270, label: "270", tagline: "Large — the deepest drawer in the lineup",
      page: "https://www.jerrari3d.com/gen2-modular-system/large" },
  ],

  /* -----------------------------------------------------------------------
     BOM rules per mount type.
     Quantity formulas receive a `layout` summary object:
       layout.widthUnits      — occupied width of the layout (in 1W units)
       layout.topRowWidth     — width units occupied on the top row
       layout.bottomRowWidth  — width units occupied on the bottom row
       layout.drawerCount     — number of drawers placed
     Adjust `qty` formulas here when verifying against real installs.
     ----------------------------------------------------------------------- */
  mountBom: {
    "under-table": [
      {
        name: (len) => `GEN2 Rails - ${len}`,
        qty: (l) => l.topRowWidth,
        note: "1 rail set per 1W of the top row. Rows below hang from the cases above via QuickLock.",
      },
      {
        name: () => "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)",
        qty: (l) => l.topRowWidth * 4,
        note: "Hardware store item — approx. 4 per rail set.",
        hardware: true,
      },
    ],
    "tabletop": [
      {
        name: (len) => `GEN2 Table Top Kit V2 - ${len}`,
        qty: (l) => l.widthUnits,
        note: "1 kit (cover + foot rail L/R + feet) per 1W of the structure.",
      },
    ],
    "wall": [
      {
        name: (len) => `GEN2 Wall Mount Kit - Lite - ${len}`,
        qty: (l) => l.topRowWidth,
        note: "1 kit per 1W of the top row. Lower rows QuickLock onto the cases above.",
      },
      {
        name: () => "Countersunk wood screws (#6/#8 up to 1/2\", or 3.5×16mm)",
        qty: (l) => l.topRowWidth * 2,
        note: "Hardware store item — use anchors appropriate for your wall type.",
        hardware: true,
      },
    ],
  },

  // Optional extras offered for Decor setups
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
};

/* ---------------------------------------------------------------------------
   Exact download links, keyed by the generated part name.
   Anything not listed here falls back to a Printables search for the name.
   Add entries as listings are published — names must match exactly.
   --------------------------------------------------------------------------- */
const LINK_OVERRIDES = {
  // Mount kits
  "GEN2 Rails - 185":                 "https://www.printables.com/model/1052357-gen2-rails-185-standard",
  "GEN2 Table Top Kit V2 - 115":      "https://www.printables.com/model/1146353-gen2-table-top-kit-v2-115-medium",
  "GEN2 Table Top Kit V2 - 185":      "https://www.printables.com/model/1118906-gen2-table-top-kit-v2-185-standard",
  "GEN2 Table Top Kit V2 - 270":      "https://www.printables.com/model/1163955-gen2-table-top-kit-v2-large",
  "GEN2 Wall Mount Kit - Lite - 59":  "https://www.printables.com/model/1513322-gen2-wall-mount-kit-lite-59",
  "GEN2 Wall Mount Kit - Lite - 165": "https://www.printables.com/model/1605963-gen2-wall-mount-kit-lite-165",

  // Starter kits (shown as a tip when the layout is small)
  "GEN2 Under Table Starter Kit - 185": "https://www.printables.com/model/231288-gen2-under-table-starter-kit-185",
  "GEN2 Under Table Starter Kit - 270": "https://www.printables.com/model/312837-gen2-under-table-starter-kit-270",

  // Drawer collections (whole-collection downloads)
  "GEN2 59 Classic Drawers":  "https://www.printables.com/model/234780-gen2-59-classic-drawers-all",
  "GEN2 59 Decor Drawers":    "https://www.printables.com/model/1070454-gen2-59-decor-drawers-all",

  // Individual drawer SKUs with confirmed listings
  "GEN2 185-1W-3H Classic Drawer": "https://www.printables.com/model/262035-gen2-185-1w-3h-classic-drawer",
  "GEN2 185-2W-1H Decor Drawer":   "https://www.printables.com/model/964551-gen2-185-2w-1h-decor-drawer",
  "GEN2 185-4W-0.5H Decor Drawer": "https://www.printables.com/model/1413275-gen2-185-4w-05h-decor-drawer",
  "GEN2 240-2W-2H Decor Drawer":   "https://www.printables.com/model/1365853-gen2-240-2w-2h-decor-drawer",
  "GEN2 240-2W-0.5H Classic Drawer": "https://www.printables.com/model/1324543-gen2-240-2w-05h-classic-drawer",
};

/* Fallback: a Printables search scoped to the exact part name. */
function partLink(name) {
  if (LINK_OVERRIDES[name]) return LINK_OVERRIDES[name];
  return "https://www.printables.com/search/models?q=" + encodeURIComponent(name);
}

/* Human-readable size token, e.g. (2, 0.5) -> "2W-0.5H" */
function sizeToken(w, h) {
  return `${w}W-${h}H`;
}
