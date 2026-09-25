import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/shared/IconButton';
import { BackIcon } from '../components/shared/icons';
import { NOTIFICATION_ITEMS, type NotificationItem } from '../data/mockNotifications';
import { card, color, ink, layout, radius, space, typeScale } from '../theme';
import { tap as hapticTap } from '../utils/haptics';

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
    <View style={styles.screen}>
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
          {NOTIFICATION_ITEMS.map((item) => {
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
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
    backgroundColor: card.native,
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