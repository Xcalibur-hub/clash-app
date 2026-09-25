import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import type { Side, User } from '../../store';
import { glow, ink, radius, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { CrownIcon, VerifiedIcon } from '../shared/icons';
import { sideTone } from './duelPalette';

export interface TakePanelProps {
  side: Side;
  author: User;
  text: string;
  label: string;
  winner?: boolean;
  /** Dims the losing side after the verdict lands. */
  faded?: boolean;
}

/**
 * One half of the duel: A is violet, B is electric blue, and each enters from its
 * own side of the screen.
 */
export function TakePanel({
  side,
  author,
  text,
  label,
  winner = false,
  faded = false,
}: TakePanelProps): React.JSX.Element {
  const { tone, soft, line } = sideTone(side);

  return (
    <Animated.View
      entering={(side === 'A' ? FadeInLeft : FadeInRight).duration(240)}
      style={[
        styles.card,
        {
          borderColor: winner ? tone : line,
          backgroundColor: soft,
          opacity: faded ? 0.5 : 1,
        },
        winner ? glow(tone, 22, 6, 0.4) : null,
      ]}
    >
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.letter, { borderColor: tone, backgroundColor: soft }]}>
            <Text allowFontScaling={false} style={[styles.letterText, { color: tone }]}>
              {side}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.label, { color: tone }]}>
            {label}
          </Text>
        </View>
        {winner ? <Chip label="WINNER" icon={CrownIcon} tone="gold" /> : null}
      </View>

      <View style={styles.identity}>
        <Avatar name={author.name} tint={author.tint} size={34} />
        <View style={styles.names}>
          <Text allowFontScaling={false} style={styles.handle}>{`@${author.handle}`}</Text>
          <Text allowFontScaling={false} style={styles.rank}>
            {`${author.rank} · ${author.wins} wins`}
          </Text>
        </View>
        {author.rank === 'Legend' || author.rank === 'Clash King' ? (
          <VerifiedIcon size={15} color={tone} strokeWidth={2.4} />
        ) : null}
      </View>

      <Text allowFontScaling={false} style={styles.text}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  letter: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: { ...typeScale.data, fontSize: 13, letterSpacing: 0 },
  label: { ...typeScale.caption, letterSpacing: 1.2 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  names: { flex: 1 },
  handle: { ...typeScale.label, color: ink.primary },
  rank: { ...typeScale.meta, color: ink.tertiary, fontSize: 11.5 },
  text: { ...typeScale.takeText, fontSize: 20, lineHeight: 27, color: ink.primary },
});
