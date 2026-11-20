'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const a = require('assert/strict');

const root = path.resolve(__dirname, '..');
const ownerText = fs.readFileSync(path.join(root, '.expo/active-arena-checkpoint/owner-authorization.txt'), 'utf8');
const ownerSha = crypto.createHash('sha256').update(ownerText).digest('hex');
console.log('1. Owner SHA-256:', ownerSha);
a.equal(ownerSha, 'f3bcff285f42cc8bc6af9747f4ad1bbc40d980639cf6388420f245259bca830b');

const s = require(path.join(root, '.expo/realtime-execution-bridge/security.cjs'));
const c = require(path.join(root, '.expo/realtime-control-plane/contract.cjs'));
const store = require(path.join(root, '.expo/realtime-execution-bridge/private-store.cjs'));
const live = require(path.join(root, '.expo/realtime-execution-bridge/live-io.cjs'));

const digest = s.hash(path.join(root, '.expo/realtime-execution-bridge/bridge-lock.json'));
s.integrity(digest);
console.log('2. Bridge integrity verified with digest:', digest);

const now = Date.now();
const approvedAt = Date.parse('2026-11-09T06:46:58Z');
const approval = {
  ownerSid: c.T.owner,
  project: c.T.project,
  db: c.T.db,
  system: c.T.system,
  network: c.T.network,
  bridgeSha256: digest,
  originalCandidateSha256: 'd9ed47fcf6dbe9379b8cf7715ad7008ef98f63161c949aa8163dae166490b4a6',
  centralManifestSha256: '8c0d6e47f7c997527ddde6ded9d9e0e2d057bba9113d958a6c5f46ebdf061cde',
  scopes: ['credentials', 'sessions', 'central', 'tenant', 'runtime', 'websocket'],
  decisionSource: 'explicit subsequent owner message',
  ownerMessage: ownerText,
  ownerMessageSha256: ownerSha,
  approvedAt,
  validUntil: approvedAt + 86400000,
  prohibitionOverrides: false,
};

const permit = s.authorize(approval, 'credentials', digest, now);
const provider = store.adapter(live.privateIO());
const original = provider.acquire(permit);
console.log('3. Acquired original durable secrets.');

// Generate fresh unique IDs
const generation = crypto.randomUUID();
const execution = crypto.randomUUID();
console.log('4. Fresh Generation ID:', generation, 'Execution ID:', execution);

const directory = provider.reserve(generation, execution);
const jwt = require(path.join(root, '.expo/live-connect-b4a/credential-jwt.cjs'));
const issuedAt = Math.floor(now / 1000);
const expiresAt = issuedAt + 86400;

const data = {
  ...original,
  B4_ANON_KEY: jwt.mint(original.B4_JWT_SECRET, 'anon', now),
  B4_SERVICE_KEY: jwt.mint(original.B4_JWT_SECRET, 'service_role', now)
};

const protectResult = provider.protect(directory, data, {
  generation,
  execution,
  project: c.T.project,
  owner: c.T.owner,
  candidateDigest: digest,
  issuedAt,
  expiresAt,
  durableUnchanged: true
});

console.log('5. Protected generation written successfully!');
console.log('   Receipt SHA-256:', protectResult.receiptSha256);
console.log('   Issued At:', new Date(issuedAt * 1000).toISOString());
console.log('   Expires At:', new Date(expiresAt * 1000).toISOString());

fs.writeFileSync(path.join(root, '.expo/fresh-issuance-result.json'), JSON.stringify({
  generation,
  execution,
  receiptSha256: protectResult.receiptSha256,
  issuedAt,
  expiresAt,
  derivedTokenExpiry: new Date(expiresAt * 1000).toISOString(),
  latestStartWithLoaderMinimum: new Date((expiresAt - 3600) * 1000).toISOString(),
  time: new Date().toISOString()
}, null, 2) + '\n');

console.log('Issuance COMPLETE and recorded in .expo/fresh-issuance-result.json');
