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
  /**
   * Own-only Arena facet scores from `get_my_arena_reputation`.
   * Omit when unavailable — never invent zeros from a failed fetch.
   */
  facets?: Readonly<Record<string, number>>;
  /** Own-only Arena standing label (NEWCOMER / CONTRIBUTOR / …). */
  standing?: string;
}

const FACET_ORDER = ['DEBATE', 'EVIDENCE', 'TRUST', 'ENTERTAINMENT', 'MIND_IMPACT'] as const;

function facetLine(
  standing: string | undefined,
  facets: Readonly<Record<string, number>> | undefined,
): string | null {
  if (!standing && !facets) return null;
  const parts: string[] = [];
  if (standing) parts.push(standing.replace(/_/g, ' '));
  if (facets) {
    for (const key of FACET_ORDER) {
      const score = facets[key];
      if (typeof score === 'number' && score > 0) {
        parts.push(`${key.replace(/_/g, ' ')} ${score}`);
      }
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Editorial reputation / credibility — not an XP game HUD.
 * Rank label prefers server `rank`; falls back to local rankFor.
 */
export function ReputationBar({
  reputation,
  rank,
  streak = 0,
  facets,
  standing,
}: ReputationBarProps): React.JSX.Element {
  const t = useThemeColors();
  const derived = rankFor(reputation);
  const label = (rank && String(rank).trim().length > 0 ? String(rank) : derived.name).toUpperCase();
  const { next, toNext } = rankProgress(reputation);
  const facetsSummary = facetLine(standing, facets);

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
      {facetsSummary ? (
        <Text allowFontScaling={false} style={[styles.facets, { color: t.textMuted }]}>
          {facetsSummary}
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
  facets: {
    ...typeScale.meta,
    marginTop: 2,
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
