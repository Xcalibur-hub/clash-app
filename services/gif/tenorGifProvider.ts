/** Tenor-backed GIF provider via the authenticated server-secret proxy. */
import {
  fetchFeaturedGifs,
  isGifSearchConfigured,
  searchGifs,
  type TenorGif,
} from '../tenorService';
import type { GifPage, GifProvider, NormalizedGifMedia } from './GifProvider';

function mapGif(g: TenorGif): NormalizedGifMedia {
  return {
    id: g.id,
    provider: 'tenor',
    previewUrl: g.previewUrl,
    url: g.url,
    width: g.width,
    height: g.height,
    description: g.description,
  };
}

export const tenorGifProvider: GifProvider = {
  id: 'tenor',
  isConfigured: isGifSearchConfigured,
  async trending(pos?: string): Promise<GifPage> {
    const page = await fetchFeaturedGifs(pos);
    return { results: page.results.map(mapGif), next: page.next };
  },
  async search(query: string, pos?: string): Promise<GifPage> {
    const page = await searchGifs(query, pos);
    return { results: page.results.map(mapGif), next: page.next };
  },
  async stickers(pos?: string): Promise<GifPage> {
    const page = await searchGifs('sticker reaction', pos);
    return { results: page.results.map(mapGif), next: page.next };
  },
};
