/**
 * CLASH-native sticker stamps (curated Tenor IDs — no marketplace yet).
 * Future: creator packs + "turn into reaction" source ids on each record.
 */
import type { NormalizedGifMedia } from '../services/gif/GifProvider';

/** Stable slugs for saved/recent keys when provider is `clash`. */
export interface ClashNativeSticker {
  slug: string;
  label: string;
  /** Tenor-hosted asset so server allowlist stays unchanged today. */
  tenor: Omit<NormalizedGifMedia, 'provider'>;
}

/** Curated set — expand without schema changes. */
export const CLASH_NATIVE_STICKERS: readonly ClashNativeSticker[] = [];

/** Typographic fallback stickers (emoji) — sent via reaction row, not as messages. */
export const CLASH_STAMP_EMOJI: readonly { emoji: string; label: string }[] = [
  { emoji: '💀', label: 'BRO' },
  { emoji: '😂', label: 'DEAD' },
  { emoji: '🤡', label: 'CAP' },
  { emoji: '🔥', label: 'COOKED' },
  { emoji: '🫡', label: 'RESPECT' },
  { emoji: '😭', label: 'WHEEZE' },
];

export function clashStickerAsGif(sticker: ClashNativeSticker): NormalizedGifMedia {
  return { ...sticker.tenor, provider: 'tenor' };
}
