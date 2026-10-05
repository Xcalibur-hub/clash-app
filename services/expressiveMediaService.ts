import { requestError, requireSupabase } from './supabaseClient';

export type SavedExpressiveKind = 'gif' | 'meme' | 'sticker';

export interface SavedExpressiveMedia {
  id: string;
  kind: SavedExpressiveKind;
  provider: string;
  externalId: string;
  previewUrl: string;
  mediaUrl: string;
  mediaObjectId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
}

export interface TrendingClashMeme {
  messageId: string;
  previewUrl: string;
  mediaUrl: string;
  kind: 'gif' | 'image';
  gifProvider: string | null;
  gifExternalId: string | null;
  mediaObjectId: string | null;
  score: number;
}

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

async function arenaRpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await (
    requireSupabase() as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<RpcResult>;
    }
  ).rpc(name, args);
  if (error) throw requestError(error as import('@supabase/supabase-js').PostgrestError);
  return data;
}

function asSaved(row: unknown): SavedExpressiveMedia | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== 'gif' && kind !== 'meme' && kind !== 'sticker') return null;
  if (typeof r.id !== 'string' || typeof r.externalId !== 'string') return null;
  return {
    id: r.id,
    kind,
    provider: String(r.provider ?? ''),
    externalId: r.externalId,
    previewUrl: String(r.previewUrl ?? ''),
    mediaUrl: String(r.mediaUrl ?? ''),
    mediaObjectId: typeof r.mediaObjectId === 'string' ? r.mediaObjectId : null,
    sourceMessageId: typeof r.sourceMessageId === 'string' ? r.sourceMessageId : null,
    createdAt: String(r.createdAt ?? ''),
  };
}

function asTrending(row: unknown): TrendingClashMeme | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.messageId !== 'string') return null;
  const kind = r.kind === 'gif' ? 'gif' : r.kind === 'image' ? 'image' : null;
  if (!kind) return null;
  return {
    messageId: r.messageId,
    previewUrl: String(r.previewUrl ?? ''),
    mediaUrl: String(r.mediaUrl ?? ''),
    kind,
    gifProvider: typeof r.gifProvider === 'string' ? r.gifProvider : null,
    gifExternalId: typeof r.gifExternalId === 'string' ? r.gifExternalId : null,
    mediaObjectId: typeof r.mediaObjectId === 'string' ? r.mediaObjectId : null,
    score: typeof r.score === 'number' ? r.score : Number(r.score) || 0,
  };
}

export async function toggleSavedExpressiveMedia(input: {
  kind: SavedExpressiveKind;
  provider: string;
  externalId: string;
  previewUrl: string;
  mediaUrl: string;
  mediaObjectId?: string | null;
  sourceMessageId?: string | null;
}): Promise<{ saved: boolean; id: string }> {
  const data = await arenaRpc('toggle_arena_saved_expressive_media', {
    p_kind: input.kind,
    p_provider: input.provider,
    p_external_id: input.externalId,
    p_preview_url: input.previewUrl,
    p_media_url: input.mediaUrl,
    ...(input.mediaObjectId ? { p_media_object_id: input.mediaObjectId } : {}),
    ...(input.sourceMessageId ? { p_source_message_id: input.sourceMessageId } : {}),
  });
  const row = data as { saved?: boolean; id?: string } | null;
  return { saved: Boolean(row?.saved), id: String(row?.id ?? '') };
}

export async function listSavedExpressiveMedia(limit = 48): Promise<SavedExpressiveMedia[]> {
  const data = await arenaRpc('list_arena_saved_expressive_media', { p_limit: limit, p_offset: 0 });
  if (!Array.isArray(data)) return [];
  return data.map(asSaved).filter((row): row is SavedExpressiveMedia => row !== null);
}

export async function listTrendingClashMemes(limit = 24): Promise<TrendingClashMeme[]> {
  const data = await arenaRpc('list_trending_clash_memes', { p_limit: limit });
  if (!Array.isArray(data)) return [];
  return data.map(asTrending).filter((row): row is TrendingClashMeme => row !== null);
}
