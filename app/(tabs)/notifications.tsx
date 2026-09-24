import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { EmptyState } from '../../components/shared/EmptyState';
import { BellIcon } from '../../components/shared/icons';
import { ink, layout, space, typeScale } from '../../theme';

/**
 * NOTIFICATIONS TAB — Simplified notification view for the tab interface.
 */
export default function NotificationsTab(): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <AuroraBackground tone="arena" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <SectionHeading eyebrow="ACTIVITY" title="Notifications" editorial marked />
        <Text allowFontScaling={false} style={styles.subtitle}>
          Your wins, mentions, and system updates.
        </Text>

        <View style={styles.emptyContainer}>
          <EmptyState
            icon={BellIcon}
            title="No new notifications"
            body="When you win a clash or get mentioned, you'll see it here."
            actionLabel="GO TO ARENA"
            onAction={() => {
              // Navigate to arena - this would need router integration
            }}
          />
        </View>
      </ScrollView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenX, gap: space.md },
  subtitle: { ...typeScale.body, color: ink.secondary },
  emptyContainer: {
    marginTop: space.xl,
  },
});