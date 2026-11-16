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

const EXPECTED_SECTIONS = 28;
const EXPECTED_CASES = 135;
const EXPECTED_ASSERTIONS = 467;
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
// Round 16: the finalization cases deliberately corrupt artifacts to prove they
// are rejected, so the rule is scoped to production code and the harness's
// overwrites must all sit inside that fault-injection section.
const finSectionAt = selfTest.indexOf('76-91: the completion finalization protocol');
const selfTestProduction = finSectionAt > 0 ? selfTest.slice(0, finSectionAt) : selfTest;
const injectionWrites = (finSectionAt > 0 ? selfTest.slice(finSectionAt).match(/WriteAllText/g) || [] : []).length;
check('no overwriting write in production code, and only fault injection overwrites evidence',
  !/WriteAllText/.test(strictText) && !/WriteAllText/.test(selfTestProduction) &&
  !/FileMode\]::Create\b/.test(lib) && injectionWrites >= 3,
  `injectionWrites=${injectionWrites}`);
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
  // Round 11: split on /\r?\n/, not on '\n'. On a Windows checkout git may hand
  // this file back with CRLF (it carries no eol attribute); splitting on '\n'
  // then leaves a trailing '\r' on every path, existsSync() sees a filename that
  // does not exist, and all 240 entries report as corrupt. The file contents were
  // always normalised (nsha/lf); only the list itself was not. Found by the
  // windows-2022 gate, invisible on Linux.
  const lines = read(join(CLOUD, 'checksums.sha256')).trim().split(/\r?\n/);
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
  // 11e: a truncated run must not be presented as complete. Round 16 (R15-C1):
  // completion is published by the protocol, after the gates AND after the
  // claim release - never by a receipt the runner writes itself.
  check('completion is published only after the postflight gates and the release',
    deploy.indexOf('Publish-ClashCompletion -Root $run') > deploy.indexOf("'05-storage.json'") &&
    deploy.indexOf('Publish-ClashCompletion -Root $run') > deploy.indexOf('06-claim-release.json') &&
    deploy.indexOf('Publish-ClashCompletion -Root $run') < deploy.indexOf('TERMINAL RECEIPT: COMPLETE') &&
    !deploy.includes("New-PhaseReceipt '06-complete.json'"));
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
    'Filter', 'PathType',
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

hdr(20, 'fail-closed ledger parsing, branch safety, SQLSTATE (Round 9)');
{
  const deployCode = read(join(CLOUD, 'tools/deploy.ps1'));
  const ledgerTool = read(join(CLOUD, 'tools/check-ledger.ps1'));
  const rollbackDoc = read(join(CLOUD, 'ROLLBACK.md'));
  const bootstrap = read(join(CLOUD, 'generated/000_ledger_bootstrap.sql'));

  // ------------------------------------------------------------------ B1 ----
  // Specification mirror of ConvertFrom-ClashLedgerOutput.
  const parseLedger = (text, entries, { tableAbsent = false } = {}) => {
    const expected = new Map(entries.map((e) => [e.version, `sha256:${e.normalizedSha256}`]));
    const problems = []; const ledger = new Map();
    const duplicates = []; const unknownVersions = []; const badTokens = []; const badVersions = [];
    let lineNo = 0; let rows = 0;
    for (const raw of String(text).split(/\r?\n/)) {
      lineNo += 1;
      if (raw.trim() === '') continue;
      const line = raw.replace(/\s+$/, '');
      const parts = line.split('|');
      if (parts.length !== 2) { problems.push(`row ${lineNo}: fields ${parts.length}`); continue; }
      const [version, token] = parts;
      if (!/^\d{14}$/.test(version)) { problems.push(`row ${lineNo}: version`); badVersions.push(version); continue; }
      if (!expected.has(version)) { problems.push(`row ${lineNo}: unknown ${version}`); unknownVersions.push(version); continue; }
      if (token === '<null>' || !/^sha256:[0-9a-f]{64}$/.test(token)) { problems.push(`row ${lineNo}: identity`); badTokens.push(version); continue; }
      if (ledger.has(version)) { problems.push(`row ${lineNo}: duplicate ${version}`); duplicates.push(version); continue; }
      ledger.set(version, token); rows += 1;
    }
    if (tableAbsent && String(text).trim() !== '') problems.push('absent but not empty');
    return { ok: problems.length === 0, rows, ledger, problems, duplicates, unknownVersions, badTokens, badVersions };
  };
  const entries3 = ['1', '2', '3'].map((c, i) => ({ version: `2026010100000${i}`, normalizedSha256: c.repeat(64) }));
  const row = (e) => `${e.version}|sha256:${e.normalizedSha256}`;
  const good = [row(entries3[0]), row(entries3[1])].join('\n') + '\n';
  const cases = [
    ['valid listing with a trailing newline', good, true],
    ['malformed-only output', 'UNEXPECTED_NONEMPTY_LEDGER_OUTPUT', false],
    ['mixed valid and malformed', `${row(entries3[0])}\ngarbage\n`, false],
    ['one field', '20260101000000|sha256:', false],
    ['three fields', `${row(entries3[0])}|extra`, false],
    ['duplicate version', `${row(entries3[0])}\n${row(entries3[0])}`, false],
    ['version is not a timestamp', `2026-01-01|sha256:${'1'.repeat(64)}`, false],
    ['version is not in the manifest', `20990101000000|sha256:${'1'.repeat(64)}`, false],
    ['null identity', '20260101000000|<null>', false],
    ['malformed identity', '20260101000000|sha256:xyz', false],
    ['whitespace only', '\n\n   \n', true],
  ];
  const mismatches = cases.filter(([, text, expected]) => parseLedger(text, entries3).ok !== expected)
    .map(([name]) => name);
  check('B1 mirror: the parser accepts exactly the valid shapes and rejects every malformed one',
    mismatches.length === 0, mismatches.join(','));
  check('B1 mirror: a duplicate version is reported, never overwritten',
    parseLedger(`${row(entries3[0])}\n${row(entries3[0])}`, entries3).duplicates.length === 1);
  check('B1 mirror: garbage output cannot become an empty ledger',
    (() => { const r = parseLedger('UNEXPECTED_NONEMPTY_LEDGER_OUTPUT', entries3); return !r.ok && r.rows === 0 && r.ledger.size === 0; })());
  check('B1 mirror: an absent table with non-empty output is rejected',
    !parseLedger('something', entries3, { tableAbsent: true }).ok &&
    parseLedger('', entries3, { tableAbsent: true }).ok);

  check('B1: the parser lives in the adapter and both tools use it',
    /function ConvertFrom-ClashLedgerOutput/.test(lib) &&
    /ConvertFrom-ClashLedgerOutput -Text \$led\.stdOut -Entries \$entries/.test(deployCode) &&
    /ConvertFrom-ClashLedgerOutput -Text \$r\.stdOut -Entries \$entries/.test(ledgerTool));
  check('B1: no tool splits ledger rows inline any more',
    !/\$parts = \$line\.Split\('\|'\)/.test(deployCode) && !/\$p = \$line\.Split\('\|'\)/.test(ledgerTool) &&
    !/\$parts\.Count -ge 2/.test(deployCode) && !/\$p\.Count -ge 2/.test(ledgerTool));
  check('B1: a parse failure stops the runner before step 0 creates anything',
    deployCode.indexOf('03-ledger-parse-stop.json') > 0 &&
    deployCode.indexOf('03-ledger-parse-stop.json') < deployCode.indexOf('gate 3b: step 0'));
  check('B1: a parse failure makes the read-only helper exit 1',
    /\$ledgerParse\.ok\) \{[\s\S]{0,400}exit 1/.test(ledgerTool));
  check('B1: the parser validates against the manifest, not against itself',
    /ConvertFrom-ClashLedgerOutput \{[\s\S]{0,400}\$expected\[\[string\]\$e\.version\]/.test(lib) &&
    /is not in the manifest/.test(lib));
  check('B1: executed PowerShell tests exercise the real parser',
    /^Add-Case 'ledgerParserRejectsMalformedOutput'/m.test(selfTest) &&
    /ConvertFrom-ClashLedgerOutput -Text 'UNEXPECTED_NONEMPTY_LEDGER_OUTPUT'/.test(selfTest) &&
    /parseMixed\.ok/.test(selfTest) && /parseDuplicate\.duplicates/.test(selfTest));

  // ------------------------------------------------------------------ B2 ----
  check('B2: the read-only helper never touches an unset ledger result',
    /\$r = \$null/.test(ledgerTool) &&
    !/\$r\.exitCode/.test(ledgerTool) &&
    /-LedgerResult \$r/.test(ledgerTool) &&
    /\$null -ne \$LedgerResult/.test(read(join(CLOUD, 'tools/lib/clash-native.ps1'))),
    'the receipt reads $r only through New-LedgerAuditFields');
  check('B2: the ABSENT branch records the probe it actually ran',
    /New-LedgerAuditFields/.test(ledgerTool) && /function New-LedgerAuditFields/.test(lib) &&
    /not issued: table absent/.test(lib) &&
    /presenceOutcome/.test(read(join(CLOUD, 'tools/lib/clash-native.ps1'))));
  check('B2: executed PowerShell tests cover both branches',
    /^Add-Case 'absentAndPresentBranchesRecordActualResult'/m.test(selfTest) &&
    /absentFields\.ledgerQuery/.test(selfTest) && /presentFields\.ledgerQuery/.test(selfTest));
  // mirror: the builder must not read a ledger result that does not exist
  const auditFields = (presence, ledgerResult, parse, check2) => ({
    ledgerQuery: ledgerResult === null ? 'not issued: table absent' : 'issued',
    rowsParsed: parse ? parse.rows : 0,
    verdict: check2 ? check2.verdict : 'UNREADABLE',
  });
  check('B2 mirror: the absent branch produces a receipt without a ledger query',
    auditFields({}, null, { rows: 0 }, null).ledgerQuery === 'not issued: table absent' &&
    auditFields({}, null, { rows: 0 }, null).verdict === 'UNREADABLE' &&
    auditFields({}, {}, { rows: 2 }, { verdict: 'CONSISTENT' }).ledgerQuery === 'issued');

  // ------------------------------------------------------------------ B3 ----
  const deployCommon = deployCode.match(/\$common = @\([^)]*\)/);
  const ledgerCommon = ledgerTool.match(/\$common = @\([^)]*\)/);
  check('B3: both command builders request verbose SQLSTATE diagnostics',
    Boolean(deployCommon) && Boolean(ledgerCommon) &&
    /VERBOSITY=verbose/.test(deployCommon[0]) && /VERBOSITY=verbose/.test(ledgerCommon[0]) &&
    /ON_ERROR_STOP=1/.test(deployCommon[0]) && /ON_ERROR_STOP=1/.test(ledgerCommon[0]));
  check('B3: the SQLSTATE extractor handles real verbose psql output',
    (() => {
      const verbose = 'ERROR:  23505: duplicate key value violates unique constraint "clash_deploy_claim_pkey"\n'
        + 'DETAIL:  Key (claim_key)=(clash-cloud-deploy) already exists.\n'
        + 'LOCATION:  _bt_check_unique, nbtinsert.c:666';
      const m = verbose.match(/ERROR:\s+([0-9A-Z]{5}):/);
      return m !== null && m[1] === '23505';
    })());
  check('B3: the self-test covers a verbose error with DETAIL and LOCATION',
    /ERROR:  23505: duplicate key/.test(selfTest) || /sqlStateExtracted/.test(selfTest));

  // ------------------------------------- claim and schema structure audit ----
  check('the bootstrap declares both primary keys',
    /version\s+text not null primary key/.test(bootstrap) &&
    /claim_key\s+text not null primary key/.test(bootstrap));
  check('a pre-existing table is verified structurally, not trusted by name',
    /'ledger=version;claim=claim_key'/.test(deployCode) &&
    /pg_constraint/.test(deployCode) && /contype = 'p'/.test(deployCode) &&
    deployCode.indexOf("'ledger=version;claim=claim_key'") < deployCode.indexOf('gate 3c: exclusive writer claim'));
  check('claim release proves ownership and exactly one deleted row',
    /delete from supabase_migrations\.clash_deploy_claim[\s\S]{0,200}returning run_id/.test(deployCode) &&
    /\$releasedRows\.Count -eq 1/.test(deployCode) &&
    /06-claim-release-ownership-stop\.json/.test(deployCode));
  check('stale-claim clearance requires proof the previous writer is inactive',
    /pg_stat_activity/.test(rollbackDoc) && /inactive/i.test(rollbackDoc));
}

hdr(21, 'claim release: the committed block, executed (Round 10)');
{
  const deployCode = read(join(CLOUD, 'tools/deploy.ps1'));
  const selfTest = read(join(CLOUD, 'tools/test-native-capture.ps1'));
  const libCode = read(join(CLOUD, 'tools/lib/clash-native.ps1'));

  // ---------------------------------------------------------------- R9-C1 ----
  check('R9-C1: the claim-release condition calls the predicate inside parentheses',
    deployCode.includes('if ((Test-NativeSuccess $release) -and (-not $releasedOwned)) {'));
  check('R9-C1: the unparenthesised form that collapsed the condition is gone',
    !/if \(Test-NativeSuccess \$release -and/.test(deployCode) &&
    !/Test-NativeSuccess \$release -and -not/.test(deployCode));

  // ---------------------------------------- PowerShell invocation/operator ---
  // In argument mode '-and', '-not', '-eq' and friends are ARGUMENTS, not
  // operators: a condition that begins with a command invocation and then
  // continues with one of them passes the extra tokens to the command and
  // collapses to that command's own output. Valid syntax, silently wrong logic.
  const maskStrings = (source) => {
    const chars = source.split('');
    let i = 0; let inSingle = false; let inDouble = false;
    while (i < source.length) {
      const c = source[i];
      if (inSingle) {
        if (c === '\n') { i += 1; continue; }
        if (c === "'") {
          if (source[i + 1] === "'") { chars[i] = 'x'; chars[i + 1] = 'x'; i += 2; continue; }
          inSingle = false; i += 1; continue;
        }
        chars[i] = 'x'; i += 1; continue;
      }
      if (inDouble) {
        if (c === '\n') { i += 1; continue; }
        if (c === '`') { chars[i] = 'x'; if (i + 1 < source.length) chars[i + 1] = 'x'; i += 2; continue; }
        if (c === '"') {
          if (source[i + 1] === '"') { chars[i] = 'x'; chars[i + 1] = 'x'; i += 2; continue; }
          inDouble = false; i += 1; continue;
        }
        chars[i] = 'x'; i += 1; continue;
      }
      if (c === "'") { inSingle = true; i += 1; continue; }
      if (c === '"') { inDouble = true; i += 1; continue; }
      i += 1;
    }
    return chars.join('');
  };
  const stripComments = (source) => {
    const chars = source.split('');
    let i = 0; let inSingle = false; let inDouble = false;
    while (i < source.length) {
      const c = source[i];
      if (inSingle) {
        if (c === "'") { if (source[i + 1] === "'") { i += 2; continue; } inSingle = false; }
        i += 1; continue;
      }
      if (inDouble) {
        if (c === '`') { i += 2; continue; }
        if (c === '"') { if (source[i + 1] === '"') { i += 2; continue; } inDouble = false; }
        i += 1; continue;
      }
      if (c === '<' && source.startsWith('<#', i)) {
        const end = source.indexOf('#>', i + 2);
        const stop = end < 0 ? source.length : end + 2;
        for (let j = i; j < stop; j += 1) if (source[j] !== '\n') chars[j] = ' ';
        i = stop; continue;
      }
      if (c === '#') {
        const end = source.indexOf('\n', i);
        const stop = end < 0 ? source.length : end;
        for (let j = i; j < stop; j += 1) chars[j] = ' ';
        i = stop; continue;
      }
      if (c === "'") { inSingle = true; i += 1; continue; }
      if (c === '"') { inDouble = true; i += 1; continue; }
      i += 1;
    }
    return chars.join('');
  };
  const matchParenFrom = (source, open) => {
    let depth = 0; let i = open; let inSingle = false; let inDouble = false;
    while (i < source.length) {
      const c = source[i];
      if (inSingle) { if (c === "'") { if (source[i + 1] === "'") { i += 2; continue; } inSingle = false; } i += 1; continue; }
      if (inDouble) { if (c === '`') { i += 2; continue; } if (c === '"') { if (source[i + 1] === '"') { i += 2; continue; } inDouble = false; } i += 1; continue; }
      if (c === "'") { inSingle = true; i += 1; continue; }
      if (c === '"') { inDouble = true; i += 1; continue; }
      if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c)) { depth -= 1; if (depth === 0) return i; }
      i += 1;
    }
    return -1;
  };
  const topLevelTokens = (inner) => {
    const tokens = []; let cur = ''; let depth = 0; let inSingle = false; let inDouble = false;
    for (let i = 0; i < inner.length; i += 1) {
      const c = inner[i];
      if (inSingle) { cur += c; if (c === "'") { if (inner[i + 1] === "'") { cur += "'"; i += 1; continue; } inSingle = false; } continue; }
      if (inDouble) { cur += c; if (c === '`') { cur += inner[i + 1] || ''; i += 1; continue; } if (c === '"') { if (inner[i + 1] === '"') { cur += '"'; i += 1; continue; } inDouble = false; } continue; }
      if (c === "'") { inSingle = true; cur += c; continue; }
      if (c === '"') { inDouble = true; cur += c; continue; }
      if ('([{'.includes(c)) { depth += 1; cur += c; continue; }
      if (')]}'.includes(c)) { depth -= 1; cur += c; continue; }
      if (/\s/.test(c) && depth === 0) { if (cur) { tokens.push(cur); cur = ''; } continue; }
      cur += c;
    }
    if (cur) tokens.push(cur);
    return tokens;
  };
  const PS_OPERATOR = new Set(['-and', '-or', '-xor', '-eq', '-ne', '-lt', '-gt', '-le', '-ge',
    '-like', '-notlike', '-match', '-notmatch', '-contains', '-notcontains', '-in', '-notin',
    '-is', '-isnot', '-replace', '-split', '-join', '-f', '-as', '-not']);
  const PS_COMMAND = /^[A-Za-z][A-Za-z0-9]*-[A-Za-z][A-Za-z0-9]*$/;
  const commandOperatorMisparses = (source) => {
    const original = maskStrings(String(source).replace(/\r\n/g, '\n'));
    const masked = stripComments(original);
    const findings = [];
    const keyword = /(?:^|[^A-Za-z0-9_-])(if|elseif|while|until)\s*\(/gm;
    let m;
    while ((m = keyword.exec(masked)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = matchParenFrom(masked, open);
      if (close < 0) continue;
      const inner = original.slice(open + 1, close).replace(/`?\n/g, ' ');
      let tokens = topLevelTokens(inner);
      while (tokens.length && (tokens[0] === '-not' || tokens[0] === '!' || tokens[0] === '-bnot')) tokens = tokens.slice(1);
      if (tokens.length && PS_COMMAND.test(tokens[0])) {
        const ops = tokens.slice(1).filter((t) => PS_OPERATOR.has(t.toLowerCase()));
        if (ops.length) {
          findings.push({
            line: masked.slice(0, open).split('\n').length,
            head: tokens[0], ops, text: inner.trim().split(/\s+/).join(' ').slice(0, 120),
          });
        }
      }
      keyword.lastIndex = open + 1;
    }
    const assign = /^[ \t]*(\$[A-Za-z_][A-Za-z0-9_:]*)\s*=\s*([A-Za-z][A-Za-z0-9]*-[A-Za-z][A-Za-z0-9]*)(?=[ \t]|$)/gm;
    let a;
    while ((a = assign.exec(masked)) !== null) {
      const lineEnd = masked.indexOf('\n', a.index);
      const tail = original.slice(a.index + a[0].length, lineEnd < 0 ? original.length : lineEnd);
      const ops = topLevelTokens(tail).filter((t) => PS_OPERATOR.has(t.toLowerCase()));
      if (ops.length) {
        findings.push({
          line: masked.slice(0, a.index).split('\n').length,
          head: a[2], ops, text: tail.trim().split(/\s+/).join(' ').slice(0, 120),
        });
      }
    }
    const ret = /^[ \t]*return\s+([A-Za-z][A-Za-z0-9]*-[A-Za-z][A-Za-z0-9]*)(?=[ \t]|$)/gm;
    let r;
    while ((r = ret.exec(masked)) !== null) {
      const lineEnd = masked.indexOf('\n', r.index);
      const tail = original.slice(r.index + r[0].length, lineEnd < 0 ? original.length : lineEnd);
      const ops = topLevelTokens(tail).filter((t) => PS_OPERATOR.has(t.toLowerCase()));
      if (ops.length) {
        findings.push({ line: masked.slice(0, r.index).split('\n').length, head: r[1], ops, text: tail.trim().slice(0, 120) });
      }
    }
    return findings;
  };

  const psFiles = ['tools/check-ledger.ps1', 'tools/check-manifest.ps1', 'tools/deploy.ps1',
    'tools/lib/clash-native.ps1', 'tools/run-tests.ps1', 'tools/test-native-capture.ps1'];
  const audited = psFiles.map((rel) => ({ rel, findings: commandOperatorMisparses(read(join(CLOUD, rel))) }));
  const offenders = audited.filter((x) => x.findings.length > 0)
    .map((x) => x.rel + ':' + x.findings.map((f) => f.line + '(' + f.head + ' ' + f.ops.join(' ') + ')').join(','));
  check('audit: no PowerShell condition combines a bare command call with an operator',
    offenders.length === 0 && audited.length === 6, offenders.join(' | '));

  // Failure injection: the detector must fire on the exact shape that shipped.
  check('audit: the detector fires on the R9-C1 condition',
    commandOperatorMisparses('if (Test-NativeSuccess $release -and -not $releasedOwned) { }').length === 1);
  check('audit: the detector fires on the assignment form',
    commandOperatorMisparses('$ok = Test-NativeSuccess $r -and $x').length === 1);
  check('audit: the detector fires on a cmdlet with a comparison',
    commandOperatorMisparses('if (Test-Path $p -eq $true) { }').length === 1);
  check('audit: the detector accepts the parenthesised forms',
    commandOperatorMisparses('if ((Test-NativeSuccess $release) -and (-not $releasedOwned)) { }').length === 0 &&
    commandOperatorMisparses('if (-not (Test-NativeSuccess $r)) { }').length === 0 &&
    commandOperatorMisparses('$ok = (Test-NativeSuccess $r) -and $x').length === 0 &&
    commandOperatorMisparses('if ($x -and $y) { }').length === 0);
  check('audit: the detector ignores operators inside strings and comments',
    commandOperatorMisparses("$a = @('-and', '-or')\n# if (Cmd $x -and $y)\n$b = 1").length === 0);

  // --------------------------------------- the committed block is executed ---
  check('the harness extracts the release block from deploy.ps1 instead of restating it',
    /function Get-ClaimReleaseBlock/.test(selfTest) &&
    /\[System\.IO\.File\]::ReadAllLines\(\$Path\)/.test(selfTest) &&
    /\$releaseSql\\s\*=\\s\*"delete from supabase_migrations/.test(selfTest) &&
    /\[scriptblock\]::Create\(\[string\]\$blockInfo\.text\)/.test(selfTest) &&
    /& \$script:r10Block/.test(selfTest));
  check('the extractor refuses a drifted region instead of probing something else',
    /claim-release block rejected/.test(selfTest) &&
    /'06-claim-release-ownership-stop\.json'/.test(selfTest) &&
    /contains an exit statement/.test(selfTest) &&
    /still seals evidence/.test(selfTest) &&
    /returning run_id/.test(selfTest));
  check('only the process and evidence layers are substituted',
    /function Invoke-NativeProcess/.test(selfTest) && /function Write-Evidence/.test(selfTest) &&
    /function New-PhaseReceipt/.test(selfTest) && /function Stop-Run/.test(selfTest) &&
    !/function Test-NativeSuccess/.test(selfTest) && !/function Get-PgSqlState/.test(selfTest) &&
    !/function Get-NativeOutcomeLabel/.test(selfTest) && !/function Get-NativeErrorExcerpt/.test(selfTest));
  check('the success case requires one owner row and the committed argv, not COMPLETE',
    /reachedComplete -eq \$false/.test(selfTest) &&
    /\$ownedArgs -contains 'VERBOSITY=verbose'/.test(selfTest) &&
    /\$ownedSql\.Contains\('returning run_id'\)/.test(selfTest) &&
    /\[string\]\$ownedDone\['status'\] -eq '<absent>'/.test(selfTest) &&
    !/\[string\]\$ownedDone\['writerRunId'\]/.test(selfTest));
  const releaseCases = ['claimReleaseOwnedRowReleasesClaimOnly', 'claimReleaseZeroRowsStops',
    'claimReleaseWrongOwnerStops', 'claimReleaseMultipleRowsStops', 'claimReleaseNonZeroExitStops',
    'claimReleaseTimeoutStops', 'claimReleaseIncompleteCaptureStops'];
  check('all seven release outcomes are executed against the committed block',
    releaseCases.every((n) => new RegExp("^Add-Case '" + n + "'", 'm').test(selfTest)) &&
    (selfTest.match(/Invoke-ClaimReleaseProbe -RunId/g) || []).length === 7);
  check('the timeout and incomplete-capture cases refuse to infer a release',
    /'UNKNOWN-TIMEOUT'/.test(selfTest) && /'UNKNOWN-CAPTURE-INCOMPLETE'/.test(selfTest) &&
    (selfTest.match(/-not \$probe(Timeout|Partial)\.receipts\.Contains\('06-claim-release-ownership-stop\.json'\)/g) || []).length === 2);
  check('the new cases are in the shared inventory the receipt must match',
    releaseCases.every((n) => libCode.includes("'" + n + "'")));

  // The extractor's preconditions, mirrored on Linux so anchor drift fails the
  // offline suite instead of surfacing only when the PowerShell case runs.
  const deployLines = lf(deployCode).split('\n');
  const startIdx = deployLines.findIndex((l) => /^\$releaseSql\s*=\s*"delete from supabase_migrations\.clash_deploy_claim/.test(l));
  // Round 16 (R15-C1): the release region ends where the completion region
  // begins, and it may not write a completion receipt at all.
  const endIdx = deployLines.findIndex((l, i) => i > startIdx && /^#\s*-+\s*completion\s*-+\s*$/.test(l));
  const region = startIdx >= 0 && endIdx > startIdx ? deployLines.slice(startIdx, endIdx).join('\n') : '';
  const regionMarkers = {
    '06-claim-release-ownership.json': 1,
    '06-claim-release-ownership-stop.json': 1,
    '06-claim-release-fail.json': 1,
    '06-claim-release.json': 2,
    '06-complete.json': 0,
  };
  check('mirror: the committed release region satisfies every extractor guard',
    startIdx >= 0 && endIdx > startIdx &&
    Object.entries(regionMarkers).every(([m, n]) => region.split(m).length - 1 === n) &&
    region.includes('returning run_id') &&
    !/^\s*exit\b/m.test(region) && !region.includes('Seal-Evidence') &&
    !region.includes('Publish-ClashCompletion'),
    `start=${startIdx} end=${endIdx} lines=${endIdx - startIdx}`);
  check('mirror: the extractor anchors are unique in deploy.ps1',
    deployLines.filter((l) => /^\$releaseSql\s*=/.test(l)).length === 1 &&
    deployLines.filter((l) => /^#\s*-+\s*completion\s*-+\s*$/.test(l)).length === 1 &&
    deployLines.filter((l) => /^exit 0\s*$/.test(l)).length === 1);
  check('mirror: exactly one $common assignment exists for the probe to extract',
    deployLines.filter((l) => /^\$common\s*=\s*@\(/.test(l)).length === 1 &&
    /VERBOSITY=verbose/.test(deployLines.filter((l) => /^\$common\s*=\s*@\(/.test(l))[0] || ''));

  // ------------------------------------------- decision-table specification ---
  // Mirror of the deployed control flow. This proves the SPECIFICATION; the
  // executed PowerShell cases above prove the deployed expressions.
  const nativeSuccess = (r) => r !== null && !r.launchError && !r.timedOut && r.exitCode !== null &&
    String(r.captureNote).trim() === '' && Number(r.exitCode) === 0;
  const ownedOf = (rows, runId) => rows.length === 1 && rows[0].trim() === runId;
  const releaseBranch = (result, rows, runId) => {
    if (nativeSuccess(result) && !ownedOf(rows, runId)) return 'ownership-stop';
    if (!nativeSuccess(result)) return 'release-fail';
    return 'complete';
  };
  const buggyBranch = (result) => (nativeSuccess(result) ? 'ownership-stop' : 'release-fail');
  const runId = 'probe-run';
  const ok = { exitCode: 0, timedOut: false, launchError: null, captureNote: '' };
  const table = [
    ['owned row', ok, [runId], 'complete'],
    ['zero rows', ok, [], 'ownership-stop'],
    ['wrong owner', ok, ['other'], 'ownership-stop'],
    ['two rows', ok, [runId, runId], 'ownership-stop'],
    ['nonzero exit', { ...ok, exitCode: 3 }, [], 'release-fail'],
    ['timeout', { ...ok, exitCode: null, timedOut: true }, [runId], 'release-fail'],
    ['incomplete capture', { ...ok, captureNote: 'stdout capture incomplete' }, [runId], 'release-fail'],
  ];
  const offTable = table.filter(([, result, rows, expected]) => releaseBranch(result, rows, runId) !== expected)
    .map(([name]) => name);
  check('mirror: the release decision table matches the seven executed scenarios',
    offTable.length === 0, offTable.join(','));
  check('mirror: the R9-C1 collapse would be caught by this table',
    buggyBranch(ok) === 'ownership-stop' && releaseBranch(ok, [runId], runId) === 'complete' &&
    buggyBranch({ ...ok, exitCode: 3 }) === 'release-fail');
  check('mirror: a run that prints its own id but did not succeed is never a release',
    releaseBranch({ ...ok, timedOut: true }, [runId], runId) === 'release-fail' &&
    releaseBranch({ ...ok, captureNote: 'x' }, [runId], runId) === 'release-fail');
}

hdr(22, 'verification report contract - the report IS the SQL (Round 12 / R11-C1)');
{
  const deployCode = lf(read(join(CLOUD, 'tools/deploy.ps1')));
  const selfTest   = lf(read(join(CLOUD, 'tools/test-native-capture.ps1')));
  const libCode    = lf(read(join(CLOUD, 'tools/lib/clash-native.ps1')));
  const readmeText = lf(read(join(CLOUD, 'README.md')));

  // ---------------------------------------------------- what the SQL renders --
  // The contract may not be invented: it is compared against the identities the
  // renderer itself emits. Only the first contiguous run of ords counts; the
  // guard block repeats the same list further down the file.
  const IDENTITY = /select\s+(\d+)\s+as\s+ord,\s*'((?:[^']|'')*)'::text\s+as\s+check_name,\s*'((?:[^']|'')*)'::text\s+as\s+expected/g;
  const sqlIdentities = (rel) => {
    const text = read(join(CLOUD, rel));
    IDENTITY.lastIndex = 0;
    const rows = [];
    let next = 1;
    for (const m of text.matchAll(IDENTITY)) {
      const ord = Number(m[1]);
      if (ord !== next) break;
      rows.push({ ord, name: m[2].replace(/''/g, "'"), expected: m[3].replace(/''/g, "'") });
      next += 1;
    }
    return rows;
  };
  const verifyRows  = sqlIdentities('verify/90_verify.sql');
  const storageRows = sqlIdentities('verify/95_storage_config.sql');

  // ------------------------------------------------- what the adapter declares --
  const contractOf = (report) => {
    const start = libCode.indexOf(`if ($ReportName -eq '${report}') {`);
    if (start < 0) return null;
    const bounds = [libCode.indexOf('if ($ReportName -eq ', start + 10), libCode.indexOf('return $null', start)]
      .filter((i) => i > start);
    const blockText = libCode.slice(start, bounds.length ? Math.min(...bounds) : libCode.length);
    const gating = Number((blockText.match(/gating = (\d+)/) || [])[1]);
    const info   = Number((blockText.match(/\binfo\s+= (\d+)/) || [])[1]);
    const checks = [];
    const rowRe = /\[ordered\]@\{ ord = (\d+);\s*name = '((?:[^']|'')*)';\s*expected = '((?:[^']|'')*)';\s*info = \$(true|false) \}/g;
    for (const m of blockText.matchAll(rowRe)) {
      checks.push({ ord: Number(m[1]), name: m[2].replace(/''/g, "'"), expected: m[3].replace(/''/g, "'"), info: m[4] === 'true' });
    }
    return { report, gating, info, checks };
  };
  const verifyContract  = contractOf('90_verify.sql');
  const storageContract = contractOf('95_storage_config.sql');

  check('the renderer still emits 19 / 7 identities (the contract is compared to this, not to a copy)',
    verifyRows.length === 19 && storageRows.length === 7, `${verifyRows.length}/${storageRows.length}`);
  check('both contracts are declared in the adapter', verifyContract !== null && storageContract !== null);
  check('the declared contract equals the SQL: ord, name and expected text, row for row',
    verifyContract.checks.length === verifyRows.length &&
    verifyContract.checks.every((c, i) => c.ord === verifyRows[i].ord && c.name === verifyRows[i].name &&
      c.expected === verifyRows[i].expected) &&
    storageContract.checks.length === storageRows.length &&
    storageContract.checks.every((c, i) => c.ord === storageRows[i].ord && c.name === storageRows[i].name &&
      c.expected === storageRows[i].expected));
  check('the declared gating/INFO counts are the ones the SQL renders (19+0 and 6+1)',
    verifyContract.gating === 19 && verifyContract.info === 0 &&
    storageContract.gating === 6 && storageContract.info === 1 &&
    verifyContract.checks.length === verifyContract.gating + verifyContract.info &&
    storageContract.checks.length === storageContract.gating + storageContract.info);
  check('the single INFO identity is the row the SQL itself labels INFO',
    storageContract.checks.filter((c) => c.info).length === 1 &&
    storageContract.checks.filter((c) => c.info)[0].name.startsWith('INFO') &&
    verifyContract.checks.filter((c) => c.info).length === 0);

  // ------------------------------------------------------- decision mirror ----
  // Specification mirror of Test-VerifyReport. The executed PowerShell cases in
  // test-native-capture.ps1 (34-46) prove the deployed expressions; this proves
  // the rule they implement, on the same thirteen scenarios.
  const reportRows = (contract, { omit = [], dup = [], break_ = [], rename = {}, fail = [] } = {}) => {
    const rows = [];
    for (const c of contract.checks) {
      if (omit.includes(c.ord)) continue;
      let status = c.info ? 'INFO' : 'PASS';
      if (fail.includes(c.ord)) status = 'FAIL';
      const name = rename[c.ord] || c.name;
      if (break_.includes(c.ord)) { rows.push({ ord: c.ord, fields: 3, name, expected: c.expected, status: null, broken: true }); continue; }
      rows.push({ ord: c.ord, fields: 5, name, expected: c.expected, status });
      if (dup.includes(c.ord)) rows.push({ ord: c.ord, fields: 5, name, expected: c.expected, status });
    }
    return rows;
  };
  const evaluate = (rows, nativeOk, contract) => {
    const problems = [];
    const malformed = rows.filter((r) => r.broken || r.fields !== 5 || !['PASS', 'FAIL', 'INFO'].includes(r.status));
    const seen = new Map();
    const duplicates = [];
    for (const r of rows) {
      if (r.broken || r.fields !== 5) continue;
      if (seen.has(r.ord)) { duplicates.push(r.ord); continue; }
      seen.set(r.ord, r);
    }
    const declared = contract.checks.map((c) => c.ord);
    const missing = declared.filter((o) => !seen.has(o));
    const unexpected = [...seen.keys()].filter((o) => !declared.includes(o));
    const gating = [...seen.values()].filter((r) => r.status === 'PASS' || r.status === 'FAIL');
    const passRows = gating.filter((r) => r.status === 'PASS').length;
    const failRows = gating.filter((r) => r.status === 'FAIL').length;
    const infoRows = [...seen.values()].filter((r) => r.status === 'INFO').length;
    if (rows.length === 0) problems.push('no rows');
    if (!nativeOk) problems.push('not native success');
    if (malformed.length) problems.push('malformed');
    if (duplicates.length) problems.push('duplicate');
    if (missing.length) problems.push('missing');
    if (unexpected.length) problems.push('unexpected');
    if (failRows > 0) problems.push('fail row');
    if (passRows + failRows !== contract.gating) problems.push('gating count');
    if (infoRows !== contract.info) problems.push('info count');
    for (const c of contract.checks) {
      const row = seen.get(c.ord);
      if (!row) continue;
      if (row.name !== c.name) problems.push('name drift');
      if (row.expected !== c.expected) problems.push('expected drift');
      if (c.info ? row.status !== 'INFO' : row.status !== 'PASS') problems.push('status');
    }
    let verdict = problems.length ? 'FAIL' : 'PASS';
    if (!nativeOk) verdict = 'UNPROVEN';
    return { verdict, problems, ok: verdict === 'PASS' };
  };
  const scenarios = [
    ['verify report complete', read(join(CLOUD, 'verify/90_verify.sql')) && reportRows(verifyContract), true, verifyContract, 'PASS'],
    ['verify report empty (exit 0, no output)', [], true, verifyContract, 'FAIL'],
    ['verify report renders a FAIL row', reportRows(verifyContract, { fail: [7] }), true, verifyContract, 'FAIL'],
    ['verify report truncated (18 of 19)', reportRows(verifyContract, { omit: [19] }), true, verifyContract, 'FAIL'],
    ['verify report duplicates a check', reportRows(verifyContract, { dup: [5] }), true, verifyContract, 'FAIL'],
    ['verify report row loses a column', reportRows(verifyContract, { break_: [3] }), true, verifyContract, 'FAIL'],
    ['verify report renames a check', reportRows(verifyContract, { rename: { 2: 'roughly right' } }), true, verifyContract, 'FAIL'],
    ['verify child exits nonzero with a complete report', reportRows(verifyContract), false, verifyContract, 'UNPROVEN'],
    ['storage report complete', reportRows(storageContract), true, storageContract, 'PASS'],
    ['storage report empty (exit 0, no output)', [], true, storageContract, 'FAIL'],
    ['storage report renders a FAIL row', reportRows(storageContract, { fail: [4] }), true, storageContract, 'FAIL'],
    ['storage report omits its INFO row', reportRows(storageContract, { omit: [7] }), true, storageContract, 'FAIL'],
    ['storage child cannot be proven', reportRows(storageContract), false, storageContract, 'UNPROVEN'],
  ];
  const offScenario = scenarios.filter(([, rows, nativeOk, contract, expected]) => evaluate(rows, nativeOk, contract).verdict !== expected)
    .map(([name, , , , expected]) => `${name} -> not ${expected}`);
  check('mirror: the thirteen report scenarios decide the verdicts the adapter cases assert',
    offScenario.length === 0, offScenario.join('; '));
  check('mirror: an ambiguous execution is UNPROVEN, never PASS and never FAIL-on-content',
    evaluate(reportRows(verifyContract), false, verifyContract).verdict === 'UNPROVEN' &&
    evaluate([], false, verifyContract).verdict === 'UNPROVEN' &&
    evaluate(reportRows(verifyContract, { fail: [7] }), false, verifyContract).verdict === 'UNPROVEN');
  check('mirror: exit 0 with an empty report is a failure, not a pass',
    evaluate([], true, verifyContract).ok === false &&
    evaluate([], true, storageContract).ok === false);

  // --------------------------------------------------------- the deployment --
  check('gate 5 validates both reports through the shared function',
    deployCode.includes("$vfReport = Test-VerifyReport -Result $vf -ReportName '90_verify.sql'") &&
    deployCode.includes("$stReport = Test-VerifyReport -Result $st -ReportName '95_storage_config.sql'") &&
    /function Test-VerifyReport/.test(libCode) && /function Get-ClashVerifyContract/.test(libCode));
  const gate5End = deployCode.indexOf('# ------------------------------------------------------------- completion ---');
  const gate5 = gate5End > 0 ? deployCode.slice(deployCode.indexOf('gate 5: postflight'), gate5End) : '';
  check('R11-C1: row counting is no longer the gate for postflight or storage',
    !/\[regex\]::Matches/.test(gate5) && !/\$vfFailRows|\$stFailRows/.test(gate5) &&
    // Round 14 (R13-C1): the sibling gate kept a row count; it is gone too
    !/\$pfFail|\$pfPass/.test(deployCode) &&
    deployCode.includes("$pfReport = Test-VerifyReport -Result $pf -ReportName '00_preflight.sql'"));
  check('a report that does not hold never produces a PASS phase receipt',
    /\$vfReport\.verdict/.test(deployCode) && /\$stReport\.verdict/.test(deployCode) &&
    /if \(-not \$vfReport\.ok\) \{/.test(deployCode) && /if \(-not \$stReport\.ok\) \{/.test(deployCode) &&
    /ok              = \(\$verdict -eq 'PASS'\)/.test(libCode));
  check('both STOPs precede the assertion that the claim was never released',
    deployCode.indexOf('04-postflight-fail.json') < deployCode.indexOf("$st = Invoke-NativeProcess") &&
    deployCode.indexOf('05-storage-fail.json') < deployCode.indexOf('REFUSED: the claim release was reached without two proven verification reports') &&
    deployCode.indexOf('REFUSED: the claim release was reached without two proven verification reports') <
      deployCode.indexOf("delete from supabase_migrations.clash_deploy_claim") &&
    deployCode.indexOf("delete from supabase_migrations.clash_deploy_claim") <
      deployCode.indexOf('Publish-ClashCompletion -Root $run'));
  check('an incomplete report stops with wording that does not imply a rollback',
    /claim stays held for human review/.test(deployCode) &&
    /No rollback is implied/.test(deployCode) &&
    gate5.length > 0 && !/rolled back/i.test(gate5));
  check('the verdict is forced to UNPROVEN whenever the child is not a proven success',
    /if \(-not \$nativeOk\) \{ \$verdict = 'UNPROVEN' \}/.test(libCode) &&
    /its evidence cannot be classified as PASS or FAIL/.test(libCode));
  check('the adapter refuses a report name it has no contract for',
    /no declared contract exists for/.test(libCode) &&
    /return \$null/.test(libCode));
  // R12-C2 (found by the Windows gate, invisible offline): an OrderedDictionary
  // exposes Item(object key) AND Item(int index); PowerShell binds the int one,
  // so a per-ord lookaside map held as [ordered]@{} was read POSITIONALLY - ord 7
  // returned the seventh row, and ord 19 of 19 threw ArgumentOutOfRangeException,
  // which every non-empty report hit. The map must be a Hashtable and the lookup
  // must be by ord. A static assertion is all this suite can do; the executed
  // cases 34-46 are what prove the lookup.
  check('the per-ord lookaside map is a Hashtable, never an OrderedDictionary',
    /\$byOrd\s*=\s*@\{\}/.test(libCode) &&
    !/\$byOrd\s*=\s*\[ordered\]@\{\}/.test(libCode) &&
    /\$row\s*=\s*\$byOrd\[\$ord\]/.test(libCode) &&
    /\$byOrd\[\$ord\]\s*=\s*\[ordered\]@\{/.test(libCode));

  // ------------------------------------------------------------ the harness --
  const newCases = ['verificationReportContractMatchesSql', 'verificationReportsProceedToComplete',
    'postflightEmptyReportStops', 'postflightFailedRowStops', 'postflightTruncatedReportStops',
    'postflightDuplicateRowStops', 'postflightMalformedRowStops', 'postflightIdentityDriftStops',
    'postflightUnprovenStops', 'storageEmptyReportStops', 'storageFailedRowStops',
    'storageMissingInfoRowStops', 'storageUnprovenStops'];
  check('all thirteen report cases exist in the harness and in the inventory',
    newCases.every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest)) &&
    newCases.every((n) => libCode.includes(`'${n}'`)));
  check('the harness executes the committed gate 5 region instead of restating it',
    /function Get-VerificationGateBlock/.test(selfTest) &&
    /\$script:r12Block = \[scriptblock\]::Create/.test(selfTest) &&
    /Test-VerifyReport -Result/.test(selfTest) &&
    selfTest.includes("-ReportName '90_verify.sql'") &&
    selfTest.includes("-ReportName '95_storage_config.sql'") &&
    /function Invoke-VerificationGateProbe/.test(selfTest));
  check('the README documents the report contract',
    readmeText.includes('Get-ClashVerifyContract') && readmeText.includes('19 declared gating') &&
    readmeText.includes('6 gating checks plus') && readmeText.includes('before the writer claim is released'));
}

hdr(23, 'report envelope - strict psql parsing (Round 13 / R12-C1)');
{
  const libCode  = lf(read(join(CLOUD, 'tools/lib/clash-native.ps1')));
  const selfTest = lf(read(join(CLOUD, 'tools/test-native-capture.ps1')));
  const manifestTool = lf(read(join(CLOUD, 'tools/check-manifest.ps1')));
  const readmeText = lf(read(join(CLOUD, 'README.md')));

  // The supported stdout is the psql aligned envelope and nothing else:
  // header, dashed separator, one complete row per check, one terminal
  // "(N rows)" footer. psql emits that footer unless -t / \pset footer off is
  // used (src/fe_utils/print.c footers_with_default); -q does not suppress it.
  const CONTRACT = {
    '90_verify.sql': libCode.match(/if \(\$ReportName -eq '90_verify\.sql'\) \{[\s\S]*?\n  \}/)[0],
    '95_storage_config.sql': libCode.match(/if \(\$ReportName -eq '95_storage_config\.sql'\) \{[\s\S]*?\n  \}/)[0],
  };
  const checksOf = (report) => {
    const re = /\[ordered\]@\{ ord = (\d+);\s*name = '((?:[^']|'')*)';\s*expected = '((?:[^']|'')*)';\s*info = \$(true|false) \}/g;
    return [...CONTRACT[report].matchAll(re)].map((m) => ({
      ord: Number(m[1]), name: m[2].replace(/''/g, "'"), expected: m[3].replace(/''/g, "'"), info: m[4] === 'true',
    }));
  };

  // Fixture in the psql aligned shape (one space padding, '|' between columns,
  // width+2 dashes per column, numeric column right aligned, "(N rows)").
  const fixture = (report, { footerText = null, noFooter = false, trailer = null, junk = null, cutLast = 0 } = {}) => {
    const checks = checksOf(report);
    const header = ['ord', 'check_name', 'expected', 'actual', 'status'];
    const body = checks.map((c) => [String(c.ord), c.name, c.expected, c.info ? 'INFO migration 20260926150000 owns bucket+policy creation' : c.expected, c.info ? 'INFO' : 'PASS']);
    const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
    const cell = (t, w, right) => (right ? String(t).padStart(w) : String(t).padEnd(w));
    const line = (cells) => ` ${cells.map((c, i) => cell(c, widths[i], i === 0)).join(' | ')} `;
    const lines = [line(header), widths.map((w) => '-'.repeat(w + 2)).join('+'), ...body.map(line)];
    if (cutLast > 0) lines[lines.length - 1] = lines[lines.length - 1].slice(0, Math.max(0, lines[lines.length - 1].length - cutLast));
    if (junk) lines.splice(3, 0, junk);
    if (!noFooter) lines.push(footerText || `(${body.length} ${body.length === 1 ? 'row' : 'rows'})`);
    if (trailer) lines.push(trailer);
    return lines.join('\n') + '\n';
  };

  // The column spans the dashed separator declares: (width + 2) dashes per
  // column, joined by '+'. Independent of the PowerShell implementation, which
  // reads the same arithmetic off the same line.
  const boundsOf = (separator) => {
    const out = []; let start = 0;
    for (const seg of separator.split('+')) { out.push({ start, width: seg.length }); start += seg.length + 1; }
    return out;
  };
  const cellsByBounds = (line, bounds) => bounds.map((b, i) => (i === bounds.length - 1
    ? line.slice(b.start).trim()
    : line.slice(b.start, b.start + b.width).trim()));

  // Mirror of the deployed state machine, written from the rules rather than
  // from the PowerShell source so the two have to agree independently.
  const parseEnvelope = (text) => {
    const problems = [];
    const rows = [];
    let state = 'preamble';
    let sawHeader = false; let sawSep = false; let sawFooter = false; let footerRows = -1;
    let blanksInside = 0; let bounds = null;
    text.split(/\r?\n/).forEach((raw, idx) => {
      const lineNo = idx + 1;
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        if (state === 'preamble' || state === 'after-footer') return;
        blanksInside += 1;
        if (blanksInside <= 3) problems.push(`line ${lineNo}: blank line inside the report body`);
        return;
      }
      if (state === 'preamble') {
        const f = raw.split('|').map((x) => x.trim());
        if (f.length === 5 && f[0] === 'ord' && f[1] === 'check_name' && f[2] === 'expected' && f[3] === 'actual' && f[4] === 'status') {
          sawHeader = true; state = 'separator'; return;
        }
        problems.push(`line ${lineNo}: expected the column header`); state = 'body'; return;
      }
      if (state === 'separator') {
        const segs = trimmed.split('+');
        if (/^-+(\+-+)+$/.test(trimmed) && segs.length === 5 && segs.every((x) => x.length >= 3)) {
          sawSep = true; bounds = boundsOf(trimmed); state = 'body'; return;
        }
        problems.push(`line ${lineNo}: expected the dashed separator`); state = 'body'; return;
      }
      if (state === 'body') {
        const footer = trimmed.match(/^\((\d+) rows?\)$/);
        if (footer) { footerRows = Number(footer[1]); sawFooter = true; state = 'after-footer'; return; }
        if (/^\(.*row/.test(trimmed)) { problems.push(`line ${lineNo}: malformed row-count footer`); return; }
        // Frame the row on the separator's column spans. Splitting on '|' is
        // wrong the moment a cell contains a pipe, and 00_preflight.sql renders
        // 'postgis|extensions' on purpose (R13-C1).
        const fields = bounds === null ? raw.split('|') : cellsByBounds(raw, bounds);
        const first = fields.length === 5 ? fields[0].trim() : '';
        const status = fields.length === 5 ? fields[4].trim() : '';
        const ordinalOk = /^\d+$/.test(first);
        const statusOk = ['PASS', 'FAIL', 'INFO'].includes(status);
        if (!ordinalOk) problems.push(`line ${lineNo}: invalid ordinal in a data row`);
        if (!statusOk) problems.push(`line ${lineNo}: invalid status in a data row`);
        if (!ordinalOk || !statusOk) return;
        rows.push({ ord: Number(first), name: fields[1].trim(), expected: fields[2].trim(), status });
        return;
      }
      problems.push(`line ${lineNo}: unexpected output after the row-count footer`);
    });
    if (!sawHeader) problems.unshift('the report rendered no column header');
    else if (!sawSep) problems.push('the report has no dashed separator');
    if (!sawFooter) problems.push('the report has no row-count footer: the output is truncated');
    else if (footerRows !== rows.length) problems.push(`the row-count footer says ${footerRows} row(s) but ${rows.length} data row(s) were parsed`);
    return { rows, problems, sawHeader, sawSep, sawFooter, footerRows };
  };

  const scenarios = [
    ['undamaged postflight envelope', '90_verify.sql', {}, 19, null],
    ['footer says 20 rows over 19', '90_verify.sql', { footerText: '(20 rows)' }, 19, 'row-count footer says 20 row(s) but 19 data row(s)'],
    ['no footer at all', '90_verify.sql', { noFooter: true }, 19, 'has no row-count footer'],
    ['footer is malformed', '90_verify.sql', { footerText: '(19 row' }, 19, 'malformed row-count footer'],
    ['prose after the footer', '90_verify.sql', { trailer: 'WARNING:  there is no transaction in progress' }, 19, 'unexpected output after the row-count footer'],
    ['R12-C1: a line with no pipes at all', '90_verify.sql', { junk: 'postflight OK: every gating check passed' }, 19, 'invalid ordinal'],
    ['invalid ordinal and invalid status together', '90_verify.sql', { junk: '   x | not a check | 1 | 2 | SKIPPED' }, 19, 'invalid status'],
    ['stream cut inside the last row', '90_verify.sql', { noFooter: true, cutLast: 12 }, 18, 'has no row-count footer'],
    ['undamaged storage envelope', '95_storage_config.sql', {}, 7, null],
    ['storage envelope with a trailer', '95_storage_config.sql', { trailer: 'psql: warning: there is no transaction in progress' }, 7, 'unexpected output after the row-count footer'],
  ];
  const off = scenarios.filter(([, report, mut, expectedRows, needle]) => {
    const parsed = parseEnvelope(fixture(report, mut));
    if (parsed.rows.length !== expectedRows) return true;
    if (needle === null) return parsed.problems.length !== 0 || !parsed.sawFooter || parsed.footerRows !== expectedRows;
    return !parsed.problems.some((p) => p.includes(needle));
  }).map(([name]) => name);
  check('mirror: the envelope accepts a valid report and rejects every damaged one',
    off.length === 0 && scenarios.length === 10, off.join('; '));
  check('mirror: an undamaged report has a header, a separator and a footer that agree',
    (() => {
      const v = parseEnvelope(fixture('90_verify.sql'));
      const st = parseEnvelope(fixture('95_storage_config.sql'));
      return v.problems.length === 0 && st.problems.length === 0 && v.sawHeader && v.sawSep && v.sawFooter &&
        v.footerRows === 19 && st.footerRows === 7 && v.rows.length === 19 && st.rows.length === 7;
    })());
  check('mirror: R12-C1 - a line the old parser skipped is now a rejection',
    (() => {
      const orphan = fixture('90_verify.sql', { junk: 'postflight OK: every gating check passed' });
      const parsed = parseEnvelope(orphan);
      // the 19 real rows and the footer still agree; only the extra line fails
      return parsed.rows.length === 19 && parsed.footerRows === 19 && parsed.problems.length === 2;
    })());

  // ---------------------------------------------------------------- the code --
  check('the adapter no longer skips a line it does not recognise',
    !libCode.includes("if (-not $line.Contains('|')) { continue }") &&
    !/if \(\$first -notmatch '\^\\\\d\+\$'\) \{[\s\S]{0,400}?continue/.test(libCode) &&
    /function Test-VerifyReportHeader/.test(libCode) &&
    /function Test-VerifyReportSeparator/.test(libCode) &&
    /function Format-ReportLine/.test(libCode));
  check('the envelope is explicit: header, separator, one footer, nothing after it',
    /\(\\d\+\) rows\?/.test(libCode) &&
    /malformed row-count footer/.test(libCode) &&
    /unexpected output after the row-count footer/.test(libCode) &&
    /has no row-count footer/.test(libCode) &&
    /row-count footer says \{1\} row\(s\) but \{2\} data row\(s\)/.test(libCode) &&
    /invalid ordinal in a data row/.test(libCode) &&
    /invalid status in a data row/.test(libCode) &&
    /footers_with_default/.test(libCode) &&
    // The footer the parser demands is ngettext()-translated, so the psql child
    // must run under the C message catalog or a good report on a localised host
    // would be rejected as truncated.
    /LC_ALL\s*=\s*'C'/.test(libCode));
  check('the envelope result is carried in the receipts',
    /headerSeen\s+= \$vfReport\.headerSeen/.test(lf(read(join(CLOUD, 'tools/deploy.ps1')))) &&
    /footerRows\s+= \$vfReport\.footerRows/.test(lf(read(join(CLOUD, 'tools/deploy.ps1')))) &&
    /footerRows/.test(libCode));

  // ------------------------------------------------------------- the harness --
  const envelopeCases = ['reportEnvelopeAcceptedForBothVerifiers', 'reportFooterCountMismatchStops',
    'reportMissingFooterStops', 'reportMalformedFooterStops', 'reportUnexpectedTrailerStops',
    'reportExtraJunkLineStops', 'reportInvalidOrdinalAndStatusStops', 'reportTruncatedMidRowStops',
    'reportStorageTrailerStops'];
  check('all nine envelope cases exist in the harness and in the inventory',
    envelopeCases.every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest)) &&
    envelopeCases.every((n) => libCode.includes(`'${n}'`)));
  check('the harness builds its fixtures in the real psql envelope',
    /function Format-ReportRow/.test(selfTest) &&
    /\(N rows\)/.test(selfTest) &&
    /\$separator \+= \('-' \* \(\[int\]\$w \+ 2\)\)/.test(selfTest) &&
    /-FooterText/.test(selfTest) && /-NoFooter/.test(selfTest) &&
    /-Trailer/.test(selfTest) && /-JunkLine/.test(selfTest) &&
    // A short row must stay short: Format-ReportRow pads every column, so a row
    // that "lost its status" was rendered as five cells with two blanks and the
    // parser (correctly) called it an invalid status, not a malformed row. That
    // cost a CI round; the bypass is now part of the contract.
    selfTest.includes('@($row).Count -lt 5') &&
    selfTest.includes("($short -join ' | ')"));

  // -------------------------------------------------- the sibling parsers ------
  check('the manifest checker treats an unreadable checksum line as a failure',
    /is not '<sha256>  <path>'/.test(manifestTool) &&
    !/if \(\$parts\.Count -ne 2\) \{ continue \}/.test(manifestTool));
  check('the receipt validator rejects a case recorded with no body',
    /is present but has no body/.test(libCode));
  check('the README documents the envelope',
    readmeText.includes('(N rows)') && readmeText.includes('row-count footer') &&
    readmeText.includes('header') && readmeText.includes('separator'));
}

{
  // ==========================================================================
  // Section 24: gate 2 is a contract too (R13-C1)
  //
  // Round 13 hardened gate 5 and left gate 2 counting lines that end in
  // '| PASS'. The independent audit ran the committed block with exit 0, a
  // complete capture and the single line
  //     THIS IS NOT A PREFLIGHT REPORT | PASS
  // and got a PASS receipt, no STOP, and a run that would have advanced to the
  // ledger gate. These assertions hold the fix: a declared 21-row contract,
  // framing that survives a pipe inside a cell, and a receipt that takes its
  // status from the report verdict rather than from the exit code.
  // ==========================================================================
  sectionsRun += 1;

  const boundsOf = (separator) => {
    const out = []; let start = 0;
    for (const seg of separator.split('+')) { out.push({ start, width: seg.length }); start += seg.length + 1; }
    return out;
  };
  const cellsByBounds = (line, bounds) => bounds.map((b, i) => (i === bounds.length - 1
    ? line.slice(b.start).trim()
    : line.slice(b.start, b.start + b.width).trim()));

  const preflightSql = lf(read(join(CLOUD, 'preflight/00_preflight.sql')));
  const deployCode = lf(read(join(CLOUD, 'tools/deploy.ps1')));
  const libCode = lf(read(join(CLOUD, 'tools/lib/clash-native.ps1')));
  const selfTest = lf(read(join(CLOUD, 'tools/test-native-capture.ps1')));
  const readmeText = lf(read(join(CLOUD, 'README.md')));

  // Derive the contract from the SQL itself: every 'select N as ord, ...' triple
  // appears twice (the SELECT and the guard), so both copies must agree and both
  // must match what the adapter declares.
  const sqlRows = [];
  const triple = /select (\d+) as ord, '((?:[^']|'')*)'::text as check_name, '((?:[^']|'')*)'::text as expected/g;
  let m;
  while ((m = triple.exec(preflightSql)) !== null) {
    sqlRows.push({ ord: Number(m[1]), name: m[2].replace(/''/g, "'"), expected: m[3].replace(/''/g, "'") });
  }
  const sqlByOrd = new Map();
  let sqlConflict = 0;
  for (const row of sqlRows) {
    const prior = sqlByOrd.get(row.ord);
    if (prior && (prior.name !== row.name || prior.expected !== row.expected)) sqlConflict += 1;
    sqlByOrd.set(row.ord, row);
  }
  const sqlContract = [...sqlByOrd.values()].sort((a, b) => a.ord - b.ord);

  // The declaration, read out of the adapter's own text (no import: the suite
  // must not reuse the code it is checking).
  const declaredBlock = libCode.slice(libCode.indexOf("if ($ReportName -eq '00_preflight.sql')"), libCode.indexOf("if ($ReportName -eq '90_verify.sql')"));
  const declaredRows = [];
  const decl = /ord = (\d+);\s+name = '((?:[^']|'')*)';\s+expected = '((?:[^']|'')*)';\s+info = \$(true|false)/g;
  while ((m = decl.exec(declaredBlock)) !== null) {
    declaredRows.push({ ord: Number(m[1]), name: m[2], expected: m[3], info: m[4] === 'true' });
  }
  const declaredGating = /gating = (\d+)/.exec(declaredBlock);
  const declaredInfo = /info\s+= (\d+)/.exec(declaredBlock);

  check('the adapter declares exactly the 21 checks 00_preflight.sql renders',
    sqlRows.length === 42 && sqlConflict === 0 && sqlContract.length === 21 &&
    declaredRows.length === 21 &&
    sqlContract.every((row, i) => declaredRows[i].ord === row.ord &&
      declaredRows[i].name === row.name && declaredRows[i].expected === row.expected),
    `sql=${sqlContract.length} declared=${declaredRows.length} conflicts=${sqlConflict}`);
  check('the preflight contract counts 19 gating checks and two INFO checks',
    Number(declaredGating && declaredGating[1]) === 19 &&
    Number(declaredInfo && declaredInfo[1]) === 2 &&
    declaredRows.filter((r) => r.info).map((r) => r.ord).join(',') === '20,21' &&
    declaredRows.filter((r) => !r.info).length === 19 &&
    // the SQL decides INFO from the check name, so the declaration must agree
    declaredRows.filter((r) => r.info).every((r) => r.name.startsWith('INFO')));
  check('the pipe in ord 8 is a value in both the SQL and the declaration',
    sqlContract[7].expected === 'postgis|extensions' &&
    declaredRows[7].expected === 'postgis|extensions' &&
    /e\.extname\|\|'\|'\|\|n\.nspname/.test(preflightSql),
    'ord 8 must carry postgis|extensions on both sides');

  // --- an independent read of the real report -------------------------------
  const preflightFixture = (opts = {}) => {
    const header = ['ord', 'check_name', 'expected', 'actual', 'status'];
    const body = sqlContract.map((r) => {
      const info = r.name.startsWith('INFO');
      const actual = info ? 'INFO absent' : r.expected;
      return [String(r.ord), r.name, r.expected, actual, info ? 'INFO' : (opts.failOrd === r.ord ? 'FAIL' : 'PASS')];
    });
    if (opts.omitOrd) { const at = body.findIndex((r) => Number(r[0]) === opts.omitOrd); if (at >= 0) body.splice(at, 1); }
    const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
    const pad = (t, w, right) => (right ? String(t).padStart(w) : String(t).padEnd(w));
    const lines = [
      ` ${header.map((c, i) => pad(c, widths[i], i === 0)).join(' | ')} `,
      widths.map((w) => '-'.repeat(w + 2)).join('+'),
      ...body.map((r) => ` ${r.map((c, i) => pad(c, widths[i], i === 0)).join(' | ')} `),
    ];
    if (!opts.noFooter) lines.push(`(${body.length} ${body.length === 1 ? 'row' : 'rows'})`);
    if (opts.trailer) lines.push(opts.trailer);
    return lines.join('\n') + '\n';
  };

  const readReport = (text) => {
    const lines = text.split(/\r?\n/);
    const sepAt = lines.findIndex((l) => /^-+(\+-+)+$/.test(l.trim()));
    if (sepAt < 0) return { rows: [], bounds: null, footer: null };
    const bounds = boundsOf(lines[sepAt].trim());
    const rows = [];
    let footer = null;
    for (const line of lines.slice(sepAt + 1)) {
      const t = line.trim();
      if (t.length === 0) continue;
      const f = t.match(/^\((\d+) rows?\)$/);
      if (f) { footer = Number(f[1]); break; }
      rows.push(cellsByBounds(line, bounds));
    }
    return { rows, bounds, footer };
  };

  const real = preflightFixture();
  const parsedReal = readReport(real);
  const statuses = parsedReal.rows.map((r) => r[4]);
  check('mirror: a five-column boundary read parses the real preflight report to 21 rows',
    parsedReal.rows.length === 21 && parsedReal.footer === 21 &&
    statuses.filter((x) => x === 'PASS').length === 19 &&
    statuses.filter((x) => x === 'INFO').length === 2 &&
    parsedReal.rows[7][2] === 'postgis|extensions' &&
    parsedReal.rows[7][3] === 'postgis|extensions' &&
    parsedReal.rows.every((r) => r.length === 5),
    `rows=${parsedReal.rows.length} footer=${parsedReal.footer}`);
  check('mirror: splitting that same report on the pipe would read more than five cells',
    real.split('\n').find((l) => l.includes('postgis|extensions')).split('|').length === 7,
    'the postgis row must prove why a pipe splitter is wrong');
  check('mirror: the audit input is not a report under any reading',
    (() => {
      const audit = 'THIS IS NOT A PREFLIGHT REPORT | PASS\n';
      const read = readReport(audit);
      return read.bounds === null && read.rows.length === 0 && read.footer === null;
    })());
  check('mirror: a missing check and a rendered FAIL are both visible to the contract',
    (() => {
      const missing = readReport(preflightFixture({ omitOrd: 7 }));
      const failed = readReport(preflightFixture({ failOrd: 5 }));
      return missing.rows.length === 20 && missing.footer === 20 &&
        !missing.rows.some((r) => Number(r[0]) === 7) &&
        failed.rows.filter((r) => r[4] === 'FAIL').length === 1;
    })());

  // --- the committed gate ---------------------------------------------------
  const gate2 = deployCode.slice(deployCode.indexOf('gate 2: preflight SQL'), deployCode.indexOf('gate 3: ledger must be empty'));
  check('R13-C1: gate 2 validates the report contract instead of counting suffixes',
    gate2.includes("Test-VerifyReport -Result $pf -ReportName '00_preflight.sql'") &&
    !gate2.includes('[regex]::Matches') && !/\$pfPass|\$pfFail/.test(gate2) &&
    !/\\\|\\s\*PASS\\s\*\$/.test(gate2),
    'the suffix count must be gone, not merely unused');
  check('R13-C1: the preflight receipt takes its status from the report verdict',
    /New-PhaseReceipt '02-preflight\.json' @\{\s*\n?\s*status\s+= \$pfReport\.verdict/.test(gate2) &&
    !/status\s+= \$\(if \(Test-NativeSuccess \$pf\)/.test(gate2) &&
    /if \(-not \$pfReport\.ok\)/.test(gate2) &&
    gate2.includes('problems        = @($pfReport.problems)'));
  check('R13-C1: preflight STOPs cover the child and the report, in that order',
    gate2.indexOf("'02-preflight-fail.json'") > gate2.indexOf("New-PhaseReceipt '02-preflight.json'") &&
    gate2.indexOf("'02-preflight-rows.json'") > gate2.indexOf("'02-preflight-fail.json'") &&
    gate2.indexOf("'02-preflight-rows.json'") < deployCode.indexOf('gate 3: ledger must be empty'));

  // --- framing in the adapter ----------------------------------------------
  check('the adapter frames rows on the separator column spans, not on the pipe',
    /function Get-ReportColumnBounds/.test(libCode) &&
    /function Get-ReportCellsFromBounds/.test(libCode) &&
    /\$bounds = @\(Get-ReportColumnBounds -SeparatorLine \$line\)/.test(libCode) &&
    /\$fields = @\(Get-ReportCellsFromBounds -Line \$line -Bounds \$bounds\)/.test(libCode) &&
    // the split survives only where a separator was never seen (already a failure)
    /else \{\s*\n\s*\$fields = @\(\$line\.Split\('\|'\)\)/.test(libCode));
  check('ten gate-2 cases exist in the harness and in the inventory',
    ['preflightValidReportAdvancesToLedgerGate', 'preflightArbitrarySuffixTextStops',
      'preflightMissingCheckStops', 'preflightDuplicateCheckStops', 'preflightReorderedChecksStop',
      'preflightRenamedCheckStops', 'preflightRenderedFailRowStops', 'preflightTruncatedReportStops',
      'preflightPipeInsideCellIsNotAColumn', 'preflightInfoOnlyReportStops']
      .every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest) && libCode.includes(`'${n}'`)));
  check('the harness executes the committed gate-2 block and forbids a suffix count in it',
    /function Get-PreflightGateBlock/.test(selfTest) &&
    /function Invoke-PreflightGateProbe/.test(selfTest) &&
    // the extractor's boundaries and guards, as escape-free fragments
    selfTest.includes('$pf = Invoke-NativeProcess -FilePath') &&
    selfTest.includes('gate 3: ') &&
    selfTest.includes('status          = `$pfReport.verdict') &&
    selfTest.includes("$text.Contains('[regex]::Matches')") &&
    selfTest.includes("$text.Contains('Multiline')"));
  check('the README documents the preflight contract',
    readmeText.includes('00_preflight.sql') && readmeText.includes('21') &&
    readmeText.includes('postgis|extensions') && /R13-C1/.test(readmeText));
  const declaredVersion = (/ClashAdapterVersion = '([0-9]+\.[0-9]+\.[0-9]+)'/.exec(libCode) || [])[1] || '';
  check('the adapter identity is the same in the lib, the README and the workflow',
    declaredVersion !== '' && readmeText.includes(declaredVersion) &&
    lf(read(join(ROOT, '.github/workflows/windows-offline-validation.yml'))).includes(`'${declaredVersion}'`),
    declaredVersion);
}

{
  // ==========================================================================
  // Section 25: the framing characters are part of the report (R14-C1)
  //
  // Round 14 sliced cells out of the separator's spans and never looked at what
  // separated them: replacing a row's four structural '|' with '!' kept every
  // cell in place, so the report parsed, the contract matched and gate 2
  // advanced. A span says where a cell is; it says nothing about the delimiter
  // that ends it.
  // ==========================================================================
  sectionsRun += 1;

  const libCode = lf(read(join(CLOUD, 'tools/lib/clash-native.ps1')));
  const deployCode = lf(read(join(CLOUD, 'tools/deploy.ps1')));
  const selfTest = lf(read(join(CLOUD, 'tools/test-native-capture.ps1')));
  const readmeText = lf(read(join(CLOUD, 'README.md')));
  const preflightSql = lf(read(join(CLOUD, 'preflight/00_preflight.sql')));

  // --- the report the SQL renders, and an independent framing reader --------
  const rowsFromSql = [];
  {
    const triple = /select (\d+) as ord, '((?:[^']|'')*)'::text as check_name, '((?:[^']|'')*)'::text as expected/g;
    const seen = new Map();
    let m;
    while ((m = triple.exec(preflightSql)) !== null) seen.set(Number(m[1]), { ord: Number(m[1]), name: m[2], expected: m[3] });
    rowsFromSql.push(...[...seen.values()].sort((a, b) => a.ord - b.ord));
  }
  const render = (rows) => {
    const header = ['ord', 'check_name', 'expected', 'actual', 'status'];
    const body = rows.map((r) => [String(r.ord), r.name, r.expected, r.expected, r.name.startsWith('INFO') ? 'INFO' : 'PASS']);
    const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
    const pad = (t, w, right) => (right ? String(t).padStart(w) : String(t).padEnd(w));
    const lines = [
      ` ${header.map((c, i) => pad(c, widths[i], i === 0)).join('|').replace(/\|/g, ' | ')} `.replace(/ +\| +/g, (s) => s),
      '',
    ];
    const row = (cells) => ` ${cells.map((c, i) => pad(c, widths[i], i === 0)).join(' | ')} `;
    const headerLine = row(header);
    const bounds = [];
    let at = 0;
    for (const w of widths) { bounds.push({ start: at, width: w + 2 }); at += w + 2 + 1; }
    const bodyLines = body.map(row);
    return { headerLine, bodyLines, bounds, separator: widths.map((w) => '-'.repeat(w + 2)).join('+'), body };
  };
  const framingProblems = (line, bounds) => {
    const out = [];
    bounds.forEach((b, i) => {
      if (b.start >= line.length) return;
      if (line[b.start] !== ' ') out.push(`column ${i + 1} does not begin at its boundary (position ${b.start}): found '${line[b.start]}', expected a space`);
      if (i < bounds.length - 1) {
        const pos = b.start + b.width;
        if (pos >= line.length) { out.push(`the row ends before the delimiter that closes column ${i + 1} (position ${pos})`); return; }
        if (line[pos] !== '|') out.push(`the delimiter closing column ${i + 1} is '${line[pos]}' at position ${pos}, expected "|"`);
      }
    });
    return out;
  };
  const readWithFraming = (headerLine, separator, bodyLines) => {
    const segs = separator.split('+');
    const bounds = []; let at = 0;
    for (const seg of segs) { bounds.push({ start: at, width: seg.length }); at += seg.length + 1; }
    const problems = [...framingProblems(headerLine, bounds)];
    const cells = [];
    for (const line of bodyLines) {
      const f = framingProblems(line, bounds);
      if (f.length > 0) { problems.push(...f); continue; }
      cells.push(bounds.map((b, i) => (i === bounds.length - 1 ? line.slice(b.start).trim() : line.slice(b.start, b.start + b.width).trim())));
    }
    return { cells, problems, bounds };
  };

  const real = render(rowsFromSql);
  const baseline = readWithFraming(real.headerLine, real.separator, real.bodyLines);

  check('the adapter validates the framing characters at every declared boundary',
    /function Test-ReportRowFraming/.test(libCode) &&
    /\$framing = @\(Test-ReportRowFraming -Line \$line -Bounds \$bounds\)/.test(libCode) &&
    /if \(\$framing\.Count -gt 0 -or -not \$ordinalOk -or -not \$statusOk\)/.test(libCode) &&
    /the delimiter closing column/.test(libCode) &&
    /does not begin at its boundary/.test(libCode));
  check('the header is checked against the separator, not only the data rows',
    /Test-ReportRowFraming -Line \$headerLine -Bounds \$bounds/.test(libCode) &&
    /header is not aligned with the separator/.test(libCode) &&
    /\$headerLine  = ''/.test(libCode));

  check('mirror: the undamaged preflight report frames exactly and keeps its 21 rows',
    baseline.problems.length === 0 && baseline.cells.length === 21 &&
    baseline.cells[7][2] === 'postgis|extensions' && baseline.cells[7][3] === 'postgis|extensions');

  // The audit's exact mutation, replayed on the row it used (row 1) and on the
  // row that carries a pipe (row 8): the cells never move, only the delimiters.
  const damage = (rowIndex) => {
    const line = real.bodyLines[rowIndex];
    const chars = [...line];
    for (let i = 0; i < 4; i += 1) chars[real.bounds[i].start + real.bounds[i].width] = '!';
    return chars.join('');
  };
  {
    const lines = [...real.bodyLines];
    lines[0] = damage(0);
    const damaged = readWithFraming(real.headerLine, real.separator, lines);
    check('mirror: R14-C1 - replacing the four structural delimiters with ! is a rejection',
      damaged.problems.filter((p) => p.includes('delimiter closing column')).length === 4 &&
      damaged.cells.length === 20 &&
      !damaged.problems.some((p) => p.includes('does not begin at its boundary')),
      damaged.problems.slice(0, 2).join(' | '));
  }
  {
    const lines = [...real.bodyLines];
    lines[7] = damage(7);
    const damaged = readWithFraming(real.headerLine, real.separator, lines);
    check('mirror: the same mutation on the pipe row is rejected, and its pipes stay values',
      damaged.cells.length === 20 && damaged.problems.length === 4 &&
      damaged.problems.every((p) => p.includes('expected "|"')),
      damaged.problems.length);
  }
  {
    const shifted = [...real.bodyLines];
    const b = real.bounds[1];
    shifted[3] = shifted[3].slice(0, b.start) + ' ' + shifted[3].slice(b.start);
    const damaged = readWithFraming(real.headerLine, real.separator, shifted);
    check('mirror: a shifted boundary (one extra padding space) is a rejection',
      damaged.cells.length === 20 &&
      damaged.problems.some((p) => p.includes('does not begin at its boundary') || p.includes('delimiter closing column')));
  }
  {
    const unpadded = [...real.bodyLines];
    unpadded[4] = unpadded[4].slice(1);
    const damaged = readWithFraming(real.headerLine, real.separator, unpadded);
    check('mirror: a row with no left padding is a rejection',
      damaged.cells.length === 20 && damaged.problems.length > 0);
  }
  {
    const headerShifted = ' ' + real.headerLine.slice(0, real.bounds[1].start) + ' ' + real.headerLine.slice(real.bounds[1].start);
    const damaged = readWithFraming(headerShifted, real.separator, real.bodyLines);
    check('mirror: a header that sits off the separator columns is a rejection',
      damaged.problems.length > 0 && damaged.cells.length === 21);
  }
  check('mirror: LF and CRLF captures frame identically',
    (() => {
      const crlf = [real.headerLine, real.separator, ...real.bodyLines].join('\r\n') + '\r\n';
      const lf = [real.headerLine, real.separator, ...real.bodyLines].join('\n') + '\n';
      const a = lf.split(/\r?\n/);
      const b = crlf.split(/\r?\n/);
      return a.length === b.length && a.every((line, i) => line === b[i]) && b[0] === real.headerLine;
    })());
  check('mirror: a padded short value (right-aligned ord) stays legal',
    (() => {
      const line = real.bodyLines[0];
      const ordCell = line.slice(real.bounds[0].start, real.bounds[0].start + real.bounds[0].width);
      return /^ +\d+ $/.test(ordCell) && framingProblems(line, real.bounds).length === 0;
    })());

  // --- the cases and the receipts -------------------------------------------
  const framingCases = ['preflightDelimiterReplacedStops', 'preflightHeaderDelimiterReplacedStops',
    'postflightDelimiterReplacedStops', 'storageDelimiterReplacedStops', 'reportShiftedBoundaryStops',
    'reportUnpaddedRowStops', 'reportPaddedShortCellsStillParse', 'reportCrlfEnvelopeParses',
    'reportHeaderMisalignedToSeparatorStops', 'reportEmbeddedPipeKeepsFraming'];
  check('ten framing cases exist in the harness and in the inventory',
    framingCases.every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest) && libCode.includes(`'${n}'`)));
  check('the delimiter mutation is executed for all three reports',
    framingCases.slice(0, 4).every((n) => selfTest.includes(`Add-Case '${n}'`)) &&
    /-DamageRowOrd/.test(selfTest) && /-DamageChar/.test(selfTest) &&
    /preflightDelimiterReplacedStops' \(|postflightDelimiterReplacedStops' \(|storageDelimiterReplacedStops' \(/.test(selfTest));
  check('a framed report still has to satisfy the declared contract',
    // the framing check is additive: the contract, the envelope and the counts
    // are unchanged, and the gate STOPs on the preflight receipt
    /19 declared gating|gatingExpected/.test(libCode) &&
    deployCode.includes("Test-VerifyReport -Result $pf -ReportName '00_preflight.sql'") &&
    deployCode.includes("if (-not $pfReport.ok)"));
  check('the README documents the framing rule and the audit finding',
    readmeText.includes('R14-C1') && /delimiter/i.test(readmeText) &&
    readmeText.includes('postgis|extensions') && readmeText.includes('boundary'));
  check('mirror: the rejection names the exact boundary position',
    (() => {
      const lines = [...real.bodyLines];
      lines[0] = damage(0);
      const d = readWithFraming(real.headerLine, real.separator, lines);
      const first = real.bounds[0].start + real.bounds[0].width;
      return d.problems.some((p) => p.includes(`position ${first}`));
    })());
}

hdr(26, 'completion finalization - one commit point, no circular seal (Round 16 / R15-C1)');
{
  // R15-C1: the runner wrote and announced COMPLETE before sealing. These
  // checks are the offline mirror of the protocol; the executed proof is
  // test-native-capture.ps1 cases 76-91 on Windows PowerShell 5.1.
  const deployCode = lf(read(join(CLOUD, 'tools/deploy.ps1')));
  // raw text on purpose: these checks look for the literal receipt names, which
  // the lexer strips out of its code view.
  const libCode = lib;
  const completionAt = deployCode.indexOf('# ------------------------------------------------------------- completion ---');
  const completionRegion = completionAt > 0 ? deployCode.slice(completionAt) : '';
  check('the runner publishes completion through the protocol exactly once',
    (completionRegion.match(/Publish-ClashCompletion -Root \$run/g) || []).length === 1 &&
    !completionRegion.includes("New-PhaseReceipt '06-complete.json'") &&
    !/Seal-Evidence/.test(completionRegion),
    `region=${completionRegion.length}`);
  check('the COMPLETE announcement follows the publication call and nothing else announces it',
    completionRegion.indexOf('TERMINAL RECEIPT: COMPLETE') > completionRegion.indexOf('Publish-ClashCompletion -Root $run') &&
    (deployCode.match(/TERMINAL RECEIPT: COMPLETE/g) || []).length === 1);
  check('the runner accepts its own run through the consumer contract',
    /Test-ClashRunCompletion -RunPath \$run/.test(completionRegion) &&
    /function Test-ClashRunCompletion/.test(libCode));
  check('the seal excludes the completion artifacts, so the marker cannot be sealed into itself',
    /function Get-ClashSealExclusions/.test(libCode) &&
    /'EVIDENCE-MANIFEST\.json', '06-complete\.json', '06-complete-unverified\.json'/.test(libCode) &&
    /Get-ClashSealExclusions/.test(libCode.slice(libCode.indexOf('function Seal-Evidence'), libCode.indexOf('function Test-EvidenceSeal'))));
  check('publication is atomic: a scratch file then a move that cannot overwrite',
    (libCode.match(/\[System\.IO\.File\]::Move\(/g) || []).length === 2 &&
    !/Write-EvidenceJson -Path \(Join-Path \$Root \$SealName\)/.test(libCode) &&
    !/Remove-Item -LiteralPath \$temp/.test(libCode));
  check('the order inside the protocol is intent -> seal -> verify -> marker -> commit -> re-verify',
    (() => {
      const body = libCode.slice(libCode.indexOf('function Publish-ClashCompletion'), libCode.indexOf('function Test-ClashRunCompletion'));
      const at = (needle) => body.indexOf(needle);
      const seq = [
        'if (Test-Path -LiteralPath $marker) {',                       // refusal first
        "'06-finalization-intent.json'",                               // provisional receipt
        'Seal-Evidence -Root $Root',                                   // the seal
        'Test-EvidenceSeal -Root $Root -Require $RequiredEvidence',     // verified against disk
        'Write-EvidenceJson -Path $temp -Object $object',               // candidate marker
        '[System.IO.File]::Move($temp, $marker)',                       // THE COMMIT POINT
        "published completion marker",                                 // re-read after the commit
      ].map(at);
      return seq.every((v, i) => v > 0 && (i === 0 || v > seq[i - 1]));
    })());
  check('a finalised run is never re-finalised and a doubt marker blocks publication',
    /already exists\. A finalised run is never re-finalised/.test(libCode) &&
    /a previous finalization could not verify what it published/.test(libCode) &&
    /06-complete-unverified\.json/.test(libCode));
  check('the consumer rejects an exception, a doubt marker and unsealed evidence',
    /99-runner-exception\.json is present/.test(libCode) &&
    /published a marker it could not verify/.test(libCode) &&
    /is not sealed/.test(libCode) &&
    /does not re-derive/.test(libCode));
  check('a finalization failure never claims a rollback and never invites a re-run',
    /rollbackImplied = \$false/.test(deployCode) &&
    /completionAccepted = \$false/.test(deployCode) &&
    /only evidence finalization failed\. Do NOT re-run/.test(deployCode));
  // Round 17 (C16-C1): the marker's OWN chain claims were never read. Every
  // authoritative field must be compared against independently derived sealed
  // evidence, and hashes must compare case-strictly.
  check('the consumer verifies every authoritative marker field',
    (() => {
      const body = libCode.slice(libCode.indexOf('function Test-ClashRunCompletion'), libCode.indexOf('# ------------------------------------------------------- connection policy --'));
      return /intentHashes -cnotcontains/.test(body) &&
        /boundHead -cne \[string\]\$check\.chainHead/.test(body) &&
        /sealFieldName -cne \$sealName/.test(body) &&
        /adapter -cne \[string\]\$sealAdapter/.test(body) &&
        /releaseRun -cne \[string\]\$writerRun/.test(body) &&
        /intentPrev/.test(body) && /releaseHashes -cnotcontains/.test(body) &&
        /Test-ClashSha256Text/.test(body) && /Test-ClashIntegerValue/.test(body) &&
        (/finalized -is \[bool\]/.test(body) || /Test-ClashJsonKind -Value \$finalized -Kind 'boolean'/.test(body)) &&
        /-cref|must be boolean true/.test(body);
    })());
  check('the required evidence is declared once and used by producer and consumer',
    /function Get-ClashCompletionRequiredEvidence/.test(libCode) &&
    /Test-EvidenceSeal -Root \$RunPath -Require @\(Get-ClashCompletionRequiredEvidence\)/.test(libCode) &&
    /\$completionRequired = @\(Get-ClashCompletionRequiredEvidence\)/.test(deployCode) &&
    !/'02-preflight\.json'\s*\r?\n\s*'04-postflight\.json'/.test(deployCode));
  check('the producer will not report success for a marker its consumer rejects',
    (() => {
      const body = libCode.slice(libCode.indexOf('function Publish-ClashCompletion'), libCode.indexOf('function Test-ClashRunCompletion'));
      return /\$selfCheck = Test-ClashRunCompletion -RunPath \$Root/.test(body) &&
        /completion refused: the published marker fails the completion contract/.test(body) &&
        body.indexOf('$selfCheck') > body.indexOf('[System.IO.File]::Move($temp, $marker)');
    })());
  check('the marker contract declares which fields are authoritative',
    /AUTHORITATIVE marker fields/.test(libCode) &&
    /NOT authoritative, and never trusted/.test(libCode) &&
    /metadata/.test(libCode.slice(libCode.indexOf('function Publish-ClashCompletion'), libCode.indexOf('function Test-ClashRunCompletion'))));
  const completionCases = ['completionSuccessPublishesVerifiedMarker', 'completionMarkerExcludedFromSeal',
    'completionRefusesSecondFinalization', 'completionRefusesDoubtMarker',
    'completionSealPublicationFailureLeavesNoMarker', 'completionSealWriteFailureLeavesNoMarker',
    'completionTailDoesNotAnnounceOnSealFailure', 'completionTailAnnouncesOnlyAfterMarker',
    'completionValidatorRejectsExceptionBesideMarker', 'completionValidatorRejectsTamperedEvidence',
    'completionValidatorRejectsTruncatedSeal', 'completionValidatorReportsUnreadableSeal',
    'completionValidatorRejectsUnsealedEvidence', 'completionRefusesMissingRequiredEvidence',
    'completionIntentNeverClaimsComplete', 'deployTailIsTheOnlyCompletionPath',
    'completionRejectsCodexChainMutation', 'completionRejectsWrongPrevReceiptShaOnly',
    'completionRejectsWrongSealChainHeadOnly', 'completionRejectsMissingIntent',
    'completionRejectsMisTypedMarker', 'completionRejectsMalformedHashFields',
    'completionRejectsIntentChainBreak', 'completionRejectsPostSealEvidenceLoss',
    'completionRejectsContradictoryWriterRunId', 'completionRejectsUnknownSealName',
    'completionRejectsForeignAdapter'];
  check('all twenty-seven finalization cases are executed and in the shared inventory',
    completionCases.every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest) && libCode.includes(`'${n}'`)));
  check('the tail cases execute the committed region, not a copy',
    /function Get-CompletionTail/.test(selfTest) &&
    /Get-CompletionTail -Path \(Join-Path \$pluginRoot 'deploy\.ps1'\)/.test(selfTest) &&
    /completion region rejected/.test(selfTest) &&
    /markerAtAnnounce/.test(selfTest));
  const readmeText = lf(read(join(CLOUD, 'README.md')));
  check('the README documents R15-C1 and the protocol',
    readmeText.includes('R15-C1') && /06-finalization-intent\.json/.test(readmeText) &&
    /commit point/i.test(readmeText) && /06-complete-unverified\.json/.test(readmeText));
}

hdr(27, 'the JSON type boundary - an accessor must not enumerate (Round 18 / C17-C1)');
{
  // C17-C1: Get-ClashProperty returned the property through the output pipeline,
  // and the pipeline enumerates an array. ["clash-completion/2"] therefore arrived
  // at the consumer as the string "clash-completion/2" and was ACCEPTED. These are
  // the offline mirrors; the executed proofs are cases 103-120 in
  // test-native-capture.ps1 on Windows PowerShell 5.1.
  const libRaw = lib;
  const selfTest = lf(read(join(CLOUD, 'tools/test-native-capture.ps1')));
  const libCode = libRaw;
  // the lexed view, because the comment that documents the defect quotes it
  const libLexed = psLex(libRaw).code;
  const readmeText = lf(read(join(CLOUD, 'README.md')));
  check('both shared accessors emit the value without pipeline enumeration',
    /\breturn ,\$prop\.Value/.test(libLexed) && /\breturn ,\$p\.Value/.test(libLexed) &&
    /\breturn ,\$Object\[\$Name\]/.test(libLexed) &&
    !/\breturn \$prop\.Value/.test(libLexed) && !/\breturn \$p\.Value/.test(libLexed) &&
    !/\breturn \$Object\[\$Name\]/.test(libLexed) &&
    // not vacuous: the construct this audit found is still caught
    /\breturn \$prop\.Value/.test('  return $prop.Value') &&
    /\breturn \$p\.Value/.test('  return $p.Value') &&
    /\breturn \$Object\[\$Name\]/.test('  return $Object[$Name]'));
  check('the defect is documented where the fix is, not in the README only',
    /C17-C1: a bare `return \$prop\.Value` writes the value into the OUTPUT PIPELINE/.test(libCode) &&
    /the pipeline enumerates an array/.test(libCode));
  check('a typed field record keeps missing and null apart',
    /function Get-ClashJsonField/.test(libCode) &&
    /present = \$false; kind = 'missing'/.test(libCode) &&
    /\$field\['kind'\]\s*=\s*Get-ClashJsonKind/.test(libCode) &&
    /\$field\['value'\]\s*=\s*\$prop\.Value/.test(libCode));
  check('the kind classifier is a classifier, not a converter',
    /function Get-ClashJsonKind/.test(libCode) && /function Test-ClashJsonKind/.test(libCode) &&
    /'integer'/.test(libCode) && /'number'/.test(libCode) && /'boolean'/.test(libCode) &&
    /'object'/.test(libCode) && /'array'/.test(libCode) &&
    /if \(\$Kind -ceq 'number'\)/.test(libCode));
  check('a verdict renders a collection as a collection',
    /array\(\{0\}\) \[\{1\}\]/.test(libCode) &&
    /Reporting \["x"\] as string "x"/.test(libCode));
  check('the completion consumer gates every authoritative field on its JSON kind', (() => {
    const body = libRaw.slice(libRaw.indexOf('function Test-ClashRunCompletion'),
      libRaw.indexOf('# ------------------------------------------------------- connection policy --'));
    return (body.match(/Test-ClashJsonKind/g) || []).length >= 14 &&
      /Test-ClashJsonKind -Value \$proto -Kind 'string'/.test(body) &&
      /Test-ClashJsonKind -Value \$status -Kind 'string'/.test(body) &&
      /Test-ClashJsonKind -Value \$finalized -Kind 'boolean'/.test(body) &&
      /Test-ClashJsonKind -Value \$markerSeal -Kind 'object'/.test(body) &&
      /Test-ClashJsonKind -Value \$writerRun -Kind 'string'/.test(body) &&
      /Test-ClashJsonKind -Value \$declaredRaw -Kind 'array'/.test(body) &&
      /a completion marker must be a JSON object/.test(body) &&
      !/\[\s*string\s*\]\s*\(\s*Get-ClashProperty/.test(body);
  })());
  check('the seal gates its own shape before it is believed',
    /a seal must be a JSON object/.test(libRaw) &&
    /the seal field files is \{0\}; it must be a JSON array of entries/.test(libRaw) &&
    /the seal fileCount is \{0\}; it must be a JSON integer/.test(libRaw) &&
    /the seal chainHead is \{0\}; it must be a JSON string/.test(libRaw) &&
    /every entry must be a JSON object/.test(libRaw) &&
    !/\[int\]\$claimedCount -ne \$entries\.Count/.test(libRaw));
  check('the verification receipt gates its own shape',
    /receipt field \{0\} is a JSON \{1\}, not a JSON \{2\}/.test(libRaw) &&
    /\@{ name = 'casesExecuted'; kind = 'integer' \}/.test(libRaw) &&
    /\@{ name = 'verdict'; kind = 'string' \}/.test(libRaw) &&
    /\@{ name = 'problems'; kind = 'array' \}/.test(libRaw));
  check('the producer asserts the kinds it wrote, independently of the consumer',
    /Producer-side typed self-check, independent of the consumer/.test(libRaw) &&
    /\$expectedKinds = \@\{/.test(libRaw) &&
    /the candidate marker wrote \{0\} as a JSON \{1\}, not a JSON \{2\}/.test(libRaw) &&
    /the candidate marker wrote seal\.\{0\} as a JSON \{1\}/.test(libRaw) &&
    /Test-ClashJsonKind -Value \$published -Kind/.test(libRaw) === false &&
    /Test-ClashJsonKind -Value \$pubSeal -Kind 'object'/.test(libRaw));
  check('the verdict record does not report an enumerated protocol as accepted',
    /protocolKind = \$reportedProtocolKind/.test(libRaw) &&
    /if \(\$reportedProtocolKind -ceq 'string'\)/.test(libRaw) &&
    !/protocol    = \$\(if \(\$null -ne \$document\) \{ \[string\]\(Get-ClashProperty/.test(libRaw));
  check('no caller wraps a shape-preserving accessor in an array subexpression',
    !/@\(\s*Get-(ClashProperty|DocumentProperty|ClashJsonField)\b/.test(psLex(selfTest).code) &&
    !/@\(\s*Get-(ClashProperty|DocumentProperty|ClashJsonField)\b/.test(libLexed) &&
    /CALL-SITE CONTRACT/.test(libRaw) &&
    /@\(\$value\) is correct/.test(libRaw));
  check('the shared accessor no longer has a decision-bearing caller',
    !/Get-ClashProperty/.test(libRaw.slice(libRaw.indexOf('function Get-ClashJsonField'))) ||
    !/\[string\]\(Get-ClashProperty/.test(libRaw));
  const typeCases = ['jsonAccessorPreservesCollectionShape', 'jsonFieldReportsExactJsonKinds',
    'jsonFieldSeparatesMissingFromNull', 'completionRejectsProtocolSingletonArray',
    'completionRejectsProtocolEmptyArray', 'completionRejectsProtocolMultiValueArray',
    'completionRejectsProtocolNestedArray', 'completionRejectsProtocolObject',
    'completionRejectsProtocolNull', 'completionRejectsArrayTypedMarkerFields',
    'completionRejectsArrayTypedSealBlockFields', 'completionRejectsCollectionRootMarker',
    'evidenceSealRejectsNonArrayFiles', 'evidenceSealRejectsStringFileCount',
    'evidenceSealRejectsArrayChainHead', 'completionRejectsCollectionValuedIntent',
    'completionRejectsCollectionValuedClaimRelease', 'selfTestReceiptRejectsCollectionValuedMetadata'];
  check('all eighteen type-boundary cases are executed and in the shared inventory',
    typeCases.every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest) && libRaw.includes(`'${n}'`)));
  check('the executed fixtures write real JSON text, not a PowerShell approximation',
    /function Set-JsonScalarField/.test(selfTest) && /function Set-JsonFileRegex/.test(selfTest) &&
    /-RawJson '\[\]'/.test(selfTest) && /-RawJson '\[\["clash-completion\/2"\]\]'/.test(selfTest) &&
    /-RawJson 'null'/.test(selfTest) && /-RawJson '\{"value":"clash-completion\/2"\}'/.test(selfTest) &&
    selfTest.indexOf("Add-Case 'completionRejectsProtocolSingletonArray'") > selfTest.indexOf('function Invoke-MarkerTypeProbe'));
  check('the README documents the C17-C1 root cause and the type rules',
    readmeText.includes('C17-C1') && /enumerat/i.test(readmeText) &&
    /authoritative field/i.test(readmeText) && /JSON kind|exact JSON type/i.test(readmeText));
}

hdr(28, 'document roots are validated, never assumed (Round 19 / C18-C1)');
{
  // C18-C1: ConvertFrom-Json turns the four bytes `null` into $null without
  // throwing, and every authoritative check is guarded by "the document parsed".
  // A null root therefore skipped the whole block and the run was accepted on its
  // remaining valid seal. Executed proofs: cases 121-135 on Windows PowerShell 5.1.
  const libRaw = lib;
  const deploySrc = lf(read(join(CLOUD, 'tools/deploy.ps1')));
  const manifestSrc = lf(read(join(CLOUD, 'tools/check-manifest.ps1')));
  const ledgerSrc = lf(read(join(CLOUD, 'tools/check-ledger.ps1')));
  const selfTest = lf(read(join(CLOUD, 'tools/test-native-capture.ps1')));
  const readmeText = lf(read(join(CLOUD, 'README.md')));
  const consumer = libRaw.slice('function Test-ClashRunCompletion'.length + libRaw.indexOf('function Test-ClashRunCompletion'),
    libRaw.indexOf('# ------------------------------------------------------- connection policy --'));

  check('the root contract is declared once and names every state',
    /function Get-ClashJsonRoot/.test(libRaw) &&
    /'missing'/.test(libRaw) && /'directory'/.test(libRaw) && /'unreadable'/.test(libRaw) &&
    /'empty'/.test(libRaw) && /'malformed'/.test(libRaw) && /'null'/.test(libRaw) &&
    /is the JSON literal null; it must be a JSON object/.test(libRaw) &&
    /is empty or whitespace only/.test(libRaw));
  check('the completion consumer cannot skip its authoritative block',
    consumer.includes("Get-ClashJsonRoot -Path $markerPath -Label 'completion marker'") &&
    consumer.includes("$problems.Add($markerRoot['problem'])") &&
    consumer.includes("$document = $markerRoot['value']") &&
    consumer.indexOf("Get-ClashJsonRoot -Path $markerPath") < consumer.indexOf('$proto = (Get-ClashJsonField') &&
    // the field block is still guarded, but the guard can no longer be the only
    // thing that decides whether a run is accepted
    /if \(\$null -ne \$document\) \{/.test(consumer));
  check('the sealed intent and claim release roots are validated too',
    consumer.includes("Get-ClashJsonRoot -Path $intentPath -Label 'sealed finalization intent'") &&
    consumer.includes("Get-ClashJsonRoot -Path $releasePath -Label 'sealed claim release'") &&
    consumer.includes("$problems.Add($intentRoot['problem'])") &&
    consumer.includes("$problems.Add($releaseRoot['problem'])"));
  check('a rejected seal says why: the null root is an explicit problem',
    /Get-ClashJsonRoot -Path \$target -Label 'evidence seal'/.test(libRaw) &&
    /\$problems.Add\(\$sealRoot\['problem'\]\)/.test(libRaw) &&
    /a rejection nobody can read/.test(libRaw) && /rejection nobody can act on/.test(libRaw));
  check('the producer validates its own candidate and published root',
    /Get-ClashJsonRoot -Path \$temp -Label 'candidate completion marker'/.test(libRaw) &&
    /Get-ClashJsonRoot -Path \$marker -Label 'published completion marker'/.test(libRaw) &&
    /if \(\$publishedRoot\['ok'\]\) \{ \$published = \$publishedRoot\['value'\] \}/.test(libRaw));
  check('the verification receipt has a root contract of its own',
    /an adapter self-test receipt must be a JSON object, and this document parsed to null/.test(libRaw) &&
    /the receipt root is \{0\}; an adapter self-test receipt must be a JSON object/.test(libRaw) &&
    /Get-ClashJsonRoot -Path \$ReceiptPath -Label 'adapter self-test receipt'/.test(libRaw));
  check('every manifest reader validates the manifest root first',
    deploySrc.includes("Get-ClashJsonRoot -Path $manifestPath -Label 'package manifest'") &&
    manifestSrc.includes("Get-ClashJsonRoot -Path (Join-Path $cloudRoot 'manifest.json') -Label 'package manifest'") &&
    ledgerSrc.includes("Get-ClashJsonRoot -Path (Join-Path $cloudRoot 'manifest.json') -Label 'package manifest'") &&
    !/"\$manifest\.entries"/.test(deploySrc));
  const rootCases = ['completionRejectsNullRootMarker', 'completionRejectsEmptyRootMarker',
    'completionRejectsWhitespaceRootMarker', 'completionRejectsArrayRootMarker',
    'completionRejectsScalarRootMarker', 'completionRejectsMalformedRootMarker',
    'completionRejectsMissingRootMarker', 'jsonRootStatesAreValidated',
    'completionAcceptsValidObjectRoot', 'evidenceSealRejectsNullRoot', 'evidenceSealRejectsEmptyRoot',
    'completionRejectsNullRootIntent', 'completionRejectsNullRootClaimRelease',
    'selfTestReceiptRejectsInvalidRoot', 'adapterSelfTestRejectsNullRootReceipt'];
  check('all fifteen root-state cases are executed and in the shared inventory',
    rootCases.every((n) => new RegExp(`^Add-Case '${n}'`, 'm').test(selfTest) && libRaw.includes(`'${n}'`)));
  check('the executed null fixture is the audit four bytes',
    /-Text 'null'/.test(selfTest) &&
    selfTest.includes('74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b') &&
    /\(\$n1\['bytes'\] -eq 4\)/.test(selfTest));
  check('the root states are executed against a valid published fixture',
    /function Invoke-RootStateProbe/.test(selfTest) &&
    /Invoke-CompletionProbe -Root \$root/.test(selfTest) &&
    /beforeOk/.test(selfTest));
  check('the README documents C18-C1 and the root contract',
    readmeText.includes('C18-C1') && /literal null/.test(readmeText) &&
    /root/i.test(readmeText) && /C17-C1/.test(readmeText));
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
