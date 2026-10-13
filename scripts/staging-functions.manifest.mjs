/**
 * Staging Edge Function manifest (Phase 11 Steps 12–13).
 *
 * CONFIGURATION ONLY — no secret values, no keys. Single source of truth for the
 * deployment tooling, the verification tooling and the offline regression tests.
 */

export const PROJECT_REF = 'zrutlrhhvfcsmssjiijl';
export const PROJECT_HOST = `${PROJECT_REF}.supabase.co`;

/** Reviewed, pinned CLI version. Never rely on an unpinned `npx supabase`. */
export const PINNED_CLI_VERSION = '2.40.7';
export const CLI_SPEC = `supabase@${PINNED_CLI_VERSION}`;

/** Platform-injected for every function; never operator secrets. */
export const PLATFORM_INJECTED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

/** Functions approved for the FIRST automated deployment (Step 13 scope). */
export const APPROVED_DEPLOYMENT_SET = ['vault-media-access', 'course-lesson-media-access', 'creator-ai', 'digital-creator'];

/**
 * Names tolerated as ALREADY deployed on top of the manifest. Anything deployed
 * that is neither in the manifest nor in this list fails verification.
 */
export const REVIEWED_DEPLOYED_ALLOWLIST = [];

export const FUNCTIONS = [
  { name: 'vault-media-access', verifyJwt: true, required: [], optional: [], external: [], purpose: 'signs private Vault media for an entitled caller', degrade: 'core private media playback is unavailable' },
  { name: 'course-lesson-media-access', verifyJwt: true, required: [], optional: [], external: [], purpose: 'signs private course-lesson media for an entitled caller', degrade: 'private lesson media is unavailable; public catalogue still works' },
  { name: 'creator-ai', verifyJwt: true, required: [], optional: ['CREATOR_AI_API_KEY', 'CREATOR_AI_BASE_URL', 'CREATOR_AI_MODEL'], external: ['AI provider (optional, paid if used)'], purpose: 'the only place a Creator AI provider is called', degrade: 'answers "AI provider not configured"; nothing is fabricated' },
  { name: 'digital-creator', verifyJwt: true, required: [], optional: ['DIGITAL_CREATOR_API_KEY', 'DIGITAL_CREATOR_BASE_URL'], external: ['avatar/voice rendering provider (optional, paid if used)'], purpose: 'renders an already-authorized Creator AI reply', degrade: 'answers "not connected"; rooms stay text-only' },
  { name: 'arena-editorial', verifyJwt: false, required: ['ARENA_EDITORIAL_RUN_SECRET'], optional: ['ARENA_AI_API_KEY', 'ARENA_AI_MODEL', 'ARENA_AI_BASE_URL'], external: ['AI provider (optional)', 'per-source keys named by arena_editorial_sources.secret_name (optional)'], purpose: 'server-only editorial worker; JWT verification intentionally disabled', degrade: 'refuses (401) without the run secret; defers generation with no AI key', note: 'ARENA_EDITORIAL_RUN_SECRET must be >= 32 characters; compared in constant time' },
  { name: 'arena-gifs', verifyJwt: true, required: [], optional: ['TENOR_API_KEY'], external: ['Tenor GIF API (free tier; no purchase required)'], purpose: 'authenticated GIF proxy; keeps TENOR_API_KEY server-side', degrade: 'returns 503 not_configured; client flag is false by default' },
];

/** Functions whose JWT verification is intentionally disabled (exactly one). */
export const JWT_EXEMPT = FUNCTIONS.filter((f) => !f.verifyJwt).map((f) => f.name);

export function requiredSecretsFor(names) {
  return [...new Set(names.flatMap((n) => FUNCTIONS.find((f) => f.name === n)?.required ?? []))].sort();
}

export function allSecretNames() {
  return [...new Set(FUNCTIONS.flatMap((f) => [...f.required, ...f.optional]))].sort();
}
