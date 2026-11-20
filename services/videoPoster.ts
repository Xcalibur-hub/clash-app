/**
 * Generate a single still frame from a local video URI for use as a poster.
 * Never called during render — only during / immediately after media pick/upload.
 */
import * as VideoThumbnails from 'expo-video-thumbnails';
import { logger } from './logger';

/** Prefer ~1000ms; clamp earlier for short clips. */
export function posterTimeMs(durationMs: number | null | undefined): number {
  const preferred = 1000;
  if (durationMs == null || durationMs <= 0) return preferred;
  // Leave a tiny pad so we never seek past EOF.
  const maxSafe = Math.max(0, durationMs - 80);
  return Math.min(preferred, maxSafe);
}

/**
 * Returns a local JPEG/image URI suitable for upload, or null if generation fails.
 * Callers must fall back to gradient + VIDEO badge — never put an mp4 in <Image>.
 */
export async function generateVideoPosterUri(
  videoUri: string,
  durationMs?: number | null,
): Promise<string | null> {
  try {
    const result = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: posterTimeMs(durationMs),
      quality: 0.72,
    });
    if (!result?.uri) {
      logger.warn('video poster generation returned empty uri');
      return null;
    }
    return result.uri;
  } catch (error) {
    logger.warn('video poster generation failed', {
      source: 'generateVideoPosterUri',
      message: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}
