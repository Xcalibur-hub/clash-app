import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CountryPickerSheet } from '../../components/explore/CountryPickerSheet';
import { ExploreDiscoveryCard } from '../../components/explore/ExploreDiscoveryCard';
import { ExploreMediaTile } from '../../components/explore/ExploreMediaTile';
import { ExploreModeBar } from '../../components/explore/ExploreModeBar';
import { ExploreSearch } from '../../components/explore/ExploreSearch';
import { ExploreWorldCanvas, type WorldVisualMode } from '../../components/explore/ExploreWorldCanvas';
import { Avatar } from '../../components/shared/Avatar';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { Notice } from '../../components/shared/Notice';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { countryByCode } from '../../data/exploreCountries';
import { analytics } from '../../services/analytics';
import { PlayHomePanel } from '../../components/play/PlayHomePanel';
import {
  fetchExploreForYou,
  fetchExploreLive,
  fetchExploreWorldSummary,
  fetchTeleportCandidate,
  rememberTeleportId,
  readTeleportHistory,
  searchExplore,
  type ExploreForYouItem,
  type ExploreLiveFeed,
  type ExploreSearchResults,
  type ExploreTeleportCandidate,
  type ExploreWorldSummary,
} from '../../services/exploreService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import {
  dedupeExploreItems,
  diversifyByCreator,
  EXPLORE_SEARCH_GROUPS,
  type ExploreMode,
  type ExploreSearchGroup,
} from '../../utils/exploreForYouRank';
import { tap as hapticTap } from '../../utils/haptics';

type ForYouFilter = 'all' | 'trending' | 'arena' | 'vault' | 'creators' | 'video' | 'challenges';

/**
 * EXPLORE IA: For You | World | Live | Play | Meet
 * Search sticky near top. Meet never buried under the feed.
 */
export default function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [mode, setMode] = React.useState<ExploreMode>('for_you');
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 280);
  const searching = debounced.trim().length >= 2;
  const [searchGroup, setSearchGroup] = React.useState<ExploreSearchGroup>('top');
  const [searchResults, setSearchResults] = React.useState<ExploreSearchResults | null>(null);

  const [summary, setSummary] = React.useState<ExploreWorldSummary | null>(null);
  const [forYou, setForYou] = React.useState<ExploreForYouItem[]>([]);
  const [forYouCursor, setForYouCursor] = React.useState<number | null>(0);
  const [forYouFilter, setForYouFilter] = React.useState<ForYouFilter>('all');
  const [live, setLive] = React.useState<ExploreLiveFeed | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [worldVisual, setWorldVisual] = React.useState<WorldVisualMode>('globe');
  const [spinToken, setSpinToken] = React.useState(0);
  const [spinLng, setSpinLng] = React.useState<number | null>(null);
  const [teleporting, setTeleporting] = React.useState(false);
  const [teleportReveal, setTeleportReveal] = React.useState<ExploreTeleportCandidate | null>(null);
  const [selectedCountry, setSelectedCountry] = React.useState<string | null>(null);

  React.useEffect(() => {
    analytics.track('explore_opened', { realm: 'arena', source: 'explore' });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchExploreWorldSummary(), fetchExploreForYou(24, 0), fetchExploreLive(20)])
      .then(([world, page, liveFeed]) => {
        if (cancelled) return;
        setSummary(world);
        const mixed = diversifyByCreator(dedupeExploreItems(page.items));
        setForYou(mixed);
        setForYouCursor(page.nextCursor);
        setLive(liveFeed);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!searching) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    void searchExplore(debounced)
      .then((results) => {
        if (!cancelled) {
          setSearchResults(results);
          analytics.track('explore_country_searched', {
            realm: 'arena',
            source: 'explore',
            has_query: true,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [debounced, searching]);

  const openCountry = React.useCallback(
    (code: string) => {
      setSelectedCountry(code);
      setRecent((prev) => [code, ...prev.filter((c) => c !== code)].slice(0, 8));
      setMode('world');
    },
    [],
  );

  const goCountryPage = React.useCallback(
    (code: string) => {
      setRecent((prev) => [code, ...prev.filter((c) => c !== code)].slice(0, 8));
      router.push(`/explore/country/${code}`);
    },
    [router],
  );

  const teleport = React.useCallback(async () => {
    if (teleporting) return;
    setMode('world');
    setTeleporting(true);
    setTeleportReveal(null);
    hapticTap();
    analytics.track('explore_teleport', { realm: 'arena', source: 'explore' });
    try {
      const candidate = await fetchTeleportCandidate(readTeleportHistory());
      if (!candidate) {
        setTeleporting(false);
        return;
      }
      rememberTeleportId(candidate.id);
      const lng = candidate.countryCode
        ? countryByCode(candidate.countryCode)?.lng ?? null
        : Math.random() * 360 - 180;
      setSpinLng(lng);
      setSpinToken((n) => n + 1);
      if (candidate.countryCode) setSelectedCountry(candidate.countryCode);
      setTimeout(() => {
        setTeleportReveal(candidate);
        setTeleporting(false);
      }, reduced ? 120 : 560);
    } catch {
      setTeleporting(false);
    }
  }, [reduced, teleporting]);

  const loadMoreForYou = React.useCallback(async () => {
    if (loadingMore || forYouCursor == null) return;
    setLoadingMore(true);
    try {
      const page = await fetchExploreForYou(24, forYouCursor);
      setForYou((prev) =>
        diversifyByCreator(dedupeExploreItems([...prev, ...page.items])),
      );
      setForYouCursor(page.nextCursor);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [forYouCursor, loadingMore]);

  const filteredForYou = React.useMemo(() => {
    if (forYouFilter === 'all') return forYou;
    if (forYouFilter === 'trending') return forYou.filter((i) => i.score >= 40);
    if (forYouFilter === 'arena') {
      return forYou.filter((i) => i.kind === 'TAKE' || i.kind === 'LIVE_ARENA' || i.kind === 'CLASH');
    }
    if (forYouFilter === 'vault') return forYou.filter((i) => i.kind === 'VAULT_PREVIEW');
    if (forYouFilter === 'video') {
      return forYou.filter((i) => Boolean(i.mediaUrl));
    }
    if (forYouFilter === 'challenges') return forYou.filter((i) => i.kind === 'CHALLENGE');
    return forYou;
  }, [forYou, forYouFilter]);

  const header = (
    <View style={styles.stickyHeader}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        Explore
      </Text>
      <ExploreSearch value={query} onChange={setQuery} />
      <ExploreModeBar mode={mode} onChange={setMode} />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: layout.screenX }}>
        {header}
      </View>

      {searching && searchResults ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.screenX,
            paddingBottom: dockBottomPadding(insets.bottom),
            gap: space.md,
            paddingTop: space.md,
          }}
        >
          <SearchHub
            results={searchResults}
            group={searchGroup}
            onGroup={setSearchGroup}
            onCountry={goCountryPage}
          />
        </ScrollView>
      ) : mode === 'for_you' ? (
        <FlatList
          data={filteredForYou}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={{
            paddingHorizontal: layout.screenX,
            paddingBottom: dockBottomPadding(insets.bottom),
            paddingTop: space.md,
            gap: space.sm,
          }}
          ListHeaderComponent={
            <View style={styles.filterRow}>
              {(
                [
                  ['all', 'For You'],
                  ['trending', 'Trending'],
                  ['arena', 'Arena'],
                  ['vault', 'Vault'],
                  ['video', 'Video'],
                  ['challenges', 'Challenges'],
                ] as const
              ).map(([id, label]) => {
                const on = forYouFilter === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      hapticTap();
                      setForYouFilter(id);
                    }}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                        borderColor: t.border,
                      },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={{
                        color: on ? t.background : t.textPrimary,
                        fontWeight: '700',
                        fontSize: 12,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
          renderItem={({ item, index }) => {
            const tall = index % 5 === 0 || index % 5 === 3;
            return (
              <View style={{ flex: 1, marginBottom: 8, paddingHorizontal: 4 }}>
                <ExploreMediaTile
                  kind={
                    item.kind === 'LIVE_ARENA'
                      ? 'LIVE'
                      : item.kind === 'VAULT_PREVIEW'
                        ? item.accessLevel === 'preview'
                          ? 'VAULT PREVIEW'
                          : 'VAULT'
                        : item.kind === 'CHALLENGE'
                          ? 'CHALLENGE'
                          : item.kind === 'CLASH'
                            ? 'CLASH'
                            : 'TAKE'
                  }
                  title={item.title}
                  subtitle={item.subtitle}
                  mediaUrl={item.mediaUrl}
                  span={tall ? 'portrait' : 'square'}
                  style={{ width: '100%' }}
                  onPress={() => {
                    analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
                    if (item.kind === 'CHALLENGE') {
                      analytics.track('challenge_opened', { realm: 'explore', source: 'explore' });
                      router.push(`/explore/challenge/${item.id}` as never);
                    } else if (item.href) router.push(item.href as never);
                  }}
                />
              </View>
            );
          }}
          onEndReached={() => void loadMoreForYou()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loading || loadingMore ? (
              <ActivityIndicator color={t.textPrimary} style={{ marginVertical: space.md }} />
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <Text allowFontScaling={false} style={{ color: t.textMuted, marginTop: space.lg }}>
                Nothing here yet — try World or Teleport.
              </Text>
            ) : null
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.screenX,
            paddingBottom: dockBottomPadding(insets.bottom),
            gap: space.lg,
            paddingTop: space.md,
          }}
          showsVerticalScrollIndicator={false}
        >
          {mode === 'world' ? (
            <>
              <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
                What&apos;s happening{'\n'}on Earth?
              </Text>
              <ExploreWorldCanvas
                activity={summary?.countries ?? []}
                selectedCode={selectedCountry}
                visualMode={worldVisual}
                onVisualModeChange={setWorldVisual}
                onSelectCountry={(code) => {
                  setSelectedCountry(code);
                  analytics.track('explore_country_selected', { realm: 'arena', source: 'explore' });
                }}
                spinToken={spinToken}
                spinTargetLng={spinLng}
                spinning={teleporting}
              />
              <View style={styles.worldControls}>
                <RoundControl
                  label="Search"
                  onPress={() => {
                    hapticTap();
                    setPickerOpen(true);
                  }}
                />
                <RoundControl label={teleporting ? '…' : 'Teleport'} onPress={() => void teleport()} emphasis />
              </View>
              {selectedCountry ? (
                <Animated.View
                  entering={reduced ? undefined : FadeInDown.duration(360)}
                  style={[styles.countryCard, { backgroundColor: t.textPrimary }]}
                >
                  <Text allowFontScaling={false} style={[styles.countryCardTitle, { color: t.background }]}>
                    {countryByCode(selectedCountry)?.name ?? selectedCountry}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.countryCardMeta, { color: t.background }]}>
                    {summary?.countries.find((c) => c.countryCode === selectedCountry)?.activityCount !=
                    null
                      ? `${summary.countries
                          .find((c) => c.countryCode === selectedCountry)!
                          .activityCount!.toLocaleString()} exploring`
                      : 'Quiet right now'}
                  </Text>
                  <Pressable
                    onPress={() => goCountryPage(selectedCountry)}
                    style={[styles.countryCardCta, { backgroundColor: t.background }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Explore ${countryByCode(selectedCountry)?.name ?? selectedCountry}`}
                  >
                    <Text allowFontScaling={false} style={[styles.countryCardCtaText, { color: t.textPrimary }]}>
                      Explore {countryByCode(selectedCountry)?.name ?? selectedCountry}
                    </Text>
                  </Pressable>
                </Animated.View>
              ) : null}
              {teleportReveal ? (
                <View style={{ gap: space.sm }}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
                    Teleport landed
                  </Text>
                  <ExploreMediaTile
                    kind={
                      teleportReveal.kind === 'LIVE_ARENA'
                        ? 'LIVE'
                        : teleportReveal.kind === 'VAULT_PREVIEW'
                          ? 'VAULT PREVIEW'
                          : teleportReveal.kind === 'CHALLENGE'
                            ? 'CHALLENGE'
                            : 'TAKE'
                    }
                    title={teleportReveal.title}
                    subtitle={
                      teleportReveal.countryCode
                        ? countryByCode(teleportReveal.countryCode)?.name ?? teleportReveal.countryCode
                        : null
                    }
                    mediaUrl={teleportReveal.mediaUrl}
                    span="hero"
                    onPress={() => {
                      if (teleportReveal.href) router.push(teleportReveal.href as never);
                    }}
                  />
                  <RoundControl label="Teleport again" onPress={() => void teleport()} emphasis />
                </View>
              ) : null}
            </>
          ) : null}

          {mode === 'live' ? (
            <>
              <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
                Live now
              </Text>
              {(live?.topics.length ?? 0) === 0 && (live?.takes.length ?? 0) === 0 ? (
                <Text allowFontScaling={false} style={{ color: t.textMuted }}>
                  No live activity right now.
                </Text>
              ) : null}
              {live?.topics.map((topic) => (
                <ExploreMediaTile
                  key={topic.id}
                  kind="LIVE"
                  title={topic.title}
                  subtitle={topic.hood}
                  accent="#1B3A4B"
                  span="hero"
                  onPress={() => router.push(topic.href as never)}
                />
              ))}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {live?.takes.map((take) => (
                  <ExploreDiscoveryCard
                    key={take.id}
                    kind="TAKE"
                    title={take.title}
                    subtitle={take.subtitle}
                    mediaUrl={take.mediaUrl}
                    meta={`Heat ${take.heat}`}
                    onPress={() => router.push(take.href as never)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {mode === 'play' ? <PlayHomePanel /> : null}

          {mode === 'meet' ? (
            <View
              style={[
                styles.meet,
                {
                  backgroundColor: t.scheme === 'light' ? '#111318' : t.surfaceElevated,
                  borderColor: t.border,
                },
              ]}
              accessibilityLabel="Meet the world. Text chat coming next."
            >
              <Text allowFontScaling={false} style={styles.meetKicker}>
                Meet the world
              </Text>
              <Text allowFontScaling={false} style={styles.meetTitle}>
                Talk to someone new
              </Text>
              <Text allowFontScaling={false} style={styles.meetBody}>
                Pseudonymous text matching comes next — Anywhere, Selected Country, Shared
                Interests, or Same Hood. Video later. Always authenticated under the hood for
                safety — never untraceable chat.
              </Text>
              <View style={styles.meetRow}>
                <View style={styles.meetPill}>
                  <Text allowFontScaling={false} style={styles.meetPillText}>
                    Text · Coming next
                  </Text>
                </View>
                <View style={[styles.meetPill, { opacity: 0.55 }]}>
                  <Text allowFontScaling={false} style={styles.meetPillText}>
                    Video · Later
                  </Text>
                </View>
              </View>
              <View style={styles.meetChoices}>
                {['Anywhere', 'Selected Country', 'Shared Interests', 'Same Hood'].map((label) => (
                  <View key={label} style={styles.meetChoice}>
                    <Text allowFontScaling={false} style={styles.meetChoiceText}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}

      <CountryPickerSheet
        visible={pickerOpen}
        recentCodes={recent}
        onClose={() => setPickerOpen(false)}
        onSelect={(code) => {
          setPickerOpen(false);
          setSelectedCountry(code);
          setMode('world');
        }}
      />
      <Notice offset={0} />
    </View>
  );
}

function RoundControl({
  label,
  onPress,
  emphasis = false,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.round,
        {
          backgroundColor: emphasis ? t.textPrimary : t.surfaceElevated,
          borderColor: t.borderStrong,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        allowFontScaling={false}
        style={[styles.roundText, { color: emphasis ? t.background : t.textPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SearchHub({
  results,
  group,
  onGroup,
  onCountry,
}: {
  results: ExploreSearchResults;
  group: ExploreSearchGroup;
  onGroup: (g: ExploreSearchGroup) => void;
  onCountry: (code: string) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();

  return (
    <View style={{ gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {EXPLORE_SEARCH_GROUPS.map((g) => {
          const on = group === g.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => onGroup(g.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                  borderColor: t.border,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={{ color: on ? t.background : t.textPrimary, fontWeight: '700', fontSize: 12 }}
              >
                {g.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {(group === 'top' || group === 'countries') && results.countries.length > 0 ? (
        <View style={styles.countryGrid}>
          {results.countries.map((c) => (
            <Pressable
              key={c.countryCode}
              onPress={() => onCountry(c.countryCode)}
              style={[styles.countryCardSmall, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
            >
              <Text allowFontScaling={false} style={{ color: t.textMuted, fontWeight: '800', fontSize: 11 }}>
                {c.countryCode}
              </Text>
              <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '800', fontSize: 15 }}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {(group === 'top' || group === 'media' || group === 'arena') && results.takes.length > 0 ? (
        <View style={styles.mediaGrid}>
          {results.takes
            .filter((take) => (group === 'media' ? Boolean(take.mediaUrl) : true))
            .map((take) => (
              <View key={take.id} style={{ width: '48.5%' }}>
                <ExploreMediaTile
                  kind="TAKE"
                  title={take.text}
                  subtitle={`@${take.authorHandle}`}
                  mediaUrl={take.mediaUrl}
                  span="half"
                  onPress={() => router.push(`/take/${take.id}`)}
                />
              </View>
            ))}
        </View>
      ) : null}

      {(group === 'top' || group === 'people') && results.people.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {results.people.map((person) => (
            <Pressable
              key={person.id}
              onPress={() => router.push(`/profile/${person.id}`)}
              style={[styles.personCard, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
            >
              <Avatar name={person.name} tint={person.avatarTint} size={52} />
              <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '800' }}>
                @{person.handle}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {(group === 'top' || group === 'arena') && results.topics.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {results.topics.map((topic) => (
            <ExploreDiscoveryCard
              key={topic.id}
              kind="LIVE"
              title={topic.title}
              subtitle={topic.status}
              accent="#1B3A4B"
              onPress={() => router.push(`/arena/topic/${topic.id}`)}
            />
          ))}
        </ScrollView>
      ) : null}

      {(group === 'top' || group === 'vault') && results.vault.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {results.vault.map((drop) => (
            <ExploreDiscoveryCard
              key={drop.dropId}
              kind="VAULT"
              title={drop.title}
              subtitle={`@${drop.creatorHandle}`}
              mediaUrl={drop.mediaUrl}
              meta={drop.accessLevel === 'preview' ? 'Preview' : 'Free'}
              onPress={() => router.push(`/vault/drop/${drop.dropId}`)}
            />
          ))}
        </ScrollView>
      ) : null}

      {(group === 'top' || group === 'hoods') && results.hoods.length > 0 ? (
        <View style={{ gap: 8 }}>
          {results.hoods.map((h) => (
            <Text key={h.hood} allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '700' }}>
              {h.label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stickyHeader: { gap: space.sm },
  kicker: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    ...typeScale.editorial,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  sectionTitle: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.sm },
  filterChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: { justifyContent: 'space-between' },
  worldControls: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  round: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  countryCard: {
    borderRadius: 28,
    padding: space.lg,
    gap: 8,
  },
  countryCardTitle: {
    ...typeScale.editorial,
    fontSize: 28,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  countryCardMeta: { ...typeScale.meta, fontSize: 14, opacity: 0.8 },
  countryCardCta: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  countryCardCtaText: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  rail: { gap: space.sm, paddingRight: layout.screenX },
  meet: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: 10,
    minHeight: 420,
  },
  meetKicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  meetTitle: { ...typeScale.editorial, fontSize: 36, fontWeight: '800', color: '#FAFAF8' },
  meetBody: { ...typeScale.meta, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.7)' },
  meetRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  meetPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  meetPillText: { ...typeScale.caption, fontSize: 12, fontWeight: '700', color: '#FAFAF8' },
  meetChoices: { gap: 8, marginTop: 12 },
  meetChoice: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  meetChoiceText: { color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 14 },
  countryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  countryCardSmall: {
    width: '48%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: 4,
  },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm },
  personCard: {
    width: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    alignItems: 'center',
    gap: 8,
  },
});
