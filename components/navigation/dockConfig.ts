import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import {
  AnalyticsIcon,
  ArenaHomeIcon,
  CommentIcon,
  CompassIcon,
  CreatorsIcon,
  PlusIcon,
  RadarIcon,
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
  index: { label: 'Vault', icon: VaultIcon },
  creators: { label: 'Creators', icon: CreatorsIcon },
  radar: { label: 'Radar', icon: RadarIcon },
  analytics: { label: 'Analytics', icon: AnalyticsIcon },
  profile: { label: 'Profile', icon: UserIcon },
};
