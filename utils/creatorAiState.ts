/**
 * Pure state + disclosure helpers for Creator AI (Phase 15.5).
 *
 * Two jobs only: make the AI's identity unmistakable, and keep the conversation
 * view bounded and cheap. Authority lives in Postgres and the Edge Function.
 */

import type { CreatorAiMessage } from '../services/creatorAiMappers';

export const AI_MAX_DRAFT = 1000;
export const AI_HISTORY_PAGE = 30;
/** Defensive display clamp; the server already bounds replies at 4000. */
export const AI_MAX_REPLY_CHARS = 4000;

export type AiNotice =
  | { kind: 'unconfigured'; title: string; body: string }
  | { kind: 'unavailable'; title: string; body: string };

function firstName(name: string | null | undefined): string {
  const text = (name ?? '').trim();
  return text.length > 0 ? text.split(' ')[0]!.toUpperCase() : 'THIS CREATOR';
}

/** The mandatory badge over every AI surface. */
export function aiDisclosureLabel(creatorName: string | null | undefined): string {
  return `AI VERSION OF ${firstName(creatorName)}`;
}

/** The sentence that must accompany the badge. */
export function aiDisclosureDetail(input: {
  displayName: string;
  creatorName: string | null | undefined;
}): string {
  const who = (input.creatorName ?? 'the creator').trim() || 'the creator';
  return `${input.displayName} is an AI built from ${who}'s approved material. It is not ${who}.`;
}

/** Chapter copy for the Creator World. */
export function aiChapterCopy(input: {
  displayName: string;
  creatorName: string | null | undefined;
}): { kicker: string; headline: string } {
  return {
    kicker: 'AI VERSION',
    headline: `TALK TO ${firstName(input.creatorName)}`,
  };
}

/**
 * Provenance line for an assistant message. Returns null for the viewer's own
 * words so an AI reply is always visually distinct from a person.
 */
export function aiMessageProvenance(message: CreatorAiMessage): string | null {
  if (message.role !== 'assistant') return null;
  const provider = (message.provider ?? '').trim();
  return provider.length > 0 ? `AI · ${provider}` : 'AI';
}

/** Honest provider state copy. Nothing here pretends a model answered. */
export function aiProviderNotice(state: {
  providerReady: boolean;
  externalError: boolean;
}): AiNotice | null {
  if (!state.providerReady) {
    return {
      kind: 'unconfigured',
      title: 'AI provider not configured',
      body: 'The AI room is wired up, but no model provider is connected yet, so no answers are generated.',
    };
  }
  if (state.externalError) {
    return {
      kind: 'unavailable',
      title: 'AI is temporarily unavailable',
      body: 'The provider did not answer just now. Your message was kept — try again in a moment.',
    };
  }
  return null;
}

export function sanitizeAiDraft(text: string, max = AI_MAX_DRAFT): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

/** Why the composer is closed, or null when the viewer may send. */
export function aiSendBlockReason(input: {
  canChat: boolean;
  viewerAccess: boolean;
  enabled: boolean;
  isOwner: boolean;
  providerReady: boolean;
  draft: string;
  sending: boolean;
}): string | null {
  if (input.isOwner) return 'This is your own AI. Open Studio to preview it.';
  if (!input.enabled) return 'This creator has switched their AI off.';
  if (!input.viewerAccess) return 'This AI is for subscribers.';
  if (!input.canChat) return 'Sign in to talk.';
  if (!input.providerReady) return 'AI provider not configured';
  if (input.sending) return 'Thinking…';
  if (sanitizeAiDraft(input.draft).trim().length === 0) return null;
  return null;
}

export function canSendAiMessage(input: {
  canChat: boolean;
  viewerAccess: boolean;
  enabled: boolean;
  isOwner: boolean;
  providerReady: boolean;
  draft: string;
  sending: boolean;
}): boolean {
  if (input.isOwner || !input.enabled || !input.viewerAccess || !input.canChat) return false;
  if (!input.providerReady || input.sending) return false;
  return sanitizeAiDraft(input.draft).trim().length > 0;
}

function sortByCreatedAt<T extends { createdAt: number | null; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = a.createdAt ?? 0;
    const right = b.createdAt ?? 0;
    return left - right || a.id.localeCompare(b.id);
  });
}

/**
 * Merge a page of history with locally echoed messages. One row per id, so an
 * optimistic bubble never doubles, and the result is chronological for display.
 */
export function mergeAiMessages(
  existing: readonly CreatorAiMessage[],
  incoming: readonly CreatorAiMessage[],
): CreatorAiMessage[] {
  const byId = new Map<string, CreatorAiMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return sortByCreatedAt(Array.from(byId.values()));
}

/** Cursor for the next (older) page, or null when nothing older is loaded. */
export function oldestCursor(messages: readonly CreatorAiMessage[]): number | null {
  let oldest: number | null = null;
  for (const message of messages) {
    if (message.createdAt === null) continue;
    if (oldest === null || message.createdAt < oldest) oldest = message.createdAt;
  }
  return oldest;
}

/** A full page means there may be more; anything shorter is the beginning. */
export function hasOlderHistory(loadedCount: number, pageSize = AI_HISTORY_PAGE): boolean {
  return loadedCount >= pageSize;
}

export function clampReply(text: string, max = AI_MAX_REPLY_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
