import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { clashStyles as s } from './clashStyles';
import { GlassCard } from '../shared/GlassCard';
import { VerifiedIcon } from '../shared/icons';
import { accent, duration, radius, space } from '../../theme';

/**
 * The beat between filing a ballot and the jury reveal (spec §8): the ballot is
 * sealed, the tally is running, and the viewer is told exactly what happens next.
 */
export function RecordedBanner(): React.JSX.Element {
  return (
    <Animated.View entering={FadeInDown.duration(duration.base)}>
      <GlassCard level="strong" corner={radius.card} contentStyle={s.recordedInner}>
        <View style={s.recordedRow}>
          <Animated.View entering={ZoomIn.duration(360)} style={styles.check}>
            <VerifiedIcon size={20} color={accent.mint} strokeWidth={2.4} />
          </Animated.View>
          <Text allowFontScaling={false} style={s.recordedTitle}>
            Your judgement has been recorded.
          </Text>
        </View>
        <Text allowFontScaling={false} style={s.recordedBody}>
          Nine jurors voted independently. Tallying now…
        </Text>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(67,214,160,0.45)',
    backgroundColor: 'rgba(67,214,160,0.14)',
    marginBottom: space.xs,
  },
});
