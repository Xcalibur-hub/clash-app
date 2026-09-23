import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { duel, ink, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';
import { Chip } from './Chip';
import { CrownIcon } from './icons';

export interface ClashScore {
  a: number;
  b: number;
}

export interface ClashCardFooterProps {
  result?: { score: ClashScore; winningSide: 'A' | 'B' };
  /** Engagement tag, e.g. "1,530 REACTIONS". */
  tag?: string;
  engagement?: number;
  engagementLabel?: string;
  shares?: number;
  clashes: number;
  reactions: number;
}

/** Result chips, the verdict line and the engagement line of a snapshot card. */
export function ClashCardFooter({
  result,
  tag,
  engagement,
  engagementLabel,
  shares,
  clashes,
  reactions,
}: ClashCardFooterProps): React.JSX.Element {
  return (
    <>
      {result ? (
        <View style={styles.footer}>
          <View style={styles.resultChips}>
            <Chip
              label={`${result.score.a} — ${result.score.b}`}
              tone={result.winningSide === 'A' ? 'violet' : 'b'}
              icon={CrownIcon}
              data
            />
            {tag ? <Chip label={tag} tone="neutral" /> : null}
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.winLabel, { color: result.winningSide === 'A' ? duel.a : duel.b }]}
          >
            {`TAKE ${result.winningSide} WON`}
          </Text>
        </View>
      ) : null}
      <Text allowFontScaling={false} style={[styles.engagement, { color: 'rgba(247,247,250,0.44)' }]}>
        {engagementLabel ?? `${formatReputation(engagement ?? clashes * 12 + reactions)} engaged`}
        {shares != null ? ` · ${formatReputation(shares)} shares` : ''}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  resultChips: {
    flexDirection: 'row',
    gap: space.xs,
  },
  winLabel: {
    ...typeScale.data,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  engagement: {
    ...typeScale.caption,
    fontSize: 10,
  },
});