import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { accent, ink, space, typeScale } from '../../theme';
import { Avatar } from '../shared/Avatar';

export interface TakeCardHeaderProps {
  author: User;
  take: Take;
  isViewer: boolean;
  now: number;
}

/**
 * Author row: Avatar (36px) + @handle + "· HoodName · 2h" in muted text.
 */
export function TakeCardHeader({ author, take, isViewer }: TakeCardHeaderProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Avatar name={author.name} tint={author.tint} size={36} />
      <View style={styles.names}>
        <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
          {`@${author.handle}`}
          {isViewer ? <Text style={styles.you}>{'  YOU'}</Text> : null}
        </Text>
        <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
          {`· ${HOOD_LABEL[take.hood]}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  names: { flex: 1, gap: 2 },
  handle: { ...typeScale.subtitle, color: ink.primary, fontWeight: '600' },
  you: { ...typeScale.caption, color: accent.a },
  meta: { ...typeScale.subtitle, color: ink.subtitle },
});
