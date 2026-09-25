import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Judgement, Side } from '../../store';
import { ink, radius, scale, space, typeScale } from '../../theme';
import { sideTone } from './duelPalette';

export interface ChoiceButtonProps {
  side: Side;
  handle: string;
  onChoose: (judgement: Judgement) => void;
}

/**
 * One ballot target for the fast voting flow (PRD §9): a side-tinted puck with a
 * 90ms press-in, so the whole vote is one tap — no scrolling, no jury mechanics.
 */
export function ChoiceButton({ side, handle, onChoose }: ChoiceButtonProps): React.JSX.Element {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));
  const { tone, soft } = sideTone(side);

  return (
    <Animated.View style={[styles.wrap, animated]}>
      <Pressable
        onPress={() => onChoose(side)}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 160 });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Vote for Take ${side} by @${handle}`}
        style={[styles.puck, { borderColor: tone, backgroundColor: soft }]}
      >
        <Text allowFontScaling={false} style={[styles.letter, { color: tone }]}>
          {side}
        </Text>
        <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
          {`@${handle}`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  puck: {
    minHeight: 64,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  letter: { ...typeScale.title, fontSize: 26, lineHeight: 30 },
  handle: { ...typeScale.meta, color: ink.tertiary },
});