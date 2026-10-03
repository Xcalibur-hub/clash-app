import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { EvidenceComposerSheet } from '../../../components/liveArena/EvidenceComposerSheet';
import { LiveEvidenceCard } from '../../../components/liveArena/LiveEvidenceCard';
import { LiveRoomComposer } from '../../../components/liveArena/LiveRoomComposer';
import { LiveRoomHeader, secondsClock } from '../../../components/liveArena/LiveRoomHeader';
import { LiveRoomJudgingPanel } from '../../../components/liveArena/LiveRoomJudgingPanel';
import { LiveRoomMessage } from '../../../components/liveArena/LiveRoomMessage';
import { LiveRoomResultReveal } from '../../../components/liveArena/LiveRoomResultReveal';
import {
  JoinDebateSheet,
  SpectatorJoinBar,
} from '../../../components/liveArena/SpectatorJoinBar';
import { PostActionsSheet } from '../../../components/arena/PostActionsSheet';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Notice } from '../../../components/shared/Notice';
import { ArenaIcon } from '../../../components/shared/icons';
import { useClock } from '../../../hooks/useClock';
import { useLiveArenaRoom } from '../../../hooks/useLiveArenaRoom';
import { analytics } from '../../../services/analytics';
import {
  fetchTopicRooms,
  type ArenaAuthor,
  type ArenaEvidence,
  type ArenaMessage,
} from '../../../services/liveArenaService';
import { showNotice, useClash, type User } from '../../../store';
import type { ReportTarget } from '../../../supabase/types';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

interface SafetyTarget {
  user: User;
  report: { kind: ReportTarget; id: string };
}

function asUser(author: ArenaAuthor): User {
  return {
    id: author.id,
    handle: author.handle,
    name: author.name,
    tint: author.avatarTint,
    hood: 'for-you',
    rank: 'Rookie',
    reputation: 0,
    coins: 0,
    clashes: 0,
    wins: 0,
    streak: 0,
    badges: [],
  };
}

function reactionScore(message: ArenaMessage): number {
  return message.reactions.reduce((sum, r) => sum + r.count, 0);
}

/**
 * Live Arena room — premium social event, not a plain chat timeline.
 * Server remains authoritative for phases, capacity, judging, and privacy.
 */
export default function LiveArenaRoomScreen(): React.JSX.Element {
  const { roomId: raw } = useLocalSearchParams<{ roomId: string | string[] }>();
  const roomId = Array.isArray(raw) ? raw[0] : raw;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const now = useClock(1_000);
  const { state, dispatch } = useClash();
  const listRef = React.useRef<FlatList<ArenaMessage>>(null);
  const scrollY = useSharedValue(0);

  const viewerAuthor = React.useMemo<ArenaAuthor>(
    () => ({
      id: state.viewer.id,
      handle: state.viewer.handle,
      name: state.viewer.name,
      avatarTint: state.viewer.tint,
      rank: state.viewer.rank,
    }),
    [state.viewer],
  );

  const {
    room,
    messages,
    evidence,
    stats,
    loading,
    error,
    threadLocked,
    refreshing,
    sending,
    loadingOlder,
    hasOlder,
    roomFullOnUpgrade,
    refresh,
    loadOlder,
    send,
    react,
    addEvidence,
    markUseful,
    voteSide,
    voteArgument,
    recordFinal,
    upgradeToDebater,
  } = useLiveArenaRoom(roomId, viewerAuthor);

  const [replyTo, setReplyTo] = React.useState<ArenaMessage | null>(null);
  const [proofOpen, setProofOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const [safety, setSafety] = React.useState<SafetyTarget | null>(null);
  const [voting, setVoting] = React.useState(false);
  const [roomIndex, setRoomIndex] = React.useState<number | null>(null);
  const [newCount, setNewCount] = React.useState(0);
  const [atLiveEdge, setAtLiveEdge] = React.useState(true);
  const seenIds = React.useRef<Set<string>>(new Set());
  const bootstrapped = React.useRef(false);

  const notify = React.useCallback(
    (message: string) => dispatch(showNotice(message)),
    [dispatch],
  );

  React.useEffect(() => {
    if (!room?.topicId) return;
    let cancelled = false;
    void fetchTopicRooms(room.topicId)
      .then((rooms) => {
        if (cancelled) return;
        const mine = rooms.find((r) => r.roomId === room.roomId);
        setRoomIndex(mine?.roomIndex ?? null);
      })
      .catch(() => {
        if (!cancelled) setRoomIndex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [room?.roomId, room?.topicId]);

  React.useEffect(() => {
    if (messages.length === 0) return;
    if (!bootstrapped.current) {
      seenIds.current = new Set(messages.map((m) => m.id));
      bootstrapped.current = true;
      return;
    }
    let added = 0;
    for (const message of messages) {
      if (message.kind === 'system' || message.pending) continue;
      if (!seenIds.current.has(message.id)) {
        seenIds.current.add(message.id);
        if (!message.isOwn) added += 1;
      }
    }
    if (added > 0 && !atLiveEdge) {
      setNewCount((n) => n + added);
    }
  }, [atLiveEdge, messages]);

  const byId = React.useMemo(() => {
    const map = new Map<string, ArenaMessage>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);

  const evidenceByMessage = React.useMemo(() => {
    const map = new Map<string, ArenaEvidence[]>();
    const orphans: ArenaEvidence[] = [];
    for (const item of evidence) {
      if (item.messageId && byId.has(item.messageId)) {
        const list = map.get(item.messageId) ?? [];
        list.push(item);
        map.set(item.messageId, list);
      } else {
        orphans.push(item);
      }
    }
    return { map, orphans };
  }, [byId, evidence]);

  const presence = React.useMemo(() => {
    const seen = new Set<string>();
    const people: ArenaAuthor[] = [];
    for (const message of messages) {
      if (!message.author || seen.has(message.author.id)) continue;
      seen.add(message.author.id);
      people.push(message.author);
      if (people.length >= 5) break;
    }
    return people;
  }, [messages]);

  const highlightId = React.useMemo(() => {
    if (room?.result?.bestArgumentMessageId) return room.result.bestArgumentMessageId;
    let bestId: string | null = null;
    let bestScore = 0;
    for (const message of messages) {
      if (message.kind === 'system' || message.pending) continue;
      const score = reactionScore(message);
      if (score >= 3 && score > bestScore) {
        bestScore = score;
        bestId = message.id;
      }
    }
    return bestId;
  }, [messages, room?.result?.bestArgumentMessageId]);

  const accepting = room?.status === 'OPEN' || room?.status === 'FINAL_ARGUMENTS';
  const settled = room?.status === 'SETTLED';
  const judging = room?.status === 'JUDGING';
  const isDebater = room?.viewer?.role === 'debater';
  const isSpectator = room?.viewer?.role === 'spectator';

  const openProfile = React.useCallback(
    (profileId: string) => router.push(`/profile/${profileId}`),
    [router],
  );

  const renderMessage = React.useCallback(
    ({ item }: ListRenderItemInfo<ArenaMessage>) => {
      const isHighlight = item.id === highlightId;
      return (
        <LiveRoomMessage
          message={item}
          now={now}
          parent={item.parentMessageId ? (byId.get(item.parentMessageId) ?? null) : null}
          evidence={evidenceByMessage.map.get(item.id) ?? []}
          canReply={accepting && isDebater}
          canReact={!settled && isDebater}
          canMarkEvidence={!settled && isDebater}
          highlighted={isHighlight}
          highlightLabel={
            isHighlight
              ? room?.result?.bestArgumentMessageId === item.id
                ? 'Top argument'
                : 'Top argument'
              : null
          }
          ownStance={item.isOwn ? room?.viewer?.stance ?? null : null}
          onReply={setReplyTo}
          onReact={(message, emoji) => void react(message.id, emoji)}
          onOpenProfile={openProfile}
          onMarkEvidence={(ev) => void markUseful(ev.id)}
          onChallengeEvidence={
            accepting && isDebater
              ? (ev) => {
                  const anchor = ev.messageId ? byId.get(ev.messageId) : undefined;
                  if (anchor) setReplyTo(anchor);
                  else notify(`Answer "${ev.title}" in your next argument.`);
                }
              : undefined
          }
          onReportEvidence={(ev) => {
            if (!ev.author) return;
            setSafety({
              user: asUser(ev.author),
              report: { kind: 'arena_room_evidence', id: ev.id },
            });
          }}
          onReport={
            item.author
              ? (message) =>
                  setSafety({
                    user: asUser(message.author as ArenaAuthor),
                    report: { kind: 'arena_room_message', id: message.id },
                  })
              : undefined
          }
        />
      );
    },
    [
      accepting,
      byId,
      evidenceByMessage.map,
      highlightId,
      isDebater,
      markUseful,
      notify,
      now,
      openProfile,
      react,
      room?.result?.bestArgumentMessageId,
      room?.viewer?.stance,
      settled,
    ],
  );

  if (loading && !room) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={ArenaIcon}
          title="Room unavailable"
          body={error ?? 'This Arena room may have closed or is not open to you.'}
          actionLabel="BACK TO ARENA"
          onAction={() => router.replace('/(tabs)')}
        />
        <Notice offset={0} />
      </View>
    );
  }

  const finalBanner =
    room.status === 'FINAL_ARGUMENTS' ? (
      <View
        style={[
          styles.phaseBanner,
          {
            backgroundColor: t.surfaceElevated,
            borderColor: t.borderStrong,
            shadowColor: t.shadowColor,
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.phaseText, { color: t.textPrimary }]}>
          FINAL ARGUMENTS
        </Text>
        {room.secondsToJudging > 0 ? (
          <Text allowFontScaling={false} style={[styles.phaseClock, { color: t.textSecondary }]}>
            {secondsClock(room.secondsToJudging)}
          </Text>
        ) : null}
      </View>
    ) : null;

  const orphanEvidence =
    evidenceByMessage.orphans.length > 0 ? (
      <View style={styles.orphanWrap}>
        {evidenceByMessage.orphans.map((item) => (
          <LiveEvidenceCard
            key={item.id}
            evidence={item}
            inline
            canMark={!settled && isDebater}
            onMarkUseful={(ev) => void markUseful(ev.id)}
            onChallenge={
              accepting && isDebater
                ? (ev) => notify(`Answer "${ev.title}" in your next argument.`)
                : undefined
            }
            onReport={
              item.author
                ? (ev) =>
                    setSafety({
                      user: asUser(ev.author as ArenaAuthor),
                      report: { kind: 'arena_room_evidence', id: ev.id },
                    })
                : undefined
            }
          />
        ))}
      </View>
    ) : null;

  const bottom = (() => {
    if (isSpectator) {
      return (
        <SpectatorJoinBar
          busy={joining}
          roomFull={roomFullOnUpgrade}
          roomIndex={roomIndex}
          onJoinPress={() => setJoinOpen(true)}
        />
      );
    }
    if (judging && isDebater) {
      return (
        <LiveRoomJudgingPanel
          room={room}
          messages={messages}
          busy={voting}
          onVoteSide={(side) => {
            setVoting(true);
            void voteSide(side).finally(() => setVoting(false));
          }}
          onVoteArgument={(messageId) => {
            setVoting(true);
            void voteArgument(messageId).finally(() => setVoting(false));
          }}
        />
      );
    }
    if (isDebater && accepting) {
      return (
        <LiveRoomComposer
          replyingTo={replyTo?.author?.name ?? null}
          sending={sending}
          onCancelReply={() => setReplyTo(null)}
          onSend={async (argument) => {
            const ok = await send({
              body: argument.body,
              parentMessageId: replyTo?.id ?? null,
              ...(argument.media ? { media: argument.media } : {}),
              ...(argument.gif ? { gif: argument.gif } : {}),
            });
            if (ok) {
              setReplyTo(null);
              analytics.track('arena_message_sent', {
                realm: 'arena',
                media_type: argument.gif ? 'gif' : (argument.media?.kind ?? 'none'),
              });
            }
            return ok;
          }}
          onAddProof={() => setProofOpen(true)}
          onError={notify}
        />
      );
    }
    return null;
  })();

  const jumpToLatest = (): void => {
    hapticTap();
    setNewCount(0);
    setAtLiveEdge(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <LinearGradient
        colors={
          t.scheme === 'light'
            ? ['rgba(196,165,116,0.10)', 'transparent']
            : ['rgba(196,165,116,0.08)', 'transparent']
        }
        style={styles.wash}
        pointerEvents="none"
      />
      <LiveRoomHeader
        room={room}
        paddingTop={insets.top}
        roomIndex={roomIndex}
        presence={presence}
        scrollY={scrollY}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)');
        }}
      />
      {finalBanner}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {settled && room.result ? (
          <FlatList
            data={[...messages].reverse()}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            ListHeaderComponent={
              <>
                <LiveRoomResultReveal
                  result={room.result}
                  stats={stats}
                  viewer={room.viewer}
                  busy={voting}
                  onRecordFinal={(stance) => {
                    setVoting(true);
                    void recordFinal(stance).finally(() => setVoting(false));
                  }}
                />
                {orphanEvidence}
              </>
            }
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <>
            {threadLocked ? (
              <View style={styles.locked}>
                <Text allowFontScaling={false} style={[styles.lockedText, { color: t.textMuted }]}>
                  Join this room to read the conversation.
                </Text>
              </View>
            ) : null}
            {messages.length === 0 && !threadLocked ? (
              <View style={styles.empty}>
                <Text allowFontScaling={false} style={[styles.emptyText, { color: t.textMuted }]}>
                  No arguments yet. Be the first.
                </Text>
              </View>
            ) : null}
            <View style={styles.flex}>
              <FlatList
                ref={listRef}
                inverted
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                ListFooterComponent={
                  <>
                    {orphanEvidence}
                    {loadingOlder ? (
                      <ActivityIndicator style={styles.older} size="small" color={t.textMuted} />
                    ) : null}
                  </>
                }
                contentContainerStyle={styles.list}
                style={styles.flex}
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                onEndReached={() => {
                  if (hasOlder) void loadOlder();
                }}
                onEndReachedThreshold={0.4}
                onScroll={(e) => {
                  const y = e.nativeEvent.contentOffset.y;
                  scrollY.value = y;
                  const nearEdge = y < 48;
                  setAtLiveEdge(nearEdge);
                  if (nearEdge && newCount > 0) setNewCount(0);
                }}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
              {newCount > 0 ? (
                <Pressable
                  onPress={jumpToLatest}
                  style={[styles.newPill, { backgroundColor: t.clashFill }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${newCount} new arguments`}
                >
                  <Text allowFontScaling={false} style={[styles.newPillText, { color: t.clashText }]}>
                    {newCount} new argument{newCount === 1 ? '' : 's'} ↓
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ paddingBottom: insets.bottom }}>{bottom}</View>
          </>
        )}
      </KeyboardAvoidingView>

      <EvidenceComposerSheet
        visible={proofOpen}
        onClose={() => setProofOpen(false)}
        onSubmit={(input) => addEvidence(input)}
        onError={notify}
      />

      <JoinDebateSheet
        visible={joinOpen}
        busy={joining}
        onClose={() => setJoinOpen(false)}
        onChoose={(stance) => {
          setJoining(true);
          void upgradeToDebater(stance)
            .then((ok) => {
              if (ok) setJoinOpen(false);
            })
            .finally(() => setJoining(false));
        }}
      />

      <PostActionsSheet
        visible={safety !== null}
        target={safety?.user ?? null}
        isSelf={safety?.user.id === state.viewer.id}
        following={false}
        reportTarget={safety?.report ?? null}
        onClose={() => setSafety(null)}
        onMutated={() => void refresh()}
      />

      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  wash: { ...StyleSheet.absoluteFillObject, height: 220 },
  list: { paddingHorizontal: layout.screenX, paddingVertical: space.sm, flexGrow: 1 },
  phaseBanner: {
    marginHorizontal: layout.screenX,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  phaseText: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  phaseClock: { ...typeScale.data, fontSize: 14, fontWeight: '800' },
  orphanWrap: { gap: space.xs, paddingHorizontal: layout.screenX, paddingVertical: space.xs },
  locked: { paddingHorizontal: layout.screenX, paddingVertical: space.sm },
  lockedText: { ...typeScale.caption, fontSize: 12, lineHeight: 17 },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
  emptyText: { ...typeScale.meta, fontSize: 13 },
  older: { marginVertical: space.sm },
  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 12,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  newPillText: { ...typeScale.caption, fontSize: 12, fontWeight: '800' },
});
