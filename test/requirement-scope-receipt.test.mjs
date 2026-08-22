/* LINK 1 OF THE CHAIN: planner source -> completed-sync receipt.
 *
 * The planner owns js/requirement-scope.js and two other repositories vendor
 * it. Before this file, a direct edit to the source passed planner CI: nothing
 * on this side recorded what had last been synced, so the edit only surfaced
 * later, as a confusing drift failure in a consumer that nobody had touched.
 *
 * data/requirement-scope.sync.json is the receipt written by
 * tools/sync-requirement-scope.mjs ONLY after every consumer copy, pin and
 * contract test passed. This test needs no consumer checkout at all, which is
 * the point: it is the link CI can verify from this repo alone.
 *
 * If it fails, the fix is never to edit the receipt. Run `npm run sync:contract`
 * with every consumer present, and the receipt rewrites itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'js', 'requirement-scope.js');
const RECEIPT = join(root, 'data', 'requirement-scope.sync.json');
const CONSUMERS = ['viewer', 'site'];   // logical names - the receipt must know every one

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('a completed-sync receipt exists', () => {
  assert.ok(existsSync(RECEIPT), 'no data/requirement-scope.sync.json - run `npm run sync:contract` once');
});

test('⚠ THE SOURCE MATCHES THE LAST COMPLETED SYNC', () => {
  const r = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  const actual = sha(SOURCE);
  const version = Number((readFileSync(SOURCE, 'utf8').match(/CONTRACT VERSION:\s*(\d+)/) || [])[1]);
  assert.equal(actual, r.sourceHash,
    'js/requirement-scope.js was EDITED after the last sync.\n' +
    `  source  ${actual.slice(0, 16)}…\n  receipt ${r.sourceHash.slice(0, 16)}…\n` +
    '  The consumers still carry the old contract. Run: npm run sync:contract\n' +
    '  (never edit the receipt by hand - that is exactly the laundering this prevents)');
  assert.equal(version, r.contractVersion, 'the contract version moved without a sync');
});

test('the receipt names every configured consumer, by logical name', () => {
  const r = JSON.parse(readFileSync(RECEIPT, 'utf8'));
  for (const name of CONSUMERS) {
    assert.ok(r.consumers && r.consumers[name], `receipt has no entry for consumer "${name}"`);
    assert.equal(r.consumers[name].hash, r.sourceHash, `${name} was synced to a different hash than the source`);
    assert.equal(r.consumers[name].contractVersion, r.contractVersion);
  }
});

test('the receipt carries no machine-specific paths', () => {
  /* A receipt tied to one PC would be meaningless in CI and misleading on a
     second machine. Destinations are repo-relative; roots are never recorded. */
  const text = readFileSync(RECEIPT, 'utf8');
  assert.ok(!/[A-Za-z]:\\|\/Users\/|\/home\//.test(text), 'receipt contains an absolute path');
  const r = JSON.parse(text);
  for (const [name, c] of Object.entries(r.consumers)) {
    assert.ok(!/^[A-Za-z]:|^\//.test(c.dest), `${name}.dest must be repo-relative`);
    assert.ok(!c.dest.includes('\\'), `${name}.dest uses backslashes - a Windows artefact that is wrong everywhere else`);
  }
});
