/**
 * Compact presence strip — avatars + count. No live stance aggregates (privacy).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArenaAuthor, Stance } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { softFill, STANCE_LABEL } from './liveArenaStyles';

export interface LiveRoomPresenceStripProps {
  people: readonly ArenaAuthor[];
  participantCount: number;
  /** Viewer's own stance only — never a room split. */
  viewerStance?: Stance | null;
  viewerRole?: 'debater' | 'spectator' | null;
}

export function LiveRoomPresenceStrip({
  people,
  participantCount,
  viewerStance = null,
  viewerRole = null,
}: LiveRoomPresenceStripProps): React.JSX.Element {
  const t = useThemeColors();
  const shown = people.slice(0, 5);

  return (
    <View style={[styles.wrap, { backgroundColor: softFill(t) }]}>
      {shown.length > 0 ? (
        <View style={styles.avatars}>
          {shown.map((person, i) => (
            <Avatar
              key={`${person.id}-${i}`}
              name={person.name}
              tint={person.avatarTint}
              size={24}
              style={i > 0 ? { marginLeft: -8 } : undefined}
            />
          ))}
        </View>
      ) : null}
      <Text allowFontScaling={false} style={[styles.count, { color: t.textSecondary }]}>
        {participantCount} here
      </Text>
      {viewerRole === 'spectator' ? (
        <Text allowFontScaling={false} style={[styles.you, { color: t.textMuted }]}>
          · Watching
        </Text>
      ) : viewerStance ? (
        <Text allowFontScaling={false} style={[styles.you, { color: t.textMuted }]}>
          · You · {STANCE_LABEL[viewerStance]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  count: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  you: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
});
