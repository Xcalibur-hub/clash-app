'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const issuance = JSON.parse(fs.readFileSync(path.join(root, '.expo/fresh-issuance-result.json'), 'utf8'));
const s = require(path.join(root, '.expo/realtime-execution-bridge/security.cjs'));
const c = require(path.join(root, '.expo/realtime-control-plane/contract.cjs'));
const store = require(path.join(root, '.expo/realtime-execution-bridge/private-store.cjs'));
const live = require(path.join(root, '.expo/realtime-execution-bridge/live-io.cjs'));

const ownerText = fs.readFileSync(path.join(root, '.expo/active-arena-checkpoint/owner-authorization.txt'), 'utf8');
const ownerSha = crypto.createHash('sha256').update(ownerText).digest('hex');
const approvedAt = Date.parse('2026-11-09T06:46:58Z');
const digest = s.hash(path.join(root, '.expo/realtime-execution-bridge/bridge-lock.json'));

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

const permit = s.authorize(approval, 'sessions', digest);
const provider = store.adapter(live.privateIO());
const material = provider.load(
  path.join(root, '.expo/live-connect-b4-run/bridge-generations', issuance.generation),
  issuance.receiptSha256,
  permit,
  issuance.execution
);

console.log('B4_ANON_KEY loaded successfully. Starts with:', material.B4_ANON_KEY.slice(0, 20) + '...');
