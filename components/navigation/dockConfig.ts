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

/** Visual height of the floating capsule dock (icons + padding). */
export const DOCK_HEIGHT = 52;

/**
 * Bottom clearance for scrollable tab screens so content clears the floating
 * dock + its outer margin. Use with safe-area bottom inset:
 *   paddingBottom: insets.bottom + DOCK_SCROLL_CLEARANCE
 */
export const DOCK_SCROLL_CLEARANCE = 80;

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
