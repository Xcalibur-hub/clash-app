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
