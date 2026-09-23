import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BadgeRow } from '../../components/profile/BadgeRow';
import { ProfileHero } from '../../components/profile/ProfileHero';
import { SegmentedTabs, type SegmentedTab } from '../../components/shared/SegmentedTabs';
import { ReputationBar } from '../../components/profile/ReputationBar';
import { StatGrid } from '../../components/profile/StatGrid';
import { TakeMiniCard } from '../../components/profile/TakeMiniCard';
import { WinCard } from '../../components/profile/WinCard';
import { profileStyles as s } from '../../components/profile/profileStyles';
import { VaultHeader } from '../../components/vault/VaultHeader';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Chip } from '../../components/shared/Chip';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlassCard } from '../../components/shared/GlassCard';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { ArenaIcon, TrophyIcon } from '../../components/shared/icons';
import {
  selectAuthor,
  selectUnlockedDropIds,
  selectViewerTakes,
  selectViewerWins,
  useClash,
  type WinEntry,
} from '../../store';
import { space } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

type VaultProfileTab = 'takes' | 'wins';

const VAULT_TABS: readonly SegmentedTab<VaultProfileTab>[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'wins', label: 'Wins' },
];

/** Vault PROFILE (spec §23): the same viewer, seen from the premium realm. */
export default function VaultProfileScreen(): React.JSX.Element {
  const { state } = useClash();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<VaultProfileTab>('takes');
  const router = useRouter();
  const viewer = state.viewer;
  const takes = React.useMemo(() => selectViewerTakes(state), [state]);
  const wins = React.useMemo(() => selectViewerWins(state), [state]);
  const unlocked = React.useMemo(() => selectUnlockedDropIds(state), [state]);

  const winnerHandle = (entry: WinEntry): string => {
    const authorId =
      entry.result.winningSide === 'A' ? entry.take.authorId : entry.clash.challengerId;
    return selectAuthor(state, authorId)?.handle ?? 'unknown';
  };

  return (
    <AuroraBackground tone="calm" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <VaultHeader
          title="PROFILE"
          subtitle="Your influence, itemised."
          viewer={{
            name: viewer.name,
            tint: viewer.tint,
            reputation: viewer.reputation,
            coins: viewer.coins,
          }}
        />

        <ProfileHero viewer={viewer} />

        <GlassCard level="soft" contentStyle={s.rep}>
          <ReputationBar reputation={viewer.reputation} />
        </GlassCard>

        <StatGrid viewer={viewer} />

        <SectionHeading eyebrow="THE VAULT SHELF" title="Unlocked drops" />
        <Chip label={`${unlocked.length} UNLOCKED`} tone="gold" data />
        {unlocked.length === 0 ? (
          <Text style={{ color: 'rgba(247,247,250,0.44)' }}>
            Nothing unlocked yet — the Vault holds {state.drops.filter((d) => d.tier === 'exclusive').length}{' '}
            exclusive drops.
          </Text>
        ) : null}

        <SectionHeading eyebrow="EARNED IN THE ARENA" title="Badges" />
        <BadgeRow badges={viewer.badges} />

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
          <EmptyState icon={ArenaIcon} title="No live takes." body="Everything you drop expires after 24 hours." actionLabel="OPEN THE ARENA" onAction={() => undefined} />
        ) : null}
        {tab === 'wins' && wins.length === 0 ? (
          <EmptyState icon={TrophyIcon} title="No wins yet." body="Judge a clash correctly and the verdict lands here." actionLabel="FIND A CLASH" onAction={() => undefined} />
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}
