import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import {
  AnalyticsIcon,
  ArenaHomeIcon,
  ClockIcon,
  CreatorsIcon,
  PlusIcon,
  RadarIcon,
  TrophyIcon,
  UserIcon,
  VaultIcon,
} from '../shared/icons';

/** The dock's own geometry (reference screens 5 & 23). */
export const DOCK_HEIGHT = 64;
export const DOCK_RADIUS = 32;
export const BLUR = 60;
/** Arena-only: the elevated centre button that opens Take Creation. */
export const ELEVATED_ROUTE = 'create';
export const ELEVATED_SIZE = 56;
/** Space reserved for the realm key — mirrored on the left so "+" stays centred. */
export const REALM_SLOT = 48;

export type TabRoute = BottomTabBarProps['state']['routes'][number];

export const ARENA_TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Arena', icon: ArenaHomeIcon },
  create: { label: 'Create', icon: PlusIcon },
  'daily-drop': { label: 'Daily Drop', icon: ClockIcon },
  'hall-of-fame': { label: 'Hall of Fame', icon: TrophyIcon },
  profile: { label: 'Profile', icon: UserIcon },
};

export const VAULT_TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Vault', icon: VaultIcon },
  creators: { label: 'Creators', icon: CreatorsIcon },
  radar: { label: 'Radar', icon: RadarIcon },
  analytics: { label: 'Analytics', icon: AnalyticsIcon },
  profile: { label: 'Profile', icon: UserIcon },
};
