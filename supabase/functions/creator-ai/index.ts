/**
 * CLASH 2.0 — Creator AI (Edge Function), Phase 15.5.
 * ---------------------------------------------------------------------------
 * The only place an AI provider is ever called, and the only place a provider
 * key ever exists. The app cannot reach a model, and cannot write an assistant
 * message — that write is service-role only, in `creator_ai_finish_turn`.
 *
 * Flow for one turn:
 *
 *   Expo  →  POST /functions/v1/creator-ai { conversationId, message }
 *     → this function, AS THE CALLER, calls `creator_ai_begin_turn`
 *       · Postgres resolves the viewer from the verified JWT
 *       · Postgres enforces entitlement, blocks, ownership and rate limits
 *       · Postgres returns creator notes + entitlement-filtered knowledge +
 *         a bounded slice of history, and records the viewer's message
 *     → provider adapter (vendor-agnostic) with platform safety rules first
 *     → AS THE SERVICE ROLE, `creator_ai_finish_turn` records the reply with
 *       its provenance
 *
 * If no provider is configured we say so. We never fabricate a model answer.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { systemPrompt, type AiMessage } from './instructions.ts';
import { resolveProvider } from './provider.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Output ceiling: short answers keep cost and latency predictable. */
const MAX_OUTPUT_TOKENS = 400;
/** Hard clamp in case a provider ignores max_tokens. */
const MAX_OUTPUT_CHARS = 4000;

interface TurnContext {
  conversationId: string;
  creatorId: string;
  displayName: string;
  description: string;
  instructions: string;
  knowledge: { kind: string; title: string; body: string }[];
  history: { role: string; body: string }[];
}

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

function asContext(value: unknown, creatorId: string): TurnContext | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.conversationId !== 'string') return null;
  const knowledge = Array.isArray(record.knowledge)
    ? record.knowledge
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map((item) => ({
          kind: typeof item.kind === 'string' ? item.kind : 'NOTE',
          title: typeof item.title === 'string' ? item.title : '',
          body: typeof item.body === 'string' ? item.body : '',
        }))
    : [];
  const history = Array.isArray(record.history)
    ? record.history
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          body: typeof item.body === 'string' ? item.body : '',
        }))
        .filter((item) => item.body.length > 0)
    : [];
  return {
    conversationId: record.conversationId,
    creatorId: typeof record.creatorId === 'string' ? record.creatorId : creatorId,
    displayName: typeof record.displayName === 'string' ? record.displayName : 'this creator',
    description: typeof record.description === 'string' ? record.description : '',
    instructions: typeof record.instructions === 'string' ? record.instructions : '',
    knowledge,
    history,
  };
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
  const body = payload as { action?: unknown; conversationId?: unknown; message?: unknown } | null;

  // A cheap, honest capability probe: tells the room whether a provider exists
  // BEFORE anyone types, without calling a model or touching the database.
  if (body?.action === 'status') {
    const provider = resolveProvider({
      apiKey: Deno.env.get('CREATOR_AI_API_KEY'),
      baseUrl: Deno.env.get('CREATOR_AI_BASE_URL'),
      model: Deno.env.get('CREATOR_AI_MODEL'),
    });
    return json({ status: 'ok', provider: provider.name, configured: provider.configured }, 200);
  }

  const conversationId = body?.conversationId;
  const message = body?.message;
  if (
    typeof conversationId !== 'string' ||
    conversationId.length === 0 ||
    conversationId.length > 64 ||
    typeof message !== 'string' ||
    message.trim().length === 0 ||
    message.length > 1000
  ) {
    return json({ status: 'error', error: 'bad_request' }, 400);
  }

  // ── 1. As the caller: Postgres decides everything ─────────────────────────
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await asCaller.auth.getUser();
  if (authError || !userData?.user) {
    return json({ status: 'error', error: 'unauthenticated' }, 401);
  }

  const { data: rawContext, error: beginError } = await asCaller.rpc('creator_ai_begin_turn', {
    p_conversation_id: conversationId,
    p_body: message.trim(),
  });
  if (beginError) {
    return json(
      { status: 'error', error: 'turn_rejected' },
      statusForError(beginError.code, beginError.hint),
    );
  }
  const context = asContext(rawContext, '');
  if (!context) return json({ status: 'error', error: 'bad_context' }, 500);

  // ── 2. Provider (vendor-agnostic; keys live only here) ────────────────────
  const provider = resolveProvider({
    apiKey: Deno.env.get('CREATOR_AI_API_KEY'),
    baseUrl: Deno.env.get('CREATOR_AI_BASE_URL'),
    model: Deno.env.get('CREATOR_AI_MODEL'),
  });

  if (!provider.configured) {
    // Honest development state: no model is asked, nothing is invented, and the
    // conversation still records the viewer's message for continuity.
    return json(
      { status: 'unconfigured', provider: provider.name, message: 'AI provider not configured' },
      200,
    );
  }

  const messages: AiMessage[] = [
    {
      role: 'system',
      content: systemPrompt({
        displayName: context.displayName,
        creatorName: context.creatorId,
        description: context.description,
        instructions: context.instructions,
        knowledge: context.knowledge,
      }),
    },
    ...context.history.map((entry): AiMessage => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.body,
    })),
    { role: 'user', content: message.trim() },
  ];

  const completion = await provider.complete(messages, MAX_OUTPUT_TOKENS);
  if (!completion.ok) {
    return json(
      { status: 'unavailable', reason: completion.reason, provider: completion.provider },
      502,
    );
  }
  const reply = completion.text.slice(0, MAX_OUTPUT_CHARS);

  // ── 3. As the service role: record the reply with its provenance ──────────
  const asService = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: stored, error: storeError } = await asService.rpc('creator_ai_finish_turn', {
    p_conversation_id: context.conversationId,
    p_body: reply,
    p_provider: completion.provider,
    p_model: completion.model,
  });
  if (storeError || !stored) {
    return json({ status: 'error', error: 'store_failed' }, 500);
  }

  // No message content and no identifiers beyond the turn outcome are logged.
  console.log(JSON.stringify({ at: 'creator-ai', turn: 'ok', provider: completion.provider }));

  return json({ status: 'ok', provider: completion.provider, message: stored }, 200);
});

