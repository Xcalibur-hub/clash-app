/**
 * Pure presentation helpers for Creator World Drops (Phase 15.3).
 * Labels and copy only — never grants anything.
 */

export type DropType = 'SECRET_DROP' | 'CHALLENGE' | 'COLLECTIBLE' | 'CREATOR_UNLOCK';
export type DropReward =
  | 'BADGE'
  | 'COLLECTIBLE'
  | 'CONTENT_UNLOCK'
  | 'WORLD_ACCESS'
  | 'CHALLENGE_STATUS';

export function dropTypeLabel(type: DropType | string): string {
  switch (type) {
    case 'CHALLENGE':
      return 'Challenge';
    case 'COLLECTIBLE':
      return 'Collectible';
    case 'CREATOR_UNLOCK':
      return 'Creator unlock';
    default:
      return 'Secret Drop';
  }
}

export function rewardTypeLabel(reward: DropReward | string): string {
  switch (reward) {
    case 'BADGE':
      return 'Badge';
    case 'CONTENT_UNLOCK':
      return 'Content unlock';
    case 'WORLD_ACCESS':
      return 'World access';
    case 'CHALLENGE_STATUS':
      return 'Challenge status';
    default:
      return 'Collectible';
  }
}

/** The playful verb on the discovery card. */
export function dropActionLabel(type: DropType | string): string {
  switch (type) {
    case 'CHALLENGE':
      return 'START CHALLENGE';
    case 'CREATOR_UNLOCK':
      return 'UNLOCK';
    case 'COLLECTIBLE':
      return 'CLAIM';
    default:
      return 'FIND';
  }
}

function upperFirst(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return 'A CREATOR';
  return trimmed.split(' ')[0].toUpperCase();
}

/** "MAYA LEFT SOMETHING HERE" — the discovery headline. */
export function dropDiscoveryLine(input: { creatorName: string | null; dropType: DropType | string }): string {
  const who = upperFirst(input.creatorName ?? '');
  switch (input.dropType) {
    case 'CHALLENGE':
      return `${who} SET A CHALLENGE`;
    case 'COLLECTIBLE':
      return `${who} HID A COLLECTIBLE`;
    case 'CREATOR_UNLOCK':
      return `${who} LEFT A KEY`;
    default:
      return `${who} LEFT SOMETHING HERE`;
  }
}

/** "Secret Drop · Mumbai" */
export function dropDiscoveryHint(input: {
  dropType: DropType | string;
  locationLabel: string | null;
}): string {
  return [dropTypeLabel(input.dropType), input.locationLabel].filter(Boolean).join(' · ');
}

/** Chapter line under HIDDEN IN THE WORLD. */
export function hiddenChapterLine(count: number): string {
  if (count <= 0) return 'Nothing hidden right now';
  if (count === 1) return '1 secret is waiting';
  return `${count} secrets are waiting`;
}

export function artifactCountLabel(count: number): string {
  if (count <= 0) return 'No artifacts yet';
  if (count === 1) return '1 artifact';
  return `${count} artifacts`;
}

/** True when a drop expires inside the window (default 48h). */
export function dropIsEndingSoon(
  expiresAt: number | null,
  now: number = Date.now(),
  withinMs = 48 * 60 * 60 * 1000,
): boolean {
  if (expiresAt == null) return false;
  const remaining = expiresAt - now;
  return remaining > 0 && remaining <= withinMs;
}