#!/usr/bin/env node
/* SYNC THE REQUIREMENT-SCOPE CONTRACT TO ITS CONSUMERS.
 *
 *   node tools/sync-requirement-scope.mjs [--check] [--skip-tests]
 *
 * The planner OWNS js/requirement-scope.js. Consumers vendor it byte-for-byte
 * and gate on drift, so the copy has to be made by something repeatable rather
 * than by hand - a hand copy is how the pinned hash and the file get out of
 * step, which is the one failure the gate cannot distinguish from real drift.
 *
 * ⚠ IT IS ALL-OR-NOTHING. Consumers are written only after EVERY consumer has
 * been prepared, and if any consumer's tests then fail, every file this run
 * touched is restored. A half-synced pair of repos is worse than an unsynced
 * one: the drift gate would report a mismatch that looks like an edit nobody
 * made, and the obvious "fix" is to bump the hash, which laundders the split.
 *
 * --check      verify only; write nothing, exit non-zero on drift
 * --skip-tests copy and pin, but do not run consumer suites (CI runs them)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANNER = resolve(HERE, '..');
const SOURCE = join(PLANNER, 'js', 'requirement-scope.js');

/* Every consumer of the contract. Adding the site later is one entry here -
 * `pin` is the file carrying the pinned hash, `test` is the command that
 * proves the copy both matches and behaves. */
/* ⚠ CONSUMER ROOTS COME FROM THE ENVIRONMENT, with sibling defaults for a
   developer machine where all three repos sit together. CI checks out ONE
   repository, so a hardcoded sibling path would make this command depend on a
   layout that exists on exactly one PC - it would "pass" locally and be
   meaningless anywhere else.
   The split of responsibility that makes this safe:
     - EACH CONSUMER'S OWN SUITE gates its copy against a pinned hash, the
       provenance marker and the contract version. That works standalone and
       is what CI actually runs. It catches an edit made on the consumer side.
     - THIS COMMAND checks byte equality against the source, which catches
       STALENESS - a contract change nobody re-vendored. It needs both repos,
       so it skips absent consumers unless --require-all is given.
   Neither half alone is sufficient, and neither pretends to be. */
const consumerRoot = (envVar, fallback) =>
  process.env[envVar] ? resolve(process.env[envVar]) : resolve(PLANNER, '..', '..', fallback);

const CONSUMERS = [
  {
    name: 'viewer',
    root: consumerRoot('GEN2_VIEWER_ROOT', 'GEN2 Visual Animator'),
    dest: join('viewer', 'js', 'vendor', 'requirement-scope.js'),
    pin: join('test', 'requirement-scope-vendor.test.mjs'),
    pinPattern: /(const PINNED_SHA256 = ')([0-9a-f]{64})(')/,
    contractTest: ['node', ['--test', 'test/requirement-scope-vendor.test.mjs']],
    fullTest: ['npm', ['test', '--silent']],
  },
  {
    name: 'site',
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
/* Run each consumer's CONTRACT test by default rather than its whole suite.
   The full suites take minutes and their other failures are not this command's
   business; --full runs them when you want the belt as well as the braces. */
const FULL = args.has('--full');
const RESTORE = args.has('--restore');
/* A real sync must never leave the consumers disagreeing, so it demands every
   consumer be present. A --check in CI must not fail merely because the other
   repositories are not checked out. */
const REQUIRE_ALL = args.has('--require-all') || !CHECK;

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const say = (m) => console.log(m);
const die = (m) => { console.error('\n' + m); process.exit(1); };

/* --restore: undo a run that died before it could roll itself back. The
   manifest records where every backup came from, so recovery is exact rather
   than a guess about which file was which. */
const BACKUP_DIR = join(PLANNER, '.sync-backup');
const MANIFEST = join(BACKUP_DIR, 'manifest.json');
if (RESTORE) {
  if (!existsSync(MANIFEST)) die(`nothing to restore - no ${MANIFEST}`);
  const entries = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  for (const b of entries) {
    if (b.existed) { copyFileSync(b.bak, b.file); say(`  restored ${b.file}`); }
    else { rmSync(b.file, { force: true }); say(`  removed  ${b.file} (it did not exist before)`); }
  }
  rmSync(BACKUP_DIR, { recursive: true, force: true });
  say('\nrestored. Run --check to confirm the consumers agree.');
  process.exit(0);
}

if (!existsSync(SOURCE)) die(`source of truth is missing: ${SOURCE}`);
const src = readFileSync(SOURCE);
const srcHash = sha(src);

/* The contract states its own version; a consumer pinned to a different one is
 * a migration, not a sync, and must be a deliberate act. */
const version = (src.toString('utf8').match(/CONTRACT VERSION:\s*(\d+)/) || [])[1];
if (!version) die('the source carries no "CONTRACT VERSION:" marker - refusing to sync an unversioned contract');

say(`contract v${version}  ${srcHash.slice(0, 16)}…  (${src.length} bytes)`);
say(`source: js/requirement-scope.js\n`);

/* ---------- phase 1: PREPARE. Nothing is written yet. ---------- */
const planned = [];
const skipped = [];
for (const c of CONSUMERS) {
  if (!existsSync(c.root)) {
    if (REQUIRE_ALL) {
      die(`consumer "${c.name}" not found at ${c.root}\n` +
          `  A sync must reach EVERY consumer - a partial one leaves the gates disagreeing.\n` +
          `  Point at it with ${c.name === 'site' ? 'MODULITH_ROOT' : 'GEN2_VIEWER_ROOT'}=<path>, or run\n` +
          `  --check without --require-all if you only mean to verify what is here.`);
    }
    skipped.push(c.name);
    say(`  ${c.name.padEnd(8)} not checked out - skipped (its own suite pins the hash independently)`);
    continue;
  }
  const destAbs = join(c.root, c.dest);
  const pinAbs = join(c.root, c.pin);
  if (!existsSync(pinAbs)) die(`consumer "${c.name}" has no pin file at ${c.pin}`);

  const pinSrc = readFileSync(pinAbs, 'utf8');
  if (!c.pinPattern.test(pinSrc)) {
    die(`consumer "${c.name}": could not find the pinned hash in ${c.pin}\n` +
        `  Expected to match ${c.pinPattern}`);
  }
  const currentCopy = existsSync(destAbs) ? readFileSync(destAbs) : null;
  const currentPin = (pinSrc.match(c.pinPattern) || [])[2];
  const inSync = currentCopy && sha(currentCopy) === srcHash && currentPin === srcHash;

  planned.push({ c, destAbs, pinAbs, pinSrc, inSync });
  say(`  ${c.name.padEnd(8)} ${inSync ? 'already in sync' : 'NEEDS SYNC'}` +
      (currentCopy ? '' : '  (no vendored copy yet)'));
}

const stale = planned.filter((p) => !p.inSync);
if (CHECK) {
  if (stale.length) {
    die(`--check FAILED: ${stale.map((p) => p.c.name).join(', ')} out of sync with the contract.\n` +
        `  Run: node tools/sync-requirement-scope.mjs`);
  }
  say(`\n--check: ${planned.length} consumer(s) match the contract byte-for-byte.`);
  if (skipped.length) {
    say(`  (${skipped.join(', ')} not checked out - staleness there is UNVERIFIED by this run.\n` +
        `   Their own suites still gate the pinned hash, provenance and version.)`);
  }
  process.exit(0);
}

if (!stale.length && SKIP_TESTS) { say('\nnothing to do.'); process.exit(0); }

/* ---------- phase 2: WRITE, with a restore point for every file ---------- */
const backups = [];
const backupDir = BACKUP_DIR;

/* ⚠ A LEFTOVER BACKUP DIRECTORY MEANS AN EARLIER RUN DIED WITHOUT ROLLING
   BACK - killed, timed out, power cut. The consumers are then written but
   unverified, which is precisely the half-updated state this command exists to
   prevent, so refuse to start and hand over the recovery. Measured: running
   both consumers' FULL suites takes over eight minutes, which is long enough
   that a timeout kill is a realistic way to get here. */
if (existsSync(backupDir)) {
  die(`a previous sync did not finish - ${backupDir} still exists.\n` +
      `  The consumers may be written but UNVERIFIED. Recover with:\n` +
      `    node tools/sync-requirement-scope.mjs --restore\n` +
      `  or, if you are confident the current state is correct:\n` +
      `    rm -rf "${backupDir}" && node tools/sync-requirement-scope.mjs --check`);
}
const restoreAll = () => {
  for (const b of backups) {
    if (b.existed) copyFileSync(b.bak, b.file);
    else rmSync(b.file, { force: true });
  }
  rmSync(backupDir, { recursive: true, force: true });
};
const backup = (file) => {
  mkdirSync(backupDir, { recursive: true });
  const bak = join(backupDir, backups.length + '-' + file.split(/[\\/]/).pop());
  const existed = existsSync(file);
  if (existed) copyFileSync(file, bak);
  backups.push({ file, bak, existed });
};

/* ⚠ ROLL BACK ON A SIGNAL TOO. Without this, Ctrl-C or a CI timeout during the
   consumer suites leaves every consumer written and unverified - which is how
   this hazard was found, by a test run that exceeded its timeout mid-sync. */
let unwinding = false;
const onSignal = (sig) => {
  if (unwinding) return;
  unwinding = true;
  console.error(`\n${sig} during sync - restoring every touched file…`);
  try { restoreAll(); } catch (e) { console.error('  restore failed: ' + e.message); }
  process.exit(130);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => onSignal(sig));

try {
  say('');
  for (const p of planned) {
    mkdirSync(dirname(p.destAbs), { recursive: true });
    backup(p.destAbs);
    writeFileSync(p.destAbs, src);                       // byte-for-byte
    backup(p.pinAbs);
    writeFileSync(p.pinAbs, p.pinSrc.replace(p.c.pinPattern, `$1${srcHash}$3`), 'utf8');
    say(`  wrote ${p.c.name}: ${p.c.dest}  + pinned hash in ${p.c.pin}`);
  }

  // the copy must be byte-identical, verified by reading it back off disk
  for (const p of planned) {
    if (sha(readFileSync(p.destAbs)) !== srcHash) throw new Error(`${p.c.name}: written copy does not match the source`);
  }

  /* ---------- phase 3: PROVE IT, or put everything back ---------- */
  if (!SKIP_TESTS) {
    for (const p of planned) {
      say(`\n  running ${p.c.name} ${FULL ? 'FULL suite' : 'contract test'}…`);
      const [cmd, cmdArgs] = FULL ? p.c.fullTest : p.c.contractTest;
      execFileSync(cmd, cmdArgs, { cwd: p.c.root, stdio: 'inherit', shell: process.platform === 'win32' });
    }
    /* ⚠ The planner's own suite too - it is a consumer of its own contract.
       Default to the contract test: the full suites across three repos measured
       over eight minutes, long enough that a CI timeout kills the process
       mid-sync, which is exactly the half-updated state this guards against. */
    say(`\n  running the planner's own ${FULL ? 'suite' : 'contract test'}…`);
    const own = FULL ? ['npm', ['test', '--silent']] : ['node', ['--test', 'test/requirement-scope.test.mjs']];
    execFileSync(own[0], own[1], { cwd: PLANNER, stdio: 'inherit', shell: process.platform === 'win32' });
  }
} catch (e) {
  restoreAll();
  die(`SYNC FAILED - every file has been restored, nothing is half-updated.\n  ${e.message}`);
}

rmSync(backupDir, { recursive: true, force: true });
say(`\nsynced ${planned.length} consumer(s) to contract v${version}.`);
