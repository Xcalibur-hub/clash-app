/**
 * Replaceable livestream media layer (Phase 15.4).
 *
 * CLASH deliberately does not ship a video CDN. A creator session carries an
 * optional https stream URL plus a poster; this resolver is the ONE place that
 * decides how the client presents it, so a production provider (HLS, an
 * embedded player, a future SDK) can be dropped in later without touching
 * interaction state — nothing about polls, choices or crowd actions depends on
 * the video provider.
 *
 * Honesty rule: a session without a provider URL renders a poster labelled as a
 * standby feed. We never dress a still up as video.
 */

import type { LiveStatus } from './creatorLiveState';

export type LiveProvider = 'standby' | 'hls' | 'file' | 'embed';
export type LiveSourceKind = 'hls' | 'file' | 'embed' | 'standby' | 'poster';

export interface LiveVideoSource {
  kind: LiveSourceKind;
  /** Playable URL for a real provider; null when nothing is attached yet. */
  url: string | null;
  posterUrl: string | null;
  /** Honest caption for standby / offline states (null when truly playable). */
  note: string | null;
  /** True only for a real, playable stream. */
  playable: boolean;
}

const PROVIDERS: readonly string[] = ['standby', 'hls', 'file', 'embed'];

export function resolveLiveVideoSource(input: {
  provider: string | null | undefined;
  streamUrl: string | null | undefined;
  posterUrl: string | null | undefined;
  status: LiveStatus;
}): LiveVideoSource {
  const posterUrl = input.posterUrl ?? null;
  const provider = typeof input.provider === 'string' && PROVIDERS.includes(input.provider)
    ? (input.provider as LiveProvider)
    : 'standby';
  const url = typeof input.streamUrl === 'string' && input.streamUrl.startsWith('https://')
    ? input.streamUrl
    : null;

  if (input.status !== 'LIVE') {
    return {
      kind: 'poster',
      url: null,
      posterUrl,
      note: input.status === 'SCHEDULED' ? 'Starts soon' : 'Offline',
      playable: false,
    };
  }

  if (provider !== 'standby' && url !== null) {
    return { kind: provider, url, posterUrl, note: null, playable: true };
  }

  return {
    kind: 'standby',
    url: null,
    posterUrl,
    note: 'Standby feed · poster only',
    playable: false,
  };
}

/** True when the app can hand this source straight to expo-video. */
export function isNativePlayable(source: LiveVideoSource): boolean {
  return source.playable && (source.kind === 'hls' || source.kind === 'file');
}
