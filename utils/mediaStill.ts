/**
 * Resolve a still image URL for feed/preview surfaces.
 * Never returns a video file URL — videos must use an explicit poster.
 */
import type { TakeMedia } from '../store/types';

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv)(\?|#|$)/i;

/** True when a URL looks like a playable video asset, not a still. */
export function looksLikeVideoUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return VIDEO_EXT.test(url);
}

/**
 * Image/poster URL safe for <Image>.
 * - image → media.url (if not a video-looking URL)
 * - video → media.posterUrl only
 * - missing poster → undefined (caller renders gradient fallback)
 */
export function resolveStillUrl(media: TakeMedia | undefined | null): string | undefined {
  if (!media) return undefined;
  if (media.kind === 'video') {
    const poster = media.posterUrl?.trim();
    if (!poster || looksLikeVideoUrl(poster)) return undefined;
    return poster;
  }
  const url = media.url?.trim();
  if (!url || looksLikeVideoUrl(url)) return undefined;
  return url;
}
