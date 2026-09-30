import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { GlowButton } from '../shared/GlowButton';
import { duration, space, typeScale, useThemeColors } from '../../theme';

export interface SubscriptionInfoSheetProps {
  visible: boolean;
  creatorName: string;
  onClose: () => void;
}

/**
 * Honest subscription CTA — informational only.
 * Never charges, never grants access, never implies a purchase.
 */
export function SubscriptionInfoSheet({
  visible,
  creatorName,
  onClose,
}: SubscriptionInfoSheetProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(duration.fast)} style={[styles.scrim, { backgroundColor: t.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={styles.box}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: t.surfaceElevated,
                borderColor: t.border,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              SUBSCRIBER DROP
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Subscriptions coming soon
            </Text>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
              Subscribing to {creatorName}'s Vault isn't available in this build yet. Nothing was
              charged, and no access was granted.
            </Text>
            <GlowButton label="Got it" onPress={onClose} tone="light" compact style={styles.cta} />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  box: { paddingHorizontal: space.md, paddingBottom: space.md },
  card: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kicker: { ...typeScale.caption, letterSpacing: 0.8 },
  title: { ...typeScale.section, textAlign: 'center' },
  body: { ...typeScale.body, textAlign: 'center' },
  cta: { marginTop: space.xs, minWidth: 160 },
});
