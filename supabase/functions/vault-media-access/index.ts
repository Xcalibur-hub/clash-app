/**
 * CLASH 2.0 — private Vault media access (Edge Function).
 * ---------------------------------------------------------------------------
 * The ONLY way subscriber-only Vault media is ever served. A private object in
 * `private-media` is not publicly readable (bucket `public: false`, and the
 * Storage RLS policy grants reads to the object's owner only), so the app cannot
 * cheat by hiding a URL: there is no public URL to hide.
 *
 *   Expo client
 *     → POST /functions/v1/vault-media-access   { dropId }   (Bearer <user JWT>)
 *     → this function, as the CALLER, calls `vault_drop_media_target(dropId)`
 *     → Postgres resolves the viewer from the verified JWT and runs the single
 *       entitlement helper `can_access_vault_drop`
 *     → the function signs the object with the service-role key for 120 seconds
 *     → the client loads the returned short-lived URL
 *
 * Security properties, in order of importance:
 *   1. The service-role key lives only in this runtime's environment. It is never
 *      sent to Expo, never embedded in the bundle, and never returned.
 *   2. The caller is resolved server-side. The body carries a drop id and nothing
 *      else — there is no viewer id to spoof.
 *   3. The entitlement decision is Postgres's, not this function's. If the RPC
 *      returns no row we return 403 and never touch Storage, so a guessed storage
 *      path buys nothing.
 *   4. Signed URLs are short-lived (120s) and are never persisted anywhere.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Short by design: long enough to start playback, short enough to be useless if it leaks. */
const SIGNED_URL_TTL_SECONDS = 120;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MediaTarget {
  bucket: string;
  path: string;
  mediaKind: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthenticated' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const dropId = (payload as { dropId?: unknown } | null)?.dropId;
  if (typeof dropId !== 'string' || dropId.length === 0 || dropId.length > 64) {
    return json({ error: 'bad_request' }, 400);
  }

  // ── 1. As the caller: keep the JWT, so Postgres decides entitlement ───────
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await asCaller.auth.getUser();
  if (authError || !userData?.user) return json({ error: 'unauthenticated' }, 401);

  const { data: target, error: targetError } = await asCaller.rpc('vault_drop_media_target', {
    p_drop_id: dropId,
  });
  if (targetError) return json({ error: 'access_check_failed' }, 500);
  // No row means: no entitlement, a block, a retracted Drop, or a tombstoned
  // object. All four are "no".
  if (!target) return json({ error: 'forbidden' }, 403);

  const media = target as MediaTarget;
  if (typeof media.bucket !== 'string' || typeof media.path !== 'string') {
    return json({ error: 'bad_payload' }, 500);
  }

  // ── 2. As the service: sign the object, server-side only ──────────────────
  const asService = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signed, error: signError } = await asService.storage
    .from(media.bucket)
    .createSignedUrl(media.path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) return json({ error: 'signing_failed' }, 500);

  return json(
    {
      url: signed.signedUrl,
      bucket: media.bucket,
      mediaKind: media.mediaKind,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    },
    200,
  );
});
