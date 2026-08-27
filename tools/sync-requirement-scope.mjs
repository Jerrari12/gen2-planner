#!/usr/bin/env node
/* SYNC THE REQUIREMENT-SCOPE CONTRACT TO ITS CONSUMERS.
 *
 *   node tools/sync-requirement-scope.mjs            write-mode sync
 *   node tools/sync-requirement-scope.mjs --check    verify only, never writes
 *   node tools/sync-requirement-scope.mjs --restore  undo an interrupted run
 *   flags: --full (whole suites, not just contract tests)  --skip-tests
 *
 * The planner OWNS js/requirement-scope.js. Consumers vendor it byte-for-byte
 * and gate on drift, so the copy has to be made by something repeatable rather
 * than by hand - a hand copy is how the pinned hash and the file get out of
 * step, which is the one failure the gate cannot distinguish from real drift.
 *
 * THE CHAIN this command and the consumer suites maintain together:
 *   planner source -> completed-sync RECEIPT -> consumer pin -> consumer bytes
 * Each link is checked by whoever can see both ends of it:
 *   - source -> receipt   : THIS repo's own test, with no consumer present.
 *                           A direct edit to the source fails planner CI until
 *                           a sync completes and rewrites the receipt.
 *   - receipt -> pin      : --check here, when the consumer is checked out.
 *   - pin -> bytes        : each consumer's own suite, standalone.
 * Before the receipt existed there was no planner-side record of what had
 * been synced, so an edit to the source passed planner CI silently and only
 * surfaced as a confusing mismatch in a consumer - the hole this closes.
 *
 * ⚠ IT IS ALL-OR-NOTHING. A write-mode sync demands EVERY consumer be present,
 * writes each copy and pin, runs each consumer's contract test plus our own,
 * and only then rewrites the receipt. Any failure - or a signal - restores
 * every touched file, the receipt included, from a journal persisted after
 * each backup so an interrupted run can be --restore'd exactly.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANNER = resolve(HERE, '..');
const SOURCE = join(PLANNER, 'js', 'requirement-scope.js');
/* The receipt: what the LAST COMPLETED sync established. Committed, so it is
   the planner's own record and needs no consumer to be read. Logical consumer
   names only - never a path, which would tie it to one machine. */
const RECEIPT = join(PLANNER, 'data', 'requirement-scope.sync.json');

/* ⚠ CONSUMER ROOTS COME FROM THE ENVIRONMENT, with sibling defaults for a
   developer machine where the repos sit together. CI checks out ONE repo, so
   a hardcoded sibling path would make this depend on a layout that exists on
   exactly one PC. Absent consumers are tolerated ONLY by read-only --check. */
const consumerRoot = (envVar, fallback) =>
  process.env[envVar] ? resolve(process.env[envVar]) : resolve(PLANNER, '..', '..', fallback);

const CONSUMERS = [
  {
    name: 'viewer',
    envVar: 'GEN2_VIEWER_ROOT',
    root: consumerRoot('GEN2_VIEWER_ROOT', 'GEN2 Visual Animator'),
    dest: join('viewer', 'js', 'vendor', 'requirement-scope.js'),
    pin: join('test', 'requirement-scope-vendor.test.mjs'),
    pinPattern: /(const PINNED_SHA256 = ')([0-9a-f]{64})(')/,
    contractTest: ['node', ['--test', 'test/requirement-scope-vendor.test.mjs']],
    fullTest: ['npm', ['test', '--silent']],
  },
  {
    name: 'site',
    envVar: 'MODULITH_ROOT',
    root: consumerRoot('MODULITH_ROOT', 'MODULITH'),
    dest: join('src', 'lib', 'requirement-scope.js'),
    pin: join('test', 'requirement-scope-vendor.test.js'),
    pinPattern: /(const PINNED_SHA256 = ')([0-9a-f]{64})(')/,
    contractTest: ['node', ['test/requirement-scope-vendor.test.js']],
    fullTest: ['npm', ['test', '--silent']],
  },
];

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const SKIP_TESTS = args.has('--skip-tests');
const FULL = args.has('--full');
const RESTORE = args.has('--restore');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const say = (m) => console.log(m);
const die = (m) => { console.error('\n' + m); process.exit(1); };
const readReceipt = () => (existsSync(RECEIPT) ? JSON.parse(readFileSync(RECEIPT, 'utf8')) : null);

/* ---------- --restore: undo a run that died before rolling back ---------- */
const BACKUP_DIR = join(PLANNER, '.sync-backup');
const MANIFEST = join(BACKUP_DIR, 'manifest.json');
if (RESTORE) {
  if (!existsSync(MANIFEST)) die(`nothing to restore - no ${MANIFEST}`);
  for (const b of JSON.parse(readFileSync(MANIFEST, 'utf8'))) {
    if (b.existed) { copyFileSync(b.bak, b.file); say(`  restored ${b.file}`); }
    else { rmSync(b.file, { force: true }); say(`  removed  ${b.file} (it did not exist before)`); }
  }
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  say('\nrestored. Run --check to confirm.');
  process.exit(0);
}

if (!existsSync(SOURCE)) die(`source of truth is missing: ${SOURCE}`);
/* ⚠⚠ NORMALISE TO LF BEFORE WRITING **OR** PINNING.
   This repo stores and checks out LF, but a Windows working copy holds CRLF -
   so a pin taken over the raw working-copy bytes describes a file that exists
   on exactly one machine. Every fresh clone and every CI runner then hashes
   something else and the drift gate fires on a copy that is actually correct.
   That shipped once and blocked the viewer's deploy (pin fcec589b, real
   checkout 9d50b076); the same failure had already happened to
   tabletop-completion.js. The pin must name the CANONICAL content.
   ⚠ And it is deliberately BOTH: normalising the write without the hash, or
   the hash without the write, just moves the mismatch. */
const srcRaw = readFileSync(SOURCE);
const src = Buffer.from(srcRaw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const srcHash = sha(src);
const version = Number((src.toString('utf8').match(/CONTRACT VERSION:\s*(\d+)/) || [])[1]);
if (!version) die('the source carries no "CONTRACT VERSION:" marker - refusing to sync an unversioned contract');

say(`contract v${version}  ${srcHash.slice(0, 16)}…  (${src.length} bytes)`);

/* ---------- link 1: source -> receipt. Needs NO consumer. ---------- */
const receipt = readReceipt();
const sourceMatchesReceipt = !!receipt && receipt.sourceHash === srcHash && receipt.contractVersion === version;
if (receipt) {
  say(`receipt : v${receipt.contractVersion}  ${receipt.sourceHash.slice(0, 16)}…  (${receipt.completedAt})`);
} else {
  say('receipt : none yet');
}

/* ---------- phase 1: PREPARE. Nothing is written yet. ---------- */
const planned = [], skipped = [];
for (const c of CONSUMERS) {
  if (!existsSync(c.root)) {
    if (!CHECK) {
      die(`consumer "${c.name}" not found at ${c.root}\n` +
          `  A write-mode sync must reach EVERY consumer - a partial one leaves the chain broken.\n` +
          `  Point at it with ${c.envVar}=<path>. Only read-only --check may skip an absent consumer.`);
    }
    skipped.push(c.name);
    continue;
  }
  const destAbs = join(c.root, c.dest), pinAbs = join(c.root, c.pin);
  if (!existsSync(pinAbs)) die(`consumer "${c.name}" has no pin file at ${c.pin}`);
  const pinSrc = readFileSync(pinAbs, 'utf8');
  if (!c.pinPattern.test(pinSrc)) die(`consumer "${c.name}": no pinned hash in ${c.pin}`);
  /* normalised, for the same reason the pin is: --check must judge the
     canonical content, or it reports drift on a machine-local line ending */
  const copy = existsSync(destAbs)
    ? Buffer.from(readFileSync(destAbs).toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : null;
  const pin = (pinSrc.match(c.pinPattern) || [])[2];
  planned.push({ c, destAbs, pinAbs, pinSrc, copyHash: copy ? sha(copy) : null, pin });
}

/* ---------- --check: verify every link that is visible, write nothing ---------- */
if (CHECK) {
  const problems = [];
  if (!receipt) {
    problems.push('no sync receipt exists - run a write-mode sync once to establish the chain');
  } else if (!sourceMatchesReceipt) {
    problems.push(`SOURCE EDITED SINCE THE LAST COMPLETED SYNC\n` +
      `    source  ${srcHash.slice(0, 16)}… v${version}\n` +
      `    receipt ${receipt.sourceHash.slice(0, 16)}… v${receipt.contractVersion}\n` +
      `    The consumers still carry the old contract. Run: npm run sync:contract`);
  }
  for (const p of planned) {
    const expect = receipt && receipt.consumers && receipt.consumers[p.c.name];
    const label = p.c.name.padEnd(8);
    if (!p.copyHash) { problems.push(`${p.c.name}: no vendored copy`); say(`  ${label} MISSING copy`); continue; }
    const ok = p.copyHash === srcHash && p.pin === srcHash && (!expect || expect.hash === srcHash);
    say(`  ${label} ${ok ? 'in sync' : 'OUT OF SYNC'}  copy ${p.copyHash.slice(0, 8)} pin ${(p.pin || '?').slice(0, 8)}`);
    if (!ok) problems.push(`${p.c.name}: copy/pin/receipt disagree with the source`);
  }
  for (const s of skipped) say(`  ${s.padEnd(8)} not checked out - pin->bytes is that repo's own gate; receipt says ${
    receipt && receipt.consumers && receipt.consumers[s] ? receipt.consumers[s].hash.slice(0, 8) : 'nothing'}`);
  if (problems.length) die('--check FAILED:\n  ' + problems.join('\n  '));
  say(`\n--check OK: source matches the receipt${planned.length ? `, ${planned.length} consumer(s) verified` : ''}` +
      (skipped.length ? ` (${skipped.join(', ')} unverified here)` : '') + '.');
  process.exit(0);
}

const needsWork = !sourceMatchesReceipt || planned.some((p) => p.copyHash !== srcHash || p.pin !== srcHash);
if (!needsWork && SKIP_TESTS) { say('\nnothing to do.'); process.exit(0); }

/* ---------- phase 2: WRITE, journaling a restore point for every file ---------- */
const backups = [];
if (existsSync(BACKUP_DIR)) {
  die(`a previous sync did not finish - ${BACKUP_DIR} still exists.\n` +
      `  The consumers may be written but UNVERIFIED. Recover with --restore.`);
}
const restoreAll = () => {
  for (const b of backups) { if (b.existed) copyFileSync(b.bak, b.file); else rmSync(b.file, { force: true }); }
  rmSync(BACKUP_DIR, { recursive: true, force: true });
};
const backup = (file) => {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const bak = join(BACKUP_DIR, backups.length + '-' + file.split(/[\\/]/).pop());
  const existed = existsSync(file);
  if (existed) copyFileSync(file, bak);
  backups.push({ file, bak, existed });
  // persisted after EVERY backup: a run killed mid-write must still be restorable
  writeFileSync(MANIFEST, JSON.stringify(backups, null, 1), 'utf8');
};
let unwinding = false;
const onSignal = (sig) => {
  if (unwinding) return; unwinding = true;
  console.error(`\n${sig} during sync - restoring every touched file…`);
  try { restoreAll(); } catch (e) { console.error('  restore failed: ' + e.message); }
  process.exit(130);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => onSignal(sig));

try {
  say('');
  for (const p of planned) {
    mkdirSync(dirname(p.destAbs), { recursive: true });
    backup(p.destAbs); writeFileSync(p.destAbs, src);
    backup(p.pinAbs); writeFileSync(p.pinAbs, p.pinSrc.replace(p.c.pinPattern, `$1${srcHash}$3`), 'utf8');
    say(`  wrote ${p.c.name}: ${p.c.dest} + pin`);
    /* read back through the same normalisation - on Windows an editor or a
       filter could reintroduce CRLF, and that must fail here, not in CI */
    const back = Buffer.from(readFileSync(p.destAbs).toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    if (sha(back) !== srcHash) throw new Error(`${p.c.name}: written copy does not read back identical`);
  }

  /* ---------- phase 3: PROVE IT, or put everything back ---------- */
  if (!SKIP_TESTS) {
    for (const p of planned) {
      say(`\n  ${p.c.name}: ${FULL ? 'full suite' : 'contract test'}…`);
      const [cmd, a] = FULL ? p.c.fullTest : p.c.contractTest;
      execFileSync(cmd, a, { cwd: p.c.root, stdio: 'inherit', shell: process.platform === 'win32' });
    }
    say(`\n  planner: ${FULL ? 'full suite' : 'contract test'}…`);
    const own = FULL ? ['npm', ['test', '--silent']] : ['node', ['--test', 'test/requirement-scope.test.mjs']];
    execFileSync(own[0], own[1], { cwd: PLANNER, stdio: 'inherit', shell: process.platform === 'win32' });

    /* ---------- phase 3b: BEHAVIOURAL PARITY, never skipped here ----------
       Byte equality proves the consumers hold the same policy. It does not
       prove they ASK it the same questions - the viewer once classified the
       3W kit's Cover Lower as option while the planner said core, because one
       gathered the stagger fact per case and the other per run. The parity
       suite in the viewer runs the committed fixtures through both tools.
       Standalone CI may skip it (the other repos are absent there). A
       write-mode sync has EVERY repository present by construction, so here a
       missing dependency is a setup fault and the suite FAILS with the fix
       named; the receipt below is only ever written after it passed. */
    const viewer = planned.find((p) => p.c.name === 'viewer');
    if (!viewer) throw new Error('parity needs the viewer consumer, which was not planned');
    say(`\n  cross-tool parity (viewer ⇄ planner), REQUIRED…`);
    execFileSync('node', ['--test', 'test/requirement-parity.test.mjs'], {
      cwd: viewer.c.root, stdio: 'inherit', shell: process.platform === 'win32',
      env: { ...process.env, GEN2_REQUIRE_PARITY: '1', GEN2_PLANNER_ROOT: PLANNER },
    });
  }

  /* ---------- phase 4: the RECEIPT, last, inside the journal ---------- */
  backup(RECEIPT);
  mkdirSync(dirname(RECEIPT), { recursive: true });
  const consumers = {};
  // ⚠ forward slashes, always: path.join emits backslashes on Windows, and a
  // receipt that says "viewer\js\..." is wrong on every other machine and
  // would fail the no-machine-specifics test the moment CI read it
  for (const p of planned) consumers[p.c.name] = { hash: srcHash, contractVersion: version, dest: p.c.dest.split('\\').join('/') };
  writeFileSync(RECEIPT, JSON.stringify({
    _comment: 'Written ONLY by tools/sync-requirement-scope.mjs after every consumer copy, pin, contract test AND the cross-tool parity suite passed. Logical consumer names, never paths. Planner CI fails if js/requirement-scope.js no longer matches sourceHash - edit the source, then sync.',
    contractVersion: version,
    sourceHash: srcHash,
    sourceFile: 'js/requirement-scope.js',
    consumers,
    /* The receipt stands for TWO facts, not one: the bytes are synchronised
       AND the committed fixtures classified identically in both tools when
       run together. A --skip-tests sync cannot make the second claim and
       says so, so nobody reads a byte-only sync as a behavioural one. */
    parity: SKIP_TESTS
      ? { verified: false, note: 'synced with --skip-tests; cross-tool parity NOT run' }
      : { verified: true, suite: 'viewer/test/requirement-parity.test.mjs', fixtures: ['closure 0/2', 'closure 1/2', 'closure 2/2', '185-tabletop-2w2h', '185-tabletop-3w2h', 'under-table'] },
    completedAt: new Date().toISOString(),
  }, null, 2) + '\n', 'utf8');
  say(`\n  receipt written: data/requirement-scope.sync.json`);
} catch (e) {
  restoreAll();
  die(`SYNC FAILED - every file has been restored, the receipt included.\n  ${e.message}`);
}

rmSync(BACKUP_DIR, { recursive: true, force: true });
say(`\nsynced ${planned.length} consumer(s) to contract v${version}. Chain complete.`);
