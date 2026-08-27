/* GEN2 Planner — application logic.
   All catalog data and BOM rules live in js/data.js. */

(function () {
  "use strict";

  /* ----------------------------- State ----------------------------- */

  const state = {
    mount: null,            // mount id
    length: null,           // length id (number)
    fill: "decor",          // fill id for new placements
    faceStyle: GEN2.faceplateStyles[0].id,
    doorStyle: GEN2.doorStyles[0].id,
    handleStyle: GEN2.handleStyles[0].id,
    spaceW: null,           // workable width in mm (under-table / wall)
    spaceH: null,           // workable height in mm
    printer: "any",
    customBed: { x: null, y: null },
    gridW: 6,               // grid width in 1W units
    gridH: 4,               // grid height in 1H units
    placed: [],             // {id, x, y, w, hh, fill, shelves} — y/hh in half-rows
    selected: { w: 1, h: 1 },
    selectedUnit: null,     // id of placed unit shown in the inspector
    nextId: 1,
    wallStagger: false,     // wall covers: false = per-column (default), true = staggered top
    removedStoppers: [],    // "<unitId>:<localCol>" keys — stopper pairs removed in the 3D viewer
    backCover: false,       // optional decor-faceplate back cover (every faceplate style seats the same part)
    feet: "tpu",            // tabletop feet: "tpu" (printed, default) | "adhesive" (purchased rubber feet) - one-for-one alternatives, the BOM bills the pick
  };

  const GRID_LIMITS = { wMin: 1, wMax: 12, hMin: 1, hMax: 10 };

  // Pixels per unit on the board
  const CW = 64;   // 1W
  const CH = 44;   // 1H (one half-row = CH / 2)
  const PAD = { top: 64, right: 36, bottom: 56, left: 36 };

  const $ = (sel) => document.querySelector(sel);
  const mountDef = () => GEN2.mounts.find((m) => m.id === state.mount);
  const fillDef = (id) => GEN2.fills.find((f) => f.id === (id || state.fill));

  // localStorage can throw (sandboxed origins) — degrade to session-only
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* session-only */ } },
  };

  /* Fire a GoatCounter custom event (cookieless analytics; see the script tag
     in index.html). `name` is the event path, e.g. "length:185". Fails silent
     and is a no-op if the beacon is blocked/absent — analytics must NEVER be
     able to break the planner. */
  function track(name) {
    try {
      if (window.goatcounter && window.goatcounter.count)
        window.goatcounter.count({ path: name, title: name, event: true });
    } catch (e) { /* ignore — never let tracking throw */ }
  }
  /* hostname → a fixed short id, mirroring the viewer's OUT_HOSTS so ONE
     vocabulary spans both apps (the dashboard sums `out:` across them) and a
     raw url can never become an event name. `than.gs` is the short domain the
     link tables actually use — miss it and Thangs lands in out:other. */
  const OUT_HOSTS = [
    [/(^|\.)printables\.com$/,  "printables"],
    [/(^|\.)thangs\.com$/,      "thangs"],
    [/(^|\.)than\.gs$/,         "thangs"],
    [/(^|\.)makerworld\.com$/,  "makerworld"],
    [/(^|\.)cults3d\.com$/,     "cults"],
  ];
  /* What kind of outbound click is this anchor? Affiliate buys are told apart
     by rel="sponsored" — the attribute that actually marks the relationship —
     rather than by sniffing an Amazon hostname that could change. */
  function outEvent(a) {
    if ((a.rel || "").includes("sponsored")) return "hardware:buy";
    let host = "";
    try { host = new URL(a.href, location.href).hostname.toLowerCase(); } catch (e) { /* malformed */ }
    for (const [re, id] of OUT_HOSTS) if (re.test(host)) return "out:" + id;
    return "out:other";
  }

  /* ----------------------- Printer / bed fitting ----------------------- */

  function bedSize() {
    if (state.printer === "any") return null;
    if (state.printer === "custom") {
      const { x, y } = state.customBed;
      return x > 0 && y > 0 ? { x, y } : null;
    }
    const p = GEN2.printers.find((p) => p.id === state.printer);
    return p && p.x ? { x: p.x, y: p.y } : null;
  }

  function fitsBed(fw, fl) {
    const bed = bedSize();
    if (!bed) return true;
    return (fw <= bed.x && fl <= bed.y) || (fw <= bed.y && fl <= bed.x);
  }

  function caseFits(w) {
    return fitsBed(w * GEN2.units.widthMM, state.length || 0);
  }

  // Can this length be printed at all (narrowest 1W case)?
  function lengthFits(len) {
    return fitsBed(GEN2.units.widthMM, len);
  }

  // A length can be catalog-blocked for the chosen mount (e.g. 59 has no foot
  // rails / feet, so it can't be a Table Top build). Clear an invalid pairing
  // so the layout can't unlock on it — the user re-picks a valid length.
  function mountBlocksLength(len) {
    const l = GEN2.lengths.find((x) => x.id === len);
    return !!(l && state.mount === "tabletop" && l.noTabletop);
  }
  function enforceMountLength() {
    if (state.length && mountBlocksLength(state.length)) state.length = null;
  }

  // Can `fill` be printed at width w? The case is the limiting part, except
  // Classic drawers whose print-in-place handle overhangs the front.
  function fillFits(w, fill) {
    if (!caseFits(w)) return false;
    if (fill === "classic") {
      return fitsBed(w * GEN2.units.widthMM, (state.length || 0) + GEN2.classicHandleExtraMM);
    }
    return true;
  }

  function fitProblem(w, fill) {
    const bed = bedSize();
    const bedTxt = bed ? `${bed.x}×${bed.y}mm bed` : "";
    if (!caseFits(w)) {
      return `Case (${w * GEN2.units.widthMM}×${state.length}mm) won't fit your ${bedTxt}`;
    }
    if (fill === "classic" && !fillFits(w, fill)) {
      return `Classic drawer handle adds ~${GEN2.classicHandleExtraMM}mm · won't fit your ${bedTxt}`;
    }
    return null;
  }

  function maxRailW() {
    let max = 1;
    GEN2.railWidths.forEach((w) => {
      if (fitsBed(w * GEN2.units.widthMM, state.length || 0)) max = Math.max(max, w);
    });
    return max;
  }

  // GEN2.unavailableSizes (3W-3H, 4W-3H) don't exist as a single DRAWER, but
  // shelves and cabinets build from 1H cases + extenders, so any footprint is
  // buildable for them — the restriction is drawer-only.
  // GEN2.collectionCases adds per-LENGTH limits on top: the 59 mini collection
  // ships only 4 cases (1W/2W × 0.5H/1H) — its width cap applies to every fill
  // (no wider case exists to build on); its height cap applies to the drawer
  // fills only (shelves/cabinets stack extenders above a 1H case).
  // `length` defaults to the current selection — sanitizeBuild passes the
  // INCOMING build's length instead (its units must be judged against the
  // catalog they were built for, not whatever is selected pre-restore).
  function sizeExists(w, h, fill, length) {
    const f = fill || state.fill;
    const cc = GEN2.collectionCases[length || state.length];
    if (cc && w > cc.maxW) return false;
    if (f === "classic" || f === "decor") {
      if (cc && h > cc.maxDrawerH) return false;
      // classic-only height cap. No length sets it since 2026-08-02 (all six
      // ship 3H classics), but it stays armed for the next partial catalog —
      // set it in step with the viewer generator's COLL[L].classicMaxHH.
      if (f === "classic" && cc && cc.maxClassicH && h > cc.maxClassicH) return false;
      return !GEN2.unavailableSizes.includes(sizeToken(w, h));
    }
    return true;
  }

  // Heights offered for a given fill. Drawers use the physical drawer sizes;
  // Shelves and Cabinets stack 1H extenders, so they get the taller case range.
  function heightsForFill(id) {
    const f = id || state.fill;
    return (f === "shelf" || f === "cabinet") ? GEN2.caseHeights : GEN2.drawerHeights;
  }

  // Make sure the grid is tall enough to place a unit of the selected height
  // (skipped for tabletop, whose height is managed automatically).
  function growGridForHeight(h) {
    if (state.mount === "tabletop") return;
    const need = Math.ceil(h);
    if (need > state.gridH) state.gridH = Math.min(capH(), need);
  }

  function selectable(w, h) {
    if (!sizeExists(w, h)) return false;
    if (!fillFits(w, state.fill)) return false;
    const f = fillDef();
    if (f.integerHeightsOnly && !Number.isInteger(h)) return false;
    if (f.minHeight && h < f.minHeight) return false;
    return true;
  }

  function ensureValidSelection() {
    const s = state.selected;
    if (s && selectable(s.w, s.h)) return;
    for (const h of heightsForFill())
      for (const w of GEN2.drawerWidths)
        if (selectable(w, h)) { state.selected = { w, h }; return; }
    state.selected = null;
  }

  /* ----------------------- Workable-area caps ----------------------- */

  function capW() {
    const m = mountDef();
    if (!m || !m.askSpace || !state.spaceW) return GRID_LIMITS.wMax;
    return Math.min(GRID_LIMITS.wMax,
      Math.max(GRID_LIMITS.wMin, Math.floor(state.spaceW / GEN2.units.widthMM)));
  }

  function capH() {
    const m = mountDef();
    if (!m || !m.askSpace || !state.spaceH) return GRID_LIMITS.hMax;
    return Math.min(GRID_LIMITS.hMax,
      Math.max(GRID_LIMITS.hMin, Math.floor(state.spaceH / GEN2.units.heightMM)));
  }

  function clampGrid() {
    state.gridW = Math.min(state.gridW, capW());
    state.gridH = Math.min(state.gridH, capH());
    state.placed = state.placed.filter(
      (p) => p.x + p.w <= state.gridW && p.y + p.hh <= rows());
  }

  /* Tabletop stacks grow upward from the surface, so the grid height is
     automatic: tallest stack + headroom for the selected size. Units are
     bottom-anchored — shift them when the grid grows or shrinks. */
  function syncTabletopGrid() {
    if (state.mount !== "tabletop") return;
    const selH = state.selected ? state.selected.h : 1;
    const used = state.placed.length
      ? (rows() - Math.min(...state.placed.map((p) => p.y))) / 2
      : 0;
    const target = Math.max(1, Math.min(GRID_LIMITS.hMax, Math.ceil(used) + selH));
    if (target !== state.gridH) {
      const delta = (target - state.gridH) * 2;
      state.gridH = target;
      state.placed.forEach((p) => { p.y += delta; });
    }
  }

  /* ------------------------- Step 1 & 2: cards ------------------------- */

  /* "needs bought hardware" marker. A single-colour inline SVG rather than an
     emoji so it reads like the club ✦ at 15px and inherits currentColor (emoji
     render multi-colour and muddy at that size — Joey).
     The head is drawn as a true C-RING (outer arc → step in → inner arc back),
     NOT as a circle with a notch subtracted: a notch rectangle has to overhang
     the circle to leave the jaw open, and the overhanging part is a lone
     counter-clockwise region — still winding −1, so nonzero fills it and you
     get a stray square floating off the head (Joey spotted it). Ring + shaft
     are wound clockwise so they union seamlessly; only the handle hole, which
     sits fully inside the shaft, is counter-clockwise so it punches through. */
  const HW_PATH =
    "M14.02 2.87A4.6 4.6 0 1 1 9.98 2.87L10.95 4.84A2.4 2.4 0 1 0 13.05 4.84Z" + // C-ring jaw (CW)
    "M10.1 9.5L13.9 9.5L13.9 17.1A1.9 1.9 0 0 1 10.1 17.1Z" +                    // shaft (CW)
    "M10.65 17.2a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0Z";                 // hole (CCW)
  const HW_ICON = (title) =>
    // viewBox = the artwork's ROTATED bounds, not 0 0 24 24 — drawn upright then
    // turned −45°, the wrench spans only ~13.6 of 24 units inside a square box
    // and renders ~40% smaller than its container implies.
    `<span class="needs-hw" title="${title}"><svg viewBox="3.5 3.5 14.4 14.4" aria-hidden="true">` +
    `<g transform="rotate(-45 12 12)"><path d="${HW_PATH}"/></g></svg></span>`;

  /* THE ONE SETTER for the mount (2026-08-23, Joey). Switching mounts moves
     the whole layout, as a rigid group, to the new mount's anchor edge: a
     tabletop build grows UP from the surface, so the layout's lowest edge
     sits on the bottom row; under-table and wall builds hang DOWN from
     theirs, so the highest edge sits on the top row. Before this, every
     unit kept its absolute row, so a valid tabletop layout became a hanging
     one with an empty row ABOVE it (unsupported, Fix structure, or move
     every unit by hand) and switching back left an empty row BELOW. A pure
     vertical translation: x, w, hh, fill, closure, label, ids and order are
     untouched, so a genuine internal support gap stays exactly as invalid as
     it was - Fix structure is for those, never for boundary space a mount
     switch introduced. Under-table <-> wall are both top-anchored, so a flush
     layout does not move. Atomic by construction: the caller's refresh()
     snapshots mount + rows as ONE undo entry, one share link, one auto-save
     and one viewer post (the viewer reloads on a mount change and reads the
     rebased rows from the same hash). Restores (applyBuild) never come
     through here - a snapshot carries its own rows. */
  function setMount(id) {
    const prev = state.mount;
    state.mount = id;
    if (prev !== id) rebaseToMountEdge();
    enforceMountLength(); // e.g. switching to Tabletop with 59 chosen
  }

  /* Shift every unit by ONE delta so the layout touches the current mount's
     anchor edge. Returns the delta in half-rows (0 = nothing moved). Never
     pushes anything off the board: the layout already fits the grid, and
     the shift only closes the gap between it and an edge. */
  function rebaseToMountEdge() {
    if (!state.placed.length) return 0;
    const top = Math.min(...state.placed.map((p) => p.y));
    const bottom = Math.max(...state.placed.map((p) => p.y + p.hh));
    const delta = state.mount === "tabletop" ? rows() - bottom : 0 - top;   // 0 - top, not -top: a flush layout must report 0, never -0
    if (delta) state.placed.forEach((p) => { p.y += delta; });
    return delta;
  }

  function renderMountCards() {
    const wrap = $("#mount-cards");
    wrap.innerHTML = "";
    GEN2.mounts.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card" + (m.img ? " has-img" : "") + (state.mount === m.id ? " active" : "");
      // Optional hero photo fades in from the dark card (left) → image (right).
      if (m.img) {
        btn.style.backgroundImage =
          `linear-gradient(to right, var(--panel) 0%, var(--panel) 55%, var(--card-fade-45) 80%, var(--card-fade-0) 100%), url("${m.img}")`;
      }
      // Wall + Under-Table fix to the building with wood screws; Tabletop just
      // stands on its feet. Same corner marker the faceplate cards use, so
      // "will I need to order anything?" is answerable from question 1.
      const needsScrews = m.id === "wall" || m.id === "under-table";
      btn.innerHTML =
        `<div class="card-icon">${mountIcon(m.id)}</div>` +
        (needsScrews ? HW_ICON("Needs wood screws to fix it to the wall / surface") : "") +
        `<div class="card-title">${m.label}</div>` +
        `<div class="card-blurb">${m.blurb}</div>`;
      btn.addEventListener("click", () => {
        const wasReady = state.mount && state.length;
        setMount(m.id);       // + the layout rebase, one change with the mount
        track("mount:" + m.id);
        renderMountCards();
        refresh();
        // Same courtesy the length cards do: move the page on. On a phone the
        // next step sits entirely below the fold, so picking a mount used to
        // look like nothing happened — a dead end at the FIRST interaction.
        advanceTo(!wasReady && state.length ? "#step-layout" : "#step-printer");
      });
      wrap.appendChild(btn);
    });
  }

  /* Scroll a later step into view after a choice, but ONLY when it isn't
     already on screen — on a desktop the next step is usually visible and
     yanking the page would be worse than doing nothing. Smooth, and never
     fatal if the browser lacks scrollIntoView options. */
  function advanceTo(sel) {
    const target = $(sel);
    if (!target || typeof target.scrollIntoView !== "function") return;
    const r = target.getBoundingClientRect();
    const visibleEnough = r.top >= 0 && r.top < innerHeight * 0.7;
    if (visibleEnough) return;
    try { target.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* noop */ }
  }

  function renderLengthCards() {
    const wrap = $("#length-cards");
    wrap.innerHTML = "";
    GEN2.lengths.forEach((l) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const fits = lengthFits(l.id);
      const noTT = state.mount === "tabletop" && !!l.noTabletop; // catalog rule, e.g. 59
      const ok = fits && !noTT;
      // Viewer capability, not a catalog rule: the card stays clickable (the
      // build is fully plannable & printable) — only the 3D Build Studio lacks
      // under-table rail models for this length, and the badge says so up-front
      // instead of leaving a mysteriously greyed button at the page bottom.
      const no3d = ok && state.mount === "under-table" && !VIEWER_UT_LENGTHS.includes(l.id);
      btn.className = "card slim len-card" + (state.length === l.id ? " active" : "") + (ok ? "" : " disabled");
      btn.style.setProperty("--len-color", l.color);
      btn.innerHTML =
        `<div class="card-title"><span class="len-num">${l.label}</span><span class="mm">mm</span>` +
        (l.recommended ? `<span class="badge">recommended</span>` : "") +
        (!fits ? `<span class="badge nofit">won't fit</span>`
               : noTT ? `<span class="badge nomount">no tabletop</span>`
               : no3d ? `<span class="badge no3d">no 3D guide yet</span>` : "") +
        `</div>` +
        `<div class="card-blurb">${l.tagline}</div>`;
      if (no3d) {
        btn.classList.add("tipped"); // enables the data-tip tooltip on a non-disabled card
        btn.dataset.tip = `The 3D Build Studio can't show under-table ${l.id} builds yet (no rail models in its part library) · you can still plan & print — or pick 165/185 for the full 3D guide.`;
      }
      if (ok) {
        btn.addEventListener("click", () => {
          const wasReady = state.mount && state.length;
          state.length = l.id;
          track("length:" + l.id);
          ensureValidSelection();
          renderLengthCards();
          refresh();
          // first time the layout unlocks, bring it into view
          if (!wasReady && state.mount) advanceTo("#step-layout");
        });
      } else {
        // data-tip (not title): reveals the reason on hover AND on focus, so a
        // tap on touch devices shows it too (native title= is hover-only).
        // Bed fit is the harder blocker, so it wins the tip when both apply.
        btn.setAttribute("aria-disabled", "true");
        if (!fits) {
          const bed = bedSize();
          btn.dataset.tip = `Even a 1W case (${GEN2.units.widthMM}×${l.id}mm) won't fit your ${bed.x}×${bed.y}mm bed`;
        } else {
          btn.dataset.tip = l.noTabletop;
        }
      }
      wrap.appendChild(btn);
    });
  }

  function mountIcon(id) {
    if (id === "under-table") {
      return `<svg viewBox="0 0 96 64"><rect x="6" y="8" width="84" height="8" rx="2" class="i-wood"/>
        <rect x="10" y="16" width="10" height="40" class="i-wood"/><rect x="76" y="16" width="10" height="40" class="i-wood"/>
        <rect x="28" y="18" width="40" height="18" rx="2" class="i-drawer"/><rect x="42" y="24" width="12" height="3" rx="1.5" class="i-handle"/></svg>`;
    }
    if (id === "tabletop") {
      return `<svg viewBox="0 0 96 64"><rect x="6" y="52" width="84" height="6" rx="2" class="i-wood"/>
        <rect x="26" y="14" width="44" height="38" rx="3" class="i-drawer"/>
        <rect x="26" y="10" width="44" height="6" rx="2" class="i-accent"/>
        <rect x="34" y="28" width="28" height="3" rx="1.5" class="i-handle"/><rect x="34" y="42" width="28" height="3" rx="1.5" class="i-handle"/></svg>`;
    }
    return `<svg viewBox="0 0 96 64"><rect x="6" y="4" width="8" height="56" class="i-wood"/>
      <rect x="20" y="10" width="6" height="44" class="i-accent"/>
      <rect x="26" y="14" width="44" height="36" rx="3" class="i-drawer"/>
      <rect x="38" y="30" width="20" height="3" rx="1.5" class="i-handle"/></svg>`;
  }

  /* ---------------------- Step 3: space & printer ---------------------- */

  function renderSpaceStep() {
    const m = mountDef();
    const box = $("#space-inputs");
    box.hidden = !(m && m.askSpace);
    if (m && m.askSpace) {
      $("#space-hint").textContent = m.spaceHint;
      const parts = [];
      if (state.spaceW) {
        const n = Math.floor(state.spaceW / GEN2.units.widthMM);
        parts.push(n < 1
          ? `${state.spaceW}mm is narrower than 1W (${GEN2.units.widthMM}mm) · nothing fits`
          : `${state.spaceW}mm wide → up to ${n}W (${n * GEN2.units.widthMM}mm used, ${state.spaceW - n * GEN2.units.widthMM}mm spare)`);
      }
      if (state.spaceH) {
        const n = Math.floor(state.spaceH / GEN2.units.heightMM);
        parts.push(n < 1
          ? `${state.spaceH}mm is shorter than 1H (${GEN2.units.heightMM}mm)`
          : `${state.spaceH}mm tall → up to ${n}H (${n * GEN2.units.heightMM}mm used)`);
      }
      $("#space-readout").textContent = parts.join(" · ");
      $("#space-summary-status").textContent = (state.spaceW || state.spaceH)
        ? `${state.spaceW || "·"} × ${state.spaceH || "·"} mm`
        : "optional · caps the grid to your space";
      renderSpaceGraphic();
    }

    const tip = $("#explainer-tip");
    if (tip) tip.textContent = (m && m.planTip) || "";

    $("#custom-bed").hidden = state.printer !== "custom";
    const bed = bedSize();
    if (!bed) {
      $("#printer-readout").textContent = "";
    } else if (state.length) {
      $("#printer-readout").textContent =
        `Bed ${bed.x}×${bed.y}mm · max case width for ${state.length}: ` +
        `${[...GEN2.drawerWidths].reverse().find((w) => caseFits(w)) || "none"}W · ` +
        `max rail section: ${maxRailW()}W`;
    } else {
      $("#printer-readout").textContent = `Bed ${bed.x}×${bed.y}mm`;
    }
  }

  /* Little to-scale sketch of the workable area: outer rect = the measured
     space, accent cells = the 1W×1H grid that fits inside it. */
  function renderSpaceGraphic() {
    const box = $("#space-graphic");
    const real = !!(state.spaceW || state.spaceH);
    const w = state.spaceW || 480;
    const h = state.spaceH || 168;
    const scale = Math.min(190 / w, 96 / h);
    const pw = w * scale, ph = h * scale;
    const cols = Math.floor(w / GEN2.units.widthMM);
    const rws = Math.floor(h / GEN2.units.heightMM);
    const cw = GEN2.units.widthMM * scale, chh = GEN2.units.heightMM * scale;

    let cells = "";
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rws; r++)
        cells += `<rect x="${8 + c * cw + 1}" y="${8 + r * chh + 1}" width="${cw - 2}" height="${chh - 2}" rx="2" class="sg-cell"/>`;

    box.innerHTML = `<svg viewBox="0 0 ${pw + 60} ${ph + 38}" class="sg ${real ? "" : "ghost"}">
      <rect x="8" y="8" width="${pw}" height="${ph}" rx="3" class="sg-area"/>
      ${cells}
      <line x1="8" y1="${ph + 20}" x2="${8 + pw}" y2="${ph + 20}" class="sg-dim"/>
      <text x="${8 + pw / 2}" y="${ph + 32}" text-anchor="middle" class="sg-label">${state.spaceW ? state.spaceW + "mm" : "width?"}</text>
      <line x1="${pw + 20}" y1="8" x2="${pw + 20}" y2="${8 + ph}" class="sg-dim"/>
      <text x="${pw + 28}" y="${8 + ph / 2}" class="sg-label">${state.spaceH ? state.spaceH + "mm" : "height?"}</text>
      <text x="8" y="${ph + 32}" class="sg-fit" text-anchor="start"></text>
    </svg>
    <p class="sg-caption">${real
      ? `fits ${state.spaceW ? cols + "W" : "?"} × ${state.spaceH ? rws + "H" : "?"}`
      : "enter your measurements"}</p>`;
  }

  function buildPrinterSelect() {
    const sel = $("#printer-select");
    // brand <optgroup>s: consecutive entries sharing a `group` fold under one
    // heading (the list is 30+ machines since the 2026-08-01 additions — flat,
    // it stopped being scannable). Groupless entries (Any / Custom) stay
    // top-level. The group label carries the brand, so entry labels don't
    // repeat it.
    let holder = sel, curGroup = null;
    GEN2.printers.forEach((p) => {
      if ((p.group || null) !== curGroup) {
        curGroup = p.group || null;
        if (curGroup) {
          holder = document.createElement("optgroup");
          holder.label = curGroup;
          sel.appendChild(holder);
        } else {
          holder = sel;
        }
      }
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label + (p.x ? ` (${p.x}×${p.y}mm)` : "");
      holder.appendChild(opt);
    });
    sel.value = state.printer;
    const onBedChange = () => {
      if (state.length && !lengthFits(state.length)) state.length = null;
      ensureValidSelection();
      refresh();
    };
    sel.addEventListener("change", () => {
      const prevBed = bedSize();
      state.printer = sel.value;
      track("printer:" + state.printer);   // which printers the audience runs
      // switching to Custom carries over the last preset's real dims, so the
      // boxes never show misleading example numbers next to a chosen printer
      if (state.printer === "custom" && prevBed && !(state.customBed.x && state.customBed.y)) {
        state.customBed = { x: prevBed.x, y: prevBed.y };
        $("#bed-x").value = prevBed.x;
        $("#bed-y").value = prevBed.y;
      }
      onBedChange();
    });
    ["bed-x", "bed-y"].forEach((id, i) => {
      $("#" + id).addEventListener("input", (e) => {
        state.customBed[i === 0 ? "x" : "y"] = parseInt(e.target.value, 10) || null;
        onBedChange();
      });
    });
    $("#space-w").addEventListener("input", (e) => {
      state.spaceW = parseInt(e.target.value, 10) || null;
      if (state.spaceW) state.gridW = capW();
      clampGrid();
      refresh();
    });
    $("#space-h").addEventListener("input", (e) => {
      state.spaceH = parseInt(e.target.value, 10) || null;
      if (state.spaceH) state.gridH = capH();
      clampGrid();
      refresh();
    });
  }

  /* --------------------------- Palette --------------------------- */

  /* Front-view icons matching the board art, so the fill choice reads
     visually before the labels do. */
  function fillIcon(id) {
    const frame = `<rect x="2" y="2" width="60" height="40" rx="5" class="fi-case"/>`;
    if (id === "classic") {
      // mirrors the board's classic front view: flat face + bottom handle scoop
      // (full-width chamfer → recessed wall band, triangles at the corners)
      return `<svg viewBox="0 0 64 44">${frame}
        <rect x="7" y="7" width="50" height="30" rx="3" class="fi-face"/>
        <polygon points="7,23 57,23 47,33 17,33" class="fi-lip"/>
        <rect x="17" y="33" width="30" height="4" class="fi-wall"/>
        <line x1="17" y1="33" x2="47" y2="33" class="fi-line"/></svg>`;
    }
    if (id === "decor") {
      // mirrors the board's decor front view: inset rails + recessed centre
      // panel (chamfered bottom corners) over a body-coloured face
      return `<svg viewBox="0 0 64 44">${frame}
        <rect x="7" y="7" width="50" height="30" rx="3" class="fi-face"/>
        <polygon points="14,8 50,8 50,31 47,34 17,34 14,31" class="fi-dark"/>
        <rect x="9" y="9" width="4" height="26" rx="1" class="fi-rail"/>
        <rect x="51" y="9" width="4" height="26" rx="1" class="fi-rail"/></svg>`;
    }
    if (id === "shelf") {
      return `<svg viewBox="0 0 64 44">${frame}
        <rect x="7" y="7" width="50" height="30" rx="3" class="fi-dark"/>
        <line x1="9" y1="34" x2="55" y2="34" class="fi-line"/>
        <rect x="14" y="24" width="10" height="10" rx="1" class="fi-item"/>
        <rect x="28" y="19" width="8" height="15" rx="1" class="fi-item"/></svg>`;
    }
    return `<svg viewBox="0 0 64 44">${frame}
      <rect x="7" y="7" width="50" height="30" rx="3" class="fi-door"/>
      <circle cx="48" cy="22" r="3" class="fi-knob"/>
      <rect x="5" y="10" width="4" height="8" rx="1" class="fi-hinge"/>
      <rect x="5" y="26" width="4" height="8" rx="1" class="fi-hinge"/></svg>`;
  }

  /* Hover preview for a fill tile. The render should depict the CHOSEN length —
     a 185 drawer on a 165 build reads as the wrong product (depth is visible in
     the 3/4 view). Use the current length's 1W-1H render when one is wired in
     IMAGE_OVERRIDES; otherwise keep the fill's default (185) preview so lengths
     without render batches yet never show a broken image. */
  function fillPreviewFor(f) {
    if (!f.previewImg) return null;
    if (state.length) {
      const name = GEN2.partNames.drawer(state.length, "1W-1H", f.label);
      if (IMAGE_OVERRIDES[name]) return IMAGE_OVERRIDES[name];
    }
    return f.previewImg;
  }

  function renderFillSeg() {
    const seg = $("#fill-seg");
    seg.innerHTML = "";
    GEN2.fills.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fill-tile" + (state.fill === f.id ? " active" : "");
      const preview = fillPreviewFor(f);
      const card =
        `<span class="tip-card" role="tooltip">` +
        (preview
          ? `<img class="tip-card-img" src="${preview}" alt="${f.label}" loading="lazy" />`
          : "") +
        `<span class="tip-card-text"><b>${f.label}</b>${f.blurb}</span>` +
        `</span>`;
      btn.innerHTML =
        `<span class="fill-icon">${fillIcon(f.id)}</span>` +
        `<span class="fill-label">${f.label}${f.soon ? ' <span class="soon">soon</span>' : ""}</span>` +
        card;
      btn.addEventListener("click", () => {
        state.fill = f.id;
        track("fill:" + f.id);
        ensureValidSelection();
        refresh();
      });
      seg.appendChild(btn);
    });
    $("#fill-blurb").textContent = fillDef().blurb;
    renderFillBridge();
  }

  // GEN2 Club — a monthly membership (on BOTH Printables and Thangs) that includes
  // the Club faceplate files, which are also sold as one-time purchases. It funds
  // the project, so the planner gently promotes joining on either platform.
  const CLUB_URL_PRINTABLES = "https://www.printables.com/@Jerrari#join.@Jerrari.893";
  const CLUB_URL_THANGS = "https://thangs.com/designer/Jerrari/memberships";

  // Faceplate style picker: grouped selectable cards (Core System vs Club
  // Expansions) rather than a flat segment, so the Club styles read as optional
  // add-ons/expansions. Every option stays fully selectable — nothing is locked.
  function renderFaceplateCards() {
    const wrap = $("#faceplate-style-cards");
    if (!wrap) return;
    wrap.innerHTML = "";
    const groupEl = (title, styles, isClub) => {
      const g = document.createElement("div");
      g.className = "fp-group" + (isClub ? " fp-group-club" : "");
      const head = document.createElement("div");
      head.className = "fp-group-title";
      head.textContent = title;
      g.appendChild(head);
      const row = document.createElement("div");
      row.className = "fp-row";
      styles.forEach((s) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "fp-card" + (isClub ? " club" : "") + (s.img ? " has-img" : "") + (s.id === state.faceStyle ? " active" : "");
        card.setAttribute("aria-pressed", s.id === state.faceStyle ? "true" : "false");
        // A cropped hero fades in from the dark card on the left → photo on the right.
        if (s.img) {
          card.style.backgroundImage =
            `linear-gradient(to right, var(--panel-2) 0%, var(--panel-2) 38%, var(--card-fade-40) 72%, var(--card-fade-0) 100%), url("${s.img}")`;
        }
        // 🔩 = this style's handle BOLTS ON, so choosing it means ordering M3
        // screws before the build can be finished. Integrated-grip styles print
        // complete. Absolutely positioned (see .needs-hw) so it costs no layout
        // — the point is to see, while flipping styles, which ones you can
        // build today (Joey 2026-07-24).
        card.innerHTML =
          (isClub ? '<span class="fp-spark" aria-hidden="true">✦</span>' : "") +
          (s.integratedHandle ? "" : HW_ICON("Bolt-on handle — needs 2× M3×6 screws per drawer")) +
          `<span class="fp-name">${s.label}</span>` +
          (s.sub ? `<span class="fp-sub">${s.sub}</span>` : "") +
          // Rich hover preview (reuses the fill-tile .tip-card component): full image + info.
          (s.img ? `<span class="tip-card" role="tooltip">` +
            `<img class="tip-card-img" src="${s.img}" alt="${s.label}" loading="lazy" onerror="this.style.display='none'" />` +
            `<span class="tip-card-text"><b>${s.label}</b>${s.blurb || s.sub || ""}</span></span>` : "");
        card.addEventListener("click", () => { state.faceStyle = s.id; track("faceplate:" + s.id); refresh(); });
        row.appendChild(card);
      });
      g.appendChild(row);
      return g;
    };
    wrap.appendChild(groupEl("Core System", GEN2.faceplateStyles.filter((s) => !s.club), false));
    wrap.appendChild(groupEl("Club Expansions", GEN2.faceplateStyles.filter((s) => s.club), true));
    // Faceplate back cover — a universal decor-faceplate accessory (every style
    // seats the same per-size part): fills the open-front Decor drawer's gap
    // behind the plate. Off = backwards-compatible with closed-front drawers.
    const bc = document.createElement("div");
    bc.className = "wall-opt fp-backcover";
    bc.innerHTML =
      '<span class="wall-opt-label">Faceplate back cover</span>' +
      '<div class="seg" role="group" aria-label="Faceplate back cover">' +
      `<button type="button" data-backcover="off"${state.backCover ? "" : ' class="active"'}>Off</button>` +
      `<button type="button" data-backcover="on"${state.backCover ? ' class="active"' : ""}>On</button>` +
      "</div>" +
      '<span class="wall-opt-hint">Closes the open-front Decor drawer behind the plate · works with every faceplate style.</span>';
    bc.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      state.backCover = b.dataset.backcover === "on";
      track("backcover:" + (state.backCover ? "on" : "off"));
      refresh();
    }));
    wrap.appendChild(bc);
    updateClubNote();
  }

  // Handle cards (2026-07-19, Joey): the old 3-button seg gave no idea what
  // each series LOOKS like — mirror the faceplate cards (hero image + sub +
  // rich hover preview). BlockBar is a FAMILY: the exact A–F pick stays in
  // the 3D studio, on the handle itself; Crystal ships links/BOM only until
  // its GLB lands (the viewer stands in Deco + warns). Adding a future series
  // = one entry in GEN2.handleStyles (+ a render named on the partImage
  // scheme) — the card, BOM link and sync all follow.
  function renderHandleCards() {
    const wrap = $("#handle-style-cards");
    if (!wrap) return;
    wrap.innerHTML = "";
    GEN2.handleStyles.forEach((s) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "fp-card" + (s.img ? " has-img" : "") + (s.id === state.handleStyle ? " active" : "");
      card.setAttribute("aria-pressed", s.id === state.handleStyle ? "true" : "false");
      if (s.img) {
        card.style.backgroundImage =
          `linear-gradient(to right, var(--panel-2) 0%, var(--panel-2) 38%, rgba(44,45,49,0.4) 72%, rgba(44,45,49,0) 100%), url("${s.img}")`;
      }
      card.innerHTML =
        `<span class="fp-name">${s.label}</span>` +
        (s.sub ? `<span class="fp-sub">${s.sub}</span>` : "") +
        (s.img ? `<span class="tip-card" role="tooltip">` +
          `<img class="tip-card-img" src="${s.img}" alt="${s.label}" loading="lazy" onerror="this.style.display='none'" />` +
          `<span class="tip-card-text"><b>${s.label}</b>${s.blurb || s.sub || ""}</span></span>` : "");
      card.addEventListener("click", () => { state.handleStyle = s.id; track("handle:" + s.id); refresh(); });
      wrap.appendChild(card);
    });
  }

  // Friendly, non-blocking notice when a Club faceplate is selected: informs the
  // user their list now includes Club files, and invites them to join the Club.
  function updateClubNote() {
    const note = $("#club-note");
    if (!note) return;
    const def = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
    if (def && def.club) {
      note.innerHTML =
        `<strong>${def.label} is included with the GEN2 Club</strong> · or buy it once on Printables or Thangs. ` +
        "Your parts list now lists the matching faceplate files. " +
        "Join the Club to support GEN2 · " +
        `<a href="${CLUB_URL_PRINTABLES}" target="_blank" rel="noopener">on Printables</a> or ` +
        `<a href="${CLUB_URL_THANGS}" target="_blank" rel="noopener">on Thangs</a>.`;
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  function renderStyleSegs() {
    const build = (segId, styles, current, onPick) => {
      const seg = $(segId);
      seg.innerHTML = "";
      styles.forEach((s) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = s.id === current ? "active" : "";
        btn.textContent = s.label;
        btn.addEventListener("click", () => { onPick(s.id); refresh(); });
        seg.appendChild(btn);
      });
    };
    renderFaceplateCards();
    build("#door-style-seg", GEN2.doorStyles, state.doorStyle, (id) => { state.doorStyle = id; });
    renderHandleCards();
    renderHardwareMasters();
    renderDrawerTypeMaster();
    const hasDecor = state.placed.some((p) => p.fill === "decor");
    const faceDef = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
    $("#faceplate-style-pick").hidden = !hasDecor;
    $("#door-style-pick").hidden = !state.placed.some((p) => p.fill === "cabinet");
    // Handles only apply to Decor drawers whose faceplate has no built-in handle
    // (EdgeLabel / Classic Pro include one) — so mirror the BOM handle-row rule.
    // The picker nests under the faceplate cards, so it reads as a follow-up to
    // that choice; more handled faceplates will arrive, keeping this dynamic.
    $("#handle-style-pick").hidden = !(hasDecor && faceDef && !faceDef.integratedHandle);
    $("#hardware-pick").hidden = !state.placed.some((p) => p.fill === "decor" || p.fill === "classic");
    $("#drawer-type-pick").hidden = !state.placed.some(isDrawerUnit);
    // Hide the whole Customize step when no pick applies, so it doesn't render
    // as an empty highlighted box between the board and the parts list.
    const styleRow = document.querySelector(".bom-style-row");
    const nothingToCustomize = $("#faceplate-style-pick").hidden && $("#door-style-pick").hidden && $("#hardware-pick").hidden && $("#drawer-type-pick").hidden;
    if (styleRow) styleRow.hidden = nothingToCustomize;
    if (nothingToCustomize) $("#step-customize").hidden = true;
    updateLabelGenLink();
    // "▶ Watch" chips for videos tied to the chosen faceplate style (e.g. the
    // EdgeLabel assembly video) — they live next to the label-generator link,
    // the style's home in the UI.
    const fpv = $("#faceplate-video");
    if (fpv) {
      const vids = GEN2.videos.filter((v) => v.faceStyles && v.faceStyles.includes(state.faceStyle));
      fpv.hidden = !vids.length;
      fpv.innerHTML = vids.map(videoChipHtml).join("");
    }
  }

  /* Master drawer-hardware toggles (Customize step): set every drawer's
     closure / stopper state in one click — the same bulk controls the 3D
     viewer's Build options offers, so the two stay in sync through the normal
     options round-trip. A button lights up only when EVERY drawer already
     matches it (a mixed build lights nothing — clicking unifies it). The
     per-drawer picker in the unit toolbar stays the fine-tune path. */
  function renderHardwareMasters() {
    const drawers = state.placed.filter((p) => p.fill === "decor" || p.fill === "classic");
    // closures: same option set as the per-unit picker (soon = disabled + tip)
    const cseg = $("#closure-master-seg");
    if (cseg) {
      cseg.innerHTML = "";
      GEN2.closures.forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = c.label;
        const uniform = drawers.length && drawers.every((p) => (p.closure || "none") === c.id);
        btn.className = uniform ? "active" : "";
        if (c.soon) {
          btn.disabled = true;
          btn.dataset.tip = c.tip || "Coming soon";
        } else {
          if (c.tip) btn.dataset.tip = c.tip;
          btn.addEventListener("click", () => {
            // Data-driven off GEN2.closures, so this measures whatever the list
            // holds — push-click starts being counted the day its `soon` flag
            // comes off, with no analytics change needed then.
            track("closure:" + c.id);
            drawers.forEach((p) => { if (c.id === "none") delete p.closure; else p.closure = c.id; });
            refresh();
          });
        }
        cseg.appendChild(btn);
      });
    }
    // stoppers: All / None over every drawer's per-1W pair keys ("<id>:<col>",
    // the exact keys the viewer's removedStoppers protocol uses)
    const sseg = $("#stopper-master-seg");
    if (sseg) {
      sseg.innerHTML = "";
      const allKeys = drawers.flatMap((p) => Array.from({ length: p.w }, (_, c) => `${p.id}:${c}`));
      const removed = new Set(state.removedStoppers || []);
      [
        { label: "All", active: allKeys.length && !allKeys.some((k) => removed.has(k)),
          apply: () => { state.removedStoppers = []; } },
        { label: "None", active: allKeys.length && allKeys.every((k) => removed.has(k)),
          apply: () => { state.removedStoppers = allKeys; } },
      ].forEach((o) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = o.label;
        btn.className = o.active ? "active" : "";
        btn.addEventListener("click", () => { o.apply(); refresh(); });
        sseg.appendChild(btn);
      });
    }
  }

  /* ---- Drawer family conversion: Classic Drawer <-> Decor Drawer (2026-08-23) ----
     Both drawer families seat in the same cases, so a placed drawer can change
     family IN PLACE: only `fill` moves - id, position, size, label, closure
     and the viewer's stopper keys all stay. Until now the only path was
     remove + re-place (a friend of Joey's rebuilt a large layout for it),
     while the explainer promised "swap them anytime". THREE surfaces, ONE
     plan/apply pair, so counts, skips and the outcome line can never
     disagree: the selected-unit toolbar (one drawer), the Customize master
     (every drawer - the hardware masters' pattern) and the palette bridge
     (the moment of intent: the other family's tile was just picked while this
     family sits on the grid). Hard-coded to the two drawer fills: shelf and
     cabinet are not drawers and carry their own state.
     Naming rule (Joey): the buttons say "Classic Drawer" / "Decor Drawer" in
     full - a bare "Classic" one step above the Classic FACEPLATE cards is the
     confusion this feature must not add. The faceplate stays a BUILD-WIDE
     choice; the inspector says so in the Customize heading's own words. */
  const DRAWER_FILLS = ["classic", "decor"];
  const isDrawerUnit = (p) => DRAWER_FILLS.includes(p.fill);
  const otherDrawerFill = (f) => (f === "classic" ? "decor" : "classic");
  const plural = (n, one, many) => (n === 1 ? one : many);

  // Why `p` can't become `to` (null = it can). Catalog first, printer second:
  // sizeExists is the lineup (the armed classic-only height cap included),
  // fitProblem the bed - the Classic handle adds depth, so a wide Classic can
  // fail a bed its Decor twin fits. Placement gates on exactly these two, so a
  // conversion can never produce a drawer the palette would have greyed out.
  function convertProblem(p, to) {
    const h = p.hh / 2;
    if (!sizeExists(p.w, h, to)) return `${sizeToken(p.w, h)} ${fillDef(to).label} isn't in the ${state.length} lineup`;
    return fitProblem(p.w, to);
  }

  /* Plan a conversion to `to` of `units` (default: every drawer of the other
     family): who can change, who can't, and why - reasons grouped with counts
     so a surface can say "2 stay Classic Drawers: won't fit your bed" without
     prose per unit. Pure: nothing moves until applyConversion. */
  function planConversion(to, units) {
    const plan = { to, eligible: [], skipped: [], reasons: [] };
    const why = new Map();
    (units || state.placed.filter((p) => isDrawerUnit(p) && p.fill !== to)).forEach((p) => {
      if (!isDrawerUnit(p) || p.fill === to) return;
      const problem = convertProblem(p, to);
      if (problem) { plan.skipped.push(p); why.set(problem, (why.get(problem) || 0) + 1); }
      else plan.eligible.push(p);
    });
    plan.reasons = [...why.entries()].map(([text, n]) => ({ text, n }));
    return plan;
  }

  /* Apply a plan as ONE undo step. The flush BEFORE matters: history coalesces
     for 350 ms and a label commits only on change, so without it a label typed
     moments earlier would ride inside the conversion's entry and Undo would
     delete it too. The flush AFTER lands the entry (and the auto-save) now,
     not after the idle window. `surface` is the control's fixed id for
     analytics - never a count or a reason. Returns how many changed. */
  let convertOutcome = null;   // the last BULK conversion's result, shown until the layout changes again
  function applyConversion(plan, surface) {
    if (!plan || !plan.eligible.length) return 0;
    pushHistoryNow();
    plan.eligible.forEach((p) => { p.fill = plan.to; });
    convertOutcome = null;               // a stale outcome must not render mid-refresh
    refresh();
    // a single drawer's switch needs no report - its seg re-lights and the
    // inspector title changes under the pointer; the bulk surfaces report
    // because the change happened somewhere else on the page. The signature
    // is taken AFTER refresh: refresh-time normalisation (syncTabletopGrid
    // can rebase every p.y) would otherwise change it immediately and the
    // outcome would never show.
    if (surface !== "unit") {
      convertOutcome = { to: plan.to, n: plan.eligible.length, skipped: plan.skipped.length, reasons: plan.reasons, sig: layoutSig() };
      renderFillBridge();
      renderDrawerTypeMaster();
    }
    pushHistoryNow();
    track(surface === "unit" ? "convert:" + plan.to : "convert-all:" + plan.to + ":" + surface);
    return plan.eligible.length;
  }
  const convertOutcomeCurrent = () => (convertOutcome && convertOutcome.sig === layoutSig() ? convertOutcome : null);
  // The outcome line both bulk surfaces show (role=status): what changed,
  // what didn't and why, and the way back.
  function convertOutcomeText(o) {
    const to = fillDef(o.to).label, from = fillDef(otherDrawerFill(o.to)).label;
    let t = `✓ ${o.n} ${plural(o.n, "drawer", "drawers")} converted to ${to}${plural(o.n, "", "s")}`;
    if (o.skipped) t += ` · ${o.skipped} ${plural(o.skipped, "stays", "stay")} ${from}${plural(o.skipped, "", "s")}: ${o.reasons.map((r) => r.text).join("; ")}`;
    return t + ` · Undo restores ${plural(o.n, "it", "them")}.`;
  }
  // "1 stays Decor Drawer: <reason>" / "3 stay Decor Drawers: 2 × <reason>; <reason>"
  const skipText = (plan) => {
    const n = plan.skipped.length;
    return `${n} ${plural(n, "stays", "stay")} ${fillDef(otherDrawerFill(plan.to)).label}${plural(n, "", "s")}: ` +
      plan.reasons.map((r) => (r.n > 1 ? `${r.n} × ${r.text}` : r.text)).join("; ");
  };
  function renderConvertOutcome(el) {
    if (!el) return;
    const o = convertOutcomeCurrent();
    el.hidden = !o;
    el.textContent = o ? convertOutcomeText(o) : "";
  }

  /* The Customize master for drawer family - the hardware masters' pattern:
     sets every drawer at once, lights only when EVERY drawer already matches
     (a mixed build lights nothing), and the toolbar seg is the fine-tune. A
     button that can convert nothing (every other-family drawer is blocked) is
     inert with the reason; a partial plan warns in its tip and converts what
     it can. Decor first reveals the faceplate cards right below it. */
  function renderDrawerTypeMaster() {
    const seg = $("#drawer-type-seg");
    if (!seg) return;
    seg.innerHTML = "";
    const drawers = state.placed.filter(isDrawerUnit);
    DRAWER_FILLS.forEach((id) => {
      const f = fillDef(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = f.label;
      btn.title = f.blurb;
      const uniform = drawers.length > 0 && drawers.every((p) => p.fill === id);
      const plan = planConversion(id);
      if (uniform) {
        btn.className = "active";
      } else if (!plan.eligible.length) {
        btn.classList.add("disabled");
        btn.setAttribute("aria-disabled", "true");
        if (plan.skipped.length) btn.dataset.tip = skipText(plan);
      } else if (plan.skipped.length) {
        // a partial switch: enabled, but says up front who stays and why
        btn.classList.add("tipped");
        btn.dataset.tip = skipText(plan);
      }
      btn.addEventListener("click", () => {
        if (uniform || !plan.eligible.length) return;
        applyConversion(plan, "customize");
      });
      seg.appendChild(btn);
    });
    // the computed preview of a partial switch, readable without hovering:
    // "Switching to Classic Drawers: 1 stays Decor Drawer: <reason>"
    const note = $("#drawer-type-note");
    if (note) {
      const lines = DRAWER_FILLS.map((id) => planConversion(id)).filter((pl) => pl.eligible.length && pl.skipped.length)
        .map((pl) => `Switching to ${fillDef(pl.to).label}s: ${skipText(pl)}.`);
      note.hidden = !lines.length;
      note.textContent = lines.join(" ");
    }
    renderConvertOutcome($("#drawer-type-status"));
  }

  /* The bridge under the fill tiles - the moment of intent. The tiles set the
     family for NEW cases only; when the family just picked differs from
     drawers already on the grid, say so and offer the conversion right here
     (the friend clicked the Decor tile and nothing happened to his build).
     Hidden when nothing differs, except to show the outcome of a conversion
     just made. */
  function renderFillBridge() {
    const box = $("#fill-convert");
    if (!box) return;
    box.innerHTML = "";
    const to = state.fill;
    const outcome = convertOutcomeCurrent();
    const plan = DRAWER_FILLS.includes(to) ? planConversion(to) : null;
    const others = plan ? plan.eligible.length + plan.skipped.length : 0;
    if (!others && !outcome) { box.hidden = true; return; }
    box.hidden = false;
    if (others) {
      const toLabel = fillDef(to).label, from = fillDef(otherDrawerFill(to)).label;
      const p = document.createElement("p");
      p.className = "fill-convert-text";
      p.textContent = `New cases will be ${toLabel}s. The ${others} ${from}${plural(others, "", "s")} already on the grid ${plural(others, "stays as it is", "stay as they are")}.`;
      box.appendChild(p);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost small";
      if (plan.eligible.length) {
        btn.textContent = plan.eligible.length === others
          ? `↻ Convert ${plural(others, "it", "all " + others)} to ${toLabel}${plural(others, "", "s")}`
          : `↻ Convert the ${plan.eligible.length} that can change`;
        btn.addEventListener("click", () => applyConversion(plan, "palette"));
      } else {
        btn.textContent = `Can't convert ${plural(others, "it", "them")}`;
        btn.classList.add("disabled");
        btn.setAttribute("aria-disabled", "true");
      }
      if (plan.skipped.length) btn.dataset.tip = skipText(plan);
      box.appendChild(btn);
      // the reason a drawer stays behind is READABLE, not hover-only (review:
      // the tip CSS did not even cover this button, and touch has no hover)
      if (plan.skipped.length) {
        const skip = document.createElement("p");
        skip.className = "fill-convert-hint fill-convert-skip";
        skip.textContent = skipText(plan) + ".";
        box.appendChild(skip);
      }
      if (plan.eligible.length) {
        const keep = document.createElement("p");
        keep.className = "fill-convert-hint";
        keep.textContent = "Converting keeps every drawer's position, size, label and closure · the parts list follows"
          + (to === "decor" ? " (Decor adds the faceplates and whatever the faceplate style needs)." : " (Classic drops the faceplates and their hardware).");
        box.appendChild(keep);
      }
    }
    if (outcome) {
      const st = document.createElement("p");
      st.className = "fill-convert-status";
      st.setAttribute("role", "status");
      st.textContent = convertOutcomeText(outcome);
      box.appendChild(st);
    }
  }

  /* Label-bearing faceplates (EdgeLabel / Classic Pro) link out to the matching
     label generator, carrying the decor drawers' labels so they pre-fill there
     (read as #labels=<base64 JSON> on the generator side). */
  function updateLabelGenLink() {
    const link = $("#label-gen-link");
    if (!link) return;
    const fdef = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
    if (!fdef || !fdef.labelGen) { link.hidden = true; return; }
    link.hidden = false;
    const labels = state.placed.filter((p) => p.fill === "decor" && p.label).map((p) => p.label);
    // Surface the payload: the user's typed drawer labels ride along and
    // pre-fill the generator — the live count is what makes that visible.
    // Inline SVG tag icon (not an emoji): crisp at 14px, inherits the button's
    // text colour, and renders identically on every platform.
    const tagIco = `<svg class="lg-ico" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor"
      d="M2 2h6l6.3 6.3a1.5 1.5 0 0 1 0 2.1l-3.9 3.9a1.5 1.5 0 0 1-2.1 0L2 8V2z
         M5.2 3.9a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/></svg>`;
    link.innerHTML = `${tagIco} Design your ${fdef.label} labels →` + (labels.length
      ? ` <span class="lg-count">· ${labels.length} label${labels.length > 1 ? "s" : ""} ready</span>`
      : "");
    link.href = fdef.labelGen + (labels.length
      ? "#labels=" + btoa(unescape(encodeURIComponent(JSON.stringify(labels))))
      : "");
  }

  /* Mobile: collapse the chosen setup steps (location / printer / length) into a
     one-line summary once the build is ready, so the design board is reachable
     without scrolling past them. Desktop ignores the collapse (CSS-gated). */
  let stepsAutoCollapsed = false;

  function renderStepSummaries() {
    const printer = GEN2.printers.find((p) => p.id === state.printer);
    const m = mountDef();
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v || ""; };
    set("#mount-pick", m ? m.label : "");
    set("#printer-pick", state.printer === "custom" ? "Custom bed" : (printer ? printer.label : ""));
    set("#length-pick", state.length ? state.length + "mm" : "");
  }

  function syncStepCollapse(ready) {
    if (ready && !stepsAutoCollapsed) {
      document.querySelectorAll(".step.collapsible").forEach((s) => s.classList.add("collapsed"));
      stepsAutoCollapsed = true;
    } else if (!ready && stepsAutoCollapsed) {
      document.querySelectorAll(".step.collapsible").forEach((s) => s.classList.remove("collapsed"));
      stepsAutoCollapsed = false;
    }
  }

  function bindStepCollapse() {
    document.querySelectorAll(".step.collapsible > h2").forEach((h) => {
      h.addEventListener("click", (e) => {
        if (e.target.closest(".info-tip")) return;   // tapping the (i) shouldn't toggle
        h.parentElement.classList.toggle("collapsed");
      });
    });
  }

  function renderPalette() {
    $("#palette-units").textContent =
      `1W = ${GEN2.units.widthMM}mm wide · 1H = ${GEN2.units.heightMM}mm tall`;
    // Live usable-interior readout for the selected drawer size (drawers only).
    const inside = $("#palette-inside");
    if (inside) {
      const isDrawer = state.fill === "classic" || state.fill === "decor";
      if (isDrawer && state.selected && state.length) {
        const d = interiorDims(state.selected.w, state.selected.h, state.length);
        inside.textContent = `${sizeToken(state.selected.w, state.selected.h)} inside: ${d.w} × ${d.h} × ${d.d} mm`;
        inside.hidden = false;
      } else {
        inside.hidden = true;
      }
    }
    const wrap = $("#palette-items");
    wrap.innerHTML = "";
    heightsForFill().forEach((h) => {
      // a height with NO existing size at this length (59 drawers past 1H)
      // drops its whole row — blank-gap rows would just be empty air
      if (!GEN2.drawerWidths.some((w) => sizeExists(w, h))) return;
      const row = document.createElement("div");
      row.className = "palette-row";
      GEN2.drawerWidths.forEach((w) => {
        // Sizes that don't exist in the lineup are rendered as a blank gap so
        // the grid alignment holds without offering a dead, greyed tile.
        if (!sizeExists(w, h)) {
          const blank = document.createElement("span");
          blank.className = "palette-blank";
          row.appendChild(blank);
          return;
        }
        const item = document.createElement("button");
        item.type = "button";
        const ok = selectable(w, h);
        const sel = ok && state.selected && state.selected.w === w && state.selected.h === h;
        item.className = "palette-item" + (sel ? " active" : "") + (ok ? "" : " disabled");
        item.style.setProperty("--pw", w);
        item.style.setProperty("--ph", h);
        item.innerHTML = `<span class="palette-box"></span><span class="palette-label">${sizeToken(w, h)}</span>`;
        if (!ok) {
          const f = fillDef();
          // data-tip (not title) so the "why it won't fit" reason is reachable
          // by tap/focus on touch, not just mouse hover.
          item.setAttribute("aria-disabled", "true");
          item.dataset.tip = fitProblem(w, state.fill) ||
            (f.integerHeightsOnly && !Number.isInteger(h)
              ? `${f.label}s come in whole heights only`
              : `Not available as a ${f.label}`);
        } else {
          item.addEventListener("click", () => {
            state.selected = { w, h };
            growGridForHeight(h);
            refresh();
          });
        }
        row.appendChild(item);
      });
      wrap.appendChild(row);
    });
  }

  /* --------------------------- Board / grid --------------------------- */

  const rows = () => state.gridH * 2; // half-height rows
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function cellAt(px, py) {
    const x = Math.floor((px - PAD.left) / CW);
    const y = Math.floor((py - PAD.top) / (CH / 2));
    return { x, y };
  }

  function occupancy(excludeId) {
    const occ = new Set();
    state.placed.forEach((p) => {
      if (p.id === excludeId) return;
      for (let dx = 0; dx < p.w; dx++)
        for (let dy = 0; dy < p.hh; dy++)
          occ.add((p.x + dx) + "," + (p.y + dy));
    });
    return occ;
  }

  function canPlace(x, y, w, hh, excludeId) {
    if (x < 0 || y < 0 || x + w > state.gridW || y + hh > rows()) return false;
    const occ = occupancy(excludeId);
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < hh; dy++)
        if (occ.has((x + dx) + "," + (y + dy))) return false;
    return true;
  }

  function unitAt(x, y) {
    return state.placed.find((p) =>
      x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.hh);
  }

  /* ---------------- Cabinet interior (advanced) ---------------- */

  /* p.interior, when present, is the cabinet's internal layout: an array of
     compartments {x,y,w,h} in whole 1W/1H units inside the cabinet (x:0..W-1,
     y:0..H-1, y=0 at top). A compartment = 1 floor case + (h-1) same-width
     extenders. ABSENT => the simple p.shelves model (backward compatible). The
     click-to-place editor keeps compartments non-overlapping, so a plain area
     sum is the filled-cell count. */
  function interiorFill(p) {
    if (!Array.isArray(p.interior)) return null;
    const W = p.w, H = p.hh / 2;
    let filled = 0;
    p.interior.forEach((c) => { filled += c.w * c.h; });
    return { W, H, total: W * H, filled, complete: filled === W * H };
  }
  // true for ANY unit without an interior (no interior => no interior problem).
  const interiorComplete = (p) => { const f = interiorFill(p); return f ? f.complete : true; };
  const interiorCellsLeft = (p) => { const f = interiorFill(p); return f ? f.total - f.filled : 0; };

  /* Add a compartment if it fits in-bounds and overlaps nothing. Returns success.
     Pure (no render) so the editor and the tests share one code path. */
  function placeCompartment(p, x, y, w, h) {
    const W = p.w, H = p.hh / 2;
    if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
    for (const c of p.interior)
      if (x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y) return false;
    p.interior.push({ x, y, w, h });
    return true;
  }

  let hover = null; // {x,y} of hovered cell
  let drag = null;  // {id, dx, dy, tx, ty, moved, sx, sy} while pressing a placed unit
  let pressCell = null; // {x,y} where a press on empty space began (placement decided on release)
  let animatePlacement = false; // one-shot: Load example / Surprise me stagger units in
  // A touch tap emits emulated mouse events (mousedown/mouseup/click) right
  // after touchend. We handle touches ourselves, so ignore any mouse event that
  // lands within this window of a touchend — otherwise those emulated events
  // re-run the mouse handlers and undo the tap we just processed.
  let lastTouchEnd = 0;
  const GHOST_CLICK_MS = 700;
  // A press that moves less than this many CSS pixels counts as a tap/click
  // (which selects the unit), not a drag. Touch needs a MUCH larger dead-zone than
  // the mouse: a real thumb tap routinely drifts 20–40px on a small target, so a
  // tight value makes those taps read as a one-cell drag and the unit never gets
  // selected (this made selection nearly unusable on phones). The mouse is precise,
  // so it can stay tight and still start deliberate drags easily.
  const DRAG_SLOP = 18;    // mouse
  const TOUCH_SLOP = 30;   // touch — thumbs drift far more than a mouse ever does

  // Advanced cabinet interior editor — transient UI state (never persisted on a unit).
  let interiorArmed = null; // {w,h} armed compartment size for click-to-place, or null
  let interiorOpen = false; // mobile bottom-sheet open flag (desktop shows the editor inline)
  let interiorHover = null; // {x,y} cell under the cursor in the editor, for the placement ghost
  let toolbarSel = null;    // last unit id rendered in the toolbar; resets the above on change

  function renderBoard() {
    const svg = $("#board");
    const W = PAD.left + state.gridW * CW + PAD.right;
    // the wall mount's kit legend lives UNDER the grid (gridBottom+24/+38), so
    // its row "+" strip drops below the legend and the board grows to fit it
    const wantRowStrip = state.mount !== "tabletop" && state.gridH < capH();
    const wallRowStrip = wantRowStrip && state.mount === "wall";
    const H = PAD.top + rows() * (CH / 2) + PAD.bottom + (wallRowStrip ? 22 : 0);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    // Grow a small build to fill the board area (up to 2.4×) so it isn't tiny;
    // a large one fits the container width (and scrolls if tall) as before.
    const avail = (svg.parentElement ? svg.parentElement.clientWidth : 0) - 18;
    if (avail > 40) { svg.style.width = Math.min(avail, W * 2.4) + "px"; svg.style.height = "auto"; }
    else { svg.style.width = ""; svg.style.height = ""; }
    svg.innerHTML = "";

    drawMountScene(svg, W, H);

    const gx = PAD.left, gy = PAD.top;
    el("rect", { x: gx, y: gy, width: state.gridW * CW, height: rows() * (CH / 2), class: "g-bg" }, svg);
    for (let c = 0; c <= state.gridW; c++)
      el("line", { x1: gx + c * CW, y1: gy, x2: gx + c * CW, y2: gy + rows() * (CH / 2), class: "g-line" }, svg);
    for (let r = 0; r <= rows(); r++)
      el("line", { x1: gx, y1: gy + r * (CH / 2), x2: gx + state.gridW * CW, y2: gy + r * (CH / 2), class: r % 2 ? "g-line faint" : "g-line" }, svg);

    const bows = bowRisks();
    const sags = sagRisks();
    const lowTops = wallTopHalfHeight();
    state.placed.forEach((p) => drawUnit(svg, p, bows, sags, lowTops));
    if (state.mount === "tabletop") drawCompletion(svg, gx, gy);

    // Edge "+" affordances (Joey 2026-07-19): grow the grid straight from the
    // board — a column strip on the RIGHT for every mount, a row strip at the
    // BOTTOM only where the build hangs from the top (under-table / wall;
    // tabletop's height is auto-computed from the stack). Growth is always
    // AWAY from the mount's anchor edge, so placed units never shift and the
    // three mounts share one rule. Hidden at the workable-area / absolute
    // caps; the palette steppers remain the way to shrink.
    const growBtn = (rect, plusAt, tip, grow) => {
      const g = el("g", { class: "grow-btn" }, svg);
      el("rect", { ...rect, rx: 4 }, g);
      const t = el("text", { x: plusAt[0], y: plusAt[1], class: "grow-plus" }, g);
      t.textContent = "+";
      const ti = el("title", {}, g);
      ti.textContent = tip;
      // keep the board's press/drag/tap machinery out of the strip
      ["mousedown", "mouseup", "touchstart", "touchend"].forEach((ev) =>
        g.addEventListener(ev, (e) => e.stopPropagation()));
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        grow();
        clampGrid();
        refresh();
      });
    };
    const gwPx = state.gridW * CW, ghPx = rows() * (CH / 2);
    if (state.gridW < capW())
      growBtn({ x: gx + gwPx + 5, y: gy, width: 15, height: ghPx },
        [gx + gwPx + 12.5, gy + ghPx / 2 + 4],
        `Add a column · ${state.gridW}W → ${state.gridW + 1}W`,
        () => { state.gridW = Math.min(capW(), state.gridW + 1); });
    if (wantRowStrip) {
      // hugs the grid on every hanging mount; on wall the kit legend steps
      // down below it instead (drawMountScene) — Joey: the strip is part of
      // the grid, the legend isn't
      const rowY = gy + ghPx + 5;
      growBtn({ x: gx, y: rowY, width: gwPx, height: 15 },
        [gx + gwPx / 2, rowY + 11],
        `Add a row · ${state.gridH}H → ${state.gridH + 1}H`,
        () => { state.gridH = Math.min(capH(), state.gridH + 1); });
    }

    // One-shot placement animation (Load example / Surprise me): units settle
    // into place in sequence, toward the mount surface.
    if (animatePlacement) {
      animatePlacement = false;
      const from = state.mount === "tabletop" ? "10px" : "-10px";
      svg.querySelectorAll("g.drawer").forEach((u, i) => {
        u.style.setProperty("--drop-from", from);
        u.style.setProperty("--drop-delay", `${i * 45}ms`);
        u.classList.add("drop-in");
      });
    }

    ghostEl = null;      // the wipe above detached the old ghost node
    updateGhost();

    renderBoardMeta();
    renderWarnings();
  }

  /* The placement/drop ghost is the ONLY thing on the board that changes with
     bare cursor movement, so it lives in its own element that mousemove updates
     imperatively — renderBoard is never called per-move. That keeps the placed
     units' DOM stable under the cursor (a rebuilt node skips its CSS
     transition, which would kill the drawer-slide hover animation) and makes
     hover/drag cost O(1) instead of a full board rebuild. */
  let ghostEl = null;
  function updateGhost() {
    const svg = $("#board");
    let spec = null;
    if (drag && drag.moved) {
      const p = state.placed.find((u) => u.id === drag.id);
      if (p) spec = { x: drag.tx, y: drag.ty, w: p.w, hh: p.hh, ok: canPlace(drag.tx, drag.ty, p.w, p.hh, p.id) };
    } else if (hover && state.selected && !drag &&
               hover.x >= 0 && hover.y >= 0 && hover.x < state.gridW && hover.y < rows() &&
               !unitAt(hover.x, hover.y)) {
      const { w, h } = state.selected;
      spec = { x: hover.x, y: hover.y, w, hh: h * 2, ok: canPlace(hover.x, hover.y, w, h * 2) };
    }
    if (!spec) {
      if (ghostEl && ghostEl.parentNode) ghostEl.remove();
      ghostEl = null;
      return;
    }
    if (!ghostEl || !ghostEl.parentNode) ghostEl = el("rect", { rx: 6 }, svg);
    ghostEl.setAttribute("x", PAD.left + spec.x * CW + 2);
    ghostEl.setAttribute("y", PAD.top + spec.y * (CH / 2) + 2);
    ghostEl.setAttribute("width", spec.w * CW - 4);
    ghostEl.setAttribute("height", spec.hh * (CH / 2) - 4);
    ghostEl.setAttribute("class", spec.ok ? "ghost ok" : "ghost bad");
  }

  /* Board colors: product colors ARE the look (the schematic-gray toggle was
     removed 2026-07-10 — nobody wants the drab board once they've seen the
     real one). The class lives on the persistent <svg>, so it survives
     re-renders and rides into the share-card clone. */
  function applyBoardColors() {
    $("#board").classList.add("product");
  }

  function drawUnit(svg, p, bows, sags, lowTops) {
    const x = PAD.left + p.x * CW, y = PAD.top + p.y * (CH / 2);
    const w = p.w * CW, h = p.hh * (CH / 2);
    const sel = state.selectedUnit === p.id;
    const dragging = drag && drag.moved && drag.id === p.id;
    const g = el("g", {
      class: "drawer" + (sel ? " selected" : "") + (dragging ? " dragging" : "")
        + (bows && bows.has(p.id) ? " bow" : "") + (sags && sags.has(p.id) ? " sag" : "")
        + (lowTops && lowTops.has(p.id) ? " lowtop" : ""),
      "data-id": p.id,
    }, svg);
    // an advanced cabinet whose interior isn't fully tiled flags red on the board
    const cabFill = interiorFill(p);
    const caseCls = "d-case" + (cabFill ? (cabFill.complete ? " tiled-ok" : " tiled-bad") : "");
    el("rect", { x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 6, class: caseCls }, g);

    // Drawer fronts (and their label) live in a nested group so they can slide
    // "toward you" on hover/selection (CSS .d-front transform + shadow) while
    // the case shell stays put. Shelves/cabinets draw straight into the unit.
    const front = (p.fill === "classic" || p.fill === "decor") ? el("g", { class: "d-front" }, g) : g;

    if (p.fill === "shelf") {
      el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-interior" }, g);
      el("line", { x1: x + 9, y1: y + h - 11, x2: x + w - 9, y2: y + h - 11, class: "d-shelf-line" }, g);
    } else if (p.fill === "cabinet") {
      el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-door" }, g);
      if (Array.isArray(p.interior)) {
        // ADVANCED: draw the compartment tiling. Interior y/h are FULL 1H rows (× CH);
        // the board's own y/hh are half-rows (× CH/2) — don't confuse the two.
        p.interior.forEach((c) => {
          const cx = x + c.x * CW, cy = y + c.y * CH, cw = c.w * CW, chh = c.h * CH;
          el("rect", { x: cx + 5, y: cy + 5, width: cw - 10, height: chh - 10, rx: 3, class: "d-compartment" }, g);
          for (let s = 1; s < c.h; s++) { // (h-1) extender seams, one per internal 1H boundary
            const sy = cy + s * CH;
            el("line", { x1: cx + 9, y1: sy, x2: cx + cw - 9, y2: sy, class: "d-shelf-line dashed" }, g);
          }
        });
        // keep the door's hardware faint over the compartments — x-ray look, but
        // it still reads as a cabinet
        const hw = el("g", { class: "d-hardware-ghost" }, g);
        el("circle", { cx: x + w - 16, cy: y + h / 2, r: 3.5, class: "d-knob" }, hw);
        el("rect", { x: x + 5, y: y + 11, width: 4, height: 9, rx: 1, class: "d-hinge" }, hw);
        el("rect", { x: x + 5, y: y + h - 20, width: 4, height: 9, rx: 1, class: "d-hinge" }, hw);
      } else {
        // SIMPLE (unchanged): knob, hinges, evenly-spaced shelf seams
        el("circle", { cx: x + w - 16, cy: y + h / 2, r: 3.5, class: "d-knob" }, g);
        el("rect", { x: x + 5, y: y + 11, width: 4, height: 9, rx: 1, class: "d-hinge" }, g);
        el("rect", { x: x + 5, y: y + h - 20, width: 4, height: 9, rx: 1, class: "d-hinge" }, g);
        for (let s = 1; s <= (p.shelves || 0); s++) {
          const sy = y + (h * s) / ((p.shelves || 0) + 1);
          el("line", { x1: x + 9, y1: sy, x2: x + w - 9, y2: sy, class: "d-shelf-line dashed" }, g);
        }
      }
    } else if (p.fill === "decor") {
      // decor drawer, true front view: body-coloured front with the two
      // vertical faceplate rails INSET from the sides (a thin face margin shows
      // outside each) and a recessed centre panel between them — chamfered
      // bottom corners, stopping short of the bottom to leave the floor-lip
      // band. Rail/margin/band sizes are physical constants → fixed px; only
      // the vertical runs stretch with drawer height.
      const fx = x + 7, fy = y + 7, fw = w - 14, fh = h - 14;
      el("rect", { x: fx, y: fy, width: fw, height: fh, rx: 4, class: "d-face" }, front);
      const px0 = fx + 7, px1 = fx + fw - 7, py0 = fy + 1, py1 = fy + fh - 3;
      const c = Math.min(3, Math.round((py1 - py0) / 3));   // bottom-corner chamfer
      el("polygon", {
        points: `${px0},${py0} ${px1},${py0} ${px1},${py1 - c} ${px1 - c},${py1} ${px0 + c},${py1} ${px0},${py1 - c}`,
        class: "d-panel",
      }, front);
      const rw = 4, railY = fy + 2, railB = fy + fh - 1, tip = Math.min(2, (railB - railY) / 4);
      [fx + 2, fx + fw - 2 - rw].forEach((rx0) => {
        el("polygon", {
          points: `${rx0},${railY} ${rx0 + rw},${railY} ${rx0 + rw},${railB - tip} ${rx0 + rw - 1.5},${railB} ${rx0 + 1.5},${railB} ${rx0},${railB - tip}`,
          class: "d-rail",
        }, front);
      });
    } else {
      // classic drawer, true front view: flat face with the integrated handle
      // scoop across the bottom — a full-width chamfer ramps down at ~45° to a
      // recessed wall band, leaving solid triangles at the outer corners. The
      // scoop is a fixed physical size (a finger pull doesn't grow with drawer
      // height), shrunk only when a 0.5H face is too short for it.
      const fx = x + 7, fy = y + 7, fw = w - 14, fh = h - 14;
      el("rect", { x: fx, y: fy, width: fw, height: fh, rx: 4, class: "d-face" }, front);
      const scoopH = Math.min(14, Math.round(fh * 0.55));
      const bandH = Math.max(3, Math.round(scoopH * 0.3));
      const inset = Math.min(scoopH - bandH, Math.round(fw * 0.28));
      const scoopTop = fy + fh - scoopH, bandTop = fy + fh - bandH;
      el("polygon", {
        points: `${fx},${scoopTop} ${fx + fw},${scoopTop} ${fx + fw - inset},${bandTop} ${fx + inset},${bandTop}`,
        class: "d-scoop",
      }, front);
      el("rect", { x: fx + inset, y: bandTop, width: fw - inset * 2, height: bandH, class: "d-scoop-wall" }, front);
      el("line", { x1: fx + inset, y1: bandTop, x2: fx + fw - inset, y2: bandTop, class: "d-scoop-edge" }, front);
    }
    // Native hover tooltip: the full (uncropped) label plus size and fill type.
    const size = sizeToken(p.w, p.hh / 2);
    el("title", {}, g).textContent = (p.label ? p.label + " · " : "") + size + " " + fillDef(p.fill).label;
    // The size badge earns its pixels only on unlabelled units (it's what tells
    // four empty 1W-1H cells apart). Labelled units show it on hover/selection
    // instead (CSS .on-demand) — the label is the content, size is metadata,
    // and the badge otherwise covers the drawer artwork. A labelled 0.5H unit
    // is too short even for the transient badge; the toolbar covers it there.
    if (!(p.label && p.hh <= 1)) {
      el("text", {
        x: x + w - 8, y: y + h - 9, "text-anchor": "end",
        class: "d-label" + (p.label ? " on-demand" : ""),
      }, g).textContent = size;
    }
    if (p.label) drawUserLabel(front, p.label, x, y, w, h);   // rides the drawer front
  }

  /* The user's "what's in this drawer" label, drawn to STAY INSIDE the unit.
     The box is tiny (a 1W cell is CW px wide), so a long label wraps across the
     available lines and any line still too wide is CROPPED with an ellipsis (…)
     rather than squished — the full text is on the unit's hover <title> and in
     the inspector's Label field. Line breaks are laid out with a cheap width
     estimate (labels are ALL-CAPS, so ~0.66·fontSize per glyph is close
     enough); the hard "never overflow" guarantee comes from measuring each
     finished line and trimming it. */
  function drawUserLabel(g, label, x, y, w, h) {
    const PADX = 6;                        // side breathing room inside the box
    const availW = w - PADX * 2;
    const fs = h <= CH / 2 ? 8 : 10;       // 0.5H units are only ~CH/2 px tall
    const lineH = fs + 1.5;
    // full box: the size badge only appears transiently (hover/selection), so
    // the label doesn't reserve space for it
    const bandTop = y + 3, bandBot = y + h - 3;
    const maxLines = Math.max(1, Math.min(3, Math.floor((bandBot - bandTop) / lineH)));
    const lines = wrapLabel(label, availW, fs, maxLines);
    const blockH = lines.length * lineH;
    let baseY = bandTop + Math.max(0, (bandBot - bandTop - blockH) / 2) + fs;
    const cx = x + w / 2;
    lines.forEach((line) => {
      const t = el("text", {
        x: cx, y: baseY, class: "d-userlabel", "text-anchor": "middle",
        style: "font-size:" + fs + "px",
      }, g);
      t.textContent = line;
      fitWithEllipsis(t, line, availW);
      baseY += lineH;
    });
  }

  /* Crop a rendered <text> node to availW, appending "…" — keeps the glyphs at
     full size instead of squishing them. Binary-searches the longest prefix
     that fits. getComputedTextLength is a no-op (0) under headless jsdom, so in
     tests the check short-circuits and nothing is cropped. */
  function fitWithEllipsis(node, str, availW) {
    const measure = () => {
      try { return node.getComputedTextLength ? node.getComputedTextLength() : 0; }
      catch (e) { return 0; }
    };
    if (measure() <= availW) return;       // already fits (or unmeasurable)
    const ELL = "…";
    let lo = 0, hi = str.length;            // longest prefix length that still fits
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      node.textContent = str.slice(0, mid) + ELL;
      if (measure() <= availW) lo = mid; else hi = mid - 1;
    }
    // don't cut through a surrogate pair (emoji etc.) — a lone half renders �
    if (lo > 0 && /[\uD800-\uDBFF]/.test(str[lo - 1])) lo--;
    node.textContent = lo > 0 ? str.slice(0, lo) + ELL : ELL;
  }

  /* Greedy word-wrap into at most maxLines lines using an estimated glyph
     advance — no DOM measurement, so the headless tests stay happy. Any words
     past the line budget are merged onto the last line, which drawUserLabel
     then crops to fit. */
  function wrapLabel(text, availW, fs, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const perChar = 0.66 * fs;   // ~avg advance of the bold all-caps label
    const fits = (s) => s.length * perChar <= availW;
    const lines = [];
    let cur = "";
    for (const word of words) {
      const cand = cur ? cur + " " + word : word;
      if (!cur || fits(cand)) cur = cand;
      else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const head = lines.slice(0, maxLines - 1);
      head.push(lines.slice(maxLines - 1).join(" "));
      return head;
    }
    return lines;
  }

  /* Mount-specific scenery drawn around the grid, with the needed
     mount parts illustrated over the occupied columns. */
  function drawMountScene(svg, W, H) {
    const cols = occupiedColumns();
    const gy = PAD.top;
    const gridBottom = gy + rows() * (CH / 2);
    // Kit titles name the chosen length, so they wear its official lineup
    // color (same as the length cards) rather than the brand accent — on a
    // 165 build the title reads blue, on 240 teal, etc. (185's color IS the
    // accent orange). Inline style because the class fill would win otherwise.
    const titleAttrs = (x, y) => {
      const l = GEN2.lengths.find((g) => g.id === state.length);
      const a = { x, y, class: "s-part-label" };
      if (l) a.style = `fill:${l.color}`;
      return a;
    };

    if (state.mount === "under-table") {
      el("rect", { x: 0, y: gy - 26, width: W, height: 18, class: "s-wood" }, svg);
      el("text", { x: W / 2, y: gy - 32, class: "s-label", "text-anchor": "middle" }, svg)
        .textContent = "table / desk underside" + (state.spaceW ? ` · ${state.spaceW}mm available` : "");
      // one bar per rail section, spanning the section's full width. The
      // section size lives in a native SVG <title> hover tooltip — a big bold
      // rail summary under the grid read as page text and felt out of place
      // (Joey 2026-07-10); the full mix is in the parts list anyway.
      railSections().forEach((s) => {
        const bar = el("rect", { x: PAD.left + s.start * CW + 8, y: gy - 8, width: s.w * CW - 16, height: 8, rx: 2, class: "s-part s-rail" }, svg);
        el("title", {}, bar).textContent = `GEN2 Under Table Rails - ${state.length ?? ""} · ${s.w}W section`;
      });
    } else if (state.mount === "tabletop") {
      const COV = 6, GAP = 2.5;
      const cuY = gy - 26, clY = gy - 17;                    // cover layers, above the grid (the lid)
      const fruY = gridBottom + 2, frlY = gridBottom + 10;   // foot-rail layers, below the grid
      const floor = state.placed.length ? Math.max(...state.placed.map((p) => p.y + p.hh)) : 0;
      const drawLayer = (pieces, y, cls) => pieces.forEach((pc) =>
        el("rect", { x: PAD.left + pc.x * CW + GAP, y, width: pc.w * CW - 2 * GAP, height: COV, rx: 2, class: cls }, svg));

      let anyFootRail = false;
      columnRuns().forEach((run) => {
        const lay = coverLayout(run.start, run.len);
        // Covers (always): upper over lower, seams offset like brick.
        drawLayer(lay.upper, cuY, "s-cover-u");
        drawLayer(lay.lower, clY, "s-cover-l");
        // Foot rails: only where the run's bottom row is more than one case.
        const bottomCases = state.placed.filter((p) =>
          p.y + p.hh === floor && p.x >= run.start && p.x < run.start + run.len).length;
        if (bottomCases >= 2) {
          anyFootRail = true;
          drawLayer(lay.upper, fruY, "s-fr-u");
          drawLayer(lay.lower, frlY, "s-fr-l");
        }
        // A foot at every W-boundary of the run.
        for (let i = 0; i <= run.len; i++)
          el("rect", { x: PAD.left + (run.start + i) * CW - 5, y: gridBottom + 18, width: 10, height: 7, rx: 2, class: "s-foot" }, svg);
      });

      // Left-edge tags so the look-alike layers are learnable.
      const tag = (txt, y) => { el("text", { x: 3, y: y + COV, class: "s-tag" }, svg).textContent = txt; };
      if (cols.length) { tag("CU", cuY); tag("CL", clY); }
      if (anyFootRail) { tag("FR-U", fruY); tag("FR-L", frlY); }

      el("rect", { x: 0, y: gridBottom + 29, width: W, height: 10, class: "s-wood" }, svg);
      el("text", { x: W / 2, y: gridBottom + 51, class: "s-label", "text-anchor": "middle" }, svg)
        .textContent = "tabletop surface";
      if (cols.length) {
        el("text", titleAttrs(PAD.left, gy - 48), svg)
          .textContent = `▮ Table Top Kit - ${state.length ?? ""}`;
        el("text", { x: PAD.left, y: gy - 36, class: "s-hint-label" }, svg)
          .textContent = "Covers (CU over CL) stagger like brick · seams offset for strength";
      }
    } else if (state.mount === "wall") {
      el("rect", { x: 0, y: 0, width: 16, height: H, class: "s-wood" }, svg);
      for (let yy = 10; yy < H; yy += 26)
        el("line", { x1: 4, y1: yy, x2: 12, y2: yy + 8, class: "s-wood-grain" }, svg);
      el("text", { x: 26, y: 16, class: "s-label" }, svg)
        .textContent = "wall" + (state.spaceW ? ` · ${state.spaceW}mm available` : "");
      // The bracket goes on first (mount is behind the cases), so draw it at the
      // very top; the covers (the lid, on top of the cases) sit just below it —
      // reads more naturally than sandwiching the covers between bracket & case.
      const COVw = 6, GAPw = 2.5;
      wallSections().forEach((s) => {
        el("rect", { x: PAD.left + s.start * CW + 6, y: gy - 38, width: s.w * CW - 12, height: 9, rx: 2, class: "s-part s-wallmount" }, svg);
        for (let u = 0; u < s.w; u++) {
          const cx0 = PAD.left + (s.start + u) * CW;
          el("circle", { cx: cx0 + CW * 0.32, cy: gy - 33.5, r: 2, class: "s-screw" }, svg);
          el("circle", { cx: cx0 + CW * 0.68, cy: gy - 33.5, r: 2, class: "s-screw" }, svg);
        }
      });
      const drawLayerW = (pieces, y, cls) => pieces.forEach((pc) =>
        el("rect", { x: PAD.left + pc.x * CW + GAPw, y, width: pc.w * CW - 2 * GAPw, height: COVw, rx: 2, class: cls }, svg));
      // staggered = tile each run; per-column = tile each top case independently
      const coverUnits = state.wallStagger
        ? columnRuns().map((r) => ({ start: r.start, len: r.len }))
        : topCases().map((p) => ({ start: p.x, len: p.w }));
      coverUnits.forEach((u) => {
        const lay = coverLayout(u.start, u.len);
        drawLayerW(lay.upper, gy - 24, "s-cover-u");
        drawLayerW(lay.lower, gy - 15, "s-cover-l");
      });
      if (cols.length) {
        // the row "+" strip (renderBoard) hugs the grid bottom — when it's
        // present the legend steps down below it (the viewBox grows to fit)
        const dy = state.gridH < capH() ? 24 : 0;
        el("text", titleAttrs(PAD.left, gridBottom + 24 + dy), svg)
          .textContent = `▮ Wall Mount Kit - Lite - ${state.length ?? ""}: ${mixText(mixOf(wallSections()))}`;
        el("text", { x: PAD.left, y: gridBottom + 38 + dy, class: "s-hint-label" }, svg)
          .textContent = `+ top covers (CU over CL, ${state.wallStagger ? "staggered" : "per-column"})`;
      }
    }
  }

  /* Topmost occupied half-row per occupied column */
  function columnTops() {
    const tops = {};
    state.placed.forEach((p) => {
      for (let dx = 0; dx < p.w; dx++) {
        const c = p.x + dx;
        tops[c] = tops[c] === undefined ? p.y : Math.min(tops[c], p.y);
      }
    });
    return tops;
  }

  function occupiedColumns() {
    const set = new Set();
    state.placed.forEach((p) => {
      for (let dx = 0; dx < p.w; dx++) set.add(p.x + dx);
    });
    return [...set].sort((a, b) => a - b);
  }

  /* Units with nothing directly above them — the exposed top row. Covers cap
     these; in wall "per-column" mode each gets its own cover. */
  function topCases() {
    return state.placed.filter((p) => {
      for (let dx = 0; dx < p.w; dx++) if (unitAt(p.x + dx, p.y - 1)) return false;
      return true;
    });
  }

  /* Contiguous runs of occupied columns, e.g. cols 0,1,3,4,5 →
     [{start: 0, len: 2}, {start: 3, len: 3}] */
  function columnRuns() {
    const cols = occupiedColumns();
    const runs = [];
    let start = null, prev = null;
    cols.forEach((c) => {
      if (prev === null || c !== prev + 1) {
        if (prev !== null) runs.push({ start, len: prev - start + 1 });
        start = c;
      }
      prev = c;
    });
    if (prev !== null) runs.push({ start, len: prev - start + 1 });
    return runs;
  }

  /* Two staggered cover / foot-rail layers over a run [start, start+n): the
     upper and lower layers tile the width in 1W/2W pieces with offset seams,
     so the brick pattern reads visually. Mirrors data.js brickTiling(). */
  function coverLayout(start, n) {
    const seq = (widths) => { let p = start; return widths.map((w) => { const o = { x: p, w }; p += w; return o; }); };
    if (n <= 1) return { upper: seq([1]), lower: seq([1]) };
    if (n === 2) return { upper: seq([2]), lower: seq([2]) };
    if (n % 2 === 1) {                                  // odd ≥3: 1W lead vs 1W trail
      const twos = Array((n - 1) / 2).fill(2);
      return { upper: seq([1, ...twos]), lower: seq([...twos, 1]) };
    }
    const mid = Array((n - 2) / 2).fill(2);             // even ≥4: all-2W vs 1W caps
    return { upper: seq(Array(n / 2).fill(2)), lower: seq([1, ...mid, 1]) };
  }

  /* Lay sections over each contiguous run, biggest-first within the
     given width limit. 5W with a 2W max → 2W@0, 2W@2, 1W@4. */
  function sectionsFor(widths, max) {
    const sections = [];
    columnRuns().forEach((run) => {
      let pos = run.start, left = run.len;
      for (const w of [...widths].sort((a, b) => b - a)) {
        if (w > max) continue;
        while (left >= w) {
          sections.push({ start: pos, w });
          pos += w;
          left -= w;
        }
      }
    });
    return sections;
  }

  const railSections = () => sectionsFor(GEN2.railWidths, maxRailW());
  const wallSections = () => sectionsFor(GEN2.wallMount.widths, GEN2.wallMount.maxW(bedSize()));

  function mixOf(sections) {
    const mix = {};
    sections.forEach((s) => { mix[s.w] = (mix[s.w] || 0) + 1; });
    return mix;
  }

  const railMix = () => mixOf(railSections());

  function mixText(mix) {
    return Object.entries(mix).sort((a, b) => b[0] - a[0])
      .map(([w, n]) => `${n}× ${w}W`).join(" + ");
  }

  /* Contextual one-liner above the board, so the place/drag/edit mechanics
     never need a tutorial. */
  function renderBoardHelper() {
    const elH = $("#board-helper");
    if (!state.placed.length) {
      elH.textContent = state.selected
        ? `Click the grid to place your ${sizeToken(state.selected.w, state.selected.h)} ${fillDef().label} · or load an example layout from the panel.`
        : "Pick a size from the palette to begin.";
    } else if (state.selectedUnit) {
      elH.textContent = "Unit selected · use the arrow pad below to move it one step, or Remove it · click an empty cell to add more.";
    } else {
      elH.textContent = "Click the grid to add more · drag a unit to move it · click a unit to select, then move or remove it below.";
    }
  }

  /* ---- "builds started" (KPI stage 2, 2026-07-30) ----
     Fires ONCE per page load, the first time a USER action puts a unit on the
     board — direct place (mouse/touch), Load example, Surprise me, or the
     structure-fixer's fillColumn. Deliberately NOT fired by applyBuild
     (session restore, #build= links, undo/redo assign state.placed wholesale
     and never reach the .push sites), so a returning visitor who only reads
     their restored build doesn't count as starting one. Page-memory flag, no
     storage — same dedupe philosophy as the viewer's trackOnce. */
  let buildStarted = false;
  function noteBuildStart() {
    if (buildStarted) return;
    buildStarted = true;
    track("build-start");
  }

  /* A small ready-made layout so first-time users can see the illustration
     and parts list react before they understand every control. Adapts to the
     current grid, printer, and mount. */
  function loadExample() {
    track("example");
    noteBuildStart();
    state.placed = [];
    state.selectedUnit = null;
    const fits = (w, fill) => state.gridW >= w && fillFits(w, fill);
    // One drawer style throughout, like a real build (mixing Classic + Decor
    // in one setup is unusual — matching surpriseMe's single-fill rule). Use
    // the palette's selected fill when it's a drawer; Decor otherwise, and
    // when the bed can't fit Classic at this length.
    let fill = state.fill === "classic" || state.fill === "decor" ? state.fill : "decor";
    if (!fits(1, fill)) fill = "decor";

    // top level: a row of 1H drawers
    const row = [];
    let x = 0;
    [2, 1, 1].forEach((w) => {
      if (fits(w, fill) && x + w <= state.gridW) {
        row.push({ x, level: 0, w, hh: 2, fill });
        x += w;
      }
    });
    if (!row.length && fits(1, "decor")) row.push({ x: 0, level: 0, w: 1, hh: 2, fill: "decor" });

    // second level: tabletop needs a flat top, so mirror the full row;
    // hanging mounts get one taller drawer under the first column
    const extra = [];
    if (state.mount === "tabletop") {
      row.forEach((u) => extra.push({ ...u, level: 1, hh: 2 }));
    } else if (capH() >= 3 && fits(2, fill) && x >= 2) {
      extra.push({ x: 0, level: 1, w: 2, hh: 4, fill });
    }

    const units = row.concat(extra);
    const levels = Math.max(...units.map((u) => u.level === 0 ? u.hh : u.hh + 2)) / 2;
    state.gridH = Math.max(state.gridH, Math.min(capH(), Math.ceil(levels)));
    units.forEach((u) => {
      const y = state.mount === "tabletop"
        ? rows() - (u.level * 2 + u.hh)         // bottom-anchored
        : u.level * 2;                          // top-anchored
      state.placed.push({ id: state.nextId++, x: u.x, y, w: u.w, hh: u.hh, fill: u.fill, shelves: 0 });
    });
    animatePlacement = true;
    refresh();
  }

  /* "Surprise me": a random but always-valid build for the current mount /
     length / printer. Built as solid rows (each tiles the full width, so every
     case is fully supported by the row toward the surface) of random widths,
     heights, and drawer fills. */
  function surpriseMe() {
    track("surprise");
    noteBuildStart();
    const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = (arr) => arr[randInt(0, arr.length - 1)];
    const FILLS = ["classic", "decor"];
    // One drawer type for the whole build — nobody mixes Classic and Decor.
    const widestFor = (f) => { let m = 0; for (let w = 1; w <= 4; w++) if (fillFits(w, f)) m = w; return m; };
    let buildFill = pick(FILLS);
    let maxFitW = widestFor(buildFill);
    if (!maxFitW) { buildFill = buildFill === "classic" ? "decor" : "classic"; maxFitW = widestFor(buildFill); }
    if (!maxFitW) {
      const box = $("#board-warnings");
      box.innerHTML = "";
      warn(box, "No case size fits the selected printer at this length · pick a smaller length or a larger printer, then try again.");
      return;
    }

    const fromTop = state.mount !== "tabletop";
    const maxW = Math.max(1, Math.min(capW(), 5));
    const W = randInt(Math.min(2, maxW), maxW);

    // Wide units should read as occasional accents, not every other case —
    // 3W/4W get a third of the draw weight of 1W/2W (Joey 2026-07-10).
    const pickWidth = (ws) => pick(ws.flatMap((w) => Array(w >= 3 ? 1 : 3).fill(w)));

    // Tile one row of height hh across width W, all of the chosen drawer type.
    // (sizeExists gets buildFill explicitly — state.fill may be a shelf while
    // the surprise build rolls drawers, and per-length catalogs differ by fill.)
    const tileRow = (hh) => {
      const cases = [];
      for (let x = 0; x < W; ) {
        const widths = [];
        for (let w = 1; w <= Math.min(maxFitW, W - x); w++)
          if (sizeExists(w, hh / 2, buildFill) && fillFits(w, buildFill)) widths.push(w);
        const w = widths.length ? pickWidth(widths) : 1;
        cases.push({ x, w, fill: buildFill });
        x += w;
      }
      return { hh, cases };
    };

    // Stack 1–3 rows of 1H/2H, capped by the workable/grid height.
    const maxHH = capH() * 2;
    const rowsArr = [];
    let totalHH = 0;
    for (let i = 0, n = randInt(1, 3); i < n; i++) {
      const cand = [2, 4].filter((hh) => totalHH + hh <= maxHH && sizeExists(1, hh / 2, buildFill));
      if (!cand.length) break;
      const hh = pick(cand);
      rowsArr.push(tileRow(hh));
      totalHH += hh;
    }
    if (!rowsArr.length) rowsArr.push(tileRow(2)), (totalHH = 2);

    state.placed = [];
    state.selectedUnit = null;
    state.nextId = 1;
    state.gridW = Math.max(GRID_LIMITS.wMin, Math.min(capW(), W));
    state.gridH = Math.max(GRID_LIMITS.hMin, Math.min(capH(), Math.ceil(totalHH / 2)));
    let cursor = fromTop ? 0 : rows();        // build outward from the mount surface
    rowsArr.forEach((row) => {
      const y = fromTop ? cursor : cursor - row.hh;
      row.cases.forEach((c) =>
        state.placed.push({ id: state.nextId++, x: c.x, y, w: c.w, hh: row.hh, fill: c.fill, shelves: 0 }));
      cursor = fromTop ? cursor + row.hh : cursor - row.hh;
    });
    animatePlacement = true;
    refresh();
  }

  /* ----------------------- Save / load builds ----------------------- */

  // The fields that make a build reproducible (setup + layout).
  const BUILD_FIELDS = ["mount", "length", "printer", "customBed", "spaceW", "spaceH",
    "faceStyle", "doorStyle", "handleStyle", "wallStagger", "backCover", "feet", "removedStoppers", "gridW", "gridH", "placed", "nextId"];

  const serializeBuild = () => {
    const o = {};
    BUILD_FIELDS.forEach((k) => { o[k] = state[k]; });
    return JSON.parse(JSON.stringify(o));   // deep copy (placed array)
  };

  /* ------- Untrusted-build sanitizer (share links, files, saved builds) -------
     applyBuild() is the only entry point for data this session didn't create,
     so everything is validated here: enum fields must exist in the catalog,
     numbers are clamped to the UI's own limits, and structurally invalid units
     are dropped (never "repaired" into something the user didn't build). A
     corrupt or hostile link loads smaller — it can't brick the app or hang the
     tab (a poisoned state would otherwise crash every refresh()).
     Returns how many units were dropped, for the caller's warning. */
  const LABEL_MAX = 40;   // mirrors the #ut-label input's maxlength
  // One bound for unit ids AND the nextId watermark: a valid id is a safe
  // positive integer <= ID_MAX; anything else mints fresh. One rule, so the
  // "never reuse a freed id" guarantee has no range where it silently fails.
  const ID_MAX = 1e9;
  function sanitizeBuild(d) {
    const int = (v, min, max, fb) => {
      v = Math.round(Number(v));
      return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb;
    };
    const idIn = (list, v, fb) => (list.some((e) => e.id === v) ? v : fb);

    d.mount = idIn(GEN2.mounts, d.mount, null);
    d.length = idIn(GEN2.lengths, d.length, null);
    d.printer = d.printer === "custom" ? "custom" : idIn(GEN2.printers, d.printer, "any");
    d.faceStyle = idIn(GEN2.faceplateStyles, d.faceStyle, GEN2.faceplateStyles[0].id);
    d.doorStyle = idIn(GEN2.doorStyles, d.doorStyle, GEN2.doorStyles[0].id);
    d.handleStyle = idIn(GEN2.handleStyles, d.handleStyle, GEN2.handleStyles[0].id);
    d.wallStagger = !!d.wallStagger;
    d.backCover = !!d.backCover;
    d.feet = d.feet === "adhesive" ? "adhesive" : "tpu";
    // removedStoppers: dedupe + keep only well-formed "<unitId>:<localCol>" keys
    // (pruned below to keys that name a kept drawer, once the units are known)
    d.removedStoppers = Array.isArray(d.removedStoppers)
      ? [...new Set(d.removedStoppers.filter((k) => typeof k === "string" && /^\d+:\d+$/.test(k)))]
      : [];
    d.gridW = int(d.gridW, GRID_LIMITS.wMin, GRID_LIMITS.wMax, 6);
    d.gridH = int(d.gridH, GRID_LIMITS.hMin, GRID_LIMITS.hMax, 4);
    // clamps mirror the space/bed inputs' min/max attributes
    d.spaceW = d.spaceW == null ? null : int(d.spaceW, 88, 10000, null);
    d.spaceH = d.spaceH == null ? null : int(d.spaceH, 28, 10000, null);
    const bed = (d.customBed && typeof d.customBed === "object") ? d.customBed : {};
    d.customBed = {
      x: bed.x == null ? null : int(bed.x, 50, 1000, null),
      y: bed.y == null ? null : int(bed.y, 50, 1000, null),
    };

    const gridRows = d.gridH * 2, kept = [], usedIds = new Set();
    for (const u of d.placed) {
      if (!u || typeof u !== "object" || Array.isArray(u)) continue;
      if (!GEN2.fills.some((f) => f.id === u.fill)) continue;
      const w = Math.round(Number(u.w)), hh = Math.round(Number(u.hh));
      const x = Math.round(Number(u.x)), y = Math.round(Number(u.y));
      if (![w, hh, x, y].every(Number.isFinite)) continue;
      const h = hh / 2;
      if (w < 1 || w > 4 || !heightsForFill(u.fill).includes(h)) continue;
      if (!sizeExists(w, h, u.fill, d.length)) continue;
      if (x < 0 || y < 0 || x + w > d.gridW || y + hh > gridRows) continue;
      // no overlaps: first valid unit wins the cells
      if (kept.some((k) => x < k.x + k.w && k.x < x + w && y < k.y + k.hh && k.y < y + hh)) continue;
      // A unit's id is its IDENTITY: undo history, share links and the viewer's
      // removedStoppers keys ("<id>:<col>") all name units by it. Ids are KEPT
      // when valid and unique (2026-08-23) - this used to renumber 1..n on
      // every restore, which re-pointed a stopper key at whichever unit
      // inherited the number the moment a deletion had left the ids sparse
      // (found by the drawer-conversion review's undo test). Anything unusable
      // (missing, junk, fractional, a duplicate, out of range) is minted fresh
      // below, never recycled. Validate the RAW value, never round: rounding
      // aliased a hostile 7.4 onto a legitimate 7, whose stopper keys then
      // named the wrong unit - the exact failure this exists to prevent. The
      // ID_MAX bound is shared with nextId so the watermark can never sit
      // below a kept id, and next++ stays in safe-integer territory (at 2^53
      // it stops advancing and mints DUPLICATES; both review catches).
      const rawId = Number(u.id);
      const id = Number.isSafeInteger(rawId) && rawId > 0 && rawId <= ID_MAX && !usedIds.has(rawId) ? rawId : null;
      if (id) usedIds.add(id);
      const unit = { id, x, y, w, hh, fill: u.fill,
                     shelves: int(u.shelves, 0, Math.max(0, h - 1), 0) };
      if (typeof u.label === "string" && u.label.trim()) unit.label = u.label.slice(0, LABEL_MAX);
      // closures: drawers only, whitelisted to released options ("none" is
      // simply the field's absence)
      if ((u.fill === "classic" || u.fill === "decor") &&
          GEN2.closures.some((c) => c.id === u.closure && c.parts && !c.soon))
        unit.closure = u.closure;
      if (u.fill === "cabinet" && Array.isArray(u.interior) && u.interior.length) {
        // compartment coords are FULL 1H rows within the shell; any invalid
        // compartment discards the whole interior (falls back to simple mode)
        const comps = u.interior.map((c) => (c && typeof c === "object") ? {
          x: Math.round(Number(c.x)), y: Math.round(Number(c.y)),
          w: Math.round(Number(c.w)), h: Math.round(Number(c.h)),
        } : null);
        if (comps.every((c) => c && [c.x, c.y, c.w, c.h].every(Number.isFinite) &&
            c.w >= 1 && c.h >= 1 && c.x >= 0 && c.y >= 0 && c.x + c.w <= w && c.y + c.h <= h))
          unit.interior = comps;
      }
      kept.push(unit);
    }
    const dropped = d.placed.length - kept.length;
    // Fresh ids mint above BOTH the highest kept id and the file's own nextId,
    // so a number freed by a deletion is never handed to a later placement
    // (a stale stopper key could otherwise find a new owner).
    let next = Math.max(int(d.nextId, 1, ID_MAX, 1), Math.max(0, ...kept.map((k) => k.id || 0)) + 1);
    kept.forEach((k) => { if (!k.id) k.id = next++; });
    d.placed = kept;
    d.nextId = next;
    // A stopper key must name a kept DRAWER and a column inside its width;
    // anything else belongs to a unit that is gone (or never existed) and
    // would only wait for an id to be reused.
    const byId = new Map(kept.map((k) => [k.id, k]));
    d.removedStoppers = d.removedStoppers.filter((k) => {
      const [id, col] = k.split(":").map(Number);
      const u = byId.get(id);
      return !!u && (u.fill === "classic" || u.fill === "decor") && col < u.w;
    });
    return dropped;
  }

  function applyBuild(data) {
    if (!data || !Array.isArray(data.placed)) return false;
    data = JSON.parse(JSON.stringify(data));   // isolate from the source (no shared refs)
    const dropped = sanitizeBuild(data);
    BUILD_FIELDS.forEach((k) => { if (k in data) state[k] = data[k]; });
    enforceMountLength(); // a stale/edited link can't restore an invalid mount+length (e.g. tabletop + 59)
    state.selectedUnit = null;
    // Reflect the restored setup back into the controls.
    $("#printer-select").value = state.printer;
    if (state.customBed) { $("#bed-x").value = state.customBed.x ?? ""; $("#bed-y").value = state.customBed.y ?? ""; }
    $("#space-w").value = state.spaceW ?? "";
    $("#space-h").value = state.spaceH ?? "";
    renderMountCards();
    refresh();
    if (dropped) warn($("#board-warnings"),
      `${dropped} unit${dropped > 1 ? "s" : ""} in that build ${dropped > 1 ? "were" : "was"} invalid and skipped.`);
    return true;
  }

  /* ---------------------------- Undo / redo ----------------------------
     Snapshot history over the WHOLE build state (BUILD_FIELDS via
     serializeBuild), captured at the end of every refresh() — no per-action
     instrumentation, so every mutation path (place, drag, nudge, remove,
     clear, surprise, masters, style picks, even a viewer-synced change) is
     automatically undoable. Snapshots coalesce over a short idle window so a
     drag across five cells lands as ONE history entry, not five. Restores go
     through applyBuild (sanitize + full re-render) with a guard so the
     restore's own refresh doesn't re-snapshot. */
  const HISTORY_MAX = 50;
  const history = { stack: [], idx: -1, timer: null, restoring: false };
  // Last session's build, captured at script load — init's own baseline
  // snapshot writes to the same key moments later, so reading it any later
  // would find the fresh empty state instead of what the user left behind.
  const LAST_BUILD_RAW = store.get("gen2-last-build");
  function pushHistoryNow() {
    clearTimeout(history.timer); history.timer = null;
    const snap = JSON.stringify(serializeBuild());
    if (history.stack[history.idx] === snap) return;
    history.stack = history.stack.slice(0, history.idx + 1);   // a new change clears redo
    history.stack.push(snap);
    if (history.stack.length > HISTORY_MAX) history.stack.shift();
    history.idx = history.stack.length - 1;
    store.set("gen2-last-build", snap);   // auto-save: a closed tab costs nothing
    updateHistoryButtons();
  }
  function snapshotHistory() {
    if (history.restoring) return;
    // the first state is the undo BASELINE — capture it immediately, or a
    // quick first action inside the coalesce window would overwrite it
    if (history.idx < 0) return pushHistoryNow();
    clearTimeout(history.timer);
    history.timer = setTimeout(pushHistoryNow, 350);
  }
  function undoRedo(step) {
    pushHistoryNow();                       // flush any pending change first
    const to = history.idx + step;
    if (to < 0 || to >= history.stack.length) return;
    history.idx = to;
    history.restoring = true;
    try { applyBuild(JSON.parse(history.stack[to])); } finally { history.restoring = false; }
    // applyBuild normalizes what it restores (sanitize reassigns nextId etc.),
    // so resync the entry to the ACTUAL post-restore state — otherwise the
    // next undo's flush sees a "change" and pushes a phantom entry, making
    // every second undo press a no-op.
    history.stack[history.idx] = JSON.stringify(serializeBuild());
    // The auto-save must follow an undo too: pushHistoryNow() is the only
    // other writer and the restore's refresh() is guarded out of it, so
    // undoing a change and closing the tab used to resume the UNDONE state
    // (found 2026-08-23 while proving the mount-switch rebase is atomic).
    store.set("gen2-last-build", history.stack[history.idx]);
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    const u = $("#undo-btn"), r = $("#redo-btn");
    if (u) u.disabled = history.idx <= 0;
    if (r) r.disabled = history.idx >= history.stack.length - 1;
  }
  function bindHistory() {
    $("#undo-btn").addEventListener("click", () => undoRedo(-1));
    $("#redo-btn").addEventListener("click", () => undoRedo(+1));
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undoRedo(-1); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); undoRedo(+1); }
    });
  }

  /* Save = download the build as a file (bumpmesh-style): no in-app list, no
     name prompt. exportBuild() gives it a sensible default filename; the
     browser's "ask where to save" dialog (if the user has it on) is then the
     single place to rename it. Load is the "Load build from file" import. */
  function saveBuildToFile() {
    if (!state.placed.length) return;
    track("save-build");
    exportBuild(serializeBuild(), `gen2-${state.length}-${state.mount}-build`);
  }

  /* Official-kit authoring (dev machines only — the button is hidden unless
     IS_LOCAL_DEV). Exports the wrapper JSON the 3D Build Studio serves from
     builds/<id>.json: commit the file to the viewer repo and the kit's
     permanent link is ?build=<id>. Ids are mintable by commit only, so this
     never needs to exist in prod. The id auto-derives from the title
     (slugified) but stays editable — short slugs are QR-friendly. */
  function exportOfficialBuild() {
    if (!state.placed.length) return;
    const title = (window.prompt("Official kit TITLE (shown on the viewer's cover):", `GEN2 ${state.length} Tabletop Kit`) || "").trim();
    if (!title) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const id = (window.prompt("Kit id — the permanent ?build= link (short = QR-friendly):", slug) || "").trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) { window.alert("The id must be lowercase letters, digits and dashes only."); return; }
    const tagline = (window.prompt("Tagline (one friendly sentence under the title):", "") || "").trim();
    // buildVersion marks the planner format this file was authored in — the
    // viewer migrates old versions forward, so committed kits never go stale
    const file = { gen2OfficialBuild: 1, id, title, tagline, buildVersion: 1, build: serializeBuild() };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = id + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    // ready-to-paste gallery row for the viewer's builds/index.json (stats are
    // precomputed at authoring time so the gallery page stays dumb)
    const drawers = state.placed.filter((u) => u.fill === "decor" || u.fill === "classic").length;
    console.log("builds/index.json row:\n" +
      JSON.stringify({ id, title, tagline, length: state.length, drawers, units: state.placed.length, dims: buildMeta().dims }, null, 2));
  }

  // Download a saved build as a file, reusing its saved name (named once, at Save).
  function exportBuild(data, name) {
    const blob = new Blob([JSON.stringify({ gen2Build: 1, data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (name ? name.replace(/[^\w.-]+/g, "-") : "gen2-build") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // base64(JSON) of the build, UTF-8 safe.
  const encodeBuildHash = () => btoa(unescape(encodeURIComponent(JSON.stringify(serializeBuild()))));
  function applyBuildHash(hash) {
    // v1 decode, unchanged and tried FIRST, so every link ever printed keeps
    // decoding byte-for-byte: base64(JSON), UTF-8-safe.
    const parse = (h) => { try { return JSON.parse(decodeURIComponent(escape(atob(h)))); } catch (e) { return null; } };
    let data = parse(hash);
    // Messaging apps and some paste paths percent-encode the hash ('=' becomes
    // %3D) and atob throws. URI-decoding leaves base64's '+' and '/' alone, so
    // this fallback can never mis-read a valid raw hash - it only rescues
    // encoded copies of one.
    if (data === null) { try { data = parse(decodeURIComponent(hash)); } catch (e) { /* not URI-encoded either */ } }
    return data ? applyBuild(data) : false;
  }
  // Load a build from a #build=… link on first open. Returns true (loaded),
  // false (no link), or "damaged" - and the LAST one is the point: an explicit
  // share link that cannot be decoded used to fail SILENTLY, so the session
  // resume below showed the user's own previous build under a friend's link.
  // A wrong build means a wrong BOM - someone can print or buy the wrong
  // parts while trusting the link. Fail loudly instead, and never fall
  // through to unrelated state.
  function loadBuildFromHash() {
    const m = (location.hash || "").match(/build=([^&]+)/);
    if (!m) return false;
    if (applyBuildHash(m[1])) return true;
    showDamagedLink(true);
    track("error:share-link-damaged");
    return "damaged";
  }
  // Drop a damaged #build= from the address bar. Every recovery path calls
  // this: leaving the broken hash in place means a reload shows the error
  // again and copying the address shares the broken link onward.
  function clearShareHash() {
    // window.history EXPLICITLY: the undo/redo stack below is a const named
    // `history` and shadows the global - bare history.replaceState here is a
    // TypeError on the undo object (caught by the test suite, not in review).
    if (/build=/.test(location.hash || "")) window.history.replaceState(null, "", location.pathname + location.search);
  }
  // The damaged-link notice: a persistent banner at the top of <main> (the
  // #board-warnings box is wiped by every refresh, so it cannot hold this).
  // Recovery is always visible: Dismiss clears the broken hash and leaves
  // whatever is on the board. "Load my last build instead" appears only at
  // BOOT and only when a saved build exists - restoring it is fine as a
  // CHOICE, never as a default. It is deliberately NOT offered when a bad
  // link arrives mid-session (offerSaved=false): there it would replace the
  // user's live work with an older snapshot, a second silent-substitution
  // bug wearing a recovery label. (And deliberately not the existing "Start
  // fresh" control, which WIPES the saved session - offering that next to a
  // button whose whole value is that saved session invites destroying it.)
  function showDamagedLink(offerSaved) {
    const prev = document.getElementById("share-link-warn");
    if (prev) prev.remove();
    const box = document.createElement("div");
    box.className = "warn";
    box.id = "share-link-warn";
    const msg = document.createElement("div");
    msg.textContent = "⚠ This shared build link is damaged or incomplete, so the build it points to can't be shown. Ask for the link to be copied again (Save & share · Copy link), or paste it directly instead of forwarding it.";
    box.appendChild(msg);
    let saved = null;
    try { saved = JSON.parse(LAST_BUILD_RAW); } catch (e) { /* none */ }
    if (offerSaved && saved && Array.isArray(saved.placed) && saved.placed.length) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small warn-fix";
      btn.textContent = "Load my last build instead";
      btn.addEventListener("click", () => { if (applyBuild(saved)) { box.remove(); clearShareHash(); } });
      box.appendChild(btn);
    }
    const dis = document.createElement("button");
    dis.type = "button";
    dis.className = "btn small warn-fix";
    dis.textContent = "Dismiss";
    dis.addEventListener("click", () => { box.remove(); clearShareHash(); });
    box.appendChild(dis);
    const main = document.querySelector("main");
    if (main) main.prepend(box);
  }
  // A #build= link opened INTO an already-open planner tab is a hash-only
  // navigation - the page does not reload and boot never re-runs, so without
  // this the tab keeps showing the old build under the new address (the same
  // wrong-BOM hazard as the silent boot fallthrough, one level up). Scoped to
  // build= hashes; reads location.hash rather than the event so back/forward
  // between shared links restores each one through the same path.
  window.addEventListener("hashchange", () => {
    const m = (location.hash || "").match(/build=([^&]+)/);
    if (!m) return;                                   // not a share link - not ours
    if (applyBuildHash(m[1])) {
      const prev = document.getElementById("share-link-warn");
      if (prev) prev.remove();                        // a good link supersedes the warning
    } else {
      showDamagedLink(false);
      track("error:share-link-damaged");
    }
  });

  function shareLink() {
    if (!state.placed.length) return;
    track("share-link");
    const url = location.origin + location.pathname + "#build=" + encodeBuildHash();
    // A max-size labelled build encodes to a ~30KB+ URL. Browsers take it, but
    // chat apps and some URL fields truncate long links — steer big builds to
    // the file export instead of letting the link break silently elsewhere.
    const big = url.length > 8000;
    const flash = () => {
      const b = $("#build-share"), t = b.dataset.label || b.textContent;
      b.dataset.label = t;
      b.textContent = big ? "✓ Copied · big build · an exported file is safer" : "✓ Link copied!";
      setTimeout(() => { b.textContent = t; }, big ? 3500 : 1800);
    };
    const fallback = () => { const i = $("#share-url"); i.hidden = false; i.value = url; i.focus(); i.select(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(flash, fallback);
    } else fallback();
  }

  /* 3D assembly instructions: hand the build to the GEN2 instructions viewer
     using the same #build= encoding as share links. The viewer generates the
     step-by-step 3D manifest from planner state at runtime — no backend.
     Environment-aware: a planner running from localhost (or opened as a file)
     links to the LOCAL viewer dev server (viewer/ on :8123) so both tools can
     be tested together before deploying; anywhere else links to the deployed
     viewer on its permanent custom domain (2026-07-23 — the old
     jerrari12.github.io/gen2-visual-animator/ URL 301-redirects there). */
  const IS_LOCAL_DEV = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  const INSTRUCTIONS_VIEWER_URL = IS_LOCAL_DEV
    ? "http://localhost:8123/"
    : "https://gen2build.jerrari3d.com/";
  /* The official-kits gallery is a page of that same site. Point the header +
     footer nav links at it here so local dev walks between the two tools
     (the kits page carries the mirror-image link back to the planner). */
  const KITS_URL = INSTRUCTIONS_VIEWER_URL + "builds/";
  for (const a of document.querySelectorAll(".kits-link")) a.href = KITS_URL;
  /* Hand the light/dark choice across the origin boundary. The two sites keep
     separate localStorage, so a nav link carries the current pick + its stamp
     and the far side adopts it only if it's newer (its own head snippet does
     the comparing). Rewritten in a CAPTURE-phase click, not once at load, so
     the value is whatever the switch says at the moment you click — and
     searchParams.set keeps it idempotent across repeat clicks. Nothing stored
     = nothing appended, so an untouched visitor just meets the default. */
  const withTheme = (href) => {
    try {
      const v = localStorage.getItem("gen2-theme");
      if (v !== "dark" && v !== "light") return href;
      const u = new URL(href, location.href);
      u.searchParams.set("theme", v);
      u.searchParams.set("tt", localStorage.getItem("gen2-theme:t") || "0");
      return u.href;
    } catch (e) { return href; }
  };
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a.kits-link");
    if (a) a.href = withTheme(a.href);
  }, true);
  // keep the child ref (NO noopener) so build-option changes sync both ways;
  // cross-origin still limits the child to postMessage, so it's safe first-party.
  let viewerWin = null, applyingRemoteOpts = false, lastSentOpts = null;
  function open3DInstructions() {
    if (!state.placed.length) return;
    track("3d-instructions:" + state.mount + "-" + state.length);
    // dock already open → the button now means "give me the FULL studio"
    if (document.body.classList.contains("docked")) { popOutStudio(); return; }
    // a real popped-out tab is already following along → sync + focus it
    // instead of opening a duplicate (the dock's iframe doesn't count — you
    // can't focus something invisible)
    const f = $("#viewer-frame");
    const frameWin = f ? f.contentWindow : null;
    if (viewerWin && !viewerWin.closed && viewerWin !== frameWin) {
      lastSentLayout = null;
      postLayoutNow();
      try { viewerWin.focus(); } catch (e) { /* cross-origin focus denied — fine */ }
      return;
    }
    // the dock exists but is collapsed → expanding it is the cheapest 3D
    if (dockAvailable()) { track("dock:expand"); openDock(false); return; }
    viewerWin = window.open(INSTRUCTIONS_VIEWER_URL + "#build=" + encodeBuildHash(), "_blank");
  }
  // push the current build options to an open viewer tab, but only when they've
  // actually changed (and never while applying a change the viewer just sent).
  function syncOptionsToViewer() {
    if (applyingRemoteOpts || !viewerWin || viewerWin.closed) return;
    const closures = {};
    state.placed.forEach((u) => { if (u.fill === "decor" || u.fill === "classic") closures[u.id] = u.closure === "magnet" ? "magnet" : "none"; });
    const opts = { closures, removedStoppers: state.removedStoppers || [], wallStagger: !!state.wallStagger, handleStyle: state.handleStyle, faceStyle: state.faceStyle, backCover: !!state.backCover, feet: state.feet === "adhesive" ? "adhesive" : "tpu" };
    const json = JSON.stringify(opts);
    if (json === lastSentOpts) return;
    lastSentOpts = json;
    try { viewerWin.postMessage({ gen2: "buildOptions", opts }, "*"); } catch (e) { /* tab closed */ }
  }

  /* ---- Live LAYOUT sync (planner → viewer, 2026-07-19) ----
     Placing / moving / removing units re-generates the open 3D viewer live —
     it posts the FULL serialized build (same shape as the #build= hash), so
     the viewer re-runs its generator and the step list follows the layout.
     While the layout is instructions-blocked (instructionsBlockReason), the
     viewer instead gets the reason and greys itself out — mirroring the greyed
     3D button here — and catches up the moment the board is legal again.
     Debounced (drags refresh() per cell) + signature-guarded (options-only
     changes ride the cheaper buildOptions channel above, never this one). */
  let lastSentLayout = null, layoutTimer = 0;
  const layoutSig = () => JSON.stringify({
    m: state.mount, l: state.length, r: instructionsBlockReason()?.code || "",
    p: state.placed.map((u) => [u.id, u.x, u.y, u.w, u.hh, u.fill, u.shelves || 0, u.label || "", u.closure || "", JSON.stringify(u.interior || null)]),
  });
  function postLayoutNow() {
    if (!viewerWin || viewerWin.closed) return;
    const sig = layoutSig();
    if (sig === lastSentLayout) return;
    lastSentLayout = sig;
    const reason = instructionsBlockReason();
    try {
      // the viewer's blocked overlay renders this as text — send the prose, not the code
      if (reason) viewerWin.postMessage({ gen2: "layoutBlocked", reason: reason.text }, "*");
      else viewerWin.postMessage({ gen2: "layout", build: serializeBuild() }, "*");
    } catch (e) { /* tab closed */ }
  }
  function syncLayoutToViewer() {
    if (!viewerWin || viewerWin.closed) return;
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(postLayoutNow, 350);
  }

  /* ---- viewer palette relay (2026-07-19) ----
     Filament colors are VIEWER state (the planner never interprets them), but
     the viewer's localStorage is partitioned when it runs as the dock's
     cross-site iframe — so the dock and a popped-out tab can't see each
     other's picks. The planner is the relay: it caches the newest stamped
     palette here (first-party storage, never partitioned) and replays it on
     every viewerReady, so every viewer context converges on the latest. */
  let viewerColors = null;
  try { viewerColors = JSON.parse(localStorage.getItem("gen2-viewer-colors") || "null"); } catch (e) { /* fresh */ }
  function cacheViewerColors(d) {
    if (!d || typeof d.t !== "number" || !d.colors || typeof d.colors !== "object") return;
    if (viewerColors && viewerColors.t >= d.t) return; // stale — newest wins
    viewerColors = { t: d.t, colors: d.colors, on: !!d.on, user: d.user };
    try { localStorage.setItem("gen2-viewer-colors", JSON.stringify(viewerColors)); } catch (e) { /* private mode — memory cache still serves this session */ }
  }
  function postColorsToViewer() {
    if (!viewerColors || !viewerWin || viewerWin.closed) return;
    try { viewerWin.postMessage({ gen2: "colors", ...viewerColors }, "*"); } catch (e) { /* tab closed */ }
  }

  /* ---- preferred 3D model site (2026-07-25) ----
     Which site the parts list links FIRST. Unlike the palette this is real
     planner state (it renders its own BOM links with it), but it rides the
     same newest-wins-by-stamp channel so the dock, a popped-out viewer and
     the planner all agree. Deliberately NOT a BUILD_FIELD — it's a device
     preference, not part of the build, so it never rides a share link, and
     deliberately not on `buildOptions` (that channel regenerates the scene).
     Seeded from ?from=<site> — the link printed in each platform's own
     description — or the referrer, but ONLY when nothing was chosen before:
     arriving from Thangs must never overwrite a deliberate pick. */
  const SITE_KEY = "gen2-link-store";
  const siteById = Object.fromEntries(STORES.map((s) => [s.id, s]));
  function siteFromEntry() {
    const from = (new URLSearchParams(location.search).get("from") || "").toLowerCase();
    if (siteById[from]) return from;
    try {
      const host = new URL(document.referrer).hostname;
      const hit = STORES.find((s) => host === s.host || host.endsWith("." + s.host));
      if (hit) return hit.id;
    } catch (e) { /* no/opaque referrer — fine */ }
    return null;
  }
  let linkSite = siteById[store.get(SITE_KEY)] ? store.get(SITE_KEY) : (siteFromEntry() || STORES[0].id);
  let linkSiteT = +(store.get(SITE_KEY + ":t") || 0) || 0;
  function setLinkSite(id, { relay = true } = {}) {
    if (!siteById[id] || id === linkSite) return;
    linkSite = id;
    if (relay) { linkSiteT = Date.now(); postSiteToViewer(); }
    store.set(SITE_KEY, linkSite);
    store.set(SITE_KEY + ":t", String(linkSiteT));
    const sel = $("#link-site");
    if (sel) sel.value = linkSite;
    renderBom();
  }
  function postSiteToViewer() {
    if (!viewerWin || viewerWin.closed) return;
    try { viewerWin.postMessage({ gen2: "store", t: linkSiteT, store: linkSite }, "*"); } catch (e) { /* tab closed */ }
  }
  /* The retrowave look rides to the studio so its stage matches the planner
     (light stage stays the color-accurate default there — see the viewer's
     STAGE_THEMES). The toggle itself is a standalone inline script in
     index.html; observing the html[data-theme] attribute keeps the two
     decoupled, and viewerReady replays the current value like the palette. */
  function postThemeToViewer() {
    if (!viewerWin || viewerWin.closed) return;
    try { viewerWin.postMessage({ gen2: "theme", theme: document.documentElement.dataset.theme || "light" }, "*"); } catch (e) { /* tab closed */ }
  }
  try {
    new MutationObserver(postThemeToViewer)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) { /* ancient browser — the viewerReady replay still covers boot */ }
  function applyRemoteSite(d) {
    if (!d || typeof d.t !== "number" || !siteById[d.store]) return;
    if (d.t <= linkSiteT) { if (linkSiteT > d.t) postSiteToViewer(); return; } // ours is newer — teach the other side
    linkSiteT = d.t;                        // adopt the stamp so the exchange converges
    setLinkSite(d.store, { relay: false });
  }
  /* Order the sites for one part: preferred first, then the table's fallback
     order. Only sites with a REAL url are offered as alternatives — a search
     fallback is a guess, not "you can also get it here". */
  function closeSiteMenus() {
    document.querySelectorAll(".link-more-menu").forEach((m) => { m.hidden = true; });
  }
  document.addEventListener("click", (e) => { if (!e.target.classList.contains("link-more-btn")) closeSiteMenus(); });
  function sitesFor(links) {
    const real = links.stores.filter((s) => s.exact);
    const pref = real.filter((s) => s.id === linkSite);
    const rest = real.filter((s) => s.id !== linkSite);
    if (pref.length || rest.length) return [...pref, ...rest];
    // nothing exact anywhere: keep the historical behaviour — a ghosted search
    // on the preferred site (Printables unless the user changed it)
    return [links.stores.find((s) => s.id === linkSite) || links.stores[0]];
  }

  /* ---- Docked split view (2026-07-19) ----
     Wide screens get the viewer as a fixed right pane (an ?embed=1 iframe fed
     by the live sync above) instead of a separate tab. It reveals itself —
     eased, one time — the first moment the build becomes instructions-ready
     (same instant the 3D button lights up); after that the open/closed choice
     is remembered per device (localStorage gen2-dock) and it NEVER auto-hides
     — an illegal layout shows the viewer's own blocked veil instead. Software
     GPUs (SwiftShader & co) skip the auto-reveal and get the opt-in edge tab;
     a viewer-measured low framerate offers a collapse (#dock-perf). */
  let dockBooted = false, gpuSlow = null;
  const dockPref = () => { try { return localStorage.getItem("gen2-dock"); } catch (e) { return null; } };
  const setDockPref = (v) => { try { localStorage.setItem("gen2-dock", v); } catch (e) { /* private mode */ } };
  const dockWide = () => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1200px)").matches;
  function slowGpu() {
    if (gpuSlow !== null) return gpuSlow;
    try {
      const gl = document.createElement("canvas").getContext("webgl2")
              || document.createElement("canvas").getContext("webgl");
      if (!gl) return (gpuSlow = true);
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      gpuSlow = /swiftshader|llvmpipe|software|basic render/i.test(r);
    } catch (e) { gpuSlow = true; }
    return gpuSlow;
  }
  // the dock needs a LEGAL build for its first boot (the iframe boots from a
  // #build= hash); once booted it stays available — blocked layouts just veil
  const dockAvailable = () => dockWide() && (dockBooted || !instructionsBlockReason());
  function bootDockFrame() {
    if (dockBooted) return;
    dockBooted = true;
    $("#viewer-frame").src = INSTRUCTIONS_VIEWER_URL + "?embed=1#build=" + encodeBuildHash();
  }
  function openDock(firstReveal) {
    bootDockFrame();
    $("#viewer-dock").hidden = false;
    $("#dock-tab").hidden = true;
    // class lands a frame after the un-hide so the first reveal still eases in
    const arm = () => document.body.classList.add("docked");
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(arm); else arm();
    setDockPref("open");
    if (firstReveal) track("dock:reveal");
  }
  function closeDock() {
    document.body.classList.remove("docked");
    $("#viewer-dock").hidden = true;
    $("#dock-perf").hidden = true;
    $("#dock-tab").hidden = !dockAvailable();
    setDockPref("closed");
    track("dock:collapse");
  }
  function updateDock() {
    const dock = $("#viewer-dock"), tab = $("#dock-tab");
    if (!dock || !tab) return;
    if (!dockAvailable()) { // too narrow, or nothing legal to boot on yet
      dock.hidden = true;
      tab.hidden = true;
      document.body.classList.remove("docked");
      return;
    }
    const pref = dockPref();
    if (pref === "open") { // restore (no animation ceremony, no re-track)
      if (dock.hidden) { bootDockFrame(); dock.hidden = false; document.body.classList.add("docked"); }
      tab.hidden = true;
      return;
    }
    if (pref === "closed") {
      dock.hidden = true;
      document.body.classList.remove("docked");
      tab.hidden = false;
      return;
    }
    // no preference yet → the one-time reveal moment
    if (slowGpu()) {
      tab.hidden = false;
      tab.title = "Open the live 3D preview · may run slow on this device";
      return;
    }
    openDock(true);
  }
  function popOutStudio() {
    track("dock:popout");
    const w = window.open(INSTRUCTIONS_VIEWER_URL + "#build=" + encodeBuildHash(), "_blank");
    if (w) viewerWin = w; // the full tab takes over the sync; the dock naps
    closeDock();
  }

  // ---- dock width: percent of the viewport, draggable at the seam ----
  // Stored in vw units (gen2-dock-w) so a saved width scales with the screen;
  // the grip drags within [28vw, 62vw] plus a 380px floor and a "planner
  // keeps >=520px" guard so neither side can be crushed.
  const DOCK_W_MIN_VW = 28, DOCK_W_MAX_VW = 62, DOCK_W_MIN_PX = 380, PLANNER_MIN_PX = 520;
  function clampDockVw(vw) {
    const w = window.innerWidth || 1600;
    let v = Math.max(DOCK_W_MIN_VW, Math.min(DOCK_W_MAX_VW, vw));
    v = Math.max(v, (DOCK_W_MIN_PX / w) * 100);          // never thinner than the viewer can use
    v = Math.min(v, ((w - PLANNER_MIN_PX) / w) * 100);   // never so wide the planner is crushed
    return Math.round(v * 10) / 10;
  }
  function applyDockW(vw) {
    document.documentElement.style.setProperty("--dock-w", clampDockVw(vw) + "vw");
  }
  try {
    const saved = parseFloat(localStorage.getItem("gen2-dock-w"));
    if (saved) applyDockW(saved);
  } catch (e) { /* private mode — CSS default stands */ }
  /* ---- FAB vs the unit toolbar (2026-08-02) ----
     Both claim the bottom-right corner on a phone, and they genuinely collide:
     ~2900px² of "Remove unit" sat under the floating 3D button, so a tap meant
     to delete a unit opened the Studio instead.
     ⚠ "Hide it while a unit is selected" is NOT available: there is no deselect
     gesture (state.selectedUnit clears only on remove / clear / example /
     restore), so the FAB would stay hidden for the rest of the session. It
     steps aside only while the toolbar is BOTH active and actually on screen —
     precisely when you're editing — and comes back as soon as you scroll away.
     Purely an enhancement: without IntersectionObserver the FAB just behaves
     as it always did. */
  let toolbarOnScreen = false;
  function syncFabAvoidance() {
    const tb = $(".unit-toolbar");
    document.body.classList.toggle("fab-clear",
      toolbarOnScreen && !!tb && tb.classList.contains("active"));
  }
  function bindFabAvoidance() {
    const tb = $(".unit-toolbar");
    if (!tb || typeof IntersectionObserver !== "function") return;
    new IntersectionObserver((entries) => {
      toolbarOnScreen = entries[entries.length - 1].isIntersecting;
      syncFabAvoidance();
    }, { threshold: 0 }).observe(tb);
  }

  function bindDockGrip() {
    const grip = $("#dock-grip");
    if (!grip) return;
    let curVw = null;
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/odd pointer — window moves still reach us via the grip */ }
      document.body.classList.add("dock-resizing");
      const move = (ev) => {
        curVw = clampDockVw(((window.innerWidth - ev.clientX) / window.innerWidth) * 100);
        document.documentElement.style.setProperty("--dock-w", curVw + "vw");
      };
      const up = () => {
        document.body.classList.remove("dock-resizing");
        grip.removeEventListener("pointermove", move);
        if (curVw) { try { localStorage.setItem("gen2-dock-w", String(curVw)); } catch (err) { /* private mode */ } }
        track("dock:resize");
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up, { once: true });
      grip.addEventListener("pointercancel", up, { once: true });
    });
  }

  // ---- Start fresh (Joey 2026-07-19): the auto-resume escape hatch ----
  // Session resume is sticky BY DESIGN (a closed tab keeps the build); this
  // wipes the saved session + the dock preference and reloads — a true
  // first-visit boot: three questions, everything collapsed, the 3D pane
  // waiting for its one-time reveal. Confirmed first, pointing at SAVE.
  function startFresh() {
    const msg = "Start fresh?\n\n" +
      "This clears the current build and every choice (mount, printer, length, layout, options) and returns to question 1.\n\n" +
      "Tip: your current build will be lost — use the SAVE button (left panel) first to keep a copy on your computer. You can LOAD it back anytime.";
    if (!window.confirm(msg)) return;
    track("start-fresh");
    // A popped-out 3D Build Studio would sit there showing the build we just
    // threw away — nothing left to sync it to, so close it with the reset
    // (Joey 2026-07-24). The dock's iframe needs no help: it dies with the
    // reload. Same frameWin test open3DInstructions uses to tell them apart.
    const f = $("#viewer-frame");
    const frameWin = f ? f.contentWindow : null;
    if (viewerWin && !viewerWin.closed && viewerWin !== frameWin) {
      try { viewerWin.close(); } catch (e) { /* already gone / not ours to close */ }
    }
    viewerWin = null;
    try { localStorage.removeItem("gen2-last-build"); } catch (e) { /* private mode */ }
    try { localStorage.removeItem("gen2-dock"); } catch (e) { /* private mode */ }
    try { location.reload(); } catch (e) { /* jsdom — tests assert the storage wipe */ }
  }

  function importBuild(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let ok = false;
      try { const p = JSON.parse(reader.result); ok = applyBuild(p && p.data ? p.data : p); } catch (e) { ok = false; }
      if (ok) track("load-build");
      if (!ok) {
        const box = $("#board-warnings");
        warn(box, "That file isn't a valid GEN2 build.");
      }
    };
    reader.readAsText(file);
  }

  function renderBoardMeta() {
    const meta = $("#board-meta");
    if (!state.placed.length) {
      meta.textContent = "Layout is empty · place your first unit.";
      return;
    }
    const minX = Math.min(...state.placed.map((p) => p.x));
    const maxX = Math.max(...state.placed.map((p) => p.x + p.w));
    const minY = Math.min(...state.placed.map((p) => p.y));
    const maxY = Math.max(...state.placed.map((p) => p.y + p.hh));
    const wmm = (maxX - minX) * GEN2.units.widthMM;
    const hmm = (maxY - minY) * (GEN2.units.heightMM / 2);
    meta.textContent =
      `${state.placed.length} unit${state.placed.length > 1 ? "s" : ""} · ` +
      `footprint ≈ ${wmm}mm W × ${hmm}mm H × ${state.length}mm D`;
  }

  /* Auto-correct "unsupported on both ends": first settle every unit toward the
     mount surface (free — no new parts), then fill any remaining open-end gaps
     with the fewest 1W cases. Mirrored for hanging mounts. Returns a tally. */
  function fixStructure() {
    const fromTop = state.mount !== "tabletop";
    const step = fromTop ? -1 : 1;                       // one half-row toward the surface
    const startY = new Map(state.placed.map((p) => [p.id, p.y]));

    // 1) Gravity settle, repeating until nothing moves (cases nearest the
    //    surface settle first so the ones above land on them).
    let changed = true, guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      [...state.placed]
        .sort((a, b) => fromTop ? a.y - b.y : (b.y + b.hh) - (a.y + a.hh))
        .forEach((p) => {
          while (canPlace(p.x, p.y + step, p.w, p.hh, p.id)) { p.y += step; changed = true; }
        });
    }

    // 2) Fill remaining open ends until every unit is supported.
    let added = 0, guard2 = 0;
    const onSurface = (p) => fromTop ? p.y === 0 : p.y + p.hh === rows();
    while (guard2++ < 300) {
      const occ = occupancy();
      const bad = state.placed.find((p) => {
        if (onSurface(p)) return false;
        const s = fromTop ? p.y - 1 : p.y + p.hh;
        return !(occ.has(p.x + "," + s) && occ.has((p.x + p.w - 1) + "," + s));
      });
      if (!bad) break;
      const s = fromTop ? bad.y - 1 : bad.y + bad.hh;
      [bad.x, bad.x + bad.w - 1].forEach((c) => {
        if (!occ.has(c + "," + s)) added += fillColumn(c, s, step);
      });
    }

    clampGrid();
    const moved = state.placed.filter((p) => startY.has(p.id) && startY.get(p.id) !== p.y).length;
    return { moved, added };
  }

  /* COMPLETION OVERLAY (tabletop). For every run whose top is not level yet:
     a dashed target line across the run at its tallest column's top, a
     hatched cell over every missing half-row in the short columns, and a
     "Fill to this line" tag. Hatch + dash + text, never colour alone. The
     cells are the SHARED deficit (tabletop-completion.js), so what the board
     hatches is exactly what the viewer ghosts. */
  function drawCompletion(svg, gx, gy) {
    const done = tabletopCompletion();
    if (done.complete) return;
    const half = CH / 2;
    // one hatch pattern per render (the board is rebuilt from scratch each time)
    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: "fill-hatch", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { x: 0, y: 0, width: 8, height: 8, class: "g-fill-hatch-bg" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 8, class: "g-fill-hatch" }, pat);
    done.cells.forEach((c) => {
      el("rect", { x: gx + c.x * CW + 2, y: gy + c.y * half + 2, width: CW - 4, height: half - 4, rx: 3,
        class: "g-fill-cell", fill: "url(#fill-hatch)" }, svg);
    });
    done.runs.forEach((r) => {
      if (!done.columns.some((c) => c.x >= r.c0 && c.x <= r.c1)) return; // this run is level
      const y = gy + r.top * half, x0 = gx + r.c0 * CW, x1 = gx + (r.c1 + 1) * CW;
      el("line", { x1: x0, y1: y, x2: x1, y2: y, class: "g-fill-line" }, svg);
      el("text", { x: x1 - 4, y: y - 4, class: "g-fill-label", "text-anchor": "end" }, svg).textContent = "Fill to this line";
    });
  }

  /* Fill the empty run in column c from row `s` toward the surface (direction
     `step`) with stacked 1W cases — 1H where it fits, a 0.5H for the remainder. */
  function fillColumn(c, s, step) {
    const occ = occupancy();
    const cells = [];
    for (let y = s; y >= 0 && y < rows() && !occ.has(c + "," + y); y += step) cells.push(y);
    if (!cells.length) return 0;
    noteBuildStart();   // the structure-fixer adding cases is a user action too
    const lo = Math.min(...cells), hi = Math.max(...cells) + 1;
    let added = 0;
    for (let y = lo; y < hi; ) {
      const hh = (hi - y) >= 2 ? 2 : 1;
      state.placed.push({ id: state.nextId++, x: c, y, w: 1, hh, fill: "classic", shelves: 0 });
      y += hh; added++;
    }
    return added;
  }

  /* Soft "bow" risk: a GEN2 plate bows when a narrower case loads the INTERIOR
     of a wider case (away from its end walls) and the wider case isn't supported
     across its full span on that side. End-aligned, same-width, and fully-tiled
     (distributed) joins are fine. Returns the set of wider-case ids at risk. */
  function bowRisks() {
    const flagged = new Set();
    const occ = occupancy();
    state.placed.forEach((wide) => {
      state.placed.forEach((narrow) => {
        if (narrow === wide || narrow.w >= wide.w) return;
        const above = narrow.y + narrow.hh === wide.y;   // narrow rests on wide's top
        const below = wide.y + wide.hh === narrow.y;     // narrow hangs under wide
        if (!above && !below) return;
        // narrow lands on wide's interior — touching neither end column
        if (!(narrow.x > wide.x && narrow.x + narrow.w < wide.x + wide.w)) return;
        // is wide's span fully covered on the narrow side? (distributed = no bow)
        const adjRow = above ? wide.y - 1 : wide.y + wide.hh;
        let covered = 0;
        for (let c = wide.x; c < wide.x + wide.w; c++) if (occ.has(c + "," + adjRow)) covered++;
        if (covered < wide.w) flagged.add(wide.id);
      });
    });
    return flagged;
  }

  /* Sag risk: rigidity flows from the mount surface — a tabletop pushes up
     from below, under-table/wall rails hold from above. A unit still
     QuickLocks into the female dovetails of its neighbors on the far side
     (case/covers above on a tabletop, units below when hanging), but if
     NEITHER of its side walls lands on a wall of the case in the row toward
     the mount — an open case or drawer spans there instead — that dovetail
     connection is all that carries it, and it droops. E.g. 1W drawers
     mid-span over a 4W-2H's open top in a tabletop kit, or a 1W-1H hanging
     mid-span under a 3W in an under-table kit. One aligned wall locks
     solid, so it doesn't flag. Ends over EMPTY cells toward the mount are
     the both-ends support warning's job. Returns sagging unit ids. */
  function sagRisks() {
    const flagged = new Set();
    const occ = occupancy();
    const fromTop = state.mount !== "tabletop";
    state.placed.forEach((p) => {
      if (fromTop ? p.y === 0 : p.y + p.hh === rows()) return; // on the mount surface
      const supRow = fromTop ? p.y - 1 : p.y + p.hh;
      // an end over empty space is the other warning's case — skip it here
      if (!occ.has(p.x + "," + supRow) || !occ.has((p.x + p.w - 1) + "," + supRow)) return;
      // wall positions offered by the units it rests against
      const walls = new Set();
      state.placed.forEach((u) => {
        if (fromTop ? u.y + u.hh === p.y : u.y === supRow) { walls.add(u.x); walls.add(u.x + u.w); }
      });
      if (!walls.has(p.x) && !walls.has(p.x + p.w)) flagged.add(p.id);
    });
    return flagged;
  }

  /* Wall mounts hang the exposed top row from a single bracket course, but a
     0.5H case (hh === 1 half-row) is too low-profile to carry wall-mount holes
     — so no top-row case on a wall build can be 0.5H. Capping a 0.5H unit with a
     taller unit above makes it no longer a top case, which is fine. Wall-only:
     tabletop stacks from the surface and under-table hangs from rails, neither
     of which needs holes in the case itself. Returns the offending top-row ids. */
  function wallTopHalfHeight() {
    if (state.mount !== "wall") return new Set();
    return new Set(topCases().filter((p) => p.hh === 1).map((p) => p.id));
  }

  /* Auto-correct the wall top row: grow each offending 0.5H case to 1H IN PLACE
     (same unit object — its label, fill, and closure all survive), cascading
     everything below it down one half-row to make room. Grows the grid if the
     cascade needs it; if the grid is already at its max, reverts everything and
     returns null (clampGrid() deletes off-board units, and a fix must never
     silently eat someone's named drawer). Returns a tally for the fix note. */
  function fixWallTops() {
    const ids = wallTopHalfHeight();
    if (!ids.size) return { grown: 0, moved: 0 };
    const before = state.placed.map((p) => ({ ...p }));
    const overlap = (a, b) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.hh && b.y < a.y + a.hh;
    const movedIds = new Set();
    ids.forEach((id) => {
      const p = state.placed.find((u) => u.id === id);
      p.hh = 2;
      // everything the grown case now overlaps shifts down one half-row —
      // transitively, so the whole stack below keeps its relative spacing
      const pushed = new Set([p.id]);
      let changed = true, guard = 0;
      while (changed && guard++ < 300) {
        changed = false;
        state.placed.forEach((v) => {
          if (pushed.has(v.id)) return;
          if (state.placed.some((u) => pushed.has(u.id) && overlap(u, v))) {
            v.y += 1; pushed.add(v.id); movedIds.add(v.id); changed = true;
          }
        });
      }
    });
    const maxY = Math.max(...state.placed.map((p) => p.y + p.hh));
    // don't push past the grid cap — clampGrid() would then delete the off-grid
    // units (and a named drawer with them). Bail out cleanly instead.
    if (maxY > capH() * 2) { state.placed = before; return null; }
    state.gridH = Math.max(state.gridH, Math.ceil(maxY / 2));
    return { grown: ids.size, moved: movedIds.size };
  }

  // Lengths whose under-table RAIL models exist in the 3D viewer's part
  // library (viewer generate.js COLL) — every length works for Table Top and
  // Wall Mount. Drives the button reason, the board note and the length-card
  // "no 3D guide yet" badge, so the three can never disagree.
  const VIEWER_UT_LENGTHS = [59, 115, 165, 185, 240, 270]; // complete 2026-07-19 — every collection's rail GLBs are in the viewer library, so nothing badges "no 3D guide" for under-table anymore

  // Units not held on BOTH ends toward the mount surface — the board's hard
  // structural warning, shared with the 3D-studio gate below.
  function unsupportedUnits() {
    const occ = occupancy();
    const fromTop = state.mount !== "tabletop";
    return state.placed.filter((p) => {
      if (fromTop ? p.y === 0 : p.y + p.hh === rows()) return false; // sits on the mount surface
      const supRow = fromTop ? p.y - 1 : p.y + p.hh;                 // adjacent row toward the mount
      const left = occ.has(p.x + "," + supRow);
      const right = occ.has((p.x + p.w - 1) + "," + supRow);
      return !(left && right);
    });
  }

  // Why the 3D Build Studio can't show the current layout (null = it can).
  // ONE source of truth for the button/fab grey-out, the visible reason line,
  // and the live-sync "blocked" message to an open viewer — so they can never
  // disagree. Hard structural problems (unsupported, sag) block too: they're
  // un-instruction-able states, same as the board's hard warnings; soft
  // advisories (bow risk) don't.
  /* Returns null when the layout is instructions-ready, else {code, text}.
     `text` is the prose shown under the button and relayed to the viewer's
     blocked overlay; `code` is a fixed token safe to use as an analytics event
     name — the prose can't be, it interpolates the collection length and would
     be a cardinality explosion (and the doc's rule is no free text in event
     names). Keep the two in step: a new condition needs both. */
  function instructionsBlockReason() {
    if (!state.placed.length)
      return { code: "empty", text: "Place some units first." };
    if (state.placed.some((p) => !sizeExists(p.w, p.hh / 2, p.fill)))
      return { code: "bad-size", text: "Fix the build first · some placed units don't exist in the " + state.length + " collection (see the board warning)." };
    if (unsupportedUnits().length)
      return { code: "unsupported", text: "Fix the build first · some units aren't supported on both ends (see the board warning · Fix structure can do it for you)." };
    if (sagRisks().size)
      return { code: "sag", text: "Fix the build first · some units would sag mid-span (see the board warning)." };
    // An UNEVEN TABLETOP TOP is no longer a block (2026-08-23, Joey): every
    // kit passes through that state while a column is being built, and the
    // viewer now renders it as an in-progress preview (ghost boxes over the
    // missing volume, covers translucent until the run is level). The board
    // shows completion guidance instead of a warning - renderWarnings().
    if (state.mount === "wall" && wallTopHalfHeight().size)
      return { code: "wall-05h", text: "Fix the build first · Wall Mount top-row cases can't be 0.5H · they're too low-profile for wall-mount holes. Put a 1H (or taller) case on top." };
    if (state.mount === "under-table" && !VIEWER_UT_LENGTHS.includes(+state.length))
      return { code: "no-ut-rails", text: "3D instructions can't show under-table " + state.length + " builds yet · the rail models aren't in the 3D part library. Table Top and Wall Mount work for every collection." };
    // ⚠ These two MIRROR the viewer generator's own refusals (generate.js:
    // "Cabinet units need case-extender models…" / "Shelves taller than 1H…").
    // Without them the button stayed lit on a cabinet or tall-shelf layout and
    // the hand-off opened a new tab straight onto an error overlay — the exact
    // failure the reason-gate exists to prevent, and a well-travelled path:
    // shelf + cabinet are ~31% of fill picks. Keep the pair in step; if case
    // extenders ever reach the 3D library, both sides drop together.
    if (state.placed.some((p) => p.fill === "cabinet"))
      return { code: "cabinet", text: "3D instructions can't show Cabinet units yet · they need case-extender models that aren't in the 3D part library. You can still plan and print them." };
    if (state.placed.some((p) => p.fill === "shelf" && p.hh !== 2))
      return { code: "shelf-tall", text: "3D instructions can only show 1H shelves · taller ones use case extenders that aren't in the 3D part library yet. You can still plan and print them." };
    return null;
  }
  /* Each distinct limitation is counted ONCE per session — and only after the
     layout SITS in that state. updateInstructionsButton runs on every refresh()
     (per cell during a drag), and every normal build session passes through
     transiently-invalid layouts constantly: dragging across occupied cells,
     flipping tabletop → under-table, moving a support out before its
     replacement is in. Counting first sight made `unsupported` the top
     "failure" on the dashboard when it was mostly people mid-edit. The timer
     RESTARTS on every refresh, so any activity postpones it — the event now
     means "left the build broken for 3s+", not "brushed past invalid".
     "empty" is excluded: it's the starting state everyone passes through. */
  const blockSeen = new Set();
  const BLOCK_SETTLE_MS = 3000;
  let blockTimer = 0;
  function noteBlockedSettled(reason) {
    clearTimeout(blockTimer);
    const code = reason && reason.code !== "empty" ? reason.code : "";
    if (!code || blockSeen.has(code)) return;
    blockTimer = setTimeout(() => {
      blockSeen.add(code);
      track("instructions-blocked:" + code);
    }, BLOCK_SETTLE_MS);
  }

  // The 3D-instructions button greys out (with the reason as its tooltip)
  // whenever the layout isn't instructions-ready — same conditions as the
  // board warnings, so the two never disagree.
  function updateInstructionsButton() {
    const btn = $("#instructions-3d");
    if (!btn) return;
    const reason = instructionsBlockReason();
    // capability gaps are invisible otherwise: these are people who wanted a 3D
    // guide and couldn't have one, which is the planner's rules meeting a real build
    noteBlockedSettled(reason);
    // a disabled button is pointer-events:none (so the demand catch below the
    // DOM can hear clicks) — which also mutes its native tooltip; mirror the
    // reason onto the wrapper so hover still explains the grey
    if (btn.parentElement && btn.parentElement.id === "instructions-3d-wrap")
      btn.parentElement.title = (reason && reason.text) || "";
    btn.disabled = !!reason;
    btn.title = (reason && reason.text) || "Open the 3D Build Studio · step-by-step assembly for this exact build, plus colors and hardware options";
    // Form-validation style: the reason is VISIBLE under the button, not just a
    // hover tooltip (tooltips never show on touch — the greyed button read as
    // broken). The marketing sub-line hides while the reason shows, so the two
    // don't contradict each other.
    const reasonEl = $("#instructions-3d-reason");
    if (reasonEl) {
      reasonEl.hidden = !reason;
      reasonEl.textContent = reason ? "⚠ " + reason.text : "";
    }
    const sub = document.querySelector(".bom-actions-sub");
    if (sub) sub.hidden = !!reason;
    // the floating twin follows the same readiness: hidden until something is
    // placed (nothing to open), greyed with the reason while the build isn't
    // legal, live the moment it is — the feature stays present without the
    // user having to find the button at the very bottom of the page.
    const fab = $("#fab-3d");
    if (fab) {
      fab.hidden = !state.placed.length;
      fab.disabled = !!reason;
      fab.title = btn.title;
    }
  }

  function renderWarnings() {
    const box = $("#board-warnings");
    box.innerHTML = "";
    updateInstructionsButton();
    if (!state.placed.length) return;

    // Support toward the mount surface (top for under-table & wall, bottom for
    // tabletop). A case QuickLocks to whatever sits in the adjacent row and must
    // be held on BOTH its left and right ends — one-sided support cantilevers
    // and isn't buildable.
    const fromTop = state.mount !== "tabletop";
    const unsupported = unsupportedUnits();
    if (unsupported.length) {
      const div = warn(box, fromTop
        ? `${unsupported.length} unit(s) aren't supported on both ends · a case QuickLocks to the row above and needs a unit above its left and right edges. Move it to the top row, or fill the gap above the open end.`
        : `${unsupported.length} unit(s) aren't supported on both ends · tabletop stacks build from the surface, so each case needs a unit below its left and right edges. Move it down, or fill the gap under the open end.`);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small warn-fix";
      btn.textContent = "Fix structure";
      btn.addEventListener("click", () => {
        const r = fixStructure();
        refresh();
        const note = document.createElement("div");
        note.className = "fix-note";
        note.textContent = `✓ Structure fixed · ${r.moved} unit${r.moved === 1 ? "" : "s"} moved`
          + (r.added ? `, ${r.added} support case${r.added === 1 ? "" : "s"} added` : "") + ".";
        $("#board-warnings").prepend(note);
      });
      div.appendChild(btn);
    }

    // side walls landing on a wider case's open top (or hanging under one) sag in
    const sags = sagRisks();
    if (sags.size) {
      warn(box, fromTop
        ? `${sags.size} unit(s) would sag · this kit hangs from its rails, so rigidity comes from above · and these sit under an open case or drawer, with neither side wall meeting a wall of the case above. They'd hang mid-span off the dovetails alone and droop. Align at least one edge with a wall above, or match widths. (One wider drawer mid-span sags the same way.)`
        : `${sags.size} unit(s) would sag · a Table Top kit is only rigid from the table surface up · and these sit over an open case or drawer, with neither side wall landing on a wall of the case below. They'd hang off the dovetails of the case and covers above and droop down. Align at least one edge with a wall below, or match widths. (One wider drawer mid-span sags the same way.)`);
    }

    // placed units that no longer fit the selected printer
    const misfits = state.placed.filter((p) => !fillFits(p.w, p.fill));
    if (misfits.length) {
      const sizes = [...new Set(misfits.map((p) => `${sizeToken(p.w, p.hh / 2)} ${fillDef(p.fill).label}`))];
      warn(box, `${misfits.length} placed unit(s) won't print on the selected printer: ${sizes.join(", ")}.`);
    }

    // placed units whose size doesn't exist at the selected length (e.g. the
    // 59 mini collection only ships 1W/2W × 0.5H/1H cases) — switching length
    // under an existing layout is the only way in, so warn instead of deleting
    const ghosts = state.placed.filter((p) => !sizeExists(p.w, p.hh / 2, p.fill));
    if (ghosts.length) {
      const sizes = [...new Set(ghosts.map((p) => `${sizeToken(p.w, p.hh / 2)} ${fillDef(p.fill).label}`))];
      warn(box, `${ghosts.length} placed unit(s) don't exist in the ${state.length} collection: ${sizes.join(", ")} · swap them for available sizes or pick another length.`);
    }

    // soft bow/stress advisory — never blocks, just a heads-up
    const bows = bowRisks();
    if (bows.size) {
      warn(box, `${bows.size} wide case(s) may bow under load · a narrower case loads the interior of a wider one, away from its end walls. To stiffen it: match widths, align the narrower case to an end, or support the full span.`)
        .classList.add("warn-soft");
    }

    // advanced cabinets whose interior isn't fully tiled can't be built yet
    const untiled = state.placed.filter((p) => { const f = interiorFill(p); return f && !f.complete; });
    if (untiled.length) {
      const cells = untiled.reduce((n, p) => n + interiorCellsLeft(p), 0);
      warn(box, `${untiled.length} cabinet(s) have an unfinished interior · fill the whole cabinet (${cells} cell${cells > 1 ? "s" : ""} left).`);
    }

    // wall mounts hang the exposed top row from a bracket course; 0.5H cases are
    // too low-profile for wall-mount holes, so a 0.5H case CAN'T attach to the
    // wall at all — a hard blocker (unlike sag), offered a one-click grow-to-1H fix
    const lowTops = wallTopHalfHeight();
    if (lowTops.size) {
      const div = warn(box, `${lowTops.size} top-row case(s) are 0.5H · a Wall Mount hangs the top row from a bracket course, but 0.5H cases are too low-profile to have wall-mount holes · they can't attach to the wall at all. Grow them to 1H, or cap them with a taller unit above.`);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small warn-fix";
      btn.textContent = "Grow top row to 1H";
      btn.addEventListener("click", () => {
        const r = fixWallTops();
        refresh();
        const note = document.createElement("div");
        note.className = "fix-note";
        note.textContent = r
          ? `✓ Top row fixed · ${r.grown} case${r.grown === 1 ? "" : "s"} grown to 1H`
            + (r.moved ? `, ${r.moved} unit${r.moved === 1 ? "" : "s"} shifted down` : "")
            + " · names and drawer contents kept."
          : "⚠ Can't grow the top row · the grid is already at its max height. Remove a row below (or raise the space height), then try again.";
        $("#board-warnings").prepend(note);
      });
      div.appendChild(btn);
    }

    // tabletop: an unfinished top is GUIDANCE, not a warning. Every kit is
    // built column by column, so "one column shorter than the tallest" is the
    // normal state between two clicks - a red triangle there taught people
    // that progress was a mistake (Joey, 2026-08-23). The deficit comes from
    // the shared tabletop-completion module (the viewer renders the same
    // cells as ghost boxes), and it is per contiguous run: two separate
    // stacks of different heights are each complete.
    if (state.mount === "tabletop") {
      const done = tabletopCompletion();
      if (!done.complete) {
        const n = done.areas.length;
        guide(box,
          n === 1 ? "Almost there - one area left to fill" : "Finish the top to complete your tabletop kit",
          `This layout is still in progress. Fill the ${n === 1 ? "highlighted space" : n + " highlighted areas"} so every column supports the top cover - any drawer combination that fits. The 3D Build Studio previews it as you go.`);
      }
    }

    // Not a layout problem — a capability note (amber, like bow risk): the 3D
    // Build Studio has no under-table rail models for this length, which is
    // why its button/fab sit greyed. The build itself is fine to plan & print.
    if (state.mount === "under-table" && !VIEWER_UT_LENGTHS.includes(+state.length)) {
      warn(box, "The 3D Build Studio can't show under-table " + state.length + " builds yet · the rail models aren't in its 3D part library. You can still plan and print this build — or use Table Top / Wall Mount (or the 165/185 collections) for the full 3D guide.")
        .classList.add("warn-soft");
    }
  }

  function warn(box, text) {
    const div = document.createElement("div");
    div.className = "warn";
    div.textContent = "⚠ " + text;
    box.appendChild(div);
    return div;
  }
  /* Completion guidance: a distinct kind from warnings and errors. Brand
     orange, a progress glyph instead of a triangle, role="status" so a screen
     reader hears it as a status update rather than an alert - and the heading
     carries the meaning, so colour is never the only difference. */
  function guide(box, heading, text) {
    const div = document.createElement("div");
    div.className = "guide";
    div.setAttribute("role", "status");
    const h = document.createElement("b");
    h.textContent = "◔ " + heading;
    const p = document.createElement("span");
    p.textContent = text;
    div.append(h, p);
    box.appendChild(div);
    return div;
  }
  /* The shared deficit, in grid coordinates (js/tabletop-completion.js - the
     viewer vendors the same bytes). Empty-safe: no units = complete. */
  function tabletopCompletion() {
    return GEN2_TABLETOP.completion(state.placed);
  }

  /* ------------------- Selected-unit toolbar (below grid) ------------------- */

  /* The four nudge directions, in grid steps: ←/→ move a whole 1W column,
     ▲/▼ move one half-row (the grid's native vertical resolution, matching
     how dragging snaps), so any reachable position is reachable by arrows. */
  const NUDGE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function selectedUnit() {
    return state.placed.find((u) => u.id === state.selectedUnit) || null;
  }

  /* Try to move the selected unit one step; no-op if blocked by an edge or a
     neighbour. Returns whether it moved (used by tests). */
  function nudgeSelected(dir) {
    const p = selectedUnit();
    const d = NUDGE[dir];
    if (!p || !d) return false;
    const nx = p.x + d[0], ny = p.y + d[1];
    if (!canPlace(nx, ny, p.w, p.hh, p.id)) return false;
    p.x = nx;
    p.y = ny;
    refresh();
    return true;
  }

  // Usable interior cavity (mm) for a drawer of w×h units at the current length.
  function interiorDims(w, h, len) {
    const u = GEN2.units, i = GEN2.interior;
    return { w: u.widthMM * w - i.wWall, h: u.heightMM * h - i.hWall, d: len - i.dWall };
  }

  /* Per-drawer closure picker (None / Magnets / Push-Click…), data-driven from
     GEN2.closures. "soon" options render disabled with their tip as a
     hover/tap-revealed reason (same pattern as greyed sizes); `noWall` options
     also disable on wall builds once released. */
  function renderClosureSeg(p) {
    const seg = $("#ut-closure-seg");
    seg.innerHTML = "";
    const cur = p.closure || "none";
    GEN2.closures.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = c.label + (c.soon ? ' <span class="soon">soon</span>' : "");
      const disabled = !!c.soon || (c.noWall && state.mount === "wall");
      // aria-disabled + class (not the disabled attribute) keeps the button
      // focusable so the reason tooltip tap-reveals on touch
      if (disabled) {
        b.classList.add("disabled");
        b.setAttribute("aria-disabled", "true");
        if (c.tip) b.dataset.tip = c.tip;
      } else {
        b.classList.toggle("active", cur === c.id);
        if (c.tip) b.title = c.tip;
      }
      b.addEventListener("click", () => {
        if (disabled) {
          // "soon" options are aria-disabled, not disabled, so they still
          // receive the click — which makes reaching for one measurable DEMAND
          // for an unreleased closure rather than a dead end nobody sees.
          if (c.soon) track("closure-soon:" + c.id);
          return;
        }
        track("closure:" + c.id);
        if (c.id === "none") delete p.closure; else p.closure = c.id;
        refresh();
      });
      seg.appendChild(b);
    });
  }

  /* Per-drawer family picker (Classic Drawer / Decor Drawer), beside the
     closure picker. The other family's button is inert with the reason when
     this unit can't become it (same aria-disabled + data-tip treatment as a
     "soon" closure, so the reason tap-reveals on touch). The full family
     names are deliberate - see the conversion block above. */
  function renderFillTypeSeg(p) {
    const seg = $("#ut-fill-seg");
    seg.innerHTML = "";
    DRAWER_FILLS.forEach((id) => {
      const f = fillDef(id);
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.label;
      b.title = f.blurb;
      const problem = id === p.fill ? null : convertProblem(p, id);
      if (problem) {
        b.classList.add("disabled");
        b.setAttribute("aria-disabled", "true");
        b.dataset.tip = problem;
      } else {
        b.classList.toggle("active", id === p.fill);
      }
      b.addEventListener("click", () => {
        if (problem || id === p.fill) return;
        applyConversion(planConversion(id, [p]), "unit");
      });
      seg.appendChild(b);
    });
    // The faceplate is a BUILD-WIDE choice. Say so here, in the Customize
    // heading's own words, so a Decor drawer's inspector never implies a
    // per-drawer style it doesn't have.
    const note = $("#ut-fp-note");
    if (p.fill === "decor") {
      const face = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
      // "series" is the catalog's own word for a faceplate family (the
      // Printables pages, the BOM links) and the disambiguator that keeps
      // "Classic series" from reading as "Classic Drawer"
      note.textContent = `Faceplate: ${face ? face.label : "-"} series · one style for every Decor drawer · change it under Customize.`;
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  function renderToolbar() {
    const bar = $("#unit-toolbar");
    const p = selectedUnit();
    const thumb = $("#ut-thumb");
    const remove = $("#ut-remove");
    const shelves = $("#ut-shelves");

    // reset transient interior UI whenever the selected unit changes (one chokepoint
    // for every selection path: board click, Remove, Clear, deselect)
    if (state.selectedUnit !== toolbarSel) {
      interiorArmed = null; interiorOpen = false; interiorHover = null; toolbarSel = state.selectedUnit;
    }

    // arrows light up only in directions the unit can actually move
    document.querySelectorAll(".ut-arrow").forEach((btn) => {
      const d = NUDGE[btn.dataset.move];
      btn.disabled = !p || !canPlace(p.x + d[0], p.y + d[1], p.w, p.hh, p.id);
    });

    // "▶ Watch" chips for videos matching the selected unit's fill
    const vids = p ? GEN2.videos.filter((v) => v.fills && v.fills.includes(p.fill)) : [];
    const uv = $("#ut-video");
    uv.hidden = !vids.length;
    uv.innerHTML = vids.map(videoChipHtml).join("");

    if (!p) {
      bar.classList.remove("active");
      thumb.classList.add("empty");
      thumb.removeAttribute("src");
      $("#ut-title").textContent = "No unit selected";
      $("#ut-sub").textContent = "Click a part on the grid to move or remove it.";
      remove.disabled = true;
      shelves.hidden = true;
      $("#ut-closure").hidden = true;
      $("#ut-fill").hidden = true;
      $("#ut-fp-note").hidden = true;
      $("#ut-mode").hidden = true;
      $("#ut-edit").hidden = true;
      $("#ut-label-wrap").hidden = true;
      const iw = $("#ut-interior"); iw.hidden = true; iw.classList.remove("open");
      document.body.classList.remove("sheet-open");
      return;
    }

    $("#ut-label-wrap").hidden = false;
    $("#ut-label").value = p.label || "";

    const h = p.hh / 2;
    const info = unitPartInfo(p);
    bar.classList.add("active");
    thumb.classList.remove("empty");
    thumb.onerror = function () { this.onerror = null; this.src = "img/parts/placeholder.svg"; };
    thumb.src = info.img;
    $("#ut-title").textContent = `${info.label} · ${info.size}`;
    if (p.fill === "classic" || p.fill === "decor") {
      const din = interiorDims(p.w, h, state.length);
      $("#ut-sub").textContent = `Inside: ${din.w} × ${din.h} × ${din.d} mm`;
    } else {
      $("#ut-sub").textContent =
        `${p.w * GEN2.units.widthMM} × ${h * GEN2.units.heightMM} × ${state.length}mm`;
    }
    remove.disabled = false;

    // closure picker: drawers only (a cabinet/shelf has nothing to close)
    const isDrawer = p.fill === "classic" || p.fill === "decor";
    $("#ut-closure").hidden = !isDrawer;
    if (isDrawer) renderClosureSeg(p);
    // drawer family (Classic Drawer / Decor Drawer): drawers only, same rule
    $("#ut-fill").hidden = !isDrawer;
    if (isDrawer) renderFillTypeSeg(p); else $("#ut-fp-note").hidden = true;

    // Cabinet interior controls: Simple shelf count vs Advanced compartment editor
    const W = p.w, H = p.hh / 2;
    const isCab = p.fill === "cabinet";
    const advancedEligible = isCab && W * H > 1;       // something worth subdividing
    const advanced = isCab && Array.isArray(p.interior);

    $("#ut-mode").hidden = !advancedEligible;
    if (advancedEligible) {
      $("#ut-mode").querySelectorAll("[data-mode]").forEach((b) =>
        b.classList.toggle("active", (b.dataset.mode === "advanced") === advanced));
    }
    // Simple shelf stepper: cabinet, not advanced, tall enough to hold a shelf
    if (isCab && !advanced && H >= 2) {
      shelves.hidden = false;
      $("#ut-shelf-count").textContent = p.shelves || 0;
    } else {
      shelves.hidden = true;
    }
    // Advanced interior editor (inline on desktop; a bottom sheet on mobile)
    $("#ut-edit").hidden = !advanced;
    const iw = $("#ut-interior");
    if (advanced) {
      renderInterior(p, W, H);
    } else {
      iw.hidden = true;
      iw.classList.remove("open");
      interiorOpen = false;
    }
    document.body.classList.toggle("sheet-open", advanced && interiorOpen);
  }

  /* The advanced cabinet interior editor: a compact size palette + a mini grid
     you click to tile with compartments. Rebuilt each refresh; per-cell click
     listeners are discarded with the old SVG, so no stale handlers accumulate. */
  function renderInterior(p, W, H) {
    const wrap = $("#ut-interior");
    wrap.hidden = false;
    wrap.classList.toggle("open", interiorOpen); // mobile sheet visibility (desktop ignores)

    // drop a stale armed size that can't fit this cabinet
    if (interiorArmed && (interiorArmed.w > W || interiorArmed.h > H || !sizeExists(interiorArmed.w, interiorArmed.h, "cabinet")))
      interiorArmed = null;

    // size-only palette: every w×h that fits W×H and exists in the lineup
    const pal = $("#ut-int-pal");
    pal.innerHTML = "";
    for (let hh = 1; hh <= H; hh++) for (let ww = 1; ww <= W; ww++) {
      if (!sizeExists(ww, hh, "cabinet")) continue; // cabinet interiors allow every footprint
      const on = interiorArmed && interiorArmed.w === ww && interiorArmed.h === hh;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ut-int-chip" + (on ? " active" : "");
      chip.textContent = sizeToken(ww, hh);
      chip.addEventListener("click", () => { interiorArmed = on ? null : { w: ww, h: hh }; renderToolbar(); });
      pal.appendChild(chip);
    }

    // occupancy + validity
    const filled = new Set();
    p.interior.forEach((c) => {
      for (let dy = 0; dy < c.h; dy++) for (let dx = 0; dx < c.w; dx++)
        filled.add((c.x + dx) + "," + (c.y + dy));
    });
    const left = W * H - filled.size, valid = left === 0;

    // mini-grid: reuse the board's own cell size (CW×CH) so the editor renders at
    // the same scale and aspect ratio as the cabinet on the main grid. (CSS caps
    // it at the container width and scales it down on narrow screens.)
    const svg = $("#ut-int-grid");
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${W * CW} ${H * CH}`);
    svg.setAttribute("width", W * CW);
    svg.setAttribute("height", H * CH);
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      if (filled.has(xx + "," + yy)) continue;
      const r = el("rect", { x: xx * CW + 1, y: yy * CH + 1, width: CW - 2, height: CH - 2, class: "ic-empty" }, svg);
      r.addEventListener("click", () => {
        if (interiorArmed && placeCompartment(p, xx, yy, interiorArmed.w, interiorArmed.h)) { interiorHover = null; refresh(); }
      });
    }
    p.interior.forEach((c) => {
      const grp = el("g", { class: "ic-comp" }, svg);
      el("rect", { x: c.x * CW + 2, y: c.y * CH + 2, width: c.w * CW - 4, height: c.h * CH - 4, rx: 4, class: "ic-block" }, grp);
      for (let s = 1; s < c.h; s++)
        el("line", { x1: c.x * CW + 6, y1: (c.y + s) * CH, x2: (c.x + c.w) * CW - 6, y2: (c.y + s) * CH, class: "ic-seam" }, grp);
      // label each 1H slice so the build reads at a glance: the bottom 1H is the
      // case (shown with its size); every slice above it is a same-width extender
      for (let row = 0; row < c.h; row++) {
        const isCase = row === c.h - 1;
        el("text", {
          x: c.x * CW + (c.w * CW) / 2, y: (c.y + row) * CH + CH / 2,
          class: "ic-slice" + (isCase ? " case" : ""),
        }, grp).textContent = isCase ? sizeToken(c.w, 1) : "extender";
      }
      // remove on click; refresh() runs last so we never touch the wiped node after
      grp.addEventListener("click", () => { p.interior = p.interior.filter((o) => o !== c); refresh(); });
    });
    el("rect", { x: 1, y: 1, width: W * CW - 2, height: H * CH - 2, rx: 5, class: "ic-outline " + (valid ? "ok" : "bad") }, svg);

    // placement ghost: highlight the armed size's full footprint under the cursor
    // (green = fits, red = off-grid or overlaps), mirroring the main grid.
    if (interiorArmed && interiorHover) {
      const hx = interiorHover.x, hy = interiorHover.y, aw = interiorArmed.w, ah = interiorArmed.h;
      let ok = hx + aw <= W && hy + ah <= H;
      if (ok) for (const cc of p.interior)
        if (hx < cc.x + cc.w && hx + aw > cc.x && hy < cc.y + cc.h && hy + ah > cc.y) { ok = false; break; }
      const gw = (Math.min(hx + aw, W) - hx) * CW - 2, gh = (Math.min(hy + ah, H) - hy) * CH - 2;
      el("rect", { x: hx * CW + 1, y: hy * CH + 1, width: gw, height: gh, rx: 4, class: "ic-ghost " + (ok ? "ok" : "bad") }, svg);
    }

    const warnEl = $("#ut-int-warn");
    warnEl.hidden = valid;
    if (!valid) warnEl.textContent = `Fill the whole cabinet · ${left} cell${left > 1 ? "s" : ""} left`;
  }

  /* The representative published part for a placed unit — the piece a user
     thinks of as "the thing" in that case — plus its thumbnail. */
  function unitPartInfo(p) {
    const len = state.length;
    const size = sizeToken(p.w, p.hh / 2);
    const f = fillDef(p.fill);
    let name;
    if (p.fill === "classic" || p.fill === "decor") {
      name = GEN2.partNames.drawer(len, size, f.label);
    } else if (p.fill === "shelf") {
      name = GEN2.partNames.case(len, size);
    } else {
      const doorStyle = GEN2.doorStyles.find((s) => s.id === state.doorStyle).label;
      name = GEN2.partNames.door(len, size, doorStyle);
    }
    return { size, label: f.label, blurb: f.blurb, img: partImage(name) };
  }

  /* ------------------------------- BOM ------------------------------- */

  function computeBom() {
    /* requirement-scope: which fill produced an aggregate row, and how many
       units chose each fill (basis.selectedCount counts SUBJECTS, not parts) */
    const drawerFill = new Map(), fillUnits = new Map();
    if (!state.length || !state.mount || !state.placed.length) return null;
    const len = state.length;
    const P = GEN2.partNames;
    const faceDef = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
    /* ⚠ this is the LABEL ("Classic"), not the id - it feeds part NAMES.
       Never hand it to a basis: a basis choice is a stable id, and this
       one is display text that may be reworded. Use state.faceStyle. */
    const faceStyle = faceDef.label;
    const doorStyle = GEN2.doorStyles.find((s) => s.id === state.doorStyle).label;
    const sections = [];

    const count = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);
    const drawers = new Map();   // "size|fillLabel" -> qty
    const cases = new Map();     // size -> qty
    const extenders = new Map(); // w -> qty
    const inserts = new Map();   // w -> qty
    const doors = new Map();     // size -> qty
    let decorCount = 0, hinges = 0, latches = 0;

    state.placed.forEach((p) => {
      const h = p.hh / 2;
      const size = sizeToken(p.w, h);
      if (p.fill === "classic" || p.fill === "decor") {
        count(drawers, size + "|" + fillDef(p.fill).label);
        /* the aggregate row is keyed by LABEL, but `basis.choice` must be the
           stable fill id - keep a parallel map rather than parsing the label back */
        drawerFill.set(size + "|" + fillDef(p.fill).label, p.fill);
        count(fillUnits, p.fill);
        count(cases, size);
        if (p.fill === "decor") decorCount++;
        void 0;
      } else if (p.fill === "shelf") {
        count(fillUnits, "shelf");
        // Build from a 1H case + extenders, not one tall case: tall cases warp/
        // fail more in print, and splitting the parts lets them batch across
        // machines (and share SKUs with cabinet cases/extenders).
        count(cases, sizeToken(p.w, 1));
        const shelfExt = h - 1;
        if (shelfExt > 0) count(extenders, p.w, shelfExt);
        count(inserts, p.w);
      } else if (p.fill === "cabinet") {
        count(fillUnits, "cabinet");
        if (Array.isArray(p.interior)) {
          // ADVANCED: bill each compartment as 1 case + (h-1) extenders + 1 insert.
          // Keys match the shelf/cabinet SKUs so they batch: cases by sizeToken(w,1)
          // (string), extenders/inserts by width w (number).
          p.interior.forEach((c) => {
            count(cases, sizeToken(c.w, 1));
            if (c.h > 1) count(extenders, c.w, c.h - 1);
            count(inserts, c.w);
          });
        } else {
          const shelves = p.shelves || 0; // SIMPLE shelves model (unchanged)
          count(cases, sizeToken(p.w, 1), 1 + shelves);
          const ext = h - 1 - shelves;
          if (ext > 0) count(extenders, p.w, ext);
          count(inserts, p.w, 1 + shelves);
        }
        // shell (both modes): one door at full W×H + hinges/latches by height.
        // size === sizeToken(p.w, h); the shell size is guaranteed available because
        // selectable() gates placement and the interior editor never resizes the shell.
        count(doors, size);
        hinges += h >= 2 ? 2 : 1;
        latches += h >= 2 ? 2 : 1;
      }
    });

    if (drawers.size) {
      sections.push({
        title: "Drawers",
        items: [...drawers.entries()].sort().map(([key, qty]) => {
          const [size, fillLabel] = key.split("|");
          const name = P.drawer(len, size, fillLabel);
          const fill = drawerFill.get(key);
          /* CORE. There is no "empty" fill - every placed unit selects one of
             classic|decor|shelf|cabinet - so the drawer is not an addition to a
             bare case, it IS how that unit is filled. The basis says which
             variant answered the obligation. */
          return { name, qty, unreleased: GEN2.unreleasedParts.includes(name),
            requirement: GEN2.req.core("unit.fill"),
            basis: GEN2.req.basis("fill", fill, "unit", fillUnits.get(fill)) };
        }),
      });
    }

    if (inserts.size || doors.size) {
      const items = [];
      /* A shelf insert is billed by BOTH the shelf and cabinet fills, so on a
         mixed board the row genuinely has two causes and carries both. Same
         scope either way, so the resolved requirement never moves; `reasons`
         only makes the explanation true. */
      const fillReasons = (...fills) => {
        const live = fills.filter((f) => fillUnits.get(f));
        if (!live.length) return {};
        const bas = (f) => GEN2.req.basis("fill", f, "unit", fillUnits.get(f));
        /* ⚠ ONE cause: the basis goes on the ROW. resolveReasons collapses a
           single reason to `{requirement}` alone - correctly, since a `reasons`
           array of one is rejected by validate() - so a basis left inside that
           lone reason simply disappears, and the row loses the ability to say
           which fill put it there. */
        if (live.length === 1) {
          return { requirement: GEN2.req.core("unit.fill"), basis: bas(live[0]) };
        }
        return GEN2.req.resolveReasons(live.map((f) =>
          Object.assign(GEN2.req.core("unit.fill"), { basis: bas(f) })));
      };
      [...inserts.entries()].sort().forEach(([w, qty]) => items.push(Object.assign({
        name: P.shelfInsert(len, w), qty,
        note: "Shelf inserts are sized by width only.",
        unreleased: GEN2.unreleased.includes("shelfInsert"),
      }, fillReasons("shelf", "cabinet"))));
      [...doors.entries()].sort().forEach(([size, qty]) => items.push(Object.assign({
        name: P.door(len, size, doorStyle), qty,
        note: "Door matches the total width and height of the case + extenders.",
        unreleased: GEN2.unreleased.includes("door"),
      }, fillReasons("cabinet"))));
      if (hinges) items.push(Object.assign({
        name: P.hinge(), qty: hinges,
        note: "Hinges are 1H · 1H cabinets take 1 hinge, taller cabinets take 2.",
        unreleased: GEN2.unreleased.includes("hinge"),
      }, fillReasons("cabinet")));
      if (latches) items.push(Object.assign({
        name: P.latch(), qty: latches,
        note: "Latches are 1H · 1H cabinets take 1 latch, taller cabinets take 2.",
        unreleased: GEN2.unreleased.includes("latch"),
      }, fillReasons("cabinet")));
      sections.push({ title: "Shelves & Cabinets", items });
    }

    {
      const items = [...cases.entries()].sort().map(([size, qty]) => ({
        name: P.case(len, size), qty,
        note: "Cases QuickLock together.",
        requirement: GEN2.req.core("unit.enclosure"),
      }));
      /* An extender is enclosure too - it is the interchangeable way a shelf or
         cabinet reaches its height, not an addition to a finished one. */
      [...extenders.entries()].sort().forEach(([w, qty]) => items.push({
        name: P.extender(len, w), qty,
        note: "Stacks above a case to add cabinet height · interchangeable with full cases.",
        requirement: GEN2.req.core("unit.enclosure"),
      }));
      // optional side covers for units on the outer edges of the layout.
      // Covers pair to a case via the side dovetails, so cabinets (stacked
      // 1H cases/extenders) take 1H covers per level.
      const minX = Math.min(...state.placed.map((p) => p.x));
      const maxX = Math.max(...state.placed.map((p) => p.x + p.w));
      const sideCovers = new Map(); // height -> qty
      state.placed.forEach((p) => {
        const exposedSides = (p.x === minX ? 1 : 0) + (p.x + p.w === maxX ? 1 : 0);
        if (!exposedSides) return;
        if (p.fill === "cabinet") count(sideCovers, 1, exposedSides * (p.hh / 2));
        else count(sideCovers, p.hh / 2, exposedSides);
      });
      [...sideCovers.entries()].sort().forEach(([h, qty]) => items.push({
        name: P.sideCover(len, h), qty,
        note: "Optional · covers the exposed sides of the outermost cases (pairs to each case's height via the side dovetails). Most popular with Table Top Kits.",
        optional: true,
        unreleased: GEN2.unreleased.includes("sideCover"),
        /* ENHANCEMENT, and deliberately not `option`. The test is not "is it
           cosmetic" - it is whether a declared capability promises the outcome.
           Side covers are emitted automatically for exposed outer cases and can
           be dropped with every obligation and every selected capability still
           satisfied; there is no "finished sides" capability to switch on.
           ⚠ Typing them `option` would MOVE them from the enhancements tier into
           the selected plan on the published site, changing a number a homepage
           claim is built on. That is a product decision, not a metadata one. */
        requirement: GEN2.req.enhancement("unit.side_finish"),
      }));
      sections.push({ title: "Cases & Extenders", items });
    }

    if (decorCount) {
      const items = [];
      state.placed.filter((p) => p.fill === "decor").reduce((map, p) => {
        count(map, sizeToken(p.w, p.hh / 2));
        return map;
      }, new Map()).forEach((qty, size) => {
        /* CORE: a Decor drawer is open-fronted, so it must have a front. The
           family choice swaps the implementation, it does not make the
           obligation optional. */
        items.push({ name: P.faceplate(len, size, faceStyle), qty, club: faceDef.club,
          requirement: GEN2.req.core("drawer.front"),
          basis: GEN2.req.basis("faceplate.family", state.faceStyle, "build") });
        // optional back cover: one per faceplate, same size — every style seats
        // it, and the files ship INSIDE each faceplate series download (v2602+),
        // so the row links the chosen style's page
        if (state.backCover) items.push({
          name: P.backCover(len, size), qty,
          note: "Optional · clips in behind the faceplate to close the open-front Decor drawer. Included in the faceplate download.",
          optional: true,
          linkAs: `GEN2 Decor - Faceplates - ${faceDef.label} Series`,
          unreleased: GEN2.unreleased.includes("backCover"),
          /* the drawer is complete without it - it closes an opening that is not
             a fault, and nothing selected promises a closed back */
          requirement: GEN2.req.enhancement("drawer.front.backing"),
        });
      });
      items.sort((a, b) => a.name.localeCompare(b.name));
      GEN2.decorExtras.forEach((x) => {
        /* the stamp is a thunk - decorExtras is declared inside the GEN2 literal,
           where GEN2.req is still in its TDZ. Resolve it here, once. */
        const xReq = typeof x.requirement === "function" ? x.requirement() : x.requirement;
        // EdgeLabel / Classic Pro faceplates print their grip in — skip the
        // bolt-on rows (the handle AND the screws that fasten it).
        if (x.boltOnOnly && faceDef && faceDef.integratedHandle) return;
        if (x.id === "handle") {
          // Name + link the handle after the chosen handle style (the name
          // matches a LINK_OVERRIDES key so partLinks resolves it directly).
          const hs = GEN2.handleStyles.find((s) => s.id === state.handleStyle) || GEN2.handleStyles[0];
          items.push({
            name: `GEN2 Decor Handles - ${hs.label} Series`,
            qty: x.qtyPerDrawer * decorCount,
            note: x.note,
            requirement: xReq,
            basis: GEN2.req.basis("faceplate.family", state.faceStyle, "build"),
          });
          return;
        }
        items.push({
          name: x.name(len),
          qty: x.qtyPerDrawer * decorCount,
          note: x.note,
          hardware: x.hardware,
          optional: x.optional,
          /* ⚠ carried across explicitly - this consumer builds a fresh object per
             row rather than spreading `x`, so a stamp added to decorExtras does
             NOT arrive on its own. Both bolt-on rows sat unmigrated after the
             first pass for exactly this reason. */
          requirement: xReq,
          basis: xReq ? GEN2.req.basis("faceplate.family", state.faceStyle, "build") : undefined,
        });
      });
      sections.push({ title: "Faceplates & Handles", items });
    }

    /* Is anything sitting on top of this unit? Stoppers slot into the underside
       of whatever is above - the case above, or the covers over a top row.
       ⚠ Hoisted to the computeBom scope 2026-08-22: it was block-scoped to the
       hardware section, and the COVER LOWER's requirement needs the same answer
       (stoppers seat into it, which is one of the reasons it can be required).
       One definition, so the stopper rows and the cover row cannot disagree
       about whether this build has stoppers at all. */
    const hasUnitAbove = (p) => {
      for (let cx = p.x; cx < p.x + p.w; cx++) if (unitAt(cx, p.y - 1)) return true;
      return false;
    };

    // Hardware that attaches to a drawer or case: QuickLocks (per case) plus the
    // optional soft-close magnet clips + magnets (per Decor drawer). Grouped here
    // so all drawer/case hardware sits together instead of split across sections.
    {
      const items = [];
      const totalCases = [...cases.values()].reduce((a, b) => a + b, 0);
      if (totalCases) items.push(
        /* CORE on every mount, including a build of ONE case with nothing above
           it - which looked like an over-bill until it was checked. MEASURED
           2026-08-26 against the viewer, whose generator places real geometry
           from the same build: both tools agree on one pair per case across 15
           layouts x 3 mounts, and the viewer's dip timeline shows what engages a
           lone case's tabs - the Lower cover on tabletop, the bench cover on
           wall, the rails under-table. So `unit.join` is real with no neighbour;
           the obligation is "lock this case to whatever receives it". */
        { name: P.quickLockL(), qty: totalCases, note: GEN2.quickLock.note, linkAs: GEN2.quickLock.linkName,
          requirement: GEN2.req.core("unit.join") },
        { name: P.quickLockR(), qty: totalCases, note: GEN2.quickLock.note, linkAs: GEN2.quickLock.linkName,
          requirement: GEN2.req.core("unit.join") },
      );
      // Closure hardware: billed per drawer that opted in via the toolbar's
      // "Drawer close" picker (default none → nothing billed). Not tagged
      // optional — once chosen for a drawer it's part of the plan.
      GEN2.closures.forEach((c) => {
        if (!c.parts) return;
        const n = state.placed.filter((p) =>
          (p.fill === "classic" || p.fill === "decor") && p.closure === c.id).length;
        if (!n) return;
        /* ⚠ THE CANONICAL `option` ROWS. These exist ONLY because n drawers
           chose this closure - drawers work without them, and "None" sits
           right beside it in the picker. `n` is the selectedCount the
           contract wants: the shared BOM stores TOTALS, and which drawer
           chose it stays in the viewer's assembly data. subjectType 'unit'
           because closure is per-drawer, so one aggregated row can be caused
           by a subset of the build. */
        c.parts.forEach((x) => items.push({
          name: x.name(len),
          qty: x.qtyPerDrawer * n,
          note: x.note,
          hardware: x.hardware,
          linkAs: x.linkAs,
          requirement: GEN2.req.option('drawer.closure', `drawer.closure.${c.id}`),
          basis: GEN2.req.basis('drawer.closure', c.id, 'unit', n),
        }));
      });
      // Optional drawer stoppers: a Left + Right pair per 1W of drawer width
      // keeps a drawer from being pulled all the way out. They slot into the
      // underside of whatever sits above the drawer — the case above, or the
      // covers over a top row. The under-table RAIL has stoppers built in, so
      // drawers hanging directly from it need none. Drawers only: stoppers
      // have no function in a shelf or cabinet.
      // (hasUnitAbove is defined once at the computeBom scope - the Cover Lower's
      //  requirement needs the same answer, and two copies would drift)
      // per-1W stopper pairs the user removed in the 3D viewer drop out of the count
      const removedStop = new Set(state.removedStoppers || []);
      const keptCols = (p) => { let n = 0; for (let k = 0; k < p.w; k++) if (!removedStop.has(`${p.id}:${k}`)) n++; return n; };
      const stopperW = state.placed
        .filter((p) => (p.fill === "classic" || p.fill === "decor") &&
                       (state.mount !== "under-table" || hasUnitAbove(p)))
        .reduce((sum, p) => sum + keptCols(p), 0);
      if (stopperW) items.push(
        {
          name: "GEN2 Drawer Stopper - Left",
          qty: stopperW,
          note: "Optional but recommended · a Left + Right pair per 1W stops a drawer from pulling all the way out. They snap into the base of the case above (or the covers over a top row). Under-table top-row drawers don't need them · the rail has stoppers built in.",
          linkAs: "GEN2 Hardware",
          optional: true,
          // recommended and removable: omitting them keeps every selected capability intact
          requirement: GEN2.req.enhancement("drawer.retention"),
        },
        {
          name: "GEN2 Drawer Stopper - Right",
          qty: stopperW,
          note: "Optional · mirrored partner to the Left stoppers above.",
          linkAs: "GEN2 Hardware",
          optional: true,
          requirement: GEN2.req.enhancement("drawer.retention"),
        },
      );
      if (items.length) sections.push({ title: "Hardware", items });
    }

    const mix = railMix();
    // Per contiguous run: total width + how many cases touch the floor (a split
    // bottom row → foot rails). Covers/feet key off the run width.
    const floor = Math.max(...state.placed.map((p) => p.y + p.hh));
    const runs = columnRuns().map((run) => ({
      width: run.len,
      bottomCases: state.placed.filter((p) =>
        p.y + p.hh === floor && p.x >= run.start && p.x < run.start + run.len).length,
    }));
    /* ⚠ Does this build actually bill stoppers? The COVER LOWER is what they
       seat into, so their presence is one of the reasons a Cover Lower can be
       required (Joey, 2026-08-22). buildCoverItems lives in data.js and cannot
       see `state`, so the answer is computed here and passed in - the same
       rule the stopper rows below use, kept in one expression so the two
       cannot disagree about whether stoppers exist. */
    const removedStopCtx = new Set(state.removedStoppers || []);
    const hasStoppers = state.placed.some((p) =>
      (p.fill === "classic" || p.fill === "decor") &&
      (state.mount !== "under-table" || hasUnitAbove(p)) &&
      Array.from({ length: p.w }, (_, k) => k).some((k) => !removedStopCtx.has(`${p.id}:${k}`)));
    const ctx = {
      len,
      cols: occupiedColumns().length,
      runs,
      hasStoppers,
      wallStagger: state.wallStagger,
      feet: state.feet,                       // tabletop: "tpu" | "adhesive" (the BOM bills the pick)
      topCases: topCases().map((p) => p.w),   // top-row case widths (per-column covers)
      railMix: mix,
      railScrews: Object.entries(mix).reduce((sum, [w, n]) => sum + n * GEN2.railScrews(+w), 0),
      wallMix: mixOf(wallSections()),
    };
    const mountTitle = { tabletop: "Table Top Kit", wall: "Wall Mount", "under-table": "Mounting" };
    // mountSection flags this section for extras keyed to the mount (renderBom
    // attaches matching "▶ Watch" video chips to its title)
    sections.push({ title: mountTitle[state.mount] || "Mounting", items: GEN2.mountBom[state.mount](ctx), mountSection: true });

    return sections;
  }

  /* Build tracker: per-row "done" checkboxes over the BOM, persisted locally so
     progress survives reloads. Keyed by part name+variant (not build id) — a
     layout tweak mid-build must not wipe what's already printed. */
  const tracker = Object.assign({ on: false, done: {} }, (() => {
    try { return JSON.parse(store.get("gen2-bom-tracker")) || {}; } catch (e) { return {}; }
  })());
  const trackerKey = (it) => it.name + (it.variant ? ` · ${it.variant}` : "");
  const saveTracker = () => store.set("gen2-bom-tracker", JSON.stringify({ on: tracker.on, done: tracker.done }));

  /* The completion card: what this build IS and what getting it takes — total
     printed pieces vs unique files, the shopping list, and whether everything
     required is actually downloadable today. The BOM's two real questions
     ("what do I print, what do I buy") get answered before the long list. */
  function bomSummaryHtml(sections) {
    const rows = sections.flatMap((s) => s.items.filter((it) => it.qty > 0));
    const printed = rows.filter((it) => !it.hardware);
    const pieces = printed.reduce((n, it) => n + it.qty, 0);
    const files = new Set(printed.filter((it) => !it.unreleased).map((it) => it.linkAs || it.name)).size;
    const buy = rows.filter((it) => it.hardware)
      .map((it) => `${it.qty}× ${it.name.replace(/\s*\(.*$/, "").replace(/Countersunk wood screws/i, "wood screws").toLowerCase()}`);
    const missingReq = printed.filter((it) => it.unreleased && !it.optional).length;
    const missingOpt = printed.filter((it) => it.unreleased && it.optional).length;
    const drawers = state.placed.filter((p) => p.fill === "decor" || p.fill === "classic").length;
    const m = mountDef();
    // overall envelope, same numbers the board meta shows
    const minX = Math.min(...state.placed.map((p) => p.x)), maxX = Math.max(...state.placed.map((p) => p.x + p.w));
    const minY = Math.min(...state.placed.map((p) => p.y)), maxY = Math.max(...state.placed.map((p) => p.y + p.hh));
    const dims = state.placed.length
      ? `${(maxX - minX) * GEN2.units.widthMM} × ${(maxY - minY) * GEN2.units.heightMM / 2} × ${state.length} mm`
      : "";
    const avail = missingReq
      ? `<span class="avail warn">⚠ ${missingReq} required part${missingReq > 1 ? "s aren't" : " isn't"} released yet.</span>`
      : `<span class="avail ok">✓ All required parts are available.</span>` +
        (missingOpt ? ` <span class="avail muted">${missingOpt} optional part${missingOpt > 1 ? "s are" : " is"} still in development.</span>` : "");
    const doneQty = rows.reduce((n, it) => n + (tracker.done[trackerKey(it)] ? it.qty : 0), 0);
    const totalQty = rows.reduce((n, it) => n + it.qty, 0);
    return `<div class="bom-summary">
      <div class="bs-head"><strong>Your GEN2 build is ready</strong>
        <span class="bs-sub">${m ? m.label : ""} · ${state.length} mm · ${drawers} drawer${drawers === 1 ? "" : "s"}${dims ? ` · ${dims}` : ""}</span></div>
      <div class="bs-stats">
        <span class="bs-stat"><b>${pieces}</b> printed pieces from <b>${files}</b> model files</span>
        ${buy.length ? `<span class="bs-stat">buy: <b>${buy.join(" · ")}</b></span>` : ""}
      </div>
      <div class="bs-avail">${avail}</div>
      <div class="bs-track">
        <button type="button" class="btn small${tracker.on ? " active" : ""}" id="bom-track-toggle">${tracker.on ? "☑ Tracking build" : "☐ Track my build"}</button>
        ${tracker.on ? `<span class="bs-progress">${doneQty} of ${totalQty} pieces done</span>
          <button type="button" class="btn small ghost" id="bom-track-reset">Reset progress</button>` : ""}
      </div>
    </div>`;
  }

  function renderBom() {
    const wrap = $("#bom");
    // the labels export only earns a button when there's a label to export
    $("#labels-txt").hidden = !state.placed.some((p) => p.label);
    const sections = computeBom();
    if (!sections) {
      wrap.innerHTML = `<p class="hint">Choose a location and length, then place units in the layout · your parts list builds itself here.</p>`;
      return;
    }
    // completion card first: the payoff, summarized before the long list
    let html = bomSummaryHtml(sections);
    const starter = `GEN2 Under Table Starter Kit - ${state.length}`;
    if (state.mount === "under-table" && LINK_OVERRIDES[starter] && state.placed.length <= 4) {
      html += `<p class="tip">💡 New to GEN2? The <a href="${partLinks(starter).printables}" target="_blank" rel="noopener">${starter}</a> bundles everything for a first install.</p>`;
    }
    sections.forEach((sec) => {
      // the mount section's title carries any install videos for this mount
      const chips = sec.mountSection
        ? GEN2.videos.filter((v) => v.mounts && v.mounts.includes(state.mount)).map(videoChipHtml).join("")
        : "";
      html += `<h3>${sec.title}${chips}</h3><div class="bom-scroll"><table class="bom-table"><tbody>`;
      sec.items.filter((it) => it.qty > 0).forEach((it) => { // never show 0× rows (e.g. QuickLocks for an untiled cabinet)
        // Hardware-store items skip partImage()'s "GEN2 ..." auto-pattern
        // (their names don't follow it) and use a real reference photo when
        // IMAGE_OVERRIDES has one for that exact item, else the generic
        // wrench icon — never the "coming soon" placeholder, which means
        // something else (a printed part not designed yet).
        const img = it.hardware ? (IMAGE_OVERRIDES[it.name] || "img/parts/hardware.svg") : partImage(it.name, it.variant);
        const zoomable = it.hardware ? !!IMAGE_OVERRIDES[it.name] : true;
        // real photos/renders get the magnifier (see bindThumbZoom); generic
        // icons don't, and a load failure drops the affordance along with it
        const fallbackImg = it.hardware ? "img/parts/hardware.svg" : "img/parts/placeholder.svg";
        const tk = trackerKey(it), tkDone = !!tracker.done[tk];
        html += `<tr class="${it.optional ? "optional" : ""}${tracker.on && tkDone ? " done" : ""}">
          ${tracker.on ? `<td class="trk"><input type="checkbox" data-trk="${tk.replace(/"/g, "&quot;")}"${tkDone ? " checked" : ""} aria-label="done"></td>` : ""}
          <td class="thumb"><img src="${img}" alt="" loading="lazy"${zoomable ? ` class="zoomable" data-name="${it.name.replace(/"/g, "&quot;")}"` : ""}
            onerror="this.onerror=null;this.src='${fallbackImg}';this.classList.remove('zoomable')"></td>
          <td class="qty">${it.qty}×</td>
          <td class="name">${it.name}${it.variant ? ` — <em>${it.variant}</em>` : ""}${it.optional ? ' <span class="tag">optional</span>' : ""}${it.club ? ' <span class="tag club-tag">Club Expansion</span>' : ""}
            ${it.note ? `<div class="note">${it.note}</div>` : ""}</td>
          <td class="link${it.hardware && HARDWARE_BUY[it.name] ? " buy" : ""}">${linkButtons(it)}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });
    // Paid-link disclosure whenever any rendered hardware row carries buy
    // buttons. Wording per FTC guidance ("paid link" is adequate where
    // "affiliate link" alone may not be) + Amazon's REQUIRED Associate
    // statement, verbatim — do not paraphrase that sentence. Each buy button
    // also wears "· paid link" itself (linkButtons), so the disclosure and the
    // links stay visible together however far the list scrolls.
    if (sections.some((sec) => sec.items.some((it) => it.qty > 0 && it.hardware && HARDWARE_BUY[it.name])))
      html += `<p class="affiliate-note">Paid links - I earn a commission from purchases made through the Amazon buy buttons in this list, at no extra cost to you. As an Amazon Associate I earn from qualifying purchases. Any equivalent hardware from any retailer works.</p>`;
    wrap.innerHTML = html;
  }

  function linkButtons(it) {
    if (it.hardware) {
      // Amazon affiliate buy buttons where Joey has a vetted link (HARDWARE_BUY
      // in data.js); rel="sponsored" marks the affiliate relationship. Items
      // without one keep the plain tag.
      const buy = HARDWARE_BUY[it.name];
      if (!buy) return `<span class="tag">hardware store</span>`;
      // "· paid link" ON each button (FTC: adequate wording, right at the link).
      // Every HARDWARE_BUY url is an Amazon listing today — if a non-paid
      // vendor ever lands in that table, gate this suffix on the host like the
      // viewer's isPaidLink() rather than dropping it.
      return buy.map((b) => `<a class="btn small" href="${b.url}" target="_blank" rel="noopener sponsored">${b.label} · paid link</a>`).join(" ");
    }
    if (it.unreleased) return `<span class="tag soon-tag">coming soon</span>`;
    // ONE button — the site you prefer, or the first that actually carries this
    // part — plus a ▾ for the others. The label always NAMES the site it opens,
    // so a Printables-only part under a MakerWorld preference is never a
    // surprise. Row width stays constant however many sites we add.
    const links = partLinks(it.linkAs || it.name);
    const [primary, ...rest] = sitesFor(links);
    const btn = `<a class="btn small ${primary.exact ? "" : "ghost"}" href="${primary.url}" target="_blank" rel="noopener">${primary.label}</a>`;
    if (!rest.length) return btn;
    return btn + `<span class="link-more"><button type="button" class="link-more-btn" aria-label="Other sites for this part" title="Other sites for this part">▾</button>` +
      `<span class="link-more-menu" hidden>` +
      rest.map((s) => `<a class="btn small" href="${s.url}" data-site="${s.id}" target="_blank" rel="noopener">${s.label}</a>`).join("") +
      `</span></span>`;
  }

  /* Magnifier for the tiny parts-list thumbnails: hovering (mouse) or tapping
     (touch) a real render shows it enlarged in the shared #thumb-zoom card.
     Listeners are delegated on #bom so they survive every re-render, and the
     card is position:fixed so the table's scroll container can't clip it. */
  /* Tracker controls live inside string-rendered BOM HTML, so both listeners
     are delegated on #bom and survive every re-render. */
  function bindBomTracker() {
    const bom = $("#bom");
    bom.addEventListener("click", (e) => {
      /* ---- the outbound funnel (2026-08-01) ----
         EVERY model/buy link in the parts list is caught here: the primary
         store button, the ▾ alternatives and the hardware buy chips alike.
         The BOM is string-rendered, so delegation is the only single choke
         point — and it means a link added later is instrumented for free
         (the viewer gets the same guarantee from linkEl). Until this existed
         the planner's whole download step was INVISIBLE: `out:` came only
         from the viewer, while `linksite:` proved people were standing right
         there changing stores. A ▾ item fires both out: and linksite: on
         purpose — one is the click, the other the preference change, exactly
         as the viewer pairs out: with store-pref:. All these anchors are
         target="_blank", so navigation never cancels the beacon. */
      const a = e.target.closest && e.target.closest("a[href]");
      if (a) track(outEvent(a));
      if (e.target.id === "bom-track-toggle") { tracker.on = !tracker.on; saveTracker(); track("bom-track:" + (tracker.on ? "on" : "off")); renderBom(); }
      else if (e.target.id === "bom-track-reset") { tracker.done = {}; saveTracker(); renderBom(); }
      // the ▾ of alternative model sites (string-rendered, so delegated here)
      else if (e.target.classList.contains("link-more-btn")) {
        const menu = e.target.nextElementSibling;
        const wasHidden = menu.hidden;
        closeSiteMenus();
        menu.hidden = !wasHidden;
        e.stopPropagation();
      } else if (e.target.dataset && e.target.dataset.site) {
        // opening a site from the ▾ makes it your default — the preference is
        // set BY USE, so there's nothing to hunt for in a settings screen
        setLinkSite(e.target.dataset.site);
        track("linksite:" + e.target.dataset.site);
      }
    });
    bom.addEventListener("change", (e) => {
      const cb = e.target.closest("input[data-trk]");
      if (!cb) return;
      if (cb.checked) tracker.done[cb.dataset.trk] = true; else delete tracker.done[cb.dataset.trk];
      saveTracker();
      renderBom(); // progress count + row dim follow
    });
  }

  function bindThumbZoom() {
    const pop = $("#thumb-zoom");
    if (!pop) return;
    const big = pop.querySelector("img");
    const cap = pop.querySelector(".tz-name");
    const hide = () => { pop.hidden = true; delete pop.dataset.src; };
    const show = (t) => {
      big.src = t.src;                 // same file as the thumb — already cached
      cap.textContent = t.dataset.name || "";   // part name under the image
      pop.dataset.src = t.src;
      pop.hidden = false;
      // beside the thumb: right if there's room, else left; clamped to viewport.
      // Measured after the caption is set, so tall names don't push it off-screen.
      const r = t.getBoundingClientRect();
      const pw = pop.offsetWidth || 242, ph = pop.offsetHeight || 242;
      let x = r.right + 12;
      if (x + pw > window.innerWidth - 8) x = Math.max(8, r.left - pw - 12);
      const y = Math.max(8, Math.min(window.innerHeight - ph - 8, r.top + r.height / 2 - ph / 2));
      pop.style.left = x + "px";
      pop.style.top = y + "px";
    };
    const bom = $("#bom");
    bom.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;   // touch uses the click toggle below
      const t = e.target.closest(".thumb img.zoomable");
      if (t) show(t);
    });
    bom.addEventListener("pointerout", (e) => {
      if (e.pointerType === "mouse" && e.target.closest(".thumb img.zoomable")) hide();
    });
    bom.addEventListener("click", (e) => {
      const t = e.target.closest(".thumb img.zoomable");
      if (!t) return;
      if (!pop.hidden && pop.dataset.src === t.src) hide(); else show(t);
    });
    // tapping anywhere else, or scrolling (the fixed card would drift), closes it
    document.addEventListener("click", (e) => { if (!e.target.closest(".thumb")) hide(); });
    window.addEventListener("scroll", hide, { passive: true });
  }

  /* -------------- Instructional videos (GEN2.videos) -------------- */

  // A "▶ Watch" chip; one delegated listener in bindVideoModal() opens the
  // shared <dialog> player, so chips can live in string-rendered HTML (BOM)
  // and DOM-rendered spots (toolbar) alike. The play glyph is YouTube-red —
  // the universal "this is a video" cue — while the chip chrome stays accent.
  const videoChipHtml = (v) =>
    `<button type="button" class="video-chip" data-video="${v.id}"><span class="vc-play">▶</span> Watch: ${v.title}</button>`;

  function bindVideoModal() {
    const dlg = $("#video-modal");
    if (!dlg) return;
    const frame = $("#video-modal-frame");
    const open = (v) => {
      track("video:" + v.id);
      // no <dialog> support (very old browsers / headless) → plain YouTube tab
      if (!dlg.showModal) { window.open(`https://youtu.be/${v.id}`, "_blank", "noopener"); return; }
      $("#video-modal-title").textContent = v.title;
      $("#video-modal-link").href = `https://youtu.be/${v.id}`;
      frame.src = `https://www.youtube-nocookie.com/embed/${v.id}`;   // loads only now
      dlg.showModal();
    };
    dlg.addEventListener("close", () => { frame.src = ""; });   // stops playback
    $("#video-modal-close").addEventListener("click", () => dlg.close());
    // a click on the backdrop lands on the <dialog> element itself
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-video]");
      if (!chip) return;
      const v = GEN2.videos.find((x) => x.id === chip.dataset.video);
      if (v) open(v);
    });
  }

  /* ----------------------------- Exports ----------------------------- */

  function bomAsRows() {
    const sections = computeBom() || [];
    const out = [];
    sections.forEach((sec) =>
      sec.items.filter((it) => it.qty > 0).forEach((it) => { // skip 0× rows in copy/CSV too
        const links = it.hardware || it.unreleased ? null : partLinks(it.linkAs || it.name);
        out.push({
          section: sec.title,
          qty: it.qty,
          name: it.name + (it.variant ? ` · ${it.variant}` : "") +
            (it.optional ? " (optional)" : "") + (it.unreleased ? " (coming soon)" : ""),
          printables: links ? links.printables : "",
          thangs: links ? links.thangs : "",
        });
      }));
    return out;
  }

  /* Metadata header shared by the text + CSV exports: enough to identify the
     build months later and reopen it (the share link IS the configuration). */
  function buildMeta() {
    const m = mountDef();
    const fdef = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
    const hdef = GEN2.handleStyles.find((s) => s.id === state.handleStyle);
    const dims = state.placed.length
      ? `${(Math.max(...state.placed.map((p) => p.x + p.w)) - Math.min(...state.placed.map((p) => p.x))) * GEN2.units.widthMM} × ` +
        `${(Math.max(...state.placed.map((p) => p.y + p.hh)) - Math.min(...state.placed.map((p) => p.y))) * (GEN2.units.heightMM / 2)} × ${state.length} mm`
      : "";
    return {
      date: new Date().toISOString().slice(0, 10),
      mount: m ? m.label : "",
      length: `${state.length} mm`,
      printer: state.printer === "custom" ? "Custom bed" : ((GEN2.printers.find((p) => p.id === state.printer) || {}).label || state.printer),
      dims,
      faceplate: fdef ? fdef.label : "",
      handle: hdef ? hdef.label : "",
      link: location.origin.startsWith("http") ? location.origin + location.pathname + "#build=" + encodeBuildHash() : "",
    };
  }

  function copyBom() {
    track("export:copy");
    const m = buildMeta();
    let txt = `GEN2 ${state.length} · ${m.mount} setup · ${m.date}\n`;
    txt += `Planned with the GEN2 Planner · jerrari3d.com\n`;
    if (m.dims) txt += `Overall: ${m.dims} · Faceplate: ${m.faceplate} · Printer: ${m.printer}\n`;
    if (m.link) txt += `Reopen this build: ${m.link}\n`;
    txt += "\n";
    let lastSection = "";
    bomAsRows().forEach((r) => {
      if (r.section !== lastSection) { txt += `\n[${r.section}]\n`; lastSection = r.section; }
      txt += `${r.qty}x ${r.name}\n`;
      if (r.printables) txt += `    Printables: ${r.printables}\n`;
      if (r.thangs) txt += `    Thangs:     ${r.thangs}\n`;
    });
    navigator.clipboard.writeText(txt).then(() => flash("#copy-bom", "Copied!"));
  }

  function downloadCsv() {
    track("export:csv");
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    // metadata header block first — a saved CSV should identify its build and
    // carry the link that reopens the exact configuration
    const m = buildMeta();
    let csv = "GEN2 Planner build export\n";
    [["Date", m.date], ["Mount", m.mount], ["Length", m.length], ["Printer", m.printer],
     ["Overall W×H×D", m.dims], ["Faceplate", m.faceplate], ["Handle", m.handle],
     ["Reopen link", m.link]].forEach(([k, v]) => { if (v) csv += `${esc(k)},${esc(v)}\n`; });
    csv += "\nSection,Qty,Part,Printables,Thangs\n";
    bomAsRows().forEach((r) => {
      csv += [esc(r.section), r.qty, esc(r.name), esc(r.printables), esc(r.thangs)].join(",") + "\n";
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `gen2-${state.length}-${state.mount}-parts.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* Labels export: every typed drawer label as PLAIN TEXT, one per line, in
     reading order (top-left → bottom-right). No columns, quotes, or header —
     just the label text, so it pastes cleanly into a label field and imports
     into label software (Dymo, Brother, Niimbot…) where each line becomes one
     label. EdgeLabel / Classic Pro users have the label-generator handoff; this
     is for everyone else printing stick-on labels. */
  function downloadLabelList() {
    track("export:labels");
    const labels = state.placed
      .filter((p) => p.label)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((p) => p.label);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([labels.join("\n") + "\n"], { type: "text/plain" }));
    a.download = `gen2-${state.length}-${state.mount}-labels.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function flash(sel, msg) {
    const btn = $(sel);
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }

  /* ------------------------ Shareable build card ------------------------
     Renders the board into a branded PNG (wordmark, build stats, link back to
     the planner) for posting on Reddit/Discord/Printables. The board <svg> is
     styled by the page stylesheet, so a standalone copy needs that CSS embedded
     — same-origin, so document.styleSheets hands over every rule. */
  async function saveBuildImage() {
    if (!state.placed.length) return;
    track("save-image");
    const src = $("#board");
    const clone = src.cloneNode(true);
    // strip transient chrome: selection/drag highlights, the placement ghost,
    // and the one-shot drop-in classes (their animation starts at opacity 0 —
    // a static rasterisation would capture invisible units)
    clone.querySelectorAll(".ghost").forEach((n) => n.remove());
    clone.querySelectorAll(".drawer").forEach((g) => g.classList.remove("selected", "dragging", "drop-in"));
    // drop the responsive sizing but KEEP the rest of the inline style — the
    // product-color --len-face-* vars ride on it
    clone.style.width = "";
    clone.style.height = "";
    // texts inherit the page font through <body>; a standalone SVG has no body,
    // so pin the computed family on the root
    clone.style.fontFamily = getComputedStyle(src).fontFamily;
    clone.setAttribute("xmlns", SVG_NS);
    let css = "";
    for (const sheet of document.styleSheets) {
      try { for (const r of sheet.cssRules) css += r.cssText + "\n"; } catch (e) { /* cross-origin sheet: none expected */ }
    }
    const styleEl = document.createElementNS(SVG_NS, "style");
    styleEl.textContent = css;
    clone.insertBefore(styleEl, clone.firstChild);

    const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = svgUrl; });

      // ---- compose the card (logical px; drawn at 2× for crispness — the
      // browser re-rasterises the SVG vector at the scaled size) ----
      const bw = +src.getAttribute("width"), bh = +src.getAttribute("height");
      const PADC = 26, HEAD = 58, FOOT = 52;
      const cw = Math.max(bw + PADC * 2, 560);
      const chh = HEAD + bh + FOOT;
      const SCALE = 2;
      const canvas = document.createElement("canvas");
      canvas.width = cw * SCALE;
      canvas.height = chh * SCALE;
      const ctx = canvas.getContext("2d");
      ctx.scale(SCALE, SCALE);

      const lenDef = GEN2.lengths.find((l) => l.id === state.length);
      const accent = "#ff8a40", muted = "#9a9eaa", text = "#e8e9ec";
      ctx.fillStyle = "#1b1c20";
      ctx.fillRect(0, 0, cw, chh);

      // header: wordmark left, length · mount right (length in its lineup color)
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = accent;
      ctx.font = "800 20px system-ui, sans-serif";
      ctx.fillText("GEN2", PADC, 36);
      const gw = ctx.measureText("GEN2").width;
      ctx.fillStyle = muted;
      ctx.font = "600 13px system-ui, sans-serif";
      const spaced = "P L A N N E R";
      ctx.fillText(spaced, PADC + gw + 10, 36);
      const mountLabel = (mountDef() || {}).label || "";
      ctx.font = "700 16px system-ui, sans-serif";
      const lenTxt = `${state.length}mm`, mountTxt = ` · ${mountLabel}`;
      const rightW = ctx.measureText(lenTxt).width + ctx.measureText(mountTxt).width;
      ctx.fillStyle = (lenDef && lenDef.color) || accent;
      ctx.fillText(lenTxt, cw - PADC - rightW, 36);
      ctx.fillStyle = text;
      ctx.fillText(mountTxt, cw - PADC - ctx.measureText(mountTxt).width, 36);
      ctx.strokeStyle = "#33353c";
      ctx.beginPath(); ctx.moveTo(PADC, HEAD - 10); ctx.lineTo(cw - PADC, HEAD - 10); ctx.stroke();

      ctx.drawImage(img, (cw - bw) / 2, HEAD, bw, bh);
      // subtle in-board watermark, so branding survives even if someone crops
      // the card down to just the grid
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = muted;
      ctx.font = "600 11px system-ui, sans-serif";
      const wm = "jerrari3d.com";
      ctx.fillText(wm, (cw + bw) / 2 - ctx.measureText(wm).width - 10, HEAD + bh - 8);
      ctx.restore();

      // footer: stats left, call-to-action right
      const fy = HEAD + bh + 20;
      ctx.beginPath(); ctx.moveTo(PADC, fy - 12); ctx.lineTo(cw - PADC, fy - 12); ctx.stroke();
      const minX = Math.min(...state.placed.map((u) => u.x));
      const maxX = Math.max(...state.placed.map((u) => u.x + u.w));
      const minY = Math.min(...state.placed.map((u) => u.y));
      const maxY = Math.max(...state.placed.map((u) => u.y + u.hh));
      // printed pieces = everything in the plan you print (opt-outs excluded)
      const pieces = (computeBom() || []).reduce((s, sec) =>
        s + sec.items.reduce((q, it) => q + (it.hardware || it.optional ? 0 : it.qty), 0), 0);
      ctx.fillStyle = text;
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.fillText(
        `${state.placed.length} unit${state.placed.length > 1 ? "s" : ""} · ` +
        `≈ ${(maxX - minX) * GEN2.units.widthMM} × ${(maxY - minY) * (GEN2.units.heightMM / 2)} × ${state.length} mm · ` +
        `${pieces} printed parts`, PADC, fy + 6);
      // brand CTA (the fixed home domain, not the runtime host — dev shows
      // localhost and GitHub Pages isn't the brand), domain in accent
      ctx.font = "600 12px system-ui, sans-serif";
      const ctaA = "Build your own at ", ctaB = "jerrari3d.com";
      const wA = ctx.measureText(ctaA).width, wB = ctx.measureText(ctaB).width;
      ctx.fillStyle = muted;
      ctx.fillText(ctaA, cw - PADC - wA - wB, fy + 6);
      ctx.fillStyle = accent;
      ctx.fillText(ctaB, cw - PADC - wB, fy + 6);

      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gen2-build-${state.length}-${state.mount}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      flash("#save-image", "✓ Saved!");
    } catch (e) {
      flash("#save-image", "Couldn't render · try again");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  /* --------------------------- Interaction --------------------------- */

  function bindBoard() {
    const svg = $("#board");

    svg.addEventListener("mousedown", (e) => {
      if (Date.now() - lastTouchEnd < GHOST_CLICK_MS) return; // ignore touch-emulated mouse
      const pt = svgPoint(svg, e);
      const { x, y } = cellAt(pt.x, pt.y);
      const hit = unitAt(x, y);
      if (hit) {
        drag = { id: hit.id, dx: x - hit.x, dy: y - hit.y, tx: hit.x, ty: hit.y, moved: false, sx: e.clientX, sy: e.clientY };
      } else {
        pressCell = { x, y }; // empty press — placement decided on release
      }
      e.preventDefault();
    });

    svg.addEventListener("mousemove", (e) => {
      const pt = svgPoint(svg, e);
      hover = cellAt(pt.x, pt.y);
      if (drag) {
        const p = state.placed.find((u) => u.id === drag.id);
        if (p) {
          if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > DRAG_SLOP) {
            drag.moved = true;
            // dim the source unit in place — a class flip, not a rebuild
            svg.querySelector(`g.drawer[data-id="${drag.id}"]`)?.classList.add("dragging");
          }
          if (drag.moved) {
            drag.tx = hover.x - drag.dx;
            drag.ty = hover.y - drag.dy;
          }
        }
      }
      // cursor movement only ever changes the ghost; the rest of the board is
      // state-driven and stays untouched (which lets hover transitions play)
      updateGhost();
    });

    /* Selection and placement resolve on mouseup, NOT on "click". The board
       redraws (renderBoard wipes the SVG) during a press, so the element that
       received mousedown is gone by release and the browser often never fires a
       real click — clicking a placed unit would silently do nothing. mouseup
       always fires on the persistent <svg>, so it's reliable. This mirrors the
       touch flow, where touchend does the same job. */
    svg.addEventListener("mouseup", (e) => {
      if (Date.now() - lastTouchEnd < GHOST_CLICK_MS) { drag = null; pressCell = null; return; }
      if (drag) {
        const p = state.placed.find((u) => u.id === drag.id);
        if (drag.moved) {
          if (p && canPlace(drag.tx, drag.ty, p.w, p.hh, p.id)) { p.x = drag.tx; p.y = drag.ty; }
        } else if (p) {
          state.selectedUnit = state.selectedUnit === p.id ? null : p.id; // press+release on a unit = select
        }
      } else if (pressCell) {
        const pt = svgPoint(svg, e);
        const { x, y } = cellAt(pt.x, pt.y);
        // place only on a clean press-release on the same empty cell
        if (x === pressCell.x && y === pressCell.y &&
            state.selected && selectable(state.selected.w, state.selected.h) &&
            canPlace(x, y, state.selected.w, state.selected.h * 2)) {
          const id = state.nextId++;
          state.placed.push({
            id, x, y, w: state.selected.w, hh: state.selected.h * 2,
            fill: state.fill, shelves: 0,
          });
          noteBuildStart();
          state.selectedUnit = id; // auto-select the new unit so the options menu is ready
        }
      }
      drag = null;
      pressCell = null;
      refresh();
    });

    svg.addEventListener("mouseleave", () => {
      hover = null;
      drag = null;
      pressCell = null;
      renderBoard();
    });

    /* Touch: mirror the mouse flow so phones/tablets can place, move, and
       inspect. A drag that starts on a unit moves it (and blocks page scroll);
       a tap on a unit selects it (shown in the toolbar below); a tap on empty
       space places the selected size. Touches that don't start on a unit stay
       scrollable. touchend stamps lastTouchEnd so the emulated mouse events this
       tap spawns are ignored by the mouse handlers above. */
    let touchMode = null;     // "unit" | "empty"
    let touchStartCell = null;

    svg.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const pt = boardPoint(t.clientX, t.clientY);
      const cell = cellAt(pt.x, pt.y);
      const hit = unitAt(cell.x, cell.y);
      touchStartCell = cell;
      if (hit) {
        drag = { id: hit.id, dx: cell.x - hit.x, dy: cell.y - hit.y, tx: hit.x, ty: hit.y, moved: false, sx: t.clientX, sy: t.clientY };
        touchMode = "unit";
        e.preventDefault(); // claim the gesture: move the unit, don't scroll
      } else {
        touchMode = "empty";
      }
    }, { passive: false });

    svg.addEventListener("touchmove", (e) => {
      if (touchMode !== "unit" || !drag || e.touches.length !== 1) return;
      const t = e.touches[0];
      const pt = boardPoint(t.clientX, t.clientY);
      const cell = cellAt(pt.x, pt.y);
      const p = state.placed.find((u) => u.id === drag.id);
      if (!p) return;
      if (!drag.moved && Math.hypot(t.clientX - drag.sx, t.clientY - drag.sy) > TOUCH_SLOP) {
        drag.moved = true;
        svg.querySelector(`g.drawer[data-id="${drag.id}"]`)?.classList.add("dragging");
      }
      if (drag.moved) {
        drag.tx = cell.x - drag.dx;
        drag.ty = cell.y - drag.dy;
      }
      e.preventDefault();
      updateGhost();   // same as the mouse path: only the ghost moves
    }, { passive: false });

    svg.addEventListener("touchend", (e) => {
      lastTouchEnd = Date.now(); // suppress the emulated mouse events this tap will spawn
      if (touchMode === "unit" && drag) {
        if (drag.moved) {
          const p = state.placed.find((u) => u.id === drag.id);
          if (p && canPlace(drag.tx, drag.ty, p.w, p.hh, p.id)) {
            p.x = drag.tx;
            p.y = drag.ty;
          }
        } else {
          // a tap (no move) toggles the unit's selection / toolbar
          state.selectedUnit = state.selectedUnit === drag.id ? null : drag.id;
        }
        drag = null;
        touchMode = null;
        e.preventDefault(); // suppress the synthetic mouse click that follows
        refresh();
        return;
      }
      if (touchMode === "empty" && touchStartCell && e.changedTouches.length) {
        const t = e.changedTouches[0];
        const pt = boardPoint(t.clientX, t.clientY);
        const cell = cellAt(pt.x, pt.y);
        // only place on a clean tap — if the finger slid to another cell the
        // user was probably scrolling, so leave the layout alone
        if (cell.x === touchStartCell.x && cell.y === touchStartCell.y &&
            state.selected && selectable(state.selected.w, state.selected.h)) {
          const { w, h } = state.selected;
          if (canPlace(cell.x, cell.y, w, h * 2)) {
            const id = state.nextId++;
            state.placed.push({
              id, x: cell.x, y: cell.y, w, hh: h * 2,
              fill: state.fill,
              shelves: 0,
            });
            noteBuildStart();
            state.selectedUnit = id; // auto-select the new unit so the options menu is ready
            e.preventDefault();
            refresh();
          }
        }
      }
      touchMode = null;
    }, { passive: false });
  }

  function boardPoint(clientX, clientY) {
    const svg = $("#board");
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: (clientX - r.left) * (vb.width / r.width),
      y: (clientY - r.top) * (vb.height / r.height),
    };
  }

  function svgPoint(svg, evt) {
    return boardPoint(evt.clientX, evt.clientY);
  }

  function bindControls() {
    document.querySelectorAll("[data-grid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const op = btn.dataset.grid;
        if (op === "w+") state.gridW = Math.min(capW(), state.gridW + 1);
        if (op === "w-") state.gridW = Math.max(GRID_LIMITS.wMin, state.gridW - 1);
        if (op === "h+") state.gridH = Math.min(capH(), state.gridH + 1);
        if (op === "h-") state.gridH = Math.max(GRID_LIMITS.hMin, state.gridH - 1);
        clampGrid();
        refresh();
      });
    });
    $("#clear-layout").addEventListener("click", () => {
      state.placed = [];
      state.selectedUnit = null;
      refresh();
    });
    $("#surprise-me").addEventListener("click", surpriseMe);
    $("#load-example").addEventListener("click", loadExample);
    $("#build-save").addEventListener("click", saveBuildToFile);
    $("#build-share").addEventListener("click", shareLink);
    // official-kit authoring is a dev-machine tool — invisible in prod
    const official = $("#build-official");
    if (official) { official.hidden = !IS_LOCAL_DEV; official.addEventListener("click", exportOfficialBuild); }
    $("#build-import").addEventListener("change", (e) => { importBuild(e.target.files[0]); e.target.value = ""; });
    // "New to GEN2" primer: collapsible, remembers its open/closed state.
    const primer = $("#explainer-primer");
    if (primer) {
      // Collapsed by default (it's a one-time "new to GEN2" primer) — open only
      // if the user has explicitly expanded it before.
      primer.open = store.get("gen2-primer-collapsed") === "0";
      primer.addEventListener("toggle", () => {
        store.set("gen2-primer-collapsed", primer.open ? "0" : "1");
      });
    }

    // Info tooltips: give every (i) badge an accessible label from its tip text.
    document.querySelectorAll(".info-tip[data-tip]").forEach((el) => {
      if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", el.dataset.tip);
    });

    // Wall cover layout: staggered (connected top) vs per-column (easy removal).
    $("#wall-stagger-seg").querySelectorAll("[data-stagger]").forEach((btn) => {
      btn.addEventListener("click", () => { state.wallStagger = btn.dataset.stagger === "on"; refresh(); });
    });
    // Tabletop feet: print TPU feet or buy adhesive rubber feet - the BOM
    // bills the pick (never both); same count, same spots either way.
    $("#feet-seg").querySelectorAll("[data-feet]").forEach((btn) => {
      btn.addEventListener("click", () => { state.feet = btn.dataset.feet === "adhesive" ? "adhesive" : "tpu"; track("feet:" + state.feet); refresh(); });
    });
    // preferred model site — the explicit control for people who'd rather set
    // it up front than discover it via a row's ▾
    const siteSel = $("#link-site");
    STORES.forEach((s) => siteSel.appendChild(Object.assign(document.createElement("option"), { value: s.id, textContent: s.label })));
    siteSel.value = linkSite;
    siteSel.addEventListener("change", () => { setLinkSite(siteSel.value); track("linksite:" + siteSel.value); });
    $("#copy-bom").addEventListener("click", copyBom);
    $("#csv-bom").addEventListener("click", downloadCsv);
    $("#print-bom").addEventListener("click", () => window.print());
    $("#save-image").addEventListener("click", saveBuildImage);
    $("#instructions-3d").addEventListener("click", open3DInstructions);
    // demand while blocked: the disabled button is pointer-events:none, so a
    // click on it lands HERE instead. Counted per click (a deliberate act,
    // like closure-soon), where the passive instructions-blocked:<code> is
    // once per session. Enabled-button clicks bubble through too — the
    // disabled gate keeps those out.
    $("#instructions-3d-wrap").addEventListener("click", () => {
      const reason = $("#instructions-3d").disabled && instructionsBlockReason();
      if (reason && reason.code !== "empty") track("instructions-blocked-click:" + reason.code);
    });
    $("#fab-3d").addEventListener("click", open3DInstructions);
    // docked split view controls (wide screens; see the dock block above)
    $("#start-fresh").addEventListener("click", startFresh);
    bindDockGrip();
    bindFabAvoidance();
    $("#dock-tab").addEventListener("click", () => { track("dock:expand"); openDock(false); });
    $("#dock-collapse").addEventListener("click", closeDock);
    $("#dock-popout").addEventListener("click", popOutStudio);
    $("#dock-perf-collapse").addEventListener("click", closeDock);
    $("#dock-perf-x").addEventListener("click", () => { $("#dock-perf").hidden = true; });
    window.addEventListener("resize", updateDock);
    // Live sync FROM the 3D instructions viewer: it posts {gen2:"buildOptions",
    // opts} whenever the user changes drawer closure, stoppers, handle, or the
    // wall stagger there. Everything is validated against the catalog before it
    // touches state; applying it must not echo back (applyingRemoteOpts guard).
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (!d || !d.gen2) return;
      // any gen2 message identifies the viewer tab — (re)capture the handle so
      // layout sync survives a planner reload (the old viewerWin ref dies with
      // the page; the viewer re-introduces itself via viewerReady / option posts)
      if (e.source && e.source !== window) viewerWin = e.source;
      if (d.gen2 === "viewerReady") {
        // a viewer just booted (or reloaded itself onto a new mount/length) —
        // hand it the current state immediately so it can't sit stale
        lastSentLayout = null;
        postThemeToViewer(); // the planner's look first (cheap cosmetic), so the stage matches at once
        postColorsToViewer(); // …the newest filament palette (see the relay)
        if (linkSiteT) postSiteToViewer(); // …the preferred model site
        postLayoutNow(); // …and the layout LAST — the handshake's final word stays the build (tests pin this)
        return;
      }
      if (d.gen2 === "colors") {
        cacheViewerColors(d);
        return;
      }
      if (d.gen2 === "store") {
        applyRemoteSite(d);
        return;
      }
      if (d.gen2 === "perfSlow") {
        // the embedded viewer measured a bad framerate — offer the collapse
        if (document.body.classList.contains("docked")) $("#dock-perf").hidden = false;
        return;
      }
      if (d.gen2 !== "buildOptions" || !d.opts) return;
      const o = d.opts;
      applyingRemoteOpts = true;
      try {
        if (o.closures) state.placed.forEach((u) => {
          const c = o.closures[u.id];
          if (!c) return;
          if (c === "none") delete u.closure;
          else if (GEN2.closures.some((x) => x.id === c && x.parts && !x.soon)) u.closure = c;
        });
        if (Array.isArray(o.removedStoppers))
          state.removedStoppers = o.removedStoppers.filter((k) => typeof k === "string" && /^\d+:\d+$/.test(k));
        if (typeof o.wallStagger === "boolean") state.wallStagger = o.wallStagger;
        if (o.feet === "tpu" || o.feet === "adhesive") state.feet = o.feet;
        if (o.handleStyle && GEN2.handleStyles.some((h) => h.id === o.handleStyle)) state.handleStyle = o.handleStyle;
        if (o.faceStyle && GEN2.faceplateStyles.some((s) => s.id === o.faceStyle)) state.faceStyle = o.faceStyle;
        if (typeof o.backCover === "boolean") state.backCover = o.backCover;
        lastSentOpts = JSON.stringify(o); // we're now in sync with the viewer — don't echo
        refresh();
      } finally { applyingRemoteOpts = false; }
    });
    $("#labels-txt").addEventListener("click", downloadLabelList);
    // Conversion clicks (the money events): the label-generator handoff and the
    // Club join links. Delegated because both re-render. Tagged with the chosen
    // faceplate style so the funnel is legible.
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      if (a.id === "label-gen-link") track("labelgen:" + state.faceStyle);
      else if (a.href === CLUB_URL_PRINTABLES) track("club:printables");
      else if (a.href === CLUB_URL_THANGS) track("club:thangs");
    });
    // Selected-unit toolbar: arrow pad nudges, remove deletes, stepper edits
    // cabinet shelves. The markup is static, so these bind once.
    document.querySelectorAll(".ut-arrow").forEach((btn) => {
      btn.addEventListener("click", () => nudgeSelected(btn.dataset.move));
    });
    $("#ut-remove").addEventListener("click", () => {
      if (!state.selectedUnit) return;
      state.placed = state.placed.filter((u) => u.id !== state.selectedUnit);
      state.selectedUnit = null;
      refresh();
    });
    // Per-unit label: live-update the board only (full refresh would steal focus).
    $("#ut-label").addEventListener("input", (e) => {
      const u = selectedUnit();
      if (!u) return;
      const v = e.target.value.trim().toUpperCase();   // labels print better in ALL CAPS
      if (v) u.label = v; else delete u.label;
      renderBoard();
      updateLabelGenLink();   // keep the handoff link's labels current as you type
      // The label is build state like any other: give it the SAME coalesced
      // snapshot every mutation gets (350 ms after typing settles it becomes
      // its own undo entry + auto-save). Without this it only ever reached
      // history inside the NEXT action's entry - and the change listener
      // below cannot cover the board, whose mousedown preventDefault()
      // suppresses the blur that fires change (review's reproduced case:
      // type, drag a unit, undo - both vanished together).
      snapshotHistory();
    });
    // Committing the label (Enter, or leaving the field) is a real change:
    // its own undo entry, auto-saved, posted to the viewer. Until 2026-08-23
    // nothing did this - the label rode silently into whatever the NEXT
    // action snapshotted, so undoing that action deleted the label too (the
    // drawer-conversion review's undo test caught it). Deliberately NOT a
    // refresh(): `change` fires on the blur that a click elsewhere causes,
    // and a re-render there would replace the very button being pressed
    // before its click lands.
    $("#ut-label").addEventListener("change", () => {
      if (!selectedUnit()) return;
      pushHistoryNow();
      syncLayoutToViewer();
    });
    $("#ut-shelves").querySelectorAll("[data-shelf]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = selectedUnit();
        if (!p) return;
        const maxShelves = p.hh / 2 - 1;
        p.shelves = Math.max(0, Math.min(maxShelves,
          (p.shelves || 0) + (btn.dataset.shelf === "+" ? 1 : -1)));
        refresh();
      });
    });

    // Cabinet interior: Simple/Advanced toggle, edit/close (mobile sheet), clear.
    $("#ut-mode").querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = selectedUnit();
        if (!p || p.fill !== "cabinet") return;
        if (btn.dataset.mode === "advanced") {
          if (!Array.isArray(p.interior)) p.interior = []; // opt-in: empty (invalid) until tiled
          interiorOpen = true;                              // open the mobile sheet
        } else {
          delete p.interior; interiorArmed = null; interiorOpen = false; // back to the shelves model
        }
        refresh();
      });
    });
    $("#ut-edit").addEventListener("click", () => { interiorOpen = true; renderToolbar(); });
    $("#ut-interior-close").addEventListener("click", () => { interiorOpen = false; renderToolbar(); });
    $("#ut-sheet-backdrop").addEventListener("click", () => { interiorOpen = false; renderToolbar(); });
    $("#ut-int-clear").addEventListener("click", () => {
      const p = selectedUnit();
      if (!p || !Array.isArray(p.interior)) return;
      p.interior = []; refresh();
    });
    // Placement ghost: track the hovered cell and re-draw the editor so the armed
    // footprint previews under the cursor (mirrors the main grid). Bound once — the
    // #ut-int-grid element persists across re-renders.
    const intGrid = $("#ut-int-grid");
    intGrid.addEventListener("mousemove", (e) => {
      const p = selectedUnit();
      if (!p || !Array.isArray(p.interior) || !interiorArmed) return;
      const W = p.w, H = p.hh / 2, rect = intGrid.getBoundingClientRect();
      if (!rect.width) return;
      const cx = Math.floor((e.clientX - rect.left) / rect.width * W);
      const cy = Math.floor((e.clientY - rect.top) / rect.height * H);
      const nh = (cx >= 0 && cx < W && cy >= 0 && cy < H) ? { x: cx, y: cy } : null;
      const same = (nh && interiorHover && nh.x === interiorHover.x && nh.y === interiorHover.y) || (!nh && !interiorHover);
      if (same) return;
      interiorHover = nh;
      renderInterior(p, W, H);
    });
    intGrid.addEventListener("mouseleave", () => {
      if (!interiorHover) return;
      interiorHover = null;
      const p = selectedUnit();
      if (p && Array.isArray(p.interior)) renderInterior(p, p.w, p.hh / 2);
    });

    // Keyboard arrows nudge the selected unit (ignored while typing in a field).
    document.addEventListener("keydown", (e) => {
      if (!state.selectedUnit) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.key];
      if (dir) { e.preventDefault(); nudgeSelected(dir); }
    });
  }

  /* ----------------------------- Refresh ----------------------------- */

  function refresh() {
    const ready = state.mount && state.length;
    // "Start fresh" only means something once there's a layout to lose, and it
    // sits under the hero rather than in the nav so it can't be mis-clicked.
    $("#reset-bar").hidden = !state.placed.length;
    updateInstructionsButton();
    syncOptionsToViewer(); // mirror any option change into an open 3D viewer tab
    syncLayoutToViewer();  // …and any layout change (debounced full-build post)
    updateDock();          // reveal/restore the docked split view when eligible
    syncFabAvoidance();    // selection can change without the toolbar moving on screen
    snapshotHistory();     // every settled state becomes an undo step (coalesced)

    // Palette icon accents (size boxes, active fill details) wear the chosen
    // length's lineup color — same idea as the board's kit title. Selection
    // chrome stays accent orange. Cleared when no length is picked, so the
    // CSS var() fallbacks return everything to the default accent.
    const lenDef = GEN2.lengths.find((l) => l.id === state.length);
    const rootStyle = document.documentElement.style;
    // Drawer-front shades for the product-color board derive from the same
    // lineup color (165 = blue drawers, 270 = red…). They live INLINE on the
    // #board svg — not :root — so the share-card clone (a standalone SVG with
    // no <html> ancestor) still resolves them.
    const boardStyle = $("#board").style;
    if (lenDef) {
      rootStyle.setProperty("--len-color", lenDef.color);
      rootStyle.setProperty("--len-color-dim", lenDef.color + "59");   // ~35% alpha
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(lenDef.color.slice(i, i + 2), 16));
      const shade = (f) => `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
      const toWhite = (c, t) => Math.round(c + (255 - c) * t);
      boardStyle.setProperty("--len-face", shade((c) => Math.round(c * 0.88)));       // front body
      boardStyle.setProperty("--len-face-light", shade((c) => toWhite(c, 0.18)));     // rails / scoop ramp
      boardStyle.setProperty("--len-face-dark", shade((c) => Math.round(c * 0.62)));  // recesses
      boardStyle.setProperty("--len-face-edge", shade((c) => toWhite(c, 0.45)));      // lip highlight
    } else {
      rootStyle.removeProperty("--len-color");
      rootStyle.removeProperty("--len-color-dim");
      ["--len-face", "--len-face-light", "--len-face-dark", "--len-face-edge"]
        .forEach((p) => boardStyle.removeProperty(p));
    }
    $("#step-layout").hidden = !ready;
    $("#step-customize").hidden = !ready; // renderStyleSegs may re-hide it when nothing applies
    $("#step-parts").hidden = !ready;
    renderStepSummaries();
    syncStepCollapse(ready);
    syncTabletopGrid();
    const autoH = state.mount === "tabletop";
    $("#grid-h-control").hidden = autoH;
    $("#grid-h-auto").hidden = !autoH;
    $("#grid-w-label").textContent = state.gridW + "W";
    $("#grid-h-label").textContent = state.gridH + "H";
    renderLengthCards();
    renderSpaceStep();
    renderFillSeg();
    renderStyleSegs();
    renderPalette();
    renderBoardHelper();
    // Covers panel (tabletop/wall): the wall-only layout toggle + the
    // "how covers stack" guide, grouped together below the board.
    $("#cover-panel").hidden = !(state.mount === "tabletop" || state.mount === "wall");
    $("#wall-stagger").hidden = state.mount !== "wall";
    $("#feet-opt").hidden = state.mount !== "tabletop";
    if (state.mount === "tabletop") {
      $("#feet-seg").querySelectorAll("[data-feet]").forEach((b) =>
        b.classList.toggle("active", b.dataset.feet === (state.feet === "adhesive" ? "adhesive" : "tpu")));
      $("#feet-hint").textContent = state.feet === "adhesive"
        ? "Stick to the flat pads around the underside slots · same count and spots as printed feet."
        : "Snap into the underside slots · a single bottom case takes them directly, a row of two or more in the lower foot rail.";
    }
    if (state.mount === "wall") {
      $("#wall-stagger-seg").querySelectorAll("[data-stagger]").forEach((b) =>
        b.classList.toggle("active", (b.dataset.stagger === "on") === state.wallStagger));
      $("#wall-stagger-hint").textContent = state.wallStagger
        ? "One connected top · most rigid."
        : "Each column lifts off on its own (3W/4W cases still stagger internally).";
    }
    if (ready) renderBoard();
    renderToolbar();
    renderBom();
  }

  /* ------------------------------ Init ------------------------------ */

  renderMountCards();
  renderLengthCards();
  buildPrinterSelect();
  bindBoard();
  bindControls();
  bindBomTracker();
  bindHistory();
  bindThumbZoom();
  bindVideoModal();
  bindStepCollapse();
  applyBoardColors();
  refresh();
  const sharedLink = loadBuildFromHash();   // open a shared #build=… link, if present
  // Resume the previous session's build — closing the tab shouldn't cost the
  // layout. Anything explicit wins: if the hash restored a build (or the page
  // somehow starts non-empty), skip. An empty saved state means the user
  // deliberately cleared before leaving — respect it and start blank.
  // A DAMAGED share link also blocks the resume: silently showing the user's
  // own build under someone else's link is how a wrong BOM gets printed. The
  // banner offers the saved build as an explicit choice instead.
  if (sharedLink !== "damaged" && !state.placed.length && LAST_BUILD_RAW) {
    try {
      const last = JSON.parse(LAST_BUILD_RAW);
      if (last && Array.isArray(last.placed) && last.placed.length && applyBuild(last)) track("resume-build");
    } catch (e) { /* corrupt stored build — start fresh */ }
  }

  /* Headless test hook. Attaches the live state and a few pure helpers to the
     window ONLY when a harness opts in by setting this flag truthy before the
     script runs (see test/planner.test.mjs). It is absent in normal use. */
  if (typeof window !== "undefined" && window.__GEN2_PLANNER_TEST__) {
    window.__GEN2_PLANNER_TEST__ = {
      state, refresh, nudgeSelected, canPlace, selectable, sizeExists, heightsForFill,
      computeBom, selectedUnit, interiorFill, interiorComplete, interiorCellsLeft, placeCompartment,
      fixStructure, surpriseMe, serializeBuild, applyBuild, bowRisks, sagRisks,
      mountBlocksLength, enforceMountLength, wallTopHalfHeight, fixWallTops,
      setMount, rebaseToMountEdge, unsupportedUnits, tabletopCompletion,
      planConversion, applyConversion, convertProblem, GEN2,
      encodeBuildHash, applyBuildHash,
      undoRedo, pushHistoryNow, history, buildMeta,
      partLinks, setLinkSite, applyRemoteSite, linkSite: () => linkSite,
    };
  }
})();
