import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = '/tmp/clash-phase3h';
const LIB = `${ROOT}/preparation/phase3f/package/supabase/cloud/tools/lib/clash-native.ps1`;
const CA = `${ROOT}/preparation/phase3g/policy-fixtures/synthetic-ca.txt`;
const lib = fs.readFileSync(LIB, 'utf8');

function extract(name) {
  const m = lib.match(new RegExp(`\\$${name} = '([^']+)'`));
  if (!m) throw new Error('cannot extract ' + name);
  return m[1];
}
const poolerRaw = extract('pooler');
const refRaw = extract('pooler').length && lib.match(/\$ProjectRef -cnotmatch '([^']+)'/)[1];
const toJs = s => new RegExp('^(?:' + s.replace(/^\\A/, '').replace(/\\z$/, '') + ')$');
const poolerRe = toJs(poolerRaw);
const refRe = toJs(refRaw);

const caBytes = fs.readFileSync(CA);
const caText = caBytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const caSha = crypto.createHash('sha256').update(caText, 'utf8').digest('hex');

const REF = 'kgaqejgubjemdecifzew';
const DIRECT = `db.${REF}.supabase.co`;
const POOLER = 'aws-0-ap-south-1.pooler.supabase.com';
const MULTI = 'aws-0-ap-southeast-1.pooler.supabase.com';
const ABSENT = `${ROOT}/preparation/phase3g/policy-fixtures/absent.txt`;

const base = () => ({
  ProjectRef: REF, PgHost: POOLER, PgPort: 5432, PgUser: `postgres.${REF}`,
  PgDatabase: 'postgres', CaCert: CA, ConfirmedPoolerHost: POOLER,
  env: {}, prevSsl: 'disable', credential: true,
});

function resolve(p) {
  if (!refRe.test(p.ProjectRef) || /[\r\n]/.test(p.ProjectRef))
    throw new Error(`ProjectRef '${p.ProjectRef}' is not a 20-character Supabase project ref.`);
  const direct = `db.${p.ProjectRef}.supabase.co`;
  const host = p.PgHost || direct;
  const port = p.PgPort === undefined ? 5432 : p.PgPort;
  let mode = '';
  if (host === direct) {
    mode = 'direct';
    if (port !== 5432) throw new Error(`Direct host ${host} requires port 5432, not ${port}.`);
  } else if (poolerRe.test(host) && !/[\r\n]/.test(host) && host.split('.')[0].length <= 63) {
    mode = 'pooler';
    if (port !== 5432)
      throw new Error(`Session pooler host ${host} requires port 5432; transaction pooling on 6543 is refused (received ${port}).`);
    const want = `postgres.${p.ProjectRef}`;
    if (p.PgUser !== want) throw new Error(`Pooler user must be '${want}' for project '${p.ProjectRef}', not '${p.PgUser}'.`);
    if (!p.ConfirmedPoolerHost || p.ConfirmedPoolerHost !== host)
      throw new Error('ConfirmedPoolerHost must exactly match PgHost copied from this project Dashboard Connect > Session pooler. Never infer a host from the region.');
  } else {
    throw new Error('Host is not permitted for project. Use its exact direct host or a dashboard-confirmed aws-INDEX-REGION.pooler.supabase.com session host.');
  }
  if (p.PgDatabase !== 'postgres') throw new Error(`Database must be 'postgres', not '${p.PgDatabase}'.`);
  for (const v of ['PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS'])
    if (p.env[v] && p.env[v].trim()) throw new Error(`${v} is set; it can redirect or alter the connection behind the approved host name. Clear it and retry.`);
  if (!p.CaCert || !p.CaCert.trim()) throw new Error('A CA certificate is required for verify-full TLS. Pass -CaCert or set PGSSLROOTCERT (Supabase: prod-ca-2021.crt).');
  if (!fs.existsSync(p.CaCert)) throw new Error(`CA certificate not found: ${p.CaCert}`);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(p.CaCert).toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  if (!p.credential) throw new Error('No credential available: set PGPASSWORD or PGPASSFILE. Credentials are never passed as arguments.');
  return { mode, port, env: { PGSSLMODE: 'verify-full' }, sslModeOverrode: p.prevSsl === 'verify-full' ? '' : p.prevSsl, caCertSha256: digest };
}

const cases = [];
function check(name, fn) {
  let pass = false, detail = '';
  try { pass = !!fn(); } catch (e) { detail = e.message; }
  cases.push({ name, pass, detail });
}
function refuses(changes, pattern) {
  const p = { ...base(), ...changes };
  try { resolve(p); return false; }
  catch (e) { return new RegExp(pattern).test(e.message); }
}

check('direct5432VerifyFull', () => {
  const p = resolve({ ...base(), PgHost: DIRECT, PgUser: 'postgres' });
  return p.mode === 'direct' && p.port === 5432 && p.env.PGSSLMODE === 'verify-full' && p.sslModeOverrode === 'disable';
});
check('session5432VerifyFull', () => {
  const p = resolve(base());
  return p.mode === 'pooler' && p.port === 5432 && p.env.PGSSLMODE === 'verify-full' && p.caCertSha256 === caSha;
});
check('sessionDefaultPort5432', () => {
  const p = resolve({ ...base(), PgPort: undefined });
  return p.port === 5432 && p.mode === 'pooler';
});
check('session6543Refused', () => refuses({ PgPort: 6543 }, 'requires port 5432'));
check('direct6543Refused', () => refuses({ PgHost: DIRECT, PgPort: 6543, PgUser: 'postgres' }, 'requires port 5432'));
check('arbitraryPortRefused', () => refuses({ PgPort: 1234 }, 'requires port 5432'));
check('wrongPoolerUserRefused', () => refuses({ PgUser: 'postgres' }, 'Pooler user must'));
check('differentProjectUserRefused', () => refuses({ PgUser: 'postgres.eagbgwasiocfppwobpsd' }, 'Pooler user must'));
check('differentDirectHostRefused', () => refuses({ PgHost: 'db.eagbgwasiocfppwobpsd.supabase.co' }, 'not permitted'));
check('suffixHostRefused', () => refuses({ PgHost: POOLER + '.invalid' }, 'not permitted'));
check('arbitraryPoolerRefused', () => refuses({ PgHost: 'evil.pooler.supabase.com' }, 'not permitted'));
check('invalidRefRefused', () => refuses({ ProjectRef: 'invalid' }, '20-character'));
check('differentDatabaseRefused', () => refuses({ PgDatabase: 'template1' }, 'Database must'));
check('missingCaRefused', () => refuses({ CaCert: '' }, 'CA certificate is required'));
check('nonexistentCaRefused', () => refuses({ CaCert: ABSENT }, 'certificate not found'));
check('multiSegmentRegionAccepted', () => {
  const p = resolve({ ...base(), PgHost: MULTI, ConfirmedPoolerHost: MULTI });
  return p.mode === 'pooler' && p.port === 5432 && p.env.PGSSLMODE === 'verify-full';
});
check('unconfirmedPoolerHostRefused', () => {
  const p = { ...base(), ConfirmedPoolerHost: '' };
  try { resolve(p); return false; } catch (e) { return /ConfirmedPoolerHost must exactly match/.test(e.message); }
});
check('mismatchedPoolerConfirmationRefused', () => refuses({ ConfirmedPoolerHost: MULTI }, 'ConfirmedPoolerHost must exactly match'));
check('twoSegmentRegionRefused', () => refuses({ PgHost: 'aws-0-ap-south.pooler.supabase.com' }, 'not permitted'));
check('lookalikePoolerZoneRefused', () => refuses({ PgHost: POOLER + '.evil.com' }, 'not permitted'));
check('uppercasePoolerHostRefused', () => refuses({ PgHost: POOLER.toUpperCase() }, 'not permitted'));
check('trailingNewlinePoolerRefused', () => refuses({ PgHost: POOLER + '\n' }, 'not permitted'));
for (const v of ['PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS']) {
  check(v + 'Refused', () => refuses({ env: { [v]: 'synthetic-redirect' } }, v + ' is set'));
}
check('missingCredentialRefused', () => refuses({ credential: false }, 'No credential available'));

const failed = cases.filter(c => !c.pass).length;
const result = {
  harness: 'semantic replay of preparation/phase3g/test-execution-policy.ps1; NOT a PowerShell 5.1 execution',
  extractedPoolerRegex: poolerRaw,
  extractedRefRegex: refRaw,
  adapterPath: LIB,
  passed: cases.length - failed, failed, total: cases.length, cases,
};
fs.writeFileSync('/home/user/clash-app/phase3h-arena-artifacts/PHASE3H_TEST_RESULTS.json', JSON.stringify(result, null, 2) + '\n');
for (const c of cases) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' :: ' + c.detail : ''}`);
console.log(`\n${cases.length - failed} passed, ${failed} failed, ${cases.length} total`);
process.exit(failed ? 1 : 0);
