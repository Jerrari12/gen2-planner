/* THE SHELF LIP — the first per-unit OPTION on a non-drawer fill (2026-08-28).
 *
 * A shelf lip stops things rolling off a shelf insert. Joey's call was that it
 * is OPTIONAL, one per shelf, which makes it the shape `drawer.closure` has and
 * `unit.fill` does not: a genuine off state, so a shelf without one is still a
 * finished shelf and nothing the build promises goes unmet.
 *
 * The rule this suite defends hardest is the one that is easy to break by
 * being tidy: THE FIELD'S ABSENCE IS "NO LIP". Writing `lip: false` would make
 * every share link that predates the feature start round-tripping a field it
 * never carried, and would put a `false` into `placed` that the viewer's
 * echo-guard then has to distinguish from `undefined`.
 *
 * The value is "front" | "both" — never a rear-only shelf, which is front
 * first, always (Joey 2026-08-28). "both" adds a MID lip part-way back, and
 * only the 240 and 270 decks carry the second slot pair it drops into, so
 * everywhere else it must CLAMP to one lip rather than over-billing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function boot(len = 185) {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only' });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  const GEN2 = window.eval(
    read('js/requirement-scope.js') + '\n' + read('js/tabletop-completion.js') + '\n'
    + read('js/data.js') + '\n' + read('js/app.js') + '\n;GEN2');
  const app = window.__GEN2_PLANNER_TEST__;
  app.state.mount = 'tabletop';
  app.state.length = len;
  app.state.gridW = 6;
  app.state.gridH = 4;
  app.refresh();
  return { app, GEN2, window };
}

const rows = (app) => Array.from(app.computeBom() || []).flatMap((s) => Array.from(s.items));
const lipRows = (app) => rows(app).filter((r) => /Shelf Lip/.test(r.name));
const insertRows = (app) => rows(app).filter((r) => /Shelf Insert/.test(r.name));

/* Two shelves side by side on the floor. y/hh are HALF-rows and gridH is FULL
   rows, so a single row of 1H units is y = 0 with gridH = 1.
   ⚠ Do not place these at some deeper y and rely on boot()'s gridH: refresh()
   AUTO-SHRINKS gridH to the content, and pushing straight into state.placed
   skips the rebase a real placement does - leaving y pointing outside the grid
   the encoder then writes, so the build round-trips into nothing. That is a
   fixture bug, not a planner bug, and it cost a debugging pass. */
const place = (app, extra = {}) => {
  app.state.placed.push(
    { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0, ...extra },
    { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0, ...extra });
  app.refresh();
};

test('no lip is billed unless a shelf asks for one', () => {
  const { app } = boot();
  place(app);
  assert.equal(insertRows(app).length, 1, 'the inserts are still billed');
  assert.deepEqual(lipRows(app), [], 'a shelf with no lip must bill no lip');
});

test('one lip per shelf, sized by width only', () => {
  const { app } = boot();
  place(app, { lip: 'front' });
  const [lip] = lipRows(app);
  assert.ok(lip, 'lip: true must bill a lip');
  assert.equal(lip.name, 'GEN2 Shelf Lip - 1W', 'the name carries NO length - it fits every collection');
  assert.equal(lip.qty, 2, 'one per shelf');
});

test('the lip is an OPTION with a basis, never core', () => {
  const { app } = boot();
  place(app, { lip: 'front' });
  const [lip] = lipRows(app);
  assert.equal(lip.requirement.scope, 'option',
    'a shelf without a lip is still a shelf - that is what makes this an option');
  assert.equal(lip.requirement.obligationId, 'shelf.retention');
  assert.equal(lip.requirement.optionId, 'shelf.lip');
  assert.equal(lip.basis.axis, 'shelf.lip');
  assert.equal(lip.basis.choice, 'on');
  assert.equal(lip.basis.selectedCount, 2);
  // and the contrast that gives `option` its meaning
  const [ins] = insertRows(app);
  assert.equal(ins.requirement.scope, 'core', 'there is no "empty" fill, so the insert is core');
});

test('a lip is billed for the SHELF fill only - a cabinet is behind a door', () => {
  const { app } = boot();
  app.state.placed.push({ id: 1, x: 0, y: 0, w: 1, hh: 4, fill: 'cabinet', shelves: 1, lip: 'front' });
  app.refresh();
  assert.ok(insertRows(app).length, 'a cabinet still bills its inserts');
  assert.deepEqual(lipRows(app), [], 'nothing can roll off a shelf that sits behind a door');
});

/* PUBLISHED 2026-08-29. Was the reverse assertion (both parts gated "coming
   soon"). Inverted rather than deleted: the risk moved from "a link appears too
   early" to "a length links to another length's page". Both row families point
   at ONE page per length via linkAs, so this also pins that shared target. */
test('both parts link to their OWN length shelf page', () => {
  assert.ok(!boot().GEN2.unreleased.includes('shelfInsert'), 'the insert is published');
  assert.ok(!boot().GEN2.unreleased.includes('shelfLip'), 'and so is the lip');

  for (const len of [59, 115, 165, 185, 240, 270]) {
    // a fresh instance per length: place() APPENDS, and the page key is
    // derived from state.length, which boot() is what sets
    const { app } = boot(len);
    place(app, { lip: 'front' });
    const rows = [...insertRows(app), ...lipRows(app)];
    assert.ok(rows.length >= 2, len + ': expected both an insert and a lip row');
    for (const r of rows) {
      assert.ok(!r.unreleased, r.name + ': published, so no "coming soon" gate');
      const l = app.partLinks(r.linkAs || r.name);
      /* exactP guards the honest-fallback case: without an override partLinks
         still returns a Printables SEARCH url, which looks like a link and is
         not one. */
      assert.ok(l && l.exactP, r.name + ': must resolve to a real page, not a search url');
      assert.ok(l.printables.includes('gen2-' + len + '-shelf-inserts'),
        r.name + ': links to ' + l.printables + ' - not the ' + len + ' page');
    }
  }
});

/* ---- the absence rule --------------------------------------------------- */

test('sanitize keeps a lip, drops it from a non-shelf, and never writes lip:false', () => {
  const { app } = boot();
  const restored = app.applyBuild({
    mount: 'tabletop', length: 185, gridW: 6, gridH: 1,
    placed: [
      { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0, lip: 'front' },
      { id: 2, x: 1, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0 },
      { id: 3, x: 2, y: 0, w: 1, hh: 2, fill: 'decor', shelves: 0, lip: 'front' },
    ],
  });
  assert.ok(restored, 'the planner must accept the build');
  const by = (id) => app.state.placed.find((u) => u.id === id);
  assert.equal(by(1).lip, 'front', 'a shelf that asked for a lip keeps it');
  assert.equal('lip' in by(2), false, 'a shelf that did not ask carries NO lip key at all');
  assert.equal('lip' in by(3), false, 'a drawer can never carry a lip');
});

test('a hostile lip value cannot smuggle anything in', () => {
  const { app } = boot();
  for (const bad of ['true', 1, {}, [], 'yes', null, true, 'mid', 'rear', 'BOTH']) {
    app.state.placed.length = 0;
    app.applyBuild({
      mount: 'tabletop', length: 185, gridW: 6, gridH: 1,
      placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0, lip: bad }],
    });
    assert.equal('lip' in app.state.placed[0], false,
      `lip: ${JSON.stringify(bad)} is not "front" or "both", so it must be dropped`);
  }
});

test('a lip survives a share-link round trip', () => {
  const { app } = boot();
  place(app, { lip: 'front' });
  const hash = app.encodeBuildHash();
  const fresh = boot().app;
  assert.ok(fresh.applyBuild(JSON.parse(
    Buffer.from(hash, 'base64').toString('utf8'))), 'the encoded build must decode');
  assert.equal(fresh.state.placed.filter((u) => u.lip === 'front').length, 2,
    'both shelves keep their lip across the link');
});


/* ---- the mid lip: 240 / 270 only --------------------------------------- */

test('"both" bills TWO lips on a 240/270 and ONE everywhere else', () => {
  for (const [len, qty] of [[185, 1], [165, 1], [240, 2], [270, 2]]) {
    const { app } = boot(len);
    place(app, { lip: 'both' });
    const [lip] = lipRows(app);
    assert.ok(lip, `${len}: a lip must still be billed`);
    assert.equal(lip.qty, 2 * qty,
      `${len}: two shelves x ${qty} lip(s) each - the mid lip exists only where the deck has its slot`);
  }
});

test('the mid-lip collections are a stated fact, not a guess', () => {
  const { GEN2 } = boot();
  assert.deepEqual(Array.from(GEN2.shelfMidLipLengths), [240, 270],
    'MEASURED off the shipped decks; mirrored as LIP.mid in the viewer generator');
});

test('"both" survives sanitize even where it cannot be built', () => {
  /* Kept rather than clamped in state: the BOM and the viewer both reduce it to
     one lip, and the choice then comes back if the build is switched to a 240. */
  const { app } = boot(185);
  app.applyBuild({
    mount: 'tabletop', length: 185, gridW: 6, gridH: 1,
    placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0, lip: 'both' }],
  });
  assert.equal(app.state.placed[0].lip, 'both', 'the choice is preserved, not rewritten');
  assert.equal(lipRows(app)[0].qty, 1, 'but only one lip is billed here');
});
