import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CountryPickerSheet } from '../../components/explore/CountryPickerSheet';
import { ExploreDiscoveryCard } from '../../components/explore/ExploreDiscoveryCard';
import { ExploreGlobe } from '../../components/explore/ExploreGlobe';
import { ExploreMediaTile } from '../../components/explore/ExploreMediaTile';
import { ExploreMosaic, type ExploreMosaicItem } from '../../components/explore/ExploreMosaic';
import { ExploreSearch } from '../../components/explore/ExploreSearch';
import { Avatar } from '../../components/shared/Avatar';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import { Notice } from '../../components/shared/Notice';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { countryByCode } from '../../data/exploreCountries';
import { analytics, type AnalyticsEvent } from '../../services/analytics';
import {
  fetchExploreVaultPreviews,
  fetchExploreWorldSummary,
  fetchGlobalViral,
  fetchTeleportCandidate,
  rememberTeleportId,
  readTeleportHistory,
  searchExplore,
  type ExploreSearchResults,
  type ExploreTeleportCandidate,
  type ExploreVaultPreview,
  type ExploreViralItem,
  type ExploreWorldSummary,
} from '../../services/exploreService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { exploreVaultKindLabel } from '../../utils/exploreVaultVisibility';
import { tap as hapticTap } from '../../utils/haptics';

/**
 * EXPLORE — immersive world discovery.
 * Chrome stays restrained; content supplies color and density.
 */
export default function ExploreScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const globeSize = Math.min(340, Math.max(280, width - 48));

  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 280);
  const searching = debounced.trim().length >= 2;
  const [summary, setSummary] = React.useState<ExploreWorldSummary | null>(null);
  const [viral, setViral] = React.useState<ExploreViralItem[]>([]);
  const [vaults, setVaults] = React.useState<ExploreVaultPreview[]>([]);
  const [searchResults, setSearchResults] = React.useState<ExploreSearchResults | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [spinToken, setSpinToken] = React.useState(0);
  const [spinLng, setSpinLng] = React.useState<number | null>(null);
  const [teleporting, setTeleporting] = React.useState(false);
  const [teleportReveal, setTeleportReveal] = React.useState<ExploreTeleportCandidate | null>(null);
  const [focusCode, setFocusCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    analytics.track('explore_opened', { realm: 'arena', source: 'explore' });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchExploreWorldSummary(),
      fetchGlobalViral(14),
      fetchExploreVaultPreviews(10),
    ])
      .then(([world, global, previews]) => {
        if (cancelled) return;
        setSummary(world);
        setViral(global);
        setVaults(previews);
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

  const openContent = React.useCallback(
    (
      href: string | null | undefined,
      event: AnalyticsEvent = 'explore_content_opened',
    ) => {
      analytics.track(event, { realm: 'arena', source: 'explore' });
      if (href) router.push(href as never);
    },
    [router],
  );

  const teleport = React.useCallback(async () => {
    if (teleporting) return;
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
      setTimeout(() => {
        setTeleportReveal(candidate);
        setTeleporting(false);
      }, reduced ? 120 : 560);
    } catch {
      setTeleporting(false);
    }
  }, [reduced, teleporting]);

  const mosaicItems = React.useMemo((): ExploreMosaicItem[] => {
    const items: ExploreMosaicItem[] = [];
    for (const item of viral) {
      items.push({
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
          if (item.kind === 'VAULT_PREVIEW') {
            openContent(item.href, 'explore_vault_preview_opened');
          } else if (item.kind === 'CHALLENGE') {
            analytics.track('explore_challenge_opened', { realm: 'arena', source: 'explore' });
            if (item.countryCode) openCountry(item.countryCode);
          } else {
            openContent(item.href);
          }
        },
      });
    }
    for (const drop of vaults) {
      if (items.some((x) => x.id === drop.dropId)) continue;
      items.push({
        id: drop.dropId,
        kind: exploreVaultKindLabel(drop.accessLevel) === 'VAULT PREVIEW' ? 'VAULT PREVIEW' : 'VAULT',
        title: drop.title,
        subtitle: `@${drop.authorHandle}`,
        mediaUrl: drop.mediaUrl,
        accent: drop.authorTint,
        onPress: () => openContent(`/vault/drop/${drop.dropId}`, 'explore_vault_preview_opened'),
      });
    }
    return items;
  }, [openContent, openCountry, vaults, viral]);

  const viralHero = viral.slice(0, 2);
  const viralRail = viral.slice(2, 8);

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
          size={globeSize}
          activity={summary?.countries ?? []}
          selectedCode={focusCode}
          onFocusChange={setFocusCode}
          onSelectCountry={openCountry}
          spinToken={spinToken}
          spinTargetLng={spinLng}
          spinning={teleporting}
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

        {teleportReveal ? (
          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(420)}
            style={styles.teleportReveal}
          >
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
                if (teleportReveal.countryCode) openCountry(teleportReveal.countryCode);
                else openContent(teleportReveal.href);
              }}
            />
            <View style={styles.teleportActions}>
              <ControlChip label="Teleport again" onPress={() => void teleport()} emphasis />
              {teleportReveal.href ? (
                <ControlChip label="Open" onPress={() => openContent(teleportReveal.href)} />
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {loading ? <ActivityIndicator color={t.textPrimary} style={{ marginTop: space.md }} /> : null}

        {searching && searchResults ? (
          <SearchPanels results={searchResults} onCountry={openCountry} />
        ) : (
          <>
            {mosaicItems.length > 0 ? (
              <Section title="Discover">
                <ExploreMosaic items={mosaicItems} max={9} />
              </Section>
            ) : null}

            {summary && summary.liveTopicCount > 0 ? (
              <Section title="Happening now">
                <Text allowFontScaling={false} style={[styles.happening, { color: t.textSecondary }]}>
                  {summary.liveTopicCount} live Arena topic
                  {summary.liveTopicCount === 1 ? '' : 's'} worldwide
                </Text>
              </Section>
            ) : null}

            {viralHero.length > 0 ? (
              <Section title="Global viral">
                <View style={styles.viralHeroCol}>
                  {viralHero.map((item) => (
                    <ExploreMediaTile
                      key={`hero-${item.kind}-${item.id}`}
                      kind={
                        item.kind === 'LIVE_ARENA'
                          ? 'LIVE'
                          : item.kind === 'VAULT_PREVIEW'
                            ? 'VAULT PREVIEW'
                            : item.kind === 'CHALLENGE'
                              ? 'CHALLENGE'
                              : 'TAKE'
                      }
                      title={item.title}
                      subtitle={item.subtitle}
                      mediaUrl={item.mediaUrl}
                      span="hero"
                      onPress={() => openContent(item.href)}
                    />
                  ))}
                </View>
                {viralRail.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rail}
                  >
                    {viralRail.map((item) => (
                      <ExploreDiscoveryCard
                        key={`rail-${item.kind}-${item.id}`}
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
                        mediaUrl={item.mediaUrl}
                        onPress={() => openContent(item.href)}
                      />
                    ))}
                  </ScrollView>
                ) : null}
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
                      mediaUrl={hunt.coverUrl}
                      accent="#2A2438"
                      width={240}
                      height={260}
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
                      mediaUrl={challenge.coverUrl}
                      accent="#24362E"
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

            {vaults.length > 0 ? (
              <Section title="From the Vault">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {vaults.map((drop) => (
                    <ExploreDiscoveryCard
                      key={drop.dropId}
                      kind="VAULT"
                      title={drop.title}
                      subtitle={`@${drop.authorHandle}`}
                      meta={drop.accessLevel === 'preview' ? 'Preview' : 'Free Drop'}
                      mediaUrl={drop.mediaUrl}
                      accent={drop.authorTint}
                      onPress={() =>
                        openContent(`/vault/drop/${drop.dropId}`, 'explore_vault_preview_opened')
                      }
                    />
                  ))}
                </ScrollView>
              </Section>
            ) : null}

            <View
              style={[
                styles.connect,
                {
                  borderColor: t.border,
                  backgroundColor: t.scheme === 'light' ? '#111318' : t.surfaceElevated,
                },
              ]}
              accessibilityLabel="Meet the world. Text chat coming next."
            >
              <Text allowFontScaling={false} style={styles.connectKicker}>
                Meet the world
              </Text>
              <Text allowFontScaling={false} style={styles.connectTitle}>
                Talk to someone new
              </Text>
              <Text allowFontScaling={false} style={styles.connectBody}>
                Pseudonymous text matching comes next — country, interests, or same Hood.
                Video later. Always authenticated under the hood for safety.
              </Text>
              <View style={styles.connectRow}>
                <View style={styles.connectPill}>
                  <Text allowFontScaling={false} style={styles.connectPillText}>
                    Text · Coming next
                  </Text>
                </View>
                <View style={[styles.connectPill, styles.connectPillMuted]}>
                  <Text allowFontScaling={false} style={styles.connectPillMutedText}>
                    Video · Later
                  </Text>
                </View>
              </View>
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
          <View style={styles.countryGrid}>
            {results.countries.map((c) => (
              <Pressable
                key={c.countryCode}
                onPress={() => onCountry(c.countryCode)}
                style={[styles.countryCard, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
                accessibilityRole="button"
                accessibilityLabel={c.name}
              >
                <Text allowFontScaling={false} style={[styles.countryCode, { color: t.textMuted }]}>
                  {c.countryCode}
                </Text>
                <Text allowFontScaling={false} style={[styles.countryName, { color: t.textPrimary }]}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}
      {results.topics.length > 0 ? (
        <Section title="Live Arena">
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
        </Section>
      ) : null}
      {results.takes.length > 0 ? (
        <Section title="Takes">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {results.takes.map((take) => (
              <ExploreDiscoveryCard
                key={take.id}
                kind="TAKE"
                title={take.text}
                subtitle={`@${take.authorHandle}`}
                mediaUrl={take.mediaUrl}
                onPress={() => router.push(`/take/${take.id}`)}
              />
            ))}
          </ScrollView>
        </Section>
      ) : null}
      {results.people.length > 0 ? (
        <Section title="People">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {results.people.map((person) => (
              <Pressable
                key={person.id}
                onPress={() => router.push(`/profile/${person.id}`)}
                style={[styles.personCard, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
                accessibilityRole="button"
                accessibilityLabel={`@${person.handle}`}
              >
                <Avatar name={person.name} tint={person.avatarTint} size={56} />
                <Text allowFontScaling={false} style={[styles.personHandle, { color: t.textPrimary }]}>
                  @{person.handle}
                </Text>
                <Text allowFontScaling={false} style={[styles.personMeta, { color: t.textMuted }]} numberOfLines={1}>
                  {person.countryCode ? countryByCode(person.countryCode)?.name ?? person.countryCode : person.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}
      {results.vault.length > 0 ? (
        <Section title="Vault previews">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {results.vault.map((drop) => (
              <ExploreDiscoveryCard
                key={drop.dropId}
                kind="VAULT"
                title={drop.title}
                subtitle={`@${drop.creatorHandle}`}
                meta={drop.accessLevel === 'preview' ? 'Preview' : 'Free'}
                mediaUrl={drop.mediaUrl}
                onPress={() => router.push(`/vault/drop/${drop.dropId}`)}
              />
            ))}
          </ScrollView>
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
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.1,
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
  viralHeroCol: { gap: space.sm },
  teleportReveal: { gap: space.sm },
  teleportActions: { flexDirection: 'row', gap: space.sm },
  connect: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: 8,
    overflow: 'hidden',
  },
  connectKicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  connectTitle: {
    ...typeScale.section,
    fontSize: 24,
    fontWeight: '800',
    color: '#FAFAF8',
  },
  connectBody: {
    ...typeScale.meta,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.68)',
  },
  connectRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  connectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  connectPillText: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#FAFAF8',
  },
  connectPillMuted: { backgroundColor: 'rgba(255,255,255,0.06)' },
  connectPillMutedText: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
  },
  searchPanels: { gap: space.lg },
  countryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  countryCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: 4,
    minHeight: 72,
  },
  countryCode: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  countryName: { ...typeScale.label, fontSize: 16, fontWeight: '800' },
  personCard: {
    width: 132,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    alignItems: 'center',
    gap: 8,
  },
  personHandle: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  personMeta: { ...typeScale.caption, fontSize: 11 },
});
