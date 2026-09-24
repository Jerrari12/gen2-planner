/* The MODULITH masthead (2026-09-24, Joey: "rebrand the planner to be modulith branding, also maybe the links and header
   layout like the modulith site" + "replace the planners build page with: https://modulith-site.pages.dev/builds/").
   The masthead mirrors the site's header() - navItems() in MODULITH src/components.js - so these lists are a MIRROR:
   when the site's nav changes, change index.html and the lists below together. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const html = read("index.html");
const SITE = "https://modulith.systems";   // live 2026-09-24 (the first cut linked modulith-site.pages.dev)
const PRIMARY = ["How It Works", "Starter Builds", "Catalog", "Planner", "Instructions"];
const MORE = ["Community Builds", "Build Studio", "The story", "About", "Support", "Club & membership", "More Designs"];

test("the masthead carries the site's links, in the site's order, with the Planner current", () => {
  const d = new JSDOM(html).window.document;
  const texts = (sel) => [...d.querySelectorAll(sel)].map((a) => a.textContent.trim());
  assert.deepEqual(texts(".mast .mainnav > a"), PRIMARY);
  assert.deepEqual(texts("#prodmenu a"), MORE);
  assert.deepEqual(texts("dialog.mobilenav a"), [...PRIMARY, ...MORE], "the phone menu holds the same links");
  const cur = [...d.querySelectorAll(".mast [aria-current], dialog.mobilenav [aria-current]")].map((a) => a.textContent.trim());
  assert.deepEqual(cur, ["Planner", "Planner"]);
  assert.ok(d.querySelector(".mast .brandlink svg.brandlogo[aria-label='MODULITH']"), "the wordmark links home");
  assert.equal(d.querySelector(".mast .brandlink").getAttribute("href"), SITE + "/");
  assert.ok(d.querySelector(".mast #theme-toggle"), "the light/dark switch lives in the masthead");
  assert.ok(d.querySelector("a.skip[href='#main']") && d.querySelector("main#main"), "the skip link has a target");
});

test("every site link uses ONE origin, and Starter Builds is the site's /builds/", () => {
  const d = new JSDOM(html).window.document;
  const hrefs = [...d.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
  const siteOrigins = new Set(hrefs.filter((h) => /modulith/i.test(h)).map((h) => new URL(h).origin));
  assert.deepEqual([...siteOrigins], [SITE], "moving hosts must stay a single replace");
  const starters = [...d.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Starter Builds");
  assert.equal(starters.length, 3, "masthead, phone menu, footer");
  for (const a of starters) assert.equal(a.getAttribute("href"), SITE + "/builds/");
  /* app.js used to point every .kits-link at the 3D Build Studio's gallery at runtime - that override must stay gone, or
     the markup above is silently overruled in the browser */
  const app = read("js/app.js");
  assert.ok(!/querySelectorAll\(["']\.kits-link["']\)/.test(app) && !app.includes("KITS_URL"), "nothing rewrites the Starter Builds links");
});

test("the brand is MODULITH; GEN2 appears only as the former name", () => {
  const d = new JSDOM(html).window.document;
  assert.equal(d.title, "Planner · MODULITH");
  assert.match(d.querySelector("meta[name=description]").content, /MODULITH build \(formerly GEN2\)/);
  assert.match(d.querySelector(".hero h1").textContent, /Plan your MODULITH build/);
  for (const s of d.querySelectorAll("script")) s.remove();
  const text = d.body.textContent.replace(/\s+/g, " ");
  const left = text.match(/[^.·]{0,30}GEN2[^.·]{0,30}/g) || [];
  for (const m of left) assert.ok(/formerly GEN2|GEN2 is becoming MODULITH/.test(m), `a GEN2 brand left in the page: "${m.trim()}"`);
  assert.ok(!/GEN2 Planner/.test(text));
  assert.equal(getComputedAccent(read("css/style.css")), "#ff6a1a", "MODULITH orange");
});
function getComputedAccent(css) { const m = css.match(/--accent:\s*(#[0-9a-f]{6})/i); return m && m[1].toLowerCase(); }

test("More opens and closes like the site's, and the phone menu opens", () => {
  const dom = new JSDOM(html, { runScripts: "dangerously" });   // inline scripts only: no resources are fetched
  const { document: d, window: w } = dom.window;
  const btn = d.querySelector(".menubtn"), dd = d.getElementById("prodmenu");
  btn.click();
  assert.equal(btn.getAttribute("aria-expanded"), "true"); assert.ok(dd.classList.contains("open"));
  d.body.click();
  assert.equal(btn.getAttribute("aria-expanded"), "false"); assert.ok(!dd.classList.contains("open"), "a click outside closes it");
  btn.click(); d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(!dd.classList.contains("open"), "Escape closes it");
  const dlg = d.querySelector("dialog.mobilenav");
  if (typeof dlg.showModal === "function") {   // jsdom lacks <dialog> methods in some versions; the browser run covers it
    d.querySelector(".mobilebtn").click();
    assert.equal(d.querySelector(".mobilebtn").getAttribute("aria-expanded"), "true");
  }
});
