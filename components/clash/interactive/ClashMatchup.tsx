/**
 * Dominant matchup — asymmetric opposing cards (no giant VS).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side, TakeMedia, User } from '../../../store';
import { space, typeScale, useThemeColors } from '../../../theme';
import { ClashSideCard } from './ClashSideCard';

export interface ClashMatchupProps {
  sideAText: string;
  sideBText: string;
  sideA: User | null;
  sideB: User | null;
  sideAMedia?: TakeMedia | null;
  selectedSide?: Side | null;
  myBallot?: Side | null;
  settled?: boolean;
  winnerSide?: 'A' | 'B' | 'DRAW' | null;
  canJudge?: boolean;
  pendingSide?: Side | null;
  onSelectSide?: (side: Side) => void;
}

export function ClashMatchup({
  sideAText,
  sideBText,
  sideA,
  sideB,
  sideAMedia = null,
  selectedSide = null,
  myBallot = null,
  settled = false,
  winnerSide = null,
  canJudge = false,
  pendingSide = null,
  onSelectSide,
}: ClashMatchupProps): React.JSX.Element {
  const t = useThemeColors();
  const active = selectedSide ?? myBallot;

  return (
    <View style={styles.wrap}>
      <ClashSideCard
        side="A"
        author={sideA}
        text={sideAText}
        media={sideAMedia}
        enterDelay={40}
        rotationDeg={-2.2}
        offsetX={-6}
        emphasized={active === 'A' || (settled && winnerSide === 'A')}
        diminished={(active === 'B' && !settled) || (settled && winnerSide === 'B')}
        winner={settled && winnerSide === 'A'}
        selectable={canJudge}
        pending={pendingSide === 'A'}
        onSelect={canJudge && onSelectSide ? () => onSelectSide('A') : undefined}
      />
      <View style={styles.bridge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.rule, { backgroundColor: t.borderStrong }]} />
        <Text allowFontScaling={false} style={[styles.bridgeLabel, { color: t.textMuted }]}>
          or
        </Text>
        <View style={[styles.rule, { backgroundColor: t.borderStrong }]} />
      </View>
      <ClashSideCard
        side="B"
        author={sideB}
        text={sideBText || 'Rebuttal unavailable'}
        enterDelay={140}
        rotationDeg={2.4}
        offsetX={10}
        emphasized={active === 'B' || (settled && winnerSide === 'B')}
        diminished={(active === 'A' && !settled) || (settled && winnerSide === 'A')}
        winner={settled && winnerSide === 'B'}
        selectable={canJudge}
        pending={pendingSide === 'B'}
        onSelect={canJudge && onSelectSide ? () => onSelectSide('B') : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingTop: space.xs },
  bridge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 2,
    marginVertical: -4,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, maxWidth: 48 },
  bridgeLabel: { ...typeScale.caption, fontWeight: '600', letterSpacing: 1 },
});
