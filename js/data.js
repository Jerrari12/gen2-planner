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

/* REQUIREMENT SCOPE - the classification contract is NOT defined here.
   It lives in js/requirement-scope.js, loaded as a classic script BEFORE this
   file, and is vendored byte-for-byte into the viewer. One author for the
   policy; both apps still compute their own facts and pass them in.
   ⚠ If GEN2_REQ is missing, the script tag ordering in index.html broke -
   fail loudly rather than silently emitting unclassified rows. */
if (typeof GEN2_REQ === 'undefined') {
  throw new Error('requirement-scope.js must load before data.js (see index.html script order)');
}
const REQ = GEN2_REQ;
const core = REQ.core, option = REQ.option, enhancement = REQ.enhancement;
const basis = REQ.basis, resolveReasons = REQ.resolveReasons;

const GEN2 = {

  /* The shared classification contract, re-exposed on GEN2 so every BOM builder
     reaches it the same way (app.js builds rows too, not just this file).
     ⚠ This is a REFERENCE to the vendored module, never a reimplementation. */
  req: REQ,
  bomSchemaVersion: REQ.CONTRACT_VERSION,

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
  // maxClassicH caps only the CLASSIC drawer fill. It held 115/240/270 at 2H
  // while their Classic Drawer catalogs stopped there; those six 3H sizes were
  // modeled 2026-08-02, so all six lengths now ship the full 18 and only the 59
  // still needs an entry. sizeExists reads maxClassicH defensively, so the
  // option stays available for the next partial catalog — but it must be set
  // in step with the viewer generator's COLL[L].classicMaxHH: capping one side
  // only either offers a size the 3D guide can't build, or hides one it can.
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
    // The free Classic series. `integratedHandle` is the whole story: the grip
    // prints as part of the plate, so computeBom skips BOTH bolt-on rows (the
    // handle and the M3 screws that fasten it) and the card shows no wrench —
    // the only style you can finish straight off the printer.
    // NOT `classicpro` below — that's the club style with labels.
    { id: "classic",    label: "Classic",     integratedHandle: true, sub: "Free · no hardware needed",
      img: "img/parts/Faceplate-Classic.jpg",
      blurb: "The free Classic series · the grip prints as part of the plate, so there's no handle to bolt on and nothing to buy. No labels or accents. Optional back cover." },
    { id: "edgelabel",  label: "EdgeLabel",   integratedHandle: true, club: true, sub: "Swappable labels + accents", labelGen: "https://edgelabel.jerrari3d.com/",
      img: "img/parts/Faceplate-EdgeLabel.jpg",
      blurb: "Swappable labels and accents with the signature edge-label look · restyle and relabel any drawer in seconds. Built-in handle. Included with the GEN2 Club." },
    { id: "classicpro", label: "Classic Pro", integratedHandle: true, club: true, sub: "Swappable labels + accents", labelGen: "https://classic.jerrari3d.com/",
      img: "img/parts/Faceplate-ClassicPro.jpg",
      blurb: "Swappable labels and accents with a classic, premium finish · restyle and relabel any drawer in seconds. Built-in handle. Included with the GEN2 Club." },
    // The PREMIUM Chevron series (2026-08-08, Joey's call). club + NO
    // integratedHandle — the first family wearing BOTH markers: the ✦ spark
    // (club) and the wrench (bolt-on handle → computeBom keeps the handle +
    // M3 screw rows). No labelGen key — its absence is what hides the
    // label-generator pill.
    { id: "chevron",    label: "Chevron",     club: true, sub: "Continuous pattern · multicolor",
      img: "img/parts/Faceplate-Chevron.jpg",
      blurb: "The 45 degree chevron runs continuously across drawers · side by side and stacked, the pattern never breaks. Every face strip can take its own filament color in the slicer. Bolt-on handle. Included with the GEN2 Club." },
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
  // ⚠ Printer IDS ARE BUILD STATE — they ride share links and saved builds
  // (sanitizeBuild falls unknown ids back to "any"), so ids are ADDITIVE
  // ONLY: relabel freely, never remove or rename an id. `group` renders as an
  // <optgroup>; consecutive entries sharing a group fold under one heading,
  // groupless entries (any / custom) stay top-level.
  // Bed sizes re-verified against manufacturer pages 2026-08-01 (the 2025-26
  // wave was added after `printer:custom` hit 23% of picks — people whose
  // machine isn't listed fall through to Custom). Notes from that pass:
  // Ender 5 Plus is 350×350 (was wrongly 300); H2S (340×320) outgrows the
  // H2D it was grouped with; X2D is 256 on its MAIN nozzle (GEN2 parts are
  // single-nozzle prints, so the dual-mode 235.5 limit doesn't apply);
  // Kobra 3 is 250, not the 255 sometimes quoted. Every 350 bed (K2 Plus,
  // SV08, Voron 350) sits just under the 351.6mm 4W parts — the size-fit
  // tooltip explains that, it's not a data error.
  printers: [
    { id: "any",        label: "Any printer / not sure", x: null, y: null },
    { id: "coreone",    label: "Prusa CORE One / One+",  x: 250, y: 220, group: "Prusa" },
    { id: "coreonel",   label: "Prusa CORE One L",       x: 300, y: 300, group: "Prusa" },
    { id: "mk4",        label: "Prusa MK4S / MK4 / MK3.9", x: 250, y: 210, group: "Prusa" },
    { id: "mini",       label: "Prusa Mini",             x: 180, y: 180, group: "Prusa" },
    { id: "xl",         label: "Prusa XL",               x: 360, y: 360, group: "Prusa" },
    { id: "bambux1",    label: "Bambu X1 / P1 / A1",     x: 256, y: 256, group: "Bambu Lab" },
    { id: "a1mini",     label: "Bambu A1 mini",          x: 180, y: 180, group: "Bambu Lab" },
    { id: "a2l",        label: "Bambu A2L",              x: 330, y: 320, group: "Bambu Lab" },
    { id: "h2d",        label: "Bambu H2D / H2C",        x: 325, y: 320, group: "Bambu Lab" },
    { id: "h2s",        label: "Bambu H2S",              x: 340, y: 320, group: "Bambu Lab" },
    { id: "x2d",        label: "Bambu X2D",              x: 256, y: 256, group: "Bambu Lab" },
    { id: "p2s",        label: "Bambu P2S",              x: 256, y: 256, group: "Bambu Lab" },
    { id: "k1",         label: "K1 / K1C",               x: 220, y: 220, group: "Creality" },
    { id: "k1max",      label: "K1 Max",                 x: 300, y: 300, group: "Creality" },
    { id: "k2plus",     label: "K2 Plus",                x: 350, y: 350, group: "Creality" },
    { id: "ender3",     label: "Ender 3 / Neo",          x: 220, y: 220, group: "Creality" },
    { id: "ender5plus", label: "Ender 5 Plus",           x: 350, y: 350, group: "Creality" },
    { id: "centauri",   label: "Centauri Carbon / Carbon 2", x: 256, y: 256, group: "Elegoo" },
    { id: "neptune4",   label: "Neptune 4 / 4 Pro",      x: 225, y: 225, group: "Elegoo" },
    { id: "neptune4plus", label: "Neptune 4 Plus",       x: 320, y: 320, group: "Elegoo" },
    { id: "neptune4max", label: "Neptune 4 Max",         x: 420, y: 420, group: "Elegoo" },
    { id: "kobras1",    label: "Kobra S1 / Kobra 3",     x: 250, y: 250, group: "Anycubic" },
    { id: "ad5m",       label: "Adventurer 5M / Pro / AD5X", x: 220, y: 220, group: "FlashForge" },
    { id: "qidiq2",     label: "QIDI Q2",                x: 270, y: 270, group: "QIDI" },
    { id: "qidiplus4",  label: "QIDI Plus4",             x: 305, y: 305, group: "QIDI" },
    { id: "sv06",       label: "SV06 / SV06 ACE",        x: 220, y: 220, group: "Sovol" },
    { id: "sv06plus",   label: "SV06 Plus",              x: 300, y: 300, group: "Sovol" },
    { id: "sv08",       label: "SV08",                   x: 350, y: 350, group: "Sovol" },
    { id: "snapmakeru1",label: "Snapmaker U1",           x: 270, y: 270, group: "Snapmaker" },
    { id: "voronv0",    label: "Voron V0",               x: 120, y: 120, group: "Voron" },
    { id: "voron250",   label: "Voron 2.4 / Trident 250", x: 250, y: 250, group: "Voron" },
    { id: "voron300",   label: "Voron 2.4 / Trident 300", x: 300, y: 300, group: "Voron" },
    { id: "voron24",    label: "Voron 2.4 / Trident 350", x: 350, y: 350, group: "Voron" },
    { id: "switchwire", label: "Voron Switchwire",       x: 250, y: 210, group: "Voron" },
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
          // matches the product page name exactly (renamed 2026-07-29) — the
          // LINK_OVERRIDES keys, partImage's regex and the diagram tooltip in
          // app.js all key off this string, so they move together
          name: `GEN2 Under Table Rails - ${ctx.len}`,
          variant: `${w}W section`,
          qty: count,
          note: "All rail widths are in the same download · print the section sizes listed.",
          // ⚠ CORE, not option. An under-table build cannot hang without its
          // rails, so they are core FOR THIS RESOLVED ARCHITECTURE; the basis
          // records which mount put them here. Typing mount parts `option`
          // would make the minimum build claim an under-table setup needs no
          // rail at all.
          requirement: GEN2.req.core('mount.install'),
          basis: GEN2.req.basis('mount', 'under-table', 'build'),
        });
      });
      items.push({
        name: "Countersunk wood screws (#6/#8)",
        qty: ctx.railScrews,
        // Joey's under-table default (2026-08-23): #6 x 3/4" - the 31.8 mm model the
        // viewer used to show went through a 25 mm top. The recommendation lives
        // in the NOTE, never the name: the name is the link/image key shared with
        // the wall row, and a second key would put two near-identical screw cards
        // on the site's purchased-hardware page.
        note: "Hardware store item · #6 × 3/4\" (3.5 × 19 mm) is the default - it reaches about 16 mm into the top, so check the surface is thick enough first and choose a length that cannot break through. Minimum 4 / 6 / 8 / 10 screws per 1W / 2W / 3W / 4W rail section.",
        hardware: true,
        // bought, and the rail does not mount without them - core, like the rail
        requirement: GEN2.req.core('mount.install'),
        basis: GEN2.req.basis('mount', 'under-table', 'build'),
      });
      return items;
    },
    "tabletop": (ctx) => {
      const P = GEN2.partNames;
      const kit = `GEN2 Table Top Kit V2 - ${ctx.len}`;
      const cov = buildCoverItems(ctx.len, ctx.runs, { hasStoppers: ctx.hasStoppers });
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
        /* CORE for this resolved architecture, exactly like the under-table
           rails. They appear only when a run's bottom row has two or more
           cases - but WHERE THEY APPEAR THEY ARE NOT OPTIONAL: nothing else
           ties separate bottom cases together. */
        const frReq = () => ({
          requirement: GEN2.req.core("base.rails"),
          basis: GEN2.req.basis("mount", "tabletop", "build"),
        });
        mixLines(fru, P.footRailUpper, ctx.len, { linkAs: fr, note: "Locks into the dovetail slots under the bottom cases." })
          .forEach((i) => items.push(Object.assign(i, frReq())));
        mixLines(frl, P.footRailLower, ctx.len, { linkAs: fr, note: "Slides into the upper rail. Needed when the bottom row is more than one case." })
          .forEach((i) => items.push(Object.assign(i, frReq())));
      }

      // Feet: printed TPU feet OR adhesive rubber feet - a one-for-one
      // alternative (same count, same support spots: the adhesive ones stick
      // to the flat pads around the slots). The BOM carries the SELECTED
      // option only, never both (confirmed 2026-08-21). Count is per RUN:
      // a single bottom-row case takes them directly, a row of two or more
      // cases takes them in the lower foot rail.
      if (ctx.feet === "adhesive") {
        items.push({
          name: "Adhesive rubber feet", qty: feet, hardware: true,
          note: "Stick to the flat pads around the underside slots · same count and spots as printed TPU feet (into the lower foot rail when the bottom row has two or more cases).",
          /* ⚠ CORE although it is BOUGHT. `feet` has no off state - a tabletop
             build stands on something - so the two options are implementations
             of one obligation and purchased-ness is a separate axis entirely. */
          requirement: GEN2.req.core("base.standoff"),
          basis: GEN2.req.basis("tabletop.feet", "adhesive", "build"),
        });
      } else {
        items.push({
          name: P.foot(), qty: feet, linkAs: kit,
          note: "Snap into the underside slots · into the lower foot rail when the bottom row has two or more cases. Or pick adhesive rubber feet instead (same count, same spots).",
          requirement: GEN2.req.core("base.standoff"),
          basis: GEN2.req.basis("tabletop.feet", "tpu", "build"),
        });
      }

      // Optional M3 hardware, 1 per W. Nuts are shared by covers + foot rails.
      const nuts = cov.screws + frScrews;
      /* ENHANCEMENTS: the covers and rails hold by their own dovetails, so the
         build stands and works without any of this. Nothing selected promises
         a bolted top - it is extra rigidity for anyone who wants it. */
      const fastening = { requirement: GEN2.req.enhancement("top.fastening") };
      items.push(Object.assign({ name: "M3×6mm socket head screw", qty: cov.screws, hardware: true, optional: true,
        note: "Optional · secures the covers, 1 per 1W (threads into an M3 nut in the Cover Lower). Socket head · any M3 head style that clears the pocket works." }, fastening));
      if (frUsed) items.push(Object.assign({ name: "M3×12mm socket head screw", qty: frScrews, hardware: true, optional: true,
        note: "Optional · screws the foot rails into the case's M3 nut slots, 1 per 1W. Socket head · any M3 head style that clears the slot works." }, fastening));
      items.push(Object.assign({ name: "M3 hex nut", qty: nuts, hardware: true, optional: true,
        note: "Optional · pairs with the M3 cover / foot-rail screws above." }, fastening));
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
          // core for this architecture - a wall build has nothing to hang from
          // without it. Mirrors the under-table rail row exactly.
          requirement: GEN2.req.core("mount.install"),
          basis: GEN2.req.basis("mount", "wall", "build"),
        });
      });
      items.push({
        name: "Countersunk wood screws (#6/#8)",
        qty: ctx.cols * GEN2.wallMount.screwsPer1W,
        // wall guidance is deliberately SEPARATE from the under-table default
        // (Joey, 2026-08-23): the right screw length or anchor depends on the wall
        note: "Hardware store item · 2 screws per 1W. Length and anchors depend on the wall material.",
        hardware: true,
        // bought, and the bracket does not mount without them - core, like the bracket
        requirement: GEN2.req.core("mount.install"),
        basis: GEN2.req.basis("mount", "wall", "build"),
      });
      // Wall builds cap the top with the same covers (they close the exposed
      // top and carry the top-row drawer-stopper slots). No foot rails or
      // feet — a wall build hangs off the ground.
      // Staggered = one connected top (tile the whole run). Per-column = each
      // top case gets its own cover (1W/2W = a single piece; 3W/4W still tile
      // internally to reach the width), so columns lift off independently.
      const coverUnits = ctx.wallStagger ? ctx.runs : ctx.topCases.map((w) => ({ width: w }));
      const cov = buildCoverItems(ctx.len, coverUnits, { hasStoppers: ctx.hasStoppers });
      cov.items.forEach((i) => items.push(i));
      const wallFastening = { requirement: GEN2.req.enhancement("top.fastening") };
      items.push(Object.assign({ name: "M3×6mm socket head screw", qty: cov.screws, hardware: true, optional: true,
        note: "Optional · secures the covers, 1 per 1W. Socket head · any M3 head style that clears the pocket works." }, wallFastening));
      items.push(Object.assign({ name: "M3 hex nut", qty: cov.screws, hardware: true, optional: true,
        note: "Optional · pairs with the M3 cover screws above." }, wallFastening));
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
      /* CORE, not enhancement. The obligation is "the drawer has a grip"; the
         integrated-grip families satisfy it INSIDE the faceplate, and a
         bolt-on family satisfies it with this. Within the selected family it
         is not omittable - a bolt-on plate with no handle has no grip at all.
         ⚠ LAZY on purpose, like `name` beside it: this table is inside the
         GEN2 literal, so GEN2.req does not exist yet while it evaluates.
         A plain value here throws at load. computeBom resolves it. */
      requirement: () => GEN2.req.core("drawer.grip"),
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
      // the one bought item a print-only build cannot avoid; same obligation
      // as the handle it fastens, and purchased-ness does not change scope.
      // Lazy for the same TDZ reason as the handle row above.
      requirement: () => GEN2.req.core("drawer.grip"),
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
        // 2 per drawer: the closure is a FACING PAIR — one clip on the case
        // back, one on the drawer back, a magnet seated in each. The clip
        // file prints a single clip (measured 2026-08-20: one body per STL),
        // and the 3D viewer places + bills 2 per drawer; billing 1 here
        // under-supplied every magnet build by half.
        { name: () => "GEN2 Magnet Clip", qtyPerDrawer: 2, linkAs: "GEN2 Hardware",
          note: "One clips to the case back, one to the drawer back · the pair meets for a magnetic soft-close catch. Wider drawers have extra slots if you'd like to add more." },
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
    /* The lip carries NO length: it is width-sized hardware that fits every
       collection, the same as the faceplates and back covers - where a length
       prefix "read as length-specific and confused people". */
    shelfLip: (w)                       => `GEN2 Shelf Lip - ${w}W`,
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
  unreleased: ["door", "hinge", "latch", "sideCover"],

  /* Which collections' shelf decks carry a SECOND lip slot pair, so a shelf
     there can take a mid lip as well as the front one. MEASURED off the shipped
     inserts by rasterising the deck and locating the openings the lip's tabs
     drop through: every length puts the front pair 7.39 mm back, and only these
     two carry another (240 at +84 mm, 270 at +144 mm behind it).
     ⚠ Mirrored as `LIP.mid` in the viewer's generate.js, which also needs the
     offsets to place them - keep the two in step. Joey's rule is front first,
     always, so a lip value is "front" or "both", never a rear-only shelf. */
  shelfMidLipLengths: [240, 270],

  // Exact part names not modeled yet, same "coming soon" treatment as
  // `unreleased` above but for SPECIFIC size/length combos rather than a whole
  // part type — e.g. some drawer sizes exist for one length but not another.
  // A missing render in a batch usually means the model itself isn't done, so
  // this is populated alongside IMAGE_OVERRIDES from what a render batch left out.
  unreleasedParts: [
    // Classic Drawers are COMPLETE as of 2026-08-02 — the six 3H sizes at
    // 115/240/270 that the 2026-07-11 batch left out were modeled, so all six
    // lengths ship all 18. (This list is the SECOND gate: dropping the viewer's
    // classicMaxHH and the planner's maxClassicH still leaves a row reading
    // "coming soon" with its download links suppressed until the name goes.)
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
function buildCoverItems(len, runs, opts) {
  const P = GEN2.partNames;
  const hasStoppers = !!(opts && opts.hasStoppers);
  const cu = {}, cl = {};
  let screws = 0;
  /* ⚠ `lowerOptional` USED TO BE THROWN AWAY HERE. brickTiling() computes it
     per run - false on runs of 3W and up, where the staggered layout needs
     both layers to tie the sections together - and this function aggregated
     every Cover Lower into one mix without ever reading it. The fact survived
     only inside the note string below, so nothing downstream could act on it.
     Now each run contributes its CAUSE, and the row resolves them. */
  let staggerRequired = false, rigidityOnly = false;
  runs.forEach((run) => {
    const t = brickTiling(run.width);
    addMix(cu, t.upper);
    addMix(cl, t.lower);
    if (t.lowerOptional) rigidityOnly = true; else staggerRequired = true;
    screws += run.width;
  });

  /* THE COVER LOWER'S REASONS, per Joey 2026-08-22. A run whose layout needs
     the lower layer makes it core; stoppers make it required by that choice
     (they seat INTO the lower cover); otherwise it is a rigidity enhancement.
     A build can hit several of these at once, so they are all preserved and
     the strongest wins the row. */
  const lowerReasons = [];
  if (staggerRequired) {
    lowerReasons.push(Object.assign(core('top.enclosure'),
      { basis: basis('cover.layout', 'staggered', 'build') }));
  }
  if (hasStoppers) {
    lowerReasons.push(Object.assign(option('drawer.stopper.seat', 'drawer.stoppers'),
      { basis: basis('drawer.stoppers', 'on', 'build') }));
  }
  if (rigidityOnly && !staggerRequired && !hasStoppers) {
    lowerReasons.push(enhancement('top.rigidity'));
  }

  const covers = `GEN2 ${len} Covers`;
  const items = [];
  mixLines(cu, P.coverUpper, len, Object.assign(
    { linkAs: covers, note: "Snaps over the Cover Lower for a smooth finished top." },
    // the UPPER layer is what closes the top on every covered build
    { requirement: core('top.enclosure') }))
    .forEach((i) => items.push(i));
  mixLines(cl, P.coverLower, len, Object.assign(
    { linkAs: covers, note: "Optional on 1W/2W-only builds, but needed for drawer stoppers and rigidity." },
    resolveReasons(lowerReasons)))
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
  // ---- Under-table rails (Printables pages for every length, 2026-07-12).
  //      Thangs renamed all six to "GEN2 Under Table Rails - <L>" 2026-07-29
  //      (old names: SMALL / MEDIUM / 165 / STANDARD / 240 Lite / LARGE). The
  //      model ids are unchanged and Thangs resolves by the trailing id, so the
  //      old urls still land — these are the canonical forms. Printables rails
  //      pages were NOT renamed in that cycle. ----
  "GEN2 Under Table Rails - 59":  { p: "https://www.printables.com/model/1053797-gen2-rails-59-small", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%2059-1165763", m: "https://makerworld.com/en/models/3093597-gen2-under-table-rails-59" },
  "GEN2 Under Table Rails - 115": { p: "https://www.printables.com/model/1053795-gen2-rails-115-medium", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20115-1165720", m: "https://makerworld.com/en/models/755511-gen2-under-table-rails-115" },
  "GEN2 Under Table Rails - 165": { p: "https://www.printables.com/model/1053557-gen2-rails-165-mini", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20165-1165793", m: "https://makerworld.com/en/models/939507-gen2-under-table-rails-165" },
  "GEN2 Under Table Rails - 185": { p: "https://www.printables.com/model/1052357-gen2-rails-185-standard", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20185-1163830", m: "https://makerworld.com/en/models/2199580-gen2-under-table-rails-185" },
  "GEN2 Under Table Rails - 240": { p: "https://www.printables.com/model/1322484-gen2-rails-240", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20240-1360077", m: "https://makerworld.com/en/models/1516579-gen2-under-table-rails-240" },
  "GEN2 Under Table Rails - 270": { p: "https://www.printables.com/model/1053793-gen2-rails-270-large", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20270-1165816", m: "https://makerworld.com/en/models/1938132-gen2-under-table-rails-270" },

  // ---- Cases — one "{len} Cases - All" collection page per length ----
  "GEN2 59 Cases - All":  { p: "https://www.printables.com/model/1658749-gen2-59-cases-all", t: "https://than.gs/m/1535454", m: "https://makerworld.com/en/models/3092550-gen2-59-cases-all" },
  "GEN2 115 Cases - All": { p: "https://www.printables.com/model/1658744-gen2-115-cases-all", t: "https://than.gs/m/1535435", m: "https://makerworld.com/en/models/3092499-gen2-115-cases-all" },
  "GEN2 165 Cases - All": { p: "https://www.printables.com/model/1658722-gen2-165-cases-all", t: "https://than.gs/m/1535457", m: "https://makerworld.com/en/models/3092414-gen2-165-cases-all" },
  "GEN2 185 Cases - All": { p: "https://www.printables.com/model/1658700-gen2-185-cases-all", t: "https://than.gs/m/1535455", m: "https://makerworld.com/en/models/3092219-gen2-185-cases-all" },
  "GEN2 240 Cases - All": { p: "https://www.printables.com/model/1658608-gen2-240-cases-all", t: "https://than.gs/m/1535459", m: "https://makerworld.com/en/models/3091292-gen2-240-cases-all" },
  "GEN2 270 Cases - All": { p: "https://www.printables.com/model/1658688-gen2-270-cases-all", t: "https://than.gs/m/1535458", m: "https://makerworld.com/en/models/3092111-gen2-270-cases-all" },

  // ---- Case extenders ----
  "GEN2 59 Case Extenders":  { p: "https://www.printables.com/model/1563420-gen2-59-case-extenders" },
  "GEN2 115 Case Extenders": { p: "https://www.printables.com/model/1563509-gen2-115-case-extenders" },
  "GEN2 165 Case Extenders": { p: "https://www.printables.com/model/1710717-gen2-165-case-extenders" },
  "GEN2 185 Case Extenders": { p: "https://www.printables.com/model/1706520-gen2-185-case-extenders" },
  "GEN2 240 Case Extenders": { p: "https://www.printables.com/model/1702093-gen2-240-case-extenders" },
  "GEN2 270 Case Extenders": { p: "https://www.printables.com/model/1706499-gen2-270-case-extenders" },

  /* ---- Shelf inserts ----
     ONE page per length carries that length's inserts AND the universal
     1W-4W shelf lips, so BOTH row families linkAs this key (see the shelf
     branch of computeBom). Printables-only for now, like the extenders
     above; adding Thangs later is a `t:` on each row. */
  "GEN2 59 Shelf Inserts":  { p: "https://www.printables.com/model/1828405-gen2-59-shelf-inserts", t: "https://than.gs/m/1595944" },
  "GEN2 115 Shelf Inserts": { p: "https://www.printables.com/model/1828408-gen2-115-shelf-inserts", t: "https://than.gs/m/1595952" },
  "GEN2 165 Shelf Inserts": { p: "https://www.printables.com/model/1828409-gen2-165-shelf-inserts", t: "https://than.gs/m/1595957" },
  "GEN2 185 Shelf Inserts": { p: "https://www.printables.com/model/1828395-gen2-185-shelf-inserts", t: "https://than.gs/m/1595956" },
  "GEN2 240 Shelf Inserts": { p: "https://www.printables.com/model/1828410-gen2-240-shelf-inserts", t: "https://than.gs/m/1595955" },
  "GEN2 270 Shelf Inserts": { p: "https://www.printables.com/model/1828411-gen2-270-shelf-inserts", t: "https://than.gs/m/1595953" },

  // ---- Classic drawers — per-length "…Classic Drawers - All" collection ----
  "GEN2 59 Classic Drawers - All":  { p: "https://www.printables.com/model/234780-gen2-59-classic-drawers-all", m: "https://makerworld.com/en/models/2364890-gen2-59-classic-drawers-all" },
  "GEN2 115 Classic Drawers - All": { p: "https://www.printables.com/model/1143243-gen2-115-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20115%20Classic%20Drawers-1069181", m: "https://makerworld.com/en/models/755424-gen2-115-classic-drawers-all" },
  "GEN2 165 Classic Drawers - All": { p: "https://www.printables.com/model/625776-gen2-165-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Classic%20Drawers-1044262", m: "https://makerworld.com/en/models/922620-gen2-165-classic-drawers-all" },
  // no MakerWorld url — the 185 classic-drawers page was withdrawn 2026-07-25
  // (Joey); the row falls back to Printables and MakerWorld drops out of its ▾
  "GEN2 185 Classic Drawers - All": { p: "https://www.printables.com/model/278293-gen2-185-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20-%20Classic%20Drawers-1042322" },
  "GEN2 240 Classic Drawers - All": { p: "https://www.printables.com/model/1324538-gen2-240-classic-drawers-all", t: "https://than.gs/m/1360091", m: "https://makerworld.com/en/models/1516621-gen2-240-classic-drawers-all" },
  "GEN2 270 Classic Drawers - All": { p: "https://www.printables.com/model/1164306-gen2-270-classic-drawers-all", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Drawers%20-%20Large-1093398", m: "https://makerworld.com/en/models/1938234-gen2-270-classic-drawers-all" },

  // ---- Decor drawers — per-length "…Decor Drawers - All" collection ----
  "GEN2 59 Decor Drawers - All":  { p: "https://www.printables.com/model/1070454-gen2-59-decor-drawers-all", t: "https://than.gs/m/1481534", m: "https://makerworld.com/en/models/2364145-gen2-59-decor-drawers-all" },
  "GEN2 115 Decor Drawers - All": { p: "https://www.printables.com/model/1307794-gen2-115-decor-drawers-all", t: "https://than.gs/m/1158598", m: "https://makerworld.com/en/models/755457-gen2-115-decor-drawers-all" },
  "GEN2 165 Decor Drawers - All": { p: "https://www.printables.com/model/1100978-gen2-165-decor-drawers-all", t: "https://than.gs/m/1493950", m: "https://makerworld.com/en/models/861753-gen2-165-decor-drawers-all" },
  "GEN2 185 Decor Drawers - All": { p: "https://www.printables.com/model/964551-gen2-185-decor-drawers-all", t: "https://than.gs/m/1116945", m: "https://makerworld.com/en/models/1253173-gen2-185-decor-drawers-all" },
  "GEN2 240 Decor Drawers - All": { p: "https://www.printables.com/model/1322479-gen2-240-decor-drawers-all", t: "https://than.gs/m/1360074", m: "https://makerworld.com/en/models/1516607-gen2-240-decor-drawers-all" },
  "GEN2 270 Decor Drawers - All": { p: "https://www.printables.com/model/1062961-gen2-270-decor-drawers-all", t: "https://than.gs/m/1171387", m: "https://makerworld.com/en/models/1938424-gen2-270-decor-drawers-all" },

  // ---- Covers — dedicated per-length pages (Thangs added 2026-07-12; CL/CU rows funnel here) ----
  "GEN2 59 Covers":  { p: "https://www.printables.com/model/1777881-gen2-59-cover", t: "https://than.gs/m/1574324", m: "https://makerworld.com/en/models/3094116-gen2-59-covers" },
  "GEN2 115 Covers": { p: "https://www.printables.com/model/1777837-gen2-115-cover", t: "https://than.gs/m/1574330", m: "https://makerworld.com/en/models/3093900-gen2-115-covers" },
  "GEN2 165 Covers": { p: "https://www.printables.com/model/1774498-gen2-165-covers", t: "https://than.gs/m/1574320", m: "https://makerworld.com/en/models/3094016-gen2-165-covers" },
  "GEN2 185 Covers": { p: "https://www.printables.com/model/1777844-gen2-185-cover", t: "https://than.gs/m/1574319", m: "https://makerworld.com/en/models/3093827-gen2-185-covers" },
  "GEN2 240 Covers": { p: "https://www.printables.com/model/1777846-gen2-240-cover", t: "https://than.gs/m/1574326", m: "https://makerworld.com/en/models/3094065-gen2-240-covers" },
  "GEN2 270 Covers": { p: "https://www.printables.com/model/1777849-gen2-270-cover", t: "https://than.gs/m/1574325", m: "https://makerworld.com/en/models/3094095-gen2-270-covers" },

  // ---- Foot Rails — dedicated per-length pages (Thangs added 2026-07-12; FR rows
  //      funnel here; no 59 — that collection has no foot rails) ----
  "GEN2 115 Foot Rails": { p: "https://www.printables.com/model/1777819-gen2-115-foot-rails", t: "https://than.gs/m/1574331", m: "https://makerworld.com/en/models/3093882-gen2-115-foot-rails" },
  "GEN2 165 Foot Rails": { p: "https://www.printables.com/model/1775386-gen2-165-foot-rails", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Foot%20Rails-1574329", m: "https://makerworld.com/en/models/3093999-gen2-165-foot-rails" },
  "GEN2 185 Foot Rails": { p: "https://www.printables.com/model/1777823-gen2-185-foot-rails", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Foot%20Rails-1574328", m: "https://makerworld.com/en/models/3093787-gen2-185-foot-rails" },
  "GEN2 240 Foot Rails": { p: "https://www.printables.com/model/1777826-gen2-240-foot-rails", t: "https://than.gs/m/1574322", m: "https://makerworld.com/en/models/3094051-gen2-240-foot-rails" },
  "GEN2 270 Foot Rails": { p: "https://www.printables.com/model/1777830-gen2-270-foot-rails", t: "https://than.gs/m/1574327" },

  // ---- Table Top Kit V2 (feet still funnel here via linkAs).
  //      The PAGES were renamed to "GEN2 <L> Tabletop Starter Kit" on BOTH
  //      platforms 2026-07-29; ids unchanged (Printables 301s the old slug,
  //      Thangs resolves by trailing id). The KEY stays the generated BOM row
  //      name — rename that and these entries must move with it. ----
  "GEN2 Table Top Kit V2 - 115": { p: "https://www.printables.com/model/1146353-gen2-115-tabletop-starter-kit", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20115%20Tabletop%20Starter%20Kit-1245167" },
  "GEN2 Table Top Kit V2 - 165": { p: "https://www.printables.com/model/1124278-gen2-165-tabletop-starter-kit", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Tabletop%20Starter%20Kit-1233752" },
  "GEN2 Table Top Kit V2 - 185": { p: "https://www.printables.com/model/1118906-gen2-185-tabletop-starter-kit", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Tabletop%20Starter%20Kit-1231757" },
  "GEN2 Table Top Kit V2 - 240": { p: "https://www.printables.com/model/1324501-gen2-240-tabletop-starter-kit", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20240%20Tabletop%20Starter%20Kit-1360073" },
  "GEN2 Table Top Kit V2 - 270": { p: "https://www.printables.com/model/1163955-gen2-270-tabletop-starter-kit", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20270%20Tabletop%20Starter%20Kit-1253780" },

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
  // the FREE Classic series (2026-07-25). COLLECTION_RULES derives this key
  // from the style label, and the BACK COVER rows linkAs it too — so this one
  // entry keeps both row types off the fallback search URLs.
  "GEN2 Decor - Faceplates - Classic Series":     { p: "https://www.printables.com/model/1280870-gen2-decor-faceplates-classic-series", t: "https://than.gs/m/1334047" },
  "GEN2 Decor - Faceplates - Chevron Series":     { p: "https://www.printables.com/model/968654-gen2-decor-faceplates-chevron-series", t: "https://than.gs/m/1116950" },

  // ---- Decor handle series (parts-list handle row links the chosen style) ----
  "GEN2 Decor Handles - BlockBar Series": { p: "https://www.printables.com/model/965604-gen2-decor-handles-blockbar-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20BlockBar-1116949" },
  "GEN2 Decor Handles - Deco Series":     { p: "https://www.printables.com/model/1044972-gen2-decor-handles-deco-series", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20Handles%20-%20Deco%20Series-1159960" },
  "GEN2 Decor Handles - Crystal Series":  { p: "https://www.printables.com/model/1001155-gen2-decor-handles-crystal", t: "https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20Crystal-1134382" },

  // ---- Individual drawer SKUs with a more specific page than their collection ----
  "GEN2 185-1W-3H Classic Drawer":   { p: "https://www.printables.com/model/262035-gen2-185-1w-3h-classic-drawer" },
  "GEN2 185-2W-1H Decor Drawer":     { p: "https://www.printables.com/model/964551-gen2-185-2w-1h-decor-drawer", m: "https://makerworld.com/en/models/1253173-gen2-185-decor-drawers-all" },
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
   (can be too strong for smaller drawers) — the row note says so.
   The three M3 rows deliberately SHARE one pair of links: both listings are
   VIGRUE 570-piece M3 assortments (stainless B08H24W42K / steel B09MYDQCXX)
   that carry every screw length AND the hex nuts, so one kit satisfies the
   whole optional cover / foot-rail hardware list. Adding a row here is what
   swaps its plain "hardware store" tag for buy buttons. */
const HARDWARE_BUY = {
  "M3×6mm socket head screw": [
    { id: "m3-assort-stainless", label: "Stainless", url: "https://amzn.to/4ymX5G8" },
    { id: "m3-assort-steel", label: "Steel", url: "https://amzn.to/4gA0NWl" },
  ],
  "M3×12mm socket head screw": [
    { id: "m3-assort-stainless", label: "Stainless", url: "https://amzn.to/4ymX5G8" },
    { id: "m3-assort-steel", label: "Steel", url: "https://amzn.to/4gA0NWl" },
  ],
  // same assortment kits as the screws above — the nuts ship in the same box
  "M3 hex nut": [
    { id: "m3-assort-stainless", label: "Stainless", url: "https://amzn.to/4ymX5G8" },
    { id: "m3-assort-steel", label: "Steel", url: "https://amzn.to/4gA0NWl" },
  ],
  // the handle fastener — the one REQUIRED buy on a bolt-on-handle build
  "M3×6mm button head screw": [
    { id: "m3-button-head", label: "Buy M3×6 button head", url: "https://amzn.to/4x4opHK" },
  ],
  "Countersunk wood screws (#6/#8)": [
    { id: "woodscrew-6", label: "#6 × 3/4\"", url: "https://amzn.to/4s487gc" },
    { id: "woodscrew-8", label: "#8", url: "https://amzn.to/4pTWDuq" },
  ],
  "Magnets 10×2mm or 6×2mm": [
    { id: "magnet-10x2", label: "10×2mm", url: "https://amzn.to/4sesPKm" },
    { id: "magnet-6x2", label: "6×2mm", url: "https://amzn.to/4aH1ASw" },
    { id: "magnet-n52-10x2", label: "N52 10×2mm", url: "https://amzn.to/4q4JX3Z" },
    { id: "magnet-n52-6x2", label: "N52 6×2mm", url: "https://amzn.to/49BZyC0" },
  ],
  // the purchased one-for-one alternative to printed TPU feet (2026-08-21):
  // same count, same support spots, stuck to the flat pads around the slots.
  // Billed INSTEAD of the TPU feet when the build picks "Buy adhesive feet".
  "Adhesive rubber feet": [
    { id: "rubber-feet", label: "Rubber feet", url: "https://amzn.to/4cEanSB" },
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

/* The 3D model stores a part can live on. MIRRORS the viewer's STORES table in
   main.js — keep the ids and order in step. `order` here IS the array order:
   it's the fallback chain when the user's preferred store doesn't carry a part
   (Printables first — the most complete catalog). Adding a store = a row here,
   a `search` builder, and the url key on the LINK_OVERRIDES entries.
   NB MakerWorld serves 403 to automated fetchers, so its urls can't be
   link-checked in CI — verify those by eye when adding them. */
const STORES = [
  { id: "printables", key: "p", label: "Printables", host: "printables.com", search: (q) => "https://www.printables.com/search/models?q=" + q },
  { id: "thangs",     key: "t", label: "Thangs",     host: "thangs.com",     search: (q) => "https://thangs.com/search/" + q },
  { id: "makerworld", key: "m", label: "MakerWorld", host: "makerworld.com", search: (q) => "https://makerworld.com/en/search/models?keyword=" + q },
  { id: "cults",      key: "c", label: "Cults 3D",   host: "cults3d.com",    search: (q) => "https://cults3d.com/en/search?q=" + q },
];

/* Resolve links for a part name. Per platform: an exact name override wins,
   else the part's collection page, else a search on that platform. Returns one
   entry per store that the part could be shown on, each {id,label,url,exact} —
   `exact` false means it fell through to a search and the button stays `ghost`.
   Stores with NO real url are omitted entirely (a menu of dead entries is
   noise); `printables`/`thangs`/`exactP`/`exactT` stay for older callers. */
function partLinks(name) {
  const exact = LINK_OVERRIDES[name] || {};
  const ck = collectionKeyFor(name);
  const coll = (ck && LINK_OVERRIDES[ck]) || {};
  const q = encodeURIComponent(name);
  const stores = STORES.map((s) => {
    const url = exact[s.key] || coll[s.key];
    return { id: s.id, label: s.label, url: url || s.search(q), exact: !!url };
  });
  const byId = Object.fromEntries(stores.map((s) => [s.id, s]));
  return {
    stores,
    // legacy shape (kept so nothing silently breaks)
    printables: byId.printables.url,
    thangs: byId.thangs.url,
    exactP: byId.printables.exact,
    exactT: byId.thangs.exact,
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
  // TPU foot — ONE universal render: the foot is length-agnostic (it seats in
  // the foot rail / case underside slots, identical on every collection), so
  // there's no per-length set. Needs an override because the row's name carries
  // parentheses the automatic slug can't produce a file for.
  "GEN2 Foot (TPU)": "img/parts/TPU Foot.png",
  // L/R stoppers are mirrored parts sharing one render
  "GEN2 Drawer Stopper - Left": "img/parts/Drawer Stopper.png",
  "GEN2 Drawer Stopper - Right": "img/parts/Drawer Stopper.png",
  // Hardware-store items (bought, not printed) — real reference photos instead
  // of the generic wrench icon, so a user knows exactly what to pick up.
  // renderBom() looks these up specially: it.hardware skips partImage()'s
  // auto-pattern (these names don't follow the "GEN2 ..." convention anyway)
  // and falls back to hardware.svg, never the "coming soon" placeholder.
  "M3×6mm socket head screw": "img/parts/Screw.png",
  "M3×12mm socket head screw": "img/parts/Screw.png",
  "M3×6mm button head screw": "img/parts/ButtonHeadScrew_M3-6.png",
  "M3 hex nut": "img/parts/Nut.png",
  "Magnets 10×2mm or 6×2mm": "img/parts/Magnets.png",
  "Countersunk wood screws (#6/#8)": "img/parts/Wood Screw.png",
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
  /* 165 Case Extender renders — width-only, all 4 sizes, matching the other
     five lengths. ⚠ THESE FOUR FILES DO NOT EXIST YET: the 165 extenders were
     the one length never rendered (there is no "165 Case Extenders" folder in
     D:\Render Projects, unlike 59/115/185/240/270). The rows are wired anyway
     because renderBom's <img> onerror falls back to placeholder.svg, so a
     missing file looks exactly like the auto-pattern miss it replaces — and the
     day the PNGs land in img/parts/165/ they light up with no code change.
     Joey is producing them (2026-08-29). */
  "GEN2 165 Case Extender - 1W-1H": "img/parts/165/Case Extender 165-1W.png",
  "GEN2 165 Case Extender - 2W-1H": "img/parts/165/Case Extender 165-2W.png",
  "GEN2 165 Case Extender - 3W-1H": "img/parts/165/Case Extender 165-3W.png",
  "GEN2 165 Case Extender - 4W-1H": "img/parts/165/Case Extender 165-4W.png",
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
  // 270 Classic Drawer renders — all 18 catalog sizes (3W/4W × 1.5H/2H landed
  // with the 2026-07-11 all-lengths batch; 1W/2W-3H followed 2026-08-02).
  "GEN2 270-1W-0.5H Classic Drawer": "img/parts/270/Classic Drawer 270-1W-05H.png",
  "GEN2 270-1W-1H Classic Drawer":   "img/parts/270/Classic Drawer 270-1W-1H.png",
  "GEN2 270-1W-1.5H Classic Drawer": "img/parts/270/Classic Drawer 270-1W-15H.png",
  "GEN2 270-1W-2H Classic Drawer":   "img/parts/270/Classic Drawer 270-1W-2H.png",
  "GEN2 270-1W-3H Classic Drawer":   "img/parts/270/Classic Drawer 270-1W-3H.png",
  "GEN2 270-2W-0.5H Classic Drawer": "img/parts/270/Classic Drawer 270-2W-05H.png",
  "GEN2 270-2W-1H Classic Drawer":   "img/parts/270/Classic Drawer 270-2W-1H.png",
  "GEN2 270-2W-1.5H Classic Drawer": "img/parts/270/Classic Drawer 270-2W-15H.png",
  "GEN2 270-2W-2H Classic Drawer":   "img/parts/270/Classic Drawer 270-2W-2H.png",
  "GEN2 270-2W-3H Classic Drawer":   "img/parts/270/Classic Drawer 270-2W-3H.png",
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
  // 115 Classic Drawer renders — all 18 catalog sizes (3W/4W landed with the
  // 2026-07-11 all-lengths batch; 1W/2W-3H followed 2026-08-02)
  "GEN2 115-1W-0.5H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-05H.png",
  "GEN2 115-1W-1.5H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-15H.png",
  "GEN2 115-1W-1H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-1H.png",
  "GEN2 115-1W-2H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-2H.png",
  "GEN2 115-1W-3H Classic Drawer": "img/parts/115/Classic Drawer 115-1W-3H.png",
  "GEN2 115-2W-0.5H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-05H.png",
  "GEN2 115-2W-1.5H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-15H.png",
  "GEN2 115-2W-1H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-1H.png",
  "GEN2 115-2W-2H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-2H.png",
  "GEN2 115-2W-3H Classic Drawer": "img/parts/115/Classic Drawer 115-2W-3H.png",
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
  // 240 Classic Drawer renders — all 18 catalog sizes (3W/4W × 1.5H/2H landed
  // with the 2026-07-11 all-lengths batch; 1W/2W-3H followed 2026-08-02).
  "GEN2 240-1W-0.5H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-05H.png",
  "GEN2 240-1W-1.5H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-15H.png",
  "GEN2 240-1W-1H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-1H.png",
  "GEN2 240-1W-2H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-2H.png",
  "GEN2 240-1W-3H Classic Drawer": "img/parts/240/Classic Drawer 240-1W-3H.png",
  "GEN2 240-2W-0.5H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-05H.png",
  "GEN2 240-2W-1.5H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-15H.png",
  "GEN2 240-2W-1H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-1H.png",
  "GEN2 240-2W-2H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-2H.png",
  "GEN2 240-2W-3H Classic Drawer": "img/parts/240/Classic Drawer 240-2W-3H.png",
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
  // so their files can't carry a length. EdgeLabel (2026-07-08 batch),
  // Classic Pro (2026-07-13) and Classic (2026-07-25) have per-size renders —
  // <Family>_<size>.png, dots dropped like everywhere else; Essential shows its
  // hero card art until a per-size batch exists. NB the Classic files are
  // named ClassicDecor_* (the GLB exporter's name), NOT Classic_*.
  // Under-table rails: per-length + per-width renders (2026-07-19 batch) live
  // in img/parts/<len>/Rails <len>-<w>W.png — the BOM row's "<w>W section"
  // variant picks the file, same pattern as Wall Mount Lite above. All six
  // lengths have a render batch (2026-07-19).
  if (variant && /^GEN2 Under Table Rails - \d+$/.test(name)) {
    const rl = name.match(/(\d+)$/)[1];
    const rw = variant.match(/^(\d)W/);
    if (rw && ["59", "115", "165", "185", "240", "270"].includes(rl))
      return "img/parts/" + rl + "/Rails " + rl + "-" + rw[1] + "W.png";
  }
  // "Classic Pro" MUST precede "Classic" in the alternation — leftmost-first
  // matching would otherwise try the shorter one on a Classic Pro name
  const fp = name.match(/^GEN2 (Essential|EdgeLabel|Classic Pro|Classic|Chevron) Decor Faceplate - (.+)$/);
  if (fp) {
    if (fp[1] === "EdgeLabel") return "img/parts/EdgeLabel_" + fp[2].replace(/\./g, "") + ".png";
    if (fp[1] === "Classic") return "img/parts/ClassicDecor_" + fp[2].replace(/\./g, "") + ".png";
    if (fp[1] === "Classic Pro") return "img/parts/ClassicPro_" + fp[2].replace(/\./g, "") + ".png";
    if (fp[1] === "Chevron") return "img/parts/Chevron_" + fp[2].replace(/\./g, "") + ".png";
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
