/** Discovery uses caller-scoped server states; previews never create Room membership. */
import React from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlatList, ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveArenaTopic } from '../../services/liveArenaService';
import { fetchPersonalizedLiveDiscovery, type PersonalizedLiveSnapshot } from '../../services/personalizedLiveDiscoveryService';
import { useAuth } from '../../store/AuthProvider';
import { clashDiscoveryDestination } from '../../utils/arenaClashDiscovery';
import { rankLiveDiscovery, retainLiveOrder, type LiveDiscoveryMode, type RankedLiveDuel } from '../../utils/personalizedLiveDiscovery';
import { layout, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { LiveDuelCard } from './LiveDuelCard';
import { ArenaButton } from './ui/ArenaPrimitives';
import { arena } from '../../theme/arena';
import { HOOD_LABEL } from '../../data/hoods';
export interface ArenaClashesProps {
  bottomPadding?: number;
  topics: readonly LiveArenaTopic[];
  topicsLoading?: boolean;
  topicsError?: boolean;
  onEnter: (topic: LiveArenaTopic) => void;
  onWatch: (topic: LiveArenaTopic) => void;
}
const modes: LiveDiscoveryMode[] = ['For You', 'Following', 'Discover'];
const isLive = (topic: LiveArenaTopic): boolean => topic.status === 'live' && (topic.phase === 'open' || topic.phase === 'final_arguments');
type Rankings = Record<LiveDiscoveryMode, RankedLiveDuel[]>;
export function ArenaClashes({ topics, bottomPadding = 24, topicsLoading = false, topicsError = false, onEnter, onWatch }: ArenaClashesProps): React.JSX.Element {
  const t = useThemeColors(), router = useRouter(), { user } = useAuth(), owner = user?.id ?? null;
  const [section, setSection] = React.useState<'LIVE' | 'UPCOMING' | 'COMPLETED' | 'TOPICS'>('LIVE');
  const [topic, setTopic] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<LiveDiscoveryMode>('For You'), [visible, setVisible] = React.useState(12);
  const [snapshot, setSnapshot] = React.useState<{ owner: string; data: PersonalizedLiveSnapshot; rankings: Rankings } | null>(null);
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState(false), [retry, setRetry] = React.useState(0);
  useFocusEffect(React.useCallback(() => {
    let active = true, busy = false, failed = false, previous: Rankings | null = null;
    setSnapshot(null); setLoading(Boolean(owner)); setError(false); setVisible(12);
    const load = async (): Promise<void> => {
      if (!owner || busy || failed) return;
      busy = true;
      try {
        const data = await fetchPersonalizedLiveDiscovery(owner, () => active);
        if (!active) return;
        const rankings = Object.fromEntries(modes.map(value => {
          const fresh = rankLiveDiscovery(data.rows, value, data.signals);
          return [value, previous ? retainLiveOrder(previous[value], fresh) : fresh];
        })) as Rankings;
        previous = rankings;
        setSnapshot({ owner, data, rankings }); setError(false);
      } catch { if (active) { failed = true; setSnapshot(null); setError(true); } }
      finally { busy = false; if (active) setLoading(false); }
    };
    void load();
    const timer = owner ? setInterval(() => void load(), 20_000) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [owner, retry]));
  const current = snapshot?.owner === owner ? snapshot : null;
  const topicMode = section === 'TOPICS';
  const followingFailed = section === 'LIVE' && mode === 'Following' && !!current?.data.followingError;
  const ready = topicMode ? !topicsLoading && !topicsError : !!owner && !!current && !loading && !error && !followingFailed;
  const entries = current?.data.rows.map(row => row.entry) ?? [];
  const liveEntries = entries.filter(entry => entry.kind === 'CLASH' && entry.state === section);
  const allRanked: RankedLiveDuel[] = section === 'LIVE' ? current?.rankings[mode] ?? [] : (current?.data.rows ?? [])
    .filter(row => liveEntries.includes(row.entry)).map(duel => ({ duel, reason: section === 'COMPLETED' ? 'Clash history' : 'Scheduled by the server' }));
  const ranked = section === 'LIVE' && mode === 'Discover' && topic ? allRanked.filter(row => row.duel.hood === topic) : allRanked;
  const topicChoices = [...new Set((current?.rankings.Discover ?? []).flatMap(row => row.duel.hood ? [row.duel.hood] : []))].sort();
  const changeSection = (value: typeof section): void => { setSection(value); setVisible(12); };
  const header = <View style={styles.header}>
    <Text style={[arena.type.eyebrow, { color: t.textMuted }]}>TWO PERSPECTIVES. ONE STAGE.</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{section === 'COMPLETED' ? 'Past Clashes.' : 'Find your next debate.'}</Text>
    <Text style={[arena.type.body, { color: t.textSecondary }]}>Watch the arguments unfold. Join the conversation.</Text>
    <View style={styles.shortcuts}><ArenaButton label="Challenges" accessibilityLabel="Open Challenge Inbox" onPress={() => router.push('/arena/challenges')} /><ArenaButton label="Results" accessibilityLabel="Open Clash history" variant="tertiary" onPress={() => changeSection('COMPLETED')} />{section === 'COMPLETED' ? <ArenaButton label="Hall of Fame ↗" accessibilityLabel="Open Hall of Fame archive" variant="tertiary" onPress={() => router.push('/arena/hall-of-fame')} /> : null}</View>
    <View style={styles.filters} accessibilityRole="tablist">{(['LIVE', 'UPCOMING', 'TOPICS'] as const).map(value => <ArenaButton key={value} label={value === 'LIVE' ? 'On now' : value === 'UPCOMING' ? 'Coming up' : 'Topic rooms'} selected={section === value} variant={section === value ? 'secondary' : 'tertiary'} onPress={() => changeSection(value)} />)}</View>
    {section === 'LIVE' ? <View style={styles.filters} accessibilityRole="tablist">{modes.map(value => <ArenaButton key={value} label={value} accessibilityLabel={`Live filter: ${value}`} selected={mode === value} variant={mode === value ? 'secondary' : 'tertiary'} onPress={() => {setMode(value);setVisible(12);}} />)}</View> : null}
    {section === 'LIVE' && mode === 'Discover' && topicChoices.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}><ArenaButton label="All topics" selected={topic === null} variant={topic === null ? 'secondary' : 'tertiary'} onPress={() => {setTopic(null);setVisible(12);}} />{topicChoices.map(value => <ArenaButton key={value} label={(HOOD_LABEL as Record<string,string>)[value] ?? value} accessibilityLabel={'Live topic: '+value} selected={topic === value} variant={topic === value ? 'secondary' : 'tertiary'} onPress={() => {setTopic(value);setVisible(12);}} />)}</ScrollView> : null}
    <Text style={[arena.type.meta, { color: t.textMuted }]}>{topicMode ? 'Group conversations, away from the 1v1 stage' : section === 'COMPLETED' ? 'Finished debates and cancelled Clashes' : section === 'LIVE' ? mode === 'Following' ? 'Public fighters you follow · within the available snapshot' : mode === 'Discover' ? 'Explore beyond your selected interests' : 'Your interests, followed fighters, then recent openings' : 'Coming up · Not live yet'}</Text>
    {!owner && !topicMode ? <ArenaButton label="Sign in to discover Clashes" onPress={() => router.push('/auth')} /> : null}
    {section === 'LIVE' && owner ? <ArenaButton label="Edit interests" variant="tertiary" onPress={() => router.push('/interests')} /> : null}
    {(topicMode ? topicsLoading : loading) ? <Text accessibilityLiveRegion="polite" style={[styles.status, { color: t.textMuted }]}>Loading {topicMode ? 'discussions' : 'Clashes'}…</Text> : (topicMode ? topicsError : error || followingFailed) ? <View style={styles.status}><Text accessibilityRole="alert" style={[arena.type.body, { color: t.textSecondary }]}>Couldn’t load {followingFailed ? 'follow relationships' : topicMode ? 'discussions' : 'Clashes'}. These are not empty results.</Text>{!topicMode ? <ArenaButton label="Try again" onPress={() => setRetry(n => n + 1)} /> : <Text style={{ color: t.textMuted }}>Return to Home and pull to refresh discussions.</Text>}</View> : null}
    {!topicMode && current && (current.data.interestsError || current.data.followingError || current.data.metadataError) ? <View style={{gap:8}}><Text style={[arena.type.meta,{color:t.textSecondary}]}>{current.data.interestsError ? 'Interests unavailable; using the available live snapshot. ' : ''}{current.data.followingError ? 'Follow relevance unavailable. ' : ''}{current.data.metadataError ? 'Some Clash details could not be verified and are omitted.' : ''}</Text><ArenaButton label="Refresh discovery" variant="tertiary" onPress={() => setRetry(n=>n+1)} /></View> : null}
  </View>;
  if (topicMode) return <FlatList key={`topics:${owner}`} style={{ flex: 1 }} data={ready ? [...topics].sort((a,b) => Number(isLive(b))-Number(isLive(a))) : []} keyExtractor={topic => topic.id}
    ListHeaderComponent={header} contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]} initialNumToRender={6} windowSize={5} keyboardShouldPersistTaps="handled"
    ListEmptyComponent={ready ? <Text style={[styles.status, { color: t.textMuted }]}>No topic rooms to explore right now.</Text> : null}
    renderItem={({ item: topic }) => <Pressable accessibilityRole="button" accessibilityLabel={`${topic.phase}. ${topic.title}. ${topic.viewerRoomId ? 'Enter your room' : 'View topic'}`} onPress={() => { hapticPress(); if (topic.viewerRoomId) onEnter(topic); else onWatch(topic); }} style={[styles.topic, { borderColor: t.border, backgroundColor: t.surface }]}><Text style={[arena.type.eyebrow, { color: t.textMuted }]}>{isLive(topic) ? 'LIVE DISCUSSION' : topic.phase.replace(/_/g, ' ').toUpperCase()}</Text><Text style={[arena.type.heading, { color: t.textPrimary }]}>{topic.title}</Text><Text style={[arena.type.meta, { color: t.textSecondary }]}>{topic.participantCount} joined · {topic.viewerRoomId ? 'Enter your room' : 'View discussion'} ↗</Text></Pressable>} />;
  return <FlatList key={`duels:${owner}:${section}:${mode}`} style={{ flex: 1 }} data={ready ? ranked.slice(0,visible) : []} keyExtractor={row => `${owner}:${row.duel.entry.id}`}
    ListHeaderComponent={header} contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]} initialNumToRender={4} maxToRenderPerBatch={6} windowSize={5}
    refreshing={loading && entries.length > 0} onRefresh={() => setRetry(n => n + 1)} keyboardShouldPersistTaps="handled"
    onEndReached={() => setVisible(n => Math.min(n+12,ranked.length))} onEndReachedThreshold={0.3}
    ListFooterComponent={ready && ranked.length ? <Text style={[styles.status,{color:t.textMuted}]}>Bounded discovery snapshot · pull to refresh for new Clashes.</Text> : null}
    ListEmptyComponent={ready ? <View style={[styles.notice, { borderColor: t.border }]}><Text style={[arena.type.heading, { color: t.textPrimary }]}>{current?.data.metadataError ? 'Some results are unavailable' : section === 'LIVE' ? mode === 'Following' ? 'No followed fighters in this live snapshot' : topic && mode === 'Discover' ? 'No live Clashes for this topic in this snapshot' : 'No live Clashes in this snapshot' : section === 'COMPLETED' ? 'No past Clashes to display' : 'Nothing scheduled yet'}</Text><Text style={[arena.type.body, { color: t.textSecondary }]}>{mode === 'Following' && section === 'LIVE' ? 'Only public fighters you follow appear here. Try For You or refresh later.' : 'Explore Topic rooms, or return later. Invitations are in Challenges.'}</Text></View> : null}
    renderItem={({ item: {duel, reason}, index }) => <LiveDuelCard title={duel.entry.title} state={duel.entry.state === 'COMPLETED' ? duel.entry.status.toUpperCase() : duel.entry.state} phase={duel.phase} reason={section === 'LIVE' ? reason : undefined} featured={section === 'LIVE' && index === 0} fighters={duel.fighters} identityHidden={duel.identityHidden} onOpen={() => {hapticPress();router.push(clashDiscoveryDestination(duel.entry));}} />} />;
}
const styles = StyleSheet.create({ list: { paddingHorizontal: layout.screenX, gap: 12 }, header: { paddingTop: 20, gap: 12, paddingBottom: 8 }, title: { ...arena.type.statement, fontSize: 30, lineHeight: 37 }, shortcuts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, filters: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', paddingTop: 4 }, status: { paddingVertical: 16, gap: 8 }, notice: { padding: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, gap: 8 }, topic: { padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, gap: 10, minHeight: 44 } });
