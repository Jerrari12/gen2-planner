/* Every local <script src> and stylesheet <link href> in index.html carries ?v=<hash of that file>, so a deploy never pairs
   a new index.html with an old cached app.js (tools/stamp-scripts.mjs says why). Re-stamp with: node tools/stamp-scripts.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stampPlan, stampOf } from "../tools/stamp-scripts.mjs";

const HTML = readFileSync(new URL("../index.html", import.meta.url));
const text = HTML.toString("latin1");

test("S-1: every local script and stylesheet in index.html is stamped with the hash of its current file", () => {
  const { stale, refs } = stampPlan(HTML);
  assert.deepEqual(stale, [], "run: node tools/stamp-scripts.mjs");
  for (const f of ["js/app.js", "js/data.js", "js/label-list.js", "js/label-return.js", "js/modulith-feedback.js", "css/style.css"])
    assert.ok(refs.includes(f), `${f} is one of the stamped files`);
});

test("S-2: no local script or stylesheet is loaded without a stamp", () => {
  const srcs = [...text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const css = [...text.matchAll(/<link\b[^>]*\bhref="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 9 && css.length >= 1, `found ${srcs.length} scripts, ${css.length} stylesheets`);
  for (const s of srcs.concat(css)) {
    if (/^(https?:)?\/\//.test(s)) continue;   // the GoatCounter beacon is the one script from another host
    assert.match(s, /^[^?]+\.(js|css)\?v=[0-9a-f]{8}$/, `${s}: stamped`);
  }
});

test("S-3: other attributes are kept, an external URL is never stamped, and a stylesheet link is stamped too", () => {
  const read = () => Buffer.from("x\n");
  const v = stampOf(Buffer.from("x\n"));
  const { html, stale } = stampPlan(Buffer.from('<link rel="stylesheet" href="css/a.css" />\n<script defer src="js/a.js" type="text/javascript"></script>\n<script src="https://gc.zgo.at/count.js"></script>'), read);
  assert.equal(html, `<link rel="stylesheet" href="css/a.css?v=${v}" />\n<script defer src="js/a.js?v=${v}" type="text/javascript"></script>\n<script src="https://gc.zgo.at/count.js"></script>`);
  assert.deepEqual(stale.map((s) => s.path), ["js/a.js", "css/a.css"]);
});

test("S-4: the stamp reads CRLF as LF, so every checkout computes the same one", () => {
  assert.equal(stampOf(Buffer.from("a\r\nb\r\n")), stampOf(Buffer.from("a\nb\n")));
  assert.notEqual(stampOf(Buffer.from("a\nb\n")), stampOf(Buffer.from("a\nc\n")));
});
