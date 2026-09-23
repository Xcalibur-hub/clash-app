import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuroraBackground } from '../components/shared/AuroraBackground';
import { IconButton } from '../components/shared/IconButton';
import {
  BackIcon,
  CrownIcon,
  FlameIcon,
  RupeeIcon,
  TrophyIcon,
  ZapIcon,
} from '../components/shared/icons';
import { accent, card, ink, layout, radius, space, typeScale } from '../theme';
import { tap as hapticTap } from '../utils/haptics';

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
const ITEMS: readonly NotificationItem[] = [
  {
    id: 'n-daily-drop',
    icon: FlameIcon,
    tone: accent.danger,
    title: 'Your Clash just entered the Daily Drop.',
    body: '“Placements matter less than your first two years of real work.” is #03 tonight.',
    time: '2h ago',
    href: '/(tabs)/daily-drop',
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
    href: '/(tabs)/hall-of-fame',
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

/**
 * NOTIFICATION CENTER (reference screen 18): one row per win, newest first.
 * Every row deep-links to the moment it announces.
 */
export default function NotificationsScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = (): void => {
    hapticTap();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };
  const open = (item: NotificationItem): void => {
    hapticTap();
    router.push(item.href);
  };

  return (
    <AuroraBackground tone="calm" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.topRow}>
          <IconButton icon={BackIcon} onPress={back} label="Back" />
          <Text allowFontScaling={false} style={styles.title}>
            Notifications
          </Text>
          <View style={styles.slot} />
        </View>

        <View style={styles.list}>
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                onPress={() => open(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title} ${item.body}`}
                style={styles.row}
              >
                <View style={[styles.badge, { borderColor: item.tone }]}>
                  <Icon size={17} color={item.tone} strokeWidth={2.4} />
                </View>
                <View style={styles.text}>
                  <Text allowFontScaling={false} style={styles.rowTitle}>
                    {item.title}
                  </Text>
                  <Text allowFontScaling={false} style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text allowFontScaling={false} style={styles.time}>
                    {item.time}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.title, letterSpacing: 1.5, color: ink.primary },
  slot: { width: 38 },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexShrink: 0,
  },
  text: { flex: 1, gap: space.xs / 2 },
  rowTitle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  body: { ...typeScale.meta, color: ink.secondary, lineHeight: 17 },
  time: { ...typeScale.caption, fontSize: 10, color: ink.tertiary },
});