import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ProfileHero } from '../../components/profile/ProfileHero';
import { SegmentedTabs, type SegmentedTab } from '../../components/shared/SegmentedTabs';
import { ReputationBar } from '../../components/profile/ReputationBar';
import { TakeMiniCard } from '../../components/profile/TakeMiniCard';
import { ProfileClashRow } from '../../components/profile/ProfileLists';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { ArenaIcon, TrophyIcon } from '../../components/shared/icons';
import { dockBottomPadding } from '../../components/navigation/dockConfig';
import {
  fetchMyArenaReputation,
  type ArenaReputation,
} from '../../services/arenaGameService';
import { fetchProfilesByIds } from '../../services/apiService';
import {
  fetchProfileClashStats,
  fetchProfileClashes,
  type ProfileClash,
} from '../../services/profileService';
import { errorText } from '../../services/supabaseClient';
import {
  selectViewerTakes,
  setViewer,
  showNotice,
  useClash,
  type User,
} from '../../store';
import { layout, space, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { withClashStats } from '../../utils/profileClashStats';

type VaultProfileTab = 'takes' | 'wins';

const VAULT_TABS: readonly SegmentedTab<VaultProfileTab>[] = [
  { key: 'takes', label: 'Takes' },
  { key: 'wins', label: 'Wins' },
];

/**
 * Vault PROFILE — same viewer identity, continuous editorial page.
 * Wins are settled Clash outcomes (`outcome === 'won'`) from profile_clash_list.
 */
export default function VaultProfileScreen(): React.JSX.Element {
  const { state, dispatch } = useClash();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<VaultProfileTab>('takes');
  const router = useRouter();
  const t = useThemeColors();
  const viewer = state.viewer;
  const takes = React.useMemo(() => selectViewerTakes(state), [state]);

  const [wins, setWins] = React.useState<ProfileClash[] | null>(null);
  const [opponents, setOpponents] = React.useState<Map<string, User>>(new Map());
  const [winsError, setWinsError] = React.useState(false);
  const [arenaRep, setArenaRep] = React.useState<ArenaReputation | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (viewer.id === 'guest') return;
      try {
        if (viewer.wins === null || viewer.clashes === null) {
          const stats = await fetchProfileClashStats(viewer.id);
          if (!cancelled) dispatch(setViewer(withClashStats(viewer, stats)));
        }
      } catch {
        // Keep null counts — do not invent zeros.
      }
      try {
        const rep = await fetchMyArenaReputation();
        if (!cancelled) setArenaRep(rep);
      } catch {
        if (!cancelled) setArenaRep(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer, dispatch]);

  React.useEffect(() => {
    if (tab !== 'wins' || wins !== null || winsError) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchProfileClashes(viewer.id);
        if (cancelled) return;
        const won = rows.filter((row) => row.outcome === 'won');
        setWins(won);
        const ids = [
          ...new Set(won.map((row) => row.opponentId).filter((id): id is string => id !== null)),
        ];
        if (ids.length > 0) {
          const users = await fetchProfilesByIds(ids);
          if (!cancelled) setOpponents(new Map(users.map((user) => [user.id, user])));
        }
      } catch (error) {
        if (cancelled) return;
        setWinsError(true);
        dispatch(showNotice(errorText(error)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, wins, winsError, viewer.id, dispatch]);

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

        <ReputationBar
          reputation={viewer.reputation}
          rank={viewer.rank}
          streak={viewer.streak}
          facets={arenaRep?.facets}
          standing={arenaRep?.standing}
        />

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
          : wins === null && !winsError
            ? (
                <ActivityIndicator color={t.textPrimary} />
              )
            : (wins ?? []).map((clash) => (
                <ProfileClashRow
                  key={clash.clash.id}
                  clash={clash}
                  opponent={clash.opponentId ? opponents.get(clash.opponentId) : undefined}
                  onOpen={() => router.push(`/clash/${clash.clash.takeId}`)}
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
        {tab === 'wins' && winsError ? (
          <EmptyState
            icon={TrophyIcon}
            title="Couldn't load wins"
            body="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => {
              setWinsError(false);
              setWins(null);
            }}
          />
        ) : null}
        {tab === 'wins' && wins !== null && wins.length === 0 ? (
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
