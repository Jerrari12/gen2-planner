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
  // Non-integrated faceplate bills a handle row named after the chosen handle
  // style (default BlockBar), so the parts list links to that Printables model.
  assert.equal(bomQty(app, "Decor Handles"), 1);     // Essential needs a handle
  app.state.faceStyle = "edgelabel";
  assert.equal(bomQty(app, "Decor Handles"), 0);     // integrated
  app.state.faceStyle = "classicpro";
  assert.equal(bomQty(app, "Decor Handles"), 0);     // integrated
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

test("3D instructions button targets the local viewer from localhost, the deployed one elsewhere", () => {
  // boot a fresh planner at a given page URL and capture where the button opens
  const openedFrom = (pageUrl) => {
    const dom = new JSDOM(read("index.html"), { runScripts: "outside-only", url: pageUrl });
    const { window } = dom;
    window.__GEN2_PLANNER_TEST__ = true;
    let opened = null;
    window.open = (u) => { opened = u; return null; };
    window.eval(read("js/data.js") + "\n" + read("js/app.js"));
    const app = window.__GEN2_PLANNER_TEST__;
    app.state.mount = "wall";
    app.state.length = 185;
    app.state.placed.push({ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor", shelves: 0 });
    app.refresh();
    window.document.querySelector("#instructions-3d").click();
    return opened;
  };
  assert.match(openedFrom("http://localhost:8123/"), /^http:\/\/localhost:8123\//);
  assert.match(openedFrom("http://127.0.0.1:5500/index.html"), /^http:\/\/localhost:8123\//);
  assert.match(openedFrom("https://gen2planner.jerrari3d.com/"), /^https:\/\/jerrari12\.github\.io\/gen2-visual-animator\//);
});

test("removedStoppers drops the stopper BOM count and round-trips through the hash", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  app.state.length = 185;
  place(app, { id: 1, x: 0, y: 6, w: 2, hh: 2, fill: "decor" }); // bottom 2W
  place(app, { id: 2, x: 0, y: 4, w: 2, hh: 2, fill: "decor" }); // 2W above it
  app.refresh();
  assert.equal(bomQty(app, "Drawer Stopper - Left"), 4);   // 2 drawers × 2 cols
  assert.equal(bomQty(app, "Drawer Stopper - Right"), 4);

  app.state.removedStoppers = ["1:0"];                     // drop one 1W pair
  app.refresh();
  assert.equal(bomQty(app, "Drawer Stopper - Left"), 3);
  assert.equal(bomQty(app, "Drawer Stopper - Right"), 3);

  const hash = app.encodeBuildHash();                      // survives a share link
  app.state.removedStoppers = [];
  assert.equal(app.applyBuildHash(hash), true);
  assert.deepEqual([...app.state.removedStoppers], ["1:0"]);
});

test("sanitizer keeps only well-formed, de-duped removedStoppers keys", () => {
  const { app } = boot();
  app.applyBuild({ mount: "tabletop", length: 185, gridW: 6, gridH: 4, placed: [],
    removedStoppers: ["1:0", "1:0", "2:3", "bogus", 42, "x:y", null] });
  assert.deepEqual([...app.state.removedStoppers].sort(), ["1:0", "2:3"]);
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

test("Surprise me uses a single drawer type per build (never mixes Classic + Decor)", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  app.state.length = 185;
  for (let i = 0; i < 30; i++) {
    app.surpriseMe();
    const fills = new Set(app.state.placed.map((p) => p.fill));
    assert.equal(fills.size, 1, `mixed fills: ${[...fills].join(",")}`);
    assert.ok(["classic", "decor"].includes([...fills][0]));
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

/* ---------------- Untrusted-build sanitizing (share links / imports) ---------------- */

const encodeHash = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");
const baseBuild = () => ({
  mount: "under-table", length: 185, printer: "any", gridW: 6, gridH: 4,
  nextId: 9, placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" }],
});

test("hostile build hashes can't crash or hang the planner", () => {
  const payloads = [
    (p) => { p.placed[0].fill = "bogus"; },
    (p) => { p.mount = "roof"; },
    (p) => { p.length = 9999; },
    (p) => { p.doorStyle = "bogus"; },
    (p) => { p.faceStyle = "bogus"; },
    (p) => { p.placed = [null, "x", 42, { id: 1 }]; },
    (p) => { p.gridW = 5000; p.gridH = -3; },
    (p) => { p.gridW = "6"; },
    (p) => { p.spaceW = 1e12; p.spaceH = -5; },
    (p) => { p.placed[0].hh = 7; p.placed[0].w = 999; p.placed[0].x = -3; },
    (p) => { p.placed[0] = { id: 1, x: 0, y: 0, w: 1, hh: 6, fill: "cabinet", shelves: 99999 }; },
    (p) => { p.placed[0].label = { a: 1 }; },
  ];
  for (const mutate of payloads) {
    const { app } = boot();
    const payload = baseBuild();
    mutate(payload);
    assert.doesNotThrow(() => {
      app.applyBuildHash(encodeHash(payload));
      app.refresh();          // a poisoned state would crash here
      app.computeBom();
    });
  }
});

test("sanitizer clamps numbers to the UI's own limits", () => {
  const { app } = boot();
  const p = baseBuild();
  p.gridW = 5000; p.gridH = -3; p.spaceW = 1e12; p.gridH = "banana";
  app.applyBuildHash(encodeHash(p));
  assert.equal(app.state.gridW, 12);       // GRID_LIMITS.wMax
  assert.equal(app.state.gridH, 4);        // non-numeric -> default
  assert.equal(app.state.spaceW, 10000);   // input max
});

test("sanitizer drops invalid units, keeps valid ones, renumbers ids", () => {
  const { app } = boot();
  const p = baseBuild();
  p.placed = [
    { id: 7, x: 0, y: 0, w: 1, hh: 2, fill: "decor", label: "KEEP" },
    { id: 7, x: 1, y: 0, w: 1, hh: 2, fill: "decor" },        // duplicate id, still valid
    { id: 9, x: 0, y: 0, w: 2, hh: 2, fill: "classic" },      // overlaps first -> dropped
    { id: 10, x: 3, y: 0, w: 1, hh: 7, fill: "decor" },       // 3.5H doesn't exist
    { id: 11, x: 50, y: 0, w: 1, hh: 2, fill: "decor" },      // outside the grid
    null, "junk",
  ];
  p.nextId = 1;
  app.applyBuildHash(encodeHash(p));
  assert.equal(app.state.placed.length, 2);
  assert.deepEqual(Array.from(app.state.placed, (u) => u.id), [1, 2]);  // renumbered
  assert.equal(app.state.nextId, 3);
  assert.equal(app.state.placed[0].label, "KEEP");
});

test("sanitizer truncates labels and clamps shelves", () => {
  const { app } = boot();
  const p = baseBuild();
  p.placed = [
    { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor", label: "X".repeat(5000) },
    { id: 2, x: 1, y: 0, w: 1, hh: 6, fill: "cabinet", shelves: 99999 },
    { id: 3, x: 2, y: 0, w: 1, hh: 2, fill: "decor", label: { a: 1 } },
  ];
  app.applyBuildHash(encodeHash(p));
  assert.equal(app.state.placed[0].label.length, 40);          // input maxlength
  assert.equal(app.state.placed[1].shelves, 2);                // 3H cabinet -> max 2
  assert.equal("label" in app.state.placed[2], false);         // non-string dropped
});

test("sanitizer discards a garbage cabinet interior (falls back to simple)", () => {
  const { app } = boot();
  const p = baseBuild();
  p.placed = [
    { id: 1, x: 0, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [{ x: -5, y: 0, w: 999, h: 999 }] },
    { id: 2, x: 2, y: 0, w: 2, hh: 4, fill: "cabinet", interior: [{ x: 0, y: 0, w: 1, h: 2 }, { x: 1, y: 0, w: 1, h: 2 }] },
  ];
  app.applyBuildHash(encodeHash(p));
  assert.equal("interior" in app.state.placed[0], false);      // invalid -> simple mode
  assert.equal(app.state.placed[1].interior.length, 2);        // valid tiling kept
});

test("un-modeled drawer sizes show as coming soon with no download links", () => {
  const { app } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "classic" });   // 1W-1H: modeled
  place(app, { id: 2, x: 1, y: 0, w: 3, hh: 3, fill: "classic" });   // 3W-1.5H: not modeled
  const items = [];
  for (const s of app.computeBom()) items.push(...s.items.filter((i) => i.name.includes("Classic Drawer")));
  const modeled = items.find((i) => i.name.includes("1W-1H"));
  const unmodeled = items.find((i) => i.name.includes("3W-1.5H"));
  assert.equal(modeled.unreleased, false);
  assert.equal(unmodeled.unreleased, true);
});

test("drawer stoppers: mirrored L+R per 1W, skipping rail-mounted under-table drawers", () => {
  const { app } = boot();                                            // under-table
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "classic" });   // on the rail: built-in stops
  place(app, { id: 2, x: 0, y: 2, w: 1, hh: 2, fill: "decor" });     // under a case: 1L+1R
  assert.equal(bomQty(app, "Drawer Stopper - Left"), 1);             // two mirrored line items
  assert.equal(bomQty(app, "Drawer Stopper - Right"), 1);

  app.state.mount = "tabletop";                                      // covers have stopper slots,
  assert.equal(bomQty(app, "Drawer Stopper - Left"), 3);             // so the 2W top row counts too
  assert.equal(bomQty(app, "Drawer Stopper"), 6);                    // L + R combined

  app.state.placed = [{ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "cabinet", shelves: 0 }];
  assert.equal(bomQty(app, "Drawer Stopper"), 0);                    // no function in a cabinet
});

test("Load example uses one drawer style — the selected fill (Decor otherwise)", () => {
  const { window, app, doc } = boot();
  const fillsUsed = () => [...new Set(app.state.placed.map((p) => p.fill))];

  app.state.fill = "decor";
  fireClick(window, doc.querySelector("#load-example"));
  assert.deepEqual(fillsUsed().join(","), "decor");
  assert.ok(app.state.placed.length >= 3);

  app.state.fill = "classic";
  fireClick(window, doc.querySelector("#load-example"));
  assert.deepEqual(fillsUsed().join(","), "classic");

  app.state.fill = "shelf";                       // non-drawer fill → Decor example
  fireClick(window, doc.querySelector("#load-example"));
  assert.deepEqual(fillsUsed().join(","), "decor");
});

test("instructional-video chips surface by fill (toolbar) and mount (BOM)", () => {
  const { app, doc } = boot();
  app.state.mount = "wall";
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "cabinet" });
  place(app, { id: 2, x: 2, y: 0, w: 1, hh: 2, fill: "decor" });

  select(app, 1);                                   // cabinet selected → chip
  assert.equal(doc.querySelector("#ut-video").hidden, false);
  assert.match(doc.querySelector("#ut-video .video-chip").dataset.video, /b2xK4EpuWog/);

  select(app, 2);                                   // decor has no video → hidden
  assert.equal(doc.querySelector("#ut-video").hidden, true);

  const h3 = [...doc.querySelectorAll("#bom h3")].find((h) => h.textContent.includes("Wall Mount"));
  assert.ok(h3.querySelector(".video-chip"), "wall-mount section carries the install video chip");

  // faceplate-style surface: EdgeLabel shows its assembly video, Essential doesn't
  app.state.faceStyle = "edgelabel";
  app.refresh();
  assert.equal(doc.querySelector("#faceplate-video").hidden, false);
  assert.match(doc.querySelector("#faceplate-video .video-chip").dataset.video, /3rPmE_q4KH0/);
  app.state.faceStyle = "essential";
  app.refresh();
  assert.equal(doc.querySelector("#faceplate-video").hidden, true);
});

test("drawer closures: per-drawer opt-in billing, default none", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  place(app, { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: "classic" });
  assert.equal(bomQty(app, "Magnet Clip"), 0);          // default none → nothing billed
  assert.equal(bomQty(app, "Magnets 10"), 0);

  app.state.placed[0].closure = "magnet";               // opt one drawer in
  assert.equal(bomQty(app, "Magnet Clip"), 1);
  assert.equal(bomQty(app, "Magnets 10"), 2);

  // toolbar: picker shows for drawers with Push-Click disabled ("soon")
  select(app, 1);
  assert.equal(doc.querySelector("#ut-closure").hidden, false);
  const btns = [...doc.querySelectorAll("#ut-closure-seg button")];
  assert.equal(btns.length, 3);
  assert.ok(btns[2].classList.contains("disabled"));    // Push-Click
  assert.ok(btns[2].dataset.tip.includes("wall"));      // carries the wall caveat

  // clicking Magnets sets the closure through the real handler
  select(app, 2);
  [...doc.querySelectorAll("#ut-closure-seg button")].find((b) => b.textContent.includes("Magnets")).click();
  assert.equal(app.state.placed[1].closure, "magnet");
  assert.equal(bomQty(app, "Magnet Clip"), 2);

  // hidden for non-drawers
  place(app, { id: 3, x: 2, y: 0, w: 1, hh: 2, fill: "cabinet" });
  select(app, 3);
  assert.equal(doc.querySelector("#ut-closure").hidden, true);
});

test("sanitizer whitelists closures (drawers only, released options only)", () => {
  const { app } = boot();
  const p = baseBuild();
  p.placed = [
    { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor", closure: "magnet" },
    { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: "decor", closure: "pushclick" },  // unreleased
    { id: 3, x: 2, y: 0, w: 1, hh: 2, fill: "classic", closure: "banana" },   // garbage
  ];
  app.applyBuildHash(encodeHash(p));
  assert.equal(app.state.placed[0].closure, "magnet");
  assert.equal("closure" in app.state.placed[1], false);
  assert.equal("closure" in app.state.placed[2], false);
});

test("board colors are permanently product (the schematic toggle is gone)", () => {
  const { app, doc } = boot();
  const svg = doc.querySelector("#board");
  assert.equal(svg.classList.contains("product"), true);       // always on
  assert.equal(doc.querySelector("#board-colors-seg"), null);  // no toggle to turn it off

  // drawer-front shades derive from the chosen length's lineup color and live
  // inline on the svg (185 = #ff8a40 → face is its 0.88 darken)
  assert.equal(svg.style.getPropertyValue("--len-face"), "rgb(224, 121, 56)");
  app.state.length = 165;                                      // lineup blue #3aa0e8
  app.refresh();
  assert.equal(svg.style.getPropertyValue("--len-face"), "rgb(51, 141, 204)");
});

test("labels export button appears only when a drawer has a label", () => {
  const { app, doc } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "classic" });
  app.refresh();
  assert.equal(doc.querySelector("#labels-txt").hidden, true);   // no labels yet

  app.state.placed[0].label = "M3 SCREWS";
  app.refresh();
  assert.equal(doc.querySelector("#labels-txt").hidden, false);
});

test("sagRisks flags units resting mid-span on an open case (tabletop)", () => {
  const { app, doc } = boot();
  app.state.mount = "tabletop";
  // 4W-2H on the tabletop (half-rows 4-7); its open top is at half-row 3,
  // with walls only at columns 1 and 5
  place(app, { id: 1, x: 1, y: 4, w: 4, hh: 4 });
  // mid-span 1W — NEITHER side wall lands on the case's walls → sags
  place(app, { id: 2, x: 2, y: 3, w: 1, hh: 1 });
  // end-aligned 1W — one wall on the case wall QuickLocks it → no sag
  place(app, { id: 3, x: 4, y: 3, w: 1, hh: 1 });
  app.refresh();

  assert.deepEqual([...app.sagRisks()], [2]);
  // board outlines it and the warning box explains
  assert.equal(doc.querySelector('g.drawer[data-id="2"]').getAttribute("class").includes("sag"), true);
  assert.equal(doc.querySelector('g.drawer[data-id="3"]').getAttribute("class").includes("sag"), false);
  assert.equal(doc.querySelector("#board-warnings").textContent.includes("would sag"), true);
});

test("sagRisks: matched widths, edge-aligned spans, and empty-below cases don't fire", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  place(app, { id: 1, x: 1, y: 4, w: 4, hh: 4 });
  // same span directly on top: both walls land on the case walls → fine
  place(app, { id: 2, x: 1, y: 3, w: 4, hh: 1 });
  app.refresh();
  assert.equal(app.sagRisks().size, 0);

  // a 2W mid-span on the 4W sags just like two 1Ws would
  app.state.placed.pop();
  place(app, { id: 3, x: 2, y: 3, w: 2, hh: 1 });
  assert.deepEqual([...app.sagRisks()], [3]);

  // an end over EMPTY space belongs to the both-ends support warning, not sag
  app.state.placed.pop();
  place(app, { id: 4, x: 0, y: 3, w: 2, hh: 1 }); // col 0 below is empty
  assert.equal(app.sagRisks().size, 0);
});

test("sagRisks mirrors toward the mount surface for hanging mounts", () => {
  const { app } = boot(); // under-table: units hang from the top
  place(app, { id: 1, x: 1, y: 0, w: 4, hh: 4 }); // on the surface
  // hanging mid-span from the 4W's open underside → sags
  place(app, { id: 2, x: 2, y: 4, w: 1, hh: 1 });
  assert.deepEqual([...app.sagRisks()], [2]);

  // edge-aligned full span below → fine
  app.state.placed.pop();
  place(app, { id: 3, x: 1, y: 4, w: 4, hh: 1 });
  assert.equal(app.sagRisks().size, 0);
});

test("wall top row can't use 0.5H cases (no wall-mount holes)", () => {
  const { app } = boot();
  app.state.mount = "wall";
  app.state.length = 185;

  // a 0.5H (hh=1) case exposed on the top row → illegal
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 1, fill: "classic" });
  assert.deepEqual([...app.wallTopHalfHeight()], [1]);

  // a 1H top-row case is fine
  app.state.placed = [];
  place(app, { id: 2, x: 0, y: 0, w: 2, hh: 2, fill: "classic" });
  assert.equal(app.wallTopHalfHeight().size, 0);

  // a 0.5H capped by a taller unit above is no longer a top case → fine
  app.state.placed = [];
  place(app, { id: 3, x: 0, y: 0, w: 2, hh: 2, fill: "classic" }); // 1H on top
  place(app, { id: 4, x: 0, y: 2, w: 2, hh: 1, fill: "classic" }); // 0.5H beneath it
  assert.equal(app.wallTopHalfHeight().size, 0);

  // the rule is wall-only — a 0.5H top on tabletop doesn't flag
  app.state.placed = [];
  app.state.mount = "tabletop";
  place(app, { id: 5, x: 0, y: 0, w: 2, hh: 1, fill: "classic" });
  assert.equal(app.wallTopHalfHeight().size, 0);
});

test("fixWallTops grows 0.5H wall tops to 1H, keeping labels and cascading below", () => {
  const { app } = boot();
  app.state.mount = "wall";
  app.state.length = 185;
  app.state.gridH = 4;                                   // rows() = 8, room to grow

  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 1, fill: "decor" });   // 0.5H top, named
  app.state.placed[0].label = "Screws";
  place(app, { id: 2, x: 0, y: 1, w: 2, hh: 2, fill: "classic" }); // 1H directly below

  const r = app.fixWallTops();
  assert.ok(r);
  assert.equal(r.grown, 1);
  assert.equal(r.moved, 1);

  const top = app.state.placed.find((p) => p.id === 1);
  assert.equal(top.hh, 2);                    // grown 0.5H → 1H
  assert.equal(top.label, "Screws");          // label survives (same unit object)
  assert.equal(top.fill, "decor");            // fill survives
  assert.equal(app.state.placed.find((p) => p.id === 2).y, 2); // stack below shifted down
  assert.equal(app.wallTopHalfHeight().size, 0);               // resolved
  assert.equal(app.state.placed.length, 2);                   // nothing lost
});

test("fixWallTops bails out (null) when the space cap is reached, losing nothing", () => {
  const { app } = boot();
  app.state.mount = "wall";
  app.state.length = 185;
  app.state.spaceH = 56;                                 // wall askSpace: 56mm = 1-row cap
  app.state.gridH = 1;

  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 1, fill: "decor" });
  app.state.placed[0].label = "Bits";
  place(app, { id: 2, x: 0, y: 1, w: 1, hh: 1, fill: "classic" });

  const snapshot = JSON.stringify(app.state.placed);
  const r = app.fixWallTops();
  assert.equal(r, null);                                 // no room to grow past the cap
  assert.equal(JSON.stringify(app.state.placed), snapshot); // fully reverted
  assert.equal(app.state.placed.find((p) => p.id === 1).label, "Bits");
});

/* ---------------- 59 length is not offered for Table Top builds ---------------- */

// find a length card in the DOM by its number label ("59", "185", …)
const lenCard = (doc, label) =>
  [...doc.querySelectorAll("#length-cards .len-card")]
    .find((c) => c.querySelector(".len-num")?.textContent === label);

test("mountBlocksLength: 59 blocked on tabletop, allowed on hanging mounts", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  assert.equal(app.mountBlocksLength(59), true);
  assert.equal(app.mountBlocksLength(185), false);   // only 59 carries noTabletop
  app.state.mount = "under-table";
  assert.equal(app.mountBlocksLength(59), false);
  app.state.mount = "wall";
  assert.equal(app.mountBlocksLength(59), false);
});

test("the 59 length card greys out (with a reason) only under tabletop", () => {
  const { app, doc } = boot();
  app.state.mount = "under-table";
  app.refresh();
  assert.equal(lenCard(doc, "59").classList.contains("disabled"), false);

  app.state.mount = "tabletop";
  app.refresh();
  const c59 = lenCard(doc, "59");
  assert.equal(c59.classList.contains("disabled"), true);
  assert.equal(c59.getAttribute("aria-disabled"), "true");
  assert.match(c59.dataset.tip, /foot rails and no feet slots/);
  assert.match(c59.textContent, /no tabletop/);
  // a normal length stays available
  assert.equal(lenCard(doc, "185").classList.contains("disabled"), false);
});

test("switching to tabletop clears a chosen 59 length so the layout can't unlock on it", () => {
  const { app } = boot();
  app.state.mount = "under-table";
  app.state.length = 59;
  app.enforceMountLength();
  assert.equal(app.state.length, 59);   // fine while hanging

  app.state.mount = "tabletop";
  app.enforceMountLength();
  assert.equal(app.state.length, null); // cleared → user re-picks a valid length
});

test("a restored tabletop + 59 build drops the invalid length", () => {
  const { app } = boot();
  app.applyBuildHash(encodeHash({
    mount: "tabletop", length: 59, printer: "any", gridW: 6, gridH: 4, placed: [],
  }));
  assert.equal(app.state.mount, "tabletop");
  assert.equal(app.state.length, null);
});

/* ---------------- 59 mini collection: only 4 case sizes ---------------- */

test("59 catalog: drawers only 1W/2W × 0.5H/1H; shelves keep tall heights but cap width", () => {
  const { app } = boot();
  app.state.mount = "wall";
  app.state.length = 59;
  app.refresh();
  for (const [w, h, want] of [
    [1, 0.5, true], [1, 1, true], [2, 0.5, true], [2, 1, true],
    [3, 0.5, false], [4, 1, false], [1, 1.5, false], [2, 2, false], [1, 3, false],
  ]) assert.equal(app.sizeExists(w, h, "decor"), want, `${w}W-${h}H decor`);
  // shelves/cabinets stack extenders above a 1H case (59 extenders exist), so
  // heights stay open — but no case is wider than 2W, so width still caps
  assert.equal(app.sizeExists(1, 3, "shelf"), true);
  assert.equal(app.sizeExists(3, 1, "shelf"), false);
  // other lengths keep the full catalog
  app.state.length = 185;
  assert.equal(app.sizeExists(4, 2, "decor"), true);
  assert.equal(app.sizeExists(3, 3, "decor"), false); // unavailableSizes still applies
});

test("59 palette shows exactly the four mini sizes (missing rows dropped, not blanked)", () => {
  const { app, doc } = boot();
  app.state.mount = "wall";
  app.state.length = 59;
  app.state.fill = "decor";
  app.refresh();
  const labels = [...doc.querySelectorAll("#palette-items .palette-label")].map((e) => e.textContent).sort();
  assert.deepEqual(labels, ["1W-0.5H", "1W-1H", "2W-0.5H", "2W-1H"]);
  app.state.length = 115;
  app.refresh();
  assert.ok(doc.querySelectorAll("#palette-items .palette-label").length > 10, "full catalog returns on other lengths");
});

test("switching to 59 under an oversize layout warns and greys the 3D button", () => {
  const { app, doc } = boot();
  app.state.mount = "wall";
  app.state.length = 185;
  place(app, { id: 1, x: 0, y: 0, w: 3, hh: 2, fill: "decor" });
  app.refresh();
  assert.equal(doc.querySelector("#instructions-3d").disabled, false);

  app.state.length = 59;
  app.refresh();
  const warns = [...doc.querySelectorAll("#board-warnings .warn")].map((d) => d.textContent).join(" ");
  assert.match(warns, /don't exist in the 59 collection/);
  const btn = doc.querySelector("#instructions-3d");
  assert.equal(btn.disabled, true);
  assert.match(btn.title, /don't exist in the 59 collection/);
});

test("a 59 build restored over another length keeps its (valid) mini-size units", () => {
  const { app } = boot();
  app.state.length = 270;                 // sanitize must judge units by the
  app.refresh();                          // INCOMING length, not this one
  assert.equal(app.applyBuildHash(encodeHash({
    mount: "wall", length: 59, printer: "any", gridW: 6, gridH: 4,
    placed: [{ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor" },
             { id: 2, x: 2, y: 0, w: 3, hh: 2, fill: "decor" }], // 3W doesn't exist at 59 → dropped
  })), true);
  assert.equal(app.state.length, 59);
  assert.equal(app.state.placed.length, 1);
  assert.equal(app.state.placed[0].w, 2);
});

/* ---------------- Surprise me: wide units are occasional ---------------- */

test("surprise me downweights 3W/4W units (measured ~10% of units; was ~21% unweighted)", () => {
  const { app } = boot();
  app.state.mount = "tabletop";
  app.state.length = 185;
  app.state.printer = "any";
  app.refresh();
  let narrow = 0, wide = 0;
  for (let i = 0; i < 100; i++) {
    app.surpriseMe();
    for (const p of app.state.placed) p.w >= 3 ? wide++ : narrow++;
  }
  const share = wide / (narrow + wide);
  // new weighting measures ~10.6% wide over 500 runs; uniform picking measured
  // ~20.9%. 16% sits >3σ from both, so this fails on a regression, not on luck.
  assert.ok(share < 0.16, `3W/4W share ${(share * 100).toFixed(1)}% should stay well under 16%`);
  assert.ok(wide > 0, "wide units still appear (downweighted, not banned)");
});

/* ---------------- Undo / redo ---------------- */

test("undo steps back through layout changes and redo replays them", () => {
  const { app } = boot();
  app.history.stack.length = 0; app.history.idx = -1; // drop boot-time entries
  app.pushHistoryNow();                              // baseline: empty layout
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  app.refresh(); app.pushHistoryNow();               // state A: one unit
  place(app, { id: 2, x: 1, y: 0, w: 2, hh: 2 });
  app.refresh(); app.pushHistoryNow();               // state B: two units

  app.undoRedo(-1);
  assert.equal(app.state.placed.length, 1);          // back to A
  app.undoRedo(-1);
  assert.equal(app.state.placed.length, 0);          // back to baseline
  app.undoRedo(-1);
  assert.equal(app.state.placed.length, 0);          // floor: no-op
  app.undoRedo(+1);
  assert.equal(app.state.placed.length, 1);          // forward to A
  app.undoRedo(+1);
  assert.equal(app.state.placed.length, 2);          // forward to B
  app.undoRedo(+1);
  assert.equal(app.state.placed.length, 2);          // ceiling: no-op
});

test("a new change after undo clears the redo branch", () => {
  const { app } = boot();
  app.history.stack.length = 0; app.history.idx = -1; // drop boot-time entries
  app.pushHistoryNow();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2 });
  app.refresh(); app.pushHistoryNow();
  place(app, { id: 2, x: 1, y: 0, w: 1, hh: 2 });
  app.refresh(); app.pushHistoryNow();

  app.undoRedo(-1);                                  // back to one unit
  place(app, { id: 3, x: 2, y: 0, w: 2, hh: 2 });    // diverge
  app.refresh(); app.pushHistoryNow();
  app.undoRedo(+1);                                  // redo must be dead
  assert.equal(app.state.placed.length, 2);          // stays on the new branch
  assert.equal(app.state.placed.some((p) => p.w === 2), true);
});

test("undo restores non-layout state too (faceplate style)", () => {
  const { app } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  app.refresh(); app.pushHistoryNow();
  app.state.faceStyle = "edgelabel";
  app.refresh(); app.pushHistoryNow();
  app.undoRedo(-1);
  assert.equal(app.state.faceStyle, "essential");
});

/* ---------------- Export metadata ---------------- */

test("buildMeta carries real dimensions and a dated stamp", () => {
  const { app } = boot();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor" });
  app.refresh();
  const m = app.buildMeta();
  assert.equal(m.length, "185 mm");
  assert.match(m.dims, /^176 . 56 . 185 mm$/); // separator left loose — the glyph is cosmetic
  assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
});


/* ---------------- Session resume (auto-saved build) ---------------- */

// boot variant with control over localStorage and the URL BEFORE app.js runs â€”
// the resume path reads both during init.
function bootWith({ lastBuild, url } = {}) {
  const dom = new JSDOM(read("index.html"), { runScripts: "outside-only", url: url || "http://localhost/" });
  const { window } = dom;
  if (lastBuild) window.localStorage.setItem("gen2-last-build", JSON.stringify(lastBuild));
  window.__GEN2_PLANNER_TEST__ = true;
  window.eval(read("js/data.js") + "\n" + read("js/app.js"));
  return { window, app: window.__GEN2_PLANNER_TEST__, doc: window.document };
}

const RESUME_BUILD = {
  mount: "wall", length: 240, printer: "any", gridW: 6, gridH: 4, nextId: 3,
  placed: [{ id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor" },
           { id: 2, x: 2, y: 0, w: 1, hh: 2, fill: "decor" }],
};

test("a closed session's build auto-restores on the next visit", () => {
  const { app } = bootWith({ lastBuild: RESUME_BUILD });
  assert.equal(app.state.placed.length, 2);
  assert.equal(app.state.mount, "wall");
  assert.equal(app.state.length, 240);
});

test("a deliberately cleared layout stays blank on the next visit", () => {
  const { app } = bootWith({ lastBuild: { ...RESUME_BUILD, placed: [] } });
  assert.equal(app.state.placed.length, 0);
});

test("a #build= link beats the auto-saved session", () => {
  const hashBuild = { mount: "under-table", length: 185, printer: "any", gridW: 6, gridH: 4,
    placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" }] };
  const hash = Buffer.from(JSON.stringify(hashBuild), "utf8").toString("base64");
  const { app } = bootWith({ lastBuild: RESUME_BUILD, url: "http://localhost/#build=" + hash });
  assert.equal(app.state.length, 185);          // the link's build, not the saved one
  assert.equal(app.state.placed.length, 1);
});

test("changes auto-save: the stored build tracks the latest settled state", () => {
  const { app, window } = bootWith({});
  app.state.mount = "tabletop";
  app.state.length = 185;
  app.refresh();
  place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2 });
  app.refresh();
  app.pushHistoryNow();                          // settle (the coalesce timer, flushed)
  const stored = JSON.parse(window.localStorage.getItem("gen2-last-build"));
  assert.equal(stored.placed.length, 1);
  assert.equal(stored.length, 185);
});

