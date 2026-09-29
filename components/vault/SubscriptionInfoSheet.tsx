import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { GlassCard } from '../shared/GlassCard';
import { GlowButton } from '../shared/GlowButton';
import { LockIcon } from '../shared/icons';
import { color, duration, ink, radius, space, typeScale } from '../../theme';

export interface SubscriptionInfoSheetProps {
  visible: boolean;
  creatorName: string;
  onClose: () => void;
}

/**
 * The honest subscription CTA. There is no payment provider, so this sheet only
 * informs — it never grants access, never calls a payment authority, and never
 * implies a purchase happened. Entitlement still lives entirely in
 * `vault_subscriptions`, which the client cannot write.
 */
export function SubscriptionInfoSheet({ visible, creatorName, onClose }: SubscriptionInfoSheetProps): React.JSX.Element | null {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={styles.box}>
          <GlassCard corner={radius.xxl} contentStyle={styles.card}>
            <View style={styles.badge}>
              <LockIcon size={24} color={ink.secondary} strokeWidth={2} />
            </View>
            <Text allowFontScaling={false} style={styles.title}>Subscriptions coming soon</Text>
            <Text allowFontScaling={false} style={styles.body}>
              Subscribing to {creatorName}'s Vault isn't available in this build yet. Payment setup
              arrives in a later phase — nothing was charged, and no access was granted.
            </Text>
            <GlowButton label="Got it" onPress={onClose} tone="light" compact style={styles.cta} />
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: color.scrim,
  },
  box: { paddingHorizontal: space.md, paddingBottom: space.md },
  card: { alignItems: 'center', gap: space.sm, padding: space.xl },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  title: { ...typeScale.cardTitle, color: ink.primary, textAlign: 'center' },
  body: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
  cta: { marginTop: space.xs, minWidth: 160 },
});
