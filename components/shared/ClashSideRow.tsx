import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { duel, ink, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';

export interface ClashSideRowProps {
  side: 'A' | 'B';
  name: string;
  tint: string;
  handle: string;
  quote: string;
}

/** One duelling side inside a clash snapshot card. */
export function ClashSideRow({ side, name, tint, handle, quote }: ClashSideRowProps): React.JSX.Element {
  const tone = side === 'A' ? duel.a : duel.b;
  const line = side === 'A' ? duel.aLine : duel.bLine;
  return (
    <View style={styles.side}>
      <View style={[styles.sideChip, { borderColor: line }]}>
        <Text allowFontScaling={false} style={[styles.sideLabel, { color: tone }]}>
          {side}
        </Text>
      </View>
      <Avatar name={name} tint={tint} size={26} />
      <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
        @{handle}
      </Text>
      <Text allowFontScaling={false} style={styles.quote} numberOfLines={2}>
        {`“${quote}”`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  side: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sideChip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sideLabel: { ...typeScale.caption, fontSize: 10 },
  handle: { ...typeScale.caption, color: ink.tertiary, flexShrink: 0 },
  quote: { ...typeScale.body, color: ink.primary, flex: 1, lineHeight: 20 },
});