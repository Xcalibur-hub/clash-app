import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';
import { formatReputation } from '../../utils/format';
import { rankFor, rankProgress } from '../../utils/reputation';
import type { RankName } from '../../store/types';

export interface ReputationBarProps {
  reputation: number;
  /** Server-authoritative rank string when available. */
  rank?: RankName | string;
  streak?: number;
}

/**
 * Editorial reputation / credibility — not an XP game HUD.
 * Rank label prefers server `rank`; falls back to local rankFor.
 */
export function ReputationBar({ reputation, rank, streak = 0 }: ReputationBarProps): React.JSX.Element {
  const t = useThemeColors();
  const derived = rankFor(reputation);
  const label = (rank && String(rank).trim().length > 0 ? String(rank) : derived.name).toUpperCase();
  const { next, toNext } = rankProgress(reputation);

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={`Reputation ${formatReputation(reputation)}, rank ${label}`}
    >
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        REPUTATION
      </Text>
      <Text allowFontScaling={false} style={[styles.score, { color: t.textPrimary }]}>
        {formatReputation(reputation)}
      </Text>
      <Text allowFontScaling={false} style={[styles.rank, { color: t.textPrimary }]}>
        {label}
      </Text>
      {streak > 0 ? (
        <Text allowFontScaling={false} style={[styles.streak, { color: t.textMuted }]}>
          {streak} day streak
        </Text>
      ) : null}

      <View style={[styles.rule, { backgroundColor: t.border }]} />

      {next ? (
        <Text allowFontScaling={false} style={[styles.next, { color: t.textMuted }]}>
          {formatReputation(toNext)} to {next.name}
        </Text>
      ) : (
        <Text allowFontScaling={false} style={[styles.next, { color: t.textMuted }]}>
          {derived.blurb}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  kicker: {
    ...typeScale.caption,
    letterSpacing: 0.8,
  },
  score: {
    ...typeScale.display,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.2,
  },
  rank: {
    ...typeScale.section,
    letterSpacing: 0.4,
  },
  streak: {
    ...typeScale.meta,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  next: {
    ...typeScale.meta,
  },
});
