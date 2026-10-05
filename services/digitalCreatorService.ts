/**
 * Digital Creator API (Phase 15.5B).
 *
 * Configuration goes through definer RPCs (creator-only, consent-gated).
 * Sessions and rendering go through the `digital-creator` Edge Function, which
 * is the only place a rendering provider is called — the app never holds a
 * provider key, never names a vendor in a request and never supplies the text
 * that gets rendered.
 *
 * TEXT mode deliberately has no function call: it is the existing Creator AI.
 */

import { getPublicMediaUrl } from './mediaService';
import { requireSupabase, requestError } from './supabaseClient';
import {
  parseDigitalCreatorConfig,
  parseDigitalCreatorRender,
  parseDigitalCreatorSession,
  parseDigitalCreatorStatus,
  type DigitalCreatorCapability,
  type DigitalCreatorConfig,
  type DigitalCreatorMedia,
  type DigitalCreatorRender,
  type DigitalCreatorSession,
  type DigitalCreatorSessionMode,
  type DigitalCreatorStatus,
  type SaveDigitalCreatorInput,
} from './digitalCreatorMappers';

export function digitalCreatorArtworkUrl(
  media: DigitalCreatorMedia | null | undefined,
): string | null {
  if (!media) return null;
  try {
    return getPublicMediaUrl(media.bucket, media.path);
  } catch {
    return null;
  }
}

/**
 * Cheap capability probe: no model call, no session, no database work. Lets the
 * room say "avatar provider not connected" before anyone enters TALK mode.
 */
export async function fetchDigitalCreatorStatus(): Promise<DigitalCreatorStatus> {
  const { data, error } = await requireSupabase().functions.invoke('digital-creator', {
    body: { action: 'status' },
  });
  if (error) return { provider: 'unknown', configured: false, modes: [], text: true };
  return parseDigitalCreatorStatus(data);
}

/**
 * Open a rendering session. Postgres decides whether this viewer may (access,
 * entitlement, blocks, consent, enabled capability, rate limit).
 */
export async function startDigitalCreatorSession(
  creatorId: string,
  mode: DigitalCreatorSessionMode,
): Promise<DigitalCreatorSession | null> {
  const { data, error } = await requireSupabase().functions.invoke('digital-creator', {
    body: { action: 'start', creatorId, mode },
  });
  if (error) return null;
  return parseDigitalCreatorSession(data);
}

/**
 * Render one reply our own pipeline already produced. The client sends a message
 * id, never text: this endpoint cannot be used to speak arbitrary words.
 */
export async function renderDigitalCreatorReply(
  sessionId: string,
  messageId: string,
): Promise<DigitalCreatorRender> {
  const { data, error } = await requireSupabase().functions.invoke('digital-creator', {
    body: { action: 'speak', sessionId, messageId },
  });
  if (error) return { status: 'error', error: 'render_failed' };
  return parseDigitalCreatorRender(data);
}

/** Terminate the session (leaving the room, backgrounding, or timeout). */
export async function endDigitalCreatorSession(sessionId: string): Promise<void> {
  const { error } = await requireSupabase().functions.invoke('digital-creator', {
    body: { action: 'end', sessionId },
  });
  if (error) return;
}

/** Connect, configure or switch off the creator's own digital version. */
export async function saveCreatorDigitalVersion(
  input: SaveDigitalCreatorInput,
): Promise<DigitalCreatorConfig> {
  const { data, error } = await requireSupabase().rpc('set_creator_digital_version', {
    p_provider: input.provider,
    p_avatar_external_id: input.avatarExternalId ?? undefined,
    p_voice_external_id: input.voiceExternalId ?? undefined,
    p_display_name: input.displayName ?? undefined,
    p_avatar_media_object_id: input.avatarMediaObjectId ?? undefined,
    p_avatar_enabled: input.avatarEnabled,
    p_voice_enabled: input.voiceEnabled,
    p_text_fallback_enabled: input.textFallbackEnabled,
    p_confirm_likeness_consent: input.confirmLikenessConsent,
  });
  if (error) throw requestError(error);
  return parseDigitalCreatorConfig((data as { digital?: unknown } | null)?.digital ?? null);
}

/** Disconnect: text AI keeps working, avatar sessions stop immediately. */
export async function disconnectCreatorDigitalVersion(): Promise<DigitalCreatorConfig> {
  const { data, error } = await requireSupabase().rpc('disconnect_creator_digital_version');
  if (error) throw requestError(error);
  return parseDigitalCreatorConfig((data as { digital?: unknown } | null)?.digital ?? null);
}

/** The caller's own session handle, for expiry checks. Never anyone else's. */
export async function fetchDigitalCreatorSessionCard(
  sessionId: string,
): Promise<DigitalCreatorSession | null> {
  const { data, error } = await requireSupabase().rpc('digital_creator_session_card', {
    p_session_id: sessionId,
  });
  if (error) return null;
  return parseDigitalCreatorSession(data);
}

export function digitalCapabilityOf(
  config: DigitalCreatorConfig,
): DigitalCreatorCapability {
  if (!config.connected || config.consentAt === null) return 'TEXT';
  if (config.avatarEnabled) return 'AVATAR';
  if (config.voiceEnabled) return 'VOICE';
  return 'TEXT';
}
