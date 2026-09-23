import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { accent, ink, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { Avatar } from '../shared/Avatar';

export interface TakeCardHeaderProps {
  author: User;
  take: Take;
  isViewer: boolean;
  now: number;
}

/**
 * Author row (reference "Arena Home"): @handle, the hood it landed in, and the
 * 24-hour countdown — "2h 41m left".
 */
export function TakeCardHeader({ author, take, isViewer, now }: TakeCardHeaderProps): React.JSX.Element {
  const expiring = take.expiresAt - now < 60 * 60 * 1000;

  return (
    <View style={styles.wrap}>
      <Avatar name={author.name} tint={author.tint} size={38} />
      <View style={styles.names}>
        <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
          {`@${author.handle}`}
          {isViewer ? <Text style={styles.you}>{'  YOU'}</Text> : null}
        </Text>
        <Text allowFontScaling={false} style={styles.hood} numberOfLines={1}>
          {HOOD_LABEL[take.hood]}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.timer, expiring && styles.timerUrgent]}>
        {timeLeftLabel(take.expiresAt, now)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1, gap: 1 },
  handle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  you: { ...typeScale.caption, color: accent.a },
  hood: { ...typeScale.meta, color: ink.tertiary },
  timer: { ...typeScale.data, fontSize: 11.5, color: ink.tertiary },
  timerUrgent: { color: accent.danger },
});
