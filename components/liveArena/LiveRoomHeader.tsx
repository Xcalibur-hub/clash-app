/**
 * Live Room event header — topic, LIVE · Room N, countdown, phase rail, presence.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaAuthor, ArenaRoom } from '../../services/liveArenaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';
import { LivePulse } from './LivePulse';
import { LiveRoomPhaseRail } from './LiveRoomPhaseRail';
import { LiveRoomPresenceStrip } from './LiveRoomPresenceStrip';
import { secondsLabel } from './liveArenaStyles';

export interface LiveRoomHeaderProps {
  room: ArenaRoom;
  paddingTop: number;
  roomIndex?: number | null;
  presence?: readonly ArenaAuthor[];
  onBack: () => void;
}

export function LiveRoomHeader({
  room,
  paddingTop,
  roomIndex = null,
  presence = [],
  onBack,
}: LiveRoomHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const live =
    room.status === 'OPEN' || room.status === 'FINAL_ARGUMENTS' || room.status === 'JUDGING';

  const countdown =
    room.status === 'FINAL_ARGUMENTS' && room.secondsToJudging > 0
      ? secondsClock(room.secondsToJudging)
      : room.secondsRemaining > 0
        ? secondsClock(room.secondsRemaining)
        : null;

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + space.xs, backgroundColor: t.background }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => {
            hapticTap();
            onBack();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <BackIcon size={20} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text
            allowFontScaling={false}
            numberOfLines={2}
            style={[styles.title, { color: t.textPrimary }]}
          >
            {room.topic.title}
          </Text>
          <View style={styles.liveRow}>
            {live ? <LivePulse /> : null}
            <Text allowFontScaling={false} style={[styles.liveMeta, { color: t.textMuted }]}>
              {live ? 'LIVE' : room.status === 'SETTLED' ? 'SETTLED' : 'ROOM'}
              {roomIndex != null ? ` · Room ${roomIndex}` : ''}
            </Text>
            {countdown ? (
              <Text allowFontScaling={false} style={[styles.liveMeta, { color: t.textSecondary }]}>
                · {countdown}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <LiveRoomPhaseRail status={room.status} />

      <LiveRoomPresenceStrip
        people={presence}
        participantCount={room.participantCount}
        viewerStance={room.viewer?.stance ?? null}
        viewerRole={room.viewer?.role ?? null}
      />
    </View>
  );
}

/** mm:ss for urgency windows; falls back for longer remainders. */
export function secondsClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe >= 3600) return `${secondsLabel(safe)} left`;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  back: {
    width: 36,
    height: 36,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { flex: 1, gap: 4, paddingTop: 4 },
  title: {
    ...typeScale.section,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: -0.35,
    textTransform: 'uppercase',
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  liveMeta: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
