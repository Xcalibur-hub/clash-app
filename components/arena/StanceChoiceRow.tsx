import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import type { Stance } from '../../services/mindshiftService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const CHOICES: readonly { key: Stance; label: string }[] = [
  { key: 'AGREE', label: 'Agree' },
  { key: 'UNSURE', label: 'Unsure' },
  { key: 'DISAGREE', label: 'Disagree' },
];

export interface StanceChoiceRowProps {
  prompt: string;
  disabled?: boolean;
  onChoose: (stance: Stance) => void;
}

/** Three equal tactile stance controls — no side preferred (anti-anchoring). */
export function StanceChoiceRow({ prompt, disabled, onChoose }: StanceChoiceRowProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.prompt, { color: t.textSecondary }]}>
        {prompt}
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={prompt}>
        {CHOICES.map((choice) => (
          <StanceChip
            key={choice.key}
            label={choice.label}
            disabled={disabled}
            onPress={() => onChoose(choice.key)}
          />
        ))}
      </View>
    </View>
  );
}

function StanceChip({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        hapticTap();
        if (!reduced) {
          scale.value = withSequence(
            withSpring(0.94, { damping: 14, stiffness: 420 }),
            withSpring(1, { damping: 12, stiffness: 280 }),
          );
        }
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.chipHit}
    >
      <Animated.View
        style={[
          styles.chip,
          anim,
          {
            backgroundColor: t.surface,
            borderColor: t.borderStrong,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.label, { color: t.textPrimary }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  prompt: {
    ...typeScale.label,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  row: { flexDirection: 'row', gap: space.xs },
  chipHit: { flex: 1 },
  chip: {
    minHeight: layout.hit - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xs,
  },
  label: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
});
