// Separate from the immutable package. Default is offline policy/SQL planning.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protectedRefs = ['kgaqejgubjemdecifzew', 'eagbgwasiocfppwobpsd'];
const fail = message => { throw new Error(message); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function resolve(config, env = {}) {
  const { projectRef: ref, confirmProjectRef, host, confirmHost, user, port, sslmode, caSha256 } = config;
  if (typeof ref !== 'string' || ref.length !== 20 || !/^[a-z0-9]{20}$/.test(ref) || protectedRefs.includes(ref)) fail('New disposable project required');
  if (confirmProjectRef !== ref || config.disposable !== true) fail('Exact disposable project confirmation required');
  if (typeof host !== 'string' || host !== confirmHost || host.length > 253 || /[^a-z0-9.-]/.test(host)) fail('Exact dashboard host confirmation required');
  const direct = host === `db.${ref}.supabase.co`;
  const pooler = /^aws-[0-9]+-[a-z]+(?:-[a-z]+){1,3}-[0-9]+\.pooler\.supabase\.com$/.test(host) && host.split('.')[0].length <= 63;
  if (!direct && !pooler) fail('Documented Supabase endpoint required');
  if (user !== (direct ? 'postgres' : `postgres.${ref}`)) fail('Exact project user required');
  if (port !== 5432) fail('Session/direct port 5432 required');
  if (sslmode !== 'verify-full' || typeof caSha256 !== 'string' || caSha256.length !== 64 || !/^[a-f0-9]{64}$/.test(caSha256)) fail('Approved CA SHA-256 and TLS verify-full required');
  for (const [key, value] of Object.entries(env)) {
    if (value && (/^PG/i.test(key) || /^(DATABASE_URL|SUPABASE_DB_URL|SUPABASE_URL)$/i.test(key))) fail('Ambient database routing/auth environment refused');
  }
  return { projectRef: ref, host, user, port, database: 'postgres', sslmode, caSha256 };
}
export function buildSql(nonce) {
  if (typeof nonce !== 'string' || nonce.length !== 32 || !/^[a-f0-9]{32}$/.test(nonce)) fail('Invalid completion nonce');
  const original = fs.readFileSync(path.join(root, 'certified-package/supabase/cloud/preflight/00_preflight.sql'));
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'cloud/package-provenance.json')));
  if (sha(original) !== proof.preflightSha256) fail('Immutable preflight hash mismatch');
  return `BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DO $role_guard$ BEGIN
 IF current_user <> 'postgres' OR session_user <> 'postgres'
 OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) IS DISTINCT FROM false
 OR current_setting('transaction_read_only') <> 'on'
 OR (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Read-only nonsuperuser TLS deployment-role gate failed'; END IF;
END $role_guard$;
${original.toString('utf8')}
SELECT 'CLASH_PREFLIGHT_COMPLETE_${nonce}';
ROLLBACK;
`;
}
export function verifyOutput(output, nonce) {
  const rows = output.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length !== 22 || rows[21] !== `CLASH_PREFLIGHT_COMPLETE_${nonce}`) fail('Incomplete preflight result');
  for (let i = 0; i < 21; i++) {
    const row = rows[i].split('\t');
    if (row.length !== 5 || row[0] !== String(i + 1) || row[4] !== (i < 19 ? 'PASS' : 'INFO')) fail('Preflight row contract failed');
  }
  return { gatingChecks: 19, informationalChecks: 2, complete: true };
}
function ownedPrivateFile(file, label) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) fail(`${label} absolute path required`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) fail(`${label} must be owned regular file with no group/other permissions`);
  if (path.relative(root, fs.realpathSync(file)).split(path.sep)[0] !== '..') fail(`${label} must stay outside publication tree`);
  return file;
}
export function execute(config, env = process.env) {
  if (process.platform !== 'linux') fail('Future Linux runner only; Windows transport is separately certified');
  const endpoint = resolve(config, env);
  const ca = ownedPrivateFile(config.caFile, 'CA'), passfile = ownedPrivateFile(config.passfile, 'Passfile');
  if (sha(fs.readFileSync(ca)) !== endpoint.caSha256) fail('CA identity mismatch');
  const psql = ownedPrivateFile(config.psql, 'Pinned psql');
  if (!/^[a-f0-9]{64}$/.test(config.psqlSha256 ?? '') || sha(fs.readFileSync(psql)) !== config.psqlSha256) fail('Approved psql identity required');
  const nonce = crypto.randomBytes(16).toString('hex'), sql = buildSql(nonce);
  const childEnv = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', PGHOST: endpoint.host,
    PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: endpoint.user, PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: ca, PGPASSFILE: passfile, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'clash-disposable-readonly' };
  const result = spawnSync(psql, ['-X', '--no-password', '--quiet', '--tuples-only', '--no-align',
    '--field-separator=\t', '--set=ON_ERROR_STOP=1', '--file=-'],
  { input: sql, encoding: 'utf8', env: childEnv, shell: false, timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) fail('Read-only preflight failed; no retry or repair permitted');
  return verifyOutput(result.stdout, nonce);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || !['plan', 'execute-authorized-readonly'].includes(process.argv[2])) fail('Usage: preflight.mjs plan|execute-authorized-readonly PRIVATE_CONFIG_JSON');
    const config = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const endpoint = resolve(config, process.env);
    if (process.argv[2] === 'execute-authorized-readonly') {
      if (config.ownerAuthorization !== 'NEW_DISPOSABLE_READONLY_PREFLIGHT_ONLY') fail('Separate owner authorization required');
      console.log(JSON.stringify(execute(config)));
    } else {
      buildSql('0'.repeat(32));
      console.log(JSON.stringify({ status: 'OFFLINE_PLAN_ONLY', projectRef: endpoint.projectRef, checks: 19, informational: 2, sql: 'Unchanged certified preflight inside read-only TLS/role guard and rollback; no connection made' }));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
