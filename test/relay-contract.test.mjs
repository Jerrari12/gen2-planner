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

/* ---- the build plate (2026-09-14): build-wide, rides both channels ---- */

test("outgoing: the build plate relays RESOLVED, as the last key, and the layout carries it", () => {
  // a fixture with no stored plate restores as, and relays, the default - "powder"
  const p = planner(shelfBuild(null));
  assert.equal(lastLayout(p.sent).build.buildPlate, "powder", "the layout channel did not carry the plate");
  p.sent.length = 0;
  p.app.refresh();
  const o = lastOpts(p.sent);
  assert.ok(o, "no buildOptions posted");
  assert.equal(o.opts.buildPlate, "powder");
  /* the viewer's echo guard compares JSON strings, so the key must sit where the viewer puts it */
  assert.equal(Object.keys(o.opts).at(-1), "buildPlate", "buildPlate is not the last key - the echo guard would re-post");
  // each step changes the value, so a relay stuck on the default cannot pass
  for (const f of ["smooth", "holographic", "powder"]) {
    p.app.state.buildPlate = f;
    p.sent.length = 0;
    p.app.refresh();
    assert.equal(lastOpts(p.sent).opts.buildPlate, f, `a ${f} plate relayed as something else`);
  }
  p.close();
});

test("incoming: a plate the viewer sends is APPLIED; anything else leaves the choice alone", () => {
  const p = planner(shelfBuild(null));
  for (const f of ["smooth", "holographic", "powder"]) {
    p.deliver({ gen2: "buildOptions", opts: { buildPlate: f } });
    assert.equal(p.app.state.buildPlate, f, `relaying ${f} left the plate at ${p.app.state.buildPlate}`);
  }
  p.app.state.buildPlate = "holographic";
  for (const bad of ["carbon", "HOLOGRAPHIC", "", null, true, 1, {}, ["powder"]]) {
    p.deliver({ gen2: "buildOptions", opts: { buildPlate: bad } });
    assert.equal(p.app.state.buildPlate, "holographic",
      `relaying ${JSON.stringify(bad)} overwrote the plate with ${JSON.stringify(p.app.state.buildPlate)}`);
  }
  // and a relay that does not mention the plate does not touch it
  p.deliver({ gen2: "buildOptions", opts: { lips: { 1: "front" } } });
  assert.equal(p.app.state.buildPlate, "holographic");
  p.close();
});

/* ---- the Gridfinity drawer body (`variant`, 2026-09-18): per-unit, both channels ----
   Absence is the standard drawer; the only value ever written is "gridfinity".
   The same four places as the lip, and the same fail-closed traps. */
const drawerBuild = (variant) => ({
  mount: "tabletop", length: 185, faceStyle: "classic", handleStyle: "deco",
  wallStagger: false, backCover: false, feet: "tpu", removedStoppers: [],
  gridW: 4, gridH: 1,
  placed: [
    { id: 1, x: 0, y: 0, w: 2, hh: 2, fill: "decor", shelves: 0, ...(variant ? { variant } : {}) },
    { id: 2, x: 2, y: 0, w: 1, hh: 2, fill: "classic", shelves: 0 },
  ],
  nextId: 3,
});

test("outgoing: a drawer body relays per DECOR unit, right after lips, and the layout carries it", () => {
  const p = planner(drawerBuild("gridfinity"));
  const lay = lastLayout(p.sent);
  assert.equal(lay.build.placed[0].variant, "gridfinity", "the layout channel dropped the body");
  assert.ok(!("variant" in lay.build.placed[1]), "a classic drawer serialized a body");

  p.sent.length = 0;
  p.app.refresh();
  const o = lastOpts(p.sent);
  assert.ok(o, "no buildOptions posted");
  assert.equal(o.opts.variants[1], "gridfinity");
  assert.ok(!(2 in o.opts.variants), "a classic drawer got a variants entry");
  const keys = Object.keys(o.opts);
  assert.equal(keys[keys.indexOf("lips") + 1], "variants", `variants is not right after lips: ${keys.join(", ")}`);
  p.close();

  const q = planner(drawerBuild(null));
  q.sent.length = 0;
  q.app.refresh();
  assert.equal(lastOpts(q.sent).opts.variants[1], "standard", "absence must relay as standard");
  q.close();
});

test("incoming: a drawer body the viewer sends is APPLIED, standard as absence, and billed", () => {
  const p = planner(drawerBuild(null));
  const gridRows = () => p.app.computeBom().flatMap((s) => s.items).filter((r) => /Gridfinity Decor Drawer$/.test(r.name));
  assert.equal(gridRows().length, 0);
  p.deliver({ gen2: "buildOptions", opts: { variants: { 1: "gridfinity" } } });
  assert.equal(p.app.state.placed[0].variant, "gridfinity");
  assert.equal(gridRows().length, 1, "a relayed body was not billed");
  p.deliver({ gen2: "buildOptions", opts: { variants: { 1: "standard" } } });
  assert.ok(!("variant" in p.app.state.placed[0]), 'standard must be written as ABSENCE, never variant: "standard"');
  assert.equal(gridRows().length, 0);
  p.close();
});

test("incoming: a hostile drawer body is IGNORED, and a classic unit never takes one", () => {
  for (const bad of [true, false, 1, "", "Gridfinity", "classic", null, {}]) {
    const p = planner(drawerBuild("gridfinity"));
    p.deliver({ gen2: "buildOptions", opts: { variants: { 1: bad } } });
    assert.equal(p.app.state.placed[0].variant, "gridfinity", `relaying ${JSON.stringify(bad)} overwrote the body`);
    p.close();
  }
  const p = planner(drawerBuild(null));
  p.deliver({ gen2: "buildOptions", opts: { variants: { 2: "gridfinity" } } });
  assert.ok(!("variant" in p.app.state.placed[1]), "a classic drawer took a Gridfinity body");
  p.close();
});

/* ---- drawer labels on the relay (label plan step 2, 2026-10-02): per-unit words + badge, build-wide style, and the build id ----
   The VIEWER now edits labels too (its identify card), and posts them on buildOptions: `labels` for every decor unit ("" = none),
   `labelBadges` for the labelled ones (null = absent = the generator predicts), the cleaned `labelStyle`, and `buildId` FIRST.
   This half: the planner emits the same keys in the same order (its echo guard is a JSON-string compare, so ORDER is the
   contract), applies what the viewer sends by its own field's rules, refuses a post naming another build, keeps a label the
   user is still typing, and makes a relayed edit an undo entry. */
const labelBuild = (extra = {}) => ({
  mount: "tabletop", length: 185, faceStyle: "edgelabel", handleStyle: "deco",
  wallStagger: false, backCover: false, feet: "tpu", removedStoppers: [], buildId: "k7m2p9q4x1z8",
  gridW: 4, gridH: 1,
  placed: [
    { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: "decor", shelves: 0, label: "Torx Bits" },
    { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: "decor", shelves: 0, label: "Nuts", labelBadge: { type: "icon", value: "nut" } },
    { id: 3, x: 2, y: 0, w: 1, hh: 2, fill: "decor", shelves: 0 },
    { id: 4, x: 3, y: 0, w: 1, hh: 2, fill: "classic", shelves: 0, label: "Washers" },
  ],
  nextId: 5,
  ...extra,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the board wraps a label across lines (one <text> per line), so the lines are joined back into one string
const boardLabels = (p) => [...p.window.document.querySelectorAll(".d-userlabel")].map((t) => t.textContent).join(" ");
// state objects live in the jsdom realm (another Object.prototype), so structures are compared as JSON, never deepEqual
const j = (v) => JSON.stringify(v === undefined ? null : v);

test("outgoing: buildId FIRST, labels / labelBadges / labelStyle right after variants, buildPlate still LAST, decor units only", () => {
  const p = planner(labelBuild());
  p.sent.length = 0;
  p.app.refresh();
  const o = lastOpts(p.sent);
  assert.ok(o, "no buildOptions posted");
  const keys = Object.keys(o.opts);
  assert.equal(keys[0], "buildId", `buildId is not first: ${keys.join(", ")}`);
  assert.equal(o.opts.buildId, "k7m2p9q4x1z8", "the stored id was not relayed (sanitize re-minted it?)");
  assert.deepEqual(keys.slice(keys.indexOf("variants"), keys.indexOf("variants") + 4), ["variants", "labels", "labelBadges", "labelStyle"],
    `the label keys are not right after variants: ${keys.join(", ")}`);
  assert.equal(keys.at(-1), "buildPlate");
  assert.deepEqual(o.opts.labels, { 1: "Torx Bits", 2: "Nuts", 3: "" }, "labels: every decor unit, \"\" for none, as typed");
  assert.ok(!(4 in o.opts.labels), "a classic unit's name was relayed - the viewer shows no faceplate label for it");
  assert.deepEqual(o.opts.labelBadges, { 1: null, 2: { type: "icon", value: "nut" } });
  assert.equal(o.opts.labelStyle, null);
  p.app.state.labelStyle = { capMm: 4, allCaps: false };
  p.sent.length = 0; p.app.refresh();
  assert.deepEqual(lastOpts(p.sent).opts.labelStyle, { capMm: 4, allCaps: false });
  p.close();
});

test("incoming: the viewer's words, badge and style are APPLIED by the field's own rules, and the board follows (shownLabel)", () => {
  const p = planner(labelBuild());
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 3: "  bolts  " } } });
  assert.equal(p.app.state.placed[2].label, "bolts", "stored AS TYPED and trimmed - never upper-cased at entry");
  assert.ok(boardLabels(p).includes("BOLTS"), `the board shows ${boardLabels(p)} - shownLabel (ALL CAPS by default) did not follow`);
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 3: "y".repeat(45) } } });
  assert.equal(p.app.state.placed[3 - 1].label, "y".repeat(40), "incoming words must be cut to LABEL_MAX");
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labelBadges: { 1: { type: "char", value: "t" } } } });
  assert.equal(j(p.app.state.placed[0].labelBadge), j({ type: "char", value: "t" }));
  for (const bad of [{ type: "svg", value: "<svg/>" }, "nut", { type: "icon", value: "Not An Id" }, 7])
    p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labelBadges: { 1: bad } } });
  assert.equal(j(p.app.state.placed[0].labelBadge), j({ type: "char", value: "t" }), "a hostile badge overwrote the stored one");
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labelBadges: { 1: null } } });
  assert.ok(!("labelBadge" in p.app.state.placed[0]), "null (Auto) must delete the badge");
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labelBadges: { 3: { type: "icon", value: "nut" } }, labels: { 3: "" } } });
  assert.ok(!("label" in p.app.state.placed[2]) && !("labelBadge" in p.app.state.placed[2]), "a badge landed on a unit with no words");
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 2: "" } } });
  assert.ok(!("labelBadge" in p.app.state.placed[1]), "clearing the words must delete the badge (it would reappear on the next name)");
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labelStyle: { capMm: 7, allCaps: false } } });
  assert.equal(j(p.app.state.labelStyle), j({ allCaps: false }), "capMm 7 must be DROPPED (never clamped) while allCaps:false is kept");
  assert.ok(boardLabels(p).includes("Torx Bits") && !boardLabels(p).includes("TORX"), `with ALL CAPS off the board shows the typed case: ${boardLabels(p)}`);
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 4: "Shims" } } });
  assert.equal(p.app.state.placed[3].label, "Washers", "a classic unit's name is not the viewer's to change");
  p.close();
});

test("incoming: a post naming ANOTHER build is IGNORED whole - state untouched, and the echo guard not disturbed", () => {
  const p = planner(labelBuild());
  p.sent.length = 0; p.app.refresh();
  const before = JSON.stringify(p.app.serializeBuild());
  p.deliver({ gen2: "buildOptions", opts: { buildId: "zzzzzzzzzzzz", labels: { 1: "HACK" }, closures: { 1: "magnet" }, buildPlate: "smooth" } });
  assert.equal(JSON.stringify(p.app.serializeBuild()), before, "a mismatched post changed state");
  // the control: the same post with the right id applies everything
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 1: "HACK" }, closures: { 1: "magnet" }, buildPlate: "smooth" } });
  assert.equal(p.app.state.placed[0].label, "HACK"); assert.equal(p.app.state.placed[0].closure, "magnet"); assert.equal(p.app.state.buildPlate, "smooth");
  // and a viewer with NO id (an official kit) is accepted
  p.deliver({ gen2: "buildOptions", opts: { labels: { 1: "Bolts" } } });
  assert.equal(p.app.state.placed[0].label, "Bolts");
  p.close();
});

test("echo guard: a FULL post the viewer sends back in this planner's own key order costs no re-post on the next refresh", () => {
  /* ⚠ The loop-breaker on the apply itself is applyingRemoteOpts (refresh() runs inside it and syncOptionsToViewer returns at
     its first line); the JSON compare matters on the NEXT planner refresh. So the mutation this catches - a key appended on
     one side only, or in another position - shows up as ONE redundant buildOptions post here, after a second refresh. */
  const p = planner(labelBuild());
  p.sent.length = 0; p.app.refresh();
  const mine = lastOpts(p.sent).opts;
  const back = JSON.parse(JSON.stringify(mine)); back.labels[3] = "Bolts"; back.labelBadges[3] = null;   // the viewer's edit, in the viewer's shape
  p.deliver({ gen2: "buildOptions", opts: back });
  assert.equal(p.app.state.placed[2].label, "Bolts");
  p.sent.length = 0;
  p.app.refresh();
  assert.equal(p.sent.filter((m) => m.gen2 === "buildOptions").length, 0,
    `the planner re-posted options after applying the viewer's own post - its JSON differs from the viewer's: ${JSON.stringify(Object.keys(mine))}`);
  p.close();
});

test("a label the planner user is still TYPING survives a viewer post that has not heard it (the lost-edit race)", () => {
  const p = planner(labelBuild());
  p.app.state.selectedUnit = 3; p.app.refresh();
  const field = p.window.document.getElementById("ut-label");
  field.focus();
  assert.equal(p.window.document.activeElement, field, "jsdom did not focus the field - the test cannot prove anything");
  field.value = "Nuts";
  field.dispatchEvent(new p.window.Event("input", { bubbles: true }));
  assert.equal(p.app.state.placed[2].label, "Nuts");
  // the viewer toggles a drawer body and posts its full options - with "" for the unit this user is mid-word in
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 1: "Torx Bits", 2: "Nuts", 3: "" }, variants: { 1: "gridfinity", 2: "standard", 3: "standard" } } });
  assert.equal(p.app.state.placed[0].variant, "gridfinity", "the control: the rest of the post applied");
  assert.equal(p.app.state.placed[2].label, "Nuts", "the viewer's \"\" deleted the label being typed");
  assert.equal(field.value, "Nuts", "the refresh overwrote the field being typed in");
  // and a post that names the OTHER units' labels still lands on them
  assert.equal(p.app.state.placed[0].label, "Torx Bits");
  field.value = "Nuts and bolts";
  field.dispatchEvent(new p.window.Event("change", { bubbles: true }));
  assert.equal(p.app.state.placed[2].label, "Nuts and bolts", "change must re-read the field into state");
  p.close();
});

test("a relayed label becomes an undo entry, and the layout the planner answers with carries it", async () => {
  const p = planner(labelBuild());
  p.app.pushHistoryNow();
  const depth = p.app.history.stack.length;
  p.sent.length = 0;
  p.deliver({ gen2: "buildOptions", opts: { buildId: "k7m2p9q4x1z8", labels: { 3: "Bolts" }, labelBadges: { 3: { type: "icon", value: "nut" } } } });
  assert.equal(p.sent.filter((m) => m.gen2 === "buildOptions").length, 0, "the apply itself re-posted options (echo)");
  await sleep(450);   // the coalesced snapshot and the debounced layout both settle at 350 ms
  assert.equal(p.app.history.stack.length, depth + 1, "the relayed edit did not become its own undo entry");
  const lay = lastLayout(p.sent);
  assert.ok(lay, "no layout was posted after the apply");
  assert.equal(lay.build.placed[2].label, "Bolts"); assert.deepEqual(lay.build.placed[2].labelBadge, { type: "icon", value: "nut" });
  assert.equal(lay.build.buildId, "k7m2p9q4x1z8", "the layout does not carry the build id");
  p.app.undoRedo(-1);
  assert.ok(!("label" in p.app.state.placed[2]), "Ctrl+Z in the planner did not revert the relayed label");
  p.close();
});

test("layoutSig DISTINGUISHES a buildId-only change (the asymmetric-guards rule: posted here, applied by the viewer's layoutKey)", () => {
  const p = planner(labelBuild());
  const a = p.app.layoutSig();
  p.app.state.buildId = "zzzzzzzzzzzz";
  assert.notEqual(p.app.layoutSig(), a, "layoutSig ignores buildId - a layout differing only in the id would never be posted");
  p.app.state.buildId = "k7m2p9q4x1z8";
  assert.equal(p.app.layoutSig(), a);
  p.close();
});

test("a NEW build id reaches the viewer as a LAYOUT before any options post (Surprise me must not trip the viewer's gate)", () => {
  const p = planner(labelBuild());
  p.sent.length = 0;
  p.app.surpriseMe();
  const first = p.sent[0];
  assert.ok(first && first.gen2 === "layout", `the first post after a new build was ${first && first.gen2}, not a layout`);
  const id = first.build.buildId;
  assert.ok(id && id !== "k7m2p9q4x1z8", "surpriseMe did not mint a new id");
  const o = lastOpts(p.sent);
  assert.ok(o, "no options post followed");
  assert.equal(o.opts.buildId, id, "the options post carries another id than the layout");
  assert.ok(p.sent.indexOf(first) < p.sent.indexOf(o), "the options post came before the layout");
  p.close();
});

test("sanitize: a label's words have ONE canonical form on every path - trimmed, then cut to 40", () => {
  const b = labelBuild();
  b.placed[0].label = "  Torx  ";
  b.placed[1].label = " ".repeat(3) + "x".repeat(45);
  b.placed[2].label = " ".repeat(50) + "x";
  b.placed[3].label = " ".repeat(40);
  const p = planner(b);
  const [u1, u2, u3, u4] = p.app.state.placed;
  assert.equal(u1.label, "Torx");
  assert.equal(u2.label, "x".repeat(40), "slice before trim would keep 37 x's");
  assert.equal(u3.label, "x", "leading whitespace ate the allowance");
  assert.ok(!("label" in u4), "a whitespace-only label was stored");
  assert.equal(p.app.cleanLabelText("  a  "), "a");
  p.close();
});

test("the forced layout fires only when the id MOVED since the layout the viewer was sent - a connection's first options post forces none", () => {
  /* The handshake's layout told the viewer this build's id (postLayoutNow records it). An ordinary refresh then posts options
     and NO second layout - the first version forced one on a connection's first options post, and test/drawer-conversion
     ("one debounced layout post for the whole conversion") caught the extra message. A LOADED build with another id is the
     case the forced post exists for: layout first, then the options naming the same id. */
  const p = planner(labelBuild());
  p.sent.length = 0;
  p.app.refresh();
  assert.equal(p.sent.filter((m) => m.gen2 === "layout").length, 0, "an unchanged id forced a layout on an ordinary refresh");
  assert.ok(lastOpts(p.sent), "and the options post itself was made");
  const b = p.app.serializeBuild(); b.buildId = "zzzzzzzzzzzz";
  p.sent.length = 0;
  p.app.applyBuild(b);
  const first = p.sent[0];
  assert.equal(first && first.gen2, "layout", `the first post after loading a build with another id was ${first && first.gen2}`);
  assert.equal(first.build.buildId, "zzzzzzzzzzzz");
  assert.equal(lastOpts(p.sent).opts.buildId, "zzzzzzzzzzzz");
  p.close();
});
