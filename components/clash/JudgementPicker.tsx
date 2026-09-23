import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Judgement, Side } from '../../store';
import { accent, glassBorder, ink, radius, scale, space, typeScale } from '../../theme';
import { judge as hapticJudge } from '../../utils/haptics';
import { sideTone } from './duelPalette';

export interface JudgementPickerProps {
  handleA: string;
  handleB: string;
  chosen: Judgement | undefined;
  locked: boolean;
  onChoose: (judgement: Judgement) => void;
}

function Option({
  side,
  handle,
  chosen,
  locked,
  onChoose,
}: {
  side: Side;
  handle: string;
  chosen: Judgement | undefined;
  locked: boolean;
  onChoose: (judgement: Judgement) => void;
}): React.JSX.Element {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));
  const { tone, soft } = sideTone(side);
  const selected = chosen === side;

  return (
    <Animated.View style={[styles.optionWrap, animated]}>
      <Pressable
        onPress={() => {
          if (locked) return;
          hapticJudge();
          onChoose(side);
        }}
        onPressIn={() => {
          if (locked) return;
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 180 });
        }}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked, selected }}
        accessibilityLabel={`Judge in favour of take ${side}, by ${handle}`}
        style={[
          styles.option,
          {
            borderColor: selected ? tone : 'rgba(255,255,255,0.12)',
            backgroundColor: selected ? soft : 'rgba(255,255,255,0.04)',
          },
          !selected && locked ? styles.locked : null,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.letter, { color: tone }]}>
          {side}
        </Text>
        <Text allowFontScaling={false} style={styles.optionHandle} numberOfLines={1}>
          {`@${handle}`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** "WHY ARE YOU CLASHING?" — the ballot (spec §8). One vote, then it locks. */
export function JudgementPicker({
  handleA,
  handleB,
  chosen,
  locked,
  onChoose,
}: JudgementPickerProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.prompt}>
        PICK YOUR SIDE
      </Text>
      <View style={styles.row}>
        <Option side="A" handle={handleA} chosen={chosen} locked={locked} onChoose={onChoose} />
        <Option side="B" handle={handleB} chosen={chosen} locked={locked} onChoose={onChoose} />
      </View>
      <Pressable
        onPress={() => {
          if (locked) return;
          hapticJudge();
          onChoose('UNDECIDED');
        }}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked, selected: chosen === 'UNDECIDED' }}
        accessibilityLabel="Abstain from this clash"
        style={[styles.undecided, chosen === 'UNDECIDED' && styles.undecidedOn]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.undecidedText, chosen === 'UNDECIDED' && styles.undecidedTextOn]}
        >
          UNDECIDED
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  prompt: { ...typeScale.eyebrow, color: ink.tertiary },
  row: { flexDirection: 'row', gap: space.md },
  optionWrap: { flex: 1 },
  option: {
    minHeight: 104,
    borderRadius: radius.card,
    borderWidth: 1,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  locked: { opacity: 0.5 },
  letter: { ...typeScale.dataLg, fontSize: 40, lineHeight: 46 },
  optionHandle: { ...typeScale.meta, color: ink.quaternary, fontSize: 11 },
  undecided: {
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glassBorder.soft,
  },
  undecidedOn: { borderColor: accent.neutral, backgroundColor: 'rgba(255,255,255,0.06)' },
  undecidedText: { ...typeScale.caption, color: ink.tertiary },
  undecidedTextOn: { color: ink.primary },
});
