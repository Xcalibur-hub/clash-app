/**
 * Topic door — Live Topic + Your Room + interactive Active Rooms (spectator watch).
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  ArenaTopicRoomCard,
  LiveArenaTopic,
  Stance,
} from '../../services/liveArenaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { StanceChoiceRow } from '../arena/StanceChoiceRow';
import { LivePulse } from './LivePulse';
import { phaseLabel, softFill, STANCE_LABEL } from './liveArenaStyles';

export interface TopicRoomDiscoveryProps {
  topic: LiveArenaTopic;
  rooms: readonly ArenaTopicRoomCard[];
  roomsLoading?: boolean;
  busy?: boolean;
  onEnterRoom: (roomId: string) => void;
  /** Spectator entry into an explicit room (server-authoritative). */
  onWatchRoom: (roomId: string) => void;
  onJoinDebate: (stance: Stance) => void;
  onWatch: () => void;
}

function roomStatusLabel(status: ArenaTopicRoomCard['status']): string {
  switch (status) {
    case 'OPEN':
      return 'OPEN';
    case 'FINAL_ARGUMENTS':
      return 'FINAL';
    case 'JUDGING':
      return 'JUDGING';
    case 'SETTLED':
      return 'SETTLED';
    default:
      return status;
  }
}

export function TopicRoomDiscovery({
  topic,
  rooms,
  roomsLoading = false,
  busy = false,
  onEnterRoom,
  onWatchRoom,
  onJoinDebate,
  onWatch,
}: TopicRoomDiscoveryProps): React.JSX.Element {
  const t = useThemeColors();
  const viewerRoom = rooms.find((room) => room.isViewerRoom) ?? null;
  const assigned =
    topic.viewerJoined && (viewerRoom?.roomId ?? topic.viewerRoomId)
      ? {
          roomId: viewerRoom?.roomId ?? (topic.viewerRoomId as string),
          roomIndex: viewerRoom?.roomIndex ?? null,
          participantCount: viewerRoom?.participantCount ?? topic.participantCount,
          capacity: viewerRoom?.capacity ?? null,
        }
      : null;
  const isSpectator = topic.viewerRole === 'spectator';
  const isDebater = topic.viewerRole === 'debater';
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);

  // Debaters stay in their assigned room; everyone else can watch any listed room.
  const watchableRooms = rooms.filter((room) => {
    if (isDebater && assigned && room.roomId !== assigned.roomId) return false;
    return true;
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.topicHead}>
        <View style={styles.liveRow}>
          <LivePulse />
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            Live Topic
          </Text>
        </View>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          {topic.title}
        </Text>
        {topic.description ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]}>
            {topic.description}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {topic.participantCount} participating
          {topic.activeRoomCount > 0 ? ` · ${topic.activeRoomCount} rooms` : ''}
          {topic.secondsRemaining > 0 ? ` · ${phaseLabel(topic.phase)}` : ''}
        </Text>
      </View>

      {assigned ? (
        <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.cardKicker, { color: t.textMuted }]}>
            Your Room
          </Text>
          <Text allowFontScaling={false} style={[styles.roomTitle, { color: t.textPrimary }]}>
            {assigned.roomIndex != null ? `Room ${assigned.roomIndex}` : 'Your room'}
          </Text>
          <Text allowFontScaling={false} style={[styles.roomMeta, { color: t.textSecondary }]}>
            {assigned.participantCount} here
            {assigned.capacity != null ? ` · ${assigned.capacity} capacity` : ''}
          </Text>
          {topic.viewerStance ? (
            <Text allowFontScaling={false} style={[styles.privateNote, { color: t.textMuted }]}>
              You · {STANCE_LABEL[topic.viewerStance]} · private
            </Text>
          ) : isSpectator ? (
            <Text allowFontScaling={false} style={[styles.privateNote, { color: t.textMuted }]}>
              Watching
            </Text>
          ) : null}

          <View style={styles.ctaRow}>
            <PrimaryCta
              label={isSpectator ? 'Watch Clash' : 'Enter Clash'}
              onPress={() => onEnterRoom(assigned.roomId)}
              busy={busy}
            />
            {isSpectator ? (
              upgradeOpen ? (
                <StanceChoiceRow
                  prompt="Take a side to join"
                  disabled={busy}
                  onChoose={onJoinDebate}
                />
              ) : (
                <SecondaryCta
                  label="Join Debate"
                  onPress={() => setUpgradeOpen(true)}
                  busy={busy}
                />
              )
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: softFill(t), borderColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.cardKicker, { color: t.textMuted }]}>
            Join the debate
          </Text>
          <Text allowFontScaling={false} style={[styles.joinCopy, { color: t.textSecondary }]}>
            Pick a private stance to get placed in a room. Nobody sees how you answered.
          </Text>
          <StanceChoiceRow prompt="What do you believe?" disabled={busy} onChoose={onJoinDebate} />
          <Pressable
            onPress={() => {
              hapticTap();
              onWatch();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Watch a live room"
            style={styles.watchHit}
          >
            <Text allowFontScaling={false} style={[styles.watch, { color: t.textSecondary }]}>
              Or pick a room below to watch
            </Text>
          </Pressable>
        </View>
      )}

      {roomsLoading ? (
        <ActivityIndicator color={t.textMuted} style={styles.loader} />
      ) : watchableRooms.length > 0 ? (
        <View style={styles.listBlock}>
          <Text allowFontScaling={false} style={[styles.listTitle, { color: t.textMuted }]}>
            Active rooms
          </Text>
          {watchableRooms.map((room) => {
            const full = room.participantCount >= room.capacity && room.status === 'OPEN';
            const mine = room.isViewerRoom;
            const meta = full
              ? `${room.participantCount} / ${room.capacity} · ${roomStatusLabel(room.status)} · FULL`
              : `${room.participantCount} here · ${roomStatusLabel(room.status)}`;
            const cta = mine
              ? isDebater
                ? 'Enter →'
                : 'Watching →'
              : 'Watch →';

            return (
              <Pressable
                key={room.roomId}
                onPress={() => {
                  hapticTap();
                  if (mine && isDebater) onEnterRoom(room.roomId);
                  else if (mine) onEnterRoom(room.roomId);
                  else onWatchRoom(room.roomId);
                }}
                disabled={busy}
                style={[
                  styles.roomRow,
                  {
                    borderColor: t.border,
                    backgroundColor: mine ? softFill(t) : 'transparent',
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Room ${room.roomIndex}, ${meta}. ${cta}`}
              >
                <View style={styles.roomRowLeft}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.roomRowTitle, { color: t.textPrimary }]}
                  >
                    Room {room.roomIndex}
                    {mine ? ' · Yours' : ''}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[styles.roomRowMeta, { color: full ? t.textSecondary : t.textMuted }]}
                  >
                    {meta}
                  </Text>
                </View>
                <Text
                  allowFontScaling={false}
                  style={[styles.roomRowCta, { color: t.textPrimary }]}
                >
                  {cta}
                </Text>
              </Pressable>
            );
          })}
          {isDebater ? (
            <Text allowFontScaling={false} style={[styles.debaterNote, { color: t.textMuted }]}>
              You’re debating in your assigned Clash — pick Enter Clash above.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PrimaryCta({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.primary, { backgroundColor: t.clashFill, opacity: busy ? 0.6 : 1 }]}
    >
      <Text allowFontScaling={false} style={[styles.primaryText, { color: t.clashText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryCta({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.secondary, { borderColor: t.borderStrong }]}
    >
      <Text allowFontScaling={false} style={[styles.secondaryText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  topicHead: { gap: space.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    ...typeScale.editorial,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  description: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
  meta: { ...typeScale.meta, fontSize: 13 },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
  cardKicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  roomTitle: { ...typeScale.section, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  roomMeta: { ...typeScale.meta, fontSize: 14 },
  privateNote: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  joinCopy: { ...typeScale.meta, fontSize: 14, lineHeight: 20 },
  ctaRow: { gap: space.sm, marginTop: space.xs },
  primary: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primaryText: { ...typeScale.label, fontSize: 15, fontWeight: '800' },
  secondary: {
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  watchHit: { alignSelf: 'center', paddingVertical: space.sm },
  watch: { ...typeScale.meta, fontSize: 14, fontWeight: '600' },
  loader: { marginTop: space.sm },
  listBlock: { gap: 6 },
  listTitle: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: space.sm,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  roomRowLeft: { flex: 1, gap: 2 },
  roomRowTitle: { ...typeScale.label, fontSize: 15, fontWeight: '700' },
  roomRowMeta: { ...typeScale.caption, fontSize: 12 },
  roomRowCta: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  debaterNote: { ...typeScale.caption, fontSize: 11, marginTop: 4, lineHeight: 15 },
});
