import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { GlassCard } from '../shared/GlassCard';
import { GlowButton } from '../shared/GlowButton';
import { AnalyticsIcon, KeyIcon } from '../shared/icons';
import { duration, ink, radius, space, typeScale } from '../../theme';
import { paySheet, sheet } from './vaultStyles';
import { tap as hapticTap } from '../../utils/haptics';

export interface AnalyticsPaywallProps {
  visible: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

const PERKS = [
  'City-level attribution',
  'Regional performance',
  'Campaign comparison',
  'Conversion analysis',
  'Exportable reports',
];

/** PRO ANALYTICS paywall (§21): mock ₹19,999/mo gate over advanced geo. */
export function AnalyticsPaywall({ visible, onClose, onUnlock }: AnalyticsPaywallProps): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(duration.fast)} style={sheet.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close paywall" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={sheet.box}>
          <GlassCard level="strong" corner={radius.xxl} contentStyle={paySheet.card}>
            <View style={styles.body}>
              <View style={styles.head}>
                <AnalyticsIcon size={16} color={ink.secondary} strokeWidth={2.4} />
                <Text allowFontScaling={false} style={styles.title}>Pro Analytics</Text>
              </View>
              <Text allowFontScaling={false} style={styles.price}>₹19,999 / month</Text>
              <View style={styles.perks}>
                {PERKS.map((perk) => (
                  <View key={perk} style={styles.perk}>
                    <KeyIcon size={12} color={ink.tertiary} strokeWidth={2.6} />
                    <Text allowFontScaling={false} style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
              </View>
              <GlowButton
                label="Unlock analytics"
                onPress={() => { hapticTap(); onUnlock(); }}
                icon={AnalyticsIcon}
                tone="light"
              />
              <Text allowFontScaling={false} style={styles.mock}>Mock paywall — no billing in the prototype.</Text>
            </View>
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typeScale.cardTitle, color: ink.primary },
  price: { ...typeScale.title, color: ink.primary },
  perks: { gap: space.sm },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  perkText: { ...typeScale.body, color: ink.secondary, fontSize: 14 },
  mock: { ...typeScale.meta, color: ink.tertiary, textAlign: 'center', fontWeight: '400' },
});
