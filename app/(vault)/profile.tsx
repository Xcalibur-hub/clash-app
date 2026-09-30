import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ProfileHero } from '../../components/profile/ProfileHero';
import { SegmentedTabs, type SegmentedTab } from '../../components/shared/SegmentedTabs';
import { ReputationBar } from '../../components/profile/ReputationBar';
import { TakeMiniCard } from '../../components/profile/TakeMiniCard';
import { WinCard } from '../../components/profile/WinCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { ArenaIcon, TrophyIcon } from '../../components/shared/icons';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import {
  selectAuthor,
  selectViewerTakes,
  useClash,
  type WinEntry,
} from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

type VaultProfileTab = 'takes' | 'wins';

const VAULT_TABS: readonly SegmentedTab<VaultProfileTab>[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'wins', label: 'Wins' },
];

/**
 * Vault PROFILE — same viewer identity, continuous editorial page.
 * Wins stay empty until server Clash history is wired (no mocks).
 */
export default function VaultProfileScreen(): React.JSX.Element {
  const { state } = useClash();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<VaultProfileTab>('takes');
  const router = useRouter();
  const t = useThemeColors();
  const viewer = state.viewer;
  const takes = React.useMemo(() => selectViewerTakes(state), [state]);
  const wins: readonly WinEntry[] = [];

  const winnerHandle = (entry: WinEntry): string => {
    const authorId =
      entry.result.winningSide === 'A' ? entry.take.authorId : entry.clash.challengerId;
    return selectAuthor(state, authorId)?.handle ?? 'unknown';
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: dockBottomPadding(insets.bottom),
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
          ? takes.map((take) => (
              <TakeMiniCard
                key={take.id}
                take={take}
                now={Date.now()}
                onPress={() => router.push(`/clash/${take.id}`)}
              />
            ))
          : wins.map((entry) => (
              <WinCard
                key={entry.result.clashId}
                entry={entry}
                winnerHandle={winnerHandle(entry)}
                onPress={() => router.push(`/clash/${entry.take.id}`)}
              />
            ))}
        {tab === 'takes' && takes.length === 0 ? (
          <EmptyState
            icon={ArenaIcon}
            title="No Takes yet"
            body="Share an opinion in Arena."
            actionLabel="Open Arena"
            onAction={() => router.replace('/(tabs)')}
          />
        ) : null}
        {tab === 'wins' && wins.length === 0 ? (
          <EmptyState
            icon={TrophyIcon}
            title="No Clash wins yet"
            body="Settled wins will appear here when available."
          />
        ) : null}
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
