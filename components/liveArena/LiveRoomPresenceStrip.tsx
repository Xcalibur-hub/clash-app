/**
 * Compact real-member strip: initials chips + optional own stance cue.
 * Does not repeat Room N / count (those live in the header meta line).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArenaRoomPresence, Stance } from '../../services/liveArenaService';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { STANCE_LABEL } from './liveArenaStyles';

export interface LiveRoomPresenceStripProps {
  people: readonly ArenaRoomPresence[];
  participantCount: number;
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
  const shown = people.slice(0, 6);
  const overflow = Math.max(0, participantCount - shown.length);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {shown.map((person) => (
          <View key={person.id} style={styles.chip}>
            <Avatar name={person.name} tint={person.avatarTint} size={30} />
            <Text
              allowFontScaling={false}
              style={[styles.label, { color: person.isViewer ? t.textPrimary : t.textMuted }]}
              numberOfLines={1}
            >
              {person.isViewer ? 'YOU' : person.handle.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        ))}
        {overflow > 0 ? (
          <Text allowFontScaling={false} style={[styles.more, { color: t.textMuted }]}>
            +{overflow}
          </Text>
        ) : null}
      </View>
      {viewerRole === 'debater' && viewerStance ? (
        <Text allowFontScaling={false} style={[styles.you, { color: t.textMuted }]}>
          You · {STANCE_LABEL[viewerStance]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: { alignItems: 'center', gap: 3, width: 40 },
  label: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  more: { ...typeScale.caption, fontSize: 12, fontWeight: '800', paddingBottom: 14 },
  you: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
