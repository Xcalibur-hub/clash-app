// Frozen-candidate byte audit only. Never invokes Supabase, SQL, Docker or a network client.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');
const assert = require('node:assert/strict');
const CANDIDATE = 'a92a550527f810913b01f6e6411dc78996c71a06';
const ROOT = path.resolve(__dirname, '..');
const MANIFEST = 'docs/PHASE_11_INTEGRATION_CANDIDATE_MANIFEST.json';
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function inspect(bytes) {
  const leadingBom = bytes.subarray(0, 3).equals(BOM);
  const body = leadingBom ? bytes.subarray(3) : bytes;
  const issues = [];
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body); }
  catch { issues.push('INVALID_UTF8'); }
  if (bytes.includes(0)) issues.push('NUL_OR_UTF16_UTF32');
  if (text !== undefined) {
    if (text.includes('\ufeff')) issues.push('EMBEDDED_OR_REPEATED_BOM');
    if (/[\x01-\x08\x0b\x0e-\x1f\x7f]/u.test(text)) issues.push('CONTROL_BYTE');
    if (/^[ \t\r\n\f]*[^\x00-\x7f]/u.test(text)) issues.push('NON_ASCII_LEADING_TOKEN');
    if (leadingBom && !/^[ \t\r\n\f]*(?:--|\/\*)/u.test(text)) issues.push('BOM_NOT_BEFORE_COMMENT');
  }
  return {
    leading_bom: leadingBom, valid_utf8: text !== undefined, issues,
    // Heuristic only: valid Unicode may be intentional. Never attempt an encoding repair.
    possible_mojibake_sequences: text?.match(/\u00e2\u20ac|\u00c3[\u0080-\u00bf]|\u00ef\u00bb\u00bf/gu)?.length ?? 0,
    crlf_count: text?.match(/\r\n/g)?.length ?? 0,
    bare_cr_count: text?.match(/\r(?!\n)/g)?.length ?? 0,
    first_16_bytes: bytes.subarray(0, 16).toString('hex'),
    source_sha256: sha256(bytes), artifact_sha256: sha256(body),
    bytes_removed: leadingBom ? 3 : 0,
  };
}
function normalize(bytes) {
  const result = inspect(bytes);
  assert.deepEqual(result.issues, [], 'Unsafe encoding; no normalization permitted');
  // Exact bytes after one file-start marker. No decoding/re-encoding, trimming or newline edits.
  return result.leading_bom ? bytes.subarray(3) : bytes;
}
function git(args, options = {}) {
  return execFileSync('git', ['-c', 'safe.directory=' + ROOT.replaceAll('\\', '/'), ...args],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...options });
}
function frozenScan() {
  const manifestBytes = git(['show', CANDIDATE + ':' + MANIFEST]);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const entries = manifest.migration_order;
  assert.equal(entries.length, 106);
  assert.equal(new Set(entries.map(e => e.path)).size, 106);
  assert.deepEqual(entries.map(e => e.path), entries.map(e => e.path).sort());
  for (const e of entries) assert.match(e.path, /^supabase\/migrations\/\d{14}_[A-Za-z0-9_]+\.sql$/);
  const actualFiles = git(['ls-tree', '-r', '--name-only', CANDIDATE, '--', 'supabase/migrations'], { encoding: 'utf8' })
    .trim().split('\n').filter(p => p.endsWith('.sql')).sort();
  assert.deepEqual(actualFiles, entries.map(e => e.path));
  const blobs = git(['cat-file', '--batch'], { input: entries.map(e => CANDIDATE + ':' + e.path + '\n').join('') });
  let offset = 0;
  const files = entries.map((entry, i) => {
    const end = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, end).toString('ascii');
    assert.match(header, /^[0-9a-f]{40} blob \d+$/);
    const size = Number(header.split(' ')[2]);
    const bytes = blobs.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size;
    assert.equal(blobs[offset++], 10);
    assert.equal(sha256(bytes), entry.sha256, entry.path + ': frozen hash mismatch');
    return { order: i + 1, path: entry.path, ...inspect(bytes), bytes };
  });
  assert.equal(offset, blobs.length);
  const report = { schema_version: 1, candidate_commit: CANDIDATE,
    manifest_git_blob_sha256: sha256(manifestBytes), migration_count: files.length,
    leading_bom_count: files.filter(e => e.leading_bom).length,
    blocking_issue_count: files.reduce((n, e) => n + e.issues.length, 0),
    possible_mojibake_file_count: files.filter(e => e.possible_mojibake_sequences).length,
    sql_executed: false, files: files.map(({ bytes, ...entry }) => entry) };
  return { report, files };
}
function writeArtifact(destination, files, report) {
  // A new directory only: refuse even an empty existing target; no overwrite or cleanup.
  assert.ok(!fs.existsSync(destination), 'Artifact destination already exists');
  const outputs = files.map(e => ({ name: path.basename(e.path), bytes: normalize(e.bytes), entry: e }));
  for (const o of outputs) assert.equal(sha256(o.bytes), o.entry.artifact_sha256);
  fs.mkdirSync(destination);
  fs.mkdirSync(path.join(destination, 'migrations'));
  for (const o of outputs) {
    const target = path.join(destination, 'migrations', o.name);
    fs.writeFileSync(target, o.bytes, { flag: 'wx' });
    assert.equal(sha256(fs.readFileSync(target)), o.entry.artifact_sha256);
  }
  fs.writeFileSync(path.join(destination, 'encoding-manifest.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--artifact'), 'Usage: node scripts/migration-encoding-check.cjs [--artifact]');
    const { report, files } = frozenScan();
    if (args.length) {
      assert.equal(report.blocking_issue_count, 0, 'Unsafe encodings block artifact generation');
      const ignoredRoot = path.join(ROOT, '.expo');
      if (!fs.existsSync(ignoredRoot)) fs.mkdirSync(ignoredRoot);
      assert.equal(fs.realpathSync(ignoredRoot).toLowerCase(), ignoredRoot.toLowerCase(), 'Refuse redirected scratch path');
      writeArtifact(path.join(ignoredRoot, 'phase-11-migration-artifact'), files, report);
    }
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.blocking_issue_count || (!args.length && report.leading_bom_count) ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { inspect, normalize, writeArtifact, frozenScan, sha256 };
