/**
 * Compact Live Room header — conversation chrome, not a dashboard.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaRoom } from '../../services/liveArenaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';
import { LivePulse } from './LivePulse';
import { secondsLabel, STANCE_LABEL } from './liveArenaStyles';

export interface LiveRoomHeaderProps {
  room: ArenaRoom;
  paddingTop: number;
  onBack: () => void;
}

export function LiveRoomHeader({
  room,
  paddingTop,
  onBack,
}: LiveRoomHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const live =
    room.status === 'OPEN' || room.status === 'FINAL_ARGUMENTS' || room.status === 'JUDGING';

  const countdown =
    room.status === 'FINAL_ARGUMENTS' && room.secondsToJudging > 0
      ? secondsClock(room.secondsToJudging)
      : room.secondsRemaining > 0
        ? `${secondsLabel(room.secondsRemaining)} left`
        : null;

  const stanceChip =
    room.viewer?.role === 'spectator'
      ? 'Watching'
      : room.viewer?.stance
        ? `You · ${STANCE_LABEL[room.viewer.stance]}`
        : null;

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: paddingTop + space.xs,
          backgroundColor: t.background,
          borderBottomColor: t.border,
        },
      ]}
    >
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

        <Text
          allowFontScaling={false}
          numberOfLines={2}
          style={[styles.title, { color: t.textPrimary }]}
        >
          {room.topic.title}
        </Text>

        {live ? (
          <View style={styles.live}>
            <LivePulse />
          </View>
        ) : (
          <View style={styles.livePlaceholder} />
        )}
      </View>

      <View style={styles.metaRow}>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {room.participantCount} in this room
        </Text>
        {countdown ? (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            · {countdown}
          </Text>
        ) : null}
        {stanceChip ? (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]}>
            · {stanceChip}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** mm:ss for final-arguments urgency; falls back for longer windows. */
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
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  back: {
    width: 36,
    height: 36,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typeScale.section,
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    paddingTop: 7,
  },
  live: { paddingTop: 10 },
  livePlaceholder: { width: 28 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingLeft: 28,
  },
  meta: { ...typeScale.caption, fontSize: 12 },
});
