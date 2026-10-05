/**
 * CLASH 2.0 — Digital Creator (Edge Function), Phase 15.5B.
 * ---------------------------------------------------------------------------
 * Renders an already-authorized Creator AI reply with a creator-authorized
 * avatar/voice provider. It is the ONLY place a rendering provider is called,
 * and the only place its key exists.
 *
 * Division of authority:
 *   · `creator-ai` decides WHAT is said (knowledge, access, safety).
 *   · This function decides NOTHING about content: it renders `messageId`, a
 *     reply our own pipeline already produced and stored. A client cannot ask us
 *     to speak arbitrary text, which keeps us from becoming a free TTS proxy.
 *   · Postgres decides WHO may open a session (`start_digital_creator_session`).
 *
 * With no provider configured we answer "not connected" — we never fabricate
 * avatar video or synthesized voice.
 *
 * PRIVACY: no audio is stored. Microphone input, when a build supports it, would
 * be transcribed transiently and discarded; nothing from a fan is ever learned
 * by the creator's AI.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveDigitalProvider, type DigitalCreatorMode } from './provider.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Postgres error code → HTTP status. Never leaks the underlying message. */
function statusForError(code: string | undefined, hint: string | undefined): number {
  if (code === '42501') return 401;
  if (code === 'P0001') return (hint ?? '').includes('slow down') ? 429 : 403;
  if (code === 'P0002') return 404;
  if (code === 'P0003') return 400;
  if (code === 'P0004') return 409;
  return 500;
}

interface ProfileRow {
  enabled: boolean;
  avatar_provider: string;
  avatar_external_id: string | null;
  voice_external_id: string | null;
  avatar_enabled: boolean;
  voice_enabled: boolean;
  likeness_consent_at: string | null;
}

/** Re-checked server-side at render time: a flag can flip mid-session. */
function modeAllowed(profile: ProfileRow, mode: DigitalCreatorMode): boolean {
  if (!profile.enabled) return false;
  if (profile.likeness_consent_at === null) return false;
  if (profile.avatar_provider === 'none' || profile.avatar_external_id === null) return false;
  return mode === 'AVATAR' ? profile.avatar_enabled : profile.voice_enabled;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ status: 'error', error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ status: 'error', error: 'unauthenticated' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ status: 'error', error: 'server_misconfigured' }, 500);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ status: 'error', error: 'bad_request' }, 400);
  }
  const body = payload as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : 'status';

  const provider = resolveDigitalProvider({
    apiKey: Deno.env.get('DIGITAL_CREATOR_API_KEY'),
    baseUrl: Deno.env.get('DIGITAL_CREATOR_BASE_URL'),
  });

  // ── Capability probe: lets the room be honest before anyone enters ────────
  if (action === 'status') {
    return json(
      {
        status: 'ok',
        provider: provider.name,
        configured: provider.configured,
        modes: provider.configured ? ['AVATAR', 'VOICE'] : [],
        text: true,
      },
      200,
    );
  }

  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const asService = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await asCaller.auth.getUser();
  if (authError || !userData?.user) return json({ status: 'error', error: 'unauthenticated' }, 401);

  // ── Open a session: Postgres decides whether this viewer may ─────────────
  if (action === 'start') {
    const creatorId = body?.creatorId;
    const mode = body?.mode;
    if (typeof creatorId !== 'string' || (mode !== 'VOICE' && mode !== 'AVATAR')) {
      return json({ status: 'error', error: 'bad_request' }, 400);
    }

    const { data: opened, error: openError } = await asCaller.rpc('start_digital_creator_session', {
      p_creator_id: creatorId,
      p_mode: mode,
    });
    if (openError) {
      return json(
        { status: 'error', error: 'session_rejected' },
        statusForError(openError.code, openError.hint),
      );
    }

    const sessionId = (opened as { sessionId?: unknown } | null)?.sessionId;
    if (typeof sessionId !== 'string') {
      return json({ status: 'error', error: 'bad_session' }, 500);
    }

    // Nothing connected: end the handle immediately rather than leave a session
    // open that could never render.
    if (!provider.configured) {
      await asService
        .from('digital_creator_sessions')
        .update({ status: 'ENDED', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('status', 'ACTIVE');
      return json({ status: 'unconfigured', provider: provider.name, mode }, 200);
    }

    const { data: profile } = await asService
      .from('creator_ai_profiles')
      .select('avatar_provider,avatar_external_id,voice_external_id')
      .eq('creator_id', creatorId)
      .maybeSingle();

    const avatarRef =
      profile && typeof profile.avatar_external_id === 'string' ? profile.avatar_external_id : null;
    if (!avatarRef) {
      return json({ status: 'unconfigured', provider: provider.name, mode }, 200);
    }

    const started = await provider.startSession({
      mode,
      avatarExternalId: avatarRef,
      voiceExternalId:
        profile && typeof profile.voice_external_id === 'string' ? profile.voice_external_id : null,
    });
    if (!started.ok) {
      return json({ status: 'unavailable', reason: started.reason ?? 'provider_error', mode }, 200);
    }

    if (started.providerSessionRef) {
      // Server-only: used to close the provider session properly later.
      await asService
        .from('digital_creator_sessions')
        .update({ provider_session_ref: started.providerSessionRef })
        .eq('id', sessionId);
    }

    return json(
      {
        status: 'ok',
        sessionId,
        mode,
        expiresAt: (opened as { expiresAt?: unknown } | null)?.expiresAt ?? null,
        textFallback: (opened as { textFallback?: unknown } | null)?.textFallback ?? true,
      },
      200,
    );
  }


  // ── Render one already-generated reply ───────────────────────────────────
  if (action === 'speak') {
    const sessionId = body?.sessionId;
    const messageId = body?.messageId;
    if (typeof sessionId !== 'string' || typeof messageId !== 'string') {
      return json({ status: 'error', error: 'bad_request' }, 400);
    }

    // Ownership check through an RPC resolved as the caller: a handle that is
    // not theirs is invisible, and empty means "not yours".
    const { data: card, error: cardError } = await asCaller.rpc('digital_creator_session_card', {
      p_session_id: sessionId,
    });
    if (cardError) return json({ status: 'error', error: 'session_unreadable' }, 500);
    const active = (card as { active?: unknown } | null)?.active === true;
    if (!active) return json({ status: 'error', error: 'session_inactive' }, 409);

    const { data: sessionRow } = await asService
      .from('digital_creator_sessions')
      .select('id,creator_id,profile_id,mode,status,expires_at,provider_session_ref')
      .eq('id', sessionId)
      .maybeSingle();
    if (
      !sessionRow ||
      sessionRow.status !== 'ACTIVE' ||
      new Date(sessionRow.expires_at) <= new Date()
    ) {
      return json({ status: 'error', error: 'session_inactive' }, 409);
    }

    // The text is OUR text: an assistant reply from this viewer's conversation
    // with this creator. The client never supplies it.
    const { data: message } = await asService
      .from('creator_ai_messages')
      .select('id,body,role,conversation_id')
      .eq('id', messageId)
      .maybeSingle();
    if (!message || message.role !== 'assistant' || typeof message.body !== 'string') {
      return json({ status: 'error', error: 'message_not_found' }, 404);
    }
    const { data: conversation } = await asService
      .from('creator_ai_conversations')
      .select('id,profile_id,creator_id')
      .eq('id', message.conversation_id)
      .maybeSingle();
    if (
      !conversation ||
      conversation.profile_id !== sessionRow.profile_id ||
      conversation.creator_id !== sessionRow.creator_id
    ) {
      return json({ status: 'error', error: 'message_not_found' }, 404);
    }

    const { data: profile } = await asService
      .from('creator_ai_profiles')
      .select(
        'enabled,avatar_provider,avatar_external_id,voice_external_id,avatar_enabled,voice_enabled,likeness_consent_at',
      )
      .eq('creator_id', sessionRow.creator_id)
      .maybeSingle();
    const typedProfile = profile as ProfileRow | null;
    const mode = sessionRow.mode as DigitalCreatorMode;
    if (!typedProfile || !modeAllowed(typedProfile, mode)) {
      return json({ status: 'unavailable', reason: 'not_configured', mode }, 200);
    }

    if (!provider.configured) {
      return json({ status: 'unconfigured', provider: provider.name, mode }, 200);
    }

    const rendered = await provider.render({
      mode,
      text: message.body,
      avatarExternalId: typedProfile.avatar_external_id ?? '',
      voiceExternalId: typedProfile.voice_external_id,
      providerSessionRef: sessionRow.provider_session_ref ?? null,
    });
    if (!rendered.ok) {
      return json({ status: 'unavailable', reason: rendered.reason, mode }, 200);
    }

    // Outcome only: never the text, never a URL, never a credential.
    console.log(JSON.stringify({ at: 'digital-creator', render: 'ok', mode }));

    return json(
      {
        status: 'ok',
        mode,
        audioUrl: rendered.audioUrl,
        videoUrl: rendered.videoUrl,
      },
      200,
    );
  }

  // ── Close the session ────────────────────────────────────────────────────
  if (action === 'end') {
    const sessionId = body?.sessionId;
    if (typeof sessionId !== 'string') {
      return json({ status: 'error', error: 'bad_request' }, 400);
    }

    // The RPC is the authority on ownership; only if it actually closed one of
    // this viewer's sessions do we close the provider side too.
    const { data: ended, error: endError } = await asCaller.rpc('end_digital_creator_session', {
      p_session_id: sessionId,
    });
    if (endError) return json({ status: 'error', error: 'end_failed' }, 500);
    if (ended === true) {
      const { data: sessionRow } = await asService
        .from('digital_creator_sessions')
        .select('provider_session_ref')
        .eq('id', sessionId)
        .maybeSingle();
      await provider.endSession(sessionRow?.provider_session_ref ?? null);
    }
    return json({ status: 'ok' }, 200);
  }

  return json({ status: 'error', error: 'unknown_action' }, 400);
});

