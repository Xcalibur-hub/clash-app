/**
 * Arena Clashes surface — competitive list from real live topic data only.
 * No fabricated viewers, timers, scores, or momentum.
 */
import React from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveArenaTopic } from '../../services/liveArenaService';
import { fetchClashDiscovery } from '../../services/arenaClashDiscoveryService';
import { useAuth } from '../../store/AuthProvider';
import { clashDiscoveryDestination, type ClashDiscoveryEntry, type ClashDiscoveryState } from '../../utils/arenaClashDiscovery';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { plural } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';
import { LivePulse } from '../liveArena/LivePulse';

export interface ArenaClashesProps {
  topics: readonly LiveArenaTopic[];
  onEnter: (topic: LiveArenaTopic) => void;
  onWatch: (topic: LiveArenaTopic) => void;
}

function isLive(topic: LiveArenaTopic): boolean {
  return (
    topic.status === 'live' &&
    (topic.phase === 'open' || topic.phase === 'final_arguments')
  );
}

export function ArenaClashes({
  topics,
  onEnter,
  onWatch,
}: ArenaClashesProps): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const [discovery, setDiscovery] = React.useState<{ ownerId: string | null; entries: ClashDiscoveryEntry[] }>({ ownerId: null, entries: [] });
  const entries = discovery.ownerId === (user?.id ?? null) ? discovery.entries : [];
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    let request = 0;
    setDiscovery({ ownerId: user?.id ?? null, entries: [] });
    setLoading(true);
    setError(false);
    const load = async (): Promise<void> => {
      const current = ++request;
      if (!user) { setLoading(false); return; }
      try {
        const result = await fetchClashDiscovery();
        if (active && current === request) { setDiscovery({ ownerId: user.id, entries: result }); setError(false); }
      } catch { if (active && current === request) setError(true); }
      finally { if (active && current === request) setLoading(false); }
    };
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => { active = false; clearInterval(timer); };
  }, [user?.id]));
  const live = topics.filter(isLive);
  const rest = topics.filter((topic) => !isLive(topic));
  const liveEntries = entries.filter((entry) => entry.state === 'LIVE');
  const hasLive = live.length > 0 || liveEntries.length > 0;

  return (
    <View style={styles.wrap} accessibilityLabel="Clashes">
      <View style={[styles.liveIntro, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
        <View style={styles.liveTopline}>
          {hasLive ? <LivePulse dotOnly size={8} /> : <View style={[styles.idleDot, { backgroundColor: t.textMuted }]} />}
          <Text style={[styles.kicker, { color: t.textSecondary }]}>ARENA LIVE</Text>
          <Text style={[styles.liveCount, { color: t.textMuted }]}>
            {loading ? 'Checking live…' : error ? 'Live count unavailable' : `${live.length + liveEntries.length} live now`}
          </Text>
        </View>
        <Text allowFontScaling style={[styles.title, { color: t.textPrimary }]}>Where takes meet their match.</Text>
        <Text style={[styles.sub, { color: t.textSecondary }]}>
          Two sides. One room. Follow the arguments, back a fighter, and see where the crowd stands.
        </Text>
        {!hasLive && (loading || error) ? (
          <Text style={[styles.empty, { color: t.textMuted }]}>
            {loading ? 'Loading live Clashes…' : 'Couldn’t load live Clashes. Retrying…'}
          </Text>
        ) : !hasLive ? (
          <View style={styles.noLive}>
            <Text style={[styles.noLiveTitle, { color: t.textPrimary }]}>The stage is quiet.</Text>
            <Text style={[styles.empty, { color: t.textMuted }]}>
              The next live duel will appear here. Until then, catch up on your challenges.
            </Text>
            <Pressable accessibilityRole="button" style={[styles.secondaryAction, { borderColor: t.border }]}
              onPress={() => { hapticPress(); router.push('/arena/challenges'); }}>
              <Text style={[styles.enter, { color: t.textPrimary }]}>VIEW MY CHALLENGES →</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.liveStack}>
            {liveEntries.map((entry) => (
              <Pressable key={entry.id} accessibilityRole="button"
                accessibilityLabel={`Watch live Clash: ${entry.title}`}
                style={[styles.row, styles.featuredDuel, { borderColor: t.border, backgroundColor: t.surface }]}
                onPress={() => { hapticPress(); router.push(clashDiscoveryDestination(entry)); }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.liveLabel, { color: t.textPrimary }]}>
                    {entry.roomId ? '● LIVE DUEL' : '● LIVE CLASH'}
                  </Text>
                  <Text style={[styles.meta, { color: t.textMuted }]}>HAPPENING NOW</Text>
                </View>
                <Text style={[styles.proposition, { color: t.textPrimary }]} numberOfLines={3}>{entry.title}</Text>
                <View style={styles.actionLine}><Text style={[styles.enter, { color: t.textPrimary }]}>{entry.roomId ? 'WATCH THE DUEL' : 'VIEW LIVE CLASH'}</Text><Text style={[styles.actionArrow, { color: t.textPrimary }]}>↗</Text></View>
              </Pressable>
            ))}
            {live.map((topic) => (
              <ClashRow key={topic.id} topic={topic} live onPress={() => {
                hapticPress();
                if (topic.viewerRoomId) onEnter(topic); else onWatch(topic);
              }} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.liveSecondary}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Challenge Inbox"
          onPress={() => { hapticPress(); router.push('/arena/challenges'); }}
          style={[styles.quickLink, { borderColor: t.border }]}>
          <Text style={[styles.quickTitle, { color: t.textPrimary }]}>Challenges ↗</Text>
          <Text style={[styles.quickSub, { color: t.textMuted }]}>Invites and requests</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Hall of Fame archive"
          onPress={() => { hapticPress(); router.push('/arena/hall-of-fame'); }}
          style={[styles.quickLink, { borderColor: t.border }]}>
          <Text style={[styles.quickTitle, { color: t.textPrimary }]}>Hall of Fame ↗</Text>
          <Text style={[styles.quickSub, { color: t.textMuted }]}>Past verdicts</Text>
        </Pressable>
      </View>
      <Text style={[styles.section, { color: t.textMuted }]}>YOUR ACTIVITY</Text>
      {loading ? <Text style={[styles.empty, { color: t.textMuted }]}>Loading Clashes…</Text> : null}
      {!user ? <Text style={[styles.empty, { color: t.textMuted }]}>Sign in to see your Challenges and Clash history.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.empty, { color: t.textMuted }]}>Couldn’t load Clashes. Retrying…</Text> : null}
      {(['PENDING', 'UPCOMING', 'COMPLETED'] as ClashDiscoveryState[]).filter(section =>
        entries.some(entry => entry.state === section)
      ).map(section => (
        <View key={section}>
          <Text style={[styles.section, { color: t.textMuted }]}>{section}</Text>
          {user && !loading && !error && !entries.some(entry => entry.state === section) ? (
            <Text style={[styles.empty, { color: t.textMuted }]}>No {section.toLowerCase()} Clashes.</Text>
          ) : null}
          {entries.filter(entry => entry.state === section).map(entry => (
            <Pressable key={entry.id} style={[styles.row, { borderColor: t.border }]}
              accessibilityRole="button" accessibilityLabel={`${entry.state}. ${entry.title}. ${entry.kind === 'CHALLENGE' ? 'View Take' : 'Open Clash'}`}
              onPress={() => { hapticPress(); router.push(clashDiscoveryDestination(entry)); }}>
              <Text style={[styles.phase, { color: t.textMuted }]}>{entry.status.toUpperCase()}</Text>
              <Text style={[styles.proposition, { color: t.textPrimary }]} numberOfLines={3}>{entry.title}</Text>
              <Text style={[styles.enter, { color: t.textPrimary }]}>{entry.kind === 'CHALLENGE' ? 'VIEW TAKE · AWAITING ACCEPTANCE' : entry.state === 'COMPLETED' ? 'VIEW CLASH' : 'OPEN CLASH'}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        TOPIC ROOMS
      </Text>
      {rest.length === 0 && live.length === 0 ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>
          No topic rooms to explore right now.
        </Text>
      ) : (
        rest.map((topic) => (
          <ClashRow
            key={topic.id}
            topic={topic}
            live={false}
            onPress={() => {
              hapticPress();
              if (topic.viewerRoomId) onEnter(topic);
              else onWatch(topic);
            }}
          />
        ))
      )}
    </View>
  );
}

function ClashRow({
  topic,
  live,
  onPress,
}: {
  topic: LiveArenaTopic;
  live: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${live ? 'Live' : 'Clash'}. ${topic.title}. ${topic.viewerRoomId ? 'Enter your room' : 'View topic'}`}
      style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <View style={styles.rowTop}>
        {live ? (
          <View style={styles.liveBadge}>
            <LivePulse dotOnly size={6} />
            <Text allowFontScaling={false} style={[styles.liveLabel, { color: t.textPrimary }]}>
              LIVE
            </Text>
          </View>
        ) : (
          <Text allowFontScaling={false} style={[styles.phase, { color: t.textMuted }]}>
            {topic.phase.replace(/_/g, ' ').toUpperCase()}
          </Text>
        )}
        {topic.participantCount > 0 ? (
          <Text style={[styles.meta, { color: t.textMuted }]}>
            {plural(topic.participantCount, 'joined', 'joined')}
          </Text>
        ) : null}
      </View>
      <Text
        allowFontScaling
        numberOfLines={3}
        style={[styles.proposition, { color: t.textPrimary }]}
      >
        {topic.title}
      </Text>
      <View style={styles.actionLine}>
        <Text allowFontScaling={false} style={[styles.enter, { color: t.textPrimary }]}>
          {topic.viewerRoomId ? 'ENTER YOUR ROOM' : 'VIEW DISCUSSION'}
        </Text>
        <Text style={[styles.actionArrow, { color: t.textPrimary }]}>↗</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  liveIntro: { marginTop: space.md, borderWidth: 1, borderRadius: 26, padding: 22, gap: space.sm },
  liveTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  idleDot: { width: 8, height: 8, borderRadius: 4 },
  liveCount: { marginLeft: 'auto', fontSize: 11, fontWeight: '700' },
  liveStack: { gap: 10, marginTop: space.md },
  featuredDuel: { borderWidth: 1.2, paddingVertical: 20, gap: 14 },
  actionLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  actionArrow: { fontSize: 20, fontWeight: '600' },
  noLive: { gap: 12, marginTop: space.md, paddingVertical: space.md },
  noLiveTitle: { fontSize: 20, letterSpacing: -0.5, fontWeight: '800' },
  secondaryAction: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 12 },
  liveSecondary: { flexDirection: 'row', gap: 10, marginTop: space.md },
  quickLink: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 15, padding: 12, gap: 5 },
  quickTitle: { fontSize: 13, fontWeight: '800' },
  quickSub: { fontSize: 11 },

  hallEntry: { borderRadius: 24, padding: 20, gap: 8, marginVertical: 8 },
  hallEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  hallTitle: { fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8 },
  hallSub: { fontSize: 13, fontWeight: '600' },
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    ...typeScale.section,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  sub: { ...typeScale.meta, fontSize: 14, lineHeight: 21, marginBottom: space.sm },
  section: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: space.md,
  },
  empty: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 18,
    gap: 12,
    marginTop: space.xs,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveLabel: {
    ...typeScale.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  phase: { ...typeScale.caption, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  meta: { ...typeScale.caption, fontSize: 12 },
  proposition: {
    ...typeScale.label,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 25,
    letterSpacing: -0.45,
  },
  enter: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
});
