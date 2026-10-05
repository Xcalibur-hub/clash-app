/**
 * Creator AI API (Phase 15.5).
 *
 * Reads and configuration go through definer RPCs. One turn goes through the
 * `creator-ai` Edge Function, which is the only place a provider is called —
 * the app never holds a provider key and never writes an assistant message.
 */

import { getPublicMediaUrl } from './mediaService';
import { requireSupabase, requestError, SupabaseError } from './supabaseClient';
import {
  parseCreatorAiConfig,
  parseCreatorAiConversationRef,
  parseCreatorAiMessageList,
  parseCreatorAiProfile,
  parseCreatorAiTurn,
  type AddCreatorAiKnowledgeInput,
  type CreatorAiConfig,
  type CreatorAiConversationRef,
  type CreatorAiMedia,
  type CreatorAiMessage,
  type CreatorAiProfile,
  type CreatorAiTurn,
  type SaveCreatorAiInput,
} from './creatorAiMappers';

export function creatorAiArtworkUrl(media: CreatorAiMedia | null | undefined): string | null {
  if (!media) return null;
  try {
    return getPublicMediaUrl(media.bucket, media.path);
  } catch {
    return null;
  }
}

export async function fetchCreatorAi(creatorId: string): Promise<CreatorAiProfile | null> {
  const { data, error } = await requireSupabase().rpc('get_creator_ai', { p_creator_id: creatorId });
  if (error) throw requestError(error);
  if (data === null) return null;
  return parseCreatorAiProfile(data);
}

export async function fetchMyCreatorAi(): Promise<CreatorAiConfig | null> {
  const { data, error } = await requireSupabase().rpc('get_my_creator_ai');
  if (error) throw requestError(error);
  if (data === null) return null;
  return parseCreatorAiConfig(data);
}

export async function saveCreatorAiProfile(input: SaveCreatorAiInput): Promise<CreatorAiConfig | null> {
  const { data, error } = await requireSupabase().rpc('upsert_creator_ai_profile', {
    p_display_name: input.displayName,
    p_description: input.description,
    p_welcome_message: input.welcomeMessage,
    p_instructions: input.instructions,
    p_access: input.access,
    p_starters: input.starters,
    p_enabled: input.enabled,
    p_artwork_media_object_id: input.artworkMediaObjectId ?? undefined,
  });
  if (error) throw requestError(error);
  return parseCreatorAiConfig(data);
}

export async function addCreatorAiKnowledge(input: AddCreatorAiKnowledgeInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('add_creator_ai_knowledge', {
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body ?? undefined,
    p_source_id: input.sourceId ?? undefined,
    p_access: input.access ?? 'FREE',
  });
  if (error) throw requestError(error);
  if (typeof data !== 'string') throw new SupabaseError('knowledge was not created', 'bad_payload');
  return data;
}

export async function removeCreatorAiKnowledge(knowledgeId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('remove_creator_ai_knowledge', {
    p_knowledge_id: knowledgeId,
  });
  if (error) throw requestError(error);
  return data === true;
}

export async function startCreatorAiConversation(
  creatorId: string,
): Promise<CreatorAiConversationRef> {
  const { data, error } = await requireSupabase().rpc('start_creator_ai_conversation', {
    p_creator_id: creatorId,
  });
  if (error) throw requestError(error);
  const ref = parseCreatorAiConversationRef(data);
  if (!ref) throw new SupabaseError('the AI room could not be opened', 'bad_payload');
  return ref;
}

/** One page of history, newest first. Bounded by the server, never unbounded. */
export async function fetchCreatorAiMessages(
  conversationId: string,
  before?: number | null,
  limit = 30,
): Promise<CreatorAiMessage[]> {
  const { data, error } = await requireSupabase().rpc('list_creator_ai_messages', {
    p_conversation_id: conversationId,
    p_before: before != null ? new Date(before).toISOString() : undefined,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return parseCreatorAiMessageList(data);
}

/**
 * Send one message. Goes through the Edge Function: Postgres validates access,
 * entitlement and rate limits as the caller, and only the service role may
 * record the reply.
 */
export async function sendCreatorAiTurn(
  conversationId: string,
  message: string,
): Promise<CreatorAiTurn> {
  const { data, error } = await requireSupabase().functions.invoke('creator-ai', {
    body: { conversationId, message },
  });
  if (error) {
    // A non-2xx carries a FunctionsError whose body is not trusted; map it to a
    // small, honest set of outcomes for the UI.
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    if (status === 429) return { status: 'error', error: 'rate_limited' };
    if (status === 403) return { status: 'error', error: 'not_permitted' };
    if (status === 409) return { status: 'error', error: 'ai_disabled' };
    if (status === 404) return { status: 'error', error: 'conversation_missing' };
    if (status === 400) return { status: 'error', error: 'bad_message' };
    if (status === 502) return { status: 'unavailable', reason: 'provider_error' };
    return { status: 'error', error: 'generation_failed' };
  }
  return parseCreatorAiTurn(data);
}

/**
 * Does the server runtime have a provider configured? Cheap probe, no model call
 * and no database work, so the room can be honest before anyone types.
 */
export async function fetchCreatorAiProviderStatus(): Promise<{
  provider: string;
  configured: boolean;
}> {
  const { data, error } = await requireSupabase().functions.invoke('creator-ai', {
    body: { action: 'status' },
  });
  if (error) return { provider: 'unknown', configured: false };
  const record = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  return {
    provider: typeof record?.provider === 'string' ? record.provider : 'unknown',
    configured: record?.configured === true,
  };
}

export async function reportCreatorAiMessage(
  messageId: string,
  reason:
    | 'spam'
    | 'harassment'
    | 'hate'
    | 'sexual'
    | 'violence'
    | 'misinformation'
    | 'impersonation'
    | 'copyright'
    | 'other',
  detail?: string,
): Promise<void> {
  const { error } = await requireSupabase().rpc('report_creator_ai_message', {
    p_message_id: messageId,
    p_reason: reason,
    p_detail: detail ?? undefined,
  });
  if (error) throw requestError(error);
}
