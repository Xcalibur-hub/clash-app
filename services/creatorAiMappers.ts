/**
 * Domain types + parsers for Creator AI (Phase 15.5).
 *
 * `instructions` (creator-authored personality notes) are private server
 * configuration: they deliberately have no place in any client type below.
 */

export type CreatorAiAccess = 'FREE' | 'SUBSCRIBER';
export type CreatorAiKnowledgeKind = 'NOTE' | 'VAULT_DROP' | 'COLLECTION' | 'COURSE';
export type CreatorAiMessageRole = 'user' | 'assistant';

export interface CreatorAiMedia {
  bucket: string;
  path: string;
  kind: string;
}

export interface CreatorAiKnowledge {
  id: string;
  kind: CreatorAiKnowledgeKind;
  title: string;
  body: string | null;
  sourceId: string | null;
  access: CreatorAiAccess;
  createdAt: number | null;
}

export interface CreatorAiProfile {
  creatorId: string;
  creatorName: string | null;
  creatorHandle: string | null;
  creatorTint: string | null;
  /** The AI's own name. Always reads as an AI, never as the human creator. */
  displayName: string;
  description: string;
  welcomeMessage: string;
  access: CreatorAiAccess;
  enabled: boolean;
  starters: string[];
  artwork: CreatorAiMedia | null;
  viewerAccess: boolean;
  canChat: boolean;
  isOwner: boolean;
}

export interface CreatorAiConfig {
  hasProfile: boolean;
  enabled: boolean;
  displayName: string;
  description: string;
  welcomeMessage: string;
  instructions: string;
  access: CreatorAiAccess;
  starters: string[];
  artwork: CreatorAiMedia | null;
  /** The creator's own media id, so re-saving never silently drops the artwork. */
  artworkMediaObjectId: string | null;
  knowledge: CreatorAiKnowledge[];
}

export interface CreatorAiMessage {
  id: string;
  role: CreatorAiMessageRole;
  body: string;
  /** Provenance for assistant rows; null for the viewer's own messages. */
  provider: string | null;
  model: string | null;
  createdAt: number | null;
}

export interface CreatorAiConversationRef {
  conversationId: string;
  profile: CreatorAiProfile | null;
}

export type CreatorAiTurn =
  | { status: 'ok'; provider: string | null; message: CreatorAiMessage | null }
  | { status: 'unconfigured'; provider: string | null }
  | { status: 'unavailable'; reason: string | null }
  | { status: 'error'; error: string };

export interface SaveCreatorAiInput {
  displayName: string;
  description: string;
  welcomeMessage: string;
  instructions: string;
  access: CreatorAiAccess;
  starters: string[];
  enabled: boolean;
  artworkMediaObjectId: string | null;
}

export interface AddCreatorAiKnowledgeInput {
  kind: CreatorAiKnowledgeKind;
  title: string;
  body?: string | null;
  sourceId?: string | null;
  access?: CreatorAiAccess;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function epoch(value: unknown): number | null {
  const text = str(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function bool(value: unknown): boolean {
  return value === true;
}

function access(value: unknown): CreatorAiAccess {
  return value === 'SUBSCRIBER' ? 'SUBSCRIBER' : 'FREE';
}

export function parseCreatorAiMedia(value: unknown): CreatorAiMedia | null {
  const record = asRecord(value);
  if (!record) return null;
  const bucket = str(record.bucket);
  const path = str(record.path);
  if (!bucket || !path) return null;
  return { bucket, path, kind: str(record.kind) ?? 'image' };
}

/** Suggested prompts are display data: bounded, unique, non-empty strings. */
export function parseStarters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim().slice(0, 120);
    if (text.length === 0 || out.includes(text)) continue;
    out.push(text);
    if (out.length === 6) break;
  }
  return out;
}

export function parseCreatorAiProfile(value: unknown): CreatorAiProfile | null {
  const r = asRecord(value);
  if (!r) return null;
  const creatorId = str(r.creatorId);
  const displayName = str(r.displayName);
  if (!creatorId || !displayName) return null;
  return {
    creatorId,
    creatorName: str(r.creatorName),
    creatorHandle: str(r.creatorHandle),
    creatorTint: str(r.creatorTint),
    displayName,
    description: str(r.description) ?? '',
    welcomeMessage: str(r.welcomeMessage) ?? '',
    access: access(r.access),
    enabled: bool(r.enabled),
    starters: parseStarters(r.starters),
    artwork: parseCreatorAiMedia(r.artwork),
    viewerAccess: bool(r.viewerAccess),
    canChat: bool(r.canChat),
    isOwner: bool(r.isOwner),
  };
}

export function parseCreatorAiKnowledge(value: unknown): CreatorAiKnowledge | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const title = str(r.title);
  if (!id || title === null) return null;
  const kind = str(r.kind);
  return {
    id,
    kind:
      kind === 'VAULT_DROP' || kind === 'COLLECTION' || kind === 'COURSE' ? kind : 'NOTE',
    title,
    body: str(r.body),
    sourceId: str(r.sourceId),
    access: access(r.access),
    createdAt: epoch(r.createdAt),
  };
}

export function parseCreatorAiConfig(value: unknown): CreatorAiConfig | null {
  const r = asRecord(value);
  if (!r) return null;
  if (!bool(r.hasProfile)) {
    return {
      hasProfile: false,
      enabled: false,
      displayName: '',
      description: '',
      welcomeMessage: '',
      instructions: '',
      access: 'FREE',
      starters: [],
      artwork: null,
      artworkMediaObjectId: null,
      knowledge: [],
    };
  }
  const knowledge = Array.isArray(r.knowledge)
    ? r.knowledge
        .map((entry) => parseCreatorAiKnowledge(entry))
        .filter((entry): entry is CreatorAiKnowledge => entry !== null)
    : [];
  return {
    hasProfile: true,
    enabled: bool(r.enabled),
    displayName: str(r.displayName) ?? '',
    description: str(r.description) ?? '',
    welcomeMessage: str(r.welcomeMessage) ?? '',
    instructions: str(r.instructions) ?? '',
    access: access(r.access),
    starters: parseStarters(r.starters),
    artwork: parseCreatorAiMedia(r.artwork),
    artworkMediaObjectId: str(r.artworkMediaObjectId),
    knowledge,
  };
}

export function parseCreatorAiMessage(value: unknown): CreatorAiMessage | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const body = typeof r.body === 'string' ? r.body : null;
  if (!id || body === null) return null;
  return {
    id,
    role: r.role === 'assistant' ? 'assistant' : 'user',
    body,
    provider: str(r.provider),
    model: str(r.model),
    createdAt: epoch(r.createdAt),
  };
}

export function parseCreatorAiMessageList(value: unknown): CreatorAiMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseCreatorAiMessage(entry))
    .filter((entry): entry is CreatorAiMessage => entry !== null);
}

export function parseCreatorAiConversationRef(value: unknown): CreatorAiConversationRef | null {
  const r = asRecord(value);
  if (!r) return null;
  const conversationId = str(r.conversationId);
  if (!conversationId) return null;
  return { conversationId, profile: parseCreatorAiProfile(r.profile) };
}

export function parseCreatorAiTurn(value: unknown): CreatorAiTurn {
  const r = asRecord(value);
  if (!r) return { status: 'error', error: 'bad_payload' };
  if (r.status === 'ok') {
    return { status: 'ok', provider: str(r.provider), message: parseCreatorAiMessage(r.message) };
  }
  if (r.status === 'unconfigured') {
    return { status: 'unconfigured', provider: str(r.provider) };
  }
  if (r.status === 'unavailable') {
    return { status: 'unavailable', reason: str(r.reason) };
  }
  return { status: 'error', error: str(r.error) ?? 'unknown' };
}
