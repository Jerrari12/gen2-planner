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
  };

  const GRID_LIMITS = { wMin: 1, wMax: 12, hMin: 1, hMax: 10 };

  // Pixels per unit on the board
  const CW = 64;   // 1W
  const CH = 44;   // 1H (one half-row = CH / 2)
  const PAD = { top: 64, right: 36, bottom: 56, left: 36 };

  const $ = (sel) => document.querySelector(sel);
  const mountDef = () => GEN2.mounts.find((m) => m.id === state.mount);
  const fillDef = (id) => GEN2.fills.find((f) => f.id === (id || state.fill));

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

  function sizeExists(w, h) {
    return !GEN2.unavailableSizes.includes(sizeToken(w, h));
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
    for (const h of GEN2.drawerHeights)
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
          state.length = l.id;
          ensureValidSelection();
          renderLengthCards();
          refresh();
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
    }

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
      state.printer = sel.value;
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

  function renderFillSeg() {
    const seg = $("#fill-seg");
    seg.innerHTML = "";
    GEN2.fills.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = state.fill === f.id ? "active" : "";
      btn.innerHTML = f.label + (f.soon ? ' <span class="soon">soon</span>' : "");
      btn.title = f.blurb;
      btn.addEventListener("click", () => {
        state.fill = f.id;
        ensureValidSelection();
        refresh();
      });
      seg.appendChild(btn);
    });
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
  }

  function renderPalette() {
    const wrap = $("#palette-items");
    wrap.innerHTML = "";
    GEN2.drawerHeights.forEach((h) => {
      const row = document.createElement("div");
      row.className = "palette-row";
      GEN2.drawerWidths.forEach((w) => {
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
          item.title = !sizeExists(w, h)
            ? `${sizeToken(w, h)} is not part of the GEN2 lineup`
            : fitProblem(w, state.fill) ||
              (f.integerHeightsOnly && !Number.isInteger(h)
                ? `${f.label}s come in whole heights only`
                : `Not available as a ${f.label}`);
        } else {
          item.addEventListener("click", () => {
            state.selected = { w, h };
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

  let hover = null; // {x,y} of hovered cell
  let drag = null;  // {id, dx, dy, tx, ty, moved} while dragging a placed unit
  let suppressClick = false; // swallow the click that follows a drag-drop

  function renderBoard() {
    const svg = $("#board");
    const W = PAD.left + state.gridW * CW + PAD.right;
    const H = PAD.top + rows() * (CH / 2) + PAD.bottom;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.innerHTML = "";

    drawMountScene(svg, W, H);

    const gx = PAD.left, gy = PAD.top;
    el("rect", { x: gx, y: gy, width: state.gridW * CW, height: rows() * (CH / 2), class: "g-bg" }, svg);
    for (let c = 0; c <= state.gridW; c++)
      el("line", { x1: gx + c * CW, y1: gy, x2: gx + c * CW, y2: gy + rows() * (CH / 2), class: "g-line" }, svg);
    for (let r = 0; r <= rows(); r++)
      el("line", { x1: gx, y1: gy + r * (CH / 2), x2: gx + state.gridW * CW, y2: gy + r * (CH / 2), class: r % 2 ? "g-line faint" : "g-line" }, svg);

    state.placed.forEach((p) => drawUnit(svg, p));

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

  function drawUnit(svg, p) {
    const x = PAD.left + p.x * CW, y = PAD.top + p.y * (CH / 2);
    const w = p.w * CW, h = p.hh * (CH / 2);
    const sel = state.selectedUnit === p.id;
    const dragging = drag && drag.moved && drag.id === p.id;
    const g = el("g", {
      class: "drawer" + (sel ? " selected" : "") + (dragging ? " dragging" : ""),
      "data-id": p.id,
    }, svg);
    el("rect", { x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 6, class: "d-case" }, g);

    if (p.fill === "shelf") {
      el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-interior" }, g);
      el("line", { x1: x + 9, y1: y + h - 11, x2: x + w - 9, y2: y + h - 11, class: "d-shelf-line" }, g);
    } else if (p.fill === "cabinet") {
      el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-door" }, g);
      el("circle", { cx: x + w - 16, cy: y + h / 2, r: 3.5, class: "d-knob" }, g);
      el("rect", { x: x + 5, y: y + 11, width: 4, height: 9, rx: 1, class: "d-hinge" }, g);
      el("rect", { x: x + 5, y: y + h - 20, width: 4, height: 9, rx: 1, class: "d-hinge" }, g);
      for (let s = 1; s <= (p.shelves || 0); s++) {
        const sy = y + (h * s) / ((p.shelves || 0) + 1);
        el("line", { x1: x + 9, y1: sy, x2: x + w - 9, y2: sy, class: "d-shelf-line dashed" }, g);
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
      el("rect", { x: 0, y: gridBottom + 14, width: W, height: 14, class: "s-wood" }, svg);
      el("text", { x: W / 2, y: gridBottom + 44, class: "s-label", "text-anchor": "middle" }, svg)
        .textContent = "tabletop surface";
      // covers sit on top of each column's stack; contiguous columns at the
      // same height merge into one slab (uneven tops are visibly broken)
      const tops = columnTops();
      let slab = null;
      const flushSlab = () => {
        if (!slab) return;
        el("rect", {
          x: PAD.left + slab.start * CW + 3, y: gy + slab.top * (CH / 2) - 10,
          width: (slab.end - slab.start + 1) * CW - 6, height: 8, rx: 2, class: "s-part s-cover",
        }, svg);
        slab = null;
      };
      cols.forEach((c) => {
        if (slab && c === slab.end + 1 && tops[c] === slab.top) slab.end = c;
        else { flushSlab(); slab = { start: c, end: c, top: tops[c] }; }
      });
      flushSlab();
      cols.forEach((c) => {
        el("rect", { x: PAD.left + c * CW + 6, y: gridBottom + 2, width: 14, height: 10, rx: 2, class: "s-part" }, svg);
        el("rect", { x: PAD.left + (c + 1) * CW - 20, y: gridBottom + 2, width: 14, height: 10, rx: 2, class: "s-part" }, svg);
      });
      if (cols.length) {
        el("text", { x: PAD.left, y: gy - 18, class: "s-part-label" }, svg)
          .textContent = `▮ ${cols.length}× Table Top Kit V2 (cover + foot rails)`;
      }
    } else if (state.mount === "wall") {
      el("rect", { x: 0, y: 0, width: 16, height: H, class: "s-wood" }, svg);
      for (let yy = 10; yy < H; yy += 26)
        el("line", { x1: 4, y1: yy, x2: 12, y2: yy + 8, class: "s-wood-grain" }, svg);
      el("text", { x: 26, y: 16, class: "s-label" }, svg)
        .textContent = "wall" + (state.spaceW ? ` — ${state.spaceW}mm available` : "");
      // one bar per wall-mount section, with 2 screw dots per 1W
      wallSections().forEach((s) => {
        el("rect", { x: PAD.left + s.start * CW + 6, y: gy - 10, width: s.w * CW - 12, height: 10, rx: 2, class: "s-part s-wallmount" }, svg);
        for (let u = 0; u < s.w; u++) {
          const cx0 = PAD.left + (s.start + u) * CW;
          el("circle", { cx: cx0 + CW * 0.32, cy: gy - 5, r: 2, class: "s-screw" }, svg);
          el("circle", { cx: cx0 + CW * 0.68, cy: gy - 5, r: 2, class: "s-screw" }, svg);
        }
      });
      if (cols.length) {
        el("text", { x: PAD.left, y: gridBottom + 24, class: "s-part-label" }, svg)
          .textContent = `▮ Wall Mount Kit - Lite - ${state.length ?? ""}: ${mixText(mixOf(wallSections()))}`;
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

  function renderWarnings() {
    const box = $("#board-warnings");
    box.innerHTML = "";
    if (!state.placed.length) return;

    // support toward the mount surface (top for under-table & wall, bottom for tabletop)
    const occ = occupancy();
    const fromTop = state.mount !== "tabletop";
    const floating = state.placed.filter((p) => {
      if (fromTop ? p.y === 0 : p.y + p.hh === rows()) return false;
      for (let dx = 0; dx < p.w; dx++) {
        const key = fromTop ? (p.x + dx) + "," + (p.y - 1) : (p.x + dx) + "," + (p.y + p.hh);
        if (occ.has(key)) return false;
      }
      return true;
    });
    if (floating.length) {
      warn(box, fromTop
        ? `${floating.length} unit(s) aren't connected to the ${state.mount === "wall" ? "wall mounts" : "rails"} above — cases QuickLock to the row above them. Move them up or fill the gap.`
        : `${floating.length} unit(s) are floating — tabletop stacks build up from the surface. Move them down or fill the gap.`);
    }

    // placed units that no longer fit the selected printer
    const misfits = state.placed.filter((p) => !fillFits(p.w, p.fill));
    if (misfits.length) {
      const sizes = [...new Set(misfits.map((p) => `${sizeToken(p.w, p.hh / 2)} ${fillDef(p.fill).label}`))];
      warn(box, `${misfits.length} placed unit(s) won't print on the selected printer: ${sizes.join(", ")}.`);
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
  }

  /* --------------------------- Inspector --------------------------- */

  function renderInspector() {
    const box = $("#inspector");
    const p = state.placed.find((u) => u.id === state.selectedUnit);
    if (!p) { box.hidden = true; state.selectedUnit = null; return; }
    box.hidden = false;
    const h = p.hh / 2;
    let html = `<h3>Selected unit</h3>
      <div class="insp-title">${fillDef(p.fill).label} · ${sizeToken(p.w, h)}</div>`;
    if (p.fill === "cabinet" && h >= 2) {
      html += `<label class="insp-row">Internal shelves
        <span class="stepper">
          <button type="button" data-shelf="-">−</button>
          <b>${p.shelves || 0}</b>
          <button type="button" data-shelf="+">+</button>
        </span></label>
        <p class="hint">Each internal shelf swaps a case extender for a full case + shelf insert.</p>`;
    }
    html += `<button type="button" class="btn ghost" id="remove-unit">Remove unit</button>`;
    box.innerHTML = html;

    box.querySelectorAll("[data-shelf]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const maxShelves = p.hh / 2 - 1;
        p.shelves = Math.max(0, Math.min(maxShelves,
          (p.shelves || 0) + (btn.dataset.shelf === "+" ? 1 : -1)));
        refresh();
      });
    });
    box.querySelector("#remove-unit").addEventListener("click", () => {
      state.placed = state.placed.filter((u) => u.id !== p.id);
      state.selectedUnit = null;
      refresh();
    });
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
        count(cases, size);
        count(inserts, p.w);
      } else if (p.fill === "cabinet") {
        const shelves = p.shelves || 0;
        count(cases, sizeToken(p.w, 1), 1 + shelves);
        const ext = h - 1 - shelves;
        if (ext > 0) count(extenders, p.w, ext);
        count(inserts, p.w, 1 + shelves);
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
      GEN2.decorExtras.forEach((x) => {
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
    const ctx = {
      len,
      cols: occupiedColumns().length,
      railMix: mix,
      railScrews: Object.entries(mix).reduce((sum, [w, n]) => sum + n * GEN2.railScrews(+w), 0),
      wallMix: mixOf(wallSections()),
    };
    sections.push({ title: "Mounting", items: GEN2.mountBom[state.mount](ctx) });

    return sections;
  }

  function renderBom() {
    const wrap = $("#bom");
    const sections = computeBom();
    if (!sections) {
      wrap.innerHTML = `<p class="hint">Choose a location and length, then place units in the layout — your parts list builds itself here.</p>`;
      return;
    }
    let html = "";
    sections.forEach((sec) => {
      html += `<h3>${sec.title}</h3><table class="bom-table"><tbody>`;
      sec.items.forEach((it) => {
        html += `<tr class="${it.optional ? "optional" : ""}">
          <td class="qty">${it.qty}×</td>
          <td class="name">${it.name}${it.variant ? ` — <em>${it.variant}</em>` : ""}${it.optional ? ' <span class="tag">optional</span>' : ""}
            ${it.note ? `<div class="note">${it.note}</div>` : ""}</td>
          <td class="link">${linkButtons(it)}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    });

    const starter = `GEN2 Under Table Starter Kit - ${state.length}`;
    if (state.mount === "under-table" && LINK_OVERRIDES[starter]) {
      html += `<p class="tip">💡 New to GEN2? The <a href="${partLinks(starter).printables}" target="_blank" rel="noopener">${starter}</a> bundles everything for a first install.</p>`;
    }
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
      sec.items.forEach((it) => {
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
      const pt = svgPoint(svg, e);
      const { x, y } = cellAt(pt.x, pt.y);
      const hit = unitAt(x, y);
      if (hit) {
        drag = { id: hit.id, dx: x - hit.x, dy: y - hit.y, tx: hit.x, ty: hit.y, moved: false };
        e.preventDefault();
      }
    });

    svg.addEventListener("mousemove", (e) => {
      const pt = svgPoint(svg, e);
      hover = cellAt(pt.x, pt.y);
      if (drag) {
        const p = state.placed.find((u) => u.id === drag.id);
        if (p) {
          const tx = hover.x - drag.dx, ty = hover.y - drag.dy;
          if (tx !== p.x || ty !== p.y || drag.moved) {
            drag.moved = true;
            drag.tx = tx;
            drag.ty = ty;
          }
        }
      }
      renderBoard();
    });

    svg.addEventListener("mouseup", () => {
      if (!drag) return;
      if (drag.moved) {
        const p = state.placed.find((u) => u.id === drag.id);
        if (p && canPlace(drag.tx, drag.ty, p.w, p.hh, p.id)) {
          p.x = drag.tx;
          p.y = drag.ty;
        }
        suppressClick = true; // the click that follows a drop is not a select
      }
      drag = null;
      refresh();
    });

    svg.addEventListener("mouseleave", () => {
      hover = null;
      drag = null;
      renderBoard();
    });

    svg.addEventListener("click", (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const pt = svgPoint(svg, e);
      const { x, y } = cellAt(pt.x, pt.y);
      const hit = unitAt(x, y);
      if (hit) {
        state.selectedUnit = state.selectedUnit === hit.id ? null : hit.id;
      } else if (state.selected && selectable(state.selected.w, state.selected.h)) {
        const { w, h } = state.selected;
        if (canPlace(x, y, w, h * 2)) {
          state.placed.push({
            id: state.nextId++, x, y, w, hh: h * 2,
            fill: state.fill,
            shelves: 0,
          });
          state.selectedUnit = null;
        }
      }
      refresh();
    });
  }

  function svgPoint(svg, evt) {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: (evt.clientX - r.left) * (vb.width / r.width),
      y: (evt.clientY - r.top) * (vb.height / r.height),
    };
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
    $("#copy-bom").addEventListener("click", copyBom);
    $("#csv-bom").addEventListener("click", downloadCsv);
    $("#print-bom").addEventListener("click", () => window.print());
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
    renderInspector();
    if (ready) renderBoard();
    renderBom();
  }

  /* ------------------------------ Init ------------------------------ */

  renderMountCards();
  renderLengthCards();
  buildPrinterSelect();
  bindBoard();
  bindControls();
  refresh();
})();
