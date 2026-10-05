/**
 * Domain types + parsers for the Digital Creator layer (Phase 15.5B).
 *
 * Three distinct shapes, deliberately:
 *   · `DigitalCreatorBlock`  — viewer-safe capability. No provider slug, no
 *     external model/voice reference: a fan only ever learns what exists.
 *   · `DigitalCreatorConfig` — the creator's own connection, shown in Studio.
 *   · `DigitalCreatorSession`— a short-lived rendering handle, no credentials.
 *
 * There is no type here for a provider key or secret, because none may ever
 * reach a client. Rendering happens server-side behind `digital-creator`.
 */

export type DigitalCreatorCapability = 'TEXT' | 'VOICE' | 'AVATAR';
export type DigitalCreatorSessionMode = 'VOICE' | 'AVATAR';

export interface DigitalCreatorMedia {
  bucket: string;
  path: string;
  kind: string;
}

/** What a viewer may know about a creator's digital version. */
export interface DigitalCreatorBlock {
  configured: boolean;
  available: boolean;
  displayName: string;
  avatarEnabled: boolean;
  voiceEnabled: boolean;
  textFallback: boolean;
  preferredMode: DigitalCreatorCapability;
  artwork: DigitalCreatorMedia | null;
}

/** The creator's own provider connection, as shown in Creator Studio. */
export interface DigitalCreatorConfig {
  provider: string;
  avatarExternalId: string | null;
  voiceExternalId: string | null;
  displayName: string | null;
  avatarEnabled: boolean;
  voiceEnabled: boolean;
  textFallbackEnabled: boolean;
  consentAt: number | null;
  consentVersion: string | null;
  connected: boolean;
  artwork: DigitalCreatorMedia | null;
  artworkMediaObjectId: string | null;
}

export interface DigitalCreatorSession {
  sessionId: string | null;
  mode: DigitalCreatorCapability;
  active: boolean;
  expiresAt: number | null;
  textFallback: boolean;
}

export type DigitalCreatorRender =
  | { status: 'ok'; mode: DigitalCreatorSessionMode; audioUrl: string | null; videoUrl: string | null }
  | { status: 'unconfigured'; provider: string | null; mode: DigitalCreatorSessionMode }
  | { status: 'unavailable'; reason: string | null; mode: DigitalCreatorSessionMode }
  | { status: 'error'; error: string };

export interface DigitalCreatorStatus {
  provider: string;
  configured: boolean;
  modes: DigitalCreatorSessionMode[];
  text: boolean;
}

export interface SaveDigitalCreatorInput {
  provider: string;
  avatarExternalId?: string | null;
  voiceExternalId?: string | null;
  displayName?: string | null;
  avatarMediaObjectId?: string | null;
  avatarEnabled: boolean;
  voiceEnabled: boolean;
  textFallbackEnabled: boolean;
  confirmLikenessConsent: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function epoch(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseDigitalCreatorMedia(value: unknown): DigitalCreatorMedia | null {
  const r = asRecord(value);
  if (!r) return null;
  const bucket = str(r.bucket);
  const path = str(r.path);
  if (!bucket || !path) return null;
  return { bucket, path, kind: str(r.kind) ?? 'image' };
}

function capability(value: unknown): DigitalCreatorCapability {
  return value === 'AVATAR' || value === 'VOICE' ? value : 'TEXT';
}

export function parseDigitalCreatorBlock(value: unknown): DigitalCreatorBlock | null {
  const r = asRecord(value);
  if (!r || !bool(r.configured)) return null;
  return {
    configured: true,
    available: bool(r.available),
    displayName: str(r.displayName) ?? 'Digital version',
    avatarEnabled: bool(r.avatarEnabled),
    voiceEnabled: bool(r.voiceEnabled),
    textFallback: bool(r.textFallback),
    preferredMode: capability(r.preferredMode),
    artwork: parseDigitalCreatorMedia(r.artwork),
  };
}

export function parseDigitalCreatorConfig(value: unknown): DigitalCreatorConfig {
  const r = asRecord(value);
  const empty: DigitalCreatorConfig = {
    provider: 'none',
    avatarExternalId: null,
    voiceExternalId: null,
    displayName: null,
    avatarEnabled: false,
    voiceEnabled: false,
    textFallbackEnabled: true,
    consentAt: null,
    consentVersion: null,
    connected: false,
    artwork: null,
    artworkMediaObjectId: null,
  };
  if (!r) return empty;
  return {
    provider: str(r.provider) ?? 'none',
    avatarExternalId: str(r.avatarExternalId),
    voiceExternalId: str(r.voiceExternalId),
    displayName: str(r.displayName),
    avatarEnabled: bool(r.avatarEnabled),
    voiceEnabled: bool(r.voiceEnabled),
    textFallbackEnabled: r.textFallbackEnabled === false ? false : true,
    consentAt: epoch(r.consentAt),
    consentVersion: str(r.consentVersion),
    connected: bool(r.connected),
    artwork: parseDigitalCreatorMedia(r.artwork),
    artworkMediaObjectId: str(r.artworkMediaObjectId),
  };
}

export function parseDigitalCreatorSession(value: unknown): DigitalCreatorSession | null {
  const r = asRecord(value);
  if (!r) return null;
  const mode = capability(r.mode);
  // TEXT needs no handle: it is the existing Creator AI with no rendering.
  const sessionId = str(r.sessionId);
  if (mode === 'TEXT') {
    return { sessionId: null, mode: 'TEXT', active: r.active !== false, expiresAt: null, textFallback: r.textFallback !== false };
  }
  if (!sessionId) return null;
  return {
    sessionId,
    mode,
    active: r.active !== false,
    expiresAt: epoch(r.expiresAt),
    textFallback: r.textFallback !== false,
  };
}

export function parseDigitalCreatorRender(value: unknown): DigitalCreatorRender {
  const r = asRecord(value);
  if (!r) return { status: 'error', error: 'bad_payload' };
  const mode: DigitalCreatorSessionMode = r.mode === 'AVATAR' ? 'AVATAR' : 'VOICE';
  if (r.status === 'ok') {
    return {
      status: 'ok',
      mode,
      audioUrl: typeof r.audioUrl === 'string' ? r.audioUrl : null,
      videoUrl: typeof r.videoUrl === 'string' ? r.videoUrl : null,
    };
  }
  if (r.status === 'unconfigured') return { status: 'unconfigured', provider: str(r.provider), mode };
  if (r.status === 'unavailable') return { status: 'unavailable', reason: str(r.reason), mode };
  return { status: 'error', error: str(r.error) ?? 'unknown' };
}

export function parseDigitalCreatorStatus(value: unknown): DigitalCreatorStatus {
  const r = asRecord(value);
  const modes = Array.isArray(r?.modes)
    ? r.modes.filter((entry): entry is DigitalCreatorSessionMode => entry === 'AVATAR' || entry === 'VOICE')
    : [];
  return {
    provider: str(r?.provider) ?? 'unknown',
    configured: bool(r?.configured),
    modes,
    text: r?.text !== false,
  };
}

