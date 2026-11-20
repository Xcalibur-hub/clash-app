import type { GifProvider, GifProviderId } from './GifProvider';
import { tenorGifProvider } from './tenorGifProvider';

/** Active GIF provider — replace here when adding GIPHY etc. */
export function getGifProvider(): GifProvider {
  return tenorGifProvider;
}

export interface GifProviderStatus {
  providerId: GifProviderId;
  /** Human label for attribution / empty states. */
  label: string;
  configured: boolean;
  /** Actionable setup hint when not configured. */
  setupHint: string;
}

/** Truthful client status for empty / unconfigured GIF UI. */
export function getGifProviderStatus(): GifProviderStatus {
  const provider = getGifProvider();
  const labels: Record<GifProviderId, string> = {
    tenor: 'Tenor',
  };
  const hints: Record<GifProviderId, string> = {
    tenor: 'GIF search is currently unavailable. You can still attach a photo or video.',
  };
  return {
    providerId: provider.id,
    label: labels[provider.id] ?? provider.id,
    configured: provider.isConfigured(),
    setupHint: hints[provider.id] ?? 'Configure an external GIF provider for this build.',
  };
}

export type { GifPage, GifProvider, GifProviderId, NormalizedGifMedia } from './GifProvider';
