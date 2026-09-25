import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { clashStyles as s } from './clashStyles';
import { VerifiedIcon } from '../shared/icons';
import { accent, card, duration, radius, space } from '../../theme';

/**
 * The beat between filing a ballot and the reveal (PRD §10): the ballot is
 * recorded, "the jury is deciding…" — and no 9-person mechanics appear until
 * the verdict lands.
 */
export function RecordedBanner(): React.JSX.Element {
  return (
    <Animated.View entering={FadeInDown.duration(duration.fast)} style={styles.card}>
      <View style={s.recordedRow}>
        <Animated.View entering={ZoomIn.duration(240)} style={styles.check}>
          <VerifiedIcon size={20} color={accent.mint} strokeWidth={2.4} />
        </Animated.View>
        <Text allowFontScaling={false} style={s.recordedTitle}>
          JUDGEMENT RECORDED
        </Text>
      </View>
      <Text allowFontScaling={false} style={s.recordedBody}>
        The jury is deciding…
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
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
