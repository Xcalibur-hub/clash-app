/**
 * Staging Edge Function manifest (Phase 11 Step 12).
 *
 * Single source of truth for the automated staging deployment workflow. This is
 * CONFIGURATION ONLY — it contains no secret values and no project keys.
 *
 * `secrets` lists OPERATOR-PROVIDED secret names. Platform-injected variables
 * (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are provided by
 * Supabase at runtime and must never be set as function secrets.
 */

export const PROJECT_REF = 'zrutlrhhvfcsmssjiijl';
export const PROJECT_HOST = `${PROJECT_REF}.supabase.co`;

/** Platform-injected for every function; never operator secrets. */
export const PLATFORM_INJECTED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

/**
 * `verifyJwt` mirrors supabase/config.toml [functions.<name>]. arena-editorial is
 * the ONLY intentional exception (server-only worker guarded by a shared secret).
 * `required` secrets block deployment readiness; `optional` do not.
 */
export const FUNCTIONS = [
  {
    name: 'vault-media-access',
    verifyJwt: true,
    required: [],
    optional: [],
    external: [],
    purpose: 'signs private Vault media for an entitled caller',
    degrade: 'core private media playback is unavailable',
  },
  {
    name: 'course-lesson-media-access',
    verifyJwt: true,
    required: [],
    optional: [],
    external: [],
    purpose: 'signs private course-lesson media for an entitled caller',
    degrade: 'private lesson media is unavailable; public catalogue still works',
  },
  {
    name: 'creator-ai',
    verifyJwt: true,
    required: [],
    optional: ['CREATOR_AI_API_KEY', 'CREATOR_AI_BASE_URL', 'CREATOR_AI_MODEL'],
    external: ['AI provider (optional, paid if used)'],
    purpose: 'the only place a Creator AI provider is called',
    degrade: 'answers "AI provider not configured"; nothing is fabricated',
  },
  {
    name: 'digital-creator',
    verifyJwt: true,
    required: [],
    optional: ['DIGITAL_CREATOR_API_KEY', 'DIGITAL_CREATOR_BASE_URL'],
    external: ['avatar/voice rendering provider (optional, paid if used)'],
    purpose: 'renders an already-authorized Creator AI reply',
    degrade: 'answers "not connected"; rooms stay text-only',
  },
  {
    name: 'arena-editorial',
    verifyJwt: false,
    required: ['ARENA_EDITORIAL_RUN_SECRET'],
    optional: ['ARENA_AI_API_KEY', 'ARENA_AI_MODEL', 'ARENA_AI_BASE_URL'],
    external: ['AI provider (optional)', 'per-source keys named by arena_editorial_sources.secret_name (optional)'],
    purpose: 'server-only editorial worker; JWT verification intentionally disabled',
    degrade: 'worker refuses (401) without the run secret; with no AI key it defers generation',
    note: 'ARENA_EDITORIAL_RUN_SECRET must be >= 32 characters; the function compares it in constant time',
  },
  {
    name: 'arena-gifs',
    verifyJwt: true,
    required: [],
    optional: ['TENOR_API_KEY'],
    external: ['Tenor GIF API (free tier; no purchase required)'],
    purpose: 'authenticated GIF proxy; keeps TENOR_API_KEY server-side',
    degrade: 'returns 503 not_configured; the client feature flag is false by default',
  },
];

/** Functions whose JWT verification is intentionally disabled (exactly one). */
export const JWT_EXEMPT = FUNCTIONS.filter((f) => !f.verifyJwt).map((f) => f.name);

export function requiredSecretNames() {
  return [...new Set(FUNCTIONS.flatMap((f) => f.required))].sort();
}

export function allSecretNames() {
  return [...new Set(FUNCTIONS.flatMap((f) => [...f.required, ...f.optional]))].sort();
}
