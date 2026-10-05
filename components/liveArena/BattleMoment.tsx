/**
 * Shared visual language for meaningful Arena room moments.
 * One story beat — not an analytics card.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import type { BattleMomentModel } from '../../utils/battleMoment';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { softFill } from './liveArenaStyles';

export interface BattleMomentProps {
  moment: BattleMomentModel;
  /** Featured (primary) vs secondary compact beat. */
  prominence?: 'primary' | 'secondary';
  onPress?: () => void;
}

export function BattleMoment({
  moment,
  prominence = 'primary',
  onPress,
}: BattleMomentProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const primary = prominence === 'primary';
  const ink = moment.entertainment ? t.textPrimary : t.textPrimary;
  const muted = t.textMuted;

  const body = (
    <Animated.View
      key={moment.key}
      entering={reduced ? undefined : FadeIn.duration(220)}
      exiting={reduced ? undefined : FadeOut.duration(140)}
      style={[
        styles.plate,
        primary ? styles.platePrimary : styles.plateSecondary,
        {
          backgroundColor: moment.entertainment ? softFill(t) : t.surfaceElevated,
          borderColor: moment.entertainment ? t.borderStrong : t.border,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.kicker, { color: muted }]}
        numberOfLines={1}
      >
        {moment.kicker}
      </Text>
      {moment.who ? (
        <Text
          allowFontScaling={false}
          style={[styles.who, { color: ink }]}
          numberOfLines={1}
        >
          {moment.who}
        </Text>
      ) : null}
      {moment.preview ? (
        <Text
          allowFontScaling={false}
          style={[
            styles.preview,
            { color: primary ? t.textPrimary : t.textSecondary },
            primary && styles.previewPrimary,
          ]}
          numberOfLines={primary ? 3 : 2}
        >
          {moment.preview}
        </Text>
      ) : null}
    </Animated.View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${moment.kicker}. ${moment.who ?? ''} ${moment.preview ?? ''}`.trim()}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plate: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 3,
  },
  platePrimary: { minHeight: 72 },
  plateSecondary: { minHeight: 56, opacity: 0.92 },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
  },
  who: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  preview: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  previewPrimary: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
