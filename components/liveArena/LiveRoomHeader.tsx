import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaRoom } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';
import { LivePulse } from './LivePulse';
import { roomStatusLabel, secondsLabel, softFill, STANCE_LABEL } from './liveArenaStyles';

export interface LiveRoomHeaderProps {
  room: ArenaRoom;
  paddingTop: number;
  onBack: () => void;
}

/**
 * The room's standing context: what is being argued, which phase it is in, how
 * long is left and how many people are inside — plus the viewer's own stance,
 * which is shown to them and to nobody else.
 */
export function LiveRoomHeader({
  room,
  paddingTop,
  onBack,
}: LiveRoomHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const live = room.status === 'OPEN' || room.status === 'FINAL_ARGUMENTS' || room.status === 'JUDGING';
  const countdown =
    room.status === 'OPEN' && room.secondsToFinalArguments > 0
      ? `${secondsLabel(room.secondsToFinalArguments)} to final arguments`
      : room.status === 'FINAL_ARGUMENTS' && room.secondsToJudging > 0
        ? `${secondsLabel(room.secondsToJudging)} to judging`
        : room.secondsRemaining > 0
          ? `${secondsLabel(room.secondsRemaining)} left`
          : null;

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: paddingTop + space.xs, backgroundColor: t.surface, borderBottomColor: t.border },
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

        <View style={styles.statusRow}>
          {live ? <LivePulse /> : null}
          <Text allowFontScaling={false} style={[styles.status, { color: t.textSecondary }]}>
            {roomStatusLabel(room.status)}
          </Text>
        </View>
      </View>

      <Text
        allowFontScaling={false}
        numberOfLines={3}
        style={[styles.title, { color: t.textPrimary }]}
      >
        {room.topic.title}
      </Text>

      <View style={styles.metaRow}>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {room.participantCount} of {room.capacity} in this room
        </Text>
        {countdown ? (
          <>
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              ·
            </Text>
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              {countdown}
            </Text>
          </>
        ) : null}
      </View>

      {room.viewer?.stance ? (
        <View style={[styles.stanceChip, { backgroundColor: softFill(t), borderColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.stanceText, { color: t.textSecondary }]}>
            Your stance · {STANCE_LABEL[room.viewer.stance]} · private
          </Text>
        </View>
      ) : room.viewer?.role === 'spectator' ? (
        <View style={[styles.stanceChip, { backgroundColor: softFill(t), borderColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.stanceText, { color: t.textSecondary }]}>
            Watching · spectator
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: {
    width: 36,
    height: 36,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  status: { ...typeScale.caption, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  title: {
    ...typeScale.section,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  meta: { ...typeScale.caption, fontSize: 11 },
  stanceChip: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stanceText: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
