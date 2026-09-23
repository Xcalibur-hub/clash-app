import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { card, ink, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { CrownIcon } from '../shared/icons';

export interface CreatorRowProps {
  position: number;
  user: User;
  /** Highlights the viewer's own row in the leaderboard. */
  isViewer?: boolean;
}

/** One name on the Hall of Fame creators leaderboard. */
export function CreatorRow({ position, user, isViewer = false }: CreatorRowProps): React.JSX.Element {
  return (
    <View style={[styles.row, isViewer ? styles.rowSelf : null]}>
      <Text allowFontScaling={false} style={styles.position}>
        {`#${String(position).padStart(2, '0')}`}
      </Text>
      <Avatar name={user.name} tint={user.tint} size={38} />
      <View style={styles.info}>
        <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
          {`@${user.handle}${isViewer ? '  YOU' : ''}`}
        </Text>
        <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
          {`${user.rank} · ${user.wins} wins`}
        </Text>
      </View>
      <Chip label={formatReputation(user.reputation)} icon={CrownIcon} tone="gold" data />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  rowSelf: { borderColor: 'rgba(255,200,97,0.45)' },
  position: { ...typeScale.data, fontSize: 12, color: ink.quaternary },
  info: { flex: 1, gap: 1 },
  handle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  meta: { ...typeScale.meta, color: ink.tertiary },
});
