/** Discovery uses server states; preview reads never create Room membership. */
import React from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveArenaTopic } from '../../services/liveArenaService';
import { fetchClashDiscovery } from '../../services/arenaClashDiscoveryService';
import { fetchClashView, type ClashView } from '../../services/clashEngineService';
import { useAuth } from '../../store/AuthProvider';
import { clashDiscoveryDestination, type ClashDiscoveryEntry } from '../../utils/arenaClashDiscovery';
import { layout, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { LiveDuelCard } from './LiveDuelCard';
import { ArenaButton } from './ui/ArenaPrimitives';
import { arena } from '../../theme/arena';
export interface ArenaClashesProps {
  bottomPadding?: number;
  topics: readonly LiveArenaTopic[];
  topicsLoading?: boolean;
  topicsError?: boolean;
  onEnter: (topic: LiveArenaTopic) => void;
  onWatch: (topic: LiveArenaTopic) => void;
}
const isLive = (topic: LiveArenaTopic): boolean => topic.status === 'live' && (topic.phase === 'open' || topic.phase === 'final_arguments');
export function ArenaClashes({
  topics,
  bottomPadding = 24,
  topicsLoading = false,
  topicsError = false,
  onEnter,
  onWatch
}: ArenaClashesProps): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter(),
    {
      user
    } = useAuth();
  const owner = user?.id ?? null;
  const [section, setSection] = React.useState<'LIVE' | 'UPCOMING' | 'COMPLETED' | 'TOPICS'>('LIVE');
  const [discovery, setDiscovery] = React.useState<{
    ownerId: string | null;
    entries: ClashDiscoveryEntry[];
  }>({
    ownerId: null,
    entries: []
  });
  const [loading, setLoading] = React.useState(true),
    [error, setError] = React.useState(false),
    [retry, setRetry] = React.useState(0);
  const entries = discovery.ownerId === owner ? discovery.entries : [];
  useFocusEffect(React.useCallback(() => {
    let active = true,
      request = 0;
    setDiscovery({
      ownerId: owner,
      entries: []
    });
    setLoading(Boolean(owner));
    setError(false);
    const load = async (): Promise<void> => {
      const current = ++request;
      if (!owner) return;
      try {
        const result = await fetchClashDiscovery();
        if (active && current === request) {
          setDiscovery({
            ownerId: owner,
            entries: result
          });
          setError(false);
        }
      } catch {
        if (active && current === request) setError(true);
      } finally {
        if (active && current === request) setLoading(false);
      }
    };
    void load();
    const timer = owner ? setInterval(() => void load(), 20_000) : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [owner, retry]));
  const liveEntries = entries.filter(entry => entry.kind === 'CLASH' && entry.state === section);
  const pending = entries.filter(entry => entry.state === 'PENDING').length;
  const topicMode = section === 'TOPICS';
  const header = <View style={styles.header}>
    <Text style={[arena.type.eyebrow, { color: t.textMuted }]}>TWO PERSPECTIVES. ONE STAGE.</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>{section === 'COMPLETED' ? 'Past Clashes.' : 'Find your next debate.'}</Text>
    <Text style={[arena.type.body, { color: t.textSecondary }]}>Watch the arguments unfold. Join the conversation.</Text>
    <View style={styles.shortcuts}><ArenaButton label={pending ? `Challenges · ${pending}` : 'Challenges'} accessibilityLabel="Open Challenge Inbox" onPress={() => router.push('/arena/challenges')} /><ArenaButton label="Results" accessibilityLabel="Open Clash history" variant="tertiary" onPress={() => setSection('COMPLETED')} />{section === 'COMPLETED' ? <ArenaButton label="Hall of Fame ↗" accessibilityLabel="Open Hall of Fame archive" variant="tertiary" onPress={() => router.push('/arena/hall-of-fame')} /> : null}</View>
    <View style={styles.filters} accessibilityRole="tablist">{(['LIVE', 'UPCOMING', 'TOPICS'] as const).map(value => <ArenaButton key={value} label={value === 'LIVE' ? 'On now' : value === 'UPCOMING' ? 'Coming up' : 'Topic rooms'} selected={section === value} variant={section === value ? 'secondary' : 'tertiary'} onPress={() => setSection(value)} />)}</View>
    <Text style={[arena.type.meta, { color: t.textMuted }]}>{topicMode ? 'Group conversations, away from the 1v1 stage' : section === 'COMPLETED' ? 'Finished debates and cancelled Clashes' : section === 'LIVE' ? 'Live arguments. An open conversation.' : 'Coming up · Not live yet'}</Text>
    {!owner && !topicMode ? <ArenaButton label="Sign in to discover Clashes" onPress={() => router.push('/auth')} /> : null}
    {(topicMode ? topicsLoading : loading) ? <Text accessibilityLiveRegion="polite" style={[styles.status, { color: t.textMuted }]}>Loading {topicMode ? 'discussions' : 'Clashes'}…</Text> : (topicMode ? topicsError : error) ? <View style={styles.status}><Text accessibilityRole="alert" style={[arena.type.body, { color: t.textSecondary }]}>Couldn’t load {topicMode ? 'discussions' : 'Clashes'}. These are not empty results.</Text>{!topicMode ? <ArenaButton label="Try again" onPress={() => setRetry(n => n + 1)} /> : <Text style={{ color: t.textMuted }}>Return to Home and pull to refresh discussions.</Text>}</View> : null}
  </View>;
  const ready = topicMode ? !topicsLoading && !topicsError : !!owner && !loading && !error;
  // One virtualized owner of vertical scrolling. Topic rooms and duels never mix.
  if (topicMode) return <FlatList key={`topics:${owner}`} style={{ flex: 1 }} data={ready ? [...topics].sort((a,b) => Number(isLive(b))-Number(isLive(a))) : []} keyExtractor={topic => topic.id}
    ListHeaderComponent={header} contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]} initialNumToRender={6} windowSize={5} keyboardShouldPersistTaps="handled"
    ListEmptyComponent={ready ? <Text style={[styles.status, { color: t.textMuted }]}>No topic rooms to explore right now.</Text> : null}
    renderItem={({ item: topic }) => <Pressable accessibilityRole="button" accessibilityLabel={`${topic.phase}. ${topic.title}. ${topic.viewerRoomId ? 'Enter your room' : 'View topic'}`} onPress={() => { hapticPress(); if (topic.viewerRoomId) onEnter(topic); else onWatch(topic); }} style={[styles.topic, { borderColor: t.border, backgroundColor: t.surface }]}><Text style={[arena.type.eyebrow, { color: t.textMuted }]}>{isLive(topic) ? 'LIVE DISCUSSION' : topic.phase.replace(/_/g, ' ').toUpperCase()}</Text><Text style={[arena.type.heading, { color: t.textPrimary }]}>{topic.title}</Text><Text style={[arena.type.meta, { color: t.textSecondary }]}>{topic.participantCount} joined · {topic.viewerRoomId ? 'Enter your room' : 'View discussion'} ↗</Text></Pressable>} />;
  return <FlatList key={`duels:${owner}:${section}`} style={{ flex: 1 }} data={ready ? liveEntries : []} keyExtractor={entry => `${owner}:${entry.id}`}
    ListHeaderComponent={header} contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]} initialNumToRender={4} maxToRenderPerBatch={6} windowSize={5}
    refreshing={loading && entries.length > 0} onRefresh={() => setRetry(n => n + 1)} keyboardShouldPersistTaps="handled"
    ListEmptyComponent={ready ? <View style={[styles.notice, { borderColor: t.border }]}><Text style={[arena.type.heading, { color: t.textPrimary }]}>{section === 'LIVE' ? 'No live Clashes right now' : section === 'COMPLETED' ? 'No past Clashes to display' : 'Nothing scheduled yet'}</Text><Text style={[arena.type.body, { color: t.textSecondary }]}>Invitations are in Challenges. Finished debates stay in Results.</Text></View> : null}
    renderItem={({ item: entry, index }) => <DuelDiscoveryCard entry={entry} featured={section === 'LIVE' && index === 0} loadIdentity onOpen={() => { hapticPress(); router.push(clashDiscoveryDestination(entry)); }} />} />;
}
function DuelDiscoveryCard({
  entry,
  loadIdentity,
  featured,
  onOpen
}: {
  entry: ClashDiscoveryEntry;
  loadIdentity: boolean;
  featured?: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const {
    user
  } = useAuth();
  const owner = user?.id ?? null;
  const [preview, setPreview] = React.useState<{
    owner: string;
    view: ClashView | null;
  } | null>(null);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setPreview(null);
    if (owner && loadIdentity) void fetchClashView(entry.id).then(view => {
      if (active) setPreview({
        owner,
        view: view && view.clashId === entry.id && view.roomId === entry.roomId ? view : null
      });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [entry.id, entry.roomId, owner, loadIdentity]));
  const view = preview?.owner === owner ? preview?.view : null;
  const ended = view && view.status !== 'open';
  if (preview?.owner === owner && !preview.view) return <View style={[styles.notice, {
    borderColor: t.border
  }]}><Text style={[arena.type.body, {
      color: t.textSecondary
    }]}>This Clash is no longer available. Pull down to refresh discovery.</Text></View>;
  return <LiveDuelCard title={entry.title} state={ended ? view.status.toUpperCase() : entry.state === 'COMPLETED' ? entry.status.toUpperCase() : entry.state} featured={featured && !ended} fighters={view?.revealed ? [view.sideA, view.sideB] : undefined} identityHidden={view?.mode === "BLIND" && !view.revealed} onOpen={onOpen} />;
}
const styles = StyleSheet.create({ list: { paddingHorizontal: layout.screenX, gap: 12 }, header: { paddingTop: 20, gap: 12, paddingBottom: 8 }, title: { ...arena.type.statement, fontSize: 30, lineHeight: 37 }, shortcuts: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, filters: { flexDirection: "row", gap: 4, flexWrap: "wrap", paddingTop: 4 }, status: { paddingVertical: 16, gap: 8 }, notice: { padding: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, gap: 8 }, topic: { padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, gap: 10, minHeight: 44 } });
