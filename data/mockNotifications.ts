import type { LucideIcon } from 'lucide-react-native';
import {
  CrownIcon,
  FlameIcon,
  RupeeIcon,
  TrophyIcon,
  ZapIcon,
} from '../components/shared/icons';
import { accent } from '../theme';

export interface NotificationItem {
  id: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
  time: string;
  /** Deep link opened when the row is tapped. */
  href: string;
}

/** The episode-18 notification stream: every win the app has ever handed out. */
export const NOTIFICATION_ITEMS: readonly NotificationItem[] = [
  {
    id: 'n-daily-drop',
    icon: FlameIcon,
    tone: accent.danger,
    title: 'Your Clash just entered the Daily Drop.',
    body: '“Placements matter less than your first two years of real work.” is #03 tonight.',
    time: '2h ago',
    href: '/(tabs)/explore',
  },
  {
    id: 'n-clash-won',
    icon: TrophyIcon,
    tone: accent.gold,
    title: 'You won your Clash 6–3.',
    body: 'The jury backed your side. +120 Reputation is already on your card.',
    time: '5h ago',
    href: '/clash/t-viewer-placements',
  },
  {
    id: 'n-rank',
    icon: ZapIcon,
    tone: accent.violet,
    title: 'You are 80 XP away from Firestarter.',
    body: 'One more correct call and the next rank is yours.',
    time: 'Yesterday',
    href: '/(tabs)/profile',
  },
  {
    id: 'n-hof',
    icon: CrownIcon,
    tone: accent.gold,
    title: 'Your Take entered the Hall of Fame.',
    body: 'A 6–3 split sealed it. It now lives in the permanent archive.',
    time: 'Yesterday',
    href: '/(tabs)/explore',
  },
  {
    id: 'n-drop',
    icon: RupeeIcon,
    tone: accent.mint,
    title: '@manya uploaded a new Exclusive Drop.',
    body: 'Early access is live in the Vault for the next 48 hours.',
    time: '2 days ago',
    href: '/(vault)',
  },
];