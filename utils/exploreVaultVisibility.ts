/**
 * Explore Vault discovery eligibility (client mirror of server rules).
 * FREE = full public drop media.
 * PREVIEW = intentional public teaser for a subscriber drop.
 * SUBSCRIBER without preview = never shown.
 */

export type ExploreVaultAccess = 'free' | 'preview' | 'subscriber';

export function normalizeExploreVaultAccess(raw: string | null | undefined): ExploreVaultAccess | null {
  if (raw === 'free' || raw === 'preview' || raw === 'subscriber') return raw;
  return null;
}

/** True when Explore may surface this drop. */
export function isExploreVaultVisible(input: {
  accessLevel: string | null | undefined;
  publicMediaPath?: string | null;
}): boolean {
  const access = normalizeExploreVaultAccess(input.accessLevel);
  if (access === 'free' || access === 'preview') {
    return Boolean(input.publicMediaPath);
  }
  return false;
}

export function exploreVaultKindLabel(accessLevel: string | null | undefined): 'VAULT' | 'VAULT PREVIEW' {
  return accessLevel === 'preview' ? 'VAULT PREVIEW' : 'VAULT';
}
