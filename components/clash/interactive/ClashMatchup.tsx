/**
 * Dominant matchup — asymmetric opposing cards with CLASH sword bridge.
 * Confrontation stage: judgement energy, not a chat list.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side, TakeMedia, User } from '../../../store';
import { space, useThemeColors } from '../../../theme';
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
  const dark = t.scheme === 'dark';

  return (
    <View style={styles.wrap}>
      <ClashSideCard
        side="A"
        author={sideA}
        text={sideAText}
        media={sideAMedia}
        enterDelay={40}
        rotationDeg={-2.8}
        offsetX={-10}
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
        <View style={[styles.rule, { backgroundColor: dark ? '#BCA1D8' : '#BA91CF' }]} />
        <View style={[styles.vsPlate, { backgroundColor: dark ? '#F6D87B' : '#FFDE76' }]}>
          <Text allowFontScaling={false} style={styles.vsText}>VS</Text>
        </View>
        <View style={[styles.rule, { backgroundColor: dark ? '#E9A58F' : '#E59B85' }]} />
      </View>
      <ClashSideCard
        side="B"
        author={sideB}
        text={sideBText || (sideBMedia ? '' : 'Rebuttal unavailable')}
        media={sideBMedia}
        enterDelay={120}
        rotationDeg={3.0}
        offsetX={12}
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
  wrap: { gap: space.md + 4, paddingTop: space.xs },
  bridge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 2,
    marginVertical: -15,
    zIndex: 2,
  },
  rule: { flex: 1, height: 2, maxWidth: 76 },
  vsPlate: {
    width: 62,
    height: 62,
    borderRadius: 22,
    transform: [{ rotate: '-9deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#2B202A',
  },
  vsText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1.8,
    color: '#2B202A',
    transform: [{ rotate: '9deg' }],
  },
});
