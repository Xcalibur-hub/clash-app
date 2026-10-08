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

  return (
    <View style={styles.wrap} accessibilityLabel="Clashes">
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        CLASHES
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        Live Clashes
      </Text>
      <Text style={[styles.sub, { color: t.textSecondary }]}>
        Follow upcoming duels and revisit completed Clashes.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Open Challenge Inbox"
        style={[styles.row,{borderColor:t.border}]} onPress={()=>{hapticPress();router.push('/arena/challenges');}}>
        <Text style={[styles.enter,{color:t.textPrimary}]}>CHALLENGE INBOX</Text>
        <Text style={[styles.empty,{color:t.textMuted}]}>Incoming and outgoing invitations</Text>
      </Pressable>

      {loading ? <Text style={[styles.empty, { color: t.textMuted }]}>Loading Clashes…</Text> : null}
      {!user ? <Text style={[styles.empty, { color: t.textMuted }]}>Sign in to see your Challenges and Clash history.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.empty, { color: t.textMuted }]}>Couldn’t load Clashes. Retrying…</Text> : null}
      {(['PENDING', 'LIVE', 'UPCOMING', 'COMPLETED'] as ClashDiscoveryState[]).map(section => (
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
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>LIVE TOPIC ROOMS</Text>
      {live.length === 0 ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>
          No live Clashes right now.
        </Text>
      ) : (
        live.map((topic) => (
          <ClashRow
            key={topic.id}
            topic={topic}
            live
            onPress={() => {
              hapticPress();
              if (topic.viewerRoomId) onEnter(topic);
              else onWatch(topic);
            }}
          />
        ))
      )}

      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        RELEVANT
      </Text>
      {rest.length === 0 && live.length === 0 ? (
        <Text style={[styles.empty, { color: t.textMuted }]}>
          No recent Clashes to show.
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
      accessibilityLabel={`${live ? 'Live' : 'Clash'}. ${topic.title}. Enter`}
      style={[styles.row, { borderColor: t.border }]}
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
      <Text allowFontScaling={false} style={[styles.enter, { color: t.textPrimary }]}>
        ENTER
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sub: { ...typeScale.meta, fontSize: 14, lineHeight: 20, marginBottom: space.sm },
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
    padding: space.md,
    gap: space.sm,
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
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  enter: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
});
