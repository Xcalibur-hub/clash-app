import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CrewListCard } from '../../../components/crews/CrewListCard';
import { EmptyState } from '../../../components/shared/EmptyState';
import { BackIcon, CreatorsIcon } from '../../../components/shared/icons';
import {
  listArenaCrews,
  listMyArenaCrews,
  type ArenaCrew,
} from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { useAuth } from '../../../store/AuthProvider';
import { layout, space, typeScale, useThemeColors } from '../../../theme';

const PAGE = 24;

/** Crew discovery — list_arena_crews + list_my_arena_crews only. */
export default function ArenaCrewsIndexScreen(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signedIn } = useAuth();

  const [mine, setMine] = React.useState<ArenaCrew[]>([]);
  const [crews, setCrews] = React.useState<ArenaCrew[]>([]);
  const [offset, setOffset] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);
  const gen = React.useRef(0);

  const load = React.useCallback(
    async (nextOffset: number, mode: 'replace' | 'refresh') => {
      const token = ++gen.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setFailed(null);
      try {
        const [own, page] = await Promise.all([
          signedIn ? listMyArenaCrews() : Promise.resolve([] as ArenaCrew[]),
          signedIn
            ? listArenaCrews({ limit: PAGE, offset: nextOffset })
            : Promise.resolve([] as ArenaCrew[]),
        ]);
        if (token !== gen.current) return;
        setMine(own);
        setCrews(page);
        setOffset(nextOffset);
        setHasMore(page.length === PAGE);
      } catch (error) {
        if (token !== gen.current) return;
        setMine([]);
        setCrews([]);
        setFailed(errorText(error) || 'Could not load Crews.');
      } finally {
        if (token === gen.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [signedIn],
  );

  useFocusEffect(
    React.useCallback(() => {
      void load(0, 'replace');
      return () => {
        gen.current += 1;
      };
    }, [load]),
  );

  // Account switch must drop previous-account Crew rows immediately.
  React.useEffect(() => {
    setMine([]);
    setCrews([]);
    setOffset(0);
    setFailed(null);
  }, [signedIn]);

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.back}
        >
          <BackIcon size={20} color={t.textPrimary} />
          <Text style={{ color: t.textPrimary }}>Back</Text>
        </Pressable>
        {signedIn ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create Crew"
            onPress={() => router.push('/arena/crews/create')}
            style={[styles.createBtn, { borderColor: t.border }]}
          >
            <Text style={[styles.createText, { color: t.textPrimary }]}>Create</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.title, { color: t.textPrimary }]}>Crews</Text>
      <Text style={[styles.sub, { color: t.textSecondary }]}>
        Discover communities, join when allowed, and keep one competitive Crew identity.
      </Text>

      {!signedIn ? (
        <EmptyState
          icon={CreatorsIcon}
          title="Sign in to explore Crews"
          body="Crew discovery and membership require an account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      ) : loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={t.textPrimary} />
      ) : failed ? (
        <EmptyState
          icon={CreatorsIcon}
          title="Couldn’t load Crews"
          body={failed}
          actionLabel="Retry"
          onAction={() => void load(0, 'replace')}
        />
      ) : (
        <FlatList
          data={crews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: layout.screenX, paddingBottom: insets.bottom + space.xl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(0, 'refresh')} />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: space.md }}>
              <Text style={[styles.section, { color: t.textPrimary }]}>Your Crews</Text>
              {mine.length === 0 ? (
                <Text style={{ color: t.textMuted, marginBottom: space.md }}>
                  You haven’t joined a Crew yet.
                </Text>
              ) : (
                mine.map((crew) => (
                  <CrewListCard
                    key={`mine-${crew.id}`}
                    crew={crew}
                    onPress={() => router.push(`/arena/crews/${crew.slug}`)}
                  />
                ))
              )}
              <Text style={[styles.section, { color: t.textPrimary }]}>Explore</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={{ color: t.textMuted }}>No Crews available right now.</Text>
          }
          renderItem={({ item }) => (
            <CrewListCard crew={item} onPress={() => router.push(`/arena/crews/${item.slug}`)} />
          )}
          ListFooterComponent={
            <View style={styles.pager}>
              {offset > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load(Math.max(0, offset - PAGE), 'replace')}
                >
                  <Text style={{ color: t.textPrimary }}>Previous</Text>
                </Pressable>
              ) : null}
              {hasMore ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load(offset + PAGE, 'replace')}
                >
                  <Text style={{ color: t.textPrimary }}>Next</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenX,
    minHeight: 44,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  createBtn: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    justifyContent: 'center',
  },
  createText: { ...typeScale.label, fontWeight: '700' },
  title: { ...typeScale.title, paddingHorizontal: layout.screenX, marginTop: space.sm },
  sub: { ...typeScale.body, paddingHorizontal: layout.screenX, marginBottom: space.md },
  section: { ...typeScale.label, fontWeight: '700', marginBottom: space.sm, marginTop: space.sm },
  pager: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
});
