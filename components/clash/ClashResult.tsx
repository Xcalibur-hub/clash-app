import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { ClashResult as ClashResultModel } from '../../store';
import { accent, ink, space, typeScale } from '../../theme';
import { Chip } from '../shared/Chip';
import { GlowButton } from '../shared/GlowButton';
import { ArrowRightIcon, GavelIcon } from '../shared/icons';
import { sideTone } from './duelPalette';
import { Particles } from './Particles';
import { ResultRewards } from './ResultRewards';
import { ScoreCircles } from './ScoreCircles';

export interface ClashResultProps {
  result: ClashResultModel;
  /** Handle of the creator who won the clash. */
  winnerHandle: string;
  winnerLabel: string;
  onDone: () => void;
  onNextClash?: () => void;
}

/**
 * The verdict (PRD §12): expressive after the vote, but restrained — every
 * entrance is a sub-200ms fade and the screen ends on the retention hook,
 * "Next Clash →", with only a quiet link back to the Arena beside it.
 */
export function ClashResult({
  result,
  winnerHandle,
  winnerLabel,
  onDone,
  onNextClash,
}: ClashResultProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Particles color={sideTone(result.winningSide).tone} trigger={result.resolvedAt} />

      <Animated.View entering={FadeInDown.duration(160)} style={styles.headline}>
        <Text allowFontScaling={false} style={styles.eyebrow}>
          THE JURY HAS SPOKEN
        </Text>
        <Text allowFontScaling={false} style={styles.title}>
          {`${winnerLabel} WON`}
        </Text>
        <Text allowFontScaling={false} style={styles.handle}>
          {`@${winnerHandle} takes the clash`}
        </Text>
      </Animated.View>

      <ScoreCircles score={result.score} winningSide={result.winningSide} />

      <View style={styles.scoreFooter}>
        <Chip label={result.verdict} icon={GavelIcon} tone="gold" />
      </View>

      <Animated.View entering={FadeInDown.delay(80).duration(180)}>
        <ResultRewards result={result} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(140).duration(180)} style={styles.actions}>
        {onNextClash ? (
          <GlowButton
            label="Next Clash →"
            icon={ArrowRightIcon}
            tone="ink"
            onPress={onNextClash}
            style={styles.nextButton}
            accessibilityLabel="Judge the next clash"
          />
        ) : null}
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Back to the Arena"
          style={styles.back}
        >
          <Text allowFontScaling={false} style={styles.backText}>
            BACK TO ARENA
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, paddingBottom: space.xl },
  headline: { alignItems: 'center', gap: space.xs },
  eyebrow: { ...typeScale.eyebrow, color: accent.gold, letterSpacing: 1.8 },
  title: { ...typeScale.title, fontSize: 32, fontWeight: '800', color: ink.primary },
  handle: { ...typeScale.body, color: ink.secondary, textAlign: 'center' },
  scoreFooter: { alignItems: 'center' },
  actions: { gap: space.md },
  nextButton: { alignSelf: 'stretch' },
  back: { alignSelf: 'center', paddingVertical: space.xs, paddingHorizontal: space.md },
  backText: { ...typeScale.button, fontSize: 12, color: ink.tertiary, letterSpacing: 1.4 },
});
