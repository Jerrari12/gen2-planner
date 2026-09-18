/* GRIDFINITY DECOR DRAWERS (v2609, 2026-09-18) - the planner's half.
 *
 * A Decor drawer with a 42 mm Gridfinity grid in its floor, on the SAME
 * envelope as the standard Decor drawer, so it swaps in for one of the same
 * size. A decor unit carries `variant: "gridfinity"`; the field's ABSENCE is the
 * standard drawer. Only 115-270 at 1H / 1.5H / 2H have one: anywhere else the
 * variant is kept and the standard drawer is billed (the viewer's generator does
 * the same). Its tear-away front does the back cover's job and blocks one, so it
 * bills no back cover (Joey 2026-09-18). The pages are not published yet, so the
 * rows say "coming soon" and link nowhere - never the standard Decor page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

function boot() {
  const dom = new JSDOM(read("index.html"), { runScripts: "outside-only" });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  window.eval(read("js/requirement-scope.js") + "\n" + read("js/tabletop-completion.js") + "\n"
    + read("js/data.js") + "\n" + read("js/app.js"));
  return { app: window.__GEN2_PLANNER_TEST__, window };
}

/* one row of units on the floor: y = 0 with gridH 1 fits 1H; taller units need
   a taller grid, so gridH follows the tallest unit (y counts HALF-rows from the top) */
function load(app, len, units, extra = {}) {
  const gridH = Math.max(...units.map((u) => u.hh)) / 2;
  let x = 0;
  const placed = units.map((u, i) => {
    const unit = { id: i + 1, x, y: gridH * 2 - u.hh, shelves: 0, ...u };
    x += u.w;
    return unit;
  });
  assert.ok(app.applyBuild({
    mount: len === 59 ? "wall" : "tabletop", length: len, faceStyle: "classic", handleStyle: "deco",
    wallStagger: false, backCover: false, feet: "tpu", removedStoppers: [],
    gridW: Math.max(6, x), gridH: Math.max(1, gridH), placed, nextId: placed.length + 1, ...extra,
  }), "the planner rejected the fixture build");
}
const rows = (app) => Array.from(app.computeBom() || []).flatMap((s) => Array.from(s.items));
const find = (app, re) => rows(app).filter((r) => re.test(r.name));

test("a Gridfinity decor unit bills its own row, and not the standard drawer beside it", () => {
  const { app } = boot();
  load(app, 185, [{ w: 2, hh: 2, fill: "decor", variant: "gridfinity" }]);
  const [r] = find(app, /Gridfinity Decor Drawer$/);
  assert.ok(r, "no Gridfinity row");
  assert.equal(r.name, "GEN2 185-2W-1H Gridfinity Decor Drawer");
  assert.equal(r.qty, 1);
  assert.equal(find(app, /185-2W-1H Decor Drawer$/).filter((x) => !/Gridfinity/.test(x.name)).length, 0,
    "the standard Decor drawer was billed as well");
  assert.match(r.note, /^3 x 4 Gridfinity grid plus a half-grid channel/);
  assert.match(r.note, /up to 48 optional 6x2 mm magnets/);
  assert.equal(r.requirement.scope, "core", "it IS how the unit is filled, like any drawer");
  assert.equal(r.basis.choice, "decor", "the fill is still decor - the basis names the fill, never the label");
});

test("the grid in the note follows width and length", () => {
  for (const [len, deep] of [[115, 2], [165, 3], [185, 4], [240, 5], [270, 6]]) {
    for (const w of [1, 2, 3, 4]) {
      const { app } = boot();
      load(app, len, [{ w, hh: 2, fill: "decor", variant: "gridfinity" }]);
      const [r] = find(app, /Gridfinity Decor Drawer$/);
      assert.ok(r, `${len}-${w}W: no Gridfinity row`);
      assert.match(r.note, new RegExp(`^${2 * w - 1} x ${deep} Gridfinity grid`), `${len}-${w}W`);
    }
  }
});

test("a variant on a size or length with no Gridfinity drawer bills the standard part", () => {
  for (const [len, u, name] of [
    [185, { w: 1, hh: 1, fill: "decor" }, "GEN2 185-1W-0.5H Decor Drawer"],
    [185, { w: 1, hh: 6, fill: "decor" }, "GEN2 185-1W-3H Decor Drawer"],
    [59, { w: 1, hh: 2, fill: "decor" }, "GEN2 59-1W-1H Decor Drawer"],
  ]) {
    const { app } = boot();
    load(app, len, [{ ...u, variant: "gridfinity" }]);
    assert.equal(find(app, /Gridfinity/).length, 0, `${name}: billed a Gridfinity drawer that does not exist`);
    assert.equal(find(app, new RegExp("^" + name.replace(/[.]/g, "\\.") + "$")).length, 1, `${name}: not billed`);
  }
});

test("a Gridfinity drawer takes a faceplate but no back cover", () => {
  const { app } = boot();
  load(app, 185, [
    { w: 1, hh: 2, fill: "decor" },
    { w: 1, hh: 2, fill: "decor", variant: "gridfinity" },
    { w: 1, hh: 2, fill: "decor", variant: "gridfinity" },
  ], { backCover: true });
  assert.equal(find(app, /Decor Faceplate - 1W-1H$/)[0].qty, 3, "every Decor drawer still takes a faceplate");
  assert.equal(find(app, /Back Cover - 1W-1H$/)[0].qty, 1, "only the standard drawer takes a back cover");

  const b = boot();
  load(b.app, 185, [{ w: 2, hh: 2, fill: "decor", variant: "gridfinity" }], { backCover: true });
  assert.equal(find(b.app, /Back Cover/).length, 0, "an all-Gridfinity build bills a back cover");
  assert.equal(find(b.app, /Decor Faceplate/).length, 1);
});

test("the row says coming soon and never links the standard Decor page", () => {
  const { app, window } = boot();
  load(app, 185, [{ w: 2, hh: 2, fill: "decor", variant: "gridfinity" }]);
  const [r] = find(app, /Gridfinity Decor Drawer$/);
  assert.ok(r.unreleased, "published before the MODULITH pages exist");
  assert.equal(window.eval('collectionKeyFor("GEN2 185-2W-1H Gridfinity Decor Drawer")'), "MODULITH 185 Gridfinity Decor Drawers",
    "the Gridfinity name fell through to another collection rule");
  assert.equal(window.eval('collectionKeyFor("GEN2 185-2W-1H Decor Drawer")'), "GEN2 185 Decor Drawers - All",
    "the standard Decor rule regressed");
});

test("its thumbnail is the per-length Gridfinity render, and the file is there", () => {
  const { window } = boot();
  for (const len of [115, 165, 185, 240, 270]) for (const w of [1, 2, 3, 4]) for (const h of ["1", "1.5", "2"]) {
    const path = window.eval(`partImage("GEN2 ${len}-${w}W-${h}H Gridfinity Decor Drawer")`);
    assert.equal(path, `img/parts/${len}/Gridfinity Decor Drawer ${len}-${w}W-${h.replace(".", "")}H.png`);
    assert.ok(existsSync(join(root, path)), `${path} is missing`);
  }
});

test("sanitize keeps the body on a decor unit only, and never writes the standard value", () => {
  const { app } = boot();
  load(app, 185, [
    { w: 1, hh: 2, fill: "decor", variant: "gridfinity" },
    { w: 1, hh: 2, fill: "decor", variant: "standard" },
    { w: 1, hh: 2, fill: "decor", variant: true },
    { w: 1, hh: 2, fill: "classic", variant: "gridfinity" },
    { w: 1, hh: 2, fill: "shelf", variant: "gridfinity" },
    { w: 1, hh: 1, fill: "decor", variant: "gridfinity" },
  ]);
  // Array.from: .map on the jsdom window's array returns ITS realm's Array, which deepStrictEqual rejects
  const v = Array.from(app.state.placed, (u) => ("variant" in u ? u.variant : null));
  assert.deepEqual(v, ["gridfinity", null, null, null, null, "gridfinity"],
    "kept on decor (a 0.5H too, billed standard), dropped everywhere else, standard as absence");
  // and a share link round-trips it
  const again = boot();
  assert.ok(again.app.applyBuild(JSON.parse(JSON.stringify(app.serializeBuild()))));
  assert.equal(again.app.state.placed[0].variant, "gridfinity", "the share link lost the body");
});

test("the unit toolbar offers Standard / Gridfinity only where the size has one", () => {
  const { app, window } = boot();
  load(app, 185, [
    { w: 2, hh: 2, fill: "decor" },
    { w: 1, hh: 1, fill: "decor" },
    { w: 1, hh: 2, fill: "classic" },
  ]);
  const seg = () => window.document.querySelector("#ut-grid");
  const pick = (id) => { app.state.selectedUnit = id; app.refresh(); };

  pick(1);
  assert.equal(seg().hidden, false, "an eligible Decor drawer has no Standard / Gridfinity choice");
  window.document.querySelector('#ut-grid-seg [data-variant="gridfinity"]').click();
  assert.equal(app.state.placed[0].variant, "gridfinity");
  assert.match(window.document.querySelector("#ut-title").textContent, /^Gridfinity Decor Drawer/,
    "the toolbar still names the standard drawer");
  assert.ok(window.document.querySelector('#ut-grid-seg [data-variant="gridfinity"]').classList.contains("active"));
  window.document.querySelector('#ut-grid-seg [data-variant="standard"]').click();
  assert.ok(!("variant" in app.state.placed[0]), 'wrote variant: "standard" instead of removing it');

  pick(2);
  assert.equal(seg().hidden, true, "offered on a 0.5H drawer, which has no Gridfinity version");
  pick(3);
  assert.equal(seg().hidden, true, "offered on a Classic drawer");
});
