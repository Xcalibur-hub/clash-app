import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileHero } from '../../components/profile/ProfileHero';
import { SegmentedTabs, type SegmentedTab } from '../../components/shared/SegmentedTabs';
import { ReputationBar } from '../../components/profile/ReputationBar';
import { VaultProfileTakes } from '../../components/vault/VaultProfileTakes';
import { VaultWins } from '../../components/vault/VaultWins';
import { Notice } from '../../components/shared/Notice';
import {
  useClash,
} from '../../store';
import { layout, space, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

type VaultProfileTab = 'takes' | 'wins';

const VAULT_TABS: readonly SegmentedTab<VaultProfileTab>[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'wins', label: 'Wins' },
];

/**
 * Vault PROFILE — same viewer identity, continuous editorial page.
 * Wins use the existing authorized profile-history contract.
 */
export default function VaultProfileScreen(): React.JSX.Element {
  const { state } = useClash();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<VaultProfileTab>('takes');
  const t = useThemeColors();
  const viewer = state.viewer;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: space.lg,
          },
        ]}
      >
        <ProfileHero viewer={viewer} />

        <ReputationBar reputation={viewer.reputation} rank={viewer.rank} streak={viewer.streak} />

        <SegmentedTabs
          value={tab}
          items={VAULT_TABS}
          onChange={(next) => {
            hapticPress();
            setTab(next);
          }}
          label="Vault profile sections"
        />

        {tab === 'takes'
          ? <VaultProfileTakes profileId={viewer.id} />
          : <VaultWins profileId={viewer.id} />}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.lg,
  },
});
