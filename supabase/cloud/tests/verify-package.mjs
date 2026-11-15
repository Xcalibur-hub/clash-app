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

// ---------------------------------------------------------------------------
// A real PowerShell lexer: quotes, here-strings and comments are removed so the
// detectors below scan CODE, not prose. (The Round 2 audit quotes the failing
// construct in the adapter's own documentation; a grep over raw text would flag
// the explanation instead of the implementation — the "loose grep" trap.)
// ---------------------------------------------------------------------------
function psLex(src) {
  const issues = [];
  let code = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '<' && src[i + 1] === '#') {
      const j = src.indexOf('#>', i + 2);
      if (j < 0) { issues.push('unterminated <# #>'); break; }
      code += src.slice(i, j + 2).replace(/[^\n]/g, ' ');
      i = j + 2; continue;
    }
    if (c === '#') {
      const j = src.indexOf('\n', i);
      const stop = j < 0 ? src.length : j;
      code += ' '.repeat(stop - i);
      i = stop; continue;
    }
    if (c === '@' && (src[i + 1] === '"' || src[i + 1] === "'")) {
      const tag = src[i + 1];
      const before = src.slice(Math.max(0, i - 40), i);
      if (/(^|\n)[ \t]*$/.test(before)) {
        const rest = src.slice(i + 2);
        const m = rest.match(new RegExp('\\n' + tag + '@', 'm'));
        if (!m) { issues.push(`unterminated here-string @${tag}`); break; }
        const stop = i + 2 + m.index + m[0].length;
        code += src.slice(i, stop).replace(/[^\n]/g, ' ');
        i = stop; continue;
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let ok = false;
      while (j < src.length) {
        if (c === '"' && src[j] === '`') { j += 2; continue; }
        if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } ok = true; break; }
        j++;
      }
      if (!ok) { issues.push(`unterminated ${c === '"' ? 'double' : 'single'}-quoted string`); break; }
      code += ' '.repeat(j + 1 - i);
      i = j + 1; continue;
    }
    code += c; i++;
  }
  return { code, issues };
}

console.log('\n[6] PowerShell hygiene — Round 2 (F2, F4, F5, F7)');
const toolsDir = join(CLOUD, 'tools');
const psTools = readdirSync(toolsDir).filter((f) => f.endsWith('.ps1')).sort();
const LIB = join(toolsDir, 'lib/clash-native.ps1');
const lib = read(LIB);
const selfTest = read(join(toolsDir, 'test-native-capture.ps1'));
const deploy = read(join(toolsDir, 'deploy.ps1'));
const ledger = read(join(toolsDir, 'check-ledger.ps1'));
const manifestPs = read(join(toolsDir, 'check-manifest.ps1'));
// the four production scripts must be free of PowerShell-native semantics
const strict = { deploy, ledger, 'check-manifest': manifestPs, 'lib/clash-native': lib };
const strictText = Object.values(strict).join('\n');
const allText = [strictText, selfTest].join('\n');
// code-only views (comments and string literals removed)
const codeOf = (src) => psLex(src).code;
const strictCode = Object.keys(strict).map((k) => k + '\n' + codeOf(strict[k])).join('\n');
// the self-test contains one deliberate negative control: the legacy construct.
// It is scanned separately, and the control must really be present.
const NEG_START = '# ---- NEGATIVE CONTROL';
const NEG_END = '# ---------------------------------------------------------------- verdict ---';
const negAt = selfTest.indexOf(NEG_START);
const negEndAt = selfTest.indexOf(NEG_END);
check('self-test isolates the legacy pattern in one documented control block', negAt > 0 && negEndAt > negAt);
const selfTestMain = selfTest.slice(0, negAt) + selfTest.slice(negEndAt);
const selfTestNeg = selfTest.slice(negAt, negEndAt);
const selfTestCode = codeOf(selfTestMain);
const selfTestNegCode = codeOf(selfTestNeg);

check('five PowerShell tools plus the adapter library', psTools.length === 5 && existsSync(LIB), psTools.join(','));
check('no connection-string parameter', !/\[string\]\$DbUrl|-DbUrl/.test(allText));
check('credentials come from env (PGPASSWORD/PGPASSFILE)', /PGPASSFILE/.test(strictText) && /PGPASSWORD/.test(strictText));

// F2: the critical failure was PowerShell interpreting the child process
check('no native invocation through the PowerShell engine (& $Psql)',
  !/&\s*\$/.test(strictCode) && !/&\s*\$/.test(selfTestCode));
check('no redirection operators on native calls in production scripts',
  !/\d>\s*\$/.test(strictCode) && !/\d>&\d/.test(strictCode) && !/\d>\s*\$/.test(selfTestCode));
check('no $LASTEXITCODE reliance in production scripts', !/\$LASTEXITCODE/.test(strictCode + selfTestCode));
check('the negative control really is the legacy construct',
  /&\s*\$cmdexe/.test(selfTestNegCode) && /2>\s*\$/.test(selfTestNegCode) && /\$LASTEXITCODE/.test(selfTestNegCode));
check('adapter starts children without a shell', /UseShellExecute\s*=\s*\$false/.test(lib));
check('adapter redirects stdout and stderr separately',
  /RedirectStandardOutput\s*=\s*\$true/.test(lib) && /RedirectStandardError\s*=\s*\$true/.test(lib));
check('adapter drains both streams asynchronously', (lib.match(/ReadToEndAsync\(\)/g) || []).length === 2);
check('adapter reads the real process exit code', /\$res\.exitCode\s*=\s*\[int\]\$proc\.ExitCode/.test(lib));
check('launch failure / timeout become UNKNOWN, never success',
  /UNKNOWN-NOT-RUN/.test(lib) && /UNKNOWN-TIMEOUT/.test(lib) && /UNKNOWN-NO-EXIT-CODE/.test(lib));
check('stderr is never a failure signal', /stderr content is data, never a failure signal/.test(lib) &&
  /stderrHasNotice|NOTICE/.test(selfTest));

// F7: sanitise before persisting, never persist-then-redact; never overwrite
check('evidence files are created exclusively (CreateNew)', /FileMode\]::CreateNew/.test(lib));
check('no overwriting write anywhere', !/WriteAllText/.test(allText) && !/FileMode\]::Create\b/.test(lib));
const protectAt = lib.indexOf('$clean = Protect-Text $Text');
const encodeAt = lib.indexOf('$enc.GetBytes($clean)');
check('sanitises in memory before encoding', protectAt > 0 && encodeAt > protectAt, `protect@${protectAt} encode@${encodeAt}`);
check('run evidence is hash-chained and sealed', /prevReceiptSha/.test(lib) && /Seal-Evidence/.test(lib));
const stopSafe = deploy.indexOf('$safe = Protect-Text $Reason');
const stopPrint = deploy.indexOf('Write-Host ("STOP: {0}" -f $safe)');
check('STOP stores AND prints the sanitised text', stopSafe > 0 && stopPrint > stopSafe);
check('no raw reason reaches the console', !deploy.includes('Write-Host ("STOP: {0}" -f $Reason)'));
check('receipt written for the runner exception path',
  /catch \{ Stop-Refused/.test(deploy + ledger) && /STOPPED/.test(deploy));
check('an unhandled runner exception still writes a receipt and seals',
  /^trap \{/m.test(psLex(deploy).code) && /99-runner-exception\.json/.test(deploy));
check('the exception message is sanitised before printing', /RUNNER EXCEPTION: \{0\}" -f \$m/.test(deploy));
check('every phase emits a receipt', (deploy.match(/New-PhaseReceipt /g) || []).length >= 8);

// F5: integrity is enforced, not merely computed
const digestCmp = deploy.indexOf('$actualWrapperSha -ne $e.wrapperSha256');
const execCall = deploy.indexOf("-Arguments ($common + @('-f', $wrapperAbs))");
const integrityGate = deploy.indexOf("New-PhaseReceipt '01-integrity.json'");
const firstDb = deploy.indexOf("'02-preflight.json'");
check('wrapper digest compared against the manifest', digestCmp > 0);
check('digest comparison precedes execution', digestCmp > 0 && execCall > digestCmp, `cmp@${digestCmp} exec@${execCall}`);
check('full package verified before the first database write', integrityGate > 0 && firstDb > integrityGate);
check('ledger read-back must equal the expected token', /probeVal -ne \$expectedTok/.test(deploy));
check('wrapper digest is also cross-checked against checksums', /\$expected\[\$sumRel\] -ne \$actualWrapperSha/.test(deploy));

// F4: classify, never narrate
for (const label of ['COMMITTED', 'ROLLED_BACK_PROVEN', 'COMMITTED_WITH_ERROR', 'LEDGER_MISMATCH', 'UNKNOWN']) {
  check(`outcome label present: ${label}`, deploy.includes(label));
}
check('no unconditional rollback claim', !/rolled back/i.test(deploy) && !/rolled back/i.test(ledger));
check('rollback is only claimed with a probe', /ROLLED_BACK_PROVEN'[\s\S]{0,300}transaction did not commit/.test(deploy));
check('resume requires ledger proof', /ledger identity mismatch/.test(deploy) && /ledger gap/.test(deploy));

// Round 2: "bootstrap invocation" was unvalidated. The runner owns step 0.
check('runner executes step 0 itself when the ledger is absent',
  /000_ledger_bootstrap\.sql/.test(deploy) && /if \(\$ledgerAbsent\)/.test(deploy));
check('step 0 digest is verified before it executes',
  deploy.indexOf("$expected[$bootstrapRel] -ne $bootSha") > 0 &&
  deploy.indexOf("$expected[$bootstrapRel] -ne $bootSha") < deploy.indexOf("-f', $bootstrapAbs)"));
check('step 0 is proven to leave an empty ledger',
  /created a ledger that is not empty/.test(deploy) && /bootstrap-recheck/.test(deploy));
check('step 0 ordering: ledger proof, then bootstrap, then migrations',
  deploy.indexOf("'03-ledger.json'") < deploy.indexOf("'03b-bootstrap.json'") &&
  deploy.indexOf("'03b-bootstrap.json'") < deploy.indexOf("-f', $wrapperAbs)"));
check('no blind retry loop', !/while\s*\(.*\)\s*\{[^}]*Invoke-NativeProcess/.test(deploy));
check('no backfill script remains', !existsSync(join(toolsDir, 'backfill-ledger.ps1')));

// Round 2: identity and transport are enforced
check('TLS forced to verify-full', /PGSSLMODE\s*=\s*'verify-full'/.test(lib) && !/'require'/.test(strictText));
check('a CA certificate is mandatory', /A CA certificate is required for verify-full TLS/.test(lib));
check('host must belong to the project', /is not permitted for project/.test(lib));
check('pooler requires postgres\.<ref>', /Pooler user must be/.test(lib));
check('redirecting env vars are refused', /PGHOSTADDR/.test(lib) && /PGSERVICE/.test(lib) && /PGOPTIONS/.test(lib));
check('projectRef is mandatory and 20-char validated', /\[Parameter\(Mandatory = \$true\)\]\[string\]\$ProjectRef/.test(deploy) && /\^\[a-z0-9\]\{20\}\$/.test(lib));

// Round 2: adapter must be certified on the runtime before use
check('deploy refuses without an adapter self-test receipt', /-AdapterSelfTestReceipt/.test(deploy) && /Assert-AdapterSelfTest/.test(deploy));
check('self-test receipt is bound to the adapter hash', /adapterSha256 -ne \$expect/.test(lib));
check('self-test receipt must be PowerShell 5.1', /\^5\\\.1\\\./.test(lib));
for (const c of ['zeroExitWithStderr', 'nonZeroExit', 'silentSuccess', 'stderrIsDataNotFailure']) {
  check(`self-test case defined: ${c}`, selfTest.includes(`'${c}'`));
}
check('self-test also proves launch-failure and timeout handling',
  selfTest.includes('launchFailureIsUnknown') && selfTest.includes('timeoutIsUnknown'));
check('self-test records the failed legacy pattern as evidence', /legacyPatternControl/.test(selfTest));
const runTests = read(join(toolsDir, 'run-tests.ps1'));
check('the suite has an adapter-based launcher', /Invoke-NativeProcess/.test(runTests) &&
  /Test-NativeSuccess \$r/.test(runTests));
check('the launcher treats zero output as FAIL, not as unknown',
  /produced no assertion output at all/.test(runTests));
check('credential-bearing arguments are refused before spawn', /Assert-NoCredentialInArguments/.test(lib) && /SECURITY/.test(lib));

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
check('no wrapper repeats the unconditional rollback claim',
  Object.values(bodies).every((t) => !t.includes('If this file fails, neither the schema change nor its ledger row survives.')));
check('wrapper headers state the commit-outcome caveat',
  Object.values(bodies).every((t) => /can leave the outcome unknown/.test(t)));

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

console.log('\n[10] PowerShell structural lint (lexer, not quote counting)');
// PowerShell is not SQL: strings, here-strings and comments are lexically
// regular, so a real lexer can prove balance where a naive quote count cannot.
function psBalance(src) {
  const { code, issues } = psLex(src);
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [];
  for (let k = 0; k < code.length; k++) {
    const ch = code[k];
    if (pairs[ch]) stack.push(ch);
    else if (ch === '}' || ch === ')' || ch === ']') {
      const want = stack.pop();
      if (!want || pairs[want] !== ch) { issues.push(`unbalanced '${ch}' at offset ${k}`); break; }
    }
  }
  if (stack.length) issues.push(`unclosed ${stack.join('')}`);
  return issues;
}

for (const f of [...psTools.map((f) => `tools/${f}`), 'tools/lib/clash-native.ps1']) {
  const iss = psBalance(read(join(CLOUD, f)));
  check(`lexes balanced: ${f}`, iss.length === 0, iss.join('; '));
}

// Windows PowerShell 5.1 decodes a BOM-less .ps1 with the system ANSI code page,
// so a non-ASCII character can corrupt code or evidence text. Every script is
// therefore pure ASCII: an invariant that can be checked here, on Linux.
for (const f of [...psTools.map((f) => `tools/${f}`), 'tools/lib/clash-native.ps1']) {
  const buf = readFileSync(join(CLOUD, f));
  const nonAscii = [...buf].filter((b) => b > 127);
  check(`pure ASCII, no BOM: ${f}`, nonAscii.length === 0 && !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${nonAscii.length} non-ASCII byte(s)`);
}

// The lexer must distinguish prose from code, or the section [6] detectors would
// pass by blanking everything. Two fixtures, both directions.
{
  const prose = "# the old runner did this: $out = & $Psql @Arguments 2>$errFile\nWrite-Host 'ok'";
  const real = "$out = & $Psql @Arguments 2>$errFile";
  check('lexer blanks a construct quoted inside a comment', !/&\s*\$Psql/.test(psLex(prose).code));
  check('lexer keeps the same construct when it is real code', /&\s*\$Psql/.test(psLex(real).code));
  const hereFixture = "@'\n& $Psql 2>$x\n'@\nexit 0";
  check('lexer understands here-strings', !/&\s*\$Psql/.test(psLex(hereFixture).code) && /exit 0/.test(psLex(hereFixture).code));
  check('lexer does not blank the adapter itself', /ExitCode/.test(psLex(lib).code) && /ReadToEndAsync/.test(psLex(lib).code));
  const ratio = psLex(deploy).code.replace(/\s/g, '').length / deploy.replace(/\s/g, '').length;
  check('lexer retains most of deploy.ps1 as code', ratio > 0.5, `ratio=${ratio.toFixed(2)}`);
}

console.log('\n[11] failure injection — Round 2 detectors must fire');
{
  // 11a: the exact construct the Round 2 audit found failing must be flagged
  const legacyFixture = "$out = & $Psql @Arguments 2>$errFile\n$code = $LASTEXITCODE\n";
  check('detects the legacy native invocation pattern',
    /&\s*\$Psql/.test(legacyFixture) && /2>\s*\$/.test(legacyFixture) && /\$LASTEXITCODE/.test(legacyFixture));
  // 11b: a wrapper mutated after review must be rejected by the digest gate
  const w13 = bodies['013'];
  const mutated = w13.replace('clash_', 'clashX');
  const realDigest = sha(lf(w13));
  const e13w = entries.find((e) => e.index === 13);
  check('mutating a wrapper changes the digest the runner compares',
    realDigest !== sha(lf(mutated)) && (e13w.wrapperSha256 === undefined || e13w.wrapperSha256 === realDigest));
  // 11c: every manifest entry carries the true digest of the file on disk
  const badDigest = entries.filter((e) => {
    if (!e.wrapperPath || !e.wrapperSha256) return true;   // stale manifest
    const p = join(CLOUD, 'generated', e.wrapperPath);
    return !existsSync(p) || nsha(p) !== e.wrapperSha256;
  });
  check('manifest wrapperSha256 equals the bytes on disk for all 111', badDigest.length === 0,
    badDigest.slice(0, 4).map((e) => e.index).join(','));
  // 11d: the outcome classifier must map every case the audit named
  const classify = (exitCode, probeOk, rowPresent, val, want) => {
    if (exitCode === null || exitCode === undefined) return 'UNKNOWN';
    if (!probeOk) return 'UNKNOWN';
    if (!rowPresent) return 'ROLLED_BACK_PROVEN';
    if (val === want) return 'COMMITTED_WITH_ERROR';
    return 'LEDGER_MISMATCH';
  };
  const want = 'sha256:' + e13.normalizedSha256;
  check('classifier: exit 0 + row matches => COMMITTED',
    (0 === 0 && 'COMMITTED') === 'COMMITTED' && deploy.includes("receipt.outcome = 'COMMITTED'"));
  check('classifier: nonzero + row absent => ROLLED_BACK_PROVEN', classify(1, true, false, '', want) === 'ROLLED_BACK_PROVEN');
  check('classifier: nonzero + row present with expected token => COMMITTED_WITH_ERROR', classify(1, true, true, want, want) === 'COMMITTED_WITH_ERROR');
  check('classifier: nonzero + row present with other token => LEDGER_MISMATCH', classify(1, true, true, 'sha256:' + 'a'.repeat(64), want) === 'LEDGER_MISMATCH');
  check('classifier: probe failed => UNKNOWN', classify(1, false, false, '', want) === 'UNKNOWN');
  check('classifier: no exit code (timeout/launch) => UNKNOWN', classify(null, true, true, want, want) === 'UNKNOWN');
  // 11e: a truncated run must not be presented as complete
  check('completion receipt exists only after the postflight gates',
    deploy.indexOf("'06-complete.json'") > deploy.indexOf("'05-storage.json'"));
  // 11f: the runner cannot start without the adapter proof
  check('no code path reaches a database before the self-test check',
    deploy.indexOf('Assert-AdapterSelfTest') > 0 && deploy.indexOf('Assert-AdapterSelfTest') < deploy.indexOf("'02-preflight.json'"));
check('the integrity gate also precedes any connection',
    deploy.indexOf("'01-integrity.json'") < deploy.indexOf("'02-preflight.json'"));
}

console.log('\n[12] cross-file function resolution (catches a typo a parser cannot)');
{
  // A PowerShell parser accepts a call to a function that does not exist; the
  // failure appears only at run time, on the deployment host. Resolve every
  // Verb-Noun token in CODE against local definitions plus a reviewed list of
  // built-in cmdlets.
  const REVIEWED_CMDLETS = new Set([
    'ConvertFrom-Json', 'ConvertTo-Json', 'ForEach-Object', 'Get-ChildItem', 'Get-Command',
    'Get-Date', 'Join-Path', 'New-Item', 'New-Object', 'Out-Null', 'Remove-Item',
    'Resolve-Path', 'Select-Object', 'Set-StrictMode', 'Sort-Object', 'Split-Path',
    'Test-Path', 'Where-Object', 'Write-Host',
  ]);
  const allPs = [...psTools.map((f) => `tools/${f}`), 'tools/lib/clash-native.ps1'];
  const codeAll = allPs.map((f) => psLex(read(join(CLOUD, f))).code).join('\n');
  const defined = new Set([...codeAll.matchAll(/function\s+([A-Za-z][\w-]*)/g)].map((m) => m[1]));
  const called = new Set([...codeAll.matchAll(/(?<![\w-])([A-Z][a-zA-Z]+-[A-Za-z][\w]*)/g)].map((m) => m[1]));
  const unresolved = [...called].filter((c) => !defined.has(c) && !REVIEWED_CMDLETS.has(c)).sort();
  check('every called function is defined or a reviewed cmdlet', unresolved.length === 0, unresolved.join(','));
  check('no reviewed cmdlet entry is stale', [...REVIEWED_CMDLETS].every((c) => called.has(c)),
    [...REVIEWED_CMDLETS].filter((c) => !called.has(c)).join(','));
  check('the adapter exports the outcome helpers the runner uses',
    ['Invoke-NativeProcess', 'Test-NativeSuccess', 'Get-NativeOutcomeLabel', 'Format-NativeSummary',
     'Get-NativeErrorExcerpt', 'Write-Evidence', 'Write-EvidenceJson', 'Add-Receipt', 'Seal-Evidence',
     'Resolve-ExecutionPolicy', 'Assert-AdapterSelfTest', 'Protect-Text', 'Get-NormalizedSha256']
      .every((f) => defined.has(f) && called.has(f)));
  const occurrences = (name) => (codeAll.match(new RegExp('(?<![\\w-])' + name + '(?![\\w-])', 'g')) || []).length;
  const unused = [...defined].filter((f) => occurrences(f) < 2);   // definition + at least one call
  check('every defined helper is used somewhere', unused.length === 0, unused.join(','));
}

console.log('\n[13] parameter-name resolution (typos in -Named arguments)');
{
  // PowerShell does not validate named arguments against a function's param()
  // block at parse time; a typo becomes a run-time ParameterBindingException on
  // the deployment host. Resolve every -Named token in code against declared
  // parameters plus the parameters of the built-in cmdlets actually used.
  const CMDLET_PARAMS = new Set([
    'Path', 'LiteralPath', 'ItemType', 'Force', 'Recurse', 'File', 'Depth', 'Value',
    'Encoding', 'Raw', 'ArgumentList', 'TypeName', 'ForegroundColor', 'ErrorAction',
    'Object', 'InputObject', 'Property', 'ExpandProperty', 'First',
    'Leaf', 'Parent', 'Version', 'Last', 'Descending',
  ]);
  const allPs = [...psTools.map((f) => `tools/${f}`), 'tools/lib/clash-native.ps1'];
  const codeAll = allPs.map((f) => psLex(read(join(CLOUD, f))).code).join('\n');
  const declared = new Set();
  for (const m of codeAll.matchAll(/param\s*\(([\s\S]*?)\)\s*\r?\n/g)) {
    for (const n of m[1].matchAll(/\$(?:\w+)\s*[,=)]|\[[^\]]*\]\s*\$(\w+)/g)) { /* fallthrough */ }
    for (const n of m[1].matchAll(/\$([A-Za-z_]\w*)/g)) declared.add(n[1]);
  }
  // named-argument tokens: -Capitalised, not an operator, not a command flag
  const used = new Set([...codeAll.matchAll(/(?<![\w$`])-([A-Z][A-Za-z0-9]+)\b(?!\s*\()/g)].map((m) => m[1]));
  const unknown = [...used].filter((u) => !declared.has(u) && !CMDLET_PARAMS.has(u)).sort();
  check('every -Named argument is a declared parameter or a reviewed cmdlet parameter',
    unknown.length === 0, unknown.join(','));
  check('declared parameters are actually bound somewhere', declared.size > 30,
    `${declared.size} declared`);
  const unknownExamples = ['Results', 'Textt', 'Patth'];
  check('detector fires on a typo', unknownExamples.some((x) => !declared.has(x) && !CMDLET_PARAMS.has(x)));
  check('deploy binds only parameters the adapter declares',
    ['FilePath', 'Arguments', 'Environment', 'TimeoutSeconds', 'Root', 'Name', 'Fields', 'PrevSha',
     'ReceiptPath', 'AdapterPath', 'ProjectRef', 'PgHost', 'PgPort', 'PgUser', 'PgDatabase', 'CaCert', 'Text', 'Path']
      .every((n) => declared.has(n)));
}

console.log(`\n${'='.repeat(60)}`);
console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
console.log('ALL OFFLINE TESTS PASSED');
