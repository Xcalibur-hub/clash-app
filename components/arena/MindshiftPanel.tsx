import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useMindshift } from '../../hooks/useMindshift';
import { MINDSHIFT_MIN_COMPLETED, type Stance } from '../../services/mindshiftService';
import { space, typeScale, useThemeColors } from '../../theme';
import { StanceChoiceRow } from './StanceChoiceRow';

const LABELS: Record<Stance, string> = {
  AGREE: 'Agree',
  UNSURE: 'Unsure',
  DISAGREE: 'Disagree',
};

export interface MindshiftPanelProps {
  takeId: string;
  /** After a ballot or a settled Clash, offer the final-stance prompt. */
  offerFinal?: boolean;
}

/**
 * Mindshift as a conversation beat — not a survey card.
 * Aggregates only after final stance + server threshold (anti-anchoring intact).
 */
export function MindshiftPanel({ takeId, offerFinal = false }: MindshiftPanelProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { stance, stats, busy, recordInitial, recordFinal } = useMindshift(takeId);

  const initial = stance?.initialStance ?? null;
  const final = stance?.finalStance ?? null;
  const showFinalPrompt = offerFinal && initial !== null && final === null;
  const showResult = final !== null;
  const canShowAggregate =
    showResult &&
    stats !== null &&
    stats.completedParticipants >= MINDSHIFT_MIN_COMPLETED &&
    stats.changedPercent !== null;

  return (
    <View style={styles.wrap}>
      {initial === null ? (
        <StanceChoiceRow
          prompt="Where do you stand?"
          disabled={busy}
          onChoose={(next) => void recordInitial(next)}
        />
      ) : !showResult ? (
        <View style={styles.held}>
          <Text allowFontScaling={false} style={[styles.heldLabel, { color: t.textMuted }]}>
            YOUR STANCE
          </Text>
          <Text allowFontScaling={false} style={[styles.heldValue, { color: t.textPrimary }]}>
            {LABELS[initial]}
          </Text>
        </View>
      ) : null}

      {showFinalPrompt ? (
        <StanceChoiceRow
          prompt="Where do you stand now?"
          disabled={busy}
          onChoose={(next) => void recordFinal(next)}
        />
      ) : null}

      {showResult && initial && final ? (
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(220)}
          style={styles.journey}
        >
          <View style={styles.journeyCol}>
            <Text allowFontScaling={false} style={[styles.journeyLabel, { color: t.textMuted }]}>
              YOU STARTED
            </Text>
            <Text allowFontScaling={false} style={[styles.journeyValue, { color: t.textSecondary }]}>
              {LABELS[initial].toUpperCase()}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.arrow, { color: t.borderStrong }]}>
            ↓
          </Text>
          <View style={styles.journeyCol}>
            <Text allowFontScaling={false} style={[styles.journeyLabel, { color: t.textMuted }]}>
              YOU ENDED
            </Text>
            <Text allowFontScaling={false} style={[styles.journeyValue, { color: t.textPrimary }]}>
              {LABELS[final].toUpperCase()}
            </Text>
          </View>

          {canShowAggregate ? (
            <Animated.View entering={reduced ? undefined : FadeIn.delay(80).duration(200)} style={styles.aggregate}>
              <Text allowFontScaling={false} style={[styles.pct, { color: t.textPrimary }]}>
                {stats!.changedPercent}%
              </Text>
              <Text allowFontScaling={false} style={[styles.pctSub, { color: t.textMuted }]}>
                changed their mind
              </Text>
            </Animated.View>
          ) : showResult && stats !== null && stats.completedParticipants < MINDSHIFT_MIN_COMPLETED ? (
            <Text allowFontScaling={false} style={[styles.low, { color: t.textMuted }]}>
              Not enough responses yet
            </Text>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingVertical: space.xs },
  held: { gap: 2 },
  heldLabel: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heldValue: {
    ...typeScale.label,
    fontSize: 15,
    fontWeight: '700',
  },
  journey: { gap: space.sm },
  journeyCol: { gap: 2 },
  journeyLabel: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  journeyValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  arrow: {
    fontSize: 16,
    fontWeight: '600',
    paddingLeft: 2,
  },
  aggregate: {
    marginTop: space.xs,
    gap: 2,
  },
  pct: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pctSub: { ...typeScale.meta, fontSize: 13 },
  low: { ...typeScale.meta, fontSize: 12, marginTop: 2 },
});
