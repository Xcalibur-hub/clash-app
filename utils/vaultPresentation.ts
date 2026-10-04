/**
 * Pure Vault presentation helpers — editorial layout / copy only.
 * Never grants access or invents media.
 */

export type WorldTileLayout = 'featured' | 'wide' | 'portrait';

/** Alternating world-stack layouts after the featured hero. */
export function worldStackLayout(index: number): WorldTileLayout {
  if (index <= 0) return 'featured';
  return index % 2 === 1 ? 'wide' : 'portrait';
}

/** Split a title into 1–3 editorial lines for display typography. */
export function editorialTitleLines(title: string, maxLines = 2): string[] {
  const cleaned = title.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];
  const words = cleaned.split(' ');
  if (words.length === 1 || maxLines <= 1) return [cleaned.toUpperCase()];

  if (words.length === 2) {
    return words.map((w) => w.toUpperCase());
  }

  // Prefer a short first line (1–2 words) then the rest.
  const firstCount = words.length >= 4 ? 2 : 1;
  const first = words.slice(0, firstCount).join(' ').toUpperCase();
  const rest = words.slice(firstCount).join(' ').toUpperCase();
  if (maxLines === 2) return [first, rest];

  const mid = Math.ceil(words.length / 2);
  return [
    words.slice(0, Math.min(2, mid)).join(' ').toUpperCase(),
    words.slice(Math.min(2, mid), mid + 1).join(' ').toUpperCase(),
    words.slice(mid + 1).join(' ').toUpperCase(),
  ].filter(Boolean);
}

/** Short identity line from bio — never invents categories. */
export function creatorIdentityLine(bio: string | null | undefined, fallback = 'Creator'): string {
  if (!bio) return fallback;
  const first = bio.trim().split(/[.\n]/)[0]?.trim() ?? '';
  if (!first) return fallback;
  return first.length > 42 ? `${first.slice(0, 40).trimEnd()}…` : first;
}

/** Compact happening line for featured / stack tiles. */
export function worldHappeningLine(input: {
  latestCaption: string | null | undefined;
  latestAccess: 'free' | 'preview' | null | undefined;
  hasCourses?: boolean;
  hasServices?: boolean;
  hasProducts?: boolean;
}): string | null {
  if (input.latestCaption) {
    const caption = input.latestCaption.trim();
    if (!caption) return null;
    const short = caption.length > 36 ? `${caption.slice(0, 34).trimEnd()}…` : caption;
    return input.latestAccess === 'preview' ? `Preview · ${short}` : short;
  }
  if (input.hasCourses) return 'New lessons inside';
  if (input.hasServices) return 'Sessions open';
  if (input.hasProducts) return 'Artifacts in the shop';
  return null;
}

/** Tiny access labels for overlays — not giant badges. */
export function vaultAccessMeta(
  access: 'free' | 'preview' | 'subscriber' | 'subscriber_locked' | string,
): string {
  switch (access) {
    case 'free':
    case 'FREE':
      return 'FREE';
    case 'preview':
    case 'PREVIEW':
      return 'PREVIEW';
    case 'subscriber':
    case 'SUBSCRIBER':
      return 'SUBSCRIBERS';
    case 'subscriber_locked':
    case 'SUBSCRIBER_LOCKED':
      return 'SUBSCRIBERS';
    default:
      return String(access).toUpperCase();
  }
}

/** Creator World chapter titles — editorial, not tab labels. */
export function creatorWorldChapterTitle(
  module: 'CONTENT' | 'COLLECTIONS' | 'COURSES' | 'SERVICES' | 'STORE' | 'COMMUNITY',
  creatorName: string,
): string {
  const name = creatorName.trim() || 'Creator';
  switch (module) {
    case 'CONTENT':
      return 'TONIGHT';
    case 'COLLECTIONS':
      return 'SERIES';
    case 'COURSES':
      return `LEARN WITH ${name.toUpperCase()}`;
    case 'SERVICES':
      return `WORK WITH ${name.toUpperCase()}`;
    case 'STORE':
      return `FROM ${name.toUpperCase()}`;
    case 'COMMUNITY':
      return 'COMMUNITY';
    default:
      return name.toUpperCase();
  }
}

/** Soft wash from creator tint for atmosphere (never neon). */
export function vaultTintWash(tint: string | null | undefined, alpha = 0.14): string {
  const raw = (tint ?? '#A1A1AA').trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return `rgba(24,24,27,${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
