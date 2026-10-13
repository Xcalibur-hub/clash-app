/**
 * Staging Edge Function verification (Phase 11 Steps 12–13) — READ-ONLY.
 *
 * Verifies the deployed inventory against the reviewed manifest with STRICT JWT
 * checking (a null/absent/ambiguous `verify_jwt` fails closed), rejects deployed
 * functions that are neither in the manifest nor in the reviewed allowlist, and
 * runs negative-authentication smoke tests. It deploys nothing.
 *
 * Usage:
 *   node scripts/staging-functions-verify.mjs                 # inventory + smoke (needs a token)
 *   node scripts/staging-functions-verify.mjs --smoke-only    # smoke only (no token needed)
 */
import path from 'node:path';
import { FUNCTIONS, PROJECT_REF, REVIEWED_DEPLOYED_ALLOWLIST } from './staging-functions.manifest.mjs';
import { checkInventory, checkSmoke, evidenceIsSanitized, redact } from './staging-functions.lib.mjs';
import { ROOT, TOKEN_ENV, fetchDeployed, smokeTests, writeEvidence } from './staging-functions-deploy.mjs';

export function parseVerifyArgs(argv) {
  const out = { smokeOnly: false, evidence: path.join(ROOT, '.expo', 'staging-verify', String(Date.now())) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--smoke-only') out.smokeOnly = true;
    else if (argv[i] === '--evidence-dir') out.evidence = path.resolve(String(argv[++i] ?? ''));
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

export async function run(argv = process.argv.slice(2), deps = { fetchDeployed, smokeTests }) {
  const args = parseVerifyArgs(argv);
  const evidence = { step: 'phase-11-13', mode: 'verify-read-only', project_ref: PROJECT_REF, started_at: new Date().toISOString(), secrets_read: false };
  try {
    if (PROJECT_REF !== 'zrutlrhhvfcsmssjiijl') throw new Error('refusing: unexpected project reference');
    evidence.token_present = (process.env[TOKEN_ENV] ?? '').length > 0;
    if (!args.smokeOnly) {
      if (!evidence.token_present) throw new Error(`refusing: set ${TOKEN_ENV} in this shell only (never in a file, argv or log)`);
      const inventory = deps.fetchDeployed();
      evidence.inventory = inventory;
      const inv = checkInventory({ manifest: FUNCTIONS, actual: inventory, allowlist: REVIEWED_DEPLOYED_ALLOWLIST });
      evidence.inventory_check = { ok: inv.ok, reason: inv.reason, rows: inv.rows, notAllowlisted: inv.notAllowlisted };
    }
    const smoke = await deps.smokeTests(FUNCTIONS.map((f) => f.name));
    evidence.smoke = smoke;
    const sm = checkSmoke(smoke);
    evidence.smoke_check = { ok: sm.ok, reason: sm.reason };
    evidence.result = sm.ok && (evidence.inventory_check?.ok ?? true) ? 'VERIFIED' : 'FAILED';
    evidence.evidence_file = writeEvidence(args.evidence, evidence);
    return evidence;
  } catch (e) {
    evidence.result = 'STOPPED';
    evidence.reason = redact(String(e?.message ?? e));
    try { if (evidenceIsSanitized(evidence)) evidence.evidence_file = writeEvidence(args.evidence, evidence); } catch { /* nothing further */ }
    return evidence;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('staging-functions-verify.mjs')) {
  const result = await run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.result === 'VERIFIED' ? 0 : result.result === 'STOPPED' ? 2 : 1);
}
