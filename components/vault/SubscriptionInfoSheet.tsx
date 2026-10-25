import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { duration, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from './VaultActionButton';

export interface SubscriptionInfoSheetProps {
  visible: boolean; creatorName: string; benefits?: readonly string[]; onClose: () => void;
}
const DEFAULT_BENEFITS = ['Subscriber Drops', 'Complete Collections'] as const;
/** Information only: no acquisition control, charges or entitlement mutations. */
export function SubscriptionInfoSheet({ visible, creatorName, benefits = DEFAULT_BENEFITS, onClose }: SubscriptionInfoSheetProps): React.JSX.Element | null {
  const t = useThemeColors(), reduced = useReducedMotion(), insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!visible) return null;
  return <Modal visible transparent animationType="none" onRequestClose={onClose}>
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.fast)} style={[styles.scrim, { backgroundColor: t.overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close membership information" />
      <Animated.View entering={reduced ? undefined : FadeInUp.duration(duration.base)}
        accessibilityViewIsModal style={[styles.box, { maxHeight: height - insets.top, paddingBottom: insets.bottom + space.md }]}>
        <ScrollView contentContainerStyle={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
          <Text style={[styles.kicker, { color: t.textMuted }]}>{creatorName}'s Vault</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>Membership unavailable</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>New subscriptions and in-app purchases are unavailable in this build. Nothing was charged and no access was granted. Existing members keep their server-authorized access.</Text>
          {benefits.length ? <View style={styles.benefits}>
            <Text style={[styles.body, { color: t.textMuted }]}>Member-only content may include:</Text>
            {benefits.map(benefit => <Text key={benefit} style={[styles.body, { color: t.textSecondary }]}>{benefit}</Text>)}
          </View> : null}
          <VaultActionButton label="Got it" onPress={onClose} compact style={styles.cta} />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  </Modal>;
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  box: { paddingHorizontal: space.md, flexShrink: 1 },
  card: { gap: space.sm, padding: space.lg, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  kicker: { ...typeScale.caption }, title: { ...typeScale.section }, body: { ...typeScale.body },
  benefits: { gap: space.xs }, cta: { marginTop: space.sm },
});
