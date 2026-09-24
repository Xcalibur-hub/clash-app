import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import {
  AnalyticsIcon,
  ArenaHomeIcon,
  BellIcon,
  CompassIcon,
  CreatorsIcon,
  PlusIcon,
  RadarIcon,
  TrophyIcon,
  UserIcon,
  VaultIcon,
} from '../shared/icons';

/** The dock's own geometry (reference screens 5 & 23). */
export const DOCK_HEIGHT = 60;
export const DOCK_RADIUS = 0;
export const BLUR = 50;
/** Arena-only: the elevated centre button that opens Take Creation. */
export const ELEVATED_ROUTE = 'create';
export const ELEVATED_SIZE = 56;
/** Space reserved for the realm key — mirrored on the left so "+" stays centred. */
export const REALM_SLOT = 48;

export type TabRoute = BottomTabBarProps['state']['routes'][number];

export const ARENA_TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: ArenaHomeIcon },
  explore: { label: 'Explore', icon: CompassIcon },
  create: { label: 'Create', icon: PlusIcon },
  notifications: { label: 'Activity', icon: BellIcon },
  profile: { label: 'Profile', icon: UserIcon },
};

export const VAULT_TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Vault', icon: VaultIcon },
  creators: { label: 'Creators', icon: CreatorsIcon },
  radar: { label: 'Radar', icon: RadarIcon },
  analytics: { label: 'Analytics', icon: AnalyticsIcon },
  profile: { label: 'Profile', icon: UserIcon },
};
