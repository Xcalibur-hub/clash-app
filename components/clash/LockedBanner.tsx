import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { Side } from '../../store/types';
import { clashStyles as s } from './clashStyles';
import { VerifiedIcon } from '../shared/icons';
import { accent, card, duration, radius, space, typeScale } from '../../theme';
import { durationLabel } from '../../utils/format';

export interface LockedBannerProps {
  side: Side;
  expiresAt: number;
  now: number;
}

/**
 * The long beat between the ballot and end-of-day: the vote is locked in, the
 * 9-person jury deliberates at the 9:00 PM drop, and no score is revealed
 * until the clock runs out.
 */
export function LockedBanner({ side, expiresAt, now }: LockedBannerProps): React.JSX.Element {
  return (
    <Animated.View entering={FadeInDown.duration(duration.fast)} style={styles.card}>
      <View style={s.recordedRow}>
        <Animated.View entering={ZoomIn.duration(240)} style={styles.check}>
          <VerifiedIcon size={20} color={accent.mint} strokeWidth={2.4} />
        </Animated.View>
        <View style={styles.copy}>
          <Text allowFontScaling={false} style={s.recordedTitle}>
            VOTE LOCKED IN
          </Text>
          <Text allowFontScaling={false} style={s.recordedBody}>
            Your vote is locked in. The 9-person jury deliberates at 9:00 PM.
          </Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={styles.chip}>
          <Text allowFontScaling={false} style={styles.chipText}>
            {`YOU BACKED TAKE ${side}`}
          </Text>
        </View>
        <View style={[styles.chip, styles.chipGold]}>
          <Text allowFontScaling={false} style={[styles.chipText, styles.chipGoldText]}>
            {`${durationLabel(expiresAt, now)} until Final Judgement`}
          </Text>
        </View>
      </View>
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
  copy: { flex: 1, gap: 2 },
  check: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(67,214,160,0.45)',
    backgroundColor: 'rgba(67,214,160,0.14)',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipGold: {
    borderColor: 'rgba(255,200,97,0.42)',
    backgroundColor: 'rgba(255,200,97,0.12)',
  },
  chipText: { ...typeScale.data, fontSize: 10 },
  chipGoldText: { color: accent.gold },
});
