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
const CONSUMERS = [
  {
    name: 'viewer',
    root: resolve(PLANNER, '..', '..', 'GEN2 Visual Animator'),
    dest: join('viewer', 'js', 'vendor', 'requirement-scope.js'),
    pin: join('test', 'requirement-scope-vendor.test.mjs'),
    pinPattern: /(const PINNED_SHA256 = ')([0-9a-f]{64})(')/,
    test: ['npm', ['test', '--silent']],
  },
  // { name: 'site', root: …MODULITH, dest: 'src/lib/requirement-scope.js', … }
];

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const SKIP_TESTS = args.has('--skip-tests');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const say = (m) => console.log(m);
const die = (m) => { console.error('\n' + m); process.exit(1); };

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
for (const c of CONSUMERS) {
  if (!existsSync(c.root)) {
    die(`consumer "${c.name}" not found at ${c.root}\n` +
        `  All consumers must be present: a partial sync leaves the gates disagreeing.`);
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
  say('\n--check: every consumer matches the contract byte-for-byte.');
  process.exit(0);
}

if (!stale.length && SKIP_TESTS) { say('\nnothing to do.'); process.exit(0); }

/* ---------- phase 2: WRITE, with a restore point for every file ---------- */
const backups = [];
const backupDir = join(PLANNER, '.sync-backup');
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
      say(`\n  running ${p.c.name} suite…`);
      const [cmd, cmdArgs] = p.c.test;
      execFileSync(cmd, cmdArgs, { cwd: p.c.root, stdio: 'inherit', shell: process.platform === 'win32' });
    }
    say(`\n  running the planner's own suite…`);
    execFileSync('npm', ['test', '--silent'], { cwd: PLANNER, stdio: 'inherit', shell: process.platform === 'win32' });
  }
} catch (e) {
  restoreAll();
  die(`SYNC FAILED - every file has been restored, nothing is half-updated.\n  ${e.message}`);
}

rmSync(backupDir, { recursive: true, force: true });
say(`\nsynced ${planned.length} consumer(s) to contract v${version}.`);
