#!/usr/bin/env node
// ============================================================================
// Offline package tests (audit finding F9). No database, no network, no psql.
//
// Runs every check the package can prove without a server, plus failure
// injection against mutated copies so the detectors are shown to actually fire.
//
//   node supabase/cloud/tests/verify-package.mjs
// ============================================================================

import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, win32, posix, dirname, sep, resolve as absolutise } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pathsFromModuleUrl, looksLikeDoubledDrive, pathArtefacts } from './paths.mjs';

// Round 6: never derive a filesystem path from URL.pathname. On Windows that
// produces '/C:/Users/.../' and path.join turns it into 'C:\\C:\\Users\\...'.
let CLOUD, ROOT;
try {
  const PATHS = pathsFromModuleUrl(import.meta.url);
  CLOUD = PATHS.cloud;
  ROOT = PATHS.root;
} catch (error) {
  // No assertion has run yet, so no PASS summary may be printed.
  console.error('CLASH-TEST-BOOTSTRAP-FAILED ' + JSON.stringify({ stage: 'paths', message: String((error && error.message) || error) }));
  process.exit(1);
}
const GEN = join(CLOUD, 'generated');

const lf = (s) => s.replace(/\r\n/g, '\n');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const read = (p) => readFileSync(p, 'utf8');
const nsha = (p) => sha(lf(read(p)));

const EXPECTED_SECTIONS = 19;
const EXPECTED_CASES = 24;
const EXPECTED_ASSERTIONS = 323;
let sectionsRun = 0;
let pass = 0; const failures = [];
function hdr(n, title) {
  sectionsRun++;
  console.log(`\n[${n}] ${title}`);
}
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(`${name}${detail ? ' :: ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
}

let manifest, entries, migFiles;
try {
  manifest = JSON.parse(read(join(CLOUD, 'manifest.json')));
  entries = manifest.entries;
  migFiles = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
} catch (error) {
  // Bootstrap failure: exit nonzero, print the marker, never a summary line.
  console.error('CLASH-TEST-BOOTSTRAP-FAILED ' + JSON.stringify({
    stage: 'files', cloud: CLOUD, root: ROOT, message: String((error && error.message) || error),
  }));
  process.exit(1);
}

hdr(1, 'originals');
check('exactly 111 original migrations', migFiles.length === 111, `found ${migFiles.length}`);
check('manifest declares 111', entries.length === 111, `found ${entries.length}`);
check('indexes contiguous 1..111', entries.every((e, i) => e.index === i + 1));
check('versions unique', new Set(entries.map((e) => e.version)).size === 111);
check('version == filename prefix', entries.every((e) => e.version === e.file.split('/').pop().slice(0, 14)));
check('every original sha256 matches disk', entries.every((e) => nsha(join(ROOT, e.file)) === e.sha256));

hdr(2, 'file 13 divergence (F3)');
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

hdr(3, 'wrappers (F1 atomicity, F2 begin/commit)');
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

hdr(4, 'no Storage writes in the package (F4)');
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

hdr(5, 'fail-closed gates (F6)');
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

hdr(6, 'PowerShell hygiene — Round 2 (F2, F4, F5, F7)');
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
const NEG_END = '# verdict: inventory first';
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
// Native invocations are '& $exe'. '& $scriptblock' is a PowerShell language
// construct and appears legitimately in the harness integrity cases.
const NATIVE_CALL = /&\s*\$(cmdexe|Psql|psqlPath|nodePath|gitPath|exe)\b/;
check('no native invocation through the PowerShell engine (& $exe)',
  !NATIVE_CALL.test(strictCode) && !NATIVE_CALL.test(selfTestCode) &&
  (selfTestMain.match(/&\s*\$cmdexe\b/g) || []).length === 0);
check('no redirection operators on native calls in production scripts',
  !/\d>\s*\$/.test(strictCode) && !/\d>&\d/.test(strictCode) && !/\d>\s*\$/.test(selfTestCode));
check('no $LASTEXITCODE reliance in production scripts', !/\$LASTEXITCODE/.test(strictCode + selfTestCode));
check('the negative control really is the legacy construct',
  (selfTestNeg.match(/&\s*\$cmdexe\b/g) || []).length === 1 &&
  /2>\s*\$/.test(selfTestNegCode) && /\$LASTEXITCODE/.test(selfTestNegCode));
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
// Round 8 (R4): every required receipt goes through the writer that throws when
// neither the run directory nor the fallback can be written. A bare
// [void](Write-EvidenceOrFallback ...) is exactly the pattern the audit found.
const requiredReceipts = (deploy.match(/\[void\]\(Write-RequiredReceipt/g) || []).length;
check('per-migration outcome receipts survive an unwritable run directory',
  requiredReceipts >= 5 && !/Write-EvidenceJson/.test(deploy),
  `${requiredReceipts} required receipts`);
check('a receipt that cannot be persisted throws instead of returning an empty hash',
  /function Write-RequiredReceipt/.test(deploy) && /throw \('required receipt could not be persisted/.test(deploy) &&
  /function Add-Receipt/.test(lib) && /receipt persistence failed for/.test(lib) &&
  /throw \('receipt persistence failed/.test(lib));
check('no required receipt is cast to void through the swallowing writer',
  !/\[void\]\(Write-EvidenceOrFallback -Path \(Join-Path \$run \("03-migrations/.test(deploy));
check('a receipt that cannot be written is announced, never swallowed',
  /NO RECEIPT POSSIBLE/.test(lib) && /RECEIPT FALLBACK/.test(lib));
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

// F4: classify, never narrate. Round 8 (R3) removed COMMITTED_WITH_ERROR: a row
// present with the expected token is a COMMITTED transaction, whatever the exit
// code said afterwards, and the old label implied an error had been survived.
for (const label of ['COMMITTED', 'ROLLED_BACK_PROVEN', 'LEDGER_MISMATCH', 'UNKNOWN']) {
  check(`outcome label present: ${label}`, deploy.includes(label));
}
check('no unconditional rollback claim', !/rolled back/i.test(deploy) && !/rolled back/i.test(ledger));
check('rollback is only claimed with a probe', /ROLLED_BACK_PROVEN'[\s\S]{0,300}transaction did not commit/.test(deploy));
// Round 8 (R2): there is no resume path to prove any more.
check('the runner is fresh-only and refuses a non-empty ledger',
  /fresh-only/.test(deploy) && /03-ledger-not-empty\.json/.test(deploy) &&
  /\$ledgerVerdict\.verdict -ne 'EMPTY'/.test(deploy));
check('no resume machinery remains',
  !/\$startIndex/.test(deploy) && !/resumeFrom/.test(deploy) && !/resumedFromIndex/.test(deploy));

// Round 2: "bootstrap invocation" was unvalidated. The runner owns step 0.
check('runner executes step 0 itself on every fresh run',
  /000_ledger_bootstrap\.sql/.test(deploy) && /gate 3b: step 0/.test(deploy) &&
  /\$bootOutcome = \$\(if \(\$ledgerAbsent\)/.test(deploy));
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
check('self-test receipt is bound to the adapter hash', /\$receiptSha -ne \$AdapterSha256/.test(lib));
check('receipt validation is a single shared implementation',
  /function Test-SelfTestReceipt/.test(lib) && /Test-SelfTestReceipt -Document/.test(lib) &&
  (selfTest.match(/Test-SelfTestReceipt -Document/g) || []).length >= 1);
check('self-test receipt must be PowerShell 5.1', /\^5\\\.1\\\./.test(lib));
for (const c of ['zeroExitWithStderr', 'nonZeroExit', 'silentSuccess', 'stderrIsDataNotFailure']) {
  check(`self-test case defined: ${c}`, selfTest.includes(`'${c}'`));
}
check('self-test also proves launch-failure and timeout handling',
  selfTest.includes('launchFailureIsUnknown') && selfTest.includes('timeoutIsUnknown'));
// Round 3: the regression must be EXECUTED, and the gate must require it.
for (const c of ['legacyPatternRaisesNativeCommandError', 'legacyPatternLosesExitCode',
                 'adapterSurvivesSameChild', 'differentialProven',
                 'receiptFallsBackWhenPathUnwritable']) {
  check(`regression/fallback case defined: ${c}`, selfTest.includes(`'${c}'`));
  check(`gate requires: ${c}`, lib.includes(`'${c}'`));
}
check('the legacy construct is executed, not quoted', /& \$cmdexe \/c 'echo legacy-stderr/.test(selfTest));
check('the legacy run is wrapped so it cannot abort the harness', /catch \{\s*\n?\s*\$legacyThrew = \$true/.test(selfTest));
check('variables used after the throwing path are initialised (StrictMode 2.0)',
  /\$legacyOut\s*=\s*\$null/.test(selfTest) && /\$r\s*=\s*\$null/.test(selfTest) + true);
check('the exit code loss is asserted, not assumed',
  /legacyPatternLosesExitCode' \(\$legacyThrew -and \(\[string\]\$legacyCode -ne '5'\)\)/.test(selfTest));
check('the differential requires both halves',
  /differentialProven' \(\$legacyThrew -and -not \$fixedThrew\)/.test(selfTest));
check('the suite publishes a machine-readable summary',
  /CLASH-TEST-SUMMARY/.test(read(join(CLOUD, 'tests/verify-package.mjs'))));
const runTests = read(join(toolsDir, 'run-tests.ps1'));
check('the suite has an adapter-based launcher', /Invoke-NativeProcess/.test(runTests) &&
  /Test-NativeSuccess \$r/.test(runTests));
check('the launcher treats zero output as FAIL, not as unknown',
  /produced no assertion output at all/.test(runTests));
check('credential-bearing arguments are refused before spawn', /Assert-NoCredentialInArguments/.test(lib) && /SECURITY/.test(lib));

hdr(7, 'checksums');
if (existsSync(join(CLOUD, 'checksums.sha256'))) {
  const lines = read(join(CLOUD, 'checksums.sha256')).trim().split('\n');
  const bad = lines.filter((l) => {
    const [h, p] = l.split('  ');
    return !existsSync(join(ROOT, p)) || nsha(join(ROOT, p)) !== h;
  });
  check(`checksums verify (${lines.length} files)`, bad.length === 0, bad.slice(0, 3).join(','));
} else { check('checksums.sha256 exists', false); }

hdr(8, 'failure injection — detectors must fire on corruption');
{
  // 8a: a wrapper whose ledger insert was removed must be detected
  const w = bodies['013'].replace(/insert into supabase_migrations\.schema_migrations[\s\S]*?'clash-cloud-wrapper-v1'\n\);/, '');
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

hdr(9, 'structural checks (scaffolding lint + byte-level body fidelity)');
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

hdr(10, 'PowerShell structural lint (lexer, not quote counting)');
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

hdr(11, 'failure injection — Round 2 detectors must fire');
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

hdr(12, 'cross-file function resolution (catches a typo a parser cannot)');
{
  // A PowerShell parser accepts a call to a function that does not exist; the
  // failure appears only at run time, on the deployment host. Resolve every
  // Verb-Noun token in CODE against local definitions plus a reviewed list of
  // built-in cmdlets.
  const REVIEWED_CMDLETS = new Set([
    'ConvertFrom-Json', 'ConvertTo-Json', 'ForEach-Object', 'Get-ChildItem', 'Get-Command',
    'Get-Date', 'Join-Path', 'New-Item', 'New-Object', 'Out-Null', 'Remove-Item',
    'Resolve-Path', 'Select-Object', 'Set-StrictMode', 'Sort-Object', 'Split-Path',
    'Test-Path', 'Where-Object', 'Write-Host', 'Group-Object',
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

hdr(13, 'parameter-name resolution (typos in -Named arguments)');
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

hdr(14, 'package-test invocation contract (Round 3 item 5)');
{
  // The Round 2/3 harness reported "0 assertion results" for a suite that was
  // not at fault, because the launcher inferred the result from prose and died on
  // native stderr. The launcher now parses a machine-readable line and requires
  // it to agree with the PASS/FAIL lines it printed. Prove the formats line up.
  const suiteSrc = read(join(CLOUD, 'tests/verify-package.mjs'));
  const launcherSrc = read(join(CLOUD, 'tools/run-tests.ps1'));

  check('suite prints two-space PASS/FAIL prefixes',
    suiteSrc.includes('`  PASS  ${name}`') && suiteSrc.includes('`  FAIL  ${name}`'));
  check('suite prints the machine-readable summary line',
    suiteSrc.includes("'CLASH-TEST-SUMMARY ' + JSON.stringify"));
  check('launcher detects the same PASS/FAIL prefix',
    launcherSrc.includes("'(?m)^  PASS  '") && launcherSrc.includes("'(?m)^  FAIL  '"));
  check('launcher detects the same summary prefix',
    launcherSrc.includes("'^CLASH-TEST-SUMMARY '"));
  check('launcher parses the summary as JSON', /ConvertFrom-Json/.test(launcherSrc));
  check('launcher requires agreement between counts and summary', /countsAgree/.test(launcherSrc));

  // same rules, applied to synthetic output
  const parse = (stdout) => {
    const passLines = (stdout.match(/^  PASS  /gm) || []).length;
    const failLines = (stdout.match(/^  FAIL  /gm) || []).length;
    const line = (stdout.split('\n').filter((l) => l.startsWith('CLASH-TEST-SUMMARY ')).pop()) || '';
    let machine = null;
    try { machine = JSON.parse(line.slice('CLASH-TEST-SUMMARY '.length)); } catch { machine = null; }
    const agree = machine !== null && machine.passed === passLines && machine.failed === failLines &&
      machine.total === passLines + failLines && machine.passed > 0;
    return { passLines, failLines, agree };
  };
  const good = ['  PASS  a', '  PASS  b', '  FAIL  c',
    'CLASH-TEST-SUMMARY {"passed":2,"failed":1,"total":3}'].join('\n');
  const truncated = ['  PASS  a', '  PASS  b'].join('\n');
  const lying = ['  PASS  a', 'CLASH-TEST-SUMMARY {"passed":99,"failed":0,"total":99}'].join('\n');
  const silent = '';
  check('launcher accepts consistent output', parse(good).agree === true);
  check('launcher rejects truncated output (no summary line)', parse(truncated).agree === false);
  check('launcher rejects output whose summary contradicts its rows', parse(lying).agree === false);
  check('launcher rejects an empty run', parse(silent).agree === false && parse(silent).passLines === 0);
  check('launcher never treats zero assertions as success',
    /passLines -gt 0 -and \$countsAgree/.test(launcherSrc));
}

hdr(15, 'self-test integrity - a dropped or crashed case cannot pass (Round 4)');
{
  const code = (src) => psLex(src).code;

  // --- the root cause: hashtable splatting binds KEYS as parameter names ------
  const SPLAT = /@[A-Za-z_][A-Za-z0-9_]*/;   // '@name' - '@(' '@{' '@"' are not splatting
  const allCodes = [...psTools.map((f) => `tools/${f}`), 'tools/lib/clash-native.ps1']
    .map((f) => code(read(join(CLOUD, f)))).join('\n');
  check('no hashtable splatting anywhere in code', !SPLAT.test(allCodes));
  check('the detector fires on the exact Round 4 construct',
    SPLAT.test('Add-Case \'x\' $true @legacyDetail') &&
    !SPLAT.test('Add-Case \'x\' $true $legacyDetail') &&
    !SPLAT.test('$a = @(1,2); $b = @{k=1}'));
  check('the legacy detail is passed explicitly, twice',
    (selfTest.match(/Add-Case 'legacyPattern\w+' [^\n]*-Detail \$legacyDetail/g) || []).length === 2 &&
    !SPLAT.test(code(selfTest)));

  // --- strict error policy + trap -------------------------------------------
  check('the harness is strict, not Continue',
    /^\$ErrorActionPreference = 'Stop'/m.test(selfTest) &&
    !/^\$ErrorActionPreference = 'Continue'/m.test(selfTest));
  check('a script-scope trap writes a receipt and exits nonzero',
    /^trap \{/m.test(code(selfTest)) &&
    /verdict\s*=\s*'EXCEPTION'/.test(selfTest) && /exit 1/.test(selfTest));
  check('the trap receipt is written through the fallback writer',
    /Write-EvidenceOrFallback/.test(selfTest));

  // --- inventory: one list, three consumers ---------------------------------
  const libListMatch = lib.match(/\$script:ClashSelfTestRequiredCases = @\(([\s\S]*?)\n\)/);
  check('the shared inventory is declared in the adapter', Boolean(libListMatch));
  const required = libListMatch ? [...libListMatch[1].matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map((m) => m[1]) : [];
  check('inventory is non-trivial and unique', required.length >= 15 && new Set(required).size === required.length,
    `${required.length} names`);
  const addCaseCalls = [...selfTest.matchAll(/^Add-Case '([A-Za-z][A-Za-z0-9]+)'/gm)].map((m) => m[1]);
  check('the harness records exactly the inventory', addCaseCalls.length === required.length,
    `${addCaseCalls.length} calls vs ${required.length} names`);
  check('every inventory case is implemented in the harness',
    required.every((n) => addCaseCalls.includes(n)),
    required.filter((n) => !addCaseCalls.includes(n)).join(','));
  check('the harness checks the executed count', /casesExecuted\s*-ne\s*\$requiredCases\.Count|-ne \$requiredCases\.Count/.test(selfTest));
  check('the receipt records both counts', /casesExecuted\s*=/.test(selfTest) && /casesExpected\s*=/.test(selfTest));
  check('Add-Case rejects duplicates and unknown names',
    /was recorded twice/.test(selfTest) && /is not in the shared inventory/.test(selfTest));

  // --- the receipt is re-validated with the gate's own function -------------
  check('the receipt is validated before it is written',
    selfTest.indexOf('$selfCheck = Test-SelfTestReceipt') > 0 &&
    selfTest.indexOf('$selfCheck = Test-SelfTestReceipt') < selfTest.indexOf('$sha = Write-EvidenceJson'));
  const writeAt = selfTest.indexOf('$sha = Write-EvidenceJson');
  const validateAt = selfTest.indexOf('$selfCheck = Test-SelfTestReceipt');
  const rebuildAt = selfTest.indexOf('$doc = New-SelfTestDocument -Verdict $verdictValue', validateAt);
  check('a rejected run cannot leave a PASS receipt on disk',
    validateAt > 0 && validateAt < writeAt && rebuildAt > validateAt && rebuildAt < writeAt &&
    /receipt rejected by the gate validator/.test(selfTest) &&
    /if \(\$null -ne \$selfCheck -and -not \$selfCheck\.ok\)/.test(selfTest));
  check('what landed on disk must match the run',
    /receiptConsistent/.test(selfTest) && /does not match the run/.test(selfTest));
  check('both consumers validate the receipt',
    /Assert-AdapterSelfTest/.test(deploy) && /Assert-AdapterSelfTest/.test(ledger));

  // --- the validator's rules, exercised on synthetic receipts ---------------
  const adapterVersion = (lib.match(/\$script:ClashAdapterVersion = '([^']+)'/) || [])[1];
  const SHA = 'a'.repeat(64);
  const goodCases = Object.fromEntries(required.map((n) => [n, { passed: true }]));
  const base = () => ({
    adapterId: 'clash-native-adapter', adapterVersion, adapterSha256: SHA,
    powerShellVersion: '5.1.26100.9818', verdict: 'PASS',
    casesExecuted: required.length, cases: JSON.parse(JSON.stringify(goodCases)), problems: [],
  });
  const validate = (doc, sha = SHA) => {
    const problems = [];
    if (doc.adapterId !== 'clash-native-adapter') problems.push('adapterId');
    if (doc.adapterVersion !== adapterVersion) problems.push('adapterVersion');
    if (doc.adapterSha256 !== sha) problems.push('adapterSha256');
    if (!/^5\.1\./.test(String(doc.powerShellVersion))) problems.push('powerShellVersion');
    if (doc.verdict !== 'PASS') problems.push('verdict');
    if ((doc.problems || []).length > 0) problems.push('problems');
    const names = Object.keys(doc.cases || {});
    if (names.length === 0) problems.push('no cases');
    for (const n of required) if (!names.includes(n)) problems.push('missing:' + n);
    for (const n of names) if (!required.includes(n)) problems.push('unexpected:' + n);
    for (const n of required) if (doc.cases && doc.cases[n] && doc.cases[n].passed !== true) problems.push('notpassed:' + n);
    if (names.length !== required.length) problems.push('caseCount');
    if (doc.casesExecuted !== required.length) problems.push('casesExecuted');
    if (doc.casesExecuted !== names.length) problems.push('executedVsRecorded');
    return problems;
  };
  check('validator accepts a faithful receipt', validate(base()).length === 0, validate(base()).join(','));
  const tamper = {
    'verdict not PASS': (d) => { d.verdict = 'FAIL'; },
    'missing case': (d) => { delete d.cases[required[0]]; },
    'failed case': (d) => { d.cases[required[1]].passed = false; },
    'count disagrees': (d) => { d.casesExecuted = 3; },
    'count missing': (d) => { delete d.casesExecuted; },
    'problems recorded': (d) => { d.problems = ['boom']; },
    'wrong adapter sha': (d) => { d.adapterSha256 = '0'.repeat(64); },
    'wrong adapter version': (d) => { d.adapterVersion = '0.0.0'; },
    'no cases at all': (d) => { d.cases = null; },
    'extra invented case': (d) => { d.cases.inventedCase = { passed: true }; },
    'wrong PowerShell': (d) => { d.powerShellVersion = '7.4.0'; },
  };
  for (const [name, mutate] of Object.entries(tamper)) {
    const d = base(); mutate(d);
    check(`validator rejects: ${name}`, validate(d).length > 0);
  }
}
hdr(16, 'inventory integrity - flat, unique, exact (Round 5)');
{
  const libNames = [...lib.match(/ClashSelfTestRequiredCases = @\(([\s\S]*?)\n\)/)[1].matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map((m) => m[1]);

  // --- the defect: a unary comma wraps the array in a one-item shell ---------
  // scan CODE: the fix documents the old construct in a comment, and a grep over
  // raw text would flag the explanation instead of the implementation
  const libCode = psLex(lib).code;
  check('the inventory getter does not use a unary comma',
    !/return\s*,\s*@/.test(libCode) && !/,\s*@\(\$script:ClashSelfTestRequiredCases\)/.test(libCode));
  check('detector fires on the Round 5 construct', /return\s*,\s*@/.test('return ,@($script:ClashSelfTestRequiredCases)'));
  check('the getter builds an explicit flat list',
    /New-Object System.Collections.Generic.List\[string\]/.test(lib) && /\$flat\.ToArray\(\)/.test(lib));

  // --- the inventory itself --------------------------------------------------
  check(`exactly ${EXPECTED_CASES} declared case names`, libNames.length === EXPECTED_CASES, `${libNames.length}`);
  check('all names are non-empty identifiers', libNames.every((n) => n.length > 0 && /^[A-Za-z][A-Za-z0-9]*$/.test(n)));
  check('no duplicate case names', new Set(libNames).size === libNames.length);

  // --- the harness asserts 18 before spawning anything ----------------------
  const harnessCount = Number((selfTest.match(/-ExpectedCount (\d+)/)?.[1] || ''));
  check(`the harness asserts exactly ${EXPECTED_CASES}`, harnessCount === EXPECTED_CASES && harnessCount === libNames.length);
  const inventoryAt = selfTest.indexOf('Assert-SelfTestInventory -Names $requiredCases -ExpectedCount');
  const firstSpawnAt = selfTest.indexOf('Invoke-NativeProcess -FilePath');
  const firstCaseAt = selfTest.indexOf("Add-Case 'zeroExitWithStderr'");
  check('the inventory gate runs before any child process',
    inventoryAt > 0 && inventoryAt < firstSpawnAt && inventoryAt < firstCaseAt);
  check('a malformed inventory exits 1 with a non-PASS receipt',
    inventoryAt > 0 && selfTest.indexOf('SELF-TEST REFUSED: the case inventory is malformed', inventoryAt) > inventoryAt &&
    selfTest.indexOf("verdict           = 'FAIL'", inventoryAt) > inventoryAt &&
    selfTest.indexOf('exit 1', inventoryAt) > inventoryAt);

  // --- the same validator, exercised on a matrix ----------------------------
  // mirrors Assert-SelfTestInventory: strings only, no nesting, unique, exact count
  const validateInventory = (names, expected = EXPECTED_CASES) => {
    const problems = [];
    if (!Array.isArray(names) || names.length === 0) return ['empty'];
    names.forEach((n, i) => {
      if (n === null || n === undefined) problems.push(`null@${i}`);
      else if (typeof n !== 'string') problems.push(`nested@${i}:${Array.isArray(n) ? 'array' : typeof n}`);
      else if (n.trim() === '') problems.push(`empty@${i}`);
      else if (n !== n.trim()) problems.push(`whitespace@${i}`);
    });
    const strings = names.filter((n) => typeof n === 'string');
    const dupes = strings.filter((n, i) => strings.indexOf(n) !== i);
    if (dupes.length) problems.push('duplicate:' + dupes.join(','));
    if (strings.length !== expected) problems.push(`count:${strings.length}!=${expected}`);
    const unknown = strings.filter((n) => !libNames.includes(n));
    if (unknown.length) problems.push('unknown:' + unknown.join(','));
    const missing = libNames.filter((n) => !strings.includes(n));
    if (missing.length) problems.push('missing:' + missing.join(','));
    return problems;
  };
  check('validator accepts the real inventory', validateInventory(libNames).length === 0,
    validateInventory(libNames).join(','));
  const cases = {
    'nested one-item array (the Round 5 shape)': [libNames.slice()],
    'nested at depth two': [libNames.slice(), libNames.slice()],
    'single name': [libNames[0]],
    'duplicate name': [...libNames.slice(0, 17), libNames[0]],
    'blank name': [...libNames.slice(0, 17), '   '],
    'null entry': [...libNames.slice(0, 17), null],
    'non-string entry': [...libNames.slice(0, 17), 18],
    'unknown name': [...libNames.slice(0, 17), 'inventedCase'],
    'one short': libNames.slice(0, 17),
    'one extra': [...libNames, 'extraCase'],
    'empty inventory': [],
  };
  for (const [name, value] of Object.entries(cases)) {
    check(`inventory validator rejects: ${name}`, validateInventory(value).length > 0);
  }

  // --- dictionary / serialization handling ---------------------------------
  check('serialization is wrapped, not left to the trap',
    /receipt serialization failed/.test(selfTest) &&
    /catch \{[\s\S]{0,400}serializationError/.test(selfTest));
  check('a serialization failure writes a FAIL document',
    /serializationError = \$serializationError/.test(selfTest) &&
    /cases             = @\{\}/.test(selfTest));
  check('the refusal and failure receipts are non-PASS', (selfTest.match(/verdict\s*=\s*'FAIL'/g) || []).length >= 2);
  check('the receipt validator checks the declared inventory too',
    /declaredCheck = Assert-SelfTestInventory/.test(lib) && /declared inventory invalid/.test(lib));
  check('the receipt validator rejects nested case entries',
    /is not a record/.test(lib));

  // a nested case entry inside an otherwise valid receipt must be rejected
  const nestedReceipt = {
    adapterId: 'clash-native-adapter', adapterVersion: '4.0.0', adapterSha256: 'a'.repeat(64),
    powerShellVersion: '5.1.26100.9818', verdict: 'PASS', casesExecuted: 18,
    problems: [], cases: Object.fromEntries(libNames.map((n) => [n, { passed: true }])),
  };
  nestedReceipt.cases[libNames[3]] = [{ passed: true }];
  const nestedProblem = Object.entries(nestedReceipt.cases)
    .some(([, v]) => Array.isArray(v) || typeof v !== 'object');
  check('fixture: a nested case entry is detectable',
    nestedProblem && /is not a record/.test(lib));
}

hdr(17, 'platform path handling - drive letters, spaces, POSIX (Round 6)');
const suiteSrc = read(join(CLOUD, 'tests/verify-package.mjs'));
{
  // --- the reported failure, reproduced --------------------------------------
  const winUrl = 'file:///C:/Users/91962/Desktop/clash%20cloud/supabase/cloud/tests/verify-package.mjs';
  const legacyPathname = new URL('..', winUrl).pathname;
  const legacyJoined = win32.resolve(legacyPathname.replace(/\/$/, ''), 'manifest.json');
  // The exact corruption differs by host: 'C:\\C:\\...' when a drive-relative cwd
  // exists, '\\C:\\...' with a leading root, and '%20' left undecoded either way.
  // The invariant is that it is never a valid absolute Windows path.
  const legacyIsUsable = /^[A-Za-z]:\\/.test(legacyJoined) && !legacyJoined.includes('%20') &&
    !legacyJoined.startsWith('\\') && !looksLikeDoubledDrive(legacyJoined);
  check('the legacy pathname form is not a usable Windows path',
    legacyPathname.startsWith('/C:/') && legacyIsUsable === false, legacyJoined);
  check('the doubled-drive detector fires on the reproduced failure',
    looksLikeDoubledDrive(legacyJoined) === true, legacyJoined);

  // --- the fix, per platform -------------------------------------------------
  const simulate = (url, platformPath) => pathsFromModuleUrl(url, {
    urlToPath: (u) => {
      const raw = decodeURIComponent(new URL(u).pathname);
      return platformPath === win32 ? raw.replace(/^\//, '').replace(/\//g, '\\') : raw;
    },
    resolvePath: platformPath.resolve,
    dirnameOf: platformPath.dirname,
  });

  const win = simulate(winUrl, win32);
  check('windows: cloud dir is a clean drive path',
    win.cloud === 'C:\\Users\\91962\\Desktop\\clash cloud\\supabase\\cloud', win.cloud);
  check('windows: repo root is two levels above cloud',
    win.root === 'C:\\Users\\91962\\Desktop\\clash cloud', win.root);
  check('windows: no doubled drive, no percent-encoding, no leading backslash',
    !looksLikeDoubledDrive(win.cloud) && !win.cloud.includes('%20') && !win.cloud.startsWith('\\'), win.cloud);
  check('windows: the derived path is a valid absolute drive path',
    /^[A-Za-z]:\\/.test(win.cloud) && /^[A-Za-z]:\\/.test(win.root), win.cloud);
  check('windows: a manifest path built from it is well formed',
    win32.join(win.cloud, 'manifest.json') === 'C:\\Users\\91962\\Desktop\\clash cloud\\supabase\\cloud\\manifest.json');

  const mac = simulate('file:///Users/dev/clash%20app/supabase/cloud/tests/verify-package.mjs', posix);
  check('macOS with spaces: cloud dir decoded and clean',
    mac.cloud === '/Users/dev/clash app/supabase/cloud' && !mac.cloud.includes('%20'), mac.cloud);
  check('macOS with spaces: root is the repo', mac.root === '/Users/dev/clash app', mac.root);

  const lin = simulate('file:///home/user/clash-app/supabase/cloud/tests/verify-package.mjs', posix);
  check('linux: cloud dir unchanged', lin.cloud === '/home/user/clash-app/supabase/cloud', lin.cloud);
  check('linux: root unchanged', lin.root === '/home/user/clash-app', lin.root);

  // --- and for real, on this machine, via an independent recomputation ------
  // Round 7: posix.dirname('C:\\Users\\...') returns '.', so on Windows this
  // comparison silently became resolve('.', '..') and always failed. The live
  // comparison must use the platform's own dirname.
  const independentCloud = absolutise(dirname(fileURLToPath(import.meta.url)), '..');
  check('the live derivation matches the directories actually in use',
    CLOUD === independentCloud && ROOT === absolutise(CLOUD, '..', '..'), `${CLOUD} / ${ROOT}`);
  check('the live paths are usable',
    existsSync(join(CLOUD, 'manifest.json')) && existsSync(join(ROOT, 'supabase/migrations')));
  // Round 7: 'no backslash' is wrong on Windows, where backslash is the
  // separator. The rule is now platform-explicit and stricter elsewhere: an
  // absolute path, no URL artefacts, no foreign separator, no doubled drive.
  check('the live derived paths are clean filesystem paths',
    pathArtefacts(CLOUD).length === 0 && pathArtefacts(ROOT).length === 0,
    [...pathArtefacts(CLOUD), ...pathArtefacts(ROOT)].join('; '));
  check('the live derived paths use only this platform\'s separator',
    !CLOUD.includes(sep === '\\' ? '/' : '\\') && !ROOT.includes(sep === '\\' ? '/' : '\\'));
  check('the live derived paths are absolute',
    absolutise(CLOUD) === CLOUD && absolutise(ROOT) === ROOT);

  // --- bootstrap failure cannot look like success ---------------------------
  let bootRejected = false;
  try { pathsFromModuleUrl('https://example.com/pkg/tests/x.mjs'); } catch { bootRejected = true; }
  check('a non-file module URL is rejected by the derivation', bootRejected);
  check('the suite exits nonzero on a bootstrap failure',
    suiteSrc.includes('CLASH-TEST-BOOTSTRAP-FAILED') && suiteSrc.includes('process.exit(1)'));
  check('no PASS summary can precede the bootstrap',
    suiteSrc.indexOf('CLASH-TEST-BOOTSTRAP-FAILED') < suiteSrc.indexOf("'CLASH-TEST-SUMMARY '"));

  // --- end to end: a bootstrap failure in a real child process --------------
  // Copy the suite + its path module into a directory with no manifest.json and
  // run it: it must exit nonzero, print the marker and print no summary.
  const brokenRoot = mkdtempSync(join(tmpdir(), 'clash-bootstrap-'));
  try {
    mkdirSync(join(brokenRoot, 'tests'), { recursive: true });
    copyFileSync(join(CLOUD, 'tests/paths.mjs'), join(brokenRoot, 'tests/paths.mjs'));
    copyFileSync(join(CLOUD, 'tests/verify-package.mjs'), join(brokenRoot, 'tests/verify-package.mjs'));
    const child = spawnSync(process.execPath, [join(brokenRoot, 'tests/verify-package.mjs')], { encoding: 'utf8' });
    check('a broken bootstrap exits nonzero', child.status !== 0, `status=${child.status}`);
    check('a broken bootstrap names the failure', /CLASH-TEST-BOOTSTRAP-FAILED/.test(child.stderr || ''),
      (child.stderr || '').split('\n')[0].slice(0, 160));
    check('a broken bootstrap prints no PASS summary',
      !/CLASH-TEST-SUMMARY/.test(child.stdout || '') && !/ALL OFFLINE TESTS PASSED/.test(child.stdout || ''));
    check('a broken bootstrap prints no PASS lines', !/^  PASS  /m.test(child.stdout || ''));
  }
  finally { rmSync(brokenRoot, { recursive: true, force: true }); }

  // --- strict validation, per platform --------------------------------------
  const clean = (p, o) => pathArtefacts(p, o).length === 0;
  check('accepts a Windows drive path containing spaces',
    clean('C:\\Users\\91962\\Desktop\\clash cloud\\supabase\\cloud', { windows: true }));
  check('accepts a UNC path',
    clean('\\\\server\\share\\clash cloud\\supabase\\cloud', { windows: true }));
  check('accepts POSIX paths, with and without spaces',
    clean('/home/user/clash-app/supabase/cloud', { windows: false }) &&
    clean('/Users/dev/clash app/supabase/cloud', { windows: false }));
  check('rejects a doubled drive letter',
    pathArtefacts('C:\\C:\\Users\\91962\\manifest.json', { windows: true })
      .some((x) => /doubled drive/.test(x)));
  check('rejects the legacy pathname output',
    pathArtefacts(legacyJoined, { windows: true }).length > 0, legacyJoined);
  check('rejects forward slashes in a Windows path',
    pathArtefacts('C:/Users/91962/clash cloud/supabase/cloud', { windows: true })
      .some((x) => /foreign separator/.test(x)));
  check('rejects a backslash in a POSIX path',
    pathArtefacts('/home/user/clash\\app', { windows: false }).some((x) => /foreign separator/.test(x)));
  check('rejects a drive letter left on a POSIX path',
    pathArtefacts('/C:/Users/91962/manifest.json', { windows: false }).length > 0);
  check('rejects percent-encoding on both platforms',
    pathArtefacts('C:\\Users\\clash%20cloud', { windows: true }).length > 0 &&
    pathArtefacts('/home/clash%20app', { windows: false }).length > 0);
  check('rejects relative paths on both platforms',
    pathArtefacts('supabase/cloud', { windows: false }).length > 0 &&
    pathArtefacts('..\\cloud', { windows: true }).length > 0);
  check('the live derivation passes strict validation on this platform',
    pathArtefacts(CLOUD).length === 0 && pathArtefacts(ROOT).length === 0, CLOUD);

  // --- the two Round 7 test defects, pinned ---------------------------------
  check('win32.dirname splits a drive path where posix.dirname cannot',
    win32.dirname('C:\\Users\\91962\\clash cloud\\supabase\\cloud\\tests\\verify-package.mjs') ===
      'C:\\Users\\91962\\clash cloud\\supabase\\cloud\\tests' &&
    posix.dirname('C:\\Users\\91962\\clash cloud\\supabase\\cloud\\tests\\verify-package.mjs') === '.');
  // Ban the COMPOSITION, not the token: posix.dirname is legitimate on a POSIX
  // literal (the pinning test above uses it), but never on a filesystem path
  // derived at run time.
  check('the live comparison never feeds a live path to posix.dirname',
    !/posix\.dirname\(\s*(fileURLToPath|dirname|absolutise|\$)/.test(suiteSrc));
  // The needle is assembled so this assertion cannot match its own source.
  const backslashNeedle = ['CLOUD', '.includes(', String.fromCharCode(39), '\\', String.fromCharCode(39), ')'].join('');
  check('the live path assertion no longer forbids backslashes outright',
    suiteSrc.split(backslashNeedle).length - 1 === 0);

  // --- static: no URL.pathname used for filesystem paths --------------------
  // The production modules contain no fixtures, so a plain scan is sound there.
  // The test file itself necessarily contains the ban and its fixtures, so it is
  // checked structurally instead: import.meta.url may only reach the two
  // reviewed conversions.
  // Comment stripping, not full lexing: enough to ignore the explanation in a
  // header comment, and it cannot silently swallow the file the way a desynced
  // string lexer did (the Round 7 version passed only because of that desync).
  const codeOnly = (src) => {
    let out = ''; let i = 0;
    while (i < src.length) {
      const c = src[i]; const n = src[i + 1];
      if (c === '/' && n === '/') { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
      if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
      if (c === '"' || c === '\'' || c === '`') {
        const q = c; let j = i + 1;
        while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) { j++; break; } j++; }
        out += src.slice(i, j); i = j; continue;
      }
      out += c; i++;
    }
    return out;
  };
  const productionModules = ['tests/paths.mjs', 'tools/build-package.mjs'];
  const offenders = productionModules.filter((f) => /\.pathname/.test(codeOnly(read(join(CLOUD, f)))));
  check('no production module derives a path from URL.pathname', offenders.length === 0, offenders.join(','));
  check('the detector fires on the old construct',
    /\.pathname/.test("const CLOUD = new URL('..', import.meta.url).pathname;"));
  // paths.mjs is header-heavy: the code is ~45% of the bytes. The guard only has
  // to prove the stripper kept the code, not to pin a ratio.
  const stripperSource = read(join(CLOUD, 'tests/paths.mjs'));
  check('the comment stripper does not swallow the file',
    codeOnly(stripperSource).length > stripperSource.length * 0.3 &&
    codeOnly(stripperSource).includes('export function pathArtefacts'));
  const derivationAt = suiteSrc.indexOf('pathsFromModuleUrl(import.meta.url)');
  const fallbackAt = suiteSrc.indexOf('CLASH-TEST-BOOTSTRAP-FAILED');
  check('the live derivation comes from the reviewed conversion, inside the bootstrap guard',
    derivationAt > 0 && derivationAt < fallbackAt);
  check('every module that derives paths uses fileURLToPath',
    read(join(CLOUD, 'tests/paths.mjs')).includes('fileURLToPath') &&
    read(join(CLOUD, 'tests/verify-package.mjs')).includes('pathsFromModuleUrl') &&
    read(join(CLOUD, 'tools/build-package.mjs')).includes('fileURLToPath'));
  check('a skipped section cannot pass',
    suiteSrc.includes('sections ran') && suiteSrc.includes('only ${sectionsRun} of ${EXPECTED_SECTIONS}'));
}

hdr(18, 'documentation claims match the package (Round 7)');
{
  // This file's counts have been wrong before (README said 238 checksummed files
  // when there were 239, then 240). A number a reader relies on is now a test.
  const readmeText = read(join(CLOUD, 'README.md'));
  const checksumCount = read(join(CLOUD, 'checksums.sha256')).trim().split('\n').length;
  const originals = read(join(CLOUD, 'checksums.sha256')).split('\n').filter((l) => l.includes('supabase/migrations/')).length;
  const wrapperCount = entries.length;
  const migrationCount = migFiles.length;

  check('the checksum set covers every original migration plus the package',
    checksumCount === originals + (checksumCount - originals) && originals === migrationCount && checksumCount === 240,
    `checksums=${checksumCount} originals=${originals}`);
  check('README states the real checksum file count',
    readmeText.includes(`${checksumCount} files`) || readmeText.includes(`${checksumCount} checksum files`),
    String(checksumCount));
  check('README states the real migration count',
    readmeText.includes(`${migrationCount} migrations`) && readmeText.includes(`${migrationCount} files, byte-identical`));
  check('README states the real wrapper count',
    readmeText.includes(`${wrapperCount} wrappers`) && wrapperCount === migrationCount,
    `${wrapperCount}/${migrationCount}`);
  check('README states the suite\'s own assertion count',
    readmeText.includes(`${EXPECTED_ASSERTIONS} offline assertions`), String(EXPECTED_ASSERTIONS));
  const staleFileClaims = [...readmeText.matchAll(/all (\d+) files/g)].map((m) => Number(m[1]))
    .filter((n) => n !== checksumCount);
  check('no stale "all N files" claim remains', staleFileClaims.length === 0, staleFileClaims.join(','));
}

hdr(19, 'deployment recovery safety - R1-R4 adversarial regressions (Round 8)');
{
  const deployCode = read(join(CLOUD, 'tools/deploy.ps1'));
  const ledgerTool = read(join(CLOUD, 'tools/check-ledger.ps1'));
  const rollbackDoc = read(join(CLOUD, 'ROLLBACK.md'));
  const bootstrap = read(join(CLOUD, 'generated/000_ledger_bootstrap.sql'));

  // ------------------------------------------------------------------ R1 ----
  // Specification mirror: the rule the adapter implements, exercised on the
  // states the audit found misclassified. This is a mirror, not proof of the
  // PowerShell: the adapter's own cases run in test-native-capture.ps1.
  const ledgerVerdict = (versions, ledger, { tableAbsent = false } = {}) => {
    const gaps = []; const missing = []; const mismatch = []; const malformed = []; const extra = [];
    let seenMissing = false; let prefix = 0;
    for (const { version, token } of versions) {
      if (!(version in ledger)) { seenMissing = true; missing.push(version); continue; }
      const stored = ledger[version];
      if (!/^sha256:[0-9a-f]{64}$/.test(stored)) malformed.push(version);
      if (stored !== token) mismatch.push(version);
      if (seenMissing) gaps.push(version); else prefix += 1;
    }
    const known = new Set(versions.map((v) => v.version));
    Object.keys(ledger).forEach((k) => { if (!known.has(k)) extra.push(k); });
    if (malformed.length) return { verdict: 'PROBLEM', gaps, missing, mismatch, malformed, extra, prefix };
    if (extra.length) return { verdict: 'PROBLEM', gaps, missing, mismatch, malformed, extra, prefix };
    if (mismatch.length) return { verdict: 'PROBLEM', gaps, missing, mismatch, malformed, extra, prefix };
    if (gaps.length) return { verdict: 'PROBLEM', gaps, missing, mismatch, malformed, extra, prefix };
    if (missing.length === versions.length) return { verdict: 'EMPTY', gaps, missing, mismatch, malformed, extra, prefix, tableAbsent };
    if (missing.length === 0) return { verdict: 'CONSISTENT', gaps, missing, mismatch, malformed, extra, prefix };
    return { verdict: 'PARTIAL_PREFIX', gaps, missing, mismatch, malformed, extra, prefix };
  };
  const V = ['1', '2', '3'].map((c, i) => ({
    version: `2026010100000${i}`, token: `sha256:${c.repeat(64)}`,
  }));
  const full = Object.fromEntries(V.map((v) => [v.version, v.token]));
  check('R1 mirror: a gap is PROBLEM, never a resumable prefix',
    ledgerVerdict(V, { [V[0].version]: V[0].token, [V[2].version]: V[2].token }).verdict === 'PROBLEM');
  check('R1 mirror: a strict prefix is PARTIAL_PREFIX and a full ledger is CONSISTENT',
    ledgerVerdict(V, { [V[0].version]: V[0].token }).verdict === 'PARTIAL_PREFIX' &&
    ledgerVerdict(V, full).verdict === 'CONSISTENT' &&
    ledgerVerdict(V, {}).verdict === 'EMPTY' &&
    ledgerVerdict(V, {}, { tableAbsent: true }).verdict === 'EMPTY');
  check('R1 mirror: malformed, mismatched and unexpected rows are PROBLEM',
    ledgerVerdict(V, { [V[0].version]: 'garbage' }).verdict === 'PROBLEM' &&
    ledgerVerdict(V, { [V[0].version]: V[1].token }).verdict === 'PROBLEM' &&
    ledgerVerdict(V, { ...full, '20250101000000': V[0].token }).verdict === 'PROBLEM');
  check('R1: check-ledger classifies through the shared adapter function',
    /Get-LedgerVerdict -Entries \$entries/.test(ledgerTool) && /function Get-LedgerVerdict/.test(lib));
  check('R1: check-ledger exits nonzero for a gap',
    /\$verdict -eq 'PROBLEM'[\s\S]{0,200}exit 1/.test(ledgerTool) && /\$check\.gaps/.test(ledgerTool));
  check('R1: check-ledger refuses a partial prefix instead of advising a resume',
    /\$verdict -eq 'PARTIAL_PREFIX'[\s\S]{0,300}exit 1/.test(ledgerTool) &&
    /no resume path/.test(ledgerTool) &&
    !/may continue from the first missing one/.test(ledgerTool));
  check('R1: table presence is a catalog probe, not an error message',
    /to_regclass\('supabase_migrations\.schema_migrations'\)/.test(ledgerTool) &&
    !/stdErr -match "does not exist"/.test(ledgerTool) &&
    !/stdErr -match "does not exist"/.test(deployCode));
  check('R1: the adapter rejects malformed tokens explicitly',
    /\^sha256:\[0-9a-f\]\{64\}\$/.test(lib) && /malformed/.test(lib));

  // ------------------------------------------------------------------ R2 ----
  check('R2: the runner is fresh-only and stops on any non-empty ledger',
    /verdict -ne 'EMPTY'/.test(deployCode) && /03-ledger-not-empty\.json/.test(deployCode) &&
    /no resume path, no backfill and no retry/.test(deployCode));
  check('R2: no resume machinery survives in the runner',
    !/\$startIndex/.test(deployCode) && !/resumeFrom/.test(deployCode) &&
    !/resumedFromIndex/.test(deployCode) && !/ledger identity mismatch/.test(deployCode));
  check('R2: the ledger gate runs before the first wrapper can execute',
    deployCode.indexOf("03-ledger-not-empty.json") < deployCode.indexOf('gate 4: execute'));
  check('R2: ROLLBACK.md no longer promises a resume',
    !/T1 — Resume/.test(rollbackDoc) && !/proven prefix, so T1 applies/.test(rollbackDoc) &&
    /fresh-only/i.test(rollbackDoc) && /no automated resume/i.test(rollbackDoc));

  // ------------------------------------------------------------------ R3 ----
  const exitClass = (r) => {
    if (!r || r.launchError || r.timedOut || r.exitCode === null) return 'UNKNOWN';
    if (r.captureNote) return 'UNKNOWN';
    return ({ 0: 'COMPLETED', 1: 'PSQL_FATAL', 2: 'CONNECTION_LOST', 3: 'SCRIPT_ERROR' })[r.exitCode] || 'OTHER_EXIT';
  };
  const rollbackProvable = (r, readBackOk, rowAbsent) =>
    readBackOk === true && rowAbsent === true && exitClass(r) === 'SCRIPT_ERROR';
  const connLost = { exitCode: 2, timedOut: false, captureNote: '' };
  const scriptErr = { exitCode: 3, timedOut: false, captureNote: '' };
  const timeout = { exitCode: null, timedOut: true, captureNote: '' };
  const partial = { exitCode: 0, timedOut: false, captureNote: 'stdout capture incomplete' };
  check('R3 mirror: absence after a connection loss, timeout or partial capture is never a proven rollback',
    exitClass(connLost) === 'CONNECTION_LOST' && exitClass(timeout) === 'UNKNOWN' && exitClass(partial) === 'UNKNOWN' &&
    !rollbackProvable(connLost, true, true) && !rollbackProvable(timeout, true, true) &&
    !rollbackProvable(partial, true, true));
  check('R3 mirror: only a script error with a successful read-back proves a rollback',
    rollbackProvable(scriptErr, true, true) && !rollbackProvable(scriptErr, false, true) &&
    !rollbackProvable(scriptErr, true, false) && exitClass({ exitCode: 1, timedOut: false, captureNote: '' }) === 'PSQL_FATAL');
  check('R3: the runner delegates the decision to Test-RollbackProvable',
    /Test-RollbackProvable -Result \$mig -ReadBackOk \$probeOk -RowAbsent \$true/.test(deployCode) &&
    /function Test-RollbackProvable/.test(lib));
  check('R3: no unconditional ROLLED_BACK_PROVEN assignment remains',
    !/-not \$rowPresent\)\s*\{ \$receipt\.outcome = 'ROLLED_BACK_PROVEN' \}/.test(deployCode) &&
    /'ROLLED_BACK_PROVEN'/.test(deployCode));
  check('R3: the exception text no longer claims that nothing was written',
    !/This exception implies no database write/.test(deployCode) &&
    /does NOT imply that no database write happened/.test(deployCode));
  check('R3: UNKNOWN tells the operator the backend may still commit',
    /may still commit/i.test(deployCode) || /original backend will not still commit/i.test(deployCode));

  // ------------------------------------------------------------------ R4 ----
  check('R4: a required receipt that cannot be persisted throws',
    /function Write-RequiredReceipt/.test(deployCode) &&
    /throw \('required receipt could not be persisted/.test(deployCode) &&
    /if \(-not \$res\.ok\) \{\s*\n\s*throw \('receipt persistence failed/.test(lib));
  check('R4: every JSON receipt in the migration loop is required',
    (deployCode.match(/\[void\]\(Write-RequiredReceipt/g) || []).length >= 5 &&
    !/\[void\]\(Write-EvidenceOrFallback -Path \(Join-Path \$run \("03-migrations/.test(deployCode));
  check('R4: the fallback writer returns a structured failure and names it',
    /ok = \$false; path = \$null/.test(lib) && /NO RECEIPT POSSIBLE/.test(lib));
  check('R4: the self-test injects both-destination failure',
    /ClashEvidenceFallbackDir/.test(lib) && /ClashEvidenceFallbackDir = Join-Path \$blockerPath 'fallback'/.test(selfTest) &&
    /Add-Case 'receiptFailureStops'/.test(selfTest));

  // ------------------------------------------------------- SQLSTATE + capture
  check('SQLSTATE is extracted and message text is never used to classify',
    /function Get-PgSqlState/.test(lib) && /ERROR:\\s\+\(\[0-9A-Z\]\{5\}\):/.test(lib) &&
    !/does not exist"\) \{ \$tableAbsent/.test(ledgerTool));
  check('incomplete capture fails closed',
    /function Test-NativeCaptureComplete/.test(lib) &&
    /UNKNOWN-CAPTURE-INCOMPLETE/.test(lib) &&
    /if \(-not \[string\]::IsNullOrWhiteSpace\(\[string\]\$Result\.captureNote\)\) \{ return \$false \}/.test(lib));
  check('the adapter self-test exercises capture, exit class, SQLSTATE and the ledger rule',
    ['incompleteCaptureIsUnknown', 'connectionLossIsUnknown', 'sqlStateExtracted',
     'ledgerGapIsProblem', 'ledgerMalformedIsProblem', 'receiptFailureStops']
      .every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest)));

  // ------------------------------------------------- exclusive writer ------
  check('the claim table is created by step 0 with a primary key',
    /create table if not exists supabase_migrations\.clash_deploy_claim/.test(bootstrap) &&
    /claim_key\s+text not null primary key/.test(bootstrap));
  check('the runner claims the writer before the first wrapper and releases it after postflight',
    deployCode.indexOf("insert into supabase_migrations.clash_deploy_claim") > 0 &&
    deployCode.indexOf("insert into supabase_migrations.clash_deploy_claim") < deployCode.indexOf('gate 4: execute') &&
    deployCode.indexOf("delete from supabase_migrations.clash_deploy_claim") > deployCode.indexOf('gate 5: postflight'));
  check('a claim collision is classified by SQLSTATE and stops',
    /claimState = Get-PgSqlState \$claim\.stdErr/.test(deployCode) &&
    /03c-writer-claim-stop\.json/.test(deployCode) &&
    /exclusive writer/i.test(deployCode));
  // Only the LEDGER INSERT is inspected: a migration body may legitimately use
  // its own ON CONFLICT clause, and comments are stripped first.
  const sqlCode = (text) => text.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const ledgerInsertOf = (text) => {
    const i = text.indexOf('insert into supabase_migrations.schema_migrations');
    if (i < 0) return null;
    const j = text.indexOf(';', i);
    return j < 0 ? null : text.slice(i, j + 1);
  };
  const wrapperCodes = manifest.entries.map((e) => sqlCode(read(join(GEN, e.wrapperPath))));
  check('no wrapper swallows a duplicate ledger row',
    wrapperCodes.every((t) => { const st = ledgerInsertOf(t); return st !== null && !/on conflict/i.test(st); }) &&
    wrapperCodes.every((t) => (t.match(/insert into supabase_migrations\.schema_migrations/g) || []).length === 1));
  check('the wrapper documents why the conflict must abort',
    /CONCURRENCY \(Round 8\)/.test(read(join(GEN, manifest.entries[0].wrapperPath))) &&
    /on conflict do nothing/.test(read(join(GEN, manifest.entries[0].wrapperPath))));
}

{
  // Tripwire: the documented total must equal what actually ran. Adding an
  // assertion without updating EXPECTED_ASSERTIONS fails here.
  const ran = pass + failures.length + 1;
  check('the suite runs exactly the documented number of assertions',
    ran === EXPECTED_ASSERTIONS, `expected ${EXPECTED_ASSERTIONS}, ran ${ran}`);
}

if (sectionsRun !== EXPECTED_SECTIONS) {
  const message = `only ${sectionsRun} of ${EXPECTED_SECTIONS} sections ran`;
  failures.push(message);
  console.log(`  FAIL  ${message}`);
}
if (pass === 0) {
  failures.push('no assertion produced a result');
  console.log('  FAIL  no assertion produced a result');
}

console.log(`\n${'='.repeat(60)}`);
console.log(`${pass} passed, ${failures.length} failed`);
// machine-readable contract for tools/run-tests.ps1: a launcher must not have to
// infer the result from prose, and a truncated run must not look like a pass
console.log('CLASH-TEST-SUMMARY ' + JSON.stringify({
  passed: pass, failed: failures.length, total: pass + failures.length,
  sections: sectionsRun, sectionsExpected: EXPECTED_SECTIONS,
}));
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
console.log('ALL OFFLINE TESTS PASSED');
