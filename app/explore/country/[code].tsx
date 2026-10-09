import {withExploreAccount} from '../../../components/explore/ExploreAccountBoundary';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ExploreDiscoveryCard } from '../../../components/explore/ExploreDiscoveryCard';
import { ExploreMediaTile } from '../../../components/explore/ExploreMediaTile';
import { ExploreMosaic, type ExploreMosaicItem } from '../../../components/explore/ExploreMosaic';
import { Avatar } from '../../../components/shared/Avatar';
import { BackIcon } from '../../../components/shared/icons';
import { Notice } from '../../../components/shared/Notice';
import { dockBottomPadding } from '../../../components/navigation/dockConfig';
import {
  fetchExploreCountry,
  type ExploreCountryPage,
} from '../../../services/exploreService';
import { analytics } from '../../../services/analytics';
import { countryByCode } from '../../../data/exploreCountries';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { exploreVaultKindLabel } from '../../../utils/exploreVaultVisibility';
import { tap as hapticTap } from '../../../utils/haptics';

/**
 * Country Explore — media-rich discovery for one public country code.
 * Source: profiles.public_country_code only.
 */
function ExploreCountryScreen(): React.JSX.Element {
  const { code: raw } = useLocalSearchParams<{ code: string | string[] }>();
  const code = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase() ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [page, setPage] = React.useState<ExploreCountryPage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const meta = countryByCode(code);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(null);
    setError(null);
    if(!/^[A-Z]{2}$/.test(code)){setError('Invalid country.');setLoading(false);return;}
    void fetchExploreCountry(code)
      .then((next) => {
        if (cancelled) return;
        setPage(next);
        setError(null);
        analytics.track('explore_country_selected', {
          realm: 'arena',
          source: 'explore',
        });
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this country.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const quiet =
    page &&
    page.takes.length === 0 &&
    page.creators.length === 0 &&
    page.vaultPreviews.length === 0 &&
    page.challenges.length === 0 &&
    page.treasures.length === 0 &&
    page.liveTopics.length === 0;

  const mosaicItems = React.useMemo((): ExploreMosaicItem[] => {
    if (!page) return [];
    const items: ExploreMosaicItem[] = [];
    for (const take of page.takes) {
      items.push({
        id: take.id,
        kind: 'TAKE',
        title: take.text,
        subtitle: `@${take.authorHandle}`,
        mediaUrl: take.mediaUrl,
        onPress: () => {
          analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
          router.push(`/take/${take.id}`);
        },
      });
    }
    for (const drop of page.vaultPreviews) {
      items.push({
        id: drop.dropId,
        kind: exploreVaultKindLabel(drop.accessLevel) === 'VAULT PREVIEW' ? 'VAULT PREVIEW' : 'VAULT',
        title: drop.title,
        subtitle: `@${drop.authorHandle}`,
        mediaUrl: drop.mediaUrl,
        accent: drop.authorTint,
        onPress: () => {
          analytics.track('explore_vault_preview_opened', {
            realm: 'vault',
            source: 'explore',
            vault_access_type: drop.accessLevel,
          });
          router.push(`/vault/drop/${drop.dropId}`);
        },
      });
    }
    for (const topic of page.liveTopics) {
      items.push({
        id: topic.id,
        kind: 'LIVE',
        title: topic.title,
        subtitle: topic.hood,
        accent: '#1B3A4B',
        onPress: () => {
          analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
          router.push(`/arena/topic/${topic.id}`);
        },
      });
    }
    return items;
  }, [page, router]);

  const heroTake = page?.takes.find((x) => x.mediaUrl) ?? page?.takes[0] ?? null;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingBottom: dockBottomPadding(insets.bottom),
          paddingHorizontal: layout.screenX,
          gap: space.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Pressable
            onPress={() => {
              hapticTap();
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/explore');
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <BackIcon size={20} color={t.textPrimary} strokeWidth={2.2} />
          </Pressable>
        </View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(380)} style={styles.heroCopy}>
          <Text allowFontScaling={false} style={[styles.country, { color: t.textPrimary }]}>
            {(meta?.name ?? code).toUpperCase()}
          </Text>
          <Text allowFontScaling={false} style={[styles.activity, { color: t.textSecondary }]}>
            {page?.activityCount != null
              ? `${page.activityCount.toLocaleString()} public profiles`
              : 'Quiet right now'}
          </Text>
        </Animated.View>

        {loading ? <ActivityIndicator color={t.textPrimary} /> : null}
        {error ? (
          <Text allowFontScaling={false} style={{ color: t.textMuted }}>
            {error}
          </Text>
        ) : null}

        {heroTake ? (
          <Animated.View entering={reduced ? undefined : FadeInDown.delay(80).duration(420)}>
            <ExploreMediaTile
              kind="TAKE"
              title={heroTake.text}
              subtitle={`@${heroTake.authorHandle}`}
              mediaUrl={heroTake.mediaUrl}
              span="hero"
              onPress={() => {
                analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
                router.push(`/take/${heroTake.id}`);
              }}
            />
          </Animated.View>
        ) : null}

        {quiet ? (
          <View style={styles.quiet}>
            <Text allowFontScaling={false} style={[styles.quietTitle, { color: t.textPrimary }]}>
              Quiet right now.
            </Text>
            <Text allowFontScaling={false} style={[styles.quietBody, { color: t.textSecondary }]}>
              Explore something else →
            </Text>
            <Pressable
              onPress={() => {
                hapticTap();
                router.replace('/(tabs)/explore');
              }}
              style={[styles.teleport, { backgroundColor: t.textPrimary }]}
              accessibilityRole="button"
              accessibilityLabel="Teleport"
            >
              <Text allowFontScaling={false} style={[styles.teleportText, { color: t.background }]}>
                Teleport
              </Text>
            </Pressable>
          </View>
        ) : null}

        {mosaicItems.length > 0 ? (
          <Section title={`Trending in ${meta?.name ?? code}`}>
            <ExploreMosaic items={mosaicItems} max={8} />
          </Section>
        ) : null}

        {page && page.liveTopics.length > 0 ? (
          <Section title={`Live in ${meta?.name ?? code}`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.liveTopics.map((topic) => (
                <ExploreDiscoveryCard
                  key={topic.id}
                  kind="LIVE"
                  title={topic.title}
                  subtitle={topic.hood}
                  accent="#1B3A4B"
                  onPress={() => {
                    analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
                    router.push(`/arena/topic/${topic.id}`);
                  }}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {page && page.vaultPreviews.length > 0 ? (
          <Section title="From the Vault">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.vaultPreviews.map((drop) => (
                <ExploreDiscoveryCard
                  key={drop.dropId}
                  kind="VAULT"
                  title={drop.title}
                  subtitle={`@${drop.authorHandle}`}
                  meta={drop.accessLevel === 'preview' ? 'Preview' : 'Free Drop'}
                  mediaUrl={drop.mediaUrl}
                  accent={drop.authorTint}
                  onPress={() => {
                    analytics.track('explore_vault_preview_opened', {
                      realm: 'vault',
                      source: 'explore',
                      vault_access_type: drop.accessLevel,
                    });
                    router.push(`/vault/drop/${drop.dropId}`);
                  }}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {page && page.creators.length > 0 ? (
          <Section title={`Creators from ${meta?.name ?? code}`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.creators.map((creator) => (
                <Pressable
                  key={creator.id}
                  onPress={() => {
                    hapticTap();
                    analytics.track('explore_content_opened', { realm: 'profile', source: 'explore' });
                    router.push(`/profile/${creator.id}`);
                  }}
                  style={[
                    styles.creatorCard,
                    { backgroundColor: creator.avatarTint, borderColor: t.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${creator.name}, @${creator.handle}`}
                >
                  <View style={styles.creatorScrim} />
                  <Avatar name={creator.name} tint={creator.avatarTint} size={52} />
                  <Text allowFontScaling={false} style={styles.creatorName} numberOfLines={1}>
                    {creator.name}
                  </Text>
                  <Text allowFontScaling={false} style={styles.creatorHandle} numberOfLines={1}>
                    @{creator.handle}
                  </Text>
                  <Text allowFontScaling={false} style={styles.creatorMeta} numberOfLines={1}>
                    {creator.homeHood ?? creator.rank}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {page && page.challenges.length > 0 ? (
          <Section title="Challenges">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.challenges.map((challenge) => (
                <ExploreDiscoveryCard
                  key={challenge.id}
                  kind="CHALLENGE"
                  title={challenge.title}
                  subtitle={challenge.challengeType}
                  meta={`${challenge.entryCount} entries`}
                  mediaUrl={challenge.coverUrl}
                  accent="#24362E"
                  width={230}
                  height={260}
                  onPress={() => {
                    analytics.track('challenge_opened', { realm: 'explore', source: 'explore' });
                    router.push(`/explore/challenge/${challenge.id}` as never);
                  }}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {page && page.treasures.length > 0 ? (
          <Section title="Treasure hunts">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.treasures.map((hunt) => (
                <ExploreDiscoveryCard
                  key={hunt.id}
                  kind="TREASURE"
                  title={hunt.title}
                  subtitle={hunt.clue}
                  meta={
                    hunt.giftsRemaining == null
                      ? 'Unlimited gifts'
                      : `${hunt.giftsRemaining} gifts remaining`
                  }
                  mediaUrl={hunt.coverUrl}
                  accent="#2A2438"
                  width={240}
                  height={270}
                  onPress={() => {
                    analytics.track('treasure_opened', { realm: 'explore', source: 'explore' });
                    router.push(`/explore/treasure/${hunt.id}` as never);
                  }}
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
            Talk to someone from {meta?.name ?? code}
          </Text>
          <Text allowFontScaling={false} style={styles.connectBody}>
            Pseudonymous text matching is next. Video later. Accountable internally —
            never unauthenticated chat.
          </Text>
          <Text allowFontScaling={false} style={styles.connectSoon}>
            Coming next
          </Text>
        </View>
      </ScrollView>
      <Notice offset={0} />
    </View>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center' },
  back: {
    width: 36,
    height: 36,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { gap: 6 },
  country: {
    ...typeScale.editorial,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  activity: { ...typeScale.meta, fontSize: 15 },
  section: { gap: space.sm },
  sectionTitle: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  rail: { gap: space.sm, paddingRight: layout.screenX },
  quiet: { gap: space.sm, paddingVertical: space.md },
  quietTitle: { ...typeScale.section, fontSize: 22, fontWeight: '800' },
  quietBody: { ...typeScale.meta, fontSize: 15 },
  teleport: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teleportText: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
  creatorCard: {
    width: 148,
    height: 196,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    justifyContent: 'flex-end',
    gap: 4,
    overflow: 'hidden',
  },
  creatorScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  creatorName: { ...typeScale.label, fontSize: 15, fontWeight: '800', color: '#FAFAF8' },
  creatorHandle: { ...typeScale.meta, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  creatorMeta: { ...typeScale.caption, fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  connect: {
    borderRadius: 28,
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
    color: 'rgba(255,255,255,0.55)',
  },
  connectTitle: { ...typeScale.section, fontSize: 22, fontWeight: '800', color: '#FAFAF8' },
  connectBody: {
    ...typeScale.meta,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.68)',
  },
  connectSoon: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    color: 'rgba(255,255,255,0.5)',
  },
});

export default withExploreAccount(ExploreCountryScreen);
