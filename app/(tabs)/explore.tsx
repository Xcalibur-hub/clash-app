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
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CountryPickerSheet } from '../../components/explore/CountryPickerSheet';
import { ExploreDiscoveryCard } from '../../components/explore/ExploreDiscoveryCard';
import { ExploreFilterWheel } from '../../components/explore/ExploreFilterWheel';
import { ExploreMediaTile } from '../../components/explore/ExploreMediaTile';
import {
  ExploreMosaicRowView,
  type ExploreFeedTile,
} from '../../components/explore/ExploreMosaicRow';
import { ExploreModeRail } from '../../components/explore/ExploreModeRail';
import { ExploreSearch } from '../../components/explore/ExploreSearch';
import { ExploreWorldCanvas, type WorldVisualMode } from '../../components/explore/ExploreWorldCanvas';
import { Avatar } from '../../components/shared/Avatar';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { Notice } from '../../components/shared/Notice';
import { MeetHomePanel } from '../../components/meet/MeetHomePanel';
import { PlayHomePanel } from '../../components/play/PlayHomePanel';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { countryByCode } from '../../data/exploreCountries';
import { analytics } from '../../services/analytics';
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
import {
  DEFAULT_FOR_YOU_FILTER,
  packExploreMosaicRows,
  type ForYouFilterId,
} from '../../utils/exploreNav';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * EXPLORE IA: For You | World | Live | Play | Meet
 * Floating mode rail + compact rolling filters. Feed stays virtualized.
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
  const [forYouFilter, setForYouFilter] = React.useState<ForYouFilterId>(DEFAULT_FOR_YOU_FILTER);
  const [live, setLive] = React.useState<ExploreLiveFeed | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [worldVisual, setWorldVisual] = React.useState<WorldVisualMode>('map');
  const [spinToken, setSpinToken] = React.useState(0);
  const [spinLng, setSpinLng] = React.useState<number | null>(null);
  const [teleporting, setTeleporting] = React.useState(false);
  const [teleportReveal, setTeleportReveal] = React.useState<ExploreTeleportCandidate | null>(null);
  const [selectedCountry, setSelectedCountry] = React.useState<string | null>(null);

  const headerCollapse = useSharedValue(0);

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

  const goCountryPage = React.useCallback(
    (code: string) => {
      setRecent((prev) => [code, ...prev.filter((c) => c !== code)].slice(0, 8));
      router.push(`/explore/country/${code}`);
    },
    [router],
  );

  const changeMode = React.useCallback((next: ExploreMode) => {
    hapticTap();
    setMode(next);
  }, []);

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
      setForYou((prev) => diversifyByCreator(dedupeExploreItems([...prev, ...page.items])));
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
      </View>

      {searching && searchResults ? (
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
              !loading ? (
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
              paddingRight: layout.screenX + 8,
            }}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => onFeedScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            {mode === 'world' ? (
              <View style={styles.worldBlock}>
                <View style={styles.worldTop}>
                  <Text allowFontScaling={false} style={[styles.modeLabel, { color: t.textMuted }]}>
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
                            allowFontScaling={false}
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

                <ExploreWorldCanvas
                  activity={summary?.countries ?? []}
                  selectedCode={selectedCountry}
                  visualMode={worldVisual}
                  onSelectCountry={(code) => {
                    setSelectedCountry(code);
                    analytics.track('explore_country_selected', {
                      realm: 'arena',
                      source: 'explore',
                    });
                  }}
                  spinToken={spinToken}
                  spinTargetLng={spinLng}
                  spinning={teleporting}
                />

                {selectedCountry ? (
                  <Animated.View
                    entering={reduced ? undefined : FadeInDown.duration(320)}
                    style={[
                      styles.countryCard,
                      {
                        backgroundColor: t.scheme === 'light' ? '#111113' : t.textPrimary,
                      },
                    ]}
                  >
                    <Text allowFontScaling={false} style={styles.countryCardTitle}>
                      {countryByCode(selectedCountry)?.name ?? selectedCountry}
                    </Text>
                    <Text allowFontScaling={false} style={styles.countryCardMeta}>
                      {summary?.countries.find((c) => c.countryCode === selectedCountry)
                        ?.activityCount != null
                        ? `${summary.countries
                            .find((c) => c.countryCode === selectedCountry)!
                            .activityCount!.toLocaleString()} exploring`
                        : 'Trending now'}
                    </Text>
                    <Pressable
                      onPress={() => goCountryPage(selectedCountry)}
                      style={styles.countryCardCta}
                      accessibilityRole="button"
                      accessibilityLabel={`Explore ${countryByCode(selectedCountry)?.name ?? selectedCountry}`}
                    >
                      <Text allowFontScaling={false} style={styles.countryCardCtaText}>
                        Explore →
                      </Text>
                    </Pressable>
                  </Animated.View>
                ) : null}

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

            {mode === 'live' ? (
              <View style={{ gap: space.sm }}>
                <Text allowFontScaling={false} style={[styles.modeLabel, { color: t.textMuted }]}>
                  LIVE
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
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
              </View>
            ) : null}

            {mode === 'play' ? <PlayHomePanel /> : null}

            {mode === 'meet' ? <MeetHomePanel /> : null}
          </ScrollView>
        </Animated.View>
      )}

      <ExploreModeRail
        mode={mode}
        onChange={changeMode}
        bottomOffset={dockBottomPadding(insets.bottom) - 24}
      />

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
          backgroundColor: emphasis ? t.textPrimary : t.scheme === 'light' ? '#FFFEFA' : t.surfaceElevated,
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
    minHeight: 30,
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
    minHeight: 40,
    minWidth: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { ...typeScale.label, fontSize: 12, fontWeight: '800' },
  countryCard: {
    borderRadius: radius.xxl,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 4,
    marginTop: -8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  countryCardTitle: {
    ...typeScale.editorial,
    fontSize: 24,
    fontWeight: '800',
    color: '#FAFAF8',
  },
  countryCardMeta: { ...typeScale.meta, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  countryCardCta: {
    alignSelf: 'flex-start',
    marginTop: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF8',
  },
  countryCardCtaText: { ...typeScale.label, fontSize: 12, fontWeight: '800', color: '#111113' },
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
