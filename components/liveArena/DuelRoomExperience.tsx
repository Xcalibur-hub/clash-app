import React from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import type { ArenaEvidence, ArenaMessage, ArenaRoom } from '../../services/liveArenaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { duelEmptyText, duelEvidence, duelFighterSide, duelPresentation, duelTranscript } from '../../utils/duelPresentation';
import { BackIcon } from '../shared/icons';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { ClashMatchupBar } from './ClashMatchupBar';
import { DuelRoomOutcome } from './DuelRoomOutcome';
import { LiveEvidenceCard } from './LiveEvidenceCard';
import { LiveRoomMessage, type LiveRoomMessageProps } from './LiveRoomMessage';

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

/** Duel specialization over the existing Room stream; no new subscriptions or writes. */
export function DuelRoomExperience(props: Props): React.JSX.Element {
  const { room, messages, evidence } = props;
  const duel = room.duel!; // Only mounted after the canonical gate in the route.
  const t = useThemeColors();
  const presentation = duelPresentation(duel, room.phase);
  const [tab, setTab] = React.useState<'transcript' | 'evidence'>('transcript');
  const [expanded, setExpanded] = React.useState(false);
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
  const renderItem = React.useCallback(({ item }: ListRenderItemInfo<Entry>) => {
    if (item.kind === 'evidence') return <View style={styles.proof}><LiveEvidenceCard evidence={item.evidence} inline
      canMark={canInteract} onMarkUseful={props.onMarkEvidence} onReport={props.onReportEvidence} /></View>;
    const message = item.message;
    const side = duelFighterSide(duel, message.author?.id);
    const fighter = side === 'A' ? duel.fighterA : side === 'B' ? duel.fighterB : null;
    const parent = message.parentMessageId ? byId.get(message.parentMessageId) : undefined;
    return <LiveRoomMessage message={message} now={Date.now()}
      duelFighter={side && fighter ? { side, name: fighter.name, handle: fighter.handle } : undefined}
      parent={parent} parentUnavailable={Boolean(message.parentMessageId && !parent)}
      evidence={attached.get(message.id) ?? []} mediaVisible={visibleIds.has(message.id)}
      canReply={presentation.canPublish} canReact={canInteract} canMarkEvidence={canInteract}
      onReply={props.onReply} onExpressiveReply={presentation.canPublish ? props.onExpressiveReply : undefined}
      onReact={props.onReact} onOpenProfile={props.onOpenProfile} onReport={props.onReport}
      onMarkEvidence={props.onMarkEvidence} onReportEvidence={props.onReportEvidence} />;
  }, [attached, byId, canInteract, duel, presentation.canPublish, props.onExpressiveReply, props.onMarkEvidence,
    props.onOpenProfile, props.onReact, props.onReply, props.onReport, props.onReportEvidence, visibleIds]);
  const live = duel.status === 'open' && (room.phase === 'open' || room.phase === 'final_arguments');
  const retry = <Pressable disabled={props.refreshing} accessibilityRole="button" accessibilityLabel="Retry loading this Clash"
    style={styles.action} onPress={() => void props.onRefresh()}><Text style={{ color: t.textPrimary }}>Retry</Text></Pressable>;
  return <View style={[styles.root, { backgroundColor: t.background }]}>
    <View style={[styles.top, { paddingTop: props.paddingTop, borderColor: t.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.action} onPress={props.onBack}><BackIcon size={20} color={t.textPrimary} /></Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.status, { color: live ? t.danger : t.textPrimary }]}>{presentation.stage.toUpperCase()}</Text>
      {props.spectatorCount !== null && <Text style={[typeScale.caption, { color: t.textSecondary }]}>{props.spectatorCount} watching</Text>}
    </View>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList key={tab} ref={list} data={props.threadLocked ? [] : entries} keyExtractor={item => item.id} renderItem={renderItem}
        initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} removeClippedSubviews={Platform.OS === 'android'}
        viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl }]} keyboardShouldPersistTaps="handled"
        refreshing={props.refreshing} onRefresh={() => void props.onRefresh()}
        onScroll={event => { const e = event.nativeEvent; followLatest.current = e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 48; }}
        scrollEventThrottle={100} onContentSizeChange={() => { if (followLatest.current && tab === 'transcript') list.current?.scrollToEnd({ animated: false }); }}
        ListHeaderComponent={<View style={styles.context}>
          <Text accessibilityRole="header" selectable style={[styles.proposition, { color: t.textPrimary }]}>{duel.sourceText?.trim() || room.topic.title}</Text>
          <ClashMatchupBar duel={duel} onOpenProfile={props.onOpenProfile} />
          {Boolean(duel.counterPosition) && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.action}
            onPress={() => setExpanded(value => !value)}><Text style={{ color: t.textSecondary }}>{expanded ? 'Hide full counter-position' : 'Read full counter-position'}</Text></Pressable>}
          {expanded && <Text selectable style={[typeScale.body, { color: t.textPrimary }]}>{duel.counterPosition}</Text>}
          <View style={[styles.phase, { borderColor: t.borderStrong }]}>
            <Text accessibilityLiveRegion="polite" style={[typeScale.label, { color: t.textPrimary }]}>{presentation.stage} · {presentation.role}</Text>
            <Text style={[typeScale.caption, { color: t.textSecondary }]}>{presentation.hint}</Text>
          </View>
          {!presentation.side && duel.status === 'open' && <Text style={[typeScale.caption, { color: t.textSecondary }]}>
            {room.phase === 'judging' ? 'Voting is open. Review both cases before casting your judgement.'
              : room.phase === 'closed' ? 'Voting is closed. You can keep reviewing the transcript.'
              : 'Watch the arguments, open fighter profiles, and judge when voting opens.'} Fighter replies and reactions are reserved for the two fighters.
          </Text>}
          {!props.loading && !props.hasOlder && transcript.length > 0 && duel.status === 'open'
            && [duel.fighterA, duel.fighterB].filter(fighter => !transcript.some(message => message.author?.id === fighter.id))
              .map(fighter => <Text key={fighter.id} style={[typeScale.caption, { color: t.textSecondary }]}>No visible argument from {fighter.name} in this transcript yet.</Text>)}
          {props.error && entries.length > 0 && <View accessibilityLiveRegion="polite"><Text style={{ color: t.textSecondary }}>Couldn't update this Clash. Your loaded transcript is still available.</Text>{retry}</View>}
          <SegmentedTabs value={tab} items={[{ key: 'transcript', label: 'Transcript' }, { key: 'evidence', label: 'Evidence' }]}
            label="Clash content" onChange={next => { followLatest.current = false; setTab(next); }} />
          {props.hasOlder && tab === 'transcript' && <Pressable accessibilityRole="button" disabled={props.loadingOlder} style={styles.action}
            onPress={() => void props.onLoadOlder()}><Text style={{ color: t.textPrimary }}>{props.loadingOlder ? 'Loading earlier arguments…' : 'Load earlier arguments'}</Text></Pressable>}
        </View>}
        ListFooterComponent={(room.phase === 'judging' || room.phase === 'closed' || duel.status !== 'open' || duel.hasJudged) ? <DuelRoomOutcome key={duel.clashId}
          duel={duel} phase={room.phase} onJudge={props.onJudge}
          onReview={() => { followLatest.current = false; setTab('transcript'); list.current?.scrollToOffset({ offset: 0, animated: false }); }} onReturn={props.onReturn} /> : null}
        ListEmptyComponent={<View style={styles.empty}>
          {props.loading ? <ActivityIndicator accessibilityLabel="Loading Clash transcript" color={t.textSecondary} />
            : props.threadLocked ? <>
              <Text style={[typeScale.body, { color: t.textSecondary }]}>{duel.status === 'open' && room.phase !== 'closed'
                ? 'Enter as a spectator to read this Clash. Watching does not make you a fighter.' : 'This transcript is available to Room members.'}</Text>
              {duel.status === 'open' && room.phase !== 'closed' && <Pressable accessibilityRole="button" accessibilityLabel="Watch this Clash as a spectator"
                disabled={watching} style={styles.action} onPress={() => {
                  if (joining.current) return;
                  joining.current = true; setWatching(true); setWatchError(false);
                  void props.onWatch().catch(() => setWatchError(true)).finally(() => { joining.current = false; setWatching(false); });
                }}><Text style={{ color: t.textPrimary }}>{watching ? 'Entering…' : 'Watch Clash'}</Text></Pressable>}
              {watchError && <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>Couldn't enter this Clash. Please try again.</Text>}
              {retry}
            </>
            : props.error ? <><Text style={{ color: t.textSecondary }}>The transcript couldn't be loaded. Please retry.</Text>{retry}</>
            : <Text style={[typeScale.body, { color: t.textSecondary }]}>{duelEmptyText(duel, room.phase, tab)}</Text>}
        </View>} />
      <View style={[styles.bottom, { borderColor: t.border, paddingBottom: Math.max(props.paddingBottom, space.sm) }]}>
        {presentation.canPublish ? props.composer : <Pressable accessibilityRole="button" accessibilityLabel={presentation.canJudge ? 'Review the official judgement choices' : duel.verdict ? 'View the official verdict' : 'Go to the latest arguments'}
          style={styles.action} onPress={() => { followLatest.current = true; setTab('transcript'); requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false })); }}>
          <Text style={[typeScale.label, { color: t.textPrimary }]}>{presentation.canJudge ? 'Judge this Clash' : duel.verdict ? 'View verdict' : 'Latest arguments'}</Text>
        </Pressable>}
      </View>
    </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: layout.screenX, borderBottomWidth: StyleSheet.hairlineWidth },
  status: { ...typeScale.label, flex: 1 }, content: { paddingHorizontal: layout.screenX, flexGrow: 1 },
  context: { gap: space.sm, paddingVertical: space.md }, proposition: { ...typeScale.title, fontSize: 23, lineHeight: 29 },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: space.sm, paddingRight: space.sm },
  phase: { gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md },
  empty: { paddingVertical: space.xl, gap: space.sm }, proof: { paddingVertical: space.sm },
  bottom: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: layout.screenX },
});
