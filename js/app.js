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
    wallStagger: true,      // wall covers: true = staggered top, false = per-column
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
      return `Classic drawer handle adds ~${GEN2.classicHandleExtraMM}mm — won't fit your ${bedTxt}`;
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
  function sizeExists(w, h, fill) {
    const f = fill || state.fill;
    if (f === "classic" || f === "decor")
      return !GEN2.unavailableSizes.includes(sizeToken(w, h));
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

  function renderMountCards() {
    const wrap = $("#mount-cards");
    wrap.innerHTML = "";
    GEN2.mounts.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card" + (state.mount === m.id ? " active" : "");
      btn.innerHTML =
        `<div class="card-icon">${mountIcon(m.id)}</div>` +
        `<div class="card-title">${m.label}</div>` +
        `<div class="card-blurb">${m.blurb}</div>`;
      btn.addEventListener("click", () => {
        state.mount = m.id;
        renderMountCards();
        refresh();
      });
      wrap.appendChild(btn);
    });
  }

  function renderLengthCards() {
    const wrap = $("#length-cards");
    wrap.innerHTML = "";
    GEN2.lengths.forEach((l) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const ok = lengthFits(l.id);
      btn.className = "card slim len-card" + (state.length === l.id ? " active" : "") + (ok ? "" : " disabled");
      btn.style.setProperty("--len-color", l.color);
      btn.innerHTML =
        `<div class="card-title"><span class="len-num">${l.label}</span><span class="mm">mm</span>` +
        (l.recommended ? `<span class="badge">recommended</span>` : "") +
        (ok ? "" : `<span class="badge nofit">won't fit</span>`) +
        `</div>` +
        `<div class="card-blurb">${l.tagline}</div>`;
      if (ok) {
        btn.addEventListener("click", () => {
          const wasReady = state.mount && state.length;
          state.length = l.id;
          ensureValidSelection();
          renderLengthCards();
          refresh();
          // first time the layout unlocks, bring it into view
          if (!wasReady && state.mount) {
            const target = $("#step-layout");
            if (typeof target.scrollIntoView === "function") {
              try { target.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* noop */ }
            }
          }
        });
      } else {
        const bed = bedSize();
        btn.title = `Even a 1W case (${GEN2.units.widthMM}×${l.id}mm) won't fit your ${bed.x}×${bed.y}mm bed`;
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
          ? `${state.spaceW}mm is narrower than 1W (${GEN2.units.widthMM}mm) — nothing fits`
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
        ? `${state.spaceW || "—"} × ${state.spaceH || "—"} mm`
        : "optional — caps the grid to your space";
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
    GEN2.printers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label + (p.x ? ` (${p.x}×${p.y}mm)` : "");
      sel.appendChild(opt);
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
      return `<svg viewBox="0 0 64 44">${frame}
        <rect x="7" y="7" width="50" height="30" rx="3" class="fi-face"/>
        <rect x="9" y="8" width="46" height="6" rx="2" class="fi-dark"/>
        <polygon points="12,29 52,29 46,36 18,36" class="fi-lip"/></svg>`;
    }
    if (id === "decor") {
      return `<svg viewBox="0 0 64 44">${frame}
        <rect x="7" y="7" width="50" height="30" rx="3" class="fi-dark"/>
        <rect x="9" y="7" width="6" height="30" rx="2" class="fi-rail"/>
        <rect x="49" y="7" width="6" height="30" rx="2" class="fi-rail"/>
        <line x1="15" y1="33" x2="49" y2="33" class="fi-line"/></svg>`;
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

  function renderFillSeg() {
    const seg = $("#fill-seg");
    seg.innerHTML = "";
    GEN2.fills.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fill-tile" + (state.fill === f.id ? " active" : "");
      const card =
        `<span class="tip-card" role="tooltip">` +
        (f.previewImg
          ? `<img class="tip-card-img" src="${f.previewImg}" alt="${f.label}" loading="lazy" />`
          : "") +
        `<span class="tip-card-text"><b>${f.label}</b>${f.blurb}</span>` +
        `</span>`;
      btn.innerHTML =
        `<span class="fill-icon">${fillIcon(f.id)}</span>` +
        `<span class="fill-label">${f.label}${f.soon ? ' <span class="soon">soon</span>' : ""}</span>` +
        card;
      btn.addEventListener("click", () => {
        state.fill = f.id;
        ensureValidSelection();
        refresh();
      });
      seg.appendChild(btn);
    });
    $("#fill-blurb").textContent = fillDef().blurb;
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
    build("#faceplate-style-seg", GEN2.faceplateStyles, state.faceStyle, (id) => { state.faceStyle = id; });
    build("#door-style-seg", GEN2.doorStyles, state.doorStyle, (id) => { state.doorStyle = id; });
    $("#faceplate-style-pick").hidden = !state.placed.some((p) => p.fill === "decor");
    $("#door-style-pick").hidden = !state.placed.some((p) => p.fill === "cabinet");
    // Label-bearing faceplates (EdgeLabel / Classic Pro) link out to the label generator.
    const fdef = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
    const link = $("#label-gen-link");
    if (fdef && fdef.labelGen) {
      link.hidden = false;
      link.href = fdef.labelGen;
      link.textContent = `🏷 Design your ${fdef.label} labels →`;
    } else {
      link.hidden = true;
    }
  }

  function renderPalette() {
    $("#palette-units").textContent =
      `1W = ${GEN2.units.widthMM}mm wide · 1H = ${GEN2.units.heightMM}mm tall`;
    const wrap = $("#palette-items");
    wrap.innerHTML = "";
    heightsForFill().forEach((h) => {
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
          item.title = fitProblem(w, state.fill) ||
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
  // A touch tap emits emulated mouse events (mousedown/mouseup/click) right
  // after touchend. We handle touches ourselves, so ignore any mouse event that
  // lands within this window of a touchend — otherwise those emulated events
  // re-run the mouse handlers and undo the tap we just processed.
  let lastTouchEnd = 0;
  const GHOST_CLICK_MS = 700;
  // A press that moves less than this many CSS pixels counts as a tap/click
  // (which selects the unit), not a drag. Grid cells are tiny on phones, so
  // without a pixel dead-zone the small finger drift in an ordinary tap reads as
  // a one-cell drag and the unit never gets selected. Desktop cells are large,
  // so deliberate drags still clear this easily.
  const DRAG_SLOP = 18;

  // Advanced cabinet interior editor — transient UI state (never persisted on a unit).
  let interiorArmed = null; // {w,h} armed compartment size for click-to-place, or null
  let interiorOpen = false; // mobile bottom-sheet open flag (desktop shows the editor inline)
  let interiorHover = null; // {x,y} cell under the cursor in the editor, for the placement ghost
  let toolbarSel = null;    // last unit id rendered in the toolbar; resets the above on change

  function renderBoard() {
    const svg = $("#board");
    const W = PAD.left + state.gridW * CW + PAD.right;
    const H = PAD.top + rows() * (CH / 2) + PAD.bottom;
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
    state.placed.forEach((p) => drawUnit(svg, p, bows));

    if (drag && drag.moved) {
      // moving an existing unit: ghost it at the drop target
      const p = state.placed.find((u) => u.id === drag.id);
      if (p) {
        const ok = canPlace(drag.tx, drag.ty, p.w, p.hh, p.id);
        el("rect", {
          x: gx + drag.tx * CW + 2, y: gy + drag.ty * (CH / 2) + 2,
          width: p.w * CW - 4, height: p.hh * (CH / 2) - 4, rx: 6,
          class: ok ? "ghost ok" : "ghost bad",
        }, svg);
      }
    } else if (hover && state.selected && !drag) {
      const { w, h } = state.selected;
      const hh = h * 2;
      const ok = canPlace(hover.x, hover.y, w, hh);
      if (hover.x >= 0 && hover.y >= 0 && hover.x < state.gridW && hover.y < rows() && !unitAt(hover.x, hover.y)) {
        el("rect", {
          x: gx + hover.x * CW + 2, y: gy + hover.y * (CH / 2) + 2,
          width: w * CW - 4, height: hh * (CH / 2) - 4, rx: 6,
          class: ok ? "ghost ok" : "ghost bad",
        }, svg);
      }
    }

    renderBoardMeta();
    renderWarnings();
  }

  function drawUnit(svg, p, bows) {
    const x = PAD.left + p.x * CW, y = PAD.top + p.y * (CH / 2);
    const w = p.w * CW, h = p.hh * (CH / 2);
    const sel = state.selectedUnit === p.id;
    const dragging = drag && drag.moved && drag.id === p.id;
    const g = el("g", {
      class: "drawer" + (sel ? " selected" : "") + (dragging ? " dragging" : "")
        + (bows && bows.has(p.id) ? " bow" : ""),
      "data-id": p.id,
    }, svg);
    // an advanced cabinet whose interior isn't fully tiled flags red on the board
    const cabFill = interiorFill(p);
    const caseCls = "d-case" + (cabFill ? (cabFill.complete ? " tiled-ok" : " tiled-bad") : "");
    el("rect", { x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 6, class: caseCls }, g);

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
      // open front with the two vertical faceplate rails
      el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-interior" }, g);
      el("rect", { x: x + 9, y: y + 7, width: 7, height: h - 14, rx: 2, class: "d-rail" }, g);
      el("rect", { x: x + w - 16, y: y + 7, width: 7, height: h - 14, rx: 2, class: "d-rail" }, g);
      el("line", { x1: x + 16, y1: y + h - 11, x2: x + w - 16, y2: y + h - 11, class: "d-shelf-line" }, g);
    } else {
      // classic bin: open top + integrated chamfered handle lip at the bottom
      el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-face" }, g);
      el("rect", { x: x + 9, y: y + 8, width: w - 18, height: 5, rx: 2, class: "d-interior" }, g);
      const lipTopY = y + h - 16, lipBotY = y + h - 7;
      el("polygon", {
        points: `${x + 12},${lipTopY} ${x + w - 12},${lipTopY} ${x + w - 22},${lipBotY} ${x + 22},${lipBotY}`,
        class: "d-lip",
      }, g);
    }
    el("text", { x: x + w - 8, y: y + h - 9, class: "d-label", "text-anchor": "end" }, g)
      .textContent = sizeToken(p.w, p.hh / 2);
    if (p.label) {
      el("text", { x: x + 9, y: y + 16, class: "d-userlabel" }, g).textContent = p.label;
    }
  }

  /* Mount-specific scenery drawn around the grid, with the needed
     mount parts illustrated over the occupied columns. */
  function drawMountScene(svg, W, H) {
    const cols = occupiedColumns();
    const gy = PAD.top;
    const gridBottom = gy + rows() * (CH / 2);

    if (state.mount === "under-table") {
      el("rect", { x: 0, y: gy - 26, width: W, height: 18, class: "s-wood" }, svg);
      el("text", { x: W / 2, y: gy - 32, class: "s-label", "text-anchor": "middle" }, svg)
        .textContent = "table / desk underside" + (state.spaceW ? ` — ${state.spaceW}mm available` : "");
      // one bar per rail section, spanning the section's full width
      railSections().forEach((s) => {
        el("rect", { x: PAD.left + s.start * CW + 8, y: gy - 8, width: s.w * CW - 16, height: 8, rx: 2, class: "s-part s-rail" }, svg);
      });
      if (cols.length) {
        el("text", { x: PAD.left, y: gridBottom + 24, class: "s-part-label" }, svg)
          .textContent = `▮ GEN2 Rails - ${state.length ?? ""}: ${mixText(railMix())}`;
      }
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
        el("text", { x: PAD.left, y: gy - 48, class: "s-part-label" }, svg)
          .textContent = `▮ Table Top Kit V2 - ${state.length ?? ""}`;
        el("text", { x: PAD.left, y: gy - 36, class: "s-hint-label" }, svg)
          .textContent = "Covers (CU over CL) stagger like brick — seams offset for strength";
      }
    } else if (state.mount === "wall") {
      el("rect", { x: 0, y: 0, width: 16, height: H, class: "s-wood" }, svg);
      for (let yy = 10; yy < H; yy += 26)
        el("line", { x1: 4, y1: yy, x2: 12, y2: yy + 8, class: "s-wood-grain" }, svg);
      el("text", { x: 26, y: 16, class: "s-label" }, svg)
        .textContent = "wall" + (state.spaceW ? ` — ${state.spaceW}mm available` : "");
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
        el("text", { x: PAD.left, y: gridBottom + 24, class: "s-part-label" }, svg)
          .textContent = `▮ Wall Mount Kit - Lite - ${state.length ?? ""}: ${mixText(mixOf(wallSections()))}`;
        el("text", { x: PAD.left, y: gridBottom + 38, class: "s-hint-label" }, svg)
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
        ? `Click the grid to place your ${sizeToken(state.selected.w, state.selected.h)} ${fillDef().label} — or load an example layout from the panel.`
        : "Pick a size from the palette to begin.";
    } else if (state.selectedUnit) {
      elH.textContent = "Unit selected · use the arrow pad below to move it one step, or Remove it · click an empty cell to add more.";
    } else {
      elH.textContent = "Click the grid to add more · drag a unit to move it · click a unit to select, then move or remove it below.";
    }
  }

  /* A small ready-made layout so first-time users can see the illustration
     and parts list react before they understand every control. Adapts to the
     current grid, printer, and mount. */
  function loadExample() {
    state.placed = [];
    state.selectedUnit = null;
    const fits = (w, fill) => state.gridW >= w && fillFits(w, fill);

    // top level: a row of 1H drawers
    const row = [];
    let x = 0;
    [
      { w: 2, fill: "decor" },
      { w: 1, fill: "decor" },
      { w: 1, fill: fits(1, "classic") ? "classic" : "decor" },
    ].forEach((u) => {
      if (fits(u.w, u.fill) && x + u.w <= state.gridW) {
        row.push({ x, level: 0, w: u.w, hh: 2, fill: u.fill });
        x += u.w;
      }
    });
    if (!row.length && fits(1, "decor")) row.push({ x: 0, level: 0, w: 1, hh: 2, fill: "decor" });

    // second level: tabletop needs a flat top, so mirror the full row;
    // hanging mounts get one taller drawer under the first column
    const extra = [];
    if (state.mount === "tabletop") {
      row.forEach((u) => extra.push({ ...u, level: 1, hh: 2 }));
    } else if (capH() >= 3 && fits(2, "decor") && x >= 2) {
      extra.push({ x: 0, level: 1, w: 2, hh: 4, fill: "decor" });
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
    refresh();
  }

  /* "Surprise me": a random but always-valid build for the current mount /
     length / printer. Built as solid rows (each tiles the full width, so every
     case is fully supported by the row toward the surface) of random widths,
     heights, and drawer fills. */
  function surpriseMe() {
    const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const pick = (arr) => arr[randInt(0, arr.length - 1)];
    const FILLS = ["classic", "decor"];

    // widest case width that prints on the current bed at this length
    let maxFitW = 0;
    for (let w = 1; w <= 4; w++) if (FILLS.some((f) => fillFits(w, f))) maxFitW = w;
    if (!maxFitW) {
      const box = $("#board-warnings");
      box.innerHTML = "";
      warn(box, "No case size fits the selected printer at this length — pick a smaller length or a larger printer, then try again.");
      return;
    }

    const fromTop = state.mount !== "tabletop";
    const maxW = Math.max(1, Math.min(capW(), 5));
    const W = randInt(Math.min(2, maxW), maxW);

    // Tile one row of height hh (half-rows) across the full width W.
    const tileRow = (hh) => {
      const cases = [];
      for (let x = 0; x < W; ) {
        const opts = [];
        for (let w = 1; w <= Math.min(maxFitW, W - x); w++) {
          if (!sizeExists(w, hh / 2)) continue;
          const ff = FILLS.filter((f) => fillFits(w, f));
          if (ff.length) opts.push({ w, fills: ff });
        }
        const o = opts.length ? pick(opts) : { w: 1, fills: [FILLS[0]] };
        cases.push({ x, w: o.w, fill: pick(o.fills) });
        x += o.w;
      }
      return { hh, cases };
    };

    // Stack 1–3 rows of 1H/2H, capped by the workable/grid height.
    const maxHH = capH() * 2;
    const rowsArr = [];
    let totalHH = 0;
    for (let i = 0, n = randInt(1, 3); i < n; i++) {
      const cand = [2, 4].filter((hh) => totalHH + hh <= maxHH && sizeExists(1, hh / 2));
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
    refresh();
  }

  /* ----------------------- Save / load builds ----------------------- */

  // The fields that make a build reproducible (setup + layout).
  const BUILD_FIELDS = ["mount", "length", "printer", "customBed", "spaceW", "spaceH",
    "faceStyle", "doorStyle", "wallStagger", "gridW", "gridH", "placed", "nextId"];
  const BUILDS_KEY = "gen2-builds";

  const serializeBuild = () => {
    const o = {};
    BUILD_FIELDS.forEach((k) => { o[k] = state[k]; });
    return JSON.parse(JSON.stringify(o));   // deep copy (placed array)
  };

  function applyBuild(data) {
    if (!data || !Array.isArray(data.placed)) return false;
    data = JSON.parse(JSON.stringify(data));   // isolate from the source (no shared refs)
    BUILD_FIELDS.forEach((k) => { if (k in data) state[k] = data[k]; });
    state.selectedUnit = null;
    // Reflect the restored setup back into the controls.
    $("#printer-select").value = state.printer;
    if (state.customBed) { $("#bed-x").value = state.customBed.x ?? ""; $("#bed-y").value = state.customBed.y ?? ""; }
    $("#space-w").value = state.spaceW ?? "";
    $("#space-h").value = state.spaceH ?? "";
    renderMountCards();
    refresh();
    return true;
  }

  const loadBuilds = () => { try { return JSON.parse(store.get(BUILDS_KEY)) || []; } catch (e) { return []; } };
  const saveBuilds = (list) => store.set(BUILDS_KEY, JSON.stringify(list));

  function saveCurrentBuild() {
    if (!state.placed.length) return;
    const name = (window.prompt("Name this build:", `${state.length} ${state.mount} build`) || "").trim();
    if (!name) return;
    const list = loadBuilds().filter((b) => b.name !== name);   // overwrite same name
    list.push({ name, savedAt: Date.now(), data: serializeBuild() });
    saveBuilds(list);
    renderBuildList();
  }

  function deleteBuild(name) {
    saveBuilds(loadBuilds().filter((b) => b.name !== name));
    renderBuildList();
  }

  function renderBuildList() {
    const box = $("#build-list");
    if (!box) return;
    const list = loadBuilds().sort((a, b) => b.savedAt - a.savedAt);
    box.innerHTML = "";
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "builds-empty";
      p.textContent = "No saved builds yet.";
      box.appendChild(p);
      return;
    }
    list.forEach((b) => {
      const row = document.createElement("div");
      row.className = "build-row";
      const load = document.createElement("button");
      load.type = "button"; load.className = "build-load"; load.textContent = b.name;
      load.title = "Load this build";
      load.addEventListener("click", () => applyBuild(b.data));
      const exp = document.createElement("button");
      exp.type = "button"; exp.className = "build-act"; exp.textContent = "⭳";
      exp.setAttribute("aria-label", `Export ${b.name} to a file`);
      exp.title = "Export to file";
      exp.addEventListener("click", () => exportBuild(b.data, b.name));
      const del = document.createElement("button");
      del.type = "button"; del.className = "build-act build-del"; del.textContent = "✕";
      del.setAttribute("aria-label", `Delete ${b.name}`);
      del.title = "Delete";
      del.addEventListener("click", () => deleteBuild(b.name));
      row.append(load, exp, del);
      box.appendChild(row);
    });
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
    try { return applyBuild(JSON.parse(decodeURIComponent(escape(atob(hash))))); } catch (e) { return false; }
  }
  // Load a build from a #build=… link on first open.
  function loadBuildFromHash() {
    const m = (location.hash || "").match(/build=([^&]+)/);
    return m ? applyBuildHash(m[1]) : false;
  }

  function shareLink() {
    if (!state.placed.length) return;
    const url = location.origin + location.pathname + "#build=" + encodeBuildHash();
    const flash = () => {
      const b = $("#build-share"), t = b.dataset.label || b.textContent;
      b.dataset.label = t; b.textContent = "✓ Link copied!";
      setTimeout(() => { b.textContent = t; }, 1800);
    };
    const fallback = () => { const i = $("#share-url"); i.hidden = false; i.value = url; i.focus(); i.select(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(flash, fallback);
    } else fallback();
  }

  function importBuild(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let ok = false;
      try { const p = JSON.parse(reader.result); ok = applyBuild(p && p.data ? p.data : p); } catch (e) { ok = false; }
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
      meta.textContent = "Layout is empty — place your first unit.";
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

  /* Fill the empty run in column c from row `s` toward the surface (direction
     `step`) with stacked 1W cases — 1H where it fits, a 0.5H for the remainder. */
  function fillColumn(c, s, step) {
    const occ = occupancy();
    const cells = [];
    for (let y = s; y >= 0 && y < rows() && !occ.has(c + "," + y); y += step) cells.push(y);
    if (!cells.length) return 0;
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

  function renderWarnings() {
    const box = $("#board-warnings");
    box.innerHTML = "";
    if (!state.placed.length) return;

    // Support toward the mount surface (top for under-table & wall, bottom for
    // tabletop). A case QuickLocks to whatever sits in the adjacent row and must
    // be held on BOTH its left and right ends — one-sided support cantilevers
    // and isn't buildable.
    const occ = occupancy();
    const fromTop = state.mount !== "tabletop";
    const unsupported = state.placed.filter((p) => {
      if (fromTop ? p.y === 0 : p.y + p.hh === rows()) return false; // sits on the mount surface
      const supRow = fromTop ? p.y - 1 : p.y + p.hh;                 // adjacent row toward the mount
      const left = occ.has(p.x + "," + supRow);
      const right = occ.has((p.x + p.w - 1) + "," + supRow);
      return !(left && right);
    });
    if (unsupported.length) {
      const div = warn(box, fromTop
        ? `${unsupported.length} unit(s) aren't supported on both ends — a case QuickLocks to the row above and needs a unit above its left and right edges. Move it to the top row, or fill the gap above the open end.`
        : `${unsupported.length} unit(s) aren't supported on both ends — tabletop stacks build from the surface, so each case needs a unit below its left and right edges. Move it down, or fill the gap under the open end.`);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small warn-fix";
      btn.textContent = "Fix structure";
      btn.addEventListener("click", () => {
        const r = fixStructure();
        refresh();
        const note = document.createElement("div");
        note.className = "fix-note";
        note.textContent = `✓ Structure fixed — ${r.moved} unit${r.moved === 1 ? "" : "s"} moved`
          + (r.added ? `, ${r.added} support case${r.added === 1 ? "" : "s"} added` : "") + ".";
        $("#board-warnings").prepend(note);
      });
      div.appendChild(btn);
    }

    // placed units that no longer fit the selected printer
    const misfits = state.placed.filter((p) => !fillFits(p.w, p.fill));
    if (misfits.length) {
      const sizes = [...new Set(misfits.map((p) => `${sizeToken(p.w, p.hh / 2)} ${fillDef(p.fill).label}`))];
      warn(box, `${misfits.length} placed unit(s) won't print on the selected printer: ${sizes.join(", ")}.`);
    }

    // soft bow/stress advisory — never blocks, just a heads-up
    const bows = bowRisks();
    if (bows.size) {
      warn(box, `${bows.size} wide case(s) may bow under load — a narrower case loads the interior of a wider one, away from its end walls. To stiffen it: match widths, align the narrower case to an end, or support the full span.`)
        .classList.add("warn-soft");
    }

    // advanced cabinets whose interior isn't fully tiled can't be built yet
    const untiled = state.placed.filter((p) => { const f = interiorFill(p); return f && !f.complete; });
    if (untiled.length) {
      const cells = untiled.reduce((n, p) => n + interiorCellsLeft(p), 0);
      warn(box, `${untiled.length} cabinet(s) have an unfinished interior — fill the whole cabinet (${cells} cell${cells > 1 ? "s" : ""} left).`);
    }

    // tabletop covers need every column to stack to the same height
    if (state.mount === "tabletop") {
      const tops = Object.values(columnTops());
      if (new Set(tops).size > 1) {
        warn(box, "Table Top covers need a flat top — every column must stack to the same height before the cover can attach.");
      }
    }
  }

  function warn(box, text) {
    const div = document.createElement("div");
    div.className = "warn";
    div.textContent = "⚠ " + text;
    box.appendChild(div);
    return div;
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

    if (!p) {
      bar.classList.remove("active");
      thumb.classList.add("empty");
      thumb.removeAttribute("src");
      $("#ut-title").textContent = "No unit selected";
      $("#ut-sub").textContent = "Click a part on the grid to move or remove it.";
      remove.disabled = true;
      shelves.hidden = true;
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
    $("#ut-sub").textContent =
      `${p.w * GEN2.units.widthMM} × ${h * GEN2.units.heightMM} × ${state.length}mm`;
    remove.disabled = false;

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
    if (!valid) warnEl.textContent = `Fill the whole cabinet — ${left} cell${left > 1 ? "s" : ""} left`;
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
    if (!state.length || !state.mount || !state.placed.length) return null;
    const len = state.length;
    const P = GEN2.partNames;
    const faceStyle = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle).label;
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
        count(cases, size);
        if (p.fill === "decor") decorCount++;
      } else if (p.fill === "shelf") {
        // Build from a 1H case + extenders, not one tall case: tall cases warp/
        // fail more in print, and splitting the parts lets them batch across
        // machines (and share SKUs with cabinet cases/extenders).
        count(cases, sizeToken(p.w, 1));
        const shelfExt = h - 1;
        if (shelfExt > 0) count(extenders, p.w, shelfExt);
        count(inserts, p.w);
      } else if (p.fill === "cabinet") {
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
          return { name: P.drawer(len, size, fillLabel), qty };
        }),
      });
    }

    if (inserts.size || doors.size) {
      const items = [];
      [...inserts.entries()].sort().forEach(([w, qty]) => items.push({
        name: P.shelfInsert(len, w), qty,
        note: "Shelf inserts are sized by width only.",
        unreleased: GEN2.unreleased.includes("shelfInsert"),
      }));
      [...doors.entries()].sort().forEach(([size, qty]) => items.push({
        name: P.door(len, size, doorStyle), qty,
        note: "Door matches the total width and height of the case + extenders.",
        unreleased: GEN2.unreleased.includes("door"),
      }));
      if (hinges) items.push({
        name: P.hinge(), qty: hinges,
        note: "Hinges are 1H — 1H cabinets take 1 hinge, taller cabinets take 2.",
        unreleased: GEN2.unreleased.includes("hinge"),
      });
      if (latches) items.push({
        name: P.latch(), qty: latches,
        note: "Latches are 1H — 1H cabinets take 1 latch, taller cabinets take 2.",
        unreleased: GEN2.unreleased.includes("latch"),
      });
      sections.push({ title: "Shelves & Cabinets", items });
    }

    {
      const items = [...cases.entries()].sort().map(([size, qty]) => ({
        name: P.case(len, size), qty,
        note: "Cases QuickLock together.",
      }));
      [...extenders.entries()].sort().forEach(([w, qty]) => items.push({
        name: P.extender(len, w), qty,
        note: "Stacks above a case to add cabinet height — interchangeable with full cases.",
      }));
      const totalCases = [...cases.values()].reduce((a, b) => a + b, 0);
      items.push(
        { name: P.quickLockL(), qty: totalCases, note: GEN2.quickLock.note, linkAs: GEN2.quickLock.linkName },
        { name: P.quickLockR(), qty: totalCases, note: GEN2.quickLock.note, linkAs: GEN2.quickLock.linkName },
      );
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
        note: "Optional — covers the exposed sides of the outermost cases (pairs to each case's height via the side dovetails). Most popular with Table Top Kits.",
        optional: true,
        unreleased: GEN2.unreleased.includes("sideCover"),
      }));
      sections.push({ title: "Cases, Extenders & QuickLocks", items });
    }

    if (decorCount) {
      const items = [];
      state.placed.filter((p) => p.fill === "decor").reduce((map, p) => {
        count(map, sizeToken(p.w, p.hh / 2));
        return map;
      }, new Map()).forEach((qty, size) => {
        items.push({ name: P.faceplate(len, size, faceStyle), qty });
      });
      items.sort((a, b) => a.name.localeCompare(b.name));
      const faceDef = GEN2.faceplateStyles.find((s) => s.id === state.faceStyle);
      GEN2.decorExtras.forEach((x) => {
        // EdgeLabel / Classic Pro faceplates have a built-in handle.
        if (x.id === "handle" && faceDef && faceDef.integratedHandle) return;
        items.push({
          name: x.name(len),
          qty: x.qtyPerDrawer * decorCount,
          note: x.note,
          hardware: x.hardware,
          optional: x.optional,
        });
      });
      sections.push({ title: "Faceplates & Hardware (Decor)", items });
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
    const ctx = {
      len,
      cols: occupiedColumns().length,
      runs,
      wallStagger: state.wallStagger,
      topCases: topCases().map((p) => p.w),   // top-row case widths (per-column covers)
      railMix: mix,
      railScrews: Object.entries(mix).reduce((sum, [w, n]) => sum + n * GEN2.railScrews(+w), 0),
      wallMix: mixOf(wallSections()),
    };
    const mountTitle = { tabletop: "Table Top Kit", wall: "Wall Mount", "under-table": "Mounting" };
    sections.push({ title: mountTitle[state.mount] || "Mounting", items: GEN2.mountBom[state.mount](ctx) });

    return sections;
  }

  function renderBom() {
    const wrap = $("#bom");
    const sections = computeBom();
    if (!sections) {
      wrap.innerHTML = `<p class="hint">Choose a location and length, then place units in the layout — your parts list builds itself here.</p>`;
      return;
    }
    // starter-kit tip leads the list for first-build-sized layouts
    let html = "";
    const starter = `GEN2 Under Table Starter Kit - ${state.length}`;
    if (state.mount === "under-table" && LINK_OVERRIDES[starter] && state.placed.length <= 4) {
      html += `<p class="tip">💡 New to GEN2? The <a href="${partLinks(starter).printables}" target="_blank" rel="noopener">${starter}</a> bundles everything for a first install.</p>`;
    }
    sections.forEach((sec) => {
      html += `<h3>${sec.title}</h3><table class="bom-table"><tbody>`;
      sec.items.filter((it) => it.qty > 0).forEach((it) => { // never show 0× rows (e.g. QuickLocks for an untiled cabinet)
        const img = it.hardware ? "img/parts/hardware.svg" : partImage(it.name);
        html += `<tr class="${it.optional ? "optional" : ""}">
          <td class="thumb"><img src="${img}" alt="" loading="lazy"
            onerror="this.onerror=null;this.src='img/parts/placeholder.svg'"></td>
          <td class="qty">${it.qty}×</td>
          <td class="name">${it.name}${it.variant ? ` — <em>${it.variant}</em>` : ""}${it.optional ? ' <span class="tag">optional</span>' : ""}
            ${it.note ? `<div class="note">${it.note}</div>` : ""}</td>
          <td class="link">${linkButtons(it)}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    });
    wrap.innerHTML = html;
  }

  function linkButtons(it) {
    if (it.hardware) return `<span class="tag">hardware store</span>`;
    if (it.unreleased) return `<span class="tag soon-tag">coming soon</span>`;
    const links = partLinks(it.linkAs || it.name);
    return `<a class="btn small ${links.exactP ? "" : "ghost"}" href="${links.printables}" target="_blank" rel="noopener">Printables</a>
      <a class="btn small ${links.exactT ? "" : "ghost"}" href="${links.thangs}" target="_blank" rel="noopener">Thangs</a>`;
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
          name: it.name + (it.variant ? ` — ${it.variant}` : "") +
            (it.optional ? " (optional)" : "") + (it.unreleased ? " (coming soon)" : ""),
          printables: links ? links.printables : "",
          thangs: links ? links.thangs : "",
        });
      }));
    return out;
  }

  function copyBom() {
    const m = mountDef();
    let txt = `GEN2 ${state.length} — ${m ? m.label : ""} setup\n`;
    txt += `Planned with the GEN2 Planner · jerrari3d.com\n\n`;
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
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    let csv = "Section,Qty,Part,Printables,Thangs\n";
    bomAsRows().forEach((r) => {
      csv += [esc(r.section), r.qty, esc(r.name), esc(r.printables), esc(r.thangs)].join(",") + "\n";
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `gen2-${state.length}-${state.mount}-parts.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function flash(sel, msg) {
    const btn = $(sel);
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1200);
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
          if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > DRAG_SLOP) drag.moved = true;
          if (drag.moved) {
            drag.tx = hover.x - drag.dx;
            drag.ty = hover.y - drag.dy;
          }
        }
      }
      renderBoard();
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
      if (Math.hypot(t.clientX - drag.sx, t.clientY - drag.sy) > DRAG_SLOP) drag.moved = true;
      if (drag.moved) {
        drag.tx = cell.x - drag.dx;
        drag.ty = cell.y - drag.dy;
      }
      e.preventDefault();
      renderBoard();
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
    $("#build-save").addEventListener("click", saveCurrentBuild);
    $("#build-share").addEventListener("click", shareLink);
    $("#build-import").addEventListener("change", (e) => { importBuild(e.target.files[0]); e.target.value = ""; });
    renderBuildList();
    // "New to GEN2" primer: collapsible, remembers its open/closed state.
    const primer = $("#explainer-primer");
    if (primer) {
      primer.open = store.get("gen2-primer-collapsed") !== "1";
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
    $("#copy-bom").addEventListener("click", copyBom);
    $("#csv-bom").addEventListener("click", downloadCsv);
    $("#print-bom").addEventListener("click", () => window.print());

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
      const v = e.target.value.trim();
      if (v) u.label = v; else delete u.label;
      renderBoard();
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
    $("#step-layout").hidden = !ready;
    $("#step-parts").hidden = !ready;
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
    if (state.mount === "wall") {
      $("#wall-stagger-seg").querySelectorAll("[data-stagger]").forEach((b) =>
        b.classList.toggle("active", (b.dataset.stagger === "on") === state.wallStagger));
      $("#wall-stagger-hint").textContent = state.wallStagger
        ? "One connected top — most rigid."
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
  refresh();
  loadBuildFromHash();   // open a shared #build=… link, if present

  /* Headless test hook. Attaches the live state and a few pure helpers to the
     window ONLY when a harness opts in by setting this flag truthy before the
     script runs (see test/planner.test.mjs). It is absent in normal use. */
  if (typeof window !== "undefined" && window.__GEN2_PLANNER_TEST__) {
    window.__GEN2_PLANNER_TEST__ = {
      state, refresh, nudgeSelected, canPlace, selectable, heightsForFill,
      computeBom, selectedUnit, interiorFill, interiorComplete, interiorCellsLeft, placeCompartment,
      fixStructure, surpriseMe, serializeBuild, applyBuild, bowRisks,
      encodeBuildHash, applyBuildHash,
    };
  }
})();
