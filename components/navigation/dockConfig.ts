import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import {
  ArenaHomeIcon,
  BookmarkIcon,
  CommentIcon,
  CompassIcon,
  PlusIcon,
  UserIcon,
  VaultIcon,
} from '../shared/icons';

/**
 * Visual height of the floating dock plate (icons + padding).
 *
 * AURA raised this from 52 to 56 for a less cramped plate. Scroll clearance is
 * derived from this constant, so every screen's bottom padding follows
 * automatically — never hardcode the dock height at a call site.
 */
export const DOCK_HEIGHT = 56;

/**
 * Breathing room above the dock top edge (not including safe-area inset).
 * Scroll screens should use: insets.bottom + DOCK_SCROLL_CLEARANCE
 * Sized so feed/trending content clears the floating capsule without huge padding.
 */
export const DOCK_TOP_GAP = 48;

/**
 * Bottom clearance for scrollable tab screens so content clears the floating
 * dock. Pair with safe-area bottom inset:
 *   paddingBottom: insets.bottom + DOCK_SCROLL_CLEARANCE
 *
 * Equals dock height + gap above the dock.
 */
export const DOCK_SCROLL_CLEARANCE = DOCK_HEIGHT + DOCK_TOP_GAP;

/** Helper — full bottom padding including safe area. */
export function dockBottomPadding(insetsBottom: number): number {
  return insetsBottom + DOCK_SCROLL_CLEARANCE;
}

export type TabRoute = BottomTabBarProps['state']['routes'][number];

export const ARENA_TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: ArenaHomeIcon },
  explore: { label: 'Explore', icon: CompassIcon },
  create: { label: '', icon: PlusIcon },
  notifications: { label: 'Activity', icon: CommentIcon },
  profile: { label: 'Profile', icon: UserIcon },
};

export const VAULT_TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Drops', icon: VaultIcon },
  collections: { label: 'Collections', icon: BookmarkIcon },
  profile: { label: 'Profile', icon: UserIcon },
};
