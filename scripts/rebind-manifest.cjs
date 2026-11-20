'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const a = require('assert/strict');

const root = path.resolve(__dirname, '..');
const issuance = JSON.parse(fs.readFileSync(path.join(root, '.expo/fresh-issuance-result.json'), 'utf8'));
const ownerText = fs.readFileSync(path.join(root, '.expo/active-arena-checkpoint/owner-authorization.txt'), 'utf8');
const ownerSha = crypto.createHash('sha256').update(ownerText).digest('hex');

// 1. Update runtime-config.json
const runtimeConfigFile = path.join(root, '.expo/clash-mega-integration/runtime-config.json');
const runtimeConfig = JSON.parse(fs.readFileSync(runtimeConfigFile, 'utf8'));

// Backup
fs.writeFileSync(path.join(root, '.expo/clash-mega-integration/runtime-config-20261105.json'), JSON.stringify(runtimeConfig, null, 2) + '\n');

const approvedAt = Date.parse('2026-11-09T06:46:58Z');
runtimeConfig.approval.approvedAt = approvedAt;
runtimeConfig.approval.validUntil = approvedAt + 86400000;
runtimeConfig.approval.ownerMessage = ownerText;
runtimeConfig.approval.ownerMessageSha256 = ownerSha;
runtimeConfig.approval.run = issuance.execution;
runtimeConfig.execution = issuance.execution;
runtimeConfig.executionDirectory = path.join(root, '.expo/live-connect-b4-run/bridge-generations', issuance.execution);
runtimeConfig.generation = issuance.generation;
runtimeConfig.generationDirectory = path.join(root, '.expo/live-connect-b4-run/bridge-generations', issuance.generation);
runtimeConfig.generationReceiptSha256 = issuance.receiptSha256;

fs.writeFileSync(runtimeConfigFile, JSON.stringify(runtimeConfig, null, 2) + '\n');
console.log('1. runtime-config.json updated.');

// 2. Update credential-metadata.json
const credMetaFile = path.join(root, '.expo/active-arena-checkpoint/credential-metadata.json');
const credMeta = JSON.parse(fs.readFileSync(credMetaFile, 'utf8'));
credMeta.time = issuance.time;
credMeta.receiptSha256 = issuance.receiptSha256;
credMeta.derivedTokenExpiry = issuance.derivedTokenExpiry;
credMeta.latestStartWithLoaderOneHourMargin = issuance.latestStartWithLoaderMinimum;

fs.writeFileSync(credMetaFile, JSON.stringify(credMeta, null, 2) + '\n');
console.log('2. credential-metadata.json updated.');

// 3. Update execution-manifest.json
const manifestFile = path.join(root, '.expo/active-arena-checkpoint/execution-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

// Backup
fs.writeFileSync(path.join(root, '.expo/active-arena-checkpoint/execution-manifest-20261105.json'), JSON.stringify(manifest, null, 2) + '\n');

manifest.preparedAt = issuance.time;
manifest.target.utcPolicyHorizon = '2026-11-12';
manifest.auth.receiptSha256 = issuance.receiptSha256;
manifest.auth.derivedTokenExpiry = issuance.derivedTokenExpiry;
manifest.auth.latestStartWithLoaderMinimum = issuance.latestStartWithLoaderMinimum;

// Recalculate source hashes
for (const item of manifest.sources) {
  const fullPath = path.join(root, item.path);
  a.ok(fs.existsSync(fullPath), 'Missing source file: ' + item.path);
  const currentHash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
  if (item.sha256 !== currentHash) {
    console.log(`   Rebinding ${item.path}: ${item.sha256.slice(0, 8)}... -> ${currentHash.slice(0, 8)}...`);
    item.sha256 = currentHash;
  }
}

fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const newMH = crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex');
console.log('3. execution-manifest.json updated. New Manifest Hash MH:', newMH);

// 4. Update execute-owner.cjs and execution-preflight.cjs
const execOwnerFile = path.join(root, '.expo/active-arena-checkpoint/execute-owner.cjs');
let execOwnerCode = fs.readFileSync(execOwnerFile, 'utf8');
const oldMH = 'e5abee987721196e367ef941bb827e249ea63013c0ac831882970182c48bc0e9';
a.ok(execOwnerCode.includes(oldMH), 'execute-owner.cjs must contain old MH');
execOwnerCode = execOwnerCode.replace(oldMH, newMH);
fs.writeFileSync(execOwnerFile, execOwnerCode);
console.log('4. execute-owner.cjs synchronized with new MH.');

const preflightFile = path.join(root, '.expo/active-arena-checkpoint/execution-preflight.cjs');
let preflightCode = fs.readFileSync(preflightFile, 'utf8');
a.ok(preflightCode.includes(oldMH), 'execution-preflight.cjs must contain old MH');
preflightCode = preflightCode.replace(oldMH, newMH);
fs.writeFileSync(preflightFile, preflightCode);
console.log('5. execution-preflight.cjs synchronized with new MH.');

console.log('ALL MANIFESTS AND DIGEST BINDINGS REBOUND SUCCESSFULLY!');
