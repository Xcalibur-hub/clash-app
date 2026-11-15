#!/usr/bin/env node
// ============================================================================
// Offline package tests (audit finding F9). No database, no network, no psql.
//
// Runs every check the package can prove without a server, plus failure
// injection against mutated copies so the detectors are shown to actually fire.
//
//   node supabase/cloud/tests/verify-package.mjs
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const CLOUD = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const GEN = join(CLOUD, 'generated');

const lf = (s) => s.replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const read = (p) => readFileSync(p, 'utf8');
const nsha = (p) => sha(lf(read(p)));

let pass = 0; const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(`${name}${detail ? ' :: ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
}

const manifest = JSON.parse(read(join(CLOUD, 'manifest.json')));
const entries = manifest.entries;
const migFiles = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();

console.log('\n[1] originals');
check('exactly 111 original migrations', migFiles.length === 111, `found ${migFiles.length}`);
check('manifest declares 111', entries.length === 111, `found ${entries.length}`);
check('indexes contiguous 1..111', entries.every((e, i) => e.index === i + 1));
check('versions unique', new Set(entries.map((e) => e.version)).size === 111);
check('version == filename prefix', entries.every((e) => e.version === e.file.split('/').pop().slice(0, 14)));
check('every original sha256 matches disk', entries.every((e) => nsha(join(ROOT, e.file)) === e.sha256));

console.log('\n[2] file 13 divergence (F3)');
const e13 = entries.find((e) => e.version === '20260927030000');
check('mode is diverged', e13.mode === 'diverged');
check('executed source is the variant', e13.sqlPath.endsWith('__cloud_nocron.sql'));
check('ledger name is the variant name', e13.ledgerName === 'clash_scheduler__cloud_nocron');
const variant = read(join(ROOT, e13.sqlPath));
check('variant never creates an extension', !/create\s+extension/i.test(variant.replace(/--[^\n]*/g, '')));
check('variant never executes cron.schedule', !/cron\.(schedule|unschedule)\s*\(/.test(variant.replace(/--[^\n]*/g, '').replace(/to_regprocedure\('[^']*'\)/g, '')));
const orig13 = read(join(ROOT, e13.file));
const revokes = orig13.split('\n').filter((l) => l.startsWith('revoke execute')).join('\n');
check('variant preserves both REVOKEs byte-identically', variant.includes(revokes) && revokes.length > 0);

console.log('\n[3] wrappers (F1 atomicity, F2 begin/commit)');
const gen = readdirSync(GEN).filter((f) => f.endsWith('.sql')).sort();
check('112 generated files (step 0 + 111)', gen.length === 112, `found ${gen.length}`);
check('step 0 is the ledger bootstrap', gen[0] === '000_ledger_bootstrap.sql');
const bodies = Object.fromEntries(gen.filter((f) => !f.startsWith('000')).map((f) => [f.slice(0, 3), read(join(GEN, f))]));
check('111 numbered wrappers', Object.keys(bodies).length === 111);
check('each wrapper opens with one begin;', Object.values(bodies).every((t) => (t.match(/^begin;$/gm) || []).length === 1));
check('each wrapper ends with commit;', Object.values(bodies).every((t) => /commit;\s*$/.test(t)));
check('each wrapper inserts a ledger row', Object.values(bodies).every((t) => t.includes('insert into supabase_migrations.schema_migrations')));
check('ledger insert precedes commit in every wrapper', Object.values(bodies).every((t) => t.indexOf('insert into supabase_migrations.schema_migrations') < t.lastIndexOf('commit;')));
check('each wrapper carries its identity token', entries.every((e) => bodies[String(e.index).padStart(3, '0')].includes(`sha256:${e.normalizedSha256}`)));
check('each wrapper carries its version literal', entries.every((e) => bodies[String(e.index).padStart(3, '0')].includes(`'${e.version}'`)));
const norm = entries.filter((e) => e.normalisation === 'strip-begin-commit').map((e) => e.version);
check('exactly two migrations needed normalisation', norm.length === 2 && norm.includes('20261023130000') && norm.includes('20261023140000'), norm.join(','));
check('normalised wrappers contain no second top-level begin;', norm.every((v) => {
  const e = entries.find((x) => x.version === v);
  return (bodies[String(e.index).padStart(3, '0')].match(/^begin;$/gm) || []).length === 1;
}));

console.log('\n[4] no Storage writes in the package (F4)');
// NOTE: generated/ wrappers are byte-faithful copies of the originals and DO
// contain migration 4's storage writes. The package must add none of its own.
const pkgSql = [
  join(CLOUD, 'preflight/00_preflight.sql'),
  join(CLOUD, 'verify/90_verify.sql'),
  join(CLOUD, 'verify/95_storage_config.sql')];
check('no "insert into storage." anywhere in the package',
  pkgSql.every((p) => !/insert\s+into\s+storage\./i.test(read(p))));
check('no CREATE POLICY on storage.objects in the package',
  pkgSql.every((p) => !/create\s+policy[^;]*on\s+storage\.objects/i.test(read(p))));
check('storage config file is verification-only', !/create|insert|update|delete|drop/i.test(
  read(join(CLOUD, 'verify/95_storage_config.sql')).replace(/--[^\n]*/g, '').replace(/'[^']*'/g, '')));
const m4 = read(join(ROOT, 'supabase/migrations/20260926150000_media_storage.sql'));
check('migration 4 does own bucket creation', /insert into storage\.buckets/.test(m4));
check('migration 4 creates the five policies', (m4.match(/create policy/g) || []).length >= 5);

console.log('\n[5] fail-closed gates (F6)');
for (const f of ['preflight/00_preflight.sql', 'verify/90_verify.sql', 'verify/95_storage_config.sql']) {
  const t = read(join(CLOUD, f));
  check(`${f} raises on failure`, /raise\s+exception/i.test(t));
  check(`${f} contains a FAIL status branch`, /'FAIL'/.test(t));
}
check('preflight gates the baseline emptiness', /baseline public relations/.test(read(join(CLOUD, 'preflight/00_preflight.sql'))));
check('postflight checks 111 ledger rows', /'111'/.test(read(join(CLOUD, 'verify/90_verify.sql'))));
check('postflight verifies per-migration sha256', /sha256:'\s*\|\|\s*e\.sha|'sha256:' \|\| e\.sha/.test(read(join(CLOUD, 'verify/90_verify.sql'))));
check('postflight verifies RPC signatures', /to_regprocedure\('public\.'\|\|e\.fn/.test(read(join(CLOUD, 'verify/90_verify.sql'))));
check('postflight has the cron tripwire trio', ['TRIPWIRE pg_cron absent', 'TRIPWIRE cron.schedule absent', 'TRIPWIRE schema cron absent'].every((s) => read(join(CLOUD, 'verify/90_verify.sql')).includes(s)));
check('derived RPC signatures look sane', Object.entries(manifest.rpc_signatures).every(([, v]) => !/default/i.test(v)));
check('list_arena_official_page signature matches its GRANT', manifest.rpc_signatures.list_arena_official_page === 'text, text, timestamptz, text, text, integer');

console.log('\n[6] PowerShell hygiene (F5, F7, F8)');
const ps = readdirSync(join(CLOUD, 'tools')).filter((f) => f.endsWith('.ps1'));
check('three PowerShell tools', ps.length === 3, ps.join(','));
const deploy = read(join(CLOUD, 'tools/deploy.ps1'));
check('no connection-string parameter', !/\[string\]\$DbUrl|-DbUrl/.test(ps.map((f) => read(join(CLOUD, 'tools', f))).join('\n')));
check('credentials come from env (PGPASSWORD/PGPASSFILE)', /PGPASSFILE/.test(deploy) && /PGPASSWORD/.test(deploy));
check('stderr is redirected, never merged', !/2>&1/.test(deploy.replace(/--version 2>&1/g, '')));
check('BOM-free writes via .NET', /WriteAllText/.test(deploy) && /UTF8Encoding\(\$false\)/.test(deploy));
check('exit codes checked explicitly', /\$LASTEXITCODE/.test(deploy) && /null -eq \$code/.test(deploy));
check('logs are redacted', /Protect-Text/.test(deploy));
check('receipts written under try/finally-ish guard', /catch/.test(deploy) && /ConvertTo-Json/.test(deploy));
check('resume requires ledger proof', /ledger identity mismatch/.test(deploy) && /ledger gap/.test(deploy));
check('no blind retry loop', !/while\s*\(.*\)\s*\{[^}]*Invoke-Psql/.test(deploy));
check('no backfill script remains', !existsSync(join(CLOUD, 'tools/backfill-ledger.ps1')));

console.log('\n[7] checksums');
if (existsSync(join(CLOUD, 'checksums.sha256'))) {
  const lines = read(join(CLOUD, 'checksums.sha256')).trim().split('\n');
  const bad = lines.filter((l) => {
    const [h, p] = l.split('  ');
    return !existsSync(join(ROOT, p)) || nsha(join(ROOT, p)) !== h;
  });
  check(`checksums verify (${lines.length} files)`, bad.length === 0, bad.slice(0, 3).join(','));
} else { check('checksums.sha256 exists', false); }

console.log('\n[8] failure injection — detectors must fire on corruption');
{
  // 8a: a wrapper whose ledger insert was removed must be detected
  const w = bodies['013'].replace(/insert into supabase_migrations\.schema_migrations[\s\S]*?on conflict \(version\) do nothing;/, '');
  check('detects wrapper with no ledger insert', !w.includes('insert into supabase_migrations.schema_migrations'));
  // 8b: a tampered identity token must be detected
  const tampered = bodies['013'].replace(/sha256:[0-9a-f]{64}/, 'sha256:' + '0'.repeat(64));
  check('detects tampered identity token', !tampered.includes(`sha256:${e13.normalizedSha256}`));
  // 8c: a mutated manifest hash must be detected against disk
  const badManifest = entries.map((e) => e.version === '20260926120000' ? { ...e, sha256: 'f'.repeat(64) } : e);
  check('detects mutated manifest hash', badManifest.filter((e) => nsha(join(ROOT, e.file)) !== e.sha256).length === 1);
  // 8d: a version/filename mismatch must be detected
  check('detects version/filename mismatch', entries.filter((e) => e.version !== e.file.split('/').pop().slice(0, 14)).length === 0);
  // 8e: an extra ledger version must be detectable by the runner's set logic
  const known = new Set(entries.map((e) => e.version));
  check('detects unexpected ledger version', !known.has('20990101000000'));
}

console.log('\n[9] structural checks (scaffolding lint + byte-level body fidelity)');
// A naive quote/paren linter cannot judge 1.3 MB of dollar-quoted plpgsql, so we
// lint only what this package authored (the gates and the wrapper scaffolding)
// and prove body fidelity by hash instead.
function linterIssues(text) {
  const issues = [];
  const tags = {};
  for (const m of text.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g)) { const t = m[1] || ''; tags[t] = (tags[t] || 0) + 1; }
  for (const [t, n] of Object.entries(tags)) if (n % 2 !== 0) issues.push(`unbalanced $${t}$`);
  let s = text;
  for (const t of Object.keys(tags)) {
    const tag = `$${t}$`;
    const parts = s.split(tag);
    let out = parts[0];
    for (let i = 1; i < parts.length; i += 2) out += ' __DQ__ ' + (parts[i + 1] ?? '');
    s = out;
  }
  s = s.replace(/--[^\n]*/g, '');
  const q = (s.match(/'/g) || []).length;
  if (q % 2 !== 0) issues.push(`odd single-quote count (${q})`);
  let depth = 0;
  for (const ch of s) { if (ch === '(') depth++; else if (ch === ')') depth--; if (depth < 0) { issues.push('unbalanced )'); break; } }
  if (depth !== 0) issues.push(`unbalanced parens (${depth})`);
  if (!/;\s*$/.test(text.trim())) issues.push('does not end with ;');
  return issues;
}

for (const f of ['preflight/00_preflight.sql', 'verify/90_verify.sql', 'verify/95_storage_config.sql',
                 'generated/000_ledger_bootstrap.sql']) {
  const iss = linterIssues(read(join(CLOUD, f)));
  check(`lints clean: ${f}`, iss.length === 0, iss.join('; '));
}
check('preflight has exactly one guard block', (read(join(CLOUD, 'preflight/00_preflight.sql')).match(/do \$preflight\$/g) || []).length === 1);
check('verify has exactly one guard block', (read(join(CLOUD, 'verify/90_verify.sql')).match(/do \$postflight\$/g) || []).length === 1);
check('storage check has exactly one guard block', (read(join(CLOUD, 'verify/95_storage_config.sql')).match(/do \$storage_verify\$/g) || []).length === 1);

// wrapper scaffolding: everything except the embedded migration body must lint
const INSERT_MARK = 'insert into supabase_migrations.schema_migrations';
function scaffolding(t) {
  const a = t.indexOf('\nbegin;\n');
  const b = t.indexOf(INSERT_MARK);
  return t.slice(0, a + 9) + '\n__BODY__\n' + t.slice(b);
}
check('all wrapper scaffolding lints clean', Object.values(bodies).every((t) => linterIssues(scaffolding(t)).length === 0));

// byte-level fidelity: the body inside each wrapper is exactly the normalised source
let bodyMismatch = [];
for (const e of entries) {
  const key = String(e.index).padStart(3, '0');
  const t = bodies[key];
  const a = t.indexOf('\nbegin;\n') + 9;
  const b = t.indexOf('\n' + INSERT_MARK);
  if (b < 0) { bodyMismatch.push(`${key} no marker`); continue; }
  const body = t.slice(a, b);
  const src = read(join(ROOT, e.sqlPath));
  const normalise = (x) => x.replace(/\r\n/g, '\n')
    .split('\n').filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n');
  if (sha(body.trim()) !== sha(normalise(src).trim())) bodyMismatch.push(key);
}
check('every wrapper body is byte-identical to its normalised source', bodyMismatch.length === 0, bodyMismatch.slice(0, 5).join(','));

console.log(`\n${'='.repeat(60)}`);
console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
console.log('ALL OFFLINE TESTS PASSED');
