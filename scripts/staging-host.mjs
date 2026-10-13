/**
 * The single definition of the staging target (Phase 11 Step 16A).
 *
 * Kept in its own leaf module — with NO imports of its own — so that the harness, the
 * fixture lifecycle and the authenticated suite can all share it without a circular
 * import. A cycle here made the harness's dynamic import of the authenticated suite
 * deadlock (Node exits 13 on an unsettled top-level await), which is exactly the kind of
 * failure this split prevents.
 */
export const STAGING_HOST = 'zrutlrhhvfcsmssjiijl.supabase.co';
export const FUNCTIONS_V1 = '/functions/v1/';

/** Refuses every host that is not exactly the staging Edge Function host. */
export function assertStagingTarget(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('refusing: https required');
  if (u.hostname !== STAGING_HOST) throw new Error(`refusing: not the staging Edge Function host (${u.hostname})`);
  return true;
}

export function buildFunctionUrl(name, host = STAGING_HOST) {
  assertStagingTarget(`https://${host}`);
  return `https://${host}${FUNCTIONS_V1}${name}`;
}

/**
 * Evidence redaction (Step 16A.1). Every string this toolkit writes to a console or an evidence
 * file passes through here, so a signed URL, a JWT, a personal access token, a bearer token or a
 * fixture email can never be preserved by accident. `secrets` adds any caller-known secret values.
 */
export const EVIDENCE_REDACTION_PATTERNS = [
  [/https?:\/\/[^\s"']*\/storage\/v1\/object\/sign\/[^\s"']*/g, '[redacted-signed-url]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[redacted-jwt]'],
  [/sbp_[A-Za-z0-9]{10,}/g, '[redacted-pat]'],
  [/eyJ[A-Za-z0-9_-]{30,}/g, '[redacted-key]'],
  [/([?&]token=)[^&\s"']+/g, '$1[redacted]'],
  [/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '[redacted-email]'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[redacted-uuid]'],
];

export function redactForEvidence(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret && String(secret).length >= 6) out = out.split(String(secret)).join('[redacted]');
  }
  for (const [pattern, replacement] of EVIDENCE_REDACTION_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
