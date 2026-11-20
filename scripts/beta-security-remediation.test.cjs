const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process');
const { validateTarget } = require('./beta-security-concurrency.cjs');
const plan = JSON.parse(fs.readFileSync('supabase/policies/beta-admission-rpcs.json'));
const migration = fs.readFileSync('supabase/migrations/20261111120100_beta_deferred_admission.sql', 'utf8');
test('exact reviewed per-RPC matrix and SQL remain byte-consistent', () => {
  assert.equal(plan.functions.length, 57);
  assert.equal(new Set(plan.functions.map(x => x.signature)).size, 57);
  const quote = s => "'" + s.replaceAll("'", "''") + "'";
  const rows = plan.functions.map(r => '    (' + [r.signature, r.bodyMd5, r.capability, r.condition].map(quote).join(',') + ')').join(',\n');
  assert.ok(migration.includes(rows), 'SQL must include actual case-correct conditional guards from reviewed matrix');
  for (const r of plan.functions) assert.match(r.bodyMd5, /^[a-f0-9]{32}$/);
});
test('implicit admission is guarded without blanket denial of continuation and exits', () => {
  const byName = Object.fromEntries(plan.functions.map(x => [x.name, x]));
  for (const n of ['submit_challenge_entry', 'submit_treasure_answer', 'complete_content_clue', 'vault_community_touch']) assert.match(byName[n].condition, /^not exists/);
  assert.equal(byName.respond_arena_crew_invite.condition, 'p_accept is distinct from false');
  assert.equal(byName.decide_arena_crew_join_request.condition, 'p_approve is distinct from false');
  assert.equal(byName.set_vault_community_status.condition, "upper(p_status::text)='ACTIVE'");
  for (const name of ['submit_arena_official', 'submit_judgement', 'watch_arena_room', 'leave_arena_crew', 'cancel_meet_search', 'end_creator_live_session', 'save_my_arena_interests']) assert.equal(byName[name], undefined);
});
function fixture() {
  const t = { container: 'clash-beta-security-20261111', id: 'a'.repeat(64), database: 'beta_security_v4', systemId: 'unit-only-disposable' };
  const actual = { Id: t.id, Name: '/' + t.container, Config: { Image: 'public.ecr.aws/supabase/postgres@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108', Labels: { 'clash.owner': 'beta-security-20261111' } }, HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, PortBindings: {} }, Mounts: [{ Type: 'tmpfs' }], State: { Running: true } };
  return { t, actual };
}
test('target validator accepts only the explicit isolated fixture identity', () => {
  const { t, actual } = fixture(); assert.doesNotThrow(() => validateTarget(t, actual, t.systemId));
});
test('target validator rejects protected IDs, changed ownership, mounts, image, ports and database', () => {
  const changes = [x => { x.t.systemId = '7703813712308420644'; }, x => { x.actual.HostConfig.NetworkMode = 'host'; },
    x => { x.actual.HostConfig.PortBindings = { '5432/tcp': [{}] }; }, x => { x.actual.Mounts = [{ Type: 'volume' }]; },
    x => { x.actual.Id = 'b'.repeat(64); }, x => { x.actual.Config.Labels = {}; }, x => { x.actual.Config.Image = 'postgres:latest'; },
    x => { x.t.database = 'postgres'; }, x => { x.actual.State.Running = false; }, x => { x.actual.HostConfig.ReadonlyRootfs = false; }];
  for (const change of changes) { const x = fixture(); change(x); assert.throws(() => validateTarget(x.t, x.actual, x.t.systemId)); }
});
test('real direct CLI fails before Docker or a database without explicit disposable authorization', () => {
  const r = cp.spawnSync(process.execPath, ['scripts/beta-security-concurrency.cjs'], { encoding: 'utf8', timeout: 3000, env: { ...process.env, PATH: '' } });
  assert.equal(r.status, 1); assert.match(r.stderr, /Disposable beta security authorization required/); assert.doesNotMatch(r.stderr, /ENOENT/);
});
test('forward migrations are ordered, transactional and preserve historical migration files', () => {
  const files = fs.readdirSync('supabase/migrations').filter(x => /^20261111.*beta_/.test(x)).sort();
  assert.deepEqual(files, [
    '20261111120000_beta_take_identity.sql',
    '20261111120100_beta_deferred_admission.sql',
    '20261111120130_beta_admission_write_fences.sql',
    '20261111120200_beta_legacy_visibility.sql',
    '20261111130000_beta_storage_admission.sql',
  ]);
  for (const f of files) { const sql = fs.readFileSync('supabase/migrations/' + f, 'utf8'); assert.match(sql, /^begin;/); assert.match(sql, /commit;\s*$/); }
  const storageSql = fs.readFileSync('supabase/migrations/20261111130000_beta_storage_admission.sql', 'utf8');
  const bootstrapSql = fs.readFileSync('supabase/seeds/00_storage_bootstrap.sql', 'utf8');
  assert.match(storageSql, /create policy "admitted media upload only"/);
  assert.match(storageSql, /drop policy if exists "own media objects are updatable" on storage\.objects/);
  assert.match(storageSql, /create trigger beta_storage_upload_admission/);
  assert.match(bootstrapSql, /create policy "admitted media upload only"/);
});
