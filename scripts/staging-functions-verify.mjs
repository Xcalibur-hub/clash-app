/**
 * Staging Edge Function verification (Phase 11 Step 12) — READ-ONLY.
 *
 * Verifies the deployed function inventory against the reviewed manifest and runs
 * negative-authentication smoke tests. It deploys nothing and changes nothing.
 *
 * Usage:
 *   node scripts/staging-functions-verify.mjs                      # inventory + smoke (needs a token)
 *   node scripts/staging-functions-verify.mjs --smoke-only         # smoke only (no token needed)
 */
import path from 'node:path';
import { FUNCTIONS, PROJECT_REF, ROOT, checkToken, fetchDeployed, smokeTests, writeEvidence } from './staging-functions-deploy.mjs';

function parse(argv) {
  const out = { smokeOnly: false, evidence: path.join(ROOT, '.expo', 'staging-verify', String(Date.now())) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--smoke-only') out.smokeOnly = true;
    else if (argv[i] === '--evidence-dir') out.evidence = path.resolve(String(argv[++i] ?? ''));
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

export function compareInventory(expected, actual) {
  const byName = new Map(actual.map((r) => [r.name, r]));
  const rows = [];
  for (const f of expected) {
    const row = byName.get(f.name);
    const jwtOk = row && (row.verify_jwt === null || Boolean(row.verify_jwt) === f.verifyJwt);
    rows.push({
      name: f.name,
      deployed: Boolean(row),
      expected_verify_jwt: f.verifyJwt,
      observed_verify_jwt: row?.verify_jwt ?? null,
      version: row?.version ?? null,
      pass: Boolean(row) && jwtOk,
    });
  }
  const unexpected = actual.filter((r) => !expected.some((f) => f.name === r.name)).map((r) => r.name);
  return { rows, unexpected, pass: rows.every((r) => r.pass) && unexpected.length === 0 };
}

async function main() {
  const args = parse(process.argv.slice(2));
  const evidence = { step: 'phase-11-12', mode: 'verify-read-only', project_ref: PROJECT_REF, started_at: new Date().toISOString() };
  try {
    if (PROJECT_REF !== 'zrutlrhhvfcsmssjiijl') throw new Error('refusing: unexpected project reference');
    const token = checkToken();
    evidence.token_present = token.present;
    if (!args.smokeOnly) {
      if (!token.present) throw new Error(`refusing: ${token.hint}`);
      const inventory = fetchDeployed();
      evidence.inventory = inventory;
      const cmp = compareInventory(FUNCTIONS, inventory);
      evidence.inventory_check = cmp;
      evidence.smoke = await smokeTests(FUNCTIONS.map((f) => f.name));
    } else {
      evidence.smoke = await smokeTests(FUNCTIONS.map((f) => f.name));
    }
    const smokeOk = evidence.smoke.every((s) => s.pass);
    evidence.result = smokeOk && (evidence.inventory_check?.pass ?? true) ? 'VERIFIED' : 'FAILED';
    evidence.evidence_file = writeEvidence(args.evidence, evidence);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(evidence.result === 'VERIFIED' ? 0 : 1);
  } catch (e) {
    evidence.result = 'STOPPED';
    evidence.reason = String(e?.message ?? e);
    evidence.evidence_file = writeEvidence(args.evidence, evidence);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('staging-functions-verify.mjs')) await main();
