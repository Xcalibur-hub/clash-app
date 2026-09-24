import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorCard } from '../../components/vault/CreatorCard';
import { DropRow } from '../../components/vault/DropRow';
import { RadarCard } from '../../components/vault/RadarCard';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { VaultIcon } from '../../components/shared/icons';
import { dropsFor } from '../../services/vaultService';
import { selectCampaigns, selectCreators, selectDrops, useClash } from '../../store';
import { accent, card, ink, layout, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';

/** THE VAULT — Executive creator dashboard with pure black, gold highlights, white typography. */
export default function VaultHome(): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const creators = selectCreators(state);
  const drops = selectDrops(state);
  const campaigns = selectCampaigns(state);
  const trending = React.useMemo(() => [...creators].sort((a, b) => b.followers - a.followers).slice(0, 3), [creators]);
  const exclusives = React.useMemo(() => drops.filter((drop) => drop.tier === 'exclusive').slice(0, 3), [drops]);

  return (
    <AuroraBackground tone="calm" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      >
        {/* Executive header */}
        <View style={styles.hero}>
          <Text allowFontScaling={false} style={styles.eyebrow}>
            THE VAULT
          </Text>
          <Text allowFontScaling={false} style={styles.title}>
            Where influence becomes value.
          </Text>
        </View>

        {/* Trending Creators - Focus on Followers, Conversion %, Unlock CTA */}
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          TRENDING CREATORS
        </Text>
        {trending.map((creator) => {
          const creatorDrops = dropsFor(creator.id, drops);
          const pub = creatorDrops.filter((d) => d.tier === 'public').length;
          const exc = creatorDrops.filter((d) => d.tier === 'exclusive').length;
          const conversion = Math.round((pub / (pub + exc || 1)) * 100);
          return (
            <View key={creator.id} style={styles.creatorCard}>
              <View style={styles.creatorRow}>
                <View style={styles.creatorInfo}>
                  <Text allowFontScaling={false} style={styles.creatorName}>
                    @{creator.handle}
                  </Text>
                  <Text allowFontScaling={false} style={styles.creatorStats}>
                    {compact(creator.followers)} followers · {conversion}% conversion
                  </Text>
                </View>
                <View style={styles.creatorActions}>
                  <Text allowFontScaling={false} style={styles.creatorDrop}>
                    {pub} public · {exc} exclusive
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Exclusive Drops */}
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          EXCLUSIVE DROPS
        </Text>
        {exclusives.map((drop) => (
          <View key={drop.id} style={styles.dropCard}>
            <Text allowFontScaling={false} style={styles.dropTitle}>
              {drop.title}
            </Text>
            <View style={styles.dropMeta}>
              <Text allowFontScaling={false} style={styles.dropPrice}>
                ₹{drop.price}
              </Text>
              <Text allowFontScaling={false} style={styles.dropCreator}>
                @{creators.find((c) => c.id === drop.creatorId)?.handle}
              </Text>
            </View>
          </View>
        ))}

        {/* Sponsor Radar - Clean numbers for Redemptions, GMV */}
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          SPONSOR RADAR
        </Text>
        {campaigns.length === 0 ? (
          <EmptyState
            icon={VaultIcon}
            title="No campaigns yet."
            body={`Sponsor attribution lands here. ${compact(0)} clicks and counting.`}
            actionLabel="MEET THE CREATORS"
            onAction={() => router.push('/(vault)/creators')}
          />
        ) : (
          campaigns.slice(0, 2).map((campaign) => (
            <View key={campaign.id} style={styles.radarCard}>
              <Text allowFontScaling={false} style={styles.radarTitle}>
                {campaign.code} · {campaign.sponsor}
              </Text>
              <View style={styles.radarStats}>
                <View style={styles.radarStat}>
                  <Text allowFontScaling={false} style={styles.radarStatValue}>
                    {compact(campaign.redemptions)}
                  </Text>
                  <Text allowFontScaling={false} style={styles.radarStatLabel}>
                    Redemptions
                  </Text>
                </View>
                <View style={styles.radarStat}>
                  <Text allowFontScaling={false} style={styles.radarStatValue}>
                    {compact(campaign.gmv)}
                  </Text>
                  <Text allowFontScaling={false} style={styles.radarStatLabel}>
                    GMV
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, gap: space.xl },
  hero: {
    paddingBottom: space.lg,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: accent.gold,
    letterSpacing: 2,
  },
  title: {
    ...typeScale.title,
    color: ink.primary,
    marginTop: space.xs,
  },
  sectionTitle: {
    ...typeScale.section,
    color: ink.primary,
    marginTop: space.md,
  },
  creatorCard: {
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: accent.gold,
    backgroundColor: 'rgba(255,200,97,0.05)',
    marginTop: space.sm,
  },
  creatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    ...typeScale.cardTitle,
    color: ink.primary,
    fontWeight: '700',
  },
  creatorStats: {
    ...typeScale.subtitle,
    color: ink.secondary,
    marginTop: space.xs,
  },
  creatorActions: {
    alignItems: 'flex-end',
  },
  creatorDrop: {
    ...typeScale.data,
    color: accent.gold,
  },
  dropCard: {
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
    marginTop: space.sm,
  },
  dropTitle: {
    ...typeScale.cardTitle,
    color: ink.primary,
  },
  dropMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  dropPrice: {
    ...typeScale.data,
    color: accent.gold,
  },
  dropCreator: {
    ...typeScale.subtitle,
    color: ink.secondary,
  },
  radarCard: {
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
    marginTop: space.sm,
  },
  radarTitle: {
    ...typeScale.cardTitle,
    color: ink.primary,
  },
  radarStats: {
    flexDirection: 'row',
    gap: space.xl,
    marginTop: space.md,
  },
  radarStat: {
    flex: 1,
  },
  radarStatValue: {
    ...typeScale.dataLg,
    color: accent.gold,
  },
  radarStatLabel: {
    ...typeScale.subtitle,
    color: ink.secondary,
  },
});
