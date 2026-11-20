import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, buildSql, verifyOutput, execute } from './preflight.mjs';
const ref = 'abcdefghijklmnopqrst';
const valid = { projectRef: ref, confirmProjectRef: ref, disposable: true,
  host: `db.${ref}.supabase.co`, confirmHost: `db.${ref}.supabase.co`, user: 'postgres', port: 5432,
  sslmode: 'verify-full', caSha256: 'a'.repeat(64) };
test('direct disposable plan accepts exact confirmed identity', () => assert.equal(resolve(valid).projectRef, ref));
for (const region of ['us-east-1', 'ap-southeast-2', 'us-gov-west-1', 'cn-northwest-1']) {
  test(`session pooler ${region}`, () => {
    const host = `aws-0-${region}.pooler.supabase.com`;
    assert.equal(resolve({ ...valid, host, confirmHost: host, user: `postgres.${ref}` }).host, host);
  });
}
for (const protectedRef of ['kgaqejgubjemdecifzew', 'eagbgwasiocfppwobpsd']) {
  test(`reject protected project ${protectedRef}`, () => assert.throws(() => resolve({ ...valid,
    projectRef: protectedRef, confirmProjectRef: protectedRef, host: `db.${protectedRef}.supabase.co`, confirmHost: `db.${protectedRef}.supabase.co` })));
}
for (const patch of [
  { projectRef: ref + '\n', confirmProjectRef: ref + '\n' }, { projectRef: ref.toUpperCase() },
  { projectRef: 'а'.repeat(20) }, { confirmProjectRef: '' }, { disposable: false },
  { confirmHost: '' }, { user: 'supabase_admin' }, { user: `postgres.${ref}` },
  { port: 6543 }, { port: '5432' }, { sslmode: 'require' }, { caSha256: '' },
  { caSha256: 'a'.repeat(64) + '\n' }
]) test('reject invalid config ' + JSON.stringify(patch), () => assert.throws(() => resolve({ ...valid, ...patch })));
for (const host of [
  'aws-0-us-east-1.pooler.supabase.com.evil.test', 'aws-0-us-east-1.pooler.supabaseXcom',
  'aws-0-us-east-1.pooler.supabase.com\n', 'aws-0-us-east-1.pooler.supabase.com ',
  'AWS-0-us-east-1.pooler.supabase.com', 'aws--us-east-1.pooler.supabase.com',
  'aws-0-us--east-1.pooler.supabase.com', 'aws-0-us-east-1.pooler.supabаse.com',
  'aws-0-us-east-1.pooler.supabase.com;echo injected', 'localhost', '127.0.0.1',
  'db.kgaqejgubjemdecifzew.supabase.co', 'db.eagbgwasiocfppwobpsd.supabase.co',
  'aws-0-' + 'a'.repeat(64) + '-east-1.pooler.supabase.com'
]) test('reject host ' + JSON.stringify(host), () => assert.throws(() => resolve({ ...valid, host, confirmHost: host, user: `postgres.${ref}` })));
test('pooler wrong project user fails', () => {
  const host = 'aws-0-us-east-1.pooler.supabase.com';
  assert.throws(() => resolve({ ...valid, host, confirmHost: host, user: 'postgres.kgaqejgubjemdecifzew' }));
});
for (const key of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS', 'PGPASSWORD', 'DATABASE_URL', 'SUPABASE_DB_URL', 'pghost']) {
  test('reject ambient ' + key, () => assert.throws(() => resolve(valid, { [key]: 'synthetic-routing-value' })));
}
test('immutable preflight embedded with read-only, TLS/role guard, rollback, no migration SQL', () => {
  const sql = buildSql('a'.repeat(32));
  assert.ok(sql.startsWith('BEGIN READ ONLY;'));
  assert.ok(sql.endsWith('ROLLBACK;\n'));
  for (const expected of ['rolsuper', 'pg_stat_ssl', 'session_user', 'preflight FAILED', 'supautils.policy_grants']) assert.ok(sql.includes(expected));
  assert.ok(!/CREATE\s+(?:TABLE|EXTENSION)|ALTER\s+(?:TABLE|ROLE)|SET\s+ROLE|\\(?:i|!)/i.test(sql));
});
const nonce = 'a'.repeat(32);
const output = Array.from({ length: 21 }, (_, i) => `${i + 1}\tcheck\texpected\tactual\t${i < 19 ? 'PASS' : 'INFO'}`).join('\n') + `\nCLASH_PREFLIGHT_COMPLETE_${nonce}\n`;
test('complete result requires 19 gating +2 informational rows and nonce', () => assert.equal(verifyOutput(output, nonce).complete, true));
for (const [name, bad] of [ ['truncated', output.slice(0, -80)], ['duplicate', output + output],
  ['fail', output.replace('PASS', 'FAIL')], ['missing', output.split('\n').slice(1).join('\n')],
  ['wrong nonce', output.replace(nonce, 'b'.repeat(32))], ['extra output', output + 'unexpected\n'] ]) {
  test('reject result ' + name, () => assert.throws(() => verifyOutput(bad, nonce)));
}
test('Windows cannot execute Linux-only future transport', () => {
  if (process.platform !== 'linux') assert.throws(() => execute(valid), /Linux runner/);
});
