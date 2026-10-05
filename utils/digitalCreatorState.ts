/**
 * Pure presentation + capability rules for the Digital Creator layer (15.5B).
 *
 * No React, no network: everything here is a function of its arguments so the
 * room's honesty rules (graceful capability fallback, permanent disclosure,
 * session lifetime, voice-input availability) are unit testable.
 *
 * The rules encoded below are product rules, not styling:
 *   · A capability never silently upgrades. AVATAR → VOICE → TEXT is the only
 *     direction, and text always remains reachable.
 *   · A digital version is always labelled as a digital version.
 *   · Nothing here ever claims rendered media exists when it does not.
 */

import type {
  DigitalCreatorBlock,
  DigitalCreatorCapability,
  DigitalCreatorConfig,
  DigitalCreatorSession,
  DigitalCreatorStatus,
} from '../services/digitalCreatorMappers';

export type DigitalRoomMode = 'TEXT' | 'TALK';

/** Hold-to-talk bounds: short taps are noise, long holds are accidental. */
export const HOLD_TO_TALK_MIN_MS = 400;
export const HOLD_TO_TALK_MAX_MS = 30_000;

/** A rendering session is short-lived even if the viewer never leaves. */
export const DIGITAL_SESSION_GRACE_MS = 30_000;

export type HoldToTalkPhase = 'idle' | 'listening' | 'too_short' | 'ready';

export function digitalRoomModeLabel(mode: DigitalRoomMode): string {
  return mode === 'TALK' ? 'TALK' : 'TEXT';
}

/** Which room modes a viewer may pick, given what the creator connected. */
export function availableDigitalModes(
  block: DigitalCreatorBlock | null,
  status: DigitalCreatorStatus | null,
): DigitalRoomMode[] {
  if (!block || !block.available) return ['TEXT'];
  const providerReady = status ? status.configured : false;
  if (!providerReady) return ['TEXT'];
  return block.avatarEnabled || block.voiceEnabled ? ['TALK', 'TEXT'] : ['TEXT'];
}

/**
 * Resolve a requested capability against what actually exists right now.
 * Degrades one step at a time and always reports whether it had to.
 */
export function resolveDigitalCapability(
  block: DigitalCreatorBlock | null,
  requested: DigitalCreatorCapability,
  status: DigitalCreatorStatus | null,
): { capability: DigitalCreatorCapability; degraded: boolean } {
  const usable = block !== null && block.available && (status?.configured ?? false);
  // "Degraded" means a capability was advertised and could not be honoured, so
  // the room is visibly falling back rather than silently changing shape.
  if (!usable || requested === 'TEXT') {
    return {
      capability: 'TEXT',
      degraded: requested !== 'TEXT' && block !== null && block.available,
    };
  }
  if (requested === 'AVATAR') {
    if (block.avatarEnabled) return { capability: 'AVATAR', degraded: false };
    if (block.voiceEnabled) return { capability: 'VOICE', degraded: true };
    return { capability: 'TEXT', degraded: true };
  }
  if (block.voiceEnabled) return { capability: 'VOICE', degraded: false };
  return { capability: 'TEXT', degraded: true };
}

/** The permanent plate. Never "Maya is talking to you". */
export function digitalDisclosurePlate(
  digitalName: string | null,
  creatorName: string | null,
): string {
  const subject = (digitalName ?? creatorName ?? 'this creator').toUpperCase();
  return `DIGITAL VERSION OF ${subject}`;
}

/** Plain-language disclosure for the first entry into a digital room. */
export function digitalDisclosureNote(creatorName: string | null): string {
  const who = creatorName ?? 'this creator';
  return `This is an AI representation built from ${who}'s approved material. It is not ${who}.`;
}

export function digitalUnavailableNote(reason: 'not_configured' | 'provider_error' | null): string {
  if (reason === 'provider_error') {
    return 'The digital version could not be reached. Text AI still works.';
  }
  return 'Avatar provider not connected. Text AI remains available.';
}

export interface DigitalStageCopy {
  kicker: string;
  headline: string;
  note: string;
  mode: DigitalCreatorCapability;
  degraded: boolean;
}

/**
 * The stage's copy for a given entry. `note` is always present: an immersive
 * stage must still say what it is.
 */
export function digitalStageCopy(input: {
  displayName: string;
  creatorName: string | null;
  block: DigitalCreatorBlock | null;
  status: DigitalCreatorStatus | null;
  requested: DigitalCreatorCapability;
}): DigitalStageCopy {
  const { capability, degraded } = resolveDigitalCapability(
    input.block,
    input.requested,
    input.status,
  );
  const plate = digitalDisclosurePlate(input.displayName, input.creatorName);
  const note = degraded
    ? digitalUnavailableNote('not_configured')
    : capability === 'TEXT'
      ? digitalDisclosureNote(input.creatorName)
      : plate;
  return {
    kicker: plate,
    headline: input.displayName,
    note,
    mode: capability,
    degraded,
  };
}

/** Hold-to-talk progression, including the too-quick-release case. */
export function holdToTalkPhase(
  heldMs: number,
  released: boolean,
  available: boolean,
): HoldToTalkPhase {
  if (!available) return 'idle';
  if (!released) return 'listening';
  return heldMs >= HOLD_TO_TALK_MIN_MS ? 'ready' : 'too_short';
}

/** Hold-to-talk fails closed: no recorder means no fake capture. */
export function voiceInputNote(recorderAvailable: boolean, transcriberReady: boolean): string {
  if (!recorderAvailable) return 'Voice input is not available in this build. Text still works.';
  if (!transcriberReady) return 'Voice input needs a speech service. Text still works.';
  return 'Hold to talk. Audio is transcribed on the way in and never stored.';
}

export function isDigitalSessionCurrent(
  session: DigitalCreatorSession | null,
  now: number,
): boolean {
  if (!session) return false;
  if (session.mode === 'TEXT') return true;
  if (!session.active || session.expiresAt === null) return false;
  return session.expiresAt - DIGITAL_SESSION_GRACE_MS > now;
}

export function digitalCapabilityRows(
  config: DigitalCreatorConfig,
): { key: 'avatar' | 'voice' | 'text'; label: string; on: boolean }[] {
  return [
    { key: 'avatar', label: 'Avatar', on: config.avatarEnabled },
    { key: 'voice', label: 'Voice', on: config.voiceEnabled },
    { key: 'text', label: 'Text fallback', on: config.textFallbackEnabled },
  ];
}

/** Studio wording for the rights confirmation — exact, not implied. */
export function likenessConsentCopy(): string {
  return 'I own this likeness and voice, or I have permission to use them. CLASH does not train or clone them.';
}

/** Provider slugs are lowercase identifiers; the server maps them to adapters. */
export function sanitizeProviderSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** External references are identifiers at the provider, not free text. */
export function sanitizeModelReference(input: string): string {
  return input
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, '')
    .slice(0, 120);
}

