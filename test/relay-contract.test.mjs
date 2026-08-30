/* PLANNER <-> VIEWER RELAY CONTRACT - the PLANNER's half.
 *
 * The planner and the 3D viewer sync over two postMessage channels
 * (`buildOptions`, cheap per-unit option maps; `layout`, the full serialized
 * build). Each channel has a half in each repo, and nothing else checks that
 * they agree about SHAPE - the cross-tool BOM parity test compares what the two
 * tools CONCLUDE and never sends a message.
 *
 * This exists because the shelf `lip` shipped broken on 2026-08-28. It began as
 * a BOOLEAN and became a three-state string ("front" | "both", absence = none);
 * two of the planner's serialization paths were never updated:
 *   1. outgoing sent `lips[u.id] = u.lip === true` - ALWAYS false for a string
 *      field, so every shelf relayed "off" and the planner's toggle could never
 *      reach the viewer (the user-visible bug);
 *   2. incoming demanded `typeof === "boolean"`, dropping every mode the viewer
 *      sent - and had one arrived it would have written `u.lip = true`, a THIRD
 *      value type neither sanitize nor the BOM accepts (both take only
 *      "front"/"both"), silently un-billing the lip.
 * Each half fails CLOSED, so the feature did nothing while every suite stayed
 * green. The viewer's `layoutKey` had the mirror defect and is pinned there.
 *
 * ⚠⚠ THESE TESTS DRIVE THE REAL RELAY. A first attempt asserted on SOURCE TEXT
 * and was worthless - it passed against a guard inverted to accept nothing, and
 * against the outgoing loop rewritten to fire for cabinets. Extend this file by
 * CALLING something, never by matching source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/* A planner instance with a captured relay. Returns the test hook plus `sent`,
   the real payloads the planner posts to what it believes is the viewer.

   The planner adopts `viewerWin` from ANY incoming gen2 message whose source is
   not its own window (it explicitly excludes self-posts), so a same-origin
   iframe is a legitimate stand-in: the handshake runs exactly as it does in
   production, and everything after it is the real code path. */
function planner(build) {
  const dom = new JSDOM(read("index.html"), { runScripts: "outside-only" });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  window.eval(read("js/requirement-scope.js") + "\n" + read("js/tabletop-completion.js") + "\n" + read("js/data.js") + "\n" + read("js/app.js"));
  const app = window.__GEN2_PLANNER_TEST__;

  assert.ok(app.applyBuild(JSON.parse(JSON.stringify(build))), "planner rejected the fixture build");

  const sent = [];
  const frame = window.document.createElement("iframe");
  window.document.body.appendChild(frame);
  const fake = frame.contentWindow;
  fake.postMessage = (d) => sent.push(JSON.parse(JSON.stringify(d)));
  window.dispatchEvent(new window.MessageEvent("message", { data: { gen2: "viewerReady" }, source: fake }));
  assert.ok(sent.some((m) => m.gen2 === "layout"),
    "the planner never answered viewerReady with a layout - the capture is not wired, so nothing below proves anything");

  const deliver = (data) =>
    window.dispatchEvent(new window.MessageEvent("message", { data, source: fake }));

  return { window, app, sent, deliver, close: () => window.close() };
}

const shelfBuild = (lip) => ({
  mount: "tabletop", length: 185, faceStyle: "essential", handleStyle: "deco",
  wallStagger: false, backCover: false, feet: "tpu", removedStoppers: [],
  /* ⚠ planner `y` counts HALF-rows from the TOP and `gridH` is in FULL rows,
     so a unit sits on the floor when y + hh === gridH * 2. Get this wrong and
     the build is "floating", the planner posts `layoutBlocked` instead of a
     layout, and the harness guard below refuses to let anything pass. */
  gridW: 4, gridH: 1,
  placed: [
    { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "shelf", shelves: 0, ...(lip ? { lip } : {}) },
    { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: "decor", shelves: 0, closure: "magnet" },
  ],
  nextId: 3,
});

const lastOpts = (sent) => sent.filter((m) => m.gen2 === "buildOptions").pop();
const lastLayout = (sent) => sent.filter((m) => m.gen2 === "layout").pop();

test("outgoing: a lip relays as its MODE, distinct per state", () => {
  const seen = [];
  for (const mode of [null, "front", "both"]) {
    const p = planner(shelfBuild(mode));
    p.sent.length = 0;
    p.app.refresh();                       // the real sync path
    const o = lastOpts(p.sent) || { opts: {} };
    seen.push(o.opts.lips ? o.opts.lips[1] : undefined);
    p.close();
  }
  /* `u.lip === true` yields false for all three, so the receiver cannot tell
     them apart - that WAS the bug, and it is what this asserts against. */
  assert.equal(new Set(seen).size, 3, `the planner collapses the lip states to ${JSON.stringify(seen)}`);
  for (const v of seen)
    assert.ok(["none", "front", "both"].includes(v),
      `the planner relays ${JSON.stringify(v)}, which the viewer's LIP_MODES whitelist drops`);
});

test("outgoing: lips are keyed by SHELF only, and the layout carries the lip too", () => {
  const p = planner(shelfBuild("front"));

  /* The handshake's layout is posted SYNCHRONOUSLY by postLayoutNow(), so it is
     read first - the ordinary layout post is debounced 350ms and asserting on
     it would mean sleeping in a test. */
  const lay = lastLayout(p.sent);
  assert.equal(lay.build.placed[0].lip, "front", "the layout channel dropped the lip");
  assert.ok(!("lip" in lay.build.placed[1]), "a non-shelf serialized a lip");

  p.sent.length = 0;
  p.app.refresh();                         // syncOptionsToViewer is NOT debounced
  const o = lastOpts(p.sent);
  assert.ok(o, "no buildOptions posted");
  assert.equal(o.opts.lips[1], "front");
  // a MISSING key means "not a shelf"; firing the loop for the wrong fill is a
  // mutation that a source-matching test cannot see
  assert.ok(!(2 in o.opts.lips), "a drawer got a lips entry - the loop is keyed on the wrong fill");
  assert.equal(o.opts.closures[2], "magnet", "closures regressed");
  p.close();
});

test("incoming: every mode the viewer sends is APPLIED", () => {
  for (const [wire, expected] of [["front", "front"], ["both", "both"], ["none", undefined]]) {
    const p = planner(shelfBuild(wire === "none" ? "front" : null));
    p.deliver({ gen2: "buildOptions", opts: { lips: { 1: wire } } });
    const u = p.app.state.placed.find((x) => x.id === 1);
    assert.equal(u.lip, expected, `relaying "${wire}" left lip = ${JSON.stringify(u.lip)}`);
    // absence IS "no lip" - never the literal false, or old share links start
    // round-tripping a field they never carried
    if (expected === undefined) assert.ok(!("lip" in u), "wrote lip:false instead of removing the field");
    p.close();
  }
});

test("incoming: a hostile or legacy value is IGNORED, never written through", () => {
  for (const bad of [true, false, 1, 0, "", "rear", "FRONT", null, {}]) {
    const p = planner(shelfBuild("front"));
    p.deliver({ gen2: "buildOptions", opts: { lips: { 1: bad } } });
    const u = p.app.state.placed.find((x) => x.id === 1);
    /* An unrecognised value must leave the existing choice alone. Writing it
       through is how `u.lip = true` would have entered state - a value the BOM
       and sanitize both ignore, so the lip silently stops being billed. */
    assert.equal(u.lip, "front", `relaying ${JSON.stringify(bad)} corrupted lip to ${JSON.stringify(u.lip)}`);
    p.close();
  }
});

test("incoming: a relayed lip actually reaches the BOM", () => {
  const p = planner(shelfBuild(null));
  const lipRows = () => p.app.computeBom().flatMap((s) => s.items).filter((r) => /Shelf Lip/i.test(r.name));
  assert.equal(lipRows().length, 0, "a lip was billed before one was asked for");

  p.deliver({ gen2: "buildOptions", opts: { lips: { 1: "front" } } });
  /* End to end: wire -> state -> BOM. This is what makes the relay's job real -
     applying the field but failing to bill it would be the same silent defect
     one layer down. */
  const rows = lipRows();
  assert.equal(rows.length, 1, "a relayed lip was not billed");
  assert.equal(rows[0].qty, 1);
  p.close();
});
