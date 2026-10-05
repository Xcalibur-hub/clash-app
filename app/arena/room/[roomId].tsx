import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { EvidenceComposerSheet } from '../../../components/liveArena/EvidenceComposerSheet';
import { BattleEventBurst } from '../../../components/liveArena/BattleEventBurst';
import { LiveEvidenceCard } from '../../../components/liveArena/LiveEvidenceCard';
import { LiveRoomAtmosphere } from '../../../components/liveArena/LiveRoomAtmosphere';
import { LiveRoomComposer } from '../../../components/liveArena/LiveRoomComposer';
import { LiveRoomEmptyFloor } from '../../../components/liveArena/LiveRoomEmptyFloor';
import { LiveRoomEventBanner } from '../../../components/liveArena/LiveRoomEventBanner';
import { LiveRoomHeader } from '../../../components/liveArena/LiveRoomHeader';
import { LiveRoomJudgingPanel } from '../../../components/liveArena/LiveRoomJudgingPanel';
import { LiveRoomMessage } from '../../../components/liveArena/LiveRoomMessage';
import { LiveRoomPulseStrip } from '../../../components/liveArena/LiveRoomPulseStrip';
import { LiveRoomResultReveal } from '../../../components/liveArena/LiveRoomResultReveal';
import { LiveRoomSkeleton } from '../../../components/liveArena/LiveRoomSkeleton';
import { LiveRoomTypingCue } from '../../../components/liveArena/LiveRoomTypingCue';
import { RoomPulseSheet } from '../../../components/liveArena/RoomPulseSheet';
import { VaultActionButton } from '../../../components/vault/VaultActionButton';
import {
  BackupInviteSheet,
} from '../../../components/liveArena/BackupInviteSheet';
import { CallBackupSheet } from '../../../components/liveArena/CallBackupSheet';
import {
  JoinDebateSheet,
  SpectatorJoinBar,
} from '../../../components/liveArena/SpectatorJoinBar';
import { PostActionsSheet } from '../../../components/arena/PostActionsSheet';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Notice } from '../../../components/shared/Notice';
import { ArenaIcon } from '../../../components/shared/icons';
import { useClock } from '../../../hooks/useClock';
import { useArenaBackup } from '../../../hooks/useArenaBackup';
import { useLiveArenaRoom } from '../../../hooks/useLiveArenaRoom';
import { useRoomTyping } from '../../../hooks/useRoomTyping';
import { analytics } from '../../../services/analytics';
import {
  fetchRoomPresence,
  fetchRoomPulse,
  fetchTopicRooms,
  type ArenaAuthor,
  type ArenaEvidence,
  type ArenaMessage,
  type ArenaRoomPresence,
  type ArenaRoomPulse,
  type ArenaRoomStatus,
} from '../../../services/liveArenaService';
import { showNotice, useClash, type User } from '../../../store';
import type { ReportTarget } from '../../../supabase/types';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import {
  newArgumentsEvent,
  phaseEventForStatus,
  pulseChangeEvent,
  type LiveRoomEvent,
} from '../../../utils/liveRoomEvents';
import { latestBattleEvent } from '../../../utils/arenaGameState';
import { battleEventBurstKind, type BattleBurstKind } from '../../../utils/battleMoment';
import { replyPreview, selectThreadRoots } from '../../../utils/liveRoomThread';
import {
  pulseLeaderChanges,
  type PulseLeader,
} from '../../../utils/roomPulseScore';
import { tap as hapticTap } from '../../../utils/haptics';

const REPLY_PREVIEW_LIMIT = 3;
const PULSE_REFRESH_MS = 15_000;

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
 *
 * Stance upgrade: spectators intentionally store null stance. Upgrade always
 * requires a fresh private stance choice — there is no safe reuse path.
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
  const [presence, setPresence] = React.useState<ArenaRoomPresence[]>([]);
  const [composerFocus, setComposerFocus] = React.useState(0);
  const [phaseBanner, setPhaseBanner] = React.useState<LiveRoomEvent | null>(null);
  const [pulseOpen, setPulseOpen] = React.useState(false);
  const [pulse, setPulse] = React.useState<ArenaRoomPulse | null>(null);
  const [pulseLoading, setPulseLoading] = React.useState(false);
  const [expandedReplies, setExpandedReplies] = React.useState<Set<string>>(new Set());
  const [backupOpen, setBackupOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [backupBanner, setBackupBanner] = React.useState<LiveRoomEvent | null>(null);
  const [backupSignalSent, setBackupSignalSent] = React.useState(false);
  const [burst, setBurst] = React.useState<{ kind: BattleBurstKind; key: string } | null>(null);
  const seenBackupEvent = React.useRef<string | null>(null);
  const dismissedInvite = React.useRef<string | null>(null);
  const prevStatus = React.useRef<ArenaRoomStatus | null>(null);
  const prevPulseLeaders = React.useRef<PulseLeader[]>([]);
  const seenIds = React.useRef<Set<string>>(new Set());
  const bootstrapped = React.useRef(false);

  const typingViewer = React.useMemo(
    () =>
      viewerAuthor
        ? {
            userId: viewerAuthor.id,
            handle: viewerAuthor.handle,
            name: viewerAuthor.name,
            avatarTint: viewerAuthor.avatarTint,
          }
        : null,
    [viewerAuthor],
  );

  const {
    peers: typingPeers,
    onComposerActivity,
    clearTyping,
  } = useRoomTyping({
    roomId,
    enabled: Boolean(room && room.viewer?.role === 'debater'),
    viewer: typingViewer,
  });

  const notify = React.useCallback(
    (message: string) => dispatch(showNotice(message)),
    [dispatch],
  );

  const backup = useArenaBackup(roomId);

  // A stored battle moment is shown once, briefly, then it stops competing for
  // attention — the room's own phase banner always wins.
  React.useEffect(() => {
    const newest = backup.events[backup.events.length - 1];
    if (!newest || seenBackupEvent.current === newest.id) return;
    seenBackupEvent.current = newest.id;
    const mapped = latestBattleEvent([newest]);
    if (mapped) {
      setBackupBanner(mapped);
      const timer = setTimeout(() => setBackupBanner(null), 6000);
      const burstKind = battleEventBurstKind(newest.kind);
      if (burstKind) {
        setBurst({ kind: burstKind, key: newest.id });
        setTimeout(() => setBurst(null), 1600);
      }
      return () => clearTimeout(timer);
    }
    const burstKind = battleEventBurstKind(newest.kind);
    if (burstKind) {
      setBurst({ kind: burstKind, key: newest.id });
      const timer = setTimeout(() => setBurst(null), 1600);
      return () => clearTimeout(timer);
    }
  }, [backup.events]);

  // A live call for this viewer surfaces itself, once per invitation.
  React.useEffect(() => {
    const invite = backup.activeInvite;
    if (!invite || dismissedInvite.current === invite.inviteId) return;
    setInviteOpen(true);
  }, [backup.activeInvite]);

  // Capacity is a real, server-reported fact worth measuring.
  React.useEffect(() => {
    if (backup.load?.saturated) {
      analytics.track('arena_room_capacity_reached', { realm: 'arena' });
    }
  }, [backup.load?.saturated]);

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

  const loadPresence = React.useCallback(async () => {
    if (!roomId) return;
    try {
      const people = await fetchRoomPresence(roomId, 12);
      setPresence(people);
    } catch {
      // Keep last good presence; strip is additive presentation.
    }
  }, [roomId]);

  React.useEffect(() => {
    if (!room) return;
    void loadPresence();
    const id = setInterval(() => void loadPresence(), 20_000);
    return () => clearInterval(id);
  }, [loadPresence, room?.roomId, room?.participantCount]);

  React.useEffect(() => {
    if (!room) return;
    const next = phaseEventForStatus(room.status, prevStatus.current);
    prevStatus.current = room.status;
    if (!next) return;
    setPhaseBanner(next);
    const id = setTimeout(() => setPhaseBanner(null), 3_200);
    if (next.kind === 'judging') {
      setBurst({ kind: 'judging', key: `phase-judging-${Date.now()}` });
      setTimeout(() => setBurst(null), 1600);
    } else if (next.kind === 'result') {
      setBurst({ kind: 'result', key: `phase-result-${Date.now()}` });
      setTimeout(() => setBurst(null), 1600);
    } else if (next.kind === 'final_arguments') {
      setBurst({ kind: 'clash', key: `phase-final-${Date.now()}` });
      setTimeout(() => setBurst(null), 1600);
    }
    return () => clearTimeout(id);
  }, [room?.status]);

  const loadPulse = React.useCallback(async (): Promise<void> => {
    if (!roomId) return;
    try {
      setPulseLoading(true);
      const next = await fetchRoomPulse(roomId);
      if (!next) return;
      const mapped: PulseLeader[] = next.leaders.map((l) => ({
        category: l.category,
        authorId: l.author?.id ?? '',
        authorName: l.author?.name ?? 'Someone',
        label: l.label,
        messageId: l.messageId,
        evidenceId: l.evidenceId,
        authorHandle: l.author?.handle ?? '',
        authorTint: l.author?.avatarTint ?? '#A1A1AA',
        score: l.score,
        preview: l.preview,
      }));
      const changes = pulseLeaderChanges(prevPulseLeaders.current, mapped);
      prevPulseLeaders.current = mapped;
      setPulse(next);
      if (changes.length === 1) {
        const change = changes[0];
        setPhaseBanner(
          pulseChangeEvent({
            category: change.category,
            authorName: change.authorName,
          }),
        );
        setTimeout(() => setPhaseBanner(null), 2_800);
        if (change.category === 'FAST_RISING') {
          setBurst({ kind: 'fast_rising', key: `pulse-rising-${change.authorName}` });
          setTimeout(() => setBurst(null), 1400);
        }
      }
    } catch {
      /* pulse is additive presentation */
    } finally {
      setPulseLoading(false);
    }
  }, [roomId]);

  React.useEffect(() => {
    if (!room) return;
    void loadPulse();
    const id = setInterval(() => void loadPulse(), PULSE_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadPulse, room?.roomId, room?.status]);

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

  const threadRoots = React.useMemo(() => selectThreadRoots(messages), [messages]);

  const viewerMessageIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.isOwn) ids.add(message.id);
    }
    return ids;
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

  const highlightId = React.useMemo(() => {
    if (room?.result?.bestArgumentMessageId) return room.result.bestArgumentMessageId;
    const pulseTop = pulse?.leaders.find((l) => l.category === 'TOP_ARGUMENT' && l.messageId);
    if (pulseTop?.messageId) return pulseTop.messageId;
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
  }, [messages, pulse?.leaders, room?.result?.bestArgumentMessageId]);

  const crowdHighlightId = React.useMemo(() => {
    const crowd = pulse?.leaders.find((l) => l.category === 'CROWD_FAVORITE' && l.messageId);
    return crowd?.messageId ?? null;
  }, [pulse?.leaders]);

  const crowdMoment = React.useMemo(() => {
    const crowd = pulse?.leaders.find((l) => l.category === 'CROWD_FAVORITE');
    if (!crowd?.preview) return null;
    return {
      author: crowd.author ? `@${crowd.author.handle || crowd.author.name}` : null,
      preview: crowd.preview,
    };
  }, [pulse?.leaders]);

  const storyEvent = phaseBanner ?? backupBanner;

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
      const isCrowd = item.id === crowdHighlightId && item.id !== highlightId;
      const parentId = item.parentMessageId;
      const parent = parentId ? byId.get(parentId) ?? null : null;
      const parentUnavailable = Boolean(parentId && !parent);
      const isRoot = !parentId;
      const expanded = expandedReplies.has(item.id);
      const preview = isRoot
        ? replyPreview(messages, item.id, REPLY_PREVIEW_LIMIT, expanded)
        : { shown: [] as ArenaMessage[], hiddenCount: 0, total: 0 };
      return (
        <LiveRoomMessage
          message={item}
          now={now}
          parent={parent}
          parentUnavailable={parentUnavailable}
          nestedReplies={preview.shown}
          hiddenReplyCount={preview.hiddenCount}
          onExpandReplies={
            preview.hiddenCount > 0
              ? () =>
                  setExpandedReplies((prev) => {
                    const next = new Set(prev);
                    next.add(item.id);
                    return next;
                  })
              : undefined
          }
          evidence={evidenceByMessage.map.get(item.id) ?? []}
          canReply={accepting && isDebater}
          canReact={!settled && isDebater}
          canMarkEvidence={!settled && isDebater}
          highlighted={isHighlight || isCrowd}
          highlightLabel={
            isHighlight ? 'Top argument' : isCrowd ? '💀 Crowd lost it' : null
          }
          entertainmentHighlight={isCrowd}
          ownStance={item.isOwn ? room?.viewer?.stance ?? null : null}
          onReply={setReplyTo}
          onReact={(message, emoji) => {
            void react(message.id, emoji).then(() => void loadPulse());
          }}
          onOpenProfile={openProfile}
          onMarkEvidence={(ev) => {
            void markUseful(ev.id).then(() => void loadPulse());
          }}
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
      crowdHighlightId,
      evidenceByMessage.map,
      expandedReplies,
      highlightId,
      isDebater,
      loadPulse,
      markUseful,
      messages,
      notify,
      now,
      openProfile,
      react,
      room?.viewer?.stance,
      settled,
    ],
  );

  if (loading && !room) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <LiveRoomSkeleton paddingTop={insets.top} />
        <Notice offset={0} />
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
    if (isSpectator) {
      return (
        <SpectatorJoinBar
          busy={joining}
          roomFull={roomFullOnUpgrade}
          roomIndex={roomIndex ?? 0}
          onJoinPress={() => setJoinOpen(true)}
        />
      );
    }
    if (isDebater && accepting) {
      return (
        <>
          <LiveRoomTypingCue
            peers={typingPeers}
            viewerId={state.viewer.id}
            viewerMessageIds={viewerMessageIds}
            showGeneric={atLiveEdge}
          />
          <LiveRoomComposer
            focusToken={composerFocus}
            replyingTo={replyTo?.author?.name ?? null}
            replyingToMessageId={replyTo?.id ?? null}
            sending={sending}
            onCancelReply={() => setReplyTo(null)}
            onTypingActivity={onComposerActivity}
            onTypingClear={clearTyping}
            onSend={async (argument) => {
              clearTyping();
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
                void loadPresence();
                void loadPulse();
              }
              return ok;
            }}
            onAddProof={() => setProofOpen(true)}
            onError={notify}
          />
        </>
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

  const floatingEvent =
    newCount > 0 && !atLiveEdge ? newArgumentsEvent(newCount) : null;

  const emptyFloor =
    messages.length === 0 && !threadLocked ? (
      <LiveRoomEmptyFloor
        presence={presence}
        participantCount={room.participantCount}
        isDebater={isDebater}
        isSpectator={isSpectator}
        accepting={accepting}
        onStartArgument={() => setComposerFocus((n) => n + 1)}
        onJoinDebate={() => setJoinOpen(true)}
      />
    ) : null;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <LiveRoomAtmosphere topicId={room.topicId} hood={room.topic.hood} />
      <LiveRoomHeader
        room={room}
        paddingTop={insets.top}
        roomIndex={roomIndex ?? 0}
        presence={presence}
        debaterCount={backup.load?.debaterCount ?? null}
        spectatorCount={backup.load?.spectatorCount ?? null}
        scrollY={scrollY}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)');
        }}
        onPulsePress={() => {
          setPulseOpen(true);
          analytics.track('room_pulse_opened', { realm: 'arena' });
          void loadPulse();
        }}
      />

      {!settled ? (
        <LiveRoomPulseStrip
          pulse={pulse}
          liveEvent={storyEvent}
          onOpen={() => {
            setPulseOpen(true);
            analytics.track('room_pulse_opened', { realm: 'arena' });
            void loadPulse();
          }}
        />
      ) : null}

      <BattleEventBurst kind={burst?.kind ?? null} triggerKey={burst?.key ?? null} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {settled && room.result ? (
          <FlatList
            data={[...threadRoots].reverse()}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            ListHeaderComponent={
              <>
                <LiveRoomResultReveal
                  result={room.result}
                  stats={stats}
                  viewer={room.viewer}
                  topicTitle={room.topic.title}
                  roomIndex={roomIndex ?? 0}
                  crowdMoment={crowdMoment}
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
              <View style={styles.flex}>
                {emptyFloor}
                <LiveRoomEventBanner event={phaseBanner} />
              </View>
            ) : messages.length > 0 ? (
              <View style={styles.flex}>
                <FlatList
                  ref={listRef}
                  inverted
                  data={threadRoots}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  initialNumToRender={12}
                  maxToRenderPerBatch={10}
                  windowSize={7}
                  removeClippedSubviews={Platform.OS === 'android'}
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
                <LiveRoomEventBanner
                  event={floatingEvent}
                  onPress={
                    floatingEvent?.kind === 'new_arguments' ? jumpToLatest : undefined
                  }
                />
              </View>
            ) : (
              <View style={styles.flex} />
            )}
            <View style={{ paddingBottom: Math.max(insets.bottom, space.sm) }}>
              {isDebater && accepting ? (
                <View style={styles.backupBar}>
                  <VaultActionButton
                    label="CALL BACKUP"
                    tone="solid"
                    compact
                    onPress={() => {
                      hapticTap();
                      setBackupSignalSent(false);
                      setBackupOpen(true);
                      void backup.refreshCandidates();
                    }}
                  />
                  {backup.load?.saturated ? (
                    <Text allowFontScaling={false} style={[styles.lockedText, { color: t.textMuted }]}>
                      {`Room full · ${backup.load.spectatorCount} watching`}
                    </Text>
                  ) : (
                    <Text allowFontScaling={false} style={[styles.lockedText, { color: t.textMuted }]}>
                      Bring someone into the fight
                    </Text>
                  )}
                </View>
              ) : null}
              {bottom}
            </View>
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
        roomIndex={roomIndex ?? 0}
        onClose={() => setJoinOpen(false)}
        onChoose={(stance) => {
          setJoining(true);
          void upgradeToDebater(stance)
            .then((ok) => {
              if (ok) {
                setJoinOpen(false);
                void loadPresence();
              }
            })
            .finally(() => setJoining(false));
        }}
      />

      <RoomPulseSheet
        visible={pulseOpen}
        pulse={pulse}
        loading={pulseLoading}
        roomIndex={roomIndex ?? 0}
        onClose={() => setPulseOpen(false)}
      />

      <CallBackupSheet
        visible={backupOpen}
        busy={backup.busy}
        candidates={backup.candidates}
        loading={backup.loadingCandidates}
        policy={backup.policy}
        signalSent={backupSignalSent}
        onClose={() => {
          setBackupOpen(false);
          setBackupSignalSent(false);
        }}
        onCall={(recipientId) => {
          analytics.track('arena_backup_requested', { realm: 'arena' });
          void backup.call(recipientId).then((ok) => {
            if (!ok) {
              analytics.track('arena_backup_call_failed', { realm: 'arena' });
              return;
            }
            setBackupSignalSent(true);
            setTimeout(() => {
              setBackupOpen(false);
              setBackupSignalSent(false);
            }, 1200);
          });
        }}
        onPolicy={(policy) => {
          analytics.track('arena_backup_preference_changed', { realm: 'arena' });
          void backup.setPolicy(policy);
        }}
      />

      <BackupInviteSheet
        visible={inviteOpen && backup.activeInvite !== null}
        busy={backup.busy}
        invite={backup.activeInvite}
        roomIndex={roomIndex ?? 0}
        now={now}
        onClose={() => {
          if (backup.activeInvite) {
            dismissedInvite.current = backup.activeInvite.inviteId;
            // "NOT NOW" is a decline: the caller is not told, and the call ends.
            analytics.track('arena_backup_declined', { realm: 'arena' });
            void backup.answer(backup.activeInvite.inviteId, false);
          }
          setInviteOpen(false);
        }}
        onJoin={(inviteId, stance) => {
          analytics.track('arena_backup_accepted', { realm: 'arena' });
          void backup.answer(inviteId, true, stance).then((result) => {
            if (result?.status === 'ACCEPTED') {
              setInviteOpen(false);
              dismissedInvite.current = inviteId;
              if (result.roomId && result.roomId !== roomId) {
                router.replace(`/arena/room/${result.roomId}`);
              } else {
                void refresh();
              }
            }
          });
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
  list: { paddingHorizontal: layout.screenX, paddingVertical: space.sm, flexGrow: 1 },
  orphanWrap: { gap: space.xs, paddingHorizontal: layout.screenX, paddingVertical: space.xs },
  locked: { paddingHorizontal: layout.screenX, paddingVertical: space.sm },
  lockedText: { ...typeScale.caption, fontSize: 12, lineHeight: 17 },
  older: { marginVertical: space.sm },
  backupBar: { paddingHorizontal: layout.screenX, paddingBottom: space.xs, gap: 4 },
});
