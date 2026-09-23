import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorCard } from '../../components/vault/CreatorCard';
import { DropRow } from '../../components/vault/DropRow';
import { RadarCard } from '../../components/vault/RadarCard';
import { vault as s } from '../../components/vault/vaultStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { VaultIcon } from '../../components/shared/icons';
import { dropsFor } from '../../services/vaultService';
import { selectCampaigns, selectCreators, selectDrops, useClash } from '../../store';
import { space } from '../../theme';
import { compact } from '../../utils/format';

/** THE VAULT (spec §17): "Where influence becomes value." */
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
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <View style={s.hero}>
          <Text allowFontScaling={false} style={s.eyebrow}>THE VAULT</Text>
          <Text allowFontScaling={false} style={s.title}>Where influence becomes value.</Text>
        </View>

        <SectionHeading eyebrow="TRENDING CREATORS" title="Earning attention" />
        {trending.map((creator) => {
          const creatorDrops = dropsFor(creator.id, drops);
          const pub = creatorDrops.filter((d) => d.tier === 'public').length;
          const exc = creatorDrops.filter((d) => d.tier === 'exclusive').length;
          return (
            <CreatorCard
              key={creator.id}
              creator={creator}
              publicCount={pub}
              exclusiveCount={exc}
              onOpen={() => router.push(`/creator/${creator.id}`)}
            />
          );
        })}

        <SectionHeading eyebrow="EXCLUSIVE DROPS" title="Worth unlocking" />
        {exclusives.map((drop) => (
          <DropRow
            key={drop.id}
            drop={drop}
            locked={!state.unlocks[drop.id]}
            onOpen={() => router.push(`/creator/${drop.creatorId}`)}
          />
        ))}

        <SectionHeading
          eyebrow="SPONSOR RADAR"
          title="Live campaigns"
          accessory={undefined}
        />
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
            <RadarCard
              key={campaign.id}
              campaign={campaign}
              creator={creators.find((c) => c.id === campaign.creatorId)}
              onOpen={() => router.push('/(vault)/radar')}
            />
          ))
        )}
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}
