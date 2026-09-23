import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { RankName } from '../../store';
import { accent, ease, glassBorder, ink, radius, space, typeScale } from '../../theme';
import { clamp, formatReputation } from '../../utils/format';
import { Chip } from '../shared/Chip';
import { CrownIcon } from '../shared/icons';

export interface RankXpBarProps {
  rankName: RankName;
  rankTitle: string;
  rankedUp: boolean;
  /** 0..1 inside the tier before the clash. */
  progressBefore: number;
  /** 0..1 inside the tier after the clash. */
  progressAfter: number;
  nextRankName: RankName | null;
  toNextRank: number;
}

/**
 * "YOUR RANK" block (spec §10) with the rank XP animation: the bar fills from
 * where the viewer stood to where the clash left them, and on a rank-up it first
 * fills the tier completely before resetting into the new one.
 */
export function RankXpBar({
  rankName,
  rankTitle,
  rankedUp,
  progressBefore,
  progressAfter,
  nextRankName,
  toNextRank,
}: RankXpBarProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? progressAfter : clamp(progressBefore, 0.02, 1));
  const flash = useSharedValue(0);

  React.useEffect(() => {
    if (reduced) {
      fill.value = progressAfter;
      return;
    }
    fill.value = withDelay(
      340,
      rankedUp
        ? withSequence(
            withTiming(1, { duration: 560, easing: ease.out }),
            withTiming(clamp(progressAfter, 0.02, 1), { duration: 420, easing: ease.inOut }),
          )
        : withTiming(clamp(progressAfter, 0.02, 1), { duration: 760, easing: ease.out }),
    );
    if (rankedUp) {
      flash.value = withDelay(
        340,
        withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 620 })),
      );
    }
  }, [fill, flash, progressAfter, rankedUp, reduced]);

  // NOTE: no imported helpers may be called inside this worklet — module imports
  // don't survive worklet serialization and arrive as objects on the UI thread
  // ("clamp is not a function (it is Object)"). Math is a global, so it is safe.
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(fill.value, 0.02), 1) * 100}%`,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.5 }));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <CrownIcon size={15} color={accent.gold} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={styles.eyebrow}>
            YOUR RANK
          </Text>
        </View>
        {rankedUp ? <Chip label="RANK UP" tone="gold" /> : null}
      </View>

      <View style={styles.names}>
        <Text allowFontScaling={false} style={styles.rank}>
          {rankName}
        </Text>
        <Text allowFontScaling={false} style={styles.title}>
          {`“${rankTitle}”`}
        </Text>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
        {rankedUp ? <Animated.View style={[StyleSheet.absoluteFill, styles.flash, glowStyle]} /> : null}
      </View>

      <Text allowFontScaling={false} style={styles.caption}>
        {nextRankName
          ? `${formatReputation(toNextRank)} XP to ${nextRankName}`
          : 'Top of the ladder — nothing left to climb'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingTop: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  names: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  rank: { ...typeScale.cardTitle, color: ink.primary },
  title: { ...typeScale.label, color: accent.gold },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: glassBorder.soft,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: accent.gold,
    shadowColor: accent.gold,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  flash: { backgroundColor: 'rgba(255,200,97,0.35)' },
  caption: { ...typeScale.meta, color: ink.quaternary },
});
