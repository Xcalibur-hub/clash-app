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
import { ClashMatchupBar } from './ClashMatchupBar';
import { LivePulse } from './LivePulse';
import { LiveRoomPhaseRail } from './LiveRoomPhaseRail';
import { LiveRoomPresenceStrip } from './LiveRoomPresenceStrip';
import { chipFill, roomStatusLabel, secondsLabel } from './liveArenaStyles';

export interface LiveRoomHeaderProps {
  room: ArenaRoom;
  paddingTop: number;
  roomIndex?: number | null;
  presence?: readonly ArenaRoomPresence[];
  /** Real capacity from server load when available. */
  debaterCount?: number | null;
  spectatorCount?: number | null;
  scrollY?: SharedValue<number>;
  onBack: () => void;
  onPulsePress?: () => void;
}

export function LiveRoomHeader({
  room,
  paddingTop,
  roomIndex = null,
  presence = [],
  debaterCount = null,
  spectatorCount = null,
  scrollY,
  onBack,
  onPulsePress,
}: LiveRoomHeaderProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const live =
    room.status === 'OPEN' || room.status === 'FINAL_ARGUMENTS' || room.status === 'JUDGING';

  const roleLine = (() => {
    if (room.duel) return room.duel.viewerRelationship === 'fighter_a' ? 'FIGHTER A'
      : room.duel.viewerRelationship === 'fighter_b' ? 'FIGHTER B'
      : room.duel.viewerRelationship === 'staff' ? 'MODERATOR' : 'WATCHER';
    if (!room.viewer) return null;
    if (room.status === 'JUDGING' && room.viewer.role === 'debater') return 'JUDGE';
    if (room.viewer.role === 'spectator') return 'WATCHER';
    if (room.viewer.role === 'debater') return 'FIGHTER';
    return null;
  })();

  const countdown =
    room.status === 'FINAL_ARGUMENTS' && room.secondsToJudging > 0
      ? secondsClock(room.secondsToJudging)
      : room.secondsRemaining > 0 && room.status === 'OPEN'
        ? null
        : room.secondsRemaining > 0
          ? secondsClock(room.secondsRemaining)
          : null;

  const crowdLine = (() => {
    if (debaterCount != null && spectatorCount != null) {
      return `${debaterCount} fighters · ${spectatorCount} spectators joined`;
    }
    return `${room.participantCount} joined`;
  })();

  const phaseHint =
    room.status === 'JUDGING'
      ? room.duel && !room.duel.mayJudge ? 'Public judging' : 'Judging open — cast your ballot'
      : room.status === 'FINAL_ARGUMENTS'
        ? 'Final arguments'
        : room.status === 'SETTLED'
          ? 'Room decided'
          : live
            ? 'Live clash'
            : roomStatusLabel(room.status);

  /**
   * Collapse the detail block as the list scrolls.
   *
   * Phase 1 blocker 4: this interpolated `maxHeight` between a hardcoded 140 and
   * 0. That is a fixed height by another name — with OS text scaling on (the AURA
   * default) the title, meta line and role chip routinely exceed 140dp, and the
   * excess was clipped with no affordance to reveal it. A short English title
   * happened to fit; a long one or a large text setting silently lost content.
   *
   * The collapse is now driven by `translateY` and opacity on a container that is
   * free to be as tall as its content, so nothing is ever cut: the block slides
   * and fades out of the way as you scroll, which is the effect the fixed
   * maxHeight was imitating.
   */
  const detailStyle = useAnimatedStyle(() => {
    if (reduced || !scrollY) return { opacity: 1, transform: [{ translateY: 0 }] };
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, 64], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(y, [0, 64], [0, -12], Extrapolation.CLAMP) }],
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
          // Was `numberOfLines={2}`: at a large OS text size a long challenge
          // title was truncated with no way to read the rest. A room header is
          // the one place the full title has to be available.
          style={[styles.title, { color: t.textPrimary }]}
        >
          {room.topic.title}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {live ? <LivePulse /> : null}
        <Text style={[styles.liveLine, { color: t.textSecondary }]}>
          {live ? 'LIVE' : room.status === 'SETTLED' ? 'DECIDED' : 'ROOM'}
          {roomIndex != null ? ` · Room ${roomIndex}` : ''}
          {` · ${crowdLine}`}
          {countdown ? ` · ${countdown}` : ''}
        </Text>
        {roleLine ? (
          <View
            style={[styles.roleChip, { backgroundColor: chipFill(t), borderColor: t.border }]}
            accessibilityRole="text"
            accessibilityLabel={`Your role: ${roleLine}`}
          >
            <Text style={[styles.roleChipText, { color: t.textSecondary }]}>
              {roleLine}
            </Text>
          </View>
        ) : null}
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
            <Text style={[styles.pulseBtnText, { color: t.textPrimary }]}>
              PULSE
            </Text>
            <View style={[styles.pulseDot, { backgroundColor: t.textPrimary }]} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.matchup}>
        <ClashMatchupBar
          fighterAName={room.duel?.fighterA.name}
          fighterBName={room.duel?.fighterB.name}
          size="room"
          agreeShare={
            room.status === 'SETTLED' && room.result
              ? (() => {
                  const total = room.result.agreeVotes + room.result.disagreeVotes;
                  return total > 0 ? room.result.agreeVotes / total : null;
                })()
              : null
          }
          storyBeat={phaseHint}
        />
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
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  roleChipText: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  matchup: {
    paddingLeft: 28,
    paddingRight: 4,
  },
  // No `overflow: 'hidden'` and no height bound: the block may be as tall as
  // its scaled content (blocker 4). The slide/fade does the hiding instead.
  detail: { gap: space.sm, paddingLeft: 28 },
});
