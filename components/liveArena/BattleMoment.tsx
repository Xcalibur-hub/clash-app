/**
 * Shared visual language for meaningful Arena room moments.
 * Mini event cards — stronger than comments, not analytics widgets.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import type { BattleMomentModel } from '../../utils/battleMoment';
import { battleMomentAccent, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

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
  const accent = battleMomentAccent(moment.kind, t.scheme);

  const body = (
    <Animated.View
      key={moment.key}
      entering={reduced ? undefined : FadeIn.duration(220)}
      exiting={reduced ? undefined : FadeOut.duration(140)}
      style={[
        styles.plate,
        primary ? styles.platePrimary : styles.plateSecondary,
        {
          backgroundColor: primary ? accent.soft : t.surfaceElevated,
          borderColor: primary ? accent.ink : t.border,
          shadowColor: t.shadowColor,
        },
        primary && styles.plateShadow,
      ]}
    >
      <View style={[styles.edge, { backgroundColor: accent.ink }]} />
      <View style={styles.copy}>
        <Text
          allowFontScaling={false}
          style={[styles.kicker, { color: accent.ink }]}
          numberOfLines={1}
        >
          {moment.kicker}
        </Text>
        {moment.who ? (
          <Text
            allowFontScaling={false}
            style={[styles.who, { color: t.textPrimary }]}
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
        {primary && moment.entertainment ? (
          <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
            Crowd signal · not a vote
          </Text>
        ) : null}
      </View>
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
    overflow: 'hidden',
    flexDirection: 'row',
  },
  platePrimary: {
    paddingVertical: space.md,
    paddingRight: space.md,
    minHeight: 88,
  },
  plateSecondary: {
    paddingVertical: space.xs + 2,
    paddingRight: space.sm,
  },
  plateShadow: {
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  edge: {
    width: 4,
    alignSelf: 'stretch',
  },
  copy: {
    flex: 1,
    gap: 3,
    paddingLeft: space.sm + 2,
    justifyContent: 'center',
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  who: {
    ...typeScale.label,
    fontSize: 14,
    fontWeight: '800',
  },
  preview: {
    ...typeScale.meta,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  previewPrimary: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  hint: {
    ...typeScale.caption,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 2,
  },
});
