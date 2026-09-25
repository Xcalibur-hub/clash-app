import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudienceBars } from '../../components/vault/AudienceBars';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { DropRow } from '../../components/vault/DropRow';
import { VaultHero } from '../../components/vault/VaultHero';
import { home as h } from '../../components/vault/vaultHomeStyles';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { ArrowRightIcon, VaultIcon } from '../../components/shared/icons';
import { aggregateCities, sponsorOverview } from '../../services/vaultService';
import { selectCampaigns, selectDrops, useClash } from '../../store';
import { ink, space } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

/** THE VAULT home (§21): creator-business dashboard — hero GMV, radar, audience, drops. */
export default function VaultHome(): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const campaigns = selectCampaigns(state);
  const drops = selectDrops(state);
  const overview = React.useMemo(() => sponsorOverview(campaigns), [campaigns]);
  const audience = React.useMemo(() => aggregateCities(campaigns).slice(0, 3), [campaigns]);
  const radar = React.useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'ACTIVE').slice(0, 3),
    [campaigns],
  );
  const exclusives = React.useMemo(
    () => drops.filter((drop) => drop.tier === 'exclusive').slice(0, 3),
    [drops],
  );
  const openAnalytics = (): void => {
    hapticPress();
    router.push('/(vault)/analytics');
  };

  return (
    <View style={h.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[h.content, { paddingTop: insets.top + space.md }]}
      >
        <View style={h.head}>
          <Text allowFontScaling={false} style={h.brand}>VAULT</Text>
          <Text allowFontScaling={false} style={h.title}>Your creator business</Text>
        </View>

        <VaultHero
          value={`₹${overview.revenue.toLocaleString('en-IN')}`}
          label="Attributed GMV · last 30 days"
          stats={[
            { label: 'Orders', value: overview.orders.toLocaleString('en-IN') },
            { label: 'Redemptions', value: overview.redemptions.toLocaleString('en-IN') },
            { label: 'Conversion', value: overview.conversion },
          ]}
        />

        <Text allowFontScaling={false} style={h.section}>Sponsor radar</Text>
        {radar.length === 0 ? (
          <EmptyState
            icon={VaultIcon}
            title="No campaigns yet."
            body="Brand deals and attribution land here the moment they go live."
            actionLabel="Meet the creators"
            onAction={() => router.push('/(vault)/creators')}
          />
        ) : (
          radar.map((campaign) => (
            <CreatorRow
              key={campaign.id}
              title={`${campaign.code} · ${campaign.sponsor}`}
              sub={`${campaign.status.toLowerCase()} · ${campaign.period}`}
              value={`₹${campaign.gmv.toLocaleString('en-IN')}`}
              onPress={() => router.push(`/campaign/${campaign.id}`)}
            />
          ))
        )}

        <Text allowFontScaling={false} style={h.section}>Audience</Text>
        <AudienceBars shares={audience} />

        <Text allowFontScaling={false} style={h.section}>Exclusive drops</Text>
        {exclusives.map((drop) => (
          <DropRow
            key={drop.id}
            drop={drop}
            locked
            onOpen={() => router.push(`/creator/${drop.creatorId}`)}
          />
        ))}

        <Pressable
          onPress={openAnalytics}
          accessibilityRole="link"
          accessibilityLabel="Open analytics"
          style={h.linkRow}
        >
          <Text allowFontScaling={false} style={h.linkText}>Analytics</Text>
          <ArrowRightIcon size={16} color={ink.secondary} strokeWidth={2.4} />
        </Pressable>
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}