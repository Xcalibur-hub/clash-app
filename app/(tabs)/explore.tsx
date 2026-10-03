import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CountryPickerSheet } from '../../components/explore/CountryPickerSheet';
import { ExploreDiscoveryCard } from '../../components/explore/ExploreDiscoveryCard';
import { ExploreGlobe } from '../../components/explore/ExploreGlobe';
import { ExploreSearch } from '../../components/explore/ExploreSearch';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { Notice } from '../../components/shared/Notice';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { countryByCode } from '../../data/exploreCountries';
import { analytics } from '../../services/analytics';
import {
  fetchExploreWorldSummary,
  fetchGlobalViral,
  fetchTeleportCandidate,
  rememberTeleportId,
  readTeleportHistory,
  searchExplore,
  type ExploreSearchResults,
  type ExploreViralItem,
  type ExploreWorldSummary,
} from '../../services/exploreService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * EXPLORE — discover the CLASH world.
 * Globe hero + country discovery + viral + teleport + challenges/treasure foundation.
 * Connect is an intentional future entry surface only.
 */
export default function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 280);
  const searching = debounced.trim().length >= 2;
  const [summary, setSummary] = React.useState<ExploreWorldSummary | null>(null);
  const [viral, setViral] = React.useState<ExploreViralItem[]>([]);
  const [searchResults, setSearchResults] = React.useState<ExploreSearchResults | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [spinToken, setSpinToken] = React.useState(0);
  const [spinLng, setSpinLng] = React.useState<number | null>(null);
  const [teleporting, setTeleporting] = React.useState(false);

  React.useEffect(() => {
    analytics.track('explore_opened', { realm: 'arena', source: 'explore' });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchExploreWorldSummary(), fetchGlobalViral(12)])
      .then(([world, global]) => {
        if (cancelled) return;
        setSummary(world);
        setViral(global);
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
      setRecent((prev) => [code, ...prev.filter((c) => c !== code)].slice(0, 8));
      router.push(`/explore/country/${code}`);
    },
    [router],
  );

  const teleport = React.useCallback(async () => {
    if (teleporting) return;
    setTeleporting(true);
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
      setTimeout(() => {
        if (candidate.countryCode) openCountry(candidate.countryCode);
        else if (candidate.href) router.push(candidate.href as never);
        setTeleporting(false);
      }, 520);
    } catch {
      setTeleporting(false);
    }
  }, [openCountry, router, teleporting]);

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.sm,
            paddingBottom: dockBottomPadding(insets.bottom),
          },
        ]}
      >
        <View style={styles.hero}>
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            Explore
          </Text>
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            What&apos;s happening{'\n'}on Earth?
          </Text>
        </View>

        <ExploreGlobe
          activity={summary?.countries ?? []}
          onSelectCountry={openCountry}
          spinToken={spinToken}
          spinTargetLng={spinLng}
        />

        <View style={styles.controls}>
          <ControlChip
            label="Search"
            onPress={() => {
              hapticTap();
              setPickerOpen(true);
            }}
          />
          <ControlChip
            label={teleporting ? '…' : 'Teleport'}
            onPress={() => void teleport()}
            emphasis
          />
          <ControlChip
            label="World"
            onPress={() => {
              hapticTap();
              router.push('/world');
            }}
          />
        </View>

        <ExploreSearch value={query} onChange={setQuery} />

        {loading ? <ActivityIndicator color={t.textPrimary} style={{ marginTop: space.md }} /> : null}

        {searching && searchResults ? (
          <SearchPanels results={searchResults} onCountry={openCountry} />
        ) : (
          <>
            {summary && summary.liveTopicCount > 0 ? (
              <Section title="Happening now">
                <Text allowFontScaling={false} style={[styles.happening, { color: t.textSecondary }]}>
                  {summary.liveTopicCount} live Arena topic
                  {summary.liveTopicCount === 1 ? '' : 's'} worldwide
                </Text>
              </Section>
            ) : null}

            {viral.length > 0 ? (
              <Section title="Global viral">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {viral.map((item) => (
                    <ExploreDiscoveryCard
                      key={`${item.kind}-${item.id}`}
                      kind={
                        item.kind === 'LIVE_ARENA'
                          ? 'LIVE'
                          : item.kind === 'VAULT_PREVIEW'
                            ? 'VAULT'
                            : item.kind === 'CHALLENGE'
                              ? 'CHALLENGE'
                              : 'TAKE'
                      }
                      title={item.title}
                      subtitle={item.subtitle}
                      onPress={() => {
                        analytics.track('explore_content_opened', {
                          realm: 'arena',
                          source: 'explore',
                        });
                        if (item.href) router.push(item.href as never);
                      }}
                    />
                  ))}
                </ScrollView>
              </Section>
            ) : null}

            {summary && summary.treasures.length > 0 ? (
              <Section title="Treasure hunts">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {summary.treasures.map((hunt) => (
                    <ExploreDiscoveryCard
                      key={hunt.id}
                      kind="TREASURE"
                      title={hunt.title}
                      subtitle={hunt.clue}
                      meta={
                        hunt.countryCode
                          ? `${countryByCode(hunt.countryCode)?.name ?? hunt.countryCode} · ${hunt.giftsRemaining} gifts`
                          : `${hunt.giftsRemaining} gifts hidden`
                      }
                      onPress={() => {
                        analytics.track('explore_treasure_opened', {
                          realm: 'arena',
                          source: 'explore',
                        });
                        if (hunt.countryCode) openCountry(hunt.countryCode);
                      }}
                    />
                  ))}
                </ScrollView>
              </Section>
            ) : null}

            {summary && summary.challenges.length > 0 ? (
              <Section title="Challenges">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {summary.challenges.map((challenge) => (
                    <ExploreDiscoveryCard
                      key={challenge.id}
                      kind="CHALLENGE"
                      title={challenge.title}
                      subtitle={challenge.challengeType}
                      meta={`${challenge.entryCount} entries`}
                      onPress={() => {
                        analytics.track('explore_challenge_opened', {
                          realm: 'arena',
                          source: 'explore',
                        });
                        if (challenge.countryCode) openCountry(challenge.countryCode);
                      }}
                    />
                  ))}
                </ScrollView>
              </Section>
            ) : null}

            <View
              style={[styles.connect, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}
              accessibilityLabel="Meet the world. Text chat coming next."
            >
              <Text allowFontScaling={false} style={[styles.connectKicker, { color: t.textMuted }]}>
                Meet the world
              </Text>
              <Text allowFontScaling={false} style={[styles.connectTitle, { color: t.textPrimary }]}>
                Talk to someone new
              </Text>
              <Text allowFontScaling={false} style={[styles.connectBody, { color: t.textSecondary }]}>
                Pseudonymous text matching comes next. Video later. Always
                authenticated under the hood for safety — never untraceable chat.
              </Text>
              <Text allowFontScaling={false} style={[styles.connectSoon, { color: t.textMuted }]}>
                Text chat · Coming next
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <CountryPickerSheet
        visible={pickerOpen}
        recentCodes={recent}
        onClose={() => setPickerOpen(false)}
        onSelect={(code) => {
          setPickerOpen(false);
          openCountry(code);
        }}
      />
      <Notice offset={0} />
    </View>
  );
}

function ControlChip({
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
        styles.chip,
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
        style={[styles.chipText, { color: emphasis ? t.background : t.textPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.section}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function SearchPanels({
  results,
  onCountry,
}: {
  results: ExploreSearchResults;
  onCountry: (code: string) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  return (
    <View style={styles.searchPanels}>
      {results.countries.length > 0 ? (
        <Section title="Countries">
          {results.countries.map((c) => (
            <Pressable
              key={c.countryCode}
              onPress={() => onCountry(c.countryCode)}
              style={styles.searchRow}
              accessibilityRole="button"
              accessibilityLabel={c.name}
            >
              <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '700' }}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}
      {results.topics.length > 0 ? (
        <Section title="Live Arena">
          {results.topics.map((topic) => (
            <Pressable
              key={topic.id}
              onPress={() => router.push(`/arena/topic/${topic.id}`)}
              style={styles.searchRow}
            >
              <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '700' }}>
                {topic.title}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}
      {results.takes.length > 0 ? (
        <Section title="Takes">
          {results.takes.map((take) => (
            <Pressable
              key={take.id}
              onPress={() => router.push(`/take/${take.id}`)}
              style={styles.searchRow}
            >
              <Text allowFontScaling={false} style={{ color: t.textPrimary }} numberOfLines={2}>
                {take.text}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}
      {results.people.length > 0 ? (
        <Section title="People">
          {results.people.map((person) => (
            <Pressable
              key={person.id}
              onPress={() => router.push(`/profile/${person.id}`)}
              style={styles.searchRow}
            >
              <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '700' }}>
                @{person.handle}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}
      {results.vault.length > 0 ? (
        <Section title="Vault previews">
          {results.vault.map((drop) => (
            <Pressable
              key={drop.dropId}
              onPress={() => router.push(`/vault/drop/${drop.dropId}`)}
              style={styles.searchRow}
            >
              <Text allowFontScaling={false} style={{ color: t.textPrimary, fontWeight: '700' }}>
                {drop.title}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.lg,
  },
  hero: { gap: 6 },
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  section: { gap: space.sm },
  sectionTitle: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  happening: { ...typeScale.meta, fontSize: 15 },
  rail: { gap: space.sm, paddingRight: layout.screenX },
  connect: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: 6,
  },
  connectKicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  connectTitle: { ...typeScale.section, fontSize: 20, fontWeight: '800' },
  connectBody: { ...typeScale.meta, fontSize: 14, lineHeight: 20 },
  connectSoon: { ...typeScale.caption, fontSize: 12, fontWeight: '700', marginTop: 4 },
  searchPanels: { gap: space.lg },
  searchRow: { minHeight: 44, justifyContent: 'center' },
});
