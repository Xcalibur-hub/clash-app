/**
 * Provider-agnostic GIF / sticker search surface.
 * Swap implementations (Tenor today, others later) without touching UI.
 */

export type GifProviderId = 'tenor';

/** Normalized animated media from any provider. */
export interface NormalizedGifMedia {
  id: string;
  provider: GifProviderId;
  /** Mobile-friendly animated preview URL (HTTPS, allowlisted by server when sent). */
  previewUrl: string;
  /** Share / full URL when available. */
  url: string;
  width: number;
  height: number;
  description: string;
}

export interface GifPage {
  results: NormalizedGifMedia[];
  next: string | null;
}

export interface GifProvider {
  readonly id: GifProviderId;
  /** Provider configured (API key / proxy reachable). */
  isConfigured(): boolean;
  trending(pos?: string): Promise<GifPage>;
  search(query: string, pos?: string): Promise<GifPage>;
  /** Optional sticker-biased search (Tenor uses search terms). */
  stickers(pos?: string): Promise<GifPage>;
}
