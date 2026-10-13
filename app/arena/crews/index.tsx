/**
 * Crew discovery — popular / rising / specialty rhythm.
 * MAKE YOUR CREW FAMOUS.
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CrewDiscoveryRow, CrewFeatured } from '../../../components/crews/CrewDiscoveryItems';
import { CrewRisingStrip } from '../../../components/crews/CrewRisingStrip';
import {
  CrewSpecialtyRail,
  type CrewSpecialtyFilter,
} from '../../../components/crews/CrewSpecialtyRail';
import { EmptyState } from '../../../components/shared/EmptyState';
import { BackIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import {
  discoverArenaCrews,
  listMyArenaCrews,
  listRisingArenaCrews,
  type ArenaCrew,
  type ArenaCrewDiscoverSort,
} from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { Users } from 'lucide-react-native';

const SORTS: readonly { key: ArenaCrewDiscoverSort; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'rising', label: 'Rising' },
  { key: 'recent', label: 'New' },
];

export default function CrewDiscoveryScreen(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const reduced = useReducedMotion();

  const [sort, setSort] = React.useState<ArenaCrewDiscoverSort>('popular');
  const [specialty, setSpecialty] = React.useState<CrewSpecialtyFilter>('All');
  const [items, setItems] = React.useState<ArenaCrew[]>([]);
  const [rising, setRising] = React.useState<ArenaCrew[]>([]);
  const [mine, setMine] = React.useState<ArenaCrew[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const specParam = specialty === 'All' ? null : specialty;

  const loadFirst = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [page, risingList, myCrews] = await Promise.all([
        discoverArenaCrews({ sort, specialty: specParam, limit: 20 }),
        listRisingArenaCrews(8),
        listMyArenaCrews().catch(() => [] as ArenaCrew[]),
      ]);
      setItems(page.items);
      setCursor(page.nextCursor);
      setRising(risingList);
      setMine(myCrews);
    } catch (e) {
      setError(errorText(e));
      setItems([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [sort, specParam]);

  useFocusEffect(
    React.useCallback(() => {
      void loadFirst();
    }, [loadFirst, refreshKey]),
  );

  const loadMore = React.useCallback(async (): Promise<void> => {
    if (!cursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const page = await discoverArenaCrews({
        sort,
        specialty: specParam,
        limit: 20,
        cursor,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
      });
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, loading, sort, specParam]);

  const openCrew = React.useCallback(
    (crew: ArenaCrew): void => {
      if (!requireAuth()) return;
      router.push(`/arena/crews/${crew.slug}`);
    },
    [requireAuth, router],
  );

  const featured = items[0] ?? null;
  const rest = featured ? items.slice(1) : items;
  const risingForStrip = rising.filter((c) => c.id !== featured?.id).slice(0, 8);

  const listHeader = (
    <View>
      {mine.length === 0 && !loading ? (
        <View style={[styles.solo, { borderBottomColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.soloTitle, { color: t.textPrimary }]}>
            YOU'RE FIGHTING SOLO
          </Text>
          <Text allowFontScaling={false} style={[styles.soloBody, { color: t.textMuted }]}>
            Find a Crew and put a name behind your takes.
          </Text>
        </View>
      ) : null}

      <View style={styles.sortRow}>
        {SORTS.map((s) => {
          const active = s.key === sort;
          return (
            <Pressable
              key={s.key}
              onPress={() => {
                hapticTap();
                setSort(s.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[
                styles.sortChip,
                { backgroundColor: active ? t.pill : 'transparent' },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={{
                  ...typeScale.label,
                  fontSize: 13,
                  fontWeight: active ? '700' : '500',
                  color: active ? t.pillText : t.textMuted,
                }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            hapticTap();
            if (!requireAuth()) return;
            router.push('/arena/crews/create');
          }}
          accessibilityRole="button"
          accessibilityLabel="Create a Crew"
          hitSlop={8}
        >
          <Text allowFontScaling={false} style={[styles.create, { color: t.textPrimary }]}>
            Create
          </Text>
        </Pressable>
      </View>

      <CrewSpecialtyRail selected={specialty} onChange={setSpecialty} />

      {featured && !loading ? (
        <Animated.View
          key={`${sort}:${specialty}:${featured.id}`}
          entering={reduced ? undefined : FadeIn.duration(220)}
          exiting={reduced ? undefined : FadeOut.duration(120)}
        >
          <CrewFeatured crew={featured} onPress={() => openCrew(featured)} />
          {sort === 'popular' ? (
            <CrewRisingStrip crews={risingForStrip} onOpen={openCrew} />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <BackIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>
        <Text allowFontScaling={false} style={[styles.barTitle, { color: t.textPrimary }]}>
          Crews
        </Text>
      </View>

      {error ? (
        <Text allowFontScaling={false} style={[styles.error, { color: t.textMuted }]}>
          {error}
        </Text>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={t.textMuted} />
        </View>
      ) : !loading && items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="QUIET OVER HERE"
          body="No Crews are making noise in this category yet."
          actionLabel="CREATE A CREW"
          onAction={() => {
            if (!requireAuth()) return;
            router.push('/arena/crews/create');
          }}
        />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: ListRenderItemInfo<ArenaCrew>) => (
            <CrewDiscoveryRow
              crew={item}
              rising={sort === 'rising'}
              onPress={() => openCrew(item)}
            />
          )}
          ListHeaderComponent={listHeader}
          onEndReached={() => {
            void loadMore();
          }}
          onEndReachedThreshold={0.4}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          refreshing={loading}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={t.textMuted} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  barTitle: { ...typeScale.title, fontSize: 20, fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  solo: {
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  soloTitle: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  soloBody: { ...typeScale.meta, fontSize: 13 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  create: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    ...typeScale.meta,
    fontSize: 13,
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
  },
});
