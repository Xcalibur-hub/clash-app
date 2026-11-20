/**
 * CLASH-native typographic sticker pack.
 * Original reaction stamps — no third-party artwork, no Tenor dependency.
 * Future: creator packs + "turn into reaction" can key off `slug`.
 */
import type { ArenaAccentKey } from '../theme/arenaAccents';

export type ClashStickerSlug =
  | 'bro'
  | 'cooked'
  | 'cap'
  | 'w'
  | 'l'
  | 'aint-no-way'
  | 'let-him-cook'
  | 'nah'
  | 'ratio'
  | 'respect'
  | 'dead'
  | 'wheeze';

export interface ClashNativeSticker {
  slug: ClashStickerSlug;
  /** Primary stamp text. */
  label: string;
  /** Optional second line / emoji accent. */
  emoji?: string;
  accent: ArenaAccentKey;
  /** Search tokens (local filter). */
  tags: readonly string[];
}

/** Wire format stored in arena message body — server treats as plain text. */
const TOKEN_PREFIX = '⟦clash:sticker:';
const TOKEN_SUFFIX = '⟧';
const TOKEN_RE = /⟦clash:sticker:([a-z0-9_-]+)⟧/g;

export const CLASH_NATIVE_STICKERS: readonly ClashNativeSticker[] = [
  { slug: 'bro', label: 'BRO', emoji: '💀', accent: 'violet', tags: ['bro', 'skull', 'dead'] },
  { slug: 'cooked', label: 'COOKED', emoji: '🔥', accent: 'coral', tags: ['cooked', 'fire', 'burn'] },
  { slug: 'cap', label: 'CAP', emoji: '🤡', accent: 'amber', tags: ['cap', 'clown', 'lie'] },
  { slug: 'w', label: 'W', accent: 'teal', tags: ['w', 'win', 'dub'] },
  { slug: 'l', label: 'L', accent: 'rose', tags: ['l', 'loss', 'take the l'] },
  {
    slug: 'aint-no-way',
    label: "AIN'T NO WAY",
    accent: 'blue',
    tags: ['aint', 'no way', 'shock'],
  },
  {
    slug: 'let-him-cook',
    label: 'LET HIM COOK',
    emoji: '🔥',
    accent: 'amber',
    tags: ['let him cook', 'cook', 'go'],
  },
  { slug: 'nah', label: 'NAH', accent: 'coral', tags: ['nah', 'nope', 'no'] },
  { slug: 'ratio', label: 'RATIO', accent: 'violet', tags: ['ratio', 'counter'] },
  { slug: 'respect', label: 'RESPECT', emoji: '🫡', accent: 'teal', tags: ['respect', 'salute'] },
  { slug: 'dead', label: 'DEAD', emoji: '😂', accent: 'amber', tags: ['dead', 'lol', 'funny'] },
  { slug: 'wheeze', label: 'WHEEZE', emoji: '😭', accent: 'rose', tags: ['wheeze', 'cry', 'laugh'] },
];

const BY_SLUG = new Map(CLASH_NATIVE_STICKERS.map((s) => [s.slug, s]));

export function clashStickerBySlug(slug: string): ClashNativeSticker | null {
  return BY_SLUG.get(slug as ClashStickerSlug) ?? null;
}

export function clashStickerToken(slug: string): string {
  return `${TOKEN_PREFIX}${slug}${TOKEN_SUFFIX}`;
}

/** Synthetic URI for saved/recent rows (never fetched as a network image). */
export function clashStickerUri(slug: string): string {
  return `clash://sticker/${slug}`;
}

export function isClashStickerUri(uri: string): boolean {
  return uri.startsWith('clash://sticker/');
}

export function slugFromClashStickerUri(uri: string): string | null {
  if (!isClashStickerUri(uri)) return null;
  return uri.slice('clash://sticker/'.length) || null;
}

export function encodeClashStickerBody(slug: string, draft = ''): string {
  const token = clashStickerToken(slug);
  const text = draft.trim();
  if (!text) return token;
  return `${text}\n${token}`;
}

export interface ParsedClashStickerBody {
  sticker: ClashNativeSticker;
  /** Remaining human text with the token removed. */
  text: string;
}

export function parseClashStickerBody(body: string | null | undefined): ParsedClashStickerBody | null {
  if (!body) return null;
  TOKEN_RE.lastIndex = 0;
  const match = TOKEN_RE.exec(body);
  if (!match?.[1]) return null;
  const sticker = clashStickerBySlug(match[1]);
  if (!sticker) return null;
  const text = body.replace(TOKEN_RE, '').trim();
  return { sticker, text };
}

export function filterClashStickers(query: string): ClashNativeSticker[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...CLASH_NATIVE_STICKERS];
  return CLASH_NATIVE_STICKERS.filter((s) => {
    if (s.label.toLowerCase().includes(q)) return true;
    if (s.slug.includes(q)) return true;
    return s.tags.some((tag) => tag.includes(q));
  });
}
