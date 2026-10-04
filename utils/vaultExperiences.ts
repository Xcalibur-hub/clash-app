/**
 * Vault experience routing architecture (Phase 15.0).
 *
 * An experience is something the user ENTERS. Engines arrive in later phases;
 * this file only maps types → routes and marks what is enterable today.
 */

export type VaultExperienceType =
  | 'DROP'
  | 'COLLECTION'
  | 'INTERACTIVE_STORY'
  | 'AI_FILM'
  | 'CREATOR_AI'
  | 'LIVE_CONTROL'
  | 'MINI_GAME'
  | 'ANONYMOUS_ROOM'
  | 'CHALLENGE'
  | 'SECRET_DROP'
  | 'COURSE'
  | 'SERVICE'
  | 'PRODUCT'
  | 'WORLD_DROP';

export type VaultExperienceAvailability = 'enterable' | 'planned';

export interface VaultExperienceDefinition {
  type: VaultExperienceType;
  label: string;
  availability: VaultExperienceAvailability;
}

export const VAULT_EXPERIENCE_REGISTRY: readonly VaultExperienceDefinition[] = [
  { type: 'DROP', label: 'Drop', availability: 'enterable' },
  { type: 'COLLECTION', label: 'Collection', availability: 'enterable' },
  { type: 'INTERACTIVE_STORY', label: 'Interactive story', availability: 'planned' },
  { type: 'AI_FILM', label: 'AI film', availability: 'planned' },
  { type: 'CREATOR_AI', label: 'Creator AI', availability: 'planned' },
  { type: 'LIVE_CONTROL', label: 'Live control', availability: 'planned' },
  { type: 'MINI_GAME', label: 'Mini game', availability: 'planned' },
  { type: 'ANONYMOUS_ROOM', label: 'Pseudonymous room', availability: 'planned' },
  { type: 'CHALLENGE', label: 'Challenge', availability: 'planned' },
  { type: 'SECRET_DROP', label: 'Secret drop', availability: 'planned' },
  { type: 'COURSE', label: 'Course', availability: 'enterable' },
  { type: 'SERVICE', label: 'Service', availability: 'enterable' },
  { type: 'PRODUCT', label: 'Product', availability: 'enterable' },
  { type: 'WORLD_DROP', label: 'World drop', availability: 'planned' },
] as const;

export interface VaultExperienceRef {
  type: VaultExperienceType;
  id: string;
}

export function vaultExperienceDefinition(
  type: VaultExperienceType,
): VaultExperienceDefinition | null {
  return VAULT_EXPERIENCE_REGISTRY.find((entry) => entry.type === type) ?? null;
}

export function isVaultExperienceEnterable(type: VaultExperienceType): boolean {
  return vaultExperienceDefinition(type)?.availability === 'enterable';
}

/**
 * Route for an enterable experience. Planned types return null — never invent
 * fake destinations or backend rows.
 */
export function vaultExperienceHref(ref: VaultExperienceRef): string | null {
  if (!isVaultExperienceEnterable(ref.type)) return null;
  if (!ref.id) return null;
  switch (ref.type) {
    case 'DROP':
      return `/vault/drop/${ref.id}`;
    case 'COLLECTION':
      return `/vault/collection/${ref.id}`;
    case 'COURSE':
      return `/vault/course/${ref.id}`;
    case 'SERVICE':
      return `/vault/service/${ref.id}`;
    case 'PRODUCT':
      return `/vault/product/${ref.id}`;
    default:
      return null;
  }
}

/** Map storefront access into a coarse experience access label for UI. */
export function vaultExperienceAccessLabel(input: {
  accessLevel: 'free' | 'subscriber';
  accessible: boolean;
  hasPreview: boolean;
}): 'FREE' | 'PREVIEW' | 'SUBSCRIBER' | 'LOCKED' {
  if (input.accessLevel === 'free') return 'FREE';
  if (input.accessible) return 'SUBSCRIBER';
  if (input.hasPreview) return 'PREVIEW';
  return 'LOCKED';
}
