/* Dark mode in the MODULITH palette (2026-10-01, Joey: "match the site's charcoal"). The retrowave look - navy page,
   magenta wash, cyan floor grid and glows - is retired; both themes now draw only from the site's --ml-* tokens
   (MODULITH src/css/site.css). LIGHT is the site exactly (charcoal page, ink cards); DARK is the same palette one step
   deeper (ink page, charcoal panels). These tests keep the old colours from creeping back. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "css/style.css"), "utf8");

// the site's tokens, plus the one darker step dark mode needs for tooltips and modals
const SITE = ["#ff6a1a", "#d9550f", "#2c2d31", "#1d1e20", "#ececee", "#a6a8ad", "#4a4b50", "#3a3b3f", "#4cc38a", "#e5534b"];
const ALLOWED = new Set([...SITE, "#141517"]);

test("the dark-mode tokens are the site's palette", () => {
  const m = css.match(/html\[data-theme="dark"\]\s*\{([^}]*)\}/);
  assert.ok(m, "the dark-mode token block exists");
  const hexes = [...m[1].matchAll(/#[0-9a-f]{6}\b/gi)].map((h) => h[0].toLowerCase());
  assert.ok(hexes.length >= 6, "the block sets the page, panel, line and text colours");
  for (const h of hexes) assert.ok(ALLOWED.has(h), `${h} in the dark-mode tokens is not a MODULITH site colour`);
  const tok = (name) => (m[1].match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i")) || [])[1]?.toLowerCase();
  assert.equal(tok("bg"), "#1d1e20", "dark page = --ml-ink");
  assert.equal(tok("panel"), "#2c2d31", "dark panels = --ml-charcoal");
});

test("no retrowave colour is left anywhere in the stylesheet", () => {
  const retro = ["#0d0e21", "#151735", "#303469", "#38dcff", "#3cf0b0", "#ff4f6d", "#a7abdb",
    "rgba(56, 220, 255", "rgba(255, 62, 165", "rgba(60, 240, 176", "rgba(16, 17, 42"];
  for (const r of retro) assert.ok(!css.toLowerCase().includes(r), `retrowave colour ${r} is back in style.css`);
  assert.ok(!/html\[data-theme="dark"\]\s+\.hero-bg::after/.test(css), "the cyan floor grid over the hero is gone");
});

test("the parts list says MODULITH, not GEN2", () => {
  const app = readFileSync(join(root, "js/app.js"), "utf8");
  assert.ok(app.includes("Your MODULITH build is ready") && !app.includes("Your GEN2 build is ready"));
});
