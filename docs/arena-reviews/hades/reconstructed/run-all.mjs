/**
 * HADES (reconstructed) — run every test against a DISPOSABLE PostgreSQL.
 *
 * Loads the baseline schema, runs the baseline tests, then loads the patched
 * schema and runs the patched tests. Emits a machine-readable summary.
 *
 * Usage: node run-all.mjs [--migrations=<dir>] [--patched=<dir>]
 *   --migrations  directory of baseline migrations (default ../../mig)
 *   --patched     directory of baseline+patch migrations (default ../../migB)
 */
import { spawnSync } from 'node:child_process';
import { loadSchema } from './loader.mjs';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split('=')[1] : d;
};

// The CLASH migrations are NOT redistributed in this package (they are baseline
// source owned by the upstream repository). Point the runner at a checkout you
// already have, or at a working copy with the fixture overlay applied.
const MIG_BASE = resolve(arg('migrations', process.env.HADES_MIG || ''));
const MIG_PATCHED = resolve(arg('patched', process.env.HADES_MIG_PATCHED || ''));

for (const [label, dir] of [['--migrations / HADES_MIG', MIG_BASE], ['--patched / HADES_MIG_PATCHED', MIG_PATCHED]]) {
  if (!dir || !existsSync(dir) || readdirSync(dir).filter((f) => f.endsWith('.sql')).length === 0) {
    console.error(`missing or empty migration directory for ${label}: ${dir || '(unset)'}`);
    console.error('  pass --migrations=<dir> and --patched=<dir>, or set HADES_MIG / HADES_MIG_PATCHED.');
    console.error('  see docs/arena-reviews/hades/fixtures/README.md for how to build the overlay.');
    process.exit(2);
  }
}

const results = [];

function run(label, script, args, expectExit = 0) {
  const r = spawnSync(process.execPath, [resolve(HERE, script), ...args], {
    encoding: 'utf8', timeout: 600000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  const ok = r.status === expectExit;
  results.push({ label, script, args, exit: r.status, expected: expectExit, ok, summary: last });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} exit=${r.status} (expected ${expectExit})`);
  if (!ok) console.log('        ' + out.split('\n').slice(-12).join('\n        '));
  return { ok, out };
}

console.log('HADES (reconstructed) — full run\n');

// ── Phase 1: baseline schema (119 migrations, patch NOT applied) ──────────
console.log('loading baseline schema…');
let r = await loadSchema(MIG_BASE, { quiet: true });
console.log(`  applied ${r.applied}/${r.total}${r.failed.length ? ' — FAILURES: ' + r.failed.map((x) => x[0]).join(', ') : ''}\n`);
if (r.failed.length) { console.log('ABORT: baseline schema did not load cleanly.'); process.exit(1); }

console.log('baseline tests:');
run('01 cancelled-settlement invariant', 'tests/01-cancelled-settlement.mjs', ['--schema=baseline'], 0);
run('02 fighter-rewards (no fighter kinds)', 'tests/02-fighter-rewards.mjs', ['--schema=baseline'], 0);
run('03 concurrent settlement', 'tests/03-concurrent-settlement.mjs', [], 0);
run('04 clash->room lock order', 'tests/04-lock-order.mjs', [], 0);

// ── Phase 2: patched schema (baseline + fighter_rewards.patch) ────────────
console.log('\nloading patched schema…');
r = await loadSchema(MIG_PATCHED, { quiet: true });
console.log(`  applied ${r.applied}/${r.total}${r.failed.length ? ' — FAILURES: ' + r.failed.map((x) => x[0]).join(', ') : ''}\n`);
if (r.failed.length) { console.log('ABORT: patched schema did not load cleanly.'); process.exit(1); }

console.log('patched tests:');
run('02 fighter-rewards (policy applied)', 'tests/02-fighter-rewards.mjs', ['--schema=patched'], 0);
run('03 concurrent settlement', 'tests/03-concurrent-settlement.mjs', [], 0);
run('04 clash->room lock order', 'tests/04-lock-order.mjs', [], 0);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} suites passed`);

writeFileSync(resolve(HERE, 'results.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  engine: 'PostgreSQL 16.2 (disposable, pgserver)',
  baseline_migrations: 119,
  patched_migrations: 121,
  suites: results,
  passed: results.length - failed.length,
  failed: failed.length,
}, null, 2));
console.log('wrote results.json');
process.exit(failed.length ? 1 : 0);
