/**
 * Layered live-room header — event identity, presence, phase rail.
 * Compacts slightly while the conversation scrolls.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import type { ArenaAuthor, ArenaRoom } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';
import { LivePulse } from './LivePulse';
import { LiveRoomPhaseRail } from './LiveRoomPhaseRail';
import { LiveRoomPresenceStrip } from './LiveRoomPresenceStrip';
import { softFill, secondsLabel } from './liveArenaStyles';

export interface LiveRoomHeaderProps {
  room: ArenaRoom;
  paddingTop: number;
  roomIndex?: number | null;
  presence?: readonly ArenaAuthor[];
  /** Scroll distance (inverted lists grow positive when leaving the live edge). */
  scrollY?: SharedValue<number>;
  onBack: () => void;
}

export function LiveRoomHeader({
  room,
  paddingTop,
  roomIndex = null,
  presence = [],
  scrollY,
  onBack,
}: LiveRoomHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const live =
    room.status === 'OPEN' || room.status === 'FINAL_ARGUMENTS' || room.status === 'JUDGING';

  const countdown =
    room.status === 'FINAL_ARGUMENTS' && room.secondsToJudging > 0
      ? secondsClock(room.secondsToJudging)
      : room.secondsRemaining > 0
        ? secondsClock(room.secondsRemaining)
        : null;

  const compactStyle = useAnimatedStyle(() => {
    if (reduced || !scrollY) return { opacity: 1, transform: [{ scale: 1 }] };
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, 80], [1, 0.92], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(y, [0, 100], [1, 0.97], Extrapolation.CLAMP) }],
    };
  });

  const detailStyle = useAnimatedStyle(() => {
    if (reduced || !scrollY) return { opacity: 1, maxHeight: 120 };
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, 70], [1, 0], Extrapolation.CLAMP),
      maxHeight: interpolate(y, [0, 70], [120, 0], Extrapolation.CLAMP),
      marginTop: interpolate(y, [0, 70], [0, -6], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          paddingTop: paddingTop + space.xs,
          backgroundColor: t.background,
        },
        compactStyle,
      ]}
    >
      <View
        style={[
          styles.plate,
          {
            backgroundColor: t.surfaceElevated,
            borderColor: t.border,
            shadowColor: t.shadowColor,
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

          <View style={styles.topSpacer} />

          {live ? (
            <View style={[styles.liveChip, { backgroundColor: softFill(t) }]}>
              <LivePulse />
              <Text allowFontScaling={false} style={[styles.liveChipText, { color: t.textPrimary }]}>
                LIVE
              </Text>
              {countdown ? (
                <Text allowFontScaling={false} style={[styles.liveChipText, { color: t.textMuted }]}>
                  · {countdown}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[styles.liveChip, { backgroundColor: softFill(t) }]}>
              <Text allowFontScaling={false} style={[styles.liveChipText, { color: t.textMuted }]}>
                {room.status === 'SETTLED' ? 'SETTLED' : 'ROOM'}
              </Text>
            </View>
          )}
        </View>

        <Text
          allowFontScaling={false}
          numberOfLines={2}
          style={[styles.title, { color: t.textPrimary }]}
        >
          {room.topic.title}
        </Text>

        <Text allowFontScaling={false} style={[styles.roomLine, { color: t.textSecondary }]}>
          {roomIndex != null ? `Room ${roomIndex}` : 'Room'} · {room.participantCount} here
        </Text>

        <Animated.View style={[styles.detail, detailStyle]}>
          <LiveRoomPresenceStrip
            people={presence}
            participantCount={room.participantCount}
            viewerStance={room.viewer?.stance ?? null}
            viewerRole={room.viewer?.role ?? null}
            roomIndex={roomIndex}
            emphasized
          />
          <LiveRoomPhaseRail status={room.status} />
        </Animated.View>
      </View>
    </Animated.View>
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
  },
  plate: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  back: {
    width: 36,
    height: 36,
    marginLeft: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSpacer: { flex: 1 },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  liveChipText: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    ...typeScale.section,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: -0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  roomLine: {
    ...typeScale.meta,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  detail: { gap: space.sm, overflow: 'hidden' },
});
