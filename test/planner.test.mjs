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
  const u = { id: o.id, x: o.x, y: o.y, w: o.w, hh: o.hh, fill: o.fill || "decor", shelves: 0 };
  app.state.placed.push(u);
  return u;
}

function select(app, id) {
  app.state.selectedUnit = id;
  app.refresh();
}

const $arrow = (doc, dir) => doc.querySelector(`.ut-arrow.${dir}`);

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

test("3W-3H and 4W-3H are not offered as sizes", () => {
  const { app } = boot();
  assert.equal(app.selectable(3, 3), false);
  assert.equal(app.selectable(4, 3), false);
  // neighbours that DO exist still work
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
  assert.equal(app.selectable(4, 3), false);  // still excluded everywhere
});
