import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RadarCard } from '../../components/vault/RadarCard';
import { VaultHeader } from '../../components/vault/VaultHeader';
import { vault as s } from '../../components/vault/vaultStyles';
import { Notice } from '../../components/shared/Notice';
import { selectCampaigns, selectCreators, useClash } from '../../store';
import { space } from '../../theme';

/** Sponsor Radar tab (spec §20): every live campaign card. */
export default function RadarScreen(): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const campaigns = selectCampaigns(state);
  const creators = selectCreators(state);

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <VaultHeader title="Sponsor Radar" subtitle="Clicks in, orders out." count={campaigns.length} />
        {campaigns.map((campaign) => (
          <RadarCard
            key={campaign.id}
            campaign={campaign}
            creator={creators.find((c) => c.id === campaign.creatorId)}
            onOpen={() => router.push(`/campaign/${campaign.id}`)}
          />
        ))}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}
