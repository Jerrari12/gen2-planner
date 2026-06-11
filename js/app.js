/* GEN2 Planner — application logic.
   All catalog data and BOM rules live in js/data.js. */

(function () {
  "use strict";

  /* ----------------------------- State ----------------------------- */

  const state = {
    mount: null,          // mount id
    length: null,         // length id (number)
    style: "decor",       // drawer style id
    gridW: 6,             // grid width in 1W units
    gridH: 4,             // grid height in 1H units
    placed: [],           // {id, x, y, w, hh} — y/hh in half-height rows
    selected: { w: 1, h: 1 },
    nextId: 1,
  };

  const GRID_LIMITS = { wMin: 2, wMax: 12, hMin: 2, hMax: 10 };

  // Pixels per unit on the board
  const CW = 64;   // 1W
  const CH = 44;   // 1H (one half-row = CH / 2)
  const PAD = { top: 64, right: 36, bottom: 56, left: 36 };

  const $ = (sel) => document.querySelector(sel);

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
      btn.className = "card slim" + (state.length === l.id ? " active" : "");
      btn.innerHTML =
        `<div class="card-title">${l.label}<span class="mm">mm</span>` +
        (l.recommended ? `<span class="badge">recommended</span>` : "") +
        `</div>` +
        `<div class="card-blurb">${l.tagline}</div>`;
      btn.addEventListener("click", () => {
        state.length = l.id;
        renderLengthCards();
        refresh();
      });
      wrap.appendChild(btn);
    });
  }

  function renderStyleSeg() {
    const seg = $("#style-seg");
    seg.innerHTML = "";
    GEN2.styles.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = state.style === s.id ? "active" : "";
      btn.textContent = s.label;
      btn.title = s.blurb;
      btn.addEventListener("click", () => {
        state.style = s.id;
        renderStyleSeg();
        refresh();
      });
      seg.appendChild(btn);
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

  /* --------------------------- Palette --------------------------- */

  function renderPalette() {
    const wrap = $("#palette-items");
    wrap.innerHTML = "";
    GEN2.drawerHeights.forEach((h) => {
      const row = document.createElement("div");
      row.className = "palette-row";
      GEN2.drawerWidths.forEach((w) => {
        const item = document.createElement("button");
        item.type = "button";
        const sel = state.selected && state.selected.w === w && state.selected.h === h;
        item.className = "palette-item" + (sel ? " active" : "");
        item.style.setProperty("--pw", w);
        item.style.setProperty("--ph", h);
        item.innerHTML = `<span class="palette-box"></span><span class="palette-label">${sizeToken(w, h)}</span>`;
        item.addEventListener("click", () => {
          state.selected = { w, h };
          renderPalette();
        });
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

  function canPlace(x, y, w, hh) {
    if (x < 0 || y < 0 || x + w > state.gridW || y + hh > rows()) return false;
    const occ = occupancy();
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < hh; dy++)
        if (occ.has((x + dx) + "," + (y + dy))) return false;
    return true;
  }

  function drawerAt(x, y) {
    return state.placed.find((p) =>
      x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.hh);
  }

  let hover = null; // {x,y} of hovered cell

  function renderBoard() {
    const svg = $("#board");
    const W = PAD.left + state.gridW * CW + PAD.right;
    const H = PAD.top + rows() * (CH / 2) + PAD.bottom;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.innerHTML = "";

    drawMountScene(svg, W, H);

    // grid backdrop
    const gx = PAD.left, gy = PAD.top;
    el("rect", { x: gx, y: gy, width: state.gridW * CW, height: rows() * (CH / 2), class: "g-bg" }, svg);
    for (let c = 0; c <= state.gridW; c++)
      el("line", { x1: gx + c * CW, y1: gy, x2: gx + c * CW, y2: gy + rows() * (CH / 2), class: "g-line" }, svg);
    for (let r = 0; r <= rows(); r++)
      el("line", { x1: gx, y1: gy + r * (CH / 2), x2: gx + state.gridW * CW, y2: gy + r * (CH / 2), class: r % 2 ? "g-line faint" : "g-line" }, svg);

    // placed drawers
    state.placed.forEach((p) => drawDrawer(svg, p));

    // hover ghost
    if (hover && state.selected) {
      const { w, h } = state.selected;
      const hh = h * 2;
      const ok = canPlace(hover.x, hover.y, w, hh);
      if (hover.x >= 0 && hover.y >= 0 && hover.x < state.gridW && hover.y < rows() && !drawerAt(hover.x, hover.y)) {
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

  function drawDrawer(svg, p) {
    const x = PAD.left + p.x * CW, y = PAD.top + p.y * (CH / 2);
    const w = p.w * CW, h = p.hh * (CH / 2);
    const g = el("g", { class: "drawer", "data-id": p.id }, svg);
    el("rect", { x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 6, class: "d-case" }, g);
    el("rect", { x: x + 7, y: y + 7, width: w - 14, height: h - 14, rx: 4, class: "d-face" }, g);
    if (state.style === "decor") {
      // bar handle
      el("rect", { x: x + w / 2 - Math.min(28, w / 4), y: y + h / 2 - 2.5, width: Math.min(56, w / 2), height: 5, rx: 2.5, class: "d-handle" }, g);
    } else {
      // print-in-place scoop
      el("rect", { x: x + w / 2 - Math.min(24, w / 4), y: y + 9, width: Math.min(48, w / 2), height: 6, rx: 3, class: "d-scoop" }, g);
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
        .textContent = "table / desk underside";
      cols.forEach((c) => {
        el("rect", { x: PAD.left + c * CW + 8, y: gy - 8, width: CW - 16, height: 8, rx: 2, class: "s-part" }, svg);
      });
      if (cols.length) {
        el("text", { x: PAD.left, y: gridBottom + 24, class: "s-part-label" }, svg)
          .textContent = `▮ ${cols.length}× GEN2 Rails - ${state.length ?? ""}`;
      }
    } else if (state.mount === "tabletop") {
      el("rect", { x: 0, y: gridBottom + 14, width: W, height: 14, class: "s-wood" }, svg);
      el("text", { x: W / 2, y: gridBottom + 44, class: "s-label", "text-anchor": "middle" }, svg)
        .textContent = "tabletop surface";
      cols.forEach((c) => {
        // cover above, foot rails below
        el("rect", { x: PAD.left + c * CW + 3, y: gy - 10, width: CW - 6, height: 8, rx: 2, class: "s-part" }, svg);
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
      el("text", { x: 26, y: 16, class: "s-label" }, svg).textContent = "wall";
      cols.forEach((c) => {
        el("rect", { x: PAD.left + c * CW + 10, y: gy - 9, width: CW - 20, height: 9, rx: 2, class: "s-part" }, svg);
      });
      if (cols.length) {
        el("text", { x: PAD.left, y: gridBottom + 24, class: "s-part-label" }, svg)
          .textContent = `▮ ${cols.length}× Wall Mount Kit - Lite - ${state.length ?? ""}`;
      }
    }
  }

  function occupiedColumns() {
    const set = new Set();
    state.placed.forEach((p) => {
      for (let dx = 0; dx < p.w; dx++) set.add(p.x + dx);
    });
    return [...set].sort((a, b) => a - b);
  }

  function renderBoardMeta() {
    const meta = $("#board-meta");
    if (!state.placed.length) {
      meta.textContent = "Layout is empty — place your first drawer.";
      return;
    }
    const minX = Math.min(...state.placed.map((p) => p.x));
    const maxX = Math.max(...state.placed.map((p) => p.x + p.w));
    const minY = Math.min(...state.placed.map((p) => p.y));
    const maxY = Math.max(...state.placed.map((p) => p.y + p.hh));
    const wmm = (maxX - minX) * GEN2.units.widthMM;
    const hmm = (maxY - minY) * (GEN2.units.heightMM / 2);
    meta.textContent =
      `${state.placed.length} drawer${state.placed.length > 1 ? "s" : ""} · ` +
      `footprint ≈ ${wmm}mm W × ${hmm}mm H × ${state.length}mm D`;
  }

  /* Soft validation: drawers should be supported toward the mount surface
     (top for under-table & wall, bottom for tabletop). */
  function renderWarnings() {
    const box = $("#board-warnings");
    box.innerHTML = "";
    if (!state.placed.length) return;
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
      const div = document.createElement("div");
      div.className = "warn";
      div.textContent = fromTop
        ? `⚠ ${floating.length} drawer(s) aren't connected to the ${state.mount === "wall" ? "wall mounts" : "rails"} above — cases QuickLock to the row above them. Move them up or fill the gap.`
        : `⚠ ${floating.length} drawer(s) are floating — tabletop stacks build up from the surface. Move them down or fill the gap.`;
      box.appendChild(div);
    }
  }

  /* --------------------------- Layout summary --------------------------- */

  function layoutSummary() {
    const cols = occupiedColumns();
    return {
      widthUnits: cols.length,
      topRowWidth: cols.length,
      bottomRowWidth: cols.length,
      drawerCount: state.placed.length,
    };
  }

  /* ------------------------------- BOM ------------------------------- */

  function styleLabel() {
    return GEN2.styles.find((s) => s.id === state.style).label;
  }

  function computeBom() {
    if (!state.length || !state.mount || !state.placed.length) return null;
    const len = state.length;
    const sections = [];

    // group drawers by size
    const bySize = new Map();
    state.placed.forEach((p) => {
      const key = sizeToken(p.w, p.hh / 2);
      bySize.set(key, (bySize.get(key) || 0) + 1);
    });
    const sizes = [...bySize.entries()].sort();

    sections.push({
      title: `${styleLabel()} Drawers`,
      items: sizes.map(([size, qty]) => ({
        name: `GEN2 ${len}-${size} ${styleLabel()} Drawer`,
        qty,
      })),
    });

    sections.push({
      title: "Cases",
      items: sizes.map(([size, qty]) => ({
        name: `GEN2 ${len} Case - ${size}`,
        qty,
        note: "One case per drawer — cases QuickLock together.",
      })),
    });

    if (state.style === "decor") {
      const items = sizes.map(([size, qty]) => ({
        name: `GEN2 ${len} Decor Faceplate - ${size}`,
        qty,
      }));
      GEN2.decorExtras.forEach((x) => {
        items.push({
          name: x.name(len),
          qty: x.qtyPerDrawer * state.placed.length,
          note: x.note,
          hardware: x.hardware,
          optional: x.optional,
        });
      });
      sections.push({ title: "Faceplates & Hardware (Decor)", items });
    }

    const l = layoutSummary();
    sections.push({
      title: "Mounting",
      items: GEN2.mountBom[state.mount].map((rule) => ({
        name: rule.name(len),
        qty: rule.qty(l),
        note: rule.note,
        hardware: rule.hardware,
      })),
    });

    return sections;
  }

  function renderBom() {
    const wrap = $("#bom");
    const sections = computeBom();
    if (!sections) {
      wrap.innerHTML = `<p class="hint">Choose a location and length, then place drawers in the layout — your parts list builds itself here.</p>`;
      return;
    }
    let html = "";
    sections.forEach((sec) => {
      html += `<h3>${sec.title}</h3><table class="bom-table"><tbody>`;
      sec.items.forEach((it) => {
        const exact = !!LINK_OVERRIDES[it.name];
        const link = it.hardware ? null : partLink(it.name);
        html += `<tr class="${it.optional ? "optional" : ""}">
          <td class="qty">${it.qty}×</td>
          <td class="name">${it.name}${it.optional ? ' <span class="tag">optional</span>' : ""}
            ${it.note ? `<div class="note">${it.note}</div>` : ""}</td>
          <td class="link">${link
            ? `<a class="btn small ${exact ? "" : "ghost"}" href="${link}" target="_blank" rel="noopener">${exact ? "Download" : "Find on Printables"}</a>`
            : `<span class="tag">hardware store</span>`}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    });

    // starter kit tip
    const starter = `GEN2 Under Table Starter Kit - ${state.length}`;
    if (state.mount === "under-table" && LINK_OVERRIDES[starter]) {
      html += `<p class="tip">💡 New to GEN2? The <a href="${LINK_OVERRIDES[starter]}" target="_blank" rel="noopener">${starter}</a> bundles everything for a first install.</p>`;
    }
    wrap.innerHTML = html;
  }

  /* ----------------------------- Exports ----------------------------- */

  function bomAsRows() {
    const sections = computeBom() || [];
    const rows = [];
    sections.forEach((sec) =>
      sec.items.forEach((it) =>
        rows.push({
          section: sec.title,
          qty: it.qty,
          name: it.name + (it.optional ? " (optional)" : ""),
          link: it.hardware ? "" : partLink(it.name),
        })));
    return rows;
  }

  function copyBom() {
    const mount = GEN2.mounts.find((m) => m.id === state.mount);
    let txt = `GEN2 ${state.length} — ${mount ? mount.label : ""} setup\n`;
    txt += `Planned with the GEN2 Planner · jerrari3d.com\n\n`;
    let lastSection = "";
    bomAsRows().forEach((r) => {
      if (r.section !== lastSection) { txt += `\n[${r.section}]\n`; lastSection = r.section; }
      txt += `${r.qty}x ${r.name}${r.link ? "  ->  " + r.link : ""}\n`;
    });
    navigator.clipboard.writeText(txt).then(() => flash("#copy-bom", "Copied!"));
  }

  function downloadCsv() {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    let csv = "Section,Qty,Part,Link\n";
    bomAsRows().forEach((r) => {
      csv += [esc(r.section), r.qty, esc(r.name), esc(r.link)].join(",") + "\n";
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

    svg.addEventListener("mousemove", (e) => {
      const pt = svgPoint(svg, e);
      hover = cellAt(pt.x, pt.y);
      renderBoard();
    });
    svg.addEventListener("mouseleave", () => { hover = null; renderBoard(); });

    svg.addEventListener("click", (e) => {
      const pt = svgPoint(svg, e);
      const { x, y } = cellAt(pt.x, pt.y);
      const hit = drawerAt(x, y);
      if (hit) {
        state.placed = state.placed.filter((p) => p.id !== hit.id);
      } else if (state.selected) {
        const { w, h } = state.selected;
        if (canPlace(x, y, w, h * 2)) {
          state.placed.push({ id: state.nextId++, x, y, w, hh: h * 2 });
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
        if (op === "w+") state.gridW = Math.min(GRID_LIMITS.wMax, state.gridW + 1);
        if (op === "w-") state.gridW = Math.max(GRID_LIMITS.wMin, state.gridW - 1);
        if (op === "h+") state.gridH = Math.min(GRID_LIMITS.hMax, state.gridH + 1);
        if (op === "h-") state.gridH = Math.max(GRID_LIMITS.hMin, state.gridH - 1);
        // drop drawers that no longer fit
        state.placed = state.placed.filter((p) => p.x + p.w <= state.gridW && p.y + p.hh <= rows());
        refresh();
      });
    });
    $("#clear-layout").addEventListener("click", () => { state.placed = []; refresh(); });
    $("#copy-bom").addEventListener("click", copyBom);
    $("#csv-bom").addEventListener("click", downloadCsv);
    $("#print-bom").addEventListener("click", () => window.print());
  }

  /* ----------------------------- Refresh ----------------------------- */

  function refresh() {
    const ready = state.mount && state.length;
    $("#step-layout").hidden = !ready;
    $("#step-parts").hidden = !ready;
    $("#grid-w-label").textContent = state.gridW + "W";
    $("#grid-h-label").textContent = state.gridH + "H";
    if (ready) renderBoard();
    renderBom();
  }

  /* ------------------------------ Init ------------------------------ */

  renderMountCards();
  renderLengthCards();
  renderStyleSeg();
  renderPalette();
  bindBoard();
  bindControls();
  refresh();
})();
