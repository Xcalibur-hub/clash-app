import {withExploreAccount} from '../../components/explore/ExploreAccountBoundary';
import {useOperationScope} from '../../hooks/useOperationScope';
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
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CountryPickerSheet } from '../../components/explore/CountryPickerSheet';
import { ExploreDiscoveryCard } from '../../components/explore/ExploreDiscoveryCard';
import { ExploreDiscoverShelves } from '../../components/explore/ExploreDiscoverShelves';
import { ExploreFilterWheel } from '../../components/explore/ExploreFilterWheel';
import { ExploreMediaTile } from '../../components/explore/ExploreMediaTile';
import {
  ExploreMosaicRowView,
  type ExploreFeedTile,
} from '../../components/explore/ExploreMosaicRow';
import { ExploreModeRail } from '../../components/explore/ExploreModeRail';
import { ExploreSearch } from '../../components/explore/ExploreSearch';
import { ExploreWorldCanvas, type WorldVisualMode } from '../../components/explore/ExploreWorldCanvas';
import { WorldExperience } from '../../components/explore/WorldExperience';
import { Avatar } from '../../components/shared/Avatar';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { Notice } from '../../components/shared/Notice';
import { ReadFeedback } from '../../components/shared/ReadFeedback';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { MeetHomePanel } from '../../components/meet/MeetHomePanel';
import { PlayHomePanel } from '../../components/play/PlayHomePanel';
import { ExploreLivePanel, useExploreLive } from '../../components/explore/ExploreLivePanel';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { countryByCode } from '../../data/exploreCountries';
import { analytics } from '../../services/analytics';
import {
  fetchExploreForYou,
  fetchExploreWorldSummary,
  fetchTeleportCandidate,
  rememberTeleportId,
  readTeleportHistory,
  clearTeleportHistory,
  searchExplore,
  type ExploreForYouItem,
  type ExploreSearchResults,
  type ExploreTeleportCandidate,
} from '../../services/exploreService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import {
  dedupeExploreItems,
  diversifyByCreator,
  EXPLORE_SEARCH_GROUPS,
  type ExploreMode,
  type ExploreSearchGroup,
} from '../../utils/exploreForYouRank';
import {
  DEFAULT_FOR_YOU_FILTER,
  exploreChallengeHref,
  exploreCountryHref,
  exploreTreasureHref,
  packExploreMosaicRows,
  type ForYouFilterId,
} from '../../utils/exploreNav';
import { exploreRailExpandable, EXPLORE_WORLD_CONTENT_RIGHT } from '../../utils/exploreWorldLayout';
import { worldActivityCountries, surpriseCountry } from '../../utils/exploreWorldModel';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * EXPLORE IA: For You | World | Live | Play | Meet
 * Floating mode rail + compact rolling filters. Feed stays virtualized.
 */
const loadWorldSummary = () => fetchExploreWorldSummary();

function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const isCurrent = useOperationScope('ExploreScreen');
  const t = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();

  const [mode, setMode] = React.useState<ExploreMode>('for_you');
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 280);
  const searching = debounced.trim().length >= 2;
  const [searchGroup, setSearchGroup] = React.useState<ExploreSearchGroup>('top');
  const [searchResults, setSearchResults] = React.useState<ExploreSearchResults | null>(null);

  const world = useRetryableRead(loadWorldSummary, 'explore-world');
  const summary = world.data;
  const [forYou, setForYou] = React.useState<ExploreForYouItem[]>([]);
  const [forYouCursor, setForYouCursor] = React.useState<number | null>(0);
  const [forYouFilter, setForYouFilter] = React.useState<ForYouFilterId>(DEFAULT_FOR_YOU_FILTER);
  const live = useExploreLive();
  const [loading, setLoading] = React.useState(true);
  const [feedLoaded, setFeedLoaded] = React.useState(false);
  const [feedError, setFeedError] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const paging = React.useRef(false);
  const feedGeneration = React.useRef(0);
  const teleportBusy = React.useRef(false);
  const teleportTimer = React.useRef<ReturnType<typeof setTimeout>|null>(null);
  const [error,setError] = React.useState<string|null>(null);
  const [retry,setRetry] = React.useState(0);
  React.useEffect(()=>{clearTeleportHistory();return()=>{if(teleportTimer.current)clearTimeout(teleportTimer.current);};},[]);

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [worldVisual, setWorldVisual] = React.useState<WorldVisualMode>('map');
  const [teleporting, setTeleporting] = React.useState(false);
  const [teleportReveal, setTeleportReveal] = React.useState<ExploreTeleportCandidate | null>(null);
  const [selectedCountry, setSelectedCountry] = React.useState<string | null>(null);

  const headerCollapse = useSharedValue(0);

  React.useEffect(() => {
    analytics.track('explore_opened', { realm: 'arena', source: 'explore' });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    feedGeneration.current++;
    paging.current=false;
    setLoadingMore(false);
    setLoading(true);
    setError(null);
    setFeedError(null);
    void fetchExploreForYou(24, 0)
      .then((page) => {
        if (cancelled) return;
        const mixed = diversifyByCreator(dedupeExploreItems(page.items));
        setForYou(mixed);
        setForYouCursor(page.nextCursor);
        setFeedLoaded(true);
      })
      .catch(() => {if(!cancelled)setFeedError('Explore unavailable.');})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  React.useEffect(() => {
    if (!searching) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearchResults(null);
    setError(null);
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
      .catch(() => {if(!cancelled)setError('Search unavailable. Try again.');});
    return () => {
      cancelled = true;
    };
  }, [debounced, searching, retry]);

  const goCountryPage = React.useCallback(
    (code: string) => {
      setRecent((prev) => [code, ...prev.filter((c) => c !== code)].slice(0, 8));
      router.push(exploreCountryHref(code) as never);
    },
    [router],
  );

  /** Server-ordered activity countries — also powers the picker's "Happening now". */
  const worldCountries = React.useMemo(
    () => worldActivityCountries(summary?.countries, 64),
    [summary],
  );

  /**
   * E2.9 — one way in. The picker, the activity rail, Surprise me and the map
   * all land here, and the globe derives its rotation from the result: the
   * canvas is a view of `selectedCountry`, never a controller of it.
   */
  const selectCountry = React.useCallback((code: string, source: string) => {
    setSelectedCountry(code);
    setMode('world');
    analytics.track('explore_country_selected', { realm: 'arena', source });
  }, []);

  /**
   * Surprise Me focuses a country the viewer has not opened yet, then reveals the
   * same content Teleport lands on. No new RPC, no extra ranking.
   */
  const surprise = React.useCallback(() => {
    hapticTap();
    const pick = surpriseCountry(worldCountries, selectedCountry);
    if (!pick) return;
    selectCountry(pick.code, 'explore_surprise');
  }, [selectCountry, selectedCountry, worldCountries]);

  const changeMode = React.useCallback((next: ExploreMode) => {
    hapticTap();
    setMode(next);
  }, []);

  const teleport = React.useCallback(async () => {
    if (teleportBusy.current || !isCurrent()) return;
    teleportBusy.current=true;
    setMode('world');
    setTeleporting(true);
    setTeleportReveal(null);
    hapticTap();
    analytics.track('explore_teleport', { realm: 'arena', source: 'explore' });
    try {
      const candidate = await fetchTeleportCandidate(readTeleportHistory());
      if(!isCurrent())return;
      if (!candidate) {
        teleportBusy.current=false;
        setTeleporting(false);
        setError('No accessible teleport destinations.');
        return;
      }
      rememberTeleportId(candidate.id);
      // E2.9 — the globe rotates to the server's country. No random spin: with no
      // country there is nothing to point at, so the current angle is kept.
      if (candidate.countryCode) selectCountry(candidate.countryCode, 'explore_teleport');
      teleportTimer.current=setTimeout(() => {
        if(!isCurrent())return;
        teleportBusy.current=false;
        setTeleportReveal(candidate);
        setTeleporting(false);
      }, reduced ? 120 : 560);
    } catch {
      if(!isCurrent())return;
      teleportBusy.current=false;
      setError('Teleport unavailable. Try again.');
      setTeleporting(false);
    }
  }, [reduced, isCurrent, selectCountry]);

  const loadMoreForYou = React.useCallback(async () => {
    if (loading || !feedLoaded || feedError || paging.current || forYouCursor == null || !isCurrent()) return;
    paging.current=true;
    const generation=feedGeneration.current;
    setLoadingMore(true);
    try {
      const page = await fetchExploreForYou(24, forYouCursor);
      if(!isCurrent() || generation!==feedGeneration.current)return;
      setForYou((prev) => diversifyByCreator(dedupeExploreItems([...prev, ...page.items])));
      setForYouCursor(page.nextCursor);
    } catch {
      if(isCurrent() && generation===feedGeneration.current)setFeedError('Could not load more.');
    } finally {
      if(isCurrent() && generation===feedGeneration.current){paging.current=false;setLoadingMore(false);}
    }
  }, [forYouCursor, isCurrent, loading, feedLoaded, feedError]);

  const filteredForYou = React.useMemo(() => {
    if (forYouFilter === 'all') return forYou;
    if (forYouFilter === 'trending') return forYou.filter((i) => i.score >= 40);
    if (forYouFilter === 'arena') {
      return forYou.filter((i) => i.kind === 'TAKE' || i.kind === 'LIVE_ARENA' || i.kind === 'CLASH');
    }
    if (forYouFilter === 'vault') return forYou.filter((i) => i.kind === 'VAULT_PREVIEW');
    if (forYouFilter === 'video') return forYou.filter((i) => Boolean(i.mediaUrl));
    if (forYouFilter === 'challenges') return forYou.filter((i) => i.kind === 'CHALLENGE');
    return forYou;
  }, [forYou, forYouFilter]);

  const feedTiles = React.useMemo((): ExploreFeedTile[] => {
    return filteredForYou.map((item) => ({
      id: item.id,
      kind:
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
                : 'TAKE',
      title: item.title,
      subtitle: item.subtitle,
      mediaUrl: item.mediaUrl,
      onPress: () => {
        analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
        if (item.kind === 'CHALLENGE') {
          analytics.track('challenge_opened', { realm: 'explore', source: 'explore' });
          router.push(`/explore/challenge/${item.id}` as never);
        } else if (item.href) router.push(item.href as never);
      },
    }));
  }, [filteredForYou, router]);

  const mosaicRows = React.useMemo(() => packExploreMosaicRows(feedTiles), [feedTiles]);

  /** The country panel sits under the floating rail — labels must not expand over it. */
  const countryPanelOpen = mode === 'world' && selectedCountry !== null;

  const headerAnim = useAnimatedStyle(() => ({
    opacity: 1 - headerCollapse.value * 0.15,
    transform: [{ translateY: -headerCollapse.value * 6 }],
  }));

  const titleAnim = useAnimatedStyle(() => ({
    opacity: 1 - headerCollapse.value,
    height: interpolate(headerCollapse.value, [0, 1], [18, 0]),
    marginBottom: interpolate(headerCollapse.value, [0, 1], [4, 0]),
    overflow: 'hidden' as const,
  }));

  const onFeedScroll = (y: number) => {
    const next = y > 28 ? 1 : Math.max(0, y / 28);
    headerCollapse.value = reduced ? next : withTiming(next, { duration: 160 });
  };

  const compactHeader = (
    <Animated.View style={[styles.headerBlock, headerAnim]}>
      <Animated.View style={titleAnim}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          Explore
        </Text>
      </Animated.View>
      <ExploreSearch value={query} onChange={setQuery} compact />
      {mode === 'for_you' && !searching ? (
        <ExploreFilterWheel value={forYouFilter} onChange={setForYouFilter} />
      ) : null}
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <View
        style={{
          paddingTop: insets.top + space.xs,
          paddingHorizontal: layout.screenX,
          paddingRight: layout.screenX + 56,
          zIndex: 2,
        }}
      >
        {compactHeader}
        {error && (searching || mode === 'world') ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Explore" onPress={()=>setRetry(n=>n+1)}><Text style={{color:t.textSecondary}}>{error} Tap to retry.</Text></Pressable> : null}
      </View>

      {searching && !searchResults ? (<ActivityIndicator accessibilityLabel="Loading search" color={t.textPrimary} />) : searching && searchResults ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: layout.screenX,
            paddingBottom: dockBottomPadding(insets.bottom),
            gap: space.sm,
            paddingTop: space.xs,
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
        <Animated.View
          key="for_you"
          entering={reduced ? undefined : FadeIn.duration(220)}
          exiting={reduced ? undefined : FadeOut.duration(140)}
          style={{ flex: 1 }}
        >
          <FlatList
            data={mosaicRows}
            keyExtractor={(row) => row.key}
            contentContainerStyle={{
              paddingHorizontal: layout.screenX,
              paddingBottom: dockBottomPadding(insets.bottom),
              paddingTop: space.xs,
              paddingRight: layout.screenX + 8,
            }}
            renderItem={({ item }) => <ExploreMosaicRowView row={item} />}
            ListHeaderComponent={
              <>
                <ReadFeedback status={!loading && feedError ? 'error' : 'ready'} subject="Explore feed" retry={() => setRetry(n => n + 1)} />
                {/* Keep cross-surface shelves on a successfully loaded, unfiltered feed. */}
                {forYouFilter === 'all' && !loading && feedLoaded && !feedError ? (
                  <ExploreDiscoverShelves live={live.data} onSeeAllLive={() => changeMode('live')} />
                ) : null}
              </>
            }
            onScroll={(e) => onFeedScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            onEndReached={() => void loadMoreForYou()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loading || loadingMore ? (
                <ActivityIndicator color={t.textPrimary} style={{ marginVertical: space.sm }} />
              ) : null
            }
            ListEmptyComponent={
              !loading && feedLoaded && !feedError ? (
                <Text allowFontScaling={false} style={{ color: t.textMuted, marginTop: space.md }}>
                  Nothing here yet — try World or Teleport.
                </Text>
              ) : null
            }
          />
        </Animated.View>
      ) : (
        <Animated.View
          key={mode}
          entering={reduced ? undefined : FadeIn.duration(220)}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: layout.screenX,
              paddingBottom: dockBottomPadding(insets.bottom),
              gap: space.md,
              paddingTop: space.xs,
              paddingRight: EXPLORE_WORLD_CONTENT_RIGHT,
            }}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => onFeedScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            {mode === 'world' ? (
              <View style={styles.worldBlock}>
                <View style={styles.worldTop}>
                  <Text style={[styles.modeLabel, { color: t.textMuted }]}>
                    WORLD
                  </Text>
                  <View
                    style={[
                      styles.visualToggle,
                      { backgroundColor: t.surfaceElevated, borderColor: t.border },
                    ]}
                  >
                    {(
                      [
                        ['map', 'Map'],
                        ['globe', 'Globe'],
                      ] as const
                    ).map(([id, label]) => {
                      const on = worldVisual === id;
                      return (
                        <Pressable
                          key={id}
                          onPress={() => {
                            hapticTap();
                            setWorldVisual(id);
                          }}
                          style={[styles.visualChip, on && { backgroundColor: t.textPrimary }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={label}
                        >
                          <Text
                            style={{
                              color: on ? t.background : t.textPrimary,
                              fontWeight: '800',
                              fontSize: 12,
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Text style={[styles.worldHint, { color: t.textMuted }]}>
                  Pick a country — the globe turns to it on its own.
                </Text>

                <ExploreWorldCanvas
                  activity={summary?.countries ?? []}
                  selectedCode={selectedCountry}
                  visualMode={worldVisual}
                  onSelectCountry={(code) => selectCountry(code, 'explore_map')}
                  busy={teleporting}
                />

                <View style={styles.worldControls}>
                  <RoundControl
                    label="Search"
                    onPress={() => {
                      hapticTap();
                      setPickerOpen(true);
                    }}
                  />
                  <RoundControl
                    label={teleporting ? '…' : 'Teleport'}
                    onPress={() => void teleport()}
                    emphasis
                  />
                </View>

                <WorldExperience
                  activityStatus={world.status}
                  onRetry={world.retry}
                  countries={worldCountries}
                  challenges={summary?.challenges ?? []}
                  treasures={summary?.treasures ?? []}
                  selectedCode={selectedCountry}
                  onSelectCountry={(code) => {
                    hapticTap();
                    selectCountry(code, 'explore_rail');
                  }}
                  onOpenCountry={goCountryPage}
                  onOpenChallenge={(id) => router.push(exploreChallengeHref(id) as never)}
                  onOpenTreasure={(id) => router.push(exploreTreasureHref(id) as never)}
                  onSurprise={surprise}
                  onClear={() => setSelectedCountry(null)}
                />

                {teleportReveal ? (
                  <View style={{ gap: space.xs }}>
                    <Text allowFontScaling={false} style={[styles.modeLabel, { color: t.textMuted }]}>
                      TELEPORT LANDED
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
                          ? countryByCode(teleportReveal.countryCode)?.name ??
                            teleportReveal.countryCode
                          : null
                      }
                      mediaUrl={teleportReveal.mediaUrl}
                      span="hero"
                      onPress={() => {
                        if (teleportReveal.href) router.push(teleportReveal.href as never);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {mode === 'live' ? <ExploreLivePanel live={live} /> : null}

            {mode === 'play' ? <PlayHomePanel /> : null}

            {mode === 'meet' ? <MeetHomePanel /> : null}
          </ScrollView>
        </Animated.View>
      )}

      <ExploreModeRail
        mode={mode}
        onChange={changeMode}
        bottomOffset={dockBottomPadding(insets.bottom) - 24}
        expandable={exploreRailExpandable(countryPanelOpen)}
      />

      <CountryPickerSheet
        visible={pickerOpen}
        recentCodes={recent}
        active={worldCountries}
        onClose={() => setPickerOpen(false)}
        onSelect={(code) => {
          setPickerOpen(false);
          selectCountry(code, 'explore_picker');
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
          backgroundColor: emphasis ? t.textPrimary : t.scheme === 'light' ? '#FFFEFA' : t.surfaceElevated,
          borderColor: t.borderStrong,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
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
    <View style={{ gap: space.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {EXPLORE_SEARCH_GROUPS.map((g) => {
          const on = group === g.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => onGroup(g.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: on ? t.textPrimary : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={g.label}
            >
              <Text
                allowFontScaling={false}
                style={{
                  color: on ? t.background : t.textMuted,
                  fontWeight: on ? '800' : '600',
                  fontSize: 12,
                }}
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
              style={[
                styles.countryCardSmall,
                { backgroundColor: t.surfaceElevated, borderColor: t.border },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={{ color: t.textMuted, fontWeight: '800', fontSize: 11 }}
              >
                {c.countryCode}
              </Text>
              <Text
                allowFontScaling={false}
                style={{ color: t.textPrimary, fontWeight: '800', fontSize: 15 }}
              >
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {results.people.map((person) => (
            <Pressable
              key={person.id}
              onPress={() => router.push(`/profile/${person.id}`)}
              style={[
                styles.personCard,
                { backgroundColor: t.surfaceElevated, borderColor: t.border },
              ]}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
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
        <View style={{ gap: 6 }}>
          {results.hoods.map((h) => (
            <Text
              key={h.hood}
              allowFontScaling={false}
              style={{ color: t.textPrimary, fontWeight: '700' }}
            >
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
  headerBlock: { gap: 8 },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  modeLabel: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  filterRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  filterChip: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  worldBlock: { gap: space.sm },
  worldHint: { ...typeScale.caption, fontSize: 12, marginTop: -space.xxs },
  worldTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visualToggle: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
  },
  visualChip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  worldControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  round: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { ...typeScale.label, fontSize: 12, fontWeight: '800' },
  rail: { gap: space.xs, paddingRight: layout.screenX },
  countryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  countryCardSmall: {
    width: '48%',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    gap: 4,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  personCard: {
    width: 112,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    alignItems: 'center',
    gap: 6,
  },
});

/**
 * World keeps its discovery context across navigation: `retainAcrossPaths` scopes
 * the boundary by account only, so pushing a country page (or switching tabs)
 * returns to the same mode, map/globe and selected country instead of remounting
 * at For You. Identity changes still reset it.
 */
export default withExploreAccount(ExploreScreen, { retainAcrossPaths: true });

