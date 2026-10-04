/**
 * Private course lesson media — same model as vault-media-access.
 * Body: { lessonId }. Entitlement via course_lesson_media_target RPC.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  const lessonId = (payload as { lessonId?: unknown } | null)?.lessonId;
  if (typeof lessonId !== 'string' || lessonId.length === 0 || lessonId.length > 64) {
    return json({ error: 'bad_request' }, 400);
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await asCaller.auth.getUser();
  if (authError || !userData?.user) return json({ error: 'unauthenticated' }, 401);

  const { data: target, error: targetError } = await asCaller.rpc('course_lesson_media_target', {
    p_lesson_id: lessonId,
  });
  if (targetError) return json({ error: 'access_check_failed' }, 500);
  if (!target) return json({ error: 'forbidden' }, 403);

  const media = target as MediaTarget;
  if (typeof media.bucket !== 'string' || typeof media.path !== 'string') {
    return json({ error: 'bad_payload' }, 500);
  }

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
