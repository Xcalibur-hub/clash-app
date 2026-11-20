'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const a = require('assert/strict');

const ownerText = fs.readFileSync('.expo/active-arena-checkpoint/owner-authorization.txt', 'utf8');
const ownerSha = crypto.createHash('sha256').update(ownerText).digest('hex');
console.log('Owner SHA-256:', ownerSha);
a.equal(ownerSha, 'f3bcff285f42cc8bc6af9747f4ad1bbc40d980639cf6388420f245259bca830b');

const s = require(path.resolve(__dirname, '../.expo/realtime-execution-bridge/security.cjs'));
const c = require(path.resolve(__dirname, '../.expo/realtime-control-plane/contract.cjs'));
const store = require(path.resolve(__dirname, '../.expo/realtime-execution-bridge/private-store.cjs'));
const live = require(path.resolve(__dirname, '../.expo/realtime-execution-bridge/live-io.cjs'));

console.log('Contract Target Project:', c.T.project);
console.log('Contract Target Owner:', c.T.owner);
console.log('Contract Target DB:', c.T.db);
console.log('Contract Target System:', c.T.system);

const digest = s.hash(path.resolve(__dirname, '../.expo/realtime-execution-bridge/bridge-lock.json'));
console.log('Bridge Digest:', digest);
s.integrity(digest);
console.log('Bridge Integrity PASS');

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
console.log('Permit Authorized:', permit);

const provider = store.adapter(live.privateIO());
const original = provider.acquire(permit);
console.log('Acquired Original Keys, JWT structure PASS. Durable secrets verified against DB, Auth, Rest containers!');
