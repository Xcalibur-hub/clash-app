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

/** The dock's own geometry (reference screens 5 & 23). */
export const DOCK_HEIGHT = 60;

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
