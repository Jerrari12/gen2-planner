/* Headless tests for the GEN2 Planner.

   The planner is a build-free static site, so these load the real index.html
   + js/data.js + js/app.js into a jsdom window and drive the actual code —
   no logic is re-implemented here. The selected-unit toolbar (arrow-pad nudge,
   remove) and the size-availability rules are pure state logic, so they verify
   cleanly without a real browser/layout engine.

   Run with:  npm install && npm test
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/* Boot a fresh planner instance and advance it to the "layout ready" state
   (a mount + length chosen), with an open 6×4 grid and no printer limits. */
function boot() {
  const dom = new JSDOM(read("index.html"), { runScripts: "outside-only" });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;            // opt in to the test hook
  window.eval(read("js/data.js") + "\n" + read("js/app.js"));
  const app = window.__GEN2_PLANNER_TEST__;       // hook replaces the flag

  app.state.mount = "under-table";
  app.state.length = 185;
  app.state.gridW = 6;
  app.state.gridH = 4;
  app.refresh();
  return { window, app, doc: window.document };
}

/* Drop a unit straight into state (bypassing board clicks, which need layout). */
function place(app, o) {
  const u = { id: o.id, x: o.x, y: o.y, w: o.w, hh: o.hh, fill: o.fill || "decor", shelves: o.shelves || 0 };
  if (o.interior) u.interior = o.interior;   // advanced cabinet compartments
  app.state.placed.push(u);
  return u;
}

function select(app, id) {
  app.state.selectedUnit = id;
  app.refresh();
}

const $arrow = (doc, dir) => doc.querySelector(`.ut-arrow.${dir}`);

/* Total quantity of every BOM line whose name contains `sub`. Names are stable
   substrings like "Case - 1W-1H" / "Case Extender - 1W-1H" / "Shelf Insert - 1W". */
const bomQty = (app, sub) => {
  let q = 0;
  for (const s of (app.computeBom() || []))
    for (const it of s.items) if (it.name.includes(sub)) q += it.qty;
  return q;
};

/* Dispatch a real click — works for SVG elements too (which lack .click()). */
const fireClick = (window, el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

test("arrow nudges the selected unit one step in each direction", () => {
  const { app } = boot();
  const u = place(app, { id: 1, x: 2, y: 2, w: 1, hh: 2 });
  select(app, 1);

  assert.equal(app.nudgeSelected("left"), true);
  assert.equal(u.x, 1);
  assert.equal(app.nudgeSelected("right"), true);
  assert.equal(u.x, 2);
  assert.equal(app.nudgeSelected("up"), true);
  assert.equal(u.y, 1);
  assert.equal(app.nudgeSelected("down"), true);
  assert.equal(u.y, 2);
});

test("nudge stops at the grid edges and does not move the unit", () => {
  const { app } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  select(app, 1);

  assert.equal(app.nudgeSelected("left"), false);
  assert.equal(u.x, 0);
  assert.equal(app.nudgeSelected("up"), false);
  assert.equal(u.y, 0);
});

test("nudge is blocked by a neighbouring unit", () => {
  const { app } = boot();
  const a = place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  place(app, { id: 2, x: 1, y: 0, w: 1, hh: 2 });
  select(app, 1);

  assert.equal(app.nudgeSelected("right"), false);
  assert.equal(a.x, 0);
});

test("toolbar activates on selection and arrows reflect legal moves", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  const bar = doc.querySelector("#unit-toolbar");

  // nothing selected: dimmed, every control disabled
  assert.equal(bar.classList.contains("active"), false);
  doc.querySelectorAll(".ut-arrow").forEach((b) => assert.equal(b.disabled, true));
  assert.equal(doc.querySelector("#ut-remove").disabled, true);

  // selected at the top-left corner: up/left blocked, right/down open
  select(app, 1);
  assert.equal(bar.classList.contains("active"), true);
  assert.equal($arrow(doc, "up").disabled, true);
  assert.equal($arrow(doc, "left").disabled, true);
  assert.equal($arrow(doc, "right").disabled, false);
  assert.equal($arrow(doc, "down").disabled, false);
  assert.equal(doc.querySelector("#ut-remove").disabled, false);
});

test("clicking an arrow button moves the unit through the real handler", () => {
  const { app, doc } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  select(app, 1);

  $arrow(doc, "right").click();
  assert.equal(u.x, 1);
});

test("Remove button deletes the selected unit and resets the toolbar", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  select(app, 1);

  doc.querySelector("#ut-remove").click();
  assert.equal(app.state.placed.length, 0);
  assert.equal(app.state.selectedUnit, null);
  assert.equal(doc.querySelector("#unit-toolbar").classList.contains("active"), false);
});

test("3W-3H and 4W-3H exist for shelves and cabinets but not drawers", () => {
  const { app } = boot();
  app.state.fill = "decor";
  assert.equal(app.selectable(3, 3), false);  // no such single drawer
  assert.equal(app.selectable(4, 3), false);
  app.state.fill = "classic";
  assert.equal(app.selectable(3, 3), false);
  // shelves & cabinets build from 1H cases + extenders, so any footprint works
  app.state.fill = "shelf";
  assert.equal(app.selectable(3, 3), true);
  assert.equal(app.selectable(4, 3), true);
  app.state.fill = "cabinet";
  assert.equal(app.selectable(3, 3), true);
  assert.equal(app.selectable(4, 3), true);
  // neighbours that exist for everyone still work
  assert.equal(app.selectable(2, 3), true);
  assert.equal(app.selectable(3, 2), true);
});

test("shelves and cabinets offer whole-unit heights up to 6H", () => {
  const { app } = boot();
  // spread normalises the cross-realm arrays returned from the jsdom window
  assert.deepEqual([...app.heightsForFill("cabinet")], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...app.heightsForFill("shelf")], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...app.heightsForFill("decor")], [0.5, 1, 1.5, 2, 3]);

  app.state.fill = "cabinet";
  assert.equal(app.selectable(4, 6), true);   // tallest/widest cabinet
  assert.equal(app.selectable(4, 3), true);   // now allowed for cabinets (case + extenders)
});

/* ---------------- advanced cabinet interior ---------------- */

test("advanced cabinet BOM bills per compartment and batches with shelf SKUs", () => {
  const { app } = boot();
  // 2W-2H cabinet tiled as two 1W-2H columns (fills it)
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 1, h: 2 }, { x: 1, y: 0, w: 1, h: 2 },
  ] });
  // a separate 1W-2H shelf — same case/extender/insert SKUs, must merge
  place(app, { id: 2, x: 3, y: 0, w: 1, hh: 4, fill: "shelf" });

  assert.equal(bomQty(app, "Case - 1W-1H"), 3);          // 2 compartments + 1 shelf
  assert.equal(bomQty(app, "Case Extender - 1W-1H"), 3); // each 2H piece adds 1 extender
  assert.equal(bomQty(app, "Shelf Insert - 1W"), 3);
  assert.equal(bomQty(app, "Door - 2W-2H"), 1);          // one door at the full shell size
  assert.equal(bomQty(app, "Hinge"), 2);
  assert.equal(bomQty(app, "Latch"), 2);
});

test("advanced cabinet supports mixed-width compartments", () => {
  const { app } = boot();
  // a 2W-1H band on top, two 1W-1H below
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 2, h: 1 }, { x: 0, y: 1, w: 1, h: 1 }, { x: 1, y: 1, w: 1, h: 1 },
  ] });
  assert.equal(bomQty(app, "Case - 2W-1H"), 1);
  assert.equal(bomQty(app, "Case - 1W-1H"), 2);
  assert.equal(bomQty(app, "Case Extender"), 0);   // all 1H ⇒ no extenders
  assert.equal(bomQty(app, "Shelf Insert - 2W"), 1);
  assert.equal(bomQty(app, "Shelf Insert - 1W"), 2);
  assert.equal(bomQty(app, "Door - 2W-2H"), 1);
});

test("interior completeness and cells-left track the fill", () => {
  const { app } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 2, h: 1 }, { x: 0, y: 1, w: 1, h: 1 },
  ] });                                            // 3 of 4 cells
  assert.equal(app.interiorComplete(u), false);
  assert.equal(app.interiorCellsLeft(u), 1);
  u.interior.push({ x: 1, y: 1, w: 1, h: 1 });     // fill the last cell
  assert.equal(app.interiorComplete(u), true);
  assert.equal(app.interiorCellsLeft(u), 0);
});

test("an unfinished cabinet interior raises a board warning", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 1, h: 1 },
  ] });                                            // 1 of 4 cells
  app.refresh();
  const warns = [...doc.querySelectorAll("#board-warnings .warn")].map((d) => d.textContent).join(" ");
  assert.match(warns, /cells? left/i);
});

test("a cabinet without an interior still uses the simple shelves model", () => {
  const { app } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 1, hh: 4, fill: "cabinet", shelves: 1 });
  assert.equal("interior" in u, false);
  assert.equal(bomQty(app, "Case - 1W-1H"), 2);    // 1 base + 1 shelf
  assert.equal(bomQty(app, "Case Extender"), 0);   // h(2) - 1 - shelves(1) = 0
  assert.equal(bomQty(app, "Shelf Insert - 1W"), 2);
  assert.equal(bomQty(app, "Door - 1W-2H"), 1);
  assert.equal(bomQty(app, "Hinge"), 2);
});

test("simple cabinet shows the shelves stepper, not the editor", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 4, fill: "cabinet", shelves: 1 });
  select(app, 1);
  assert.equal(doc.querySelector("#ut-shelves").hidden, false);
  assert.equal(doc.querySelector("#ut-shelf-count").textContent, "1");
  assert.equal(doc.querySelector("#ut-interior").hidden, true);
});

test("the Advanced toggle adds an empty interior; Simple removes it", () => {
  const { app, doc } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet" });
  select(app, 1);
  doc.querySelector('#ut-mode [data-mode="advanced"]').click();
  assert.equal(Array.isArray(u.interior), true);
  assert.equal(u.interior.length, 0);
  doc.querySelector('#ut-mode [data-mode="simple"]').click();
  assert.equal("interior" in u, false);
});

test("placeCompartment enforces bounds and overlap", () => {
  const { app } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [] });
  assert.equal(app.placeCompartment(u, 0, 0, 2, 1), true);   // fits
  assert.equal(u.interior.length, 1);
  assert.equal(app.placeCompartment(u, 0, 0, 1, 1), false);  // overlaps
  assert.equal(app.placeCompartment(u, 0, 1, 3, 1), false);  // out of bounds (width)
  assert.equal(app.placeCompartment(u, 1, 1, 1, 1), true);   // fits the gap
  assert.equal(u.interior.length, 2);
});

test("editor: arm a size chip and click the grid to place; click the chip again to disarm", () => {
  const { app, doc, window } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [] });
  select(app, 1);
  const chip = () => [...doc.querySelectorAll("#ut-int-pal .ut-int-chip")].find((c) => c.textContent === "1W-1H");
  const firstEmpty = () => doc.querySelector("#ut-int-grid .ic-empty");
  fireClick(window, chip());        // arm 1W-1H
  fireClick(window, firstEmpty());  // place into the first empty cell
  assert.equal(u.interior.length, 1);
  assert.deepEqual({ w: u.interior[0].w, h: u.interior[0].h }, { w: 1, h: 1 });
  fireClick(window, chip());        // armed ⇒ toggles off (disarm)
  fireClick(window, firstEmpty());  // nothing armed ⇒ no placement
  assert.equal(u.interior.length, 1);
});

test("editor: clicking a placed compartment removes it", () => {
  const { app, doc, window } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 2, h: 1 }, { x: 0, y: 1, w: 1, h: 1 },
  ] });
  select(app, 1);
  assert.equal(doc.querySelectorAll("#ut-int-grid .ic-comp").length, 2);
  fireClick(window, doc.querySelector("#ut-int-grid .ic-comp"));
  assert.equal(u.interior.length, 1);
});

test("Clear interior empties the array but keeps Advanced mode", () => {
  const { app, doc, window } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 2, h: 1 },
  ] });
  select(app, 1);
  fireClick(window, doc.querySelector("#ut-int-clear"));
  assert.equal(Array.isArray(u.interior), true);
  assert.equal(u.interior.length, 0);
});

test("re-toggling Advanced after tiling discards the interior and starts fresh", () => {
  const { app, doc, window } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet" });
  select(app, 1);
  const adv = doc.querySelector('#ut-mode [data-mode="advanced"]');
  const sim = doc.querySelector('#ut-mode [data-mode="simple"]');
  fireClick(window, adv);
  app.placeCompartment(u, 0, 0, 2, 1);
  assert.equal(u.interior.length, 1);
  fireClick(window, sim);
  assert.equal("interior" in u, false);            // discarded going back to Simple
  fireClick(window, adv);
  assert.equal(Array.isArray(u.interior), true);
  assert.equal(u.interior.length, 0);              // fresh empty interior
});

test("an advanced cabinet keeps faint door hardware (knob + hinges) over the x-rayed interior", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [{ x: 0, y: 0, w: 2, h: 2 }] });
  app.refresh();
  const g = doc.querySelector('#board g[data-id="1"]');
  assert.ok(g.querySelector(".d-hardware-ghost"));              // the faint hardware group
  assert.equal(g.querySelectorAll(".d-knob").length, 1);        // knob still drawn
  assert.equal(g.querySelectorAll(".d-hinge").length, 2);       // both hinges still drawn
  assert.ok(g.querySelector(".d-compartment"));                 // and the interior x-ray shows through
});

test("board reflects interior validity via tiled-ok / tiled-bad", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "cabinet", interior: [{ x: 0, y: 0, w: 2, h: 1 }] }); // complete 2W-1H
  place(app, { id: 2, x: 0, y: 2, w: 2, hh: 4, fill: "cabinet", interior: [{ x: 0, y: 0, w: 1, h: 1 }] }); // incomplete 2W-2H
  app.refresh();
  const cls = (id) => doc.querySelector(`#board g[data-id="${id}"] .d-case`).getAttribute("class");
  assert.match(cls(1), /tiled-ok/);
  assert.match(cls(2), /tiled-bad/);
});

test("a 2W-1H (H=1) cabinet is advanced-eligible and bills 1H hinge/latch", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 },
  ] });
  select(app, 1);
  assert.equal(doc.querySelector("#ut-mode").hidden, false);    // eligible (W*H = 2 > 1)
  assert.equal(doc.querySelector("#ut-shelves").hidden, true);  // H < 2 ⇒ no shelf stepper
  assert.equal(bomQty(app, "Case - 1W-1H"), 2);
  assert.equal(bomQty(app, "Door - 2W-1H"), 1);
  assert.equal(bomQty(app, "Hinge"), 1);   // h < 2 ⇒ 1
  assert.equal(bomQty(app, "Latch"), 1);
});

test("editor labels the case (with size) and the extenders inside a compartment", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [
    { x: 0, y: 0, w: 2, h: 2 },  // 2W-2H compartment = a 2W-1H case + one 2W extender
  ] });
  select(app, 1);
  const labels = [...doc.querySelectorAll("#ut-int-grid .ic-comp .ic-slice")].map((t) => t.textContent);
  assert.ok(labels.includes("2W-1H"));     // the case shows its size
  assert.ok(labels.includes("extender"));  // the slice above it is an extender
});

test("a case overhanging on one end is flagged unsupported; filling the other end clears it", () => {
  const { app, doc } = boot();                       // under-table: support is the row above
  place(app, { id: 1, x: 0, y: 0, w: 3, hh: 2 });    // top row, cols 0-2
  place(app, { id: 2, x: 1, y: 2, w: 3, hh: 2 });    // 2nd row, cols 1-3 — right end (col 3) overhangs
  app.refresh();
  const warns = () => [...doc.querySelectorAll("#board-warnings .warn")].map((d) => d.textContent).join(" ");
  assert.match(warns(), /supported on both ends/i);
  place(app, { id: 3, x: 3, y: 0, w: 1, hh: 2 });    // support the open right end from above
  app.refresh();
  assert.doesNotMatch(warns(), /supported on both ends/i);
});

/* ---- Itemized Table Top Kit / Wall covers BOM ----
   gridH=4 → rows()=8, so a 1H (hh=2) case at y=6 sits on the floor. */

test("tabletop: a 1W build bills 1 CU + 1 CL + 4 feet, no foot rails", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  place(app, { id: 1, x: 0, y: 6, w: 1, hh: 2, fill: "classic" });
  assert.equal(bomQty(app, "Cover Upper (CU)"), 1);
  assert.equal(bomQty(app, "Cover Lower (CL)"), 1);
  assert.equal(bomQty(app, "Foot (TPU)"), 4);        // 2*(N+1)
  assert.equal(bomQty(app, "Foot Rail"), 0);         // single bottom case
  assert.equal(bomQty(app, "6mm screw"), 1);         // cover M3, 1 per W
  assert.equal(bomQty(app, "12mm screw"), 0);
});

test("tabletop: a 3W build (three 1W cases) staggers covers and adds foot rails", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  [0, 1, 2].forEach((x) => place(app, { id: x + 1, x, y: 6, w: 1, hh: 2, fill: "classic" }));
  assert.equal(bomQty(app, "Cover Upper (CU)"), 2);  // N=3 odd → one 1W + one 2W
  assert.equal(bomQty(app, "Cover Lower (CL)"), 2);
  assert.equal(bomQty(app, "Foot Rail Upper (FR-U)"), 2);
  assert.equal(bomQty(app, "Foot Rail Lower (FR-L)"), 2);
  assert.equal(bomQty(app, "Foot (TPU)"), 8);        // 2*(3+1)
  assert.equal(bomQty(app, "6mm screw"), 3);
  assert.equal(bomQty(app, "12mm screw"), 3);
  assert.equal(bomQty(app, "M3 hex nut"), 6);        // 3 covers + 3 foot rails
});

test("tabletop: a single 2W bottom case needs no foot rails, but two 1W cases do", () => {
  let app = boot().app;
  app.state.mount = "tabletop";
  place(app, { id: 1, x: 0, y: 6, w: 2, hh: 2, fill: "classic" });
  assert.equal(bomQty(app, "Cover Upper (CU)"), 1);  // one 2W CU
  assert.equal(bomQty(app, "Foot Rail"), 0);         // one bottom case
  assert.equal(bomQty(app, "Foot (TPU)"), 6);        // 2*(2+1)

  app = boot().app;
  app.state.mount = "tabletop";
  place(app, { id: 1, x: 0, y: 6, w: 1, hh: 2, fill: "classic" });
  place(app, { id: 2, x: 1, y: 6, w: 1, hh: 2, fill: "classic" });
  assert.equal(bomQty(app, "Cover Upper (CU)"), 1);  // same 2W cover
  assert.equal(bomQty(app, "Foot Rail Upper (FR-U)"), 1); // but foot rails tie the two cases
  assert.equal(bomQty(app, "Foot Rail Lower (FR-L)"), 1);
});

test("wall mount adds the same covers but no feet / foot rails", () => {
  const { app } = boot();
  app.state.mount = "wall";
  place(app, { id: 1, x: 0, y: 6, w: 2, hh: 2, fill: "classic" });
  assert.equal(bomQty(app, "Cover Upper (CU)"), 1);  // 2W cover caps the top
  assert.equal(bomQty(app, "Cover Lower (CL)"), 1);
  assert.equal(bomQty(app, "Foot (TPU)"), 0);        // wall build hangs — no feet
  assert.equal(bomQty(app, "Foot Rail"), 0);
  assert.ok(bomQty(app, "Wall Mount Kit") >= 1);     // brackets still present
});

test("EdgeLabel / Classic Pro faceplates omit the handle line (integrated)", () => {
  const { app } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  app.state.faceStyle = "essential";
  assert.equal(bomQty(app, "Handle or knob"), 1);    // Essential needs a handle
  app.state.faceStyle = "edgelabel";
  assert.equal(bomQty(app, "Handle or knob"), 0);    // integrated
  app.state.faceStyle = "classicpro";
  assert.equal(bomQty(app, "Handle or knob"), 0);    // integrated
});

test("wall per-column covers tile each top case instead of the whole run", () => {
  const { app } = boot();
  app.state.mount = "wall";
  place(app, { id: 1, x: 0, y: 6, w: 2, hh: 2, fill: "classic" });  // two 2W cases,
  place(app, { id: 2, x: 2, y: 6, w: 2, hh: 2, fill: "classic" });  // one 4W run

  app.state.wallStagger = true;                       // brick over 4W → CL = 1W+2W+1W
  assert.equal(bomQty(app, "Cover Upper (CU)"), 2);
  assert.equal(bomQty(app, "Cover Lower (CL) - 1W"), 2);

  app.state.wallStagger = false;                      // each 2W case → its own 2W cover
  assert.equal(bomQty(app, "Cover Lower (CL) - 2W"), 2);
  assert.equal(bomQty(app, "Cover Lower (CL) - 1W"), 0);
});

const warnsText = (doc) => [...doc.querySelectorAll("#board-warnings .warn")].map((d) => d.textContent).join(" ");

test("Fix structure fills support to clear an unsupported overhang (under-table)", () => {
  const { app, doc } = boot();                       // under-table: support is the row above
  place(app, { id: 1, x: 0, y: 0, w: 3, hh: 2 });    // top row, cols 0-2
  place(app, { id: 2, x: 1, y: 2, w: 3, hh: 2 });    // 2nd row cols 1-3 — col 3 has nothing above
  app.refresh();
  assert.match(warnsText(doc), /supported on both ends/i);
  const before = app.state.placed.length;
  const r = app.fixStructure();
  app.refresh();
  assert.doesNotMatch(warnsText(doc), /supported on both ends/i);
  assert.ok(r.added >= 1 && app.state.placed.length > before);  // a support case was added
});

test("Bow warning flags an interior load on a wider case, but not aligned/full-span joins", () => {
  // a 1W hung at the interior of a 4W (under-table) → the 4W is flagged
  let app = boot().app;
  place(app, { id: 1, x: 0, y: 0, w: 4, hh: 2 });
  place(app, { id: 2, x: 1, y: 2, w: 1, hh: 2 });   // interior, not at either end
  app.refresh();
  assert.ok(app.bowRisks().has(1));

  // a full row of 1W under the 4W → distributed load, no bow
  app = boot().app;
  place(app, { id: 1, x: 0, y: 0, w: 4, hh: 2 });
  [0, 1, 2, 3].forEach((x) => place(app, { id: 10 + x, x, y: 2, w: 1, hh: 2 }));
  app.refresh();
  assert.equal(app.bowRisks().size, 0);

  // a 1W aligned to the 4W's end → at a wall, no bow
  app = boot().app;
  place(app, { id: 1, x: 0, y: 0, w: 4, hh: 2 });
  place(app, { id: 2, x: 0, y: 2, w: 1, hh: 2 });   // left end
  app.refresh();
  assert.equal(app.bowRisks().size, 0);

  // 4W under 4W → same width, no bow
  app = boot().app;
  place(app, { id: 1, x: 0, y: 0, w: 4, hh: 2 });
  place(app, { id: 2, x: 0, y: 2, w: 4, hh: 2 });
  app.refresh();
  assert.equal(app.bowRisks().size, 0);
});

test("Save/load round-trips the full build (setup + layout)", () => {
  const { app } = boot();
  app.state.length = 240;
  app.state.faceStyle = "edgelabel";
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor" });
  place(app, { id: 2, x: 2, y: 0, w: 1, hh: 2, fill: "classic" });
  app.refresh();
  const snap = app.serializeBuild();

  app.state.placed = [];                 // wipe the setup + layout
  app.state.length = 59;
  app.state.faceStyle = "essential";
  app.refresh();
  assert.equal(app.state.placed.length, 0);

  assert.equal(app.applyBuild(snap), true);   // restore
  assert.equal(app.state.length, 240);
  assert.equal(app.state.faceStyle, "edgelabel");
  assert.equal(app.state.placed.length, 2);
  assert.equal(app.state.placed.find((p) => p.id === 1).w, 2);
  assert.notEqual(app.state.placed, snap.placed);  // isolated copy, not shared
});

test("Drawer labels are stored on the unit and survive save/load", () => {
  const { app } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  u.label = "M3 screws";
  app.refresh();
  const snap = app.serializeBuild();
  app.state.placed = [];
  app.applyBuild(snap);
  assert.equal(app.state.placed[0].label, "M3 screws");
});

test("Share link encodes the build and restores it from the hash", () => {
  const { app } = boot();
  app.state.mount = "wall";
  app.state.length = 270;
  place(app, { id: 1, x: 0, y: 0, w: 3, hh: 2, fill: "decor" });
  app.refresh();
  const hash = app.encodeBuildHash();
  assert.ok(typeof hash === "string" && hash.length > 0);

  app.state.placed = [];                 // wipe
  app.state.length = 59;
  app.state.mount = "tabletop";
  app.refresh();

  assert.equal(app.applyBuildHash(hash), true);
  assert.equal(app.state.mount, "wall");
  assert.equal(app.state.length, 270);
  assert.equal(app.state.placed.length, 1);
  assert.equal(app.applyBuildHash("not-valid-base64!!"), false);  // bad link is ignored safely
});

test("Surprise me always yields a supported build within the printer's limits", () => {
  const { app, doc } = boot();
  app.state.length = 165;
  app.state.printer = "a1mini";          // 180×180 → only 1W/2W fit at 165
  app.refresh();
  const warns = () => [...doc.querySelectorAll("#board-warnings .warn")].map((d) => d.textContent).join(" ");
  for (let i = 0; i < 30; i++) {
    app.surpriseMe();
    assert.ok(app.state.placed.length > 0, "produced units");
    assert.ok(app.state.placed.every((p) => p.w <= 2), "respects the 2W fit limit");
    assert.doesNotMatch(warns(), /supported on both ends/i);
    assert.doesNotMatch(warns(), /won't print/i);
  }
});

test("Fix structure drops a floating tabletop unit without adding parts", () => {
  const { app, doc } = boot();
  app.state.mount = "tabletop";
  place(app, { id: 1, x: 0, y: 2, w: 2, hh: 2 });    // floating mid-grid, nothing below
  app.refresh();
  assert.match(warnsText(doc), /supported on both ends/i);
  const before = app.state.placed.length;
  const r = app.fixStructure();
  app.refresh();
  assert.doesNotMatch(warnsText(doc), /supported on both ends/i);
  assert.equal(r.added, 0);                          // gravity alone settled it
  assert.equal(app.state.placed.length, before);
});
