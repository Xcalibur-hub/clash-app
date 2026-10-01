/**
 * Dominant matchup — opposing cards without giant VS chrome.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side, User } from '../../../store';
import { space, typeScale, useThemeColors } from '../../../theme';
import { ClashSideCard } from './ClashSideCard';

export interface ClashMatchupProps {
  sideAText: string;
  sideBText: string;
  sideA: User | null;
  sideB: User | null;
  selectedSide?: Side | null;
  myBallot?: Side | null;
  settled?: boolean;
  winnerSide?: 'A' | 'B' | 'DRAW' | null;
}

export function ClashMatchup({
  sideAText,
  sideBText,
  sideA,
  sideB,
  selectedSide = null,
  myBallot = null,
  settled = false,
  winnerSide = null,
}: ClashMatchupProps): React.JSX.Element {
  const t = useThemeColors();
  const active = selectedSide ?? myBallot;

  return (
    <View style={styles.wrap}>
      <ClashSideCard
        side="A"
        author={sideA}
        text={sideAText}
        enterDelay={40}
        rotationDeg={-1.2}
        emphasized={active === 'A' || (settled && winnerSide === 'A')}
        diminished={
          (active === 'B' && !settled) || (settled && winnerSide === 'B')
        }
        winner={settled && winnerSide === 'A'}
      />
      <View style={styles.bridge} accessibilityElementsHidden>
        <View style={[styles.dot, { backgroundColor: t.borderStrong }]} />
        <Text allowFontScaling={false} style={[styles.bridgeLabel, { color: t.textMuted }]}>
          or
        </Text>
        <View style={[styles.dot, { backgroundColor: t.borderStrong }]} />
      </View>
      <ClashSideCard
        side="B"
        author={sideB}
        text={sideBText || 'Rebuttal unavailable'}
        enterDelay={140}
        rotationDeg={1.4}
        emphasized={active === 'B' || (settled && winnerSide === 'B')}
        diminished={
          (active === 'A' && !settled) || (settled && winnerSide === 'A')
        }
        winner={settled && winnerSide === 'B'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  bridge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 2,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  bridgeLabel: { ...typeScale.caption, fontWeight: '600', letterSpacing: 0.8 },
});
