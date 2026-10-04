/**
 * Vault consumer access presentation helpers.
 * Entitlement remains server-authoritative — these never grant access.
 */

export type VaultDropDisplayAccess =
  | 'FREE'
  | 'PREVIEW'
  | 'SUBSCRIBER'
  | 'SUBSCRIBER_LOCKED';

export interface VaultDropAccessInput {
  accessLevel: 'free' | 'subscriber';
  accessible: boolean;
  /** Intentional public preview asset present (never derived from private bytes). */
  hasPreviewMedia: boolean;
  status?: 'draft' | 'published' | 'expired' | 'removed';
  expiresAt?: number | null;
  now?: number;
}

/**
 * Consumer-facing access state for cards and detail.
 * PREVIEW only when the creator attached intentional public preview media.
 */
export function vaultDropDisplayAccess(input: VaultDropAccessInput): VaultDropDisplayAccess {
  if (input.accessLevel === 'free') return 'FREE';
  if (input.accessible) return 'SUBSCRIBER';
  if (input.hasPreviewMedia) return 'PREVIEW';
  return 'SUBSCRIBER_LOCKED';
}

export function vaultDropAccessBadge(access: VaultDropDisplayAccess): string {
  switch (access) {
    case 'FREE':
      return 'FREE DROP';
    case 'PREVIEW':
      return 'PREVIEW AVAILABLE';
    case 'SUBSCRIBER':
      return 'SUBSCRIBER DROP';
    case 'SUBSCRIBER_LOCKED':
      return 'SUBSCRIBERS';
    default:
      return 'DROP';
  }
}

/**
 * Human-readable expiry for Vault lists — not a second-by-second ticker.
 * Returns null when there is no live window to show.
 */
export function vaultExpiryLabel(
  expiresAt: number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  const remaining = expiresAt - now;
  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 60) return minutes < 1 ? 'under a minute left' : `${minutes}m left`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h left`;

  const end = new Date(expiresAt);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sameDay =
    end.getFullYear() === today.getFullYear() &&
    end.getMonth() === today.getMonth() &&
    end.getDate() === today.getDate();
  if (sameDay) return 'Ends tonight';

  const isTomorrow =
    end.getFullYear() === tomorrow.getFullYear() &&
    end.getMonth() === tomorrow.getMonth() &&
    end.getDate() === tomorrow.getDate();
  if (isTomorrow) return 'Tomorrow';

  const days = Math.floor(hours / 24);
  return days <= 1 ? 'Tomorrow' : `${days}d left`;
}

/** Drop is past its feed window — client must not keep treating it as live. */
export function isVaultDropFeedExpired(
  expiresAt: number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt <= now;
}

/**
 * Public visual URL source for a card. Never returns private media.
 * Prefer full free media; otherwise intentional preview only.
 */
export function vaultPublicVisualMedia(input: {
  accessLevel: 'free' | 'subscriber';
  accessible: boolean;
  publicMedia: { bucket: string; path: string; kind: string } | null;
  previewMedia: { bucket: string; path: string; kind: string } | null;
}): { bucket: string; path: string; kind: string; source: 'public' | 'preview' } | null {
  if (input.accessLevel === 'free' && input.publicMedia) {
    return { ...input.publicMedia, source: 'public' };
  }
  if (input.previewMedia) {
    return { ...input.previewMedia, source: 'preview' };
  }
  return null;
}
