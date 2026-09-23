import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import type { JuryScore, Side } from '../../store';
import { duel, ink, radius, space, typeScale } from '../../theme';

export interface ScoreCirclesProps {
  score: JuryScore;
  winningSide: Side;
}

function Circle({ side, value, won }: { side: Side; value: number; won: boolean }): React.JSX.Element {
  const tone = side === 'A' ? duel.a : duel.b;
  const soft = side === 'A' ? duel.aSoft : duel.bSoft;

  return (
    <Animated.View
      entering={ZoomIn.delay(side === 'A' ? 60 : 180).duration(420)}
      accessibilityLabel={`Side ${side}: ${value} jurors`}
      style={[
        styles.circle,
        {
          borderColor: won ? tone : 'rgba(255,255,255,0.14)',
          backgroundColor: won ? soft : 'rgba(255,255,255,0.04)',
        },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.letter, { color: tone }]}>
        {side}
      </Text>
      <Text allowFontScaling={false} style={styles.value}>
        {value}
      </Text>
    </Animated.View>
  );
}

/**
 * The verdict, boldly (reference screen 9): a violet A circle and an electric-blue
 * B circle carrying the jury score — "6 — 3".
 */
export function ScoreCircles({ score, winningSide }: ScoreCirclesProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Circle side="A" value={score.a} won={winningSide === 'A'} />
      <Text allowFontScaling={false} style={styles.dash}>
        {'—'}
      </Text>
      <Circle side="B" value={score.b} won={winningSide === 'B'} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg },
  circle: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  letter: { ...typeScale.caption, letterSpacing: 1.4 },
  value: { ...typeScale.dataLg, fontSize: 30, lineHeight: 34, color: ink.primary },
  dash: { ...typeScale.dataLg, fontSize: 26, lineHeight: 30, color: ink.quaternary },
});