/* THE JOB STORE - one localStorage key per job (STEP3-SPEC.md section 4.3, tests P-store-1..3).

   The first design kept ONE shared index object that every tab read, merged and wrote back - two planner tabs would erase each
   other's jobs. Now each record lives under its own key and is written whole by the tab that owns it. These tests run two
   store instances over ONE shared storage object (the two tabs) and the real pruning rules. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LR } from './lib/label-env.mjs';

/* A Storage stand-in: insertion-ordered, with an optional byte quota like a browser's. */
function memStorage({ quota = Infinity } = {}) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { const prev = m.get(k); m.set(k, String(v)); if (size() > quota) { prev === undefined ? m.delete(k) : m.set(k, prev); const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}
const DAY = 24 * 3600 * 1000;
const ID = (i) => 'job' + String(i).padStart(9, '0');
const rec = (i, o = {}) => ({ v: 1, jobId: ID(i), family: 'edgelabel', buildId: 'b'.repeat(12), tab: 't'.repeat(12), loadId: 'l'.repeat(12), createdAt: 1, lastActivity: 1, baseRev: 'r'.repeat(12),
  baseline: { rows: [], style: {}, styleSet: null }, answers: {}, ...o });

test('P-store-1: two tabs writing their own jobs never erase each other (no shared index to read-merge-write)', () => {
  const shared = memStorage();
  const tabA = LR.jobStore(shared), tabB = LR.jobStore(shared);
  const T = Date.now();
  assert.equal(tabA.put(rec(1, { tab: 'a'.repeat(12), lastActivity: T })).ok, true);
  assert.equal(tabB.put(rec(2, { tab: 'b'.repeat(12), lastActivity: T + 1 })).ok, true);
  // each tab re-writes its own record many times, interleaved, with new content
  for (let i = 0; i < 5; i++) {
    tabA.put(rec(1, { tab: 'a'.repeat(12), lastActivity: T + 20 + i, baseRev: 'a' + i + 'x'.repeat(10) }));
    tabB.put(rec(2, { tab: 'b'.repeat(12), lastActivity: T + 30 + i, baseRev: 'b' + i + 'x'.repeat(10) }));
  }
  assert.equal(tabA.get(ID(2)).baseRev, 'b4' + 'x'.repeat(10), 'B\'s record is exactly what B last wrote, seen from A');
  assert.equal(tabB.get(ID(1)).baseRev, 'a4' + 'x'.repeat(10));
  assert.deepEqual([...shared._m.keys()].sort(), ['gen2-label-job:' + ID(1), 'gen2-label-job:' + ID(2)], 'one key per job, nothing else (no index)');
  // a write touches ONLY its own key: record the keys written
  const writes = [];
  const spy = { ...shared, getItem: shared.getItem, key: shared.key, removeItem: shared.removeItem, get length() { return shared.length; }, setItem(k, v) { writes.push(k); shared.setItem(k, v); } };
  LR.jobStore(spy).put(rec(1, { lastActivity: T + 99 }));
  assert.deepEqual(writes, ['gen2-label-job:' + ID(1)]);
});

test('P-store-2: pruning by age (30 days) and by count (20, least recently active first) NEVER deletes the record being written', () => {
  const now = 100 * DAY;
  const s = memStorage();
  const st = LR.jobStore(s, { now: () => now });
  for (let i = 1; i <= 25; i++) st.put(rec(i, { lastActivity: now - (26 - i) * 1000 }));
  assert.equal(st.keys().length, 20, 'capped at 20');
  assert.equal(st.get(ID(1)), null, 'the least recently active went first');
  assert.ok(st.get(ID(6)) && st.get(ID(25)));
  // the oldest record is the one being written: it must survive (it is then the newest)
  assert.equal(st.put(rec(2, { lastActivity: now })).ok, true);
  assert.ok(st.get(ID(2)), 'writing a record that is also the stalest by the old stamp keeps it');
  // age: everything older than 30 days goes, the writer stays even if its own stamp is ancient
  const s2 = memStorage();
  const st2 = LR.jobStore(s2, { now: () => now });
  st2.put(rec(1, { lastActivity: now - 31 * DAY }));
  st2.put(rec(2, { lastActivity: now - 29 * DAY }));
  assert.equal(st2.put(rec(3, { lastActivity: now - 40 * DAY })).ok, true);
  assert.equal(st2.get(ID(1)), null, 'older than 30 days: gone');
  assert.ok(st2.get(ID(2)), '29 days: kept');
  assert.ok(st2.get(ID(3)), 'the record being written is never deleted, whatever its stamp');
  // foreign keys are never touched
  s2.setItem('gen2-last-build', 'x');
  st2.put(rec(4, { lastActivity: now }));
  assert.equal(s2.getItem('gen2-last-build'), 'x');
});

test('P-store-3: a quota failure prunes to 10 and retries once; if it still fails the caller is TOLD (never a silent one-way open)', () => {
  const now = 100 * DAY;
  const big = (i) => rec(i, { lastActivity: now - (100 - i) * 1000, baseline: { rows: [{ u: 1, g: [0, 0, 1, 1], t: 'x'.repeat(900), b: null }], style: {}, styleSet: null } });
  const probe = JSON.stringify(big(1)).length + 'gen2-label-job:'.length + ID(1).length;
  // room for 12 records: the 13th throws, the prune to 10 frees space, the retry works
  const s = memStorage({ quota: probe * 12 + 100 });
  const st = LR.jobStore(s, { now: () => now });
  for (let i = 1; i <= 12; i++) assert.equal(st.put(big(i)).ok, true, 'put ' + i);
  const r = st.put(big(13));
  assert.equal(r.ok, true, 'retried after pruning');
  assert.ok(st.keys().length <= 11 && st.get(ID(13)), 'pruned to 10, then the new one: ' + st.keys().length);
  assert.equal(st.get(ID(1)), null, 'the stalest went');
  // no room even after pruning: ok:false with a reason the click turns into the explicit message
  const tiny = memStorage({ quota: 50 });
  assert.deepEqual(LR.jobStore(tiny).put(big(1)), { ok: false, reason: 'quota' });
  assert.equal(tiny.length, 0, 'nothing half-written');
});

test('P-store-4: answers are kept to the last five (by time), and a corrupt record is skipped, not fatal', () => {
  const s = memStorage();
  const st = LR.jobStore(s);
  const answers = {};
  for (let i = 1; i <= 8; i++) answers['ret' + String(i).padStart(9, '0')] = { kind: 'applied', msg: { n: i }, at: i };
  st.put(rec(1, { answers }));
  const got = st.get(ID(1));
  assert.deepEqual(Object.keys(got.answers).sort(), ['ret000000004', 'ret000000005', 'ret000000006', 'ret000000007', 'ret000000008']);
  s.setItem('gen2-label-job:garbage', '{nope');
  s.setItem('gen2-label-job:other', JSON.stringify({ v: 9, jobId: 'x' }));
  assert.equal(st.scan().length, 1);
  assert.equal(st.get('garbage'), null);
});
