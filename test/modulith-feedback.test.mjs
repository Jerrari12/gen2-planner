/* Feedback & support (Astra 2026-10-10): js/modulith-feedback.js is the ONE dialog every MODULITH tool uses - the planner owns
   it, the Label Studio, Part Picker and 3D Build Studio vendor it byte for byte. Its promises: three kinds (Get help / Report a
   problem / Suggest an improvement), "Open email app" + "Copy message" with the address visible, a short message (tool +
   version + a CLEAN page URL; the browser only for a problem), and a link to the build only when the user ticks it - and
   only when it is short enough for an email link. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(root, "js/modulith-feedback.js"), "utf8");
const page = (url = "https://gen2planner.jerrari3d.com/?theme=dark#build=SECRETLAYOUT") => {
  const dom = new JSDOM("<!doctype html><html><head></head><body><button id=b>x</button></body></html>", { url, runScripts: "outside-only" });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
  w.eval(SRC);
  return w;
};

test("F-1: the message - tag per kind, clean page URL (no query, no #build), browser only for a problem", () => {
  const F = page().MODULITHFeedback;
  assert.equal(F.ADDRESS, "support@jerrari3d.com");
  assert.deepEqual([...F.KINDS].map((k) => [k.id, k.title]), [["help", "Get help"], ["problem", "Report a problem"], ["idea", "Suggest an improvement"]]);
  const opts = { tool: "Planner", version: "v2610", browser: "Chrome 141 on Windows" };
  const help = F.compose(opts, "help", false), prob = F.compose(opts, "problem", false), idea = F.compose(opts, "idea", false);
  assert.equal(help.subject, "[MODULITH Planner] Help");
  assert.equal(prob.subject, "[MODULITH Planner] Problem");
  assert.equal(idea.subject, "[MODULITH Planner] Idea");
  for (const m of [help, prob, idea]) {
    assert.match(m.body, /\nMODULITH Planner v2610\nPage: https:\/\/gen2planner\.jerrari3d\.com\/\n/);
    assert.ok(!/SECRETLAYOUT|theme=dark|#build/.test(m.body + m.mailto), "the page line never carries the build or the query");
    assert.ok(m.mailto.startsWith("mailto:support@jerrari3d.com?subject="));
  }
  assert.match(prob.body, /Browser: Chrome 141 on Windows/);
  assert.ok(!/Browser:/.test(help.body) && !/Browser:/.test(idea.body), "help and ideas carry no browser line");
  const given = F.compose({ tool: "Planner", page: "https://gen2planner.jerrari3d.com/x?y=1#build=SECRET" }, "help", false);
  assert.match(given.body, /Page: https:\/\/gen2planner\.jerrari3d\.com\/x
/, "a supplied page is cleaned too (Terra 01a126e2)");
});

test("F-2: a build link only when asked, and only when it fits an email link; otherwise the attach-the-file note", () => {
  const F = page().MODULITHFeedback;
  const short = "https://gen2planner.jerrari3d.com/#build=" + "a".repeat(300);
  const long = "https://gen2planner.jerrari3d.com/#build=" + "a".repeat(5000);
  const o = (link) => ({ tool: "Planner", buildLink: () => link, attachHint: "Attach the build file." });
  assert.ok(!/Build:/.test(F.compose(o(short), "problem", false).body), "unticked: no build line");
  assert.match(F.compose(o(short), "problem", true).body, /\nBuild: https:\/\/gen2planner\.jerrari3d\.com\/#build=a{300}\n/);
  const big = F.compose(o(long), "problem", true);
  assert.ok(!big.body.includes("a".repeat(2000)), "a long link is never put in the email");
  assert.match(big.body, /Build: too big for an email link/);
  assert.equal(big.note, "Attach the build file.");
  assert.equal(F.compose({ tool: "Planner", buildLink: () => { throw new Error("x"); } }, "help", true).body.includes("Build:"), false, "a failing link is left out");
});

test("F-3: the dialog - three kinds, the build box hidden without a layout and UNTICKED with one, Open email app + Copy message + the address", () => {
  const w = page();
  const F = w.MODULITHFeedback, d = w.document;
  F.open({ tool: "Planner", version: "v2610" });
  const dlg = d.querySelector("dialog.mfb-dialog");
  assert.ok(dlg && dlg.hasAttribute("open"));
  assert.deepEqual([...dlg.querySelectorAll(".mfb-kind b")].map((b) => b.textContent), ["Get help", "Report a problem", "Suggest an improvement"]);
  assert.ok(dlg.querySelector(".mfb-step2").hidden, "nothing to send until a kind is picked");
  dlg.querySelector('.mfb-kind[data-kind="problem"]').click();
  assert.equal(dlg.querySelector(".mfb-step2").hidden, false);
  assert.ok(dlg.querySelector(".mfb-check").hidden, "no layout: no build box");
  const open = [...dlg.querySelectorAll(".mfb-btn")].find((b) => b.textContent === "Open email app");
  assert.ok(open && open.getAttribute("href").startsWith("mailto:support@jerrari3d.com?subject=%5BMODULITH%20Planner%5D%20Problem"));
  assert.ok(!open.hasAttribute("target"), "a mailto link opens the mail app, not a blank tab");
  assert.ok([...dlg.querySelectorAll(".mfb-btn")].some((b) => b.textContent === "Copy message"));
  assert.match(dlg.querySelector(".mfb-to").textContent, /support@jerrari3d\.com/);
  dlg.close();
  F.open({ tool: "Planner", buildLink: () => "https://x/#build=abc" });
  dlg.querySelector('.mfb-kind[data-kind="help"]').click();
  const box = dlg.querySelector("#mfb-build");
  assert.equal(dlg.querySelector(".mfb-check").hidden, false);
  assert.equal(box.checked, false, "the build link is opt-in");
  assert.ok(!decodeURIComponent(open.getAttribute("href")).includes("#build=abc"));
  box.checked = true; box.dispatchEvent(new w.Event("change"));
  assert.ok(decodeURIComponent(open.getAttribute("href")).includes("Build: https://x/#build=abc"));
  dlg.close();
  F.open({ tool: "Planner", buildLink: () => "https://x/#build=abc" });
  assert.equal(dlg.querySelector("#mfb-build").checked, false, "re-opening un-ticks it again");
});

test("F-4: the planner wires it - masthead button, footer and phone-menu entries, the script before app.js", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.ok(html.indexOf('<script src="js/modulith-feedback.js"></script>') > 0);
  assert.ok(html.indexOf('<script src="js/modulith-feedback.js"></script>') < html.indexOf('<script src="js/app.js"></script>'));
  assert.ok(/<span id="mast-feedback" hidden><\/span>[^\n]*\n\s*<button id="theme-toggle"/.test(html), "the masthead spot sits before the theme switch");
  assert.ok(/<footer class="footer">[\s\S]*<a href="#" data-feedback>Feedback &amp; support<\/a>[\s\S]*<\/footer>/.test(html));
  assert.ok(/<dialog class="mobilenav"[\s\S]*<button type="button" class="mnfeedback" data-feedback>Feedback &amp; support<\/button>\s*<\/dialog>/.test(html));
  const app = readFileSync(join(root, "js/app.js"), "utf8");
  assert.match(app, /tool: "Planner",/);
  assert.match(app, /buildLink: state\.placed\.length \? \(\) => location\.origin \+ location\.pathname \+ "#build=" \+ encodeBuildHash\(\) : null/);
});
