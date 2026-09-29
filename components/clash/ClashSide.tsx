import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Side, User } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { sideTone } from './duelPalette';

export interface ClashSideProps {
  side: Side;
  /** Null while Blind mode hides identity. */
  author: User | null;
  text: string;
  winner?: boolean;
  faded?: boolean;
}

/** One side of the Clash — the argument itself is the hero; colour is restrained. */
export function ClashSide({ side, author, text, winner = false, faded = false }: ClashSideProps): React.JSX.Element {
  const { tone, soft, line } = sideTone(side);
  const hidden = author === null;
  return (
    <View
      style={[styles.card, { borderColor: winner ? tone : line, backgroundColor: soft, opacity: faded ? 0.55 : 1 }]}
      accessibilityLabel={
        hidden
          ? `Side ${side}. Participant identities hidden until judgement. ${text}`
          : `Side ${side}. ${author.name}. ${text}`
      }
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.sideLabel, { color: tone }]}>
          SIDE {side}
        </Text>
        {winner ? (
          <Text allowFontScaling={false} style={[styles.winner, { color: tone }]}>
            WINNER
          </Text>
        ) : null}
      </View>
      {hidden ? (
        <Text allowFontScaling={false} style={styles.hiddenName}>
          Participant {side}
        </Text>
      ) : (
        <View style={styles.identity}>
          <Avatar name={author.name} tint={author.tint} size={30} />
          <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
            @{author.handle}
          </Text>
        </View>
      )}
      <Text allowFontScaling style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.card, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sideLabel: { ...typeScale.caption, letterSpacing: 0.6, fontWeight: '700' },
  winner: { ...typeScale.caption, letterSpacing: 0.6, fontWeight: '700' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  handle: { ...typeScale.label, color: ink.primary, flexShrink: 1 },
  hiddenName: { ...typeScale.label, color: ink.secondary },
  text: { fontSize: 16, lineHeight: 23, fontWeight: '500', color: ink.primary },
});
