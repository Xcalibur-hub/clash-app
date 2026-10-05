import type { GifProvider } from './GifProvider';
import { tenorGifProvider } from './tenorGifProvider';

/** Active GIF provider — replace here when adding GIPHY etc. */
export function getGifProvider(): GifProvider {
  return tenorGifProvider;
}

export type { GifPage, GifProvider, GifProviderId, NormalizedGifMedia } from './GifProvider';
