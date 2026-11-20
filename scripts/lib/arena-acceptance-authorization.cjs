const assert = require('node:assert/strict');
const crypto = require('node:crypto');

/**
 * Verifiable owner authorization artifact.
 *
 * An artifact is a small JSON document describing exactly what one bounded run may
 * do, signed with HMAC-SHA256 by a key held OUTSIDE this repository (environment
 * variable, injected into the process for that session only). Nothing here reads,
 * writes, or defaults a secret: a missing key simply yields `key_unavailable`.
 *
 * Why HMAC and not asymmetric signing: the reviewer requested no signing secrets in
 * the repository. HMAC with a caller-supplied key satisfies "verifiable artifact"
 * without adding key-management surface. The trust root is explicitly an
 * out-of-repository secret, and this is documented as a limitation.
 */

const REQUIRED_FIELDS = Object.freeze([
  'version', 'manifestHash', 'planDigest', 'issuedAt', 'expiresAt', 'budget', 'attemptCaps', 'runId',
]);

/** Canonical serialization: sorted keys, no whitespace, so signatures are stable. */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/** The bytes actually signed: every artifact field except the signature. */
function signingPayload(artifact) {
  const { signature: _ignored, ...rest } = artifact;
  return canonicalize(rest);
}

function signArtifact(artifact, key) {
  assert.equal(typeof key, 'string', 'signing key required');
  assert.ok(key.length >= 32, 'signing key must be at least 32 characters');
  assert.ok(!('signature' in artifact), 'artifact must not already carry a signature');
  return crypto.createHmac('sha256', key).update(signingPayload(artifact)).digest('hex');
}

/** Validate artifact shape before any cryptographic check. */
function validateArtifactShape(artifact) {
  if (!artifact || typeof artifact !== 'object') return 'artifact_missing';
  for (const field of REQUIRED_FIELDS) {
    if (!(field in artifact)) return `artifact_missing_field:${field}`;
  }
  if (artifact.version !== 1) return 'artifact_unsupported_version';
  if (typeof artifact.manifestHash !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.manifestHash)) return 'artifact_invalid_manifest';
  if (typeof artifact.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.planDigest)) return 'artifact_invalid_plan';
  if (!Number.isFinite(artifact.issuedAt) || !Number.isFinite(artifact.expiresAt)) return 'artifact_invalid_times';
  if (artifact.expiresAt <= artifact.issuedAt) return 'artifact_invalid_times';
  if (typeof artifact.runId !== 'string' || !artifact.runId) return 'artifact_invalid_run_id';
  if (!artifact.budget || typeof artifact.budget !== 'object') return 'artifact_invalid_budget';
  if (!artifact.attemptCaps || typeof artifact.attemptCaps !== 'object') return 'artifact_invalid_attempt_caps';
  if (typeof artifact.signature !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.signature)) return 'artifact_unsigned';
  return null;
}

/**
 * Verify an artifact: shape, signature, manifest and plan binding, expiry, and
 * optional clock skew. Every refusal names a distinct reason.
 */
function verifyArtifact(artifact, key, { now, manifestHash, planDigest = null, maxClockSkewMs = 5 * 60 * 1000 } = {}) {
  const shapeError = validateArtifactShape(artifact);
  if (shapeError) return { ok: false, reason: shapeError };
  if (typeof key !== 'string' || key.length < 32) return { ok: false, reason: 'key_unavailable' };

  const expected = crypto.createHmac('sha256', key).update(signingPayload(artifact)).digest('hex');
  const actual = Buffer.from(artifact.signature, 'hex');
  const wanted = Buffer.from(expected, 'hex');
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) {
    return { ok: false, reason: 'artifact_bad_signature' };
  }
  if (manifestHash && artifact.manifestHash !== manifestHash) return { ok: false, reason: 'artifact_manifest_mismatch' };
  if (planDigest && artifact.planDigest !== planDigest) return { ok: false, reason: 'artifact_plan_mismatch' };
  if (now() < artifact.issuedAt - maxClockSkewMs) return { ok: false, reason: 'artifact_not_yet_valid' };
  if (now() >= artifact.expiresAt) return { ok: false, reason: 'artifact_expired' };
  return { ok: true, reason: 'artifact_verified', artifact };
}

/**
 * Load a signing key from the environment for THIS process only.
 * Never returns a default; absence is an explicit unavailable state.
 */
function signingKeyFromEnv(env = process.env, name = 'CLASH_ARENA_APPROVAL_KEY') {
  const value = env?.[name];
  if (typeof value !== 'string' || value.length < 32) return null;
  return value;
}

/**
 * Build the scheduler-facing approval gate over the artifact verifier.
 * `loadArtifact` is injected: it reads the artifact from wherever the owner put it.
 */
function createArtifactGate({ loadArtifact, key, now, maxClockSkewMs } = {}) {
  assert.equal(typeof loadArtifact, 'function', 'artifact loader required');
  assert.equal(typeof now, 'function', 'clock required');

  return async ({ manifestHash, planDigest = null } = {}) => {
    let artifact;
    try {
      artifact = await loadArtifact();
    } catch {
      return { ok: false, reason: 'artifact_unavailable' };
    }
    return verifyArtifact(artifact, typeof key === 'function' ? key() : key, {
      now, manifestHash, planDigest, maxClockSkewMs,
    });
  };
}

module.exports = {
  REQUIRED_FIELDS,
  canonicalize,
  signingPayload,
  signArtifact,
  verifyArtifact,
  validateArtifactShape,
  signingKeyFromEnv,
  createArtifactGate,
};
