import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorCard } from '../../components/vault/CreatorCard';
import { VaultHeader } from '../../components/vault/VaultHeader';
import { vault as s } from '../../components/vault/vaultStyles';
import { Notice } from '../../components/shared/Notice';
import { dropsFor } from '../../services/vaultService';
import { selectCreators, selectDrops, useClash } from '../../store';
import { space } from '../../theme';

/** Vault Creators tab: every creator card (§17). */
export default function CreatorsScreen(): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const creators = selectCreators(state);
  const drops = selectDrops(state);

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <VaultHeader title="Creators" subtitle="Attention, itemised." count={creators.length} />
        {creators.map((creator) => {
          const creatorDrops = dropsFor(creator.id, drops);
          return (
            <CreatorCard
              key={creator.id}
              creator={creator}
              publicCount={creatorDrops.filter((d) => d.tier === 'public').length}
              exclusiveCount={creatorDrops.filter((d) => d.tier === 'exclusive').length}
              onOpen={() => router.push(`/creator/${creator.id}`)}
            />
          );
        })}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}
