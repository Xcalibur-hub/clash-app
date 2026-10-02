/**
 * Dominant matchup — asymmetric opposing cards with a restrained VS.
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
  sideBMedia?: TakeMedia | null;
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
  sideBMedia = null,
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
        rotationDeg={-2.4}
        offsetX={-8}
        emphasized={active === 'A' || (settled && winnerSide === 'A')}
        diminished={(active === 'B' && !settled) || (settled && winnerSide === 'B')}
        winner={settled && winnerSide === 'A'}
        selectable={canJudge}
        pending={pendingSide === 'A'}
        onSelect={canJudge && onSelectSide ? () => onSelectSide('A') : undefined}
      />
      <View
        style={styles.bridge}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.rule, { backgroundColor: t.borderStrong }]} />
        <Text allowFontScaling={false} style={[styles.bridgeLabel, { color: t.textMuted }]}>
          VS
        </Text>
        <View style={[styles.rule, { backgroundColor: t.borderStrong }]} />
      </View>
      <ClashSideCard
        side="B"
        author={sideB}
        text={sideBText || (sideBMedia ? '' : 'Rebuttal unavailable')}
        media={sideBMedia}
        enterDelay={120}
        rotationDeg={2.6}
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
  wrap: { gap: space.md + 2, paddingTop: space.xs },
  bridge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 2,
    marginVertical: -6,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, maxWidth: 40 },
  bridgeLabel: {
    ...typeScale.caption,
    fontWeight: '700',
    letterSpacing: 1.6,
    fontSize: 11,
  },
});
