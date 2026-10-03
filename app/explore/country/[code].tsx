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
import { tap as hapticTap } from '../../../utils/haptics';

/**
 * Country Explore surface.
 * Country source: profiles.public_country_code (explicit public declaration only).
 */
export default function ExploreCountryScreen(): React.JSX.Element {
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
    page.treasures.length === 0;

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

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(420)}>
          <Text allowFontScaling={false} style={[styles.country, { color: t.textPrimary }]}>
            {(meta?.name ?? code).split('').join(' ')}
          </Text>
          <Text allowFontScaling={false} style={[styles.activity, { color: t.textSecondary }]}>
            {page?.activityCount != null
              ? `${page.activityCount.toLocaleString()} exploring`
              : 'Quiet right now'}
          </Text>
        </Animated.View>

        {loading ? <ActivityIndicator color={t.textPrimary} /> : null}
        {error ? (
          <Text allowFontScaling={false} style={{ color: t.textMuted }}>
            {error}
          </Text>
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

        {page && page.liveTopics.length > 0 ? (
          <Section title="Live now">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.liveTopics.map((topic) => (
                <ExploreDiscoveryCard
                  key={topic.id}
                  kind="LIVE"
                  title={topic.title}
                  subtitle={topic.hood}
                  onPress={() => {
                    analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
                    router.push(`/arena/topic/${topic.id}`);
                  }}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {page && page.takes.length > 0 ? (
          <Section title="Viral">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {page.takes.map((take) => (
                <ExploreDiscoveryCard
                  key={take.id}
                  kind="TAKE"
                  title={take.text}
                  subtitle={`@${take.authorHandle}`}
                  meta={`Heat ${take.heat}`}
                  onPress={() => {
                    analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
                    router.push(`/take/${take.id}`);
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
                  meta="Preview · Free"
                  onPress={() => {
                    analytics.track('explore_vault_preview_opened', {
                      realm: 'vault',
                      source: 'explore',
                      vault_access_type: 'free',
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
                <ExploreDiscoveryCard
                  key={creator.id}
                  kind="CREATOR"
                  title={creator.name}
                  subtitle={`@${creator.handle}`}
                  meta={creator.homeHood ?? creator.rank}
                  onPress={() => {
                    analytics.track('explore_content_opened', { realm: 'profile', source: 'explore' });
                    router.push(`/profile/${creator.id}`);
                  }}
                />
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
                  onPress={() => {
                    analytics.track('explore_challenge_opened', { realm: 'arena', source: 'explore' });
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
                  meta={`${hunt.giftsRemaining} gifts remaining`}
                  onPress={() => {
                    analytics.track('explore_treasure_opened', { realm: 'arena', source: 'explore' });
                  }}
                />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {/* Connect entry — product placeholder only; no fake matching. */}
        <View
          style={[styles.connect, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}
          accessibilityLabel="Meet the world. Text chat coming next."
        >
          <Text allowFontScaling={false} style={[styles.connectKicker, { color: t.textMuted }]}>
            Meet the world
          </Text>
          <Text allowFontScaling={false} style={[styles.connectTitle, { color: t.textPrimary }]}>
            Talk to someone from {meta?.name ?? code}
          </Text>
          <Text allowFontScaling={false} style={[styles.connectBody, { color: t.textSecondary }]}>
            Pseudonymous text matching is next. Video later. Accountable internally —
            never unauthenticated chat.
          </Text>
          <Text allowFontScaling={false} style={[styles.connectSoon, { color: t.textMuted }]}>
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
  country: {
    ...typeScale.editorial,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  activity: { ...typeScale.meta, fontSize: 15, marginTop: 6 },
  section: { gap: space.sm },
  sectionTitle: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  rail: { gap: space.sm, paddingRight: layout.screenX },
  quiet: { gap: space.sm, paddingVertical: space.lg },
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
});
