import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useThemeColors } from '../../../theme';
import { expectedSignal, signalDescription, type Puzzle } from './model';

export function SignalPattern({ mask, size, compact = false }: { mask: number; size: number; compact?: boolean }): React.JSX.Element {
  const t = useThemeColors();
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.pattern}>
    {Array.from({ length: size }, (_, row) => <View key={row} style={styles.dotRow}>
      {Array.from({ length: size }, (_, column) => <View key={column} style={[styles.dot, {
        width: compact ? 10 : 14, height: compact ? 10 : 14,
        backgroundColor: mask & (1 << (row * size + column)) ? t.textPrimary : t.border,
        opacity: mask & (1 << (row * size + column)) ? 1 : 0.45,
      }]} />)}
    </View>)}
  </View>;
}

export function SignalBoard({ puzzle, answer, onAnswer, reduceMotion = false }: {
  puzzle: Puzzle; answer: number | null; onAnswer: (option: number) => void; reduceMotion?: boolean;
}): React.JSX.Element {
  const t = useThemeColors(), reduced = useReducedMotion() || reduceMotion;
  const correct = answer !== null && puzzle.options[answer] === expectedSignal(puzzle);
  return <View style={styles.board}>
    <View style={[styles.sequence, { backgroundColor: t.surfaceElevated }]}>
      {puzzle.frames.map((mask, i) => <View key={i} accessible accessibilityLabel={`Frame ${i + 1}: ${signalDescription(mask, puzzle.size)}`} style={styles.frame}>
        <Text style={[styles.meta, { color: t.textMuted }]}>{String(i + 1).padStart(2, '0')}</Text>
        <SignalPattern mask={mask} size={puzzle.size} compact />
      </View>)}
    </View>
    <Text accessibilityRole="header" style={[styles.prompt, { color: t.textPrimary }]}>What comes next?</Text>
    <Text style={[styles.meta, { color: t.textSecondary }]}>Read the frames left to right. Tap one signal.</Text>
    <View style={styles.answers}>
      {puzzle.options.map((mask, i) => <Pressable key={i} accessibilityRole="button"
        accessibilityLabel={`Answer ${'ABC'[i]}: ${signalDescription(mask, puzzle.size)}`}
        accessibilityState={{ disabled: answer !== null, selected: answer === i }} disabled={answer !== null}
        onPress={() => onAnswer(i)} style={[styles.answer, { backgroundColor: t.surface,
          borderColor: answer === i ? t.textPrimary : t.border, borderWidth: answer === i ? 2 : 1 }]}>
        <Text style={[styles.meta, { color: t.textSecondary }]}>{'ABC'[i]}</Text>
        <SignalPattern mask={mask} size={puzzle.size} />
        {answer !== null && mask === expectedSignal(puzzle) ? <Text style={[styles.meta, { color: t.textPrimary }]}>Correct</Text> : null}
      </Pressable>)}
    </View>
    {answer !== null ? <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.feedback}>
      <Text accessibilityLiveRegion="polite" style={[styles.prompt, { color: t.textPrimary }]}>{correct ? 'Signal found.' : 'A different rule.'}</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>{puzzle.explanation}</Text>
    </Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  board: { gap: 12 },
  sequence: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 24, padding: 14, gap: 8 },
  frame: { flex: 1, minWidth: 52, alignItems: 'center', gap: 12, paddingVertical: 12 },
  pattern: { gap: 4, alignItems: 'center', padding: 6 },
  dotRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 12, height: 12, borderRadius: 4 },
  prompt: { fontSize: 22, lineHeight: 29, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 24 },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  answer: { flex: 1, minWidth: 72, minHeight: 116, borderRadius: 20, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 10 },
  feedback: { gap: 8 },
});
