/**
 * Pure, dependency-free checks for the staging deployment tooling (Phase 11 Step 13).
 * Every function returns { ok, reason } (or a structured result) and performs no
 * I/O, so each failure condition is covered by an offline regression test.
 */

const TOKEN_PATTERNS = [
  /sbp_[A-Za-z0-9]{16,}/g,                                       // Supabase personal access token
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, // JWT
  /(Bearer\s+)[A-Za-z0-9._-]{8,}/gi,
  /((?:apikey|api_key|password|secret|token)\s*[=:]\s*)[^\s'"]{6,}/gi,
];

/** Scrubs anything that looks like a credential from captured text. */
export function redact(text) {
  return String(text ?? '')
    .replace(TOKEN_PATTERNS[0], '[REDACTED_TOKEN]')
    .replace(TOKEN_PATTERNS[1], '[REDACTED_JWT]')
    .replace(TOKEN_PATTERNS[2], '$1[REDACTED]')
    .replace(TOKEN_PATTERNS[3], '$1[REDACTED]');
}

/** True when the text still contains something credential-like (test guard). */
export function containsSecretLike(text) {
  return TOKEN_PATTERNS.some((re) => new RegExp(re.source, re.flags).test(String(text ?? '')));
}

/** Recursively asserts that no string in an evidence payload is credential-like. */
export function evidenceIsSanitized(value) {
  if (typeof value === 'string') return !containsSecretLike(value);
  if (Array.isArray(value)) return value.every(evidenceIsSanitized);
  if (value && typeof value === 'object') return Object.values(value).every(evidenceIsSanitized);
  return true;
}

export function checkProjectRef(ref, confirm) {
  if (ref !== 'zrutlrhhvfcsmssjiijl') return { ok: false, reason: `unexpected project ref: ${ref}` };
  if (confirm !== ref) return { ok: false, reason: `--confirm-project must repeat the exact ref (${ref})` };
  return { ok: true, reason: 'project identity confirmed' };
}

export function checkCommitPin({ expected, actual, clean, dirtyPaths = [] }) {
  if (!expected) return { ok: false, reason: '--commit <sha> is required for an execute run' };
  if (!clean) return { ok: false, reason: `working tree not clean (${dirtyPaths.length} path(s))` };
  if (!actual) return { ok: false, reason: 'could not resolve HEAD' };
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    return { ok: false, reason: `HEAD ${actual} does not match pinned commit ${expected}` };
  }
  return { ok: true, reason: `commit pinned at ${expected}` };
}

export function checkCliVersion(output, pinned) {
  const text = String(output ?? '');
  if (!text.includes(pinned)) return { ok: false, reason: `CLI version mismatch: expected ${pinned}, saw ${redact(text).trim()}` };
  return { ok: true, reason: `CLI ${pinned}` };
}

export function selectFunctions({ requested, approved, manifest }) {
  const names = new Set(manifest.map((f) => f.name));
  const unknown = requested.filter((n) => !names.has(n));
  const notApproved = requested.filter((n) => !approved.includes(n));
  const selected = requested.filter((n) => names.has(n) && approved.includes(n));
  if (unknown.length) return { ok: false, reason: `unknown function(s): ${unknown.join(', ')}`, selected };
  if (notApproved.length) return { ok: false, reason: `not in the approved deployment set: ${notApproved.join(', ')}`, selected };
  if (!selected.length) return { ok: false, reason: 'no functions selected', selected };
  return { ok: true, reason: `${selected.length} approved function(s)`, selected };
}

/** Strict: verify_jwt must be exactly a boolean equal to the expectation. */
export function checkJwtEquals(observed, expected, name) {
  if (typeof observed !== 'boolean') return { ok: false, reason: `${name}: deployed verify_jwt is ${JSON.stringify(observed)} (must be a boolean)` };
  if (observed !== expected) return { ok: false, reason: `${name}: deployed verify_jwt ${observed} != expected ${expected}` };
  return { ok: true, reason: `${name}: verify_jwt=${expected}` };
}

export function requiredSecretsForSet(selected, manifest) {
  return [...new Set(selected.flatMap((n) => manifest.find((f) => f.name === n)?.required ?? []))].sort();
}

export function checkSecretPrereqs({ required, present }) {
  const missing = required.filter((n) => !present.includes(n));
  if (missing.length) return { ok: false, reason: `missing required secret(s) for the selected set: ${missing.join(', ')}`, missing };
  return { ok: true, reason: `required secrets present: ${required.length}`, missing: [] };
}

/** Fail-closed inventory verification: rejects unexpected names, JWT mismatches,
 *  and — with `requireAll` — any expected function that is missing. */
export function checkInventory({ manifest, actual, allowlist = [], requireAll = false }) {
  const rows = [];
  for (const f of manifest) {
    const row = actual.find((r) => r.name === f.name);
    const jwt = checkJwtEquals(row?.verify_jwt, f.verifyJwt, f.name);
    rows.push({ name: f.name, deployed: Boolean(row), version: row?.version ?? null, verify_jwt: row?.verify_jwt ?? null, pass: Boolean(row) && jwt.ok });
  }
  const unexpected = actual.filter((r) => !manifest.some((f) => f.name === r.name)).map((r) => r.name);
  const notAllowlisted = unexpected.filter((n) => !allowlist.includes(n));
  const mismatched = rows.filter((r) => r.deployed && !r.pass).map((r) => r.name);
  const missing = rows.filter((r) => !r.deployed).map((r) => r.name);
  const ok = notAllowlisted.length === 0 && mismatched.length === 0 && (!requireAll || missing.length === 0);
  const reason = notAllowlisted.length
    ? `unexpected deployed function(s): ${notAllowlisted.join(', ')}`
    : mismatched.length
      ? `verify_jwt mismatch: ${mismatched.join(', ')}`
      : requireAll && missing.length
        ? `expected function(s) missing: ${missing.join(', ')}`
        : 'inventory matches manifest';
  return { ok, reason, rows, unexpected, notAllowlisted, missing };
}

export function checkPartialDeployment({ requested, actual }) {
  const missing = requested.filter((n) => !actual.some((r) => r.name === n));
  if (missing.length) return { ok: false, reason: `partial deployment: missing ${missing.join(', ')}`, missing };
  return { ok: true, reason: 'all requested functions present', missing: [] };
}

export function checkSmoke(results) {
  if (!results?.length) return { ok: false, reason: 'no smoke results' };
  const bad = results.filter((r) => r.status !== 401);
  if (bad.length) return { ok: false, reason: `negative-auth smoke failed: ${bad.map((b) => `${b.name}=${b.status}`).join(', ')}` };
  return { ok: true, reason: `all ${results.length} function(s) rejected an unauthenticated call with 401` };
}

/** Evidence is built from an explicit allowlist of fields — never from process.env. */
export function buildEvidence({ mode, commit, branch, projectRef, selected, manifest, checks, deployed, inventory, smoke }) {
  return {
    step: 'phase-11-13',
    mode,
    project_ref: projectRef,
    source: { commit, branch },
    approved_set: selected ?? [],
    functions: (manifest ?? []).filter((f) => (selected ?? []).includes(f.name)).map((f) => ({ name: f.name, verify_jwt: f.verifyJwt, required: f.required, optional: f.optional })),
    checks: checks ?? [],
    deployed: deployed ?? [],
    inventory: inventory ?? [],
    smoke: smoke ?? [],
    secrets_read: false,
    secret_values_present: false,
    generated_at: new Date().toISOString(),
  };
}

