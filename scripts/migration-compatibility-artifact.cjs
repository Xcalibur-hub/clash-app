const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { frozenScan, normalize, sha256 } = require('./migration-encoding-check.cjs');
const { proposedPatch, TARGET, BEFORE, AFTER } = require('./extension-hook-preflight.cjs');
const expected = require('../docs/PHASE_11_EXTENSION_HOOK_PREFLIGHT.json');
const ROOT = path.resolve(__dirname, '..');
function prepare(files = frozenScan().files) {
  const frozen = frozenScan();
  assert.equal(files.length, 106);
  const operations = [];
  const outputs = files.map((f, i) => {
    const reference = frozen.files[i];
    assert.equal(f.path, reference.path, 'Source order/path changed');
    assert.equal(sha256(f.bytes), reference.source_sha256, 'Source bytes changed');
    const bom = normalize(f.bytes);
    for (const m of bom.toString('utf8').matchAll(/\b(?:create|alter|drop)\s+extension\b[^;]*;/gi))
      operations.push({ path: f.path, statement: m[0] });
    const transforms = [];
    if (!bom.equals(f.bytes)) transforms.push({ kind: 'remove-leading-utf8-bom', offset: 0, before_hex: 'efbbbf', after_hex: '' });
    let bytes = bom;
    if (f.path === TARGET) {
      const patch = proposedPatch(f.bytes);
      bytes = patch.result;
      assert.equal(sha256(bytes), expected.proposal.proposed_sha256, 'Reviewed correction changed');
      transforms.push({ kind: 'assert-managed-pgcrypto', offset_in_bom_only: patch.offset, before: BEFORE, after: AFTER });
    }
    return { name: path.basename(f.path), bytes, entry: { order: i + 1, path: f.path,
      source_sha256: sha256(f.bytes), bom_only_sha256: sha256(bom), artifact_sha256: sha256(bytes), transformations: transforms } };
  });
  assert.deepEqual(operations, expected.operations.map(({path, statement}) => ({path, statement})), 'Unexpected extension statements');
  assert.equal(outputs.filter(o => o.entry.transformations.some(t => t.kind === 'remove-leading-utf8-bom')).length, 3);
  assert.equal(outputs.filter(o => o.entry.transformations.some(t => t.kind === 'assert-managed-pgcrypto')).length, 1);
  assert.equal(outputs.filter(o => o.entry.source_sha256 !== o.entry.artifact_sha256).length, 3);
  return { outputs, manifest: { schema_version: 1, candidate_commit: frozen.report.candidate_commit,
    frozen_manifest_sha256: frozen.report.manifest_git_blob_sha256, sql_executed: false,
    files: outputs.map(o => o.entry) } };
}
function destinationCheck(root, destination) {
  root = path.resolve(root); destination = path.resolve(destination);
  assert.equal(fs.realpathSync(root).toLowerCase(), root.toLowerCase(), 'Redirected output root');
  assert.equal(path.dirname(destination).toLowerCase(), root.toLowerCase(), 'Output must be an immediate scratch child');
  assert.match(path.basename(destination), /^migration-compatibility-[a-z0-9-]+$/);
  assert.ok(!fs.existsSync(destination), 'Artifact directory exists');
  // Refuse dangling symlinks as well.
  assert.throws(() => fs.lstatSync(destination), { code: 'ENOENT' });
  return destination;
}
function verify(destination, prepared) {
  const names = fs.readdirSync(path.join(destination, 'migrations')).sort();
  assert.deepEqual(names, prepared.outputs.map(o => o.name).sort());
  for (const o of prepared.outputs) assert.deepEqual(fs.readFileSync(path.join(destination, 'migrations', o.name)), o.bytes);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination, 'compatibility-manifest.json'), 'utf8')), prepared.manifest);
}
function generate(root, destination, files) {
  const prepared = prepare(files); // All inputs validated before filesystem writes.
  destination = destinationCheck(root, destination);
  fs.mkdirSync(destination); fs.mkdirSync(path.join(destination, 'migrations'));
  for (const o of prepared.outputs) fs.writeFileSync(path.join(destination, 'migrations', o.name), o.bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(destination, 'compatibility-manifest.json'), JSON.stringify(prepared.manifest, null, 2) + '\n', { flag: 'wx' });
  verify(destination, prepared);
  return prepared.manifest;
}
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 2, 'No destination overrides supported');
    execFileSync('git', ['-c', 'safe.directory=' + ROOT.replaceAll('\\', '/'), 'diff', '--exit-code', 'HEAD', '--', 'supabase/migrations', 'docs/PHASE_11_INTEGRATION_CANDIDATE_MANIFEST.json'], { cwd: ROOT });
    const scratch = path.join(ROOT, '.expo');
    if (!fs.existsSync(scratch)) fs.mkdirSync(scratch);
    const manifest = generate(scratch, path.join(scratch, 'migration-compatibility-5g'));
    console.log(JSON.stringify({ files_verified: manifest.files.length, changed_files: 3, bom_removals: 3, statement_replacements: 1, sql_executed: false }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepare, destinationCheck, generate, verify };
