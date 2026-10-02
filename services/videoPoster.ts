/**
 * Generate a single still frame from a local video URI for use as a poster.
 * Never called during render — only during / immediately after media pick/upload.
 */
import * as VideoThumbnails from 'expo-video-thumbnails';

/** Representative frame window: ~0.5–1.5s into the clip. */
function posterTimeMs(durationMs: number | null | undefined): number {
  if (durationMs == null || durationMs <= 0) return 1000;
  const preferred = Math.min(1500, Math.max(500, Math.floor(durationMs * 0.12)));
  return Math.min(preferred, Math.max(0, durationMs - 80));
}

/**
 * Returns a local image URI suitable for upload, or null if generation fails.
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
    if (!result?.uri) return null;
    return result.uri;
  } catch {
    return null;
  }
}
