import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowRight, Plus, Users } from 'lucide-react-native';
import { discoverArenaCrews, listArenaCrews, listMyArenaCrews, ARENA_CREW_SPECIALTIES, type ArenaCrew, type ArenaCrewDiscoverSort } from '../../../services/arenaCrewService';
import { useAuth } from '../../../store/AuthProvider';
import { layout, useThemeColors } from '../../../theme';
import { GroupCard } from './GroupIdentity';
const PAGE_SIZE = 24;
type Snapshot = {
  owner: string;
  query: string;
  nextCursor: string | null;
  mine: ArenaCrew[];
  page: ArenaCrew[];
  hasMore: boolean;
};
export function GroupDiscovery({
  refreshToken = 0,
  onParticipate,
  advanced = false
}: {
  refreshToken?: number;
  onParticipate?: () => void;
  advanced?: boolean;
}): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter();
  const {
    signedIn,
    user
  } = useAuth();
  const owner = signedIn ? user?.id ?? '' : '';
  const [mode, setMode] = React.useState<'joined' | 'explore'>('explore');
  const [specialty, setSpecialty] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<ArenaCrewDiscoverSort>('popular');
  const [cursors, setCursors] = React.useState<(string | null)[]>([null]);
  const [offset, setOffset] = React.useState(0),
    [retry, setRetry] = React.useState(0);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true),
    [failed, setFailed] = React.useState(false);
  const cursor = cursors[offset / PAGE_SIZE] ?? null;
  const query = JSON.stringify([offset, specialty, sort, advanced]);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setSnapshot(null);
    setLoading(true);
    setFailed(false);
    if (!owner) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void Promise.all([listMyArenaCrews(), advanced ? discoverArenaCrews({
      sort,
      specialty,
      limit: PAGE_SIZE,
      cursor
    }) : listArenaCrews({
      limit: PAGE_SIZE,
      offset,
      specialty
    })]).then(([mine, page]) => {
      if (!active) return;
      const rows = Array.isArray(page) ? page : page.items;
      const nextCursor = Array.isArray(page) ? null : page.nextCursor;
      setSnapshot({
        owner,
        query,
        mine,
        page: rows,
        nextCursor,
        hasMore: advanced ? Boolean(nextCursor) : rows.length === PAGE_SIZE
      });
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [owner, refreshToken, offset, specialty, retry, sort, cursor, query, advanced]));
  const data = snapshot?.owner === owner && snapshot.query === query ? snapshot : null;
  const joined = data?.mine.filter(c => c.viewer.isMember) ?? [];
  const followed = data?.mine.filter(c => !c.viewer.isMember && c.viewer.isFollowing) ?? [];
  const page = mode === 'joined' ? joined : data?.page ?? [];
  const open = (crew: ArenaCrew): void => {
    router.push(`/arena/crews/${crew.slug}`);
  };
  return <View style={styles.wrap} accessibilityLabel="Arena Groups">
    <View style={styles.heading}><View style={styles.flex}><Text style={[styles.eyebrow, {
          color: t.textMuted
        }]}>FIND YOUR CIRCLE</Text>
      <Text style={[styles.title, {
          color: t.textPrimary
        }]}>Better together.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create a group" onPress={() => router.push(owner ? '/arena/crews/create' : '/auth')} style={[styles.create, {
        backgroundColor: t.textPrimary
      }]}><Plus size={22} color={t.background} /></Pressable></View>
    <Text style={[styles.description, {
      color: t.textSecondary
    }]}>Shared interests. Different perspectives. A place for your people.</Text>
    <View style={[styles.switch, {
      backgroundColor: t.surface
    }]}>{(['joined', 'explore'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{
        selected: mode === key
      }} onPress={() => setMode(key)} style={[styles.tab, {
        backgroundColor: mode === key ? t.surfaceElevated : 'transparent'
      }]}>
      <Text style={{
          color: mode === key ? t.textPrimary : t.textMuted,
          fontSize: 14,
          fontWeight: '600'
        }}>{key === 'joined' ? 'Joined' : 'Explore'}</Text></Pressable>)}</View>
    {mode === 'explore' && advanced ? <View style={styles.heading}>{(['popular', 'rising', 'recent'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{
        selected: sort === key
      }} onPress={() => {
        setOffset(0);
        setCursors([null]);
        setSort(key);
      }} style={styles.action}><Text style={{
          color: sort === key ? t.textPrimary : t.textMuted
        }}>{key === 'recent' ? 'New' : key === 'rising' ? 'Rising' : 'Popular'}</Text></Pressable>)}</View> : null}
    {mode === 'explore' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {[null, ...ARENA_CREW_SPECIALTIES].map(tag => <Pressable key={tag ?? 'all'} accessibilityRole="button" accessibilityState={{
        selected: specialty === tag
      }} onPress={() => {
        setOffset(0);
        setCursors([null]);
        setSpecialty(tag);
      }} style={[styles.filter, {
        borderColor: specialty === tag ? t.textSecondary : t.border
      }]}>
        <Text style={{
          color: specialty === tag ? t.textPrimary : t.textMuted,
          fontSize: 12
        }}>{tag ?? 'All interests'}</Text></Pressable>)}</ScrollView> : null}
    {!owner ? <View style={[styles.empty, {
      borderColor: t.border
    }]}><Users size={27} color={t.textMuted} /><Text style={[styles.section, {
        color: t.textPrimary
      }]}>Find your people</Text>
      <Text style={[styles.description, {
        color: t.textSecondary
      }]}>Sign in to discover groups and manage your membership.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/auth')} style={styles.action}><Text style={{
          color: t.textPrimary
        }}>Sign in</Text><ArrowRight size={16} color={t.textPrimary} /></Pressable></View> : loading || !data && !failed ? <View style={styles.empty}><ActivityIndicator color={t.textMuted} accessibilityLabel="Loading groups" /></View> : failed ? <View style={styles.empty}><Text style={[styles.description, {
        color: t.textSecondary
      }]}>Groups couldn’t be loaded.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={styles.action}><Text style={{
          color: t.textPrimary
        }}>Try again</Text></Pressable></View> : <><View style={styles.heading}><Text style={[styles.section, {
          color: t.textPrimary
        }]}>{mode === 'joined' ? 'Your membership' : specialty ?? 'Explore communities'}</Text></View>
            {page.length ? page.map((crew, i) => <GroupCard key={crew.id} crew={crew} featured={i === 0} onPress={() => open(crew)} />) : <View style={[styles.empty, {
        borderColor: t.border
      }]}><Users size={24} color={t.textMuted} /><Text style={[styles.section, {
          color: t.textPrimary
        }]}>{mode === 'joined' ? 'Your circle starts here' : 'Nothing here yet'}</Text><Text style={[styles.description, {
          color: t.textSecondary
        }]}>{mode === 'joined' ? 'Join one Crew, and follow others to keep them close.' : 'No groups match this interest. Try another or create your own.'}</Text></View>}
            {mode === 'joined' && followed.length ? <><Text style={[styles.section, {
          color: t.textPrimary
        }]}>Following</Text>{followed.map(crew => <GroupCard key={crew.id} crew={crew} onPress={() => open(crew)} />)}</> : null}
            {mode === 'explore' ? <View style={styles.heading}>
              <Pressable accessibilityRole="button" disabled={!offset} accessibilityState={{
          disabled: !offset
        }} onPress={() => setOffset(n => Math.max(0, n - PAGE_SIZE))} style={styles.action}><Text style={{
            color: offset ? t.textPrimary : t.textMuted
          }}>Previous</Text></Pressable>
              <Text style={{
          color: t.textMuted,
          fontSize: 12
        }}>Page {offset / PAGE_SIZE + 1}</Text>
              <Pressable accessibilityRole="button" disabled={!data?.hasMore} accessibilityState={{
          disabled: !data?.hasMore
        }} onPress={() => {
          if (advanced) setCursors(prev => [...prev.slice(0, offset / PAGE_SIZE + 1), data?.nextCursor ?? null]);
          setOffset(n => n + PAGE_SIZE);
        }} style={styles.action}><Text style={{
            color: data?.hasMore ? t.textPrimary : t.textMuted
          }}>Next</Text></Pressable></View> : null}</>}
    {onParticipate ? <Pressable accessibilityRole="button" onPress={onParticipate} style={styles.action}><Text style={{
        color: t.textSecondary
      }}>Back to Home</Text><ArrowRight size={16} color={t.textMuted} /></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 18
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  flex: {
    flex: 1
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.1,
    marginBottom: 9
  },
  title: {
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -1.2
  },
  create: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16
  },
  description: {
    fontSize: 14,
    lineHeight: 22
  },
  switch: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: 16,
    gap: 5
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filters: {
    gap: 8
  },
  filter: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    minHeight: 44,
    paddingHorizontal: 15,
    justifyContent: 'center'
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 24,
    alignItems: 'flex-start',
    gap: 12
  },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 6
  }
});
