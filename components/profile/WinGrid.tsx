import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WinEntry } from '../../store';
import { card, duel, ink, radius, space, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { TrophyIcon } from '../shared/icons';

export interface WinGridProps {
  wins: readonly WinEntry[];
  onPress: (takeId: string) => void;
}

/**
 * The Wins tab as an Instagram-style 3-column grid (PRD §19): one square per
 * verdict — side colour, jury score, reputation earned.
 */
export function WinGrid({ wins, onPress }: WinGridProps): React.JSX.Element {
  return (
    <View style={s.grid}>
      {wins.map((entry) => {
        const sideColor = entry.result.winningSide === 'A' ? duel.a : duel.b;
        const open = (): void => {
          hapticPress();
          onPress(entry.take.id);
        };
        return (
          <Pressable
            key={entry.result.clashId}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={`Won ${entry.result.score.a} to ${entry.result.score.b}: ${entry.take.text}`}
            style={s.tile}
          >
            <TrophyIcon size={14} color={sideColor} strokeWidth={2.4} />
            <Text allowFontScaling={false} style={[s.score, { color: sideColor }]}>
              {`${entry.result.score.a}–${entry.result.score.b}`}
            </Text>
            <Text allowFontScaling={false} style={s.meta}>
              {`+${entry.result.reputation} REP`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tile: {
    minWidth: '31%',
    flexGrow: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  score: { ...typeScale.cardTitle, fontWeight: '800' },
  meta: { ...typeScale.caption, color: ink.tertiary },
});
