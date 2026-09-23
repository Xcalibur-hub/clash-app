/** Reusable clash card for the Daily Drop: two takes, the jury score, engagement. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Take, User } from '../../store';
import { ink } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { ClashCardFooter, type ClashScore } from '../shared/ClashCardFooter';
import { ClashSideRow } from '../shared/ClashSideRow';
import { clashSnapshotStyles as styles } from './clashSnapshotStyles';

export interface ClashSnapshotCardProps {
  take: Take;
  author: User;
  challenger: User;
  challengerText: string;
  /** Card eyebrow — the shelf this clash belongs to. */
  title: string;
  /** Position chip, e.g. "#01". */
  number?: string;
  /** Engagement tag, e.g. "1,530 REACTIONS". */
  tag?: string;
  engagement?: number;
  engagementLabel?: string;
  shares?: number;
  result?: { score: ClashScore; winningSide: 'A' | 'B' };
  onOpenClash: () => void;
}
import { CrownIcon } from '../shared/icons';

export interface ClashSnapshotCardProps {
  take: Take;
  author: User;
  challenger: User;
  challengerText: string;
  /** Card eyebrow — the shelf this clash belongs to. */
  title: string;
  /** Position chip, e.g. "#01". */
  number?: string;
  /** Engagement tag, e.g. "1,530 REACTIONS". */
  tag?: string;
  engagement?: number;
  engagementLabel?: string;
  shares?: number;
  result?: { score: { a: number; b: number }; winningSide: 'A' | 'B' };
  onOpenClash: () => void;
}

export function ClashSnapshotCard({
  take,
  author,
  challenger,
  challengerText,
  title,
  number,
  tag,
  engagement,
  engagementLabel,
  shares,
  result,
  onOpenClash,
}: ClashSnapshotCardProps): React.JSX.Element {
  const tap = (): void => {
    hapticPress();
    onOpenClash();
  };

  return (
    <Pressable
      onPress={tap}
      accessibilityRole="button"
      accessibilityLabel={`${number ?? title}: ${take.text}`}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.number}>
          {number != null ? (
            <Text allowFontScaling={false} style={styles.numberText}>{number}</Text>
          ) : (
            <Text allowFontScaling={false} style={[styles.label, { color: result ? ink.secondary : ink.tertiary }]}>
              {result ? `${result.score.a} — ${result.score.b}` : 'LIVE'}
            </Text>
          )}
        </View>
        <Text allowFontScaling={false} style={styles.label}>{title}</Text>
      </View>

      <ClashSideRow
        side="A"
        name={author.name}
        tint={author.tint}
        handle={author.handle}
        quote={take.text}
      />

      <ClashSideRow
        side="B"
        name={challenger.name}
        tint={challenger.tint}
        handle={challenger.handle}
        quote={challengerText}
      />

      <ClashCardFooter
        result={result}
        tag={tag}
        engagement={engagement}
        engagementLabel={engagementLabel}
        shares={shares}
        clashes={take.clashes}
        reactions={take.reactions}
      />
    </Pressable>
  );
}