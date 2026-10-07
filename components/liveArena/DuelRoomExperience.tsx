import React from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import type { ArenaEvidence, ArenaMessage, ArenaRoom } from '../../services/liveArenaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { duelEmptyText, duelEvidence, duelFighterSide, duelPresentation, duelTranscript } from '../../utils/duelPresentation';
import { BackIcon } from '../shared/icons';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { ClashMatchupBar } from './ClashMatchupBar';
import { DuelRoomOutcome } from './DuelRoomOutcome';
import { LiveEvidenceCard } from './LiveEvidenceCard';
import { LiveRoomMessage, type LiveRoomMessageProps } from './LiveRoomMessage';
import { softFill } from './liveArenaStyles';

type Entry = { kind: 'message'; id: string; createdAt: number; message: ArenaMessage }
  | { kind: 'evidence'; id: string; createdAt: number; evidence: ArenaEvidence };
type Actions = Pick<LiveRoomMessageProps, 'onReply' | 'onExpressiveReply' | 'onReact' | 'onOpenProfile' | 'onReport' | 'onMarkEvidence' | 'onReportEvidence'>;
interface Props extends Actions {
  room: ArenaRoom; messages: readonly ArenaMessage[]; evidence: readonly ArenaEvidence[];
  paddingTop: number; paddingBottom: number; spectatorCount: number | null;
  loading: boolean; refreshing: boolean; loadingOlder: boolean; hasOlder: boolean; threadLocked: boolean; error: string | null;
  composer: React.ReactNode;
  onBack: () => void; onReturn: () => void; onRefresh: () => Promise<void>; onLoadOlder: () => Promise<void>;
  onJudge: (side: 'A' | 'B') => Promise<void>;
  onWatch: () => Promise<void>;
}

function DuelLoadingBones(): React.JSX.Element {
  const t = useThemeColors();
  const bone = softFill(t);
  return (
    <View style={styles.bones} accessibilityLabel="Loading Clash transcript">
      <View style={[styles.boneLine, { backgroundColor: bone, width: '88%' }]} />
      <View style={[styles.boneLine, { backgroundColor: bone, width: '64%' }]} />
      <View style={[styles.boneBlock, { backgroundColor: bone }]} />
      <View style={[styles.boneLine, { backgroundColor: bone, width: '72%' }]} />
      <View style={[styles.boneLine, { backgroundColor: bone, width: '54%' }]} />
    </View>
  );
}

/** Duel specialization over the existing Room stream; no new subscriptions or writes. */
export function DuelRoomExperience(props: Props): React.JSX.Element {
  const { room, messages, evidence } = props;
  const duel = room.duel!; // Only mounted after the canonical gate in the route.
  const t = useThemeColors();
  const presentation = duelPresentation(duel, room.phase);
  const [tab, setTab] = React.useState<'transcript' | 'evidence'>('transcript');
  const [propositionExpanded, setPropositionExpanded] = React.useState(false);
  const [watching, setWatching] = React.useState(false);
  const [watchError, setWatchError] = React.useState(false);
  const joining = React.useRef(false);
  const [visibleIds, setVisibleIds] = React.useState<ReadonlySet<string>>(new Set());
  const list = React.useRef<FlatList<Entry>>(null);
  const followLatest = React.useRef(false);
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 35 }).current;
  const onViewableItemsChanged = React.useRef(({ viewableItems }: { viewableItems: { item: Entry }[] }) => {
    setVisibleIds(new Set(viewableItems.map(item => item.item.id)));
  }).current;
  const transcript = React.useMemo(() => duelTranscript(duel, messages), [duel, messages]);
  const safeEvidence = React.useMemo(() => duelEvidence(duel, evidence, transcript), [duel, evidence, transcript]);
  const byId = React.useMemo(() => new Map(transcript.map(message => [message.id, message])), [transcript]);
  const attached = React.useMemo(() => {
    const map = new Map<string, ArenaEvidence[]>();
    for (const item of safeEvidence) if (item.messageId) {
      const rows = map.get(item.messageId) ?? []; rows.push(item); map.set(item.messageId, rows);
    }
    return map;
  }, [safeEvidence]);
  const entries = React.useMemo<Entry[]>(() => {
    const proof: Entry[] = safeEvidence.filter(item => tab === 'evidence' || !item.messageId)
      .map(item => ({ kind: 'evidence', id: `evidence:${item.id}`, createdAt: item.createdAt, evidence: item }));
    if (tab === 'evidence') return proof;
    return [...transcript.map((message): Entry => ({ kind: 'message', id: message.id, createdAt: message.createdAt, message })), ...proof]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }, [safeEvidence, tab, transcript]);
  const canInteract = Boolean(presentation.side && room.viewer?.role === 'debater' && duel.status === 'open');
  const proposition = duel.sourceText?.trim() || room.topic.title;
  const propositionLong = proposition.length > 120;
  const live = duel.status === 'open' && (room.phase === 'open' || room.phase === 'final_arguments');
  const statusLabel = live ? 'LIVE' : presentation.stage.toUpperCase();

  const renderItem = React.useCallback(({ item }: ListRenderItemInfo<Entry>) => {
    if (item.kind === 'evidence') {
      return (
        <View style={styles.proof}>
          <LiveEvidenceCard
            evidence={item.evidence}
            inline
            canMark={canInteract}
            onMarkUseful={props.onMarkEvidence}
            onReport={props.onReportEvidence}
          />
        </View>
      );
    }
    const message = item.message;
    const side = duelFighterSide(duel, message.author?.id);
    const fighter = side === 'A' ? duel.fighterA : side === 'B' ? duel.fighterB : null;
    const parent = message.parentMessageId ? byId.get(message.parentMessageId) : undefined;
    return (
      <LiveRoomMessage
        message={message}
        now={Date.now()}
        duelFighter={side && fighter ? { side, name: fighter.name, handle: fighter.handle } : undefined}
        parent={parent}
        parentUnavailable={Boolean(message.parentMessageId && !parent)}
        evidence={attached.get(message.id) ?? []}
        mediaVisible={visibleIds.has(message.id)}
        canReply={presentation.canPublish}
        canReact={canInteract}
        canMarkEvidence={canInteract}
        onReply={props.onReply}
        onExpressiveReply={presentation.canPublish ? props.onExpressiveReply : undefined}
        onReact={props.onReact}
        onOpenProfile={props.onOpenProfile}
        onReport={props.onReport}
        onMarkEvidence={props.onMarkEvidence}
        onReportEvidence={props.onReportEvidence}
      />
    );
  }, [attached, byId, canInteract, duel, presentation.canPublish, props.onExpressiveReply, props.onMarkEvidence,
    props.onOpenProfile, props.onReact, props.onReply, props.onReport, props.onReportEvidence, visibleIds]);

  const retry = (
    <Pressable
      disabled={props.refreshing}
      accessibilityRole="button"
      accessibilityLabel="Try again"
      style={styles.action}
      onPress={() => void props.onRefresh()}
    >
      <Text style={[styles.retryText, { color: t.textPrimary }]}>Try again</Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={[styles.top, { paddingTop: props.paddingTop, borderColor: t.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backHit}
          onPress={props.onBack}
        >
          <BackIcon size={20} color={t.textPrimary} />
        </Pressable>

        <View
          style={styles.statusCluster}
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            props.spectatorCount !== null
              ? `${statusLabel}. ${props.spectatorCount} watching`
              : statusLabel
          }
        >
          {live ? <View style={[styles.liveDot, { backgroundColor: t.danger }]} /> : null}
          <Text
            allowFontScaling={false}
            style={[styles.status, { color: live ? t.textPrimary : t.textSecondary }]}
          >
            {statusLabel}
          </Text>
          {props.spectatorCount !== null ? (
            <>
              <Text allowFontScaling={false} style={[styles.statusSep, { color: t.textMuted }]}>
                ·
              </Text>
              <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
                {props.spectatorCount} watching
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.topSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          key={tab}
          ref={list}
          data={props.threadLocked ? [] : entries}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          contentContainerStyle={[styles.content, { paddingBottom: space.xl }]}
          keyboardShouldPersistTaps="handled"
          refreshing={props.refreshing}
          onRefresh={() => void props.onRefresh()}
          onScroll={event => {
            const e = event.nativeEvent;
            followLatest.current =
              e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 48;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (followLatest.current && tab === 'transcript') {
              list.current?.scrollToEnd({ animated: false });
            }
          }}
          ListHeaderComponent={
            <View style={styles.context}>
              <Text
                accessibilityRole="header"
                selectable
                style={[styles.proposition, { color: t.textPrimary }]}
                numberOfLines={propositionExpanded || !propositionLong ? undefined : 4}
              >
                {proposition}
              </Text>
              {propositionLong ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: propositionExpanded }}
                  style={styles.action}
                  onPress={() => setPropositionExpanded(value => !value)}
                >
                  <Text style={[styles.link, { color: t.textMuted }]}>
                    {propositionExpanded ? 'Show less' : 'Read full proposition'}
                  </Text>
                </Pressable>
              ) : null}

              <ClashMatchupBar duel={duel} onOpenProfile={props.onOpenProfile} />

              <View style={styles.roleRow}>
                <Text
                  allowFontScaling={false}
                  accessibilityLiveRegion="polite"
                  style={[styles.roleChip, { color: t.textSecondary, borderColor: t.border }]}
                >
                  {presentation.role}
                </Text>
                {!live ? (
                  <Text
                    allowFontScaling={false}
                    style={[styles.phaseHint, { color: t.textMuted }]}
                    numberOfLines={2}
                  >
                    {presentation.hint}
                  </Text>
                ) : null}
              </View>

              {!presentation.side && duel.status === 'open' ? (
                <Text style={[styles.spectatorNote, { color: t.textMuted }]}>
                  {room.phase === 'judging'
                    ? 'Voting is open. Review both cases before casting your judgement.'
                    : room.phase === 'closed'
                      ? 'Voting is closed. You can keep reviewing the transcript.'
                      : 'Watch the arguments and judge when voting opens.'}
                </Text>
              ) : null}

              {!props.loading && !props.hasOlder && transcript.length > 0 && duel.status === 'open'
                ? [duel.fighterA, duel.fighterB]
                    .filter(fighter => !transcript.some(message => message.author?.id === fighter.id))
                    .map(fighter => (
                      <Text key={fighter.id} style={[styles.spectatorNote, { color: t.textMuted }]}>
                        No visible argument from {fighter.name} in this transcript yet.
                      </Text>
                    ))
                : null}

              {props.error && entries.length > 0 ? (
                <View accessibilityLiveRegion="polite" style={styles.errorRow}>
                  <Text style={[styles.spectatorNote, { color: t.textSecondary }]}>
                    Reconnecting…
                  </Text>
                  {retry}
                </View>
              ) : null}

              <SegmentedTabs
                value={tab}
                items={[
                  { key: 'transcript', label: 'Transcript' },
                  { key: 'evidence', label: 'Evidence' },
                ]}
                label="Clash content"
                onChange={next => {
                  followLatest.current = false;
                  setTab(next);
                }}
              />

              {props.hasOlder && tab === 'transcript' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={props.loadingOlder}
                  style={styles.action}
                  onPress={() => void props.onLoadOlder()}
                >
                  <Text style={[styles.link, { color: t.textPrimary }]}>
                    {props.loadingOlder ? 'Loading earlier arguments…' : 'Load earlier arguments'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            room.phase === 'judging' || room.phase === 'closed' || duel.status !== 'open' || duel.hasJudged ? (
              <DuelRoomOutcome
                key={duel.clashId}
                duel={duel}
                phase={room.phase}
                onJudge={props.onJudge}
                onReview={() => {
                  followLatest.current = false;
                  setTab('transcript');
                  list.current?.scrollToOffset({ offset: 0, animated: false });
                }}
                onReturn={props.onReturn}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              {props.loading ? (
                <DuelLoadingBones />
              ) : props.threadLocked ? (
                <>
                  <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Watch this Clash</Text>
                  <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
                    {duel.status === 'open' && room.phase !== 'closed'
                      ? 'Enter as a spectator to read the transcript. Watching does not make you a fighter.'
                      : 'This transcript is available to Room members.'}
                  </Text>
                  {duel.status === 'open' && room.phase !== 'closed' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Watch this Clash as a spectator"
                      disabled={watching}
                      style={[styles.primaryAction, { borderColor: t.borderStrong }]}
                      onPress={() => {
                        if (joining.current) return;
                        joining.current = true;
                        setWatching(true);
                        setWatchError(false);
                        void props
                          .onWatch()
                          .catch(() => setWatchError(true))
                          .finally(() => {
                            joining.current = false;
                            setWatching(false);
                          });
                      }}
                    >
                      <Text style={[styles.primaryActionText, { color: t.textPrimary }]}>
                        {watching ? 'Entering…' : 'Watch Clash'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {watchError ? (
                    <Text accessibilityRole="alert" style={[styles.emptyBody, { color: t.textSecondary }]}>
                      Couldn't enter this Clash.
                    </Text>
                  ) : null}
                  {retry}
                </>
              ) : props.error ? (
                <>
                  <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>
                    Couldn't load the Clash.
                  </Text>
                  {retry}
                </>
              ) : (
                <>
                  {tab === 'transcript' && duel.status === 'open' && room.phase !== 'scheduled' ? (
                    <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>THE FLOOR IS OPEN</Text>
                  ) : null}
                  <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
                    {duelEmptyText(duel, room.phase, tab).replace(/^THE FLOOR IS OPEN\n\n/, '')}
                  </Text>
                </>
              )}
            </View>
          }
        />

        <View
          style={[
            styles.bottom,
            { borderColor: t.border, paddingBottom: Math.max(props.paddingBottom, space.sm) },
          ]}
        >
          {presentation.canPublish ? (
            props.composer
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                presentation.canJudge
                  ? 'Review the official judgement choices'
                  : duel.verdict
                    ? 'View the official verdict'
                    : 'Go to the latest arguments'
              }
              style={styles.action}
              onPress={() => {
                followLatest.current = true;
                setTab('transcript');
                requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
              }}
            >
              <Text style={[styles.bottomCue, { color: t.textPrimary }]}>
                {presentation.canJudge
                  ? 'Judge this Clash'
                  : duel.verdict
                    ? 'View verdict'
                    : 'Latest arguments'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  backHit: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  statusCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  status: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statusSep: { fontSize: 12 },
  watching: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '500',
  },
  topSpacer: { minWidth: 44 },
  content: { paddingHorizontal: layout.screenX, flexGrow: 1 },
  context: { gap: space.md, paddingTop: space.lg, paddingBottom: space.md },
  proposition: {
    ...typeScale.title,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  roleRow: { gap: space.xs },
  roleChip: {
    ...typeScale.caption,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  phaseHint: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 17,
  },
  spectatorNote: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 17,
  },
  link: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingRight: space.sm,
  },
  retryText: { ...typeScale.label, fontSize: 14, fontWeight: '600' },
  errorRow: { gap: space.xs },
  empty: {
    paddingVertical: space.xl,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    ...typeScale.label,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  emptyBody: {
    ...typeScale.body,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryAction: {
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    justifyContent: 'center',
  },
  primaryActionText: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  bones: { gap: space.sm, width: '100%', paddingTop: space.md },
  boneLine: { height: 14, borderRadius: 6 },
  boneBlock: { height: 72, borderRadius: 8, marginVertical: space.xs },
  proof: { paddingVertical: space.md },
  bottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenX,
  },
  bottomCue: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
});
