const assert = require('node:assert/strict');
const { frozenScan, normalize, sha256 } = require('./migration-encoding-check.cjs');
const TARGET = 'supabase/migrations/20261004120000_explore_play_system.sql';
const HASH = 'b047b47ea03dbb90bb4324b40a20196e30dd449d89557b42a49b4e1d8045d844';
const BEFORE = 'create extension if not exists pgcrypto with schema extensions;';
// PROPOSAL ONLY: emitted text is never written into migrations or executed.
const AFTER = `do $clash_extension_preflight$
begin
  if not exists (
    select 1 from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    join pg_catalog.pg_roles r on r.oid = e.extowner
    where e.extname = 'pgcrypto' and e.extversion = '1.3'
      and n.nspname = 'extensions' and r.rolname = 'supabase_admin'
  ) then
    raise exception 'Required managed pgcrypto 1.3 in extensions is not provisioned with approved ownership';
  end if;
end
$clash_extension_preflight$;`;
function proposedPatch(bytes) {
  assert.equal(sha256(bytes), HASH, 'Unreviewed migration bytes');
  const bomOnly = normalize(bytes);
  const needle = Buffer.from(BEFORE);
  const offset = bomOnly.indexOf(needle);
  assert.ok(offset >= 0);
  assert.equal(bomOnly.indexOf(needle, offset + needle.length), -1);
  const result = Buffer.concat([bomOnly.subarray(0, offset), Buffer.from(AFTER), bomOnly.subarray(offset + needle.length)]);
  return { result, offset, source_sha256: HASH, bom_only_sha256: sha256(bomOnly), proposed_sha256: sha256(result) };
}
function preflight() {
  const { report, files } = frozenScan();
  assert.equal(report.blocking_issue_count, 0);
  assert.equal(report.leading_bom_count, 3);
  const operations = files.flatMap(f => {
    const text = normalize(f.bytes).toString('utf8');
    return [...text.matchAll(/\b(?:create|alter|drop)\s+extension\b[^;]*;/gi)].map(m => ({ order: f.order, path: f.path, source_sha256: f.source_sha256, statement: m[0], line: text.slice(0, m.index).split('\n').length }));
  });
  assert.equal(operations.length, 4, 'Extension inventory changed; review required');
  assert.equal(operations.filter(o => o.order > 44).length, 0);
  const patch = proposedPatch(files.find(f => f.path === TARGET).bytes);
  return { candidate: report.candidate_commit, migration_count: files.length, sql_executed: false,
    operations, remaining_extension_ddl: 0,
    proposal: { path: TARGET, ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'result')), before: BEFORE, after: AFTER },
    status: 'OFFLINE_ONLY_NOT_DATABASE_VALIDATED' };
}
if (require.main === module) process.stdout.write(JSON.stringify(preflight(), null, 2) + '\n');
module.exports = { proposedPatch, preflight, TARGET, BEFORE, AFTER };
