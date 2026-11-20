// Windows PowerShell 5.1 execution tests. No credentials, network or database executable.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'clash-ledger-' + crypto.randomUUID()));
fs.mkdirSync(out, {recursive: true});
const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|SUPABASE|DATABASE_URL$)/i.test(key)));
const run = args => spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ...args],
  {env, encoding: 'utf8', windowsHide: true, timeout: 120000});
const source = path.join(root, 'supabase/cloud/manifest.json');
const manifest = JSON.parse(fs.readFileSync(source));
const results = [];
function record(name, result, predicate) {
  fs.writeFileSync(path.join(out, name + '.log'), (result.stdout || '') + (result.stderr || ''), {flag: 'wx'});
  const pass = predicate(result);
  results.push({name, pass, exitCode: result.status, error: result.error?.message || null});
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({passed: results.filter(r => r.pass).length, cases: results}, null, 2) + '\n');
  if (!pass) throw Error('FAIL: ' + name + '; preserved evidence at ' + out);
}
const valid = run([path.join(root, 'supabase/cloud/tools/check-ledger.ps1'), '-ProjectRef', manifest.project_ref,
  '-PgHost', 'db.' + manifest.project_ref + '.supabase.co', '-CaCert', path.join(out, 'nonexistent-approved-ca.crt'),
  '-Psql', path.join(out, 'nonexistent-psql.exe')]);
record('valid119-reaches-ca-policy', valid, r => r.status === 2 && /CA|CaCert|certificate/i.test(r.stdout) && !/package integrity|expected 111|expected 119/.test(r.stdout));
const mutations = [
  ['missing-entry', m => {m.entries.pop();}, /expected 119/],
  ['historical111', m => {m.entries = m.entries.slice(0, 111); m.total = 111;}, /expected 119/],
  ['extra-entry', m => {m.entries.push(m.entries[118]);}, /expected 119/],
  ['string-total', m => {m.total = '119';}, /manifest total/],
  ['missing-total', m => {delete m.total;}, /manifest total/],
  ['wrong-total', m => {m.total = 118;}, /manifest total/],
  ['entries-object', m => {m.entries = {};}, /expected 119/],
  ['duplicate-entry', m => {m.entries[118] = m.entries[117];}, /package integrity/],
  ['malformed-entry', m => {m.entries[118] = {};}, /package integrity/],
  ['wrong-source-hash', m => {m.entries[118].sha256 = '0'.repeat(64);}, /package integrity/],
];
for (const [name, mutate, expected] of mutations) {
  const fixture = path.join(out, name);
  fs.cpSync(root, fixture, {recursive: true, filter: p => !['.git', 'evidence', 'evidence-adapter'].includes(path.basename(p))});
  const m = structuredClone(manifest); mutate(m);
  fs.writeFileSync(path.join(fixture, 'supabase/cloud/manifest.json'), JSON.stringify(m));
  // Reseal only the synthetic manifest entry so duplicate/field tests exercise structural gates.
  const sums = path.join(fixture, 'supabase/cloud/checksums.sha256');
  const hash = crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex');
  fs.writeFileSync(sums, fs.readFileSync(sums, 'utf8').replace(/^[a-f0-9]{64}  supabase\/cloud\/manifest.json$/m, hash + '  supabase/cloud/manifest.json'));
  const r = run([path.join(fixture, 'supabase/cloud/tools/check-ledger.ps1'), '-ProjectRef', manifest.project_ref,
    '-CaCert', path.join(out, 'nonexistent-approved-ca.crt'), '-Psql', path.join(out, 'nonexistent-psql.exe')]);
  record(name, r, x => x.status === 2 && expected.test(x.stdout) && /No database connection was opened/.test(x.stdout));
}
const r = run([path.join(root, 'supabase/cloud/tests/ledger-state.ps1'), '-OutFile', path.join(out, 'ledger-state.json')]);
record('ledger-state-11', r, x => x.status === 0 && /11 passed, 0 failed/.test(x.stdout));
console.log(JSON.stringify({passed: results.length + 10, failed: 0, helperCases: 11, ledgerCases: 11, out}));
