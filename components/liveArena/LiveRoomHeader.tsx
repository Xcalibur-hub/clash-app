/**
 * Room header that merges into the atmosphere — not a dashboard card.
 * Hierarchy: topic → LIVE · Room N · count → presence → phase.
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
import type { ArenaRoom, ArenaRoomPresence } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
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
  presence?: readonly ArenaRoomPresence[];
  scrollY?: SharedValue<number>;
  onBack: () => void;
  onPulsePress?: () => void;
}

export function LiveRoomHeader({
  room,
  paddingTop,
  roomIndex = null,
  presence = [],
  scrollY,
  onBack,
  onPulsePress,
}: LiveRoomHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const live =
    room.status === 'OPEN' || room.status === 'FINAL_ARGUMENTS' || room.status === 'JUDGING';

  const countdown =
    room.status === 'FINAL_ARGUMENTS' && room.secondsToJudging > 0
      ? secondsClock(room.secondsToJudging)
      : room.secondsRemaining > 0 && room.status === 'OPEN'
        ? null
        : room.secondsRemaining > 0
          ? secondsClock(room.secondsRemaining)
          : null;

  const detailStyle = useAnimatedStyle(() => {
    if (reduced || !scrollY) return { opacity: 1, maxHeight: 140 };
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, 64], [1, 0], Extrapolation.CLAMP),
      maxHeight: interpolate(y, [0, 64], [140, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <View style={[styles.wrap, { paddingTop: paddingTop + space.xs }]}>
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
      </View>

      <View style={styles.metaRow}>
        {live ? <LivePulse /> : null}
        <Text allowFontScaling={false} style={[styles.liveLine, { color: t.textSecondary }]}>
          {live ? 'LIVE' : room.status === 'SETTLED' ? 'SETTLED' : 'ROOM'}
          {roomIndex != null ? ` · Room ${roomIndex}` : ''}
          {` · ${room.participantCount} here`}
          {countdown ? ` · ${countdown}` : ''}
        </Text>
        {onPulsePress ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onPulsePress();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open Room Pulse"
            style={[styles.pulseBtn, { borderColor: t.borderStrong, backgroundColor: t.surfaceElevated }]}
          >
            <Text allowFontScaling={false} style={[styles.pulseBtnText, { color: t.textPrimary }]}>
              PULSE
            </Text>
            <View style={[styles.pulseDot, { backgroundColor: t.textPrimary }]} />
          </Pressable>
        ) : null}
      </View>

      <Animated.View style={[styles.detail, detailStyle]}>
        <LiveRoomPresenceStrip
          people={presence}
          participantCount={room.participantCount}
          viewerStance={room.viewer?.stance ?? null}
          viewerRole={room.viewer?.role ?? null}
        />
        <LiveRoomPhaseRail status={room.status} />
      </Animated.View>
    </View>
  );
}

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
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    ...typeScale.section,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.45,
    textTransform: 'uppercase',
    paddingRight: space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    paddingLeft: 28,
  },
  liveLine: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  pulseBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pulseBtnText: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  detail: { gap: space.sm, overflow: 'hidden', paddingLeft: 28 },
});
