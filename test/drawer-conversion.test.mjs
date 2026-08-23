/* Classic <-> Decor drawer conversion (2026-08-23).

   Both drawer families seat in the same cases, so a placed drawer can change
   family IN PLACE - only `fill` moves; id, position, size, label, closure and
   stopper keys survive, and the change is one undo step. These tests drive
   the REAL controls (the selected-unit toolbar seg, the Customize master, the
   palette bridge) through jsdom, the same way test/planner.test.mjs does.

   The first test is the adversarial one: it was written BEFORE the feature,
   from the reviewer's prediction that the naive `p.fill = x; refresh()` would
   fail in two independent ways - a half-typed label absorbed into the
   conversion's undo step, and sparse ids renumbered by the restore sanitizer
   with the stopper keys left pointing at the wrong unit. Both were real.

   Run with:  npm test
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/* Boot a fresh planner with a localStorage stub (jsdom's opaque origin has
   none) so auto-save is observable, advanced to a ready 185 under-table grid. */
function boot({ mount = "under-table", length = 185 } = {}) {
  const dom = new JSDOM(read("index.html"), { runScripts: "outside-only" });
  const { window } = dom;
  const stored = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (k) => (stored.has(k) ? stored.get(k) : null), setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) },
  });
  window.__GEN2_PLANNER_TEST__ = true;
  window.eval(read("js/requirement-scope.js") + "\n" + read("js/tabletop-completion.js") + "\n" + read("js/data.js") + "\n" + read("js/app.js"));
  const app = window.__GEN2_PLANNER_TEST__;
  app.state.mount = mount;
  app.state.length = length;
  app.state.gridW = 6;
  app.state.gridH = 4;
  app.refresh();
  return { window, app, doc: window.document, stored };
}

function place(app, o) {
  const u = { id: o.id, x: o.x, y: o.y, w: o.w, hh: o.hh, fill: o.fill || "decor", shelves: o.shelves || 0 };
  if (o.closure) u.closure = o.closure;
  if (o.label) u.label = o.label;
  app.state.placed.push(u);
  if (o.id >= app.state.nextId) app.state.nextId = o.id + 1;
  return u;
}
function select(app, id) { app.state.selectedUnit = id; app.refresh(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bomQty = (app, sub) => {
  let q = 0;
  for (const s of (app.computeBom() || [])) for (const it of s.items) if (it.name.includes(sub)) q += it.qty;
  return q;
};
const decodeHash = (h) => JSON.parse(decodeURIComponent(escape(Buffer.from(h, "base64").toString("binary"))));
/* Canonical JSON (sorted keys, recursively): a restore rebuilds each unit in
   its own key order, which is not a promise the app makes - only the values
   are. (jsdom arrays are another realm, so deepEqual is out anyway.) */
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === "object" && !Array.isArray(v))
  ? Object.keys(v).sort().reduce((a, key) => { a[key] = v[key]; return a; }, {}) : v);
const fillSeg = (doc) => [...doc.querySelectorAll("#ut-fill-seg button")];
const fillBtn = (doc, label) => fillSeg(doc).find((b) => b.textContent.includes(label));
const masterBtn = (doc, label) => [...doc.querySelectorAll("#drawer-type-seg button")].find((b) => b.textContent.includes(label));

/* ---------- the falsifying test (codex-collab, written first) ---------- */

test("bulk conversion is one clean undo step: sparse ids, stopper keys, a half-typed label and closures all survive undo/redo; autosave, share hash, BOM and the viewer post agree", async () => {
  const { app, doc, window: win, stored } = boot();
  const msgs = [];
  const fakeViewer = { closed: false, postMessage: (m) => msgs.push(m), focus() {} };
  win.open = () => fakeViewer;

  // sparse ids (a unit was deleted in between), one with magnets + a removed stopper pair
  place(app, { id: 2, x: 0, y: 0, w: 1, hh: 2, fill: "classic" });
  place(app, { id: 7, x: 1, y: 0, w: 2, hh: 2, fill: "classic", closure: "magnet" });
  app.state.nextId = 8;
  app.state.removedStoppers = ["7:0"];
  app.refresh();
  doc.querySelector("#instructions-3d").click();            // captures viewerWin
  app.pushHistoryNow();

  // a label typed through the REAL input event, with no refresh in between
  select(app, 7);
  const input = doc.querySelector("#ut-label");
  input.value = "m3 screws";
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.equal(app.state.placed[1].label, "M3 SCREWS");
  const before = canon(app.serializeBuild());               // exact pre-conversion state (label included)

  // the palette bridge: pick Decor as the new fill -> the offer names the two Classic drawers
  doc.querySelectorAll("#fill-seg .fill-tile")[1].click();  // Decor Drawer tile
  const offer = doc.querySelector("#fill-convert");
  assert.equal(offer.hidden, false, "the bridge shows while other-family drawers sit on the grid");
  const go = offer.querySelector("button");
  assert.match(go.textContent, /2 /, "the button counts the ELIGIBLE drawers");
  go.click();

  // everything but `fill` survived
  const after = app.serializeBuild();
  assert.equal(after.placed.map((u) => u.fill).join(), "decor,decor");
  assert.equal(after.placed.map((u) => u.id).join(), "2,7", "ids untouched");
  assert.equal(after.placed[1].label, "M3 SCREWS");
  assert.equal(after.placed[1].closure, "magnet");
  assert.equal(after.removedStoppers.join(), "7:0");
  assert.equal(after.nextId, 8);
  const afterStr = canon(after);
  assert.equal(canon(JSON.parse(stored.get("gen2-last-build"))), afterStr, "auto-saved immediately, not after the coalesce window");
  assert.deepEqual(decodeHash(app.encodeBuildHash()).placed.map((u) => u.fill), ["decor", "decor"], "the share link carries the new fills");
  assert.equal(bomQty(app, "Decor Faceplate - 1W-1H"), 1);
  assert.equal(bomQty(app, "Decor Faceplate - 2W-1H"), 1);
  assert.equal(bomQty(app, "Classic Drawer"), 0);
  assert.equal(bomQty(app, "Decor Drawer"), 2);
  assert.equal(bomQty(app, "Magnet Clip"), 2, "the magnet closure rode along");
  const status = doc.querySelector("#fill-convert [role=status]");
  assert.ok(status && /2/.test(status.textContent), "an aria status reports the outcome");

  // undo lands EXACTLY on the pre-conversion state (label kept, ids kept, keys kept)
  app.undoRedo(-1);
  assert.equal(canon(app.serializeBuild()), before, "undo = the exact pre-conversion build");
  assert.equal(canon(JSON.parse(stored.get("gen2-last-build"))), before, "auto-save follows the undo");
  app.undoRedo(+1);
  assert.equal(canon(app.serializeBuild()), afterStr, "redo = the exact post-conversion build");

  // the viewer's debounced layout post carries the converted fills and the same ids
  await sleep(450);
  const layout = msgs.filter((m) => m.gen2 === "layout").at(-1);
  assert.ok(layout, "a layout was posted");
  assert.equal(layout.build.placed.map((u) => `${u.id}:${u.fill}`).join(), "2:decor,7:decor");
});

/* ---------- restore keeps ids (the sanitizer bug the test above exposed) ---------- */

test("restore preserves valid unique ids and nextId, and prunes stopper keys whose unit is gone", () => {
  const { app } = boot();
  app.applyBuild({ mount: "under-table", length: 185, gridW: 6, gridH: 4, nextId: 12,
    placed: [
      { id: 2, x: 0, y: 0, w: 1, hh: 2, fill: "classic" },
      { id: 7, x: 1, y: 0, w: 2, hh: 2, fill: "decor" },
      { id: 7, x: 3, y: 0, w: 1, hh: 2, fill: "decor" },      // duplicate id -> fresh id above max
      { id: "x", x: 4, y: 0, w: 1, hh: 2, fill: "decor" },    // invalid id -> fresh id above max
    ],
    removedStoppers: ["7:0", "7:1", "7:2", "2:0", "99:0", "3:0"] });
  assert.equal(app.state.placed.map((u) => u.id).join(), "2,7,12,13", "valid ids kept; the rest minted above both max id and the incoming nextId");
  assert.equal(app.state.nextId, 14);
  // keys must name a kept drawer and a column inside its width: 7:2 is off a 2W, 99 and 3 don't exist
  assert.equal([...app.state.removedStoppers].sort().join(), "2:0,7:0,7:1");
});

test("a restore without nextId derives it above the highest kept id (ids are never reused)", () => {
  const { app } = boot();
  app.applyBuild({ mount: "under-table", length: 185, gridW: 6, gridH: 4,
    placed: [{ id: 5, x: 0, y: 0, w: 1, hh: 2, fill: "decor" }], removedStoppers: [] });
  assert.equal(app.state.placed[0].id, 5);
  assert.equal(app.state.nextId, 6);
});

/* ---------- per-unit control ---------- */

test("the toolbar's Drawer type seg converts the selected drawer in place and keeps everything else", () => {
  const { app, doc } = boot();
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "classic", closure: "magnet", label: "BITS" });
  place(app, { id: 2, x: 2, y: 0, w: 1, hh: 2, fill: "classic" });
  select(app, 1);
  assert.equal(doc.querySelector("#ut-fill").hidden, false);
  const btns = fillSeg(doc);
  assert.equal(btns.length, 2);
  assert.ok(btns[0].textContent.includes("Classic Drawer") && btns[1].textContent.includes("Decor Drawer"),
    "buttons name the DRAWER families in full - never a bare 'Classic' that could read as the faceplate family");
  assert.ok(fillBtn(doc, "Classic Drawer").classList.contains("active"));
  assert.equal(bomQty(app, "Decor Faceplate"), 0);

  fillBtn(doc, "Decor Drawer").click();
  assert.equal(u.fill, "decor");
  assert.equal(u.id, 1); assert.equal(u.x, 0); assert.equal(u.y, 0); assert.equal(u.w, 2); assert.equal(u.hh, 2);
  assert.equal(u.closure, "magnet"); assert.equal(u.label, "BITS");
  assert.equal(app.state.selectedUnit, 1, "stays selected");
  assert.ok(fillBtn(doc, "Decor Drawer").classList.contains("active"), "the seg re-rendered on the new family");
  assert.equal(doc.querySelector("#ut-title").textContent, "Decor Drawer · 2W-1H");
  assert.equal(bomQty(app, "Decor Faceplate - 2W-1H"), 1, "the faceplate row appeared for that one drawer");
  assert.equal(bomQty(app, "Classic Drawer"), 1, "the other drawer is untouched");
  // the read-only faceplate line names the build-wide style in the heading's own words
  const fp = doc.querySelector("#ut-fp-note");
  assert.equal(fp.hidden, false);
  assert.match(fp.textContent, /Faceplate: Essential series/);

  // and back: one click, the faceplate row goes, the drawer's own fields stay
  fillBtn(doc, "Classic Drawer").click();
  assert.equal(u.fill, "classic");
  assert.equal(u.label, "BITS");
  assert.equal(bomQty(app, "Decor Faceplate"), 0);
  assert.equal(fp.hidden, true);

  // hidden for non-drawers
  place(app, { id: 3, x: 3, y: 0, w: 1, hh: 2, fill: "cabinet" });
  select(app, 3);
  assert.equal(doc.querySelector("#ut-fill").hidden, true);
});

test("a target the printer can't print is offered disabled with the reason, never applied", () => {
  const { app, doc } = boot();
  // a small custom bed: a 2W Decor (176 x 185) fits, a 2W Classic (176 x 195 with its handle) does not in either orientation
  app.state.printer = "custom";
  app.state.customBed = { x: 190, y: 190 };
  const u = place(app, { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor" });
  select(app, 1);
  const classic = fillBtn(doc, "Classic Drawer");
  assert.ok(classic.classList.contains("disabled"));
  assert.equal(classic.getAttribute("aria-disabled"), "true");
  assert.match(classic.dataset.tip, /won't fit/);
  classic.click();
  assert.equal(u.fill, "decor", "a disabled target is inert");
});

test("a size the collection doesn't ship for the target family is refused with a catalog reason", () => {
  const { app, doc } = boot({ length: 59 });
  // 59 ships 1W/2W x 0.5H/1H for both drawer families; pretend Classic stops at 0.5H
  // (the armed-but-unset cap the viewer's COLL[L].classicMaxHH mirrors)
  app.GEN2.collectionCases[59].maxClassicH = 0.5;
  try {
    const u = place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
    select(app, 1);
    const classic = fillBtn(doc, "Classic Drawer");
    assert.ok(classic.classList.contains("disabled"));
    assert.match(classic.dataset.tip, /isn't in the 59 lineup/);
    classic.click();
    assert.equal(u.fill, "decor");
  } finally {
    delete app.GEN2.collectionCases[59].maxClassicH;
  }
});

/* ---------- the Customize master ---------- */

test("the Customize 'Drawer type' master sets every drawer at once, lights only when uniform, and hides without drawers", () => {
  const { app, doc } = boot();
  assert.equal(doc.querySelector("#drawer-type-pick").hidden, true, "no drawers, no control");
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "classic" });
  place(app, { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: "decor" });
  place(app, { id: 3, x: 2, y: 0, w: 1, hh: 2, fill: "cabinet" });
  app.refresh();
  assert.equal(doc.querySelector("#drawer-type-pick").hidden, false);
  assert.equal(masterBtn(doc, "Classic Drawer").classList.contains("active"), false, "mixed build lights nothing");
  assert.equal(masterBtn(doc, "Decor Drawer").classList.contains("active"), false);

  masterBtn(doc, "Decor Drawer").click();
  assert.equal(app.state.placed.map((u) => u.fill).join(), "decor,decor,cabinet", "the cabinet is not a drawer and is left alone");
  assert.ok(masterBtn(doc, "Decor Drawer").classList.contains("active"), "uniform now");
  assert.equal(doc.querySelector("#faceplate-style-pick").hidden, false, "the faceplate cards appear once Decor drawers exist");
  assert.match(doc.querySelector("#drawer-type-status").textContent, /1 /, "the status counts what changed");

  masterBtn(doc, "Classic Drawer").click();
  assert.equal(app.state.placed.map((u) => u.fill).join(), "classic,classic,cabinet");
  assert.equal(doc.querySelector("#faceplate-style-pick").hidden, true);
});

test("a partial bulk conversion converts the eligible drawers, names the skipped ones and their reason, and never leaves a button that converts nothing", () => {
  const { app, doc } = boot();
  // 270 x 190 bed: a 3W Classic (264 x 195) fits in neither orientation, a 3W Decor (264 x 185) and a 1W Classic (88 x 195) do.
  // (Any 1W/2W split is impossible: a bed taking a 1W Classic AND a 2W Decor takes a 2W Classic too - both orientations count.)
  app.state.printer = "custom";
  app.state.customBed = { x: 270, y: 190 };
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  place(app, { id: 2, x: 1, y: 0, w: 3, hh: 2, fill: "decor" });
  place(app, { id: 3, x: 4, y: 0, w: 1, hh: 2, fill: "decor" });
  app.refresh();
  const btn = masterBtn(doc, "Classic Drawer");
  assert.match(btn.dataset.tip, /1 .*won't fit/, "the tip warns which drawers would stay Decor and why");
  assert.ok(btn.classList.contains("tipped"), "an enabled partial switch shows its tip (only .disabled tips rendered before)");
  const note = doc.querySelector("#drawer-type-note");
  assert.equal(note.hidden, false, "the partial preview is readable without hovering");
  assert.match(note.textContent, /Switching to Classic Drawers: 1 stays Decor Drawer: .*won't fit/);
  btn.click();
  assert.equal(app.state.placed.map((u) => u.fill).join(), "classic,decor,classic");
  const status = doc.querySelector("#drawer-type-status");
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /2 .*Classic/);
  assert.match(status.textContent, /1 .*Decor/);
  assert.match(status.textContent, /won't fit/);
  // the one drawer left is the ineligible one: the master for Classic is now inert, with the reason
  const again = masterBtn(doc, "Classic Drawer");
  assert.equal(again.getAttribute("aria-disabled"), "true");
  assert.match(again.dataset.tip, /won't fit/);
  again.click();
  assert.equal(app.state.placed.map((u) => u.fill).join(), "classic,decor,classic", "nothing to convert, nothing converted");
});

/* ---------- the palette bridge ---------- */

test("the palette bridge appears only when the palette's family differs from drawers on the grid, says what is kept, and clears itself", () => {
  const { app, doc } = boot();
  const tiles = () => doc.querySelectorAll("#fill-seg .fill-tile");
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  app.refresh();
  tiles()[1].click();                                        // Decor = same family as the grid
  assert.equal(doc.querySelector("#fill-convert").hidden, true, "same family: nothing to bridge");
  tiles()[0].click();                                        // Classic
  const offer = doc.querySelector("#fill-convert");
  assert.equal(offer.hidden, false);
  assert.match(offer.textContent, /New cases will be Classic Drawers/);
  assert.match(offer.textContent, /1 Decor Drawer already on the grid/);
  assert.match(offer.textContent, /position|size|label|closure/i, "says what survives");
  offer.querySelector("button").click();
  assert.equal(app.state.placed[0].fill, "classic");
  assert.equal(offer.hidden, false, "the outcome stays readable right after the click");
  assert.match(offer.querySelector("[role=status]").textContent, /1 .*Classic/);
  // the next layout change clears the outcome, and with nothing left to convert the bridge is gone
  place(app, { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: "classic" });
  app.refresh();
  assert.equal(doc.querySelector("#fill-convert").hidden, true);
  // the 'soon' fills never bridge
  app.state.fill = "shelf";
  app.refresh();
  assert.equal(doc.querySelector("#fill-convert").hidden, true);
});

/* ---------- the label commit this feature depends on ---------- */

test("a label commits on change: it reaches the undo history, the auto-save and the viewer without another action", async () => {
  const { app, doc, window: win, stored } = boot();
  const msgs = [];
  const fakeViewer = { closed: false, postMessage: (m) => msgs.push(m), focus() {} };
  win.open = () => fakeViewer;
  place(app, { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor" });
  app.refresh();
  doc.querySelector("#instructions-3d").click();
  app.pushHistoryNow();
  select(app, 1);
  const input = doc.querySelector("#ut-label");
  input.value = "bits";
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  await sleep(450);                                          // past the coalesce + debounce windows
  assert.equal(JSON.parse(stored.get("gen2-last-build")).placed[0].label, "BITS", "auto-saved");
  assert.equal(msgs.filter((m) => m.gen2 === "layout").at(-1).build.placed[0].label, "BITS", "posted to the viewer");
  app.undoRedo(-1);
  assert.equal("label" in app.state.placed[0], false, "the label is its own undo step");
});
