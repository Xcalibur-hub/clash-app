/**
 * Search Hub — grouped Search results for Explore.
 *
 * Moved verbatim out of `app/(tabs)/explore.tsx` by step S1: identical props, group gating,
 * country selection, styling, accessibility labels and navigation targets. Only the relative
 * import paths and the ownership of its own style keys changed.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from '../shared/Avatar';
import { ExploreDiscoveryCard } from './ExploreDiscoveryCard';
import { ExploreMediaTile } from './ExploreMediaTile';
import { radius, space, useThemeColors } from '../../theme';
import { EXPLORE_SEARCH_GROUPS } from '../../utils/exploreForYouRank';
import type { ExploreSearchGroup } from '../../utils/exploreForYouRank';
import { sharedExploreStyles } from './exploreSharedStyles';
import type { ExploreSearchResults } from '../../services/exploreService';

export function SearchHub({
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
          contentContainerStyle={sharedExploreStyles.rail}
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
          contentContainerStyle={sharedExploreStyles.rail}
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
          contentContainerStyle={sharedExploreStyles.rail}
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
  filterRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  filterChip: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
