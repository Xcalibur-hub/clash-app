import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { EmptyState } from '../../components/shared/EmptyState';
import { BellIcon } from '../../components/shared/icons';
import { REALM_ROUTES } from '../../components/navigation/realmRoutes';
import { color, ink, layout, space, typeScale } from '../../theme';

/**
 * NOTIFICATIONS TAB — Simplified notification view for the tab interface.
 */
export default function NotificationsTab(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <SectionHeading eyebrow="Activity" title="Notifications" />
        <Text allowFontScaling={false} style={styles.subtitle}>
          Your wins, mentions, and system updates.
        </Text>

        <View style={styles.emptyContainer}>
          <EmptyState
            icon={BellIcon}
            title="No new notifications"
            body="When you win a clash or get mentioned, you'll see it here."
            actionLabel="Go to arena"
            onAction={() => router.push(REALM_ROUTES.arenaHome)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.md },
  screen: { flex: 1, backgroundColor: color.bg },
  subtitle: { ...typeScale.body, color: ink.secondary },
  emptyContainer: {
    marginTop: space.xl,
  },
});