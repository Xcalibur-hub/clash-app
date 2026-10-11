import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
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
import {
  filterSettledWins,
  isCurrentRequest,
  ownedStateIsStale,
} from '../../utils/profileStatsLifecycle';

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
  const viewerRef = React.useRef(viewer);
  viewerRef.current = viewer;
  const takes = React.useMemo(() => selectViewerTakes(state), [state]);

  const [wins, setWins] = React.useState<ProfileClash[] | null>(null);
  const [winsForId, setWinsForId] = React.useState<string | null>(null);
  const [opponents, setOpponents] = React.useState<Map<string, User>>(new Map());
  const [winsError, setWinsError] = React.useState(false);
  /** undefined = not loaded for this account; null = failed/unavailable. */
  const [arenaRep, setArenaRep] = React.useState<ArenaReputation | null | undefined>(undefined);
  const [repForId, setRepForId] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);

  // Drop previous-account Wins / facets immediately on switch or sign-out.
  React.useEffect(() => {
    requestRef.current += 1;
    setWins(viewer.id === 'guest' ? [] : null);
    setWinsForId(viewer.id === 'guest' ? 'guest' : null);
    setWinsError(false);
    setOpponents(new Map());
    setArenaRep(undefined);
    setRepForId(null);
  }, [viewer.id]);

  const loadWins = React.useCallback(
    async (requestId: number, profileId: string): Promise<void> => {
      try {
        const rows = await fetchProfileClashes(profileId);
        if (!isCurrentRequest(true, requestId, requestRef.current)) return;
        if (viewerRef.current.id !== profileId) return;
        setWins(filterSettledWins(rows));
        setWinsForId(profileId);
        setWinsError(false);
        const ids = [
          ...new Set(
            filterSettledWins(rows)
              .map((row) => row.opponentId)
              .filter((id): id is string => id !== null),
          ),
        ];
        if (ids.length === 0) {
          setOpponents(new Map());
          return;
        }
        const users = await fetchProfilesByIds(ids);
        if (!isCurrentRequest(true, requestId, requestRef.current)) return;
        if (viewerRef.current.id !== profileId) return;
        setOpponents(new Map(users.map((user) => [user.id, user])));
      } catch (error) {
        if (!isCurrentRequest(true, requestId, requestRef.current)) return;
        if (viewerRef.current.id !== profileId) return;
        setWinsError(true);
        setWins(null);
        setWinsForId(null);
        dispatch(showNotice(errorText(error)));
      }
    },
    [dispatch],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (viewer.id === 'guest') return undefined;
      let active = true;
      const requestId = ++requestRef.current;
      const profileId = viewer.id;

      void (async () => {
        try {
          const stats = await fetchProfileClashStats(profileId);
          if (!active || !isCurrentRequest(true, requestId, requestRef.current)) return;
          if (viewerRef.current.id !== profileId) return;
          dispatch(setViewer(withClashStats(viewerRef.current, stats)));
        } catch {
          // Keep null counts — do not invent zeros.
        }

        try {
          const rep = await fetchMyArenaReputation();
          if (!active || !isCurrentRequest(true, requestId, requestRef.current)) return;
          if (viewerRef.current.id !== profileId) return;
          setArenaRep(rep);
          setRepForId(profileId);
        } catch {
          if (!active || !isCurrentRequest(true, requestId, requestRef.current)) return;
          if (viewerRef.current.id !== profileId) return;
          setArenaRep(null);
          setRepForId(profileId);
        }

        if (tab === 'wins') {
          await loadWins(requestId, profileId);
        }
      })();

      return () => {
        active = false;
      };
    }, [viewer.id, tab, dispatch, loadWins]),
  );

  const winsStale = ownedStateIsStale(winsForId, viewer.id);
  const visibleWins = winsStale ? null : wins;
  const repStale = ownedStateIsStale(repForId, viewer.id);
  const visibleRep = repStale ? undefined : arenaRep;

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
          facets={visibleRep?.facets}
          standing={visibleRep?.standing}
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
          : visibleWins === null && !winsError
            ? (
                <ActivityIndicator color={t.textPrimary} />
              )
            : (visibleWins ?? []).map((clash) => (
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
              setWinsForId(null);
              const requestId = ++requestRef.current;
              void loadWins(requestId, viewer.id);
            }}
          />
        ) : null}
        {tab === 'wins' && visibleWins !== null && visibleWins.length === 0 ? (
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
