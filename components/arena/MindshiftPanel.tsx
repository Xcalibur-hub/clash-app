import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMindshift } from '../../hooks/useMindshift';
import { MINDSHIFT_MIN_COMPLETED, type Stance } from '../../services/mindshiftService';
import { card, ink, radius, space, typeScale } from '../../theme';
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
 * Compact Mindshift chrome. Aggregate numbers are rendered only after this
 * viewer has a final stance, and only when the server has enough completed
 * pairs (`MINDSHIFT_MIN_COMPLETED`). The percentage is never computed locally.
 */
export function MindshiftPanel({ takeId, offerFinal = false }: MindshiftPanelProps): React.JSX.Element {
  const { stance, stats, busy, recordInitial, recordFinal } = useMindshift(takeId);

  const initial = stance?.initialStance ?? null;
  const final = stance?.finalStance ?? null;
  const showFinalPrompt = offerFinal && initial !== null && final === null;
  const showResult = final !== null;

  return (
    <View style={styles.box}>
      {initial === null ? (
        <StanceChoiceRow
          prompt="Where do you stand?"
          disabled={busy}
          onChoose={(next) => void recordInitial(next)}
        />
      ) : (
        <Text allowFontScaling={false} style={styles.yours}>
          Your stance: {LABELS[initial]}
        </Text>
      )}

      {showFinalPrompt ? (
        <StanceChoiceRow
          prompt="Where do you stand now?"
          disabled={busy}
          onChoose={(next) => void recordFinal(next)}
        />
      ) : null}

      {showResult && stats !== null && stats.completedParticipants < MINDSHIFT_MIN_COMPLETED ? (
        <Text allowFontScaling={false} style={styles.low}>Not enough responses yet</Text>
      ) : null}

      {showResult && stats !== null && stats.completedParticipants >= MINDSHIFT_MIN_COMPLETED && stats.changedPercent !== null ? (
        <View style={styles.result}>
          <Text allowFontScaling={false} style={styles.pct}>{stats.changedPercent}% Mindshift</Text>
          <Text allowFontScaling={false} style={styles.sub}>changed their perspective</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  yours: { ...typeScale.meta, color: ink.secondary },
  low: { ...typeScale.meta, color: ink.tertiary },
  result: { gap: 2 },
  pct: { ...typeScale.section, color: ink.primary, fontSize: 17 },
  sub: { ...typeScale.meta, color: ink.tertiary },
});
