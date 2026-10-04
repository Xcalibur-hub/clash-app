import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { duration, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

export interface SubscriptionInfoSheetProps {
  visible: boolean;
  creatorName: string;
  /** Only list benefits that are actually available today. */
  benefits?: readonly string[];
  onClose: () => void;
}

const DEFAULT_BENEFITS = ['Subscriber Drops', 'Complete Collections'] as const;

/**
 * Honest subscription CTA — informational only.
 * Never charges, never grants access, never invents prices or future features.
 */
export function SubscriptionInfoSheet({
  visible,
  creatorName,
  benefits = DEFAULT_BENEFITS,
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
              JOIN {creatorName.toUpperCase()}'S VAULT
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Unlock this world
            </Text>
            <View style={styles.benefits}>
              {benefits.map((benefit) => (
                <Text
                  key={benefit}
                  allowFontScaling={false}
                  style={[styles.benefit, { color: t.textSecondary }]}
                >
                  {benefit}
                </Text>
              ))}
            </View>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
              Subscriptions aren't available in this build yet. Nothing was charged, and no access
              was granted.
            </Text>
            <VaultActionButton label="Got it" onPress={onClose} compact style={styles.cta} />
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
  kicker: { ...typeScale.caption, letterSpacing: 0.8, textAlign: 'center' },
  title: { ...typeScale.section, textAlign: 'center' },
  benefits: { gap: 4, alignItems: 'center', marginTop: 2 },
  benefit: { ...typeScale.body, textAlign: 'center' },
  body: { ...typeScale.meta, textAlign: 'center', marginTop: space.xs },
  cta: { marginTop: space.xs, minWidth: 160, alignSelf: 'center' },
});
