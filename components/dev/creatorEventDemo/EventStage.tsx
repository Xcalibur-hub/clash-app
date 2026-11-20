import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { typeScale, useThemeColors } from '../../../theme';
import { appliedChoice, type DemoEvent } from './model';

/** A local illustration changes shape; it does not operate a physical object. */
export function EventStage({ event, reduceMotion }: { event: DemoEvent; reduceMotion: boolean }): React.JSX.Element {
  const t = useThemeColors(), systemReduced = useReducedMotion(), choice = appliedChoice(event);
  const shapes = {
    bridge: 'M35 145 L85 55 L235 55 L285 145 L235 145 L215 95 L105 95 L85 145 Z',
    tower: 'M110 150 L150 25 L185 65 L210 150 Z M150 25 L155 150 M185 65 L155 150',
    spiral: 'M50 115 C30 30 275 15 270 100 C268 175 90 160 100 95 C108 50 220 65 210 105 C205 130 145 125 150 100',
    sheet: 'M50 130 L95 40 L275 55 L230 145 Z M95 40 L230 145',
  };
  return <View style={[styles.stage, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
    <Text style={[styles.eyebrow, { color: t.textSecondary }]}>THE PAPER LAB · LOCAL ILLUSTRATION</Text>
    <Animated.View key={choice?.id ?? 'sheet'} entering={systemReduced || reduceMotion ? undefined : FadeIn.duration(420)}
      accessible accessibilityLabel={`Paper stage: ${choice?.title ?? 'One unshaped sheet'}`}>
      <Svg width="100%" height={event.phase === 'entry' ? 170 : 120} viewBox="0 0 320 180" accessible={false}>
        <Path d={shapes[choice?.id ?? 'sheet']} fill={choice?.id === 'spiral' ? 'none' : t.background}
          stroke={t.textPrimary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </Animated.View>
    <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{choice?.title ?? 'One sheet. Three futures.'}</Text>
    <Text style={[styles.body, { color: t.textSecondary }]}>
      {choice?.effect ?? (event.phase === 'reveal' || event.phase === 'finished' ? 'No local ballot was confirmed. The sheet stays unchanged.' : 'Your choice will change the shape and the creative constraint.')}
    </Text>
  </View>;
}
const styles = StyleSheet.create({
  stage: { padding: 20, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  eyebrow: { ...typeScale.caption, lineHeight: 18, letterSpacing: 1 },
  title: { ...typeScale.title }, body: { ...typeScale.body },
});
