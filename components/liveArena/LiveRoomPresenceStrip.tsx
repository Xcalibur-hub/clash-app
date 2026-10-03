/**
 * Visible participant presence — avatar stack + count + overflow.
 * Real authors only. No stance aggregates.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ArenaAuthor, Stance } from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { LivePulse } from './LivePulse';
import { softFill, STANCE_LABEL } from './liveArenaStyles';

export interface LiveRoomPresenceStripProps {
  people: readonly ArenaAuthor[];
  participantCount: number;
  viewerStance?: Stance | null;
  viewerRole?: 'debater' | 'spectator' | null;
  roomIndex?: number | null;
  emphasized?: boolean;
}

export function LiveRoomPresenceStrip({
  people,
  participantCount,
  viewerStance = null,
  viewerRole = null,
  roomIndex = null,
  emphasized = false,
}: LiveRoomPresenceStripProps): React.JSX.Element {
  const t = useThemeColors();
  const shown = people.slice(0, emphasized ? 5 : 4);
  const overflow = Math.max(0, participantCount - shown.length);
  const avatarSize = emphasized ? 28 : 24;

  return (
    <View style={[styles.wrap, emphasized && styles.wrapEmph, { backgroundColor: softFill(t) }]}>
      <View style={styles.avatars}>
        {shown.map((person, i) => (
          <View key={`${person.id}-${i}`} style={i > 0 ? { marginLeft: -10 } : undefined}>
            <Avatar name={person.name} tint={person.avatarTint} size={avatarSize} />
            {i === 0 && emphasized ? (
              <View style={styles.pulseDot}>
                <LivePulse size={5} />
              </View>
            ) : null}
          </View>
        ))}
        {overflow > 0 ? (
          <View
            style={[
              styles.overflow,
              {
                marginLeft: shown.length > 0 ? -8 : 0,
                backgroundColor: t.surfaceMuted,
                borderColor: t.border,
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              },
            ]}
          >
            <Text allowFontScaling={false} style={[styles.overflowText, { color: t.textSecondary }]}>
              +{overflow}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metaCol}>
        <Text allowFontScaling={false} style={[styles.count, { color: t.textPrimary }]}>
          {participantCount} here
          {roomIndex != null && viewerRole === 'spectator' ? ` · Room ${roomIndex}` : ''}
        </Text>
        {viewerRole === 'spectator' ? (
          <Text allowFontScaling={false} style={[styles.you, { color: t.textMuted }]}>
            Watching
            {roomIndex != null ? ` Room ${roomIndex}` : ''}
          </Text>
        ) : viewerStance ? (
          <Text allowFontScaling={false} style={[styles.you, { color: t.textMuted }]}>
            You · {STANCE_LABEL[viewerStance]}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignSelf: 'stretch',
  },
  wrapEmph: {
    paddingVertical: 10,
    borderRadius: 18,
  },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  pulseDot: {
    position: 'absolute',
    right: -2,
    bottom: -1,
  },
  overflow: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  overflowText: { ...typeScale.caption, fontSize: 10, fontWeight: '800' },
  metaCol: { flex: 1, gap: 1, minWidth: 80 },
  count: { ...typeScale.caption, fontSize: 13, fontWeight: '800' },
  you: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
