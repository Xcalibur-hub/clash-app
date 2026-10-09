/**
 * Authenticated Tenor proxy; provider credentials stay in the Edge runtime.
 * Docs: https://developers.google.com/tenor/guides/quickstart
 *
 * Never logs search query text. Validates CDN hosts before returning results
 * so the composer cannot attach arbitrary remote URLs.
 */

import {currentUserId,requireSupabase} from './supabaseClient';

export interface TenorGif {
  id: string;
  provider: 'tenor';
  /** Mobile-optimized animated preview (tinygif preferred). */
  previewUrl: string;
  /** Slightly larger share URL when available; falls back to preview. */
  url: string;
  width: number;
  height: number;
  description: string;
}

export type GifSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; results: TenorGif[]; next: string | null }
  | { status: 'empty' }
  | { status: 'error'; message: string };



export function isGifSearchConfigured(): boolean {
  return process.env.EXPO_PUBLIC_ARENA_GIFS_ENABLED === 'true';
}

/** Server + client agree: https Tenor CDN hosts only. */
export {isAllowedTenorUrl} from '../utils/tenorUrl';
import {isAllowedTenorUrl} from '../utils/tenorUrl';

interface TenorMediaFormat {
  url?: string;
  dims?: number[];
}

interface TenorResult {
  id?: string;
  content_description?: string;
  media_formats?: {
    tinygif?: TenorMediaFormat;
    nanogif?: TenorMediaFormat;
    gif?: TenorMediaFormat;
  };
}

function toGif(row: TenorResult): TenorGif | null {
  if (!row.id || typeof row.id !== 'string') return null;
  if (!/^[A-Za-z0-9_-]+$/.test(row.id) || row.id.length > 64) return null;
  const formats = row.media_formats;
  const tiny = formats?.tinygif;
  const nano = formats?.nanogif;
  const full = formats?.gif;
  const preview = tiny?.url || nano?.url || full?.url;
  if (!preview || !isAllowedTenorUrl(preview)) return null;
  const share = full?.url && isAllowedTenorUrl(full.url) ? full.url : preview;
  const dims = tiny?.dims || nano?.dims || full?.dims || [220, 220];
  const width = Number(dims[0]) || 220;
  const height = Number(dims[1]) || 220;
  return {
    id: row.id,
    provider: 'tenor',
    previewUrl: preview,
    url: share,
    width,
    height,
    description: typeof row.content_description === 'string' ? row.content_description : '',
  };
}

async function tenorGet(
  path: string,
  params: Record<string, string>,
): Promise<{ results: TenorGif[]; next: string | null }> {
  if(!isGifSearchConfigured())throw new Error('GIF search is not enabled.');
  const account=await currentUserId();if(!account)throw new Error('Sign in to search GIFs.');
  const {data:payload,error}=await requireSupabase().functions.invoke('arena-gifs',{
    body:{path,query:params.q??'',pos:params.pos??''},timeout:12000,
  });
  if(await currentUserId()!==account)throw new Error('Account changed. Reopen GIF search.');
  if(error||!payload||!Array.isArray(payload.results))throw new Error('GIF search is unavailable. Check your connection and retry.');
  const results = (payload.results ?? [])
    .map(toGif)
    .filter((g: TenorGif | null): g is TenorGif => g !== null);
  const next = typeof payload.next === 'string' && payload.next.length > 0 ? payload.next : null;
  return { results, next };
}

/** Featured / trending stream when the search box is empty. */
export async function fetchFeaturedGifs(pos?: string): Promise<{ results: TenorGif[]; next: string | null }> {
  return tenorGet('featured', pos ? { pos } : {});
}

/** Search GIFs. Query is never logged by callers. */
export async function searchGifs(
  query: string,
  pos?: string,
): Promise<{ results: TenorGif[]; next: string | null }> {
  const q = query.trim();
  if (!q) return fetchFeaturedGifs(pos);
  return tenorGet('search', { q: q.slice(0, 64), ...(pos ? { pos } : {}) });
}
