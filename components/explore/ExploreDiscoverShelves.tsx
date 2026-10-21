import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useOperationScope } from '../../hooks/useOperationScope';
import { fetchTrendingBattles, type ArenaTrendingBattle } from '../../services/arenaTrendService';
import {
  fetchExploreVaultPreviews,
  type ExploreLiveFeed,
  type ExploreVaultPreview,
} from '../../services/exploreService';
import { analytics } from '../../services/analytics';
import { space, typeScale, useThemeColors } from '../../theme';
import {
  liveShelfItems,
  shelfIsVisible,
  trendingShelfItems,
  vaultShelfItems,
  type ExploreShelfItem,
} from '../../utils/exploreShelf';
import { tap as hapticTap } from '../../utils/haptics';
import { ExploreShelf } from './ExploreShelf';

export interface ExploreDiscoverShelvesProps {
  live: ExploreLiveFeed | null;
  onSeeAllLive: () => void;
}

/**
 * For You discovery header — Arena rank race, Vault teasers and Live, composed
 * from the engines that already own each surface. Nothing is re-ranked here.
 *
 * Composition gap: `creator_live` has no global discovery RPC (only
 * per-creator `list_creator_live_sessions`), so creator broadcasts stay
 * reachable through their Vault / `/vault/live/[sessionId]` deep link instead
 * of a duplicate query on this rail.
 */
export function ExploreDiscoverShelves({
  live,
  onSeeAllLive,
}: ExploreDiscoverShelvesProps): React.JSX.Element | null {
  const t = useThemeColors();
  const router = useRouter();
  const isCurrent = useOperationScope('ExploreDiscoverShelves');
  const [battles, setBattles] = React.useState<ArenaTrendingBattle[]>([]);
  const [vault, setVault] = React.useState<ExploreVaultPreview[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    // `serverOnly` keeps development trend fixtures out of a discovery surface.
    void Promise.allSettled([fetchTrendingBattles(6, true), fetchExploreVaultPreviews(8)]).then(
      ([trendingResult, vaultResult]) => {
        if (cancelled || !isCurrent()) return;
        if (trendingResult.status === 'fulfilled') setBattles(trendingResult.value);
        if (vaultResult.status === 'fulfilled') setVault(vaultResult.value);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isCurrent]);

  const open = React.useCallback(
    (item: ExploreShelfItem) => {
      analytics.track('explore_content_opened', { realm: 'arena', source: 'explore' });
      router.push(item.href as never);
    },
    [router],
  );

  const liveItems = React.useMemo(() => liveShelfItems(live), [live]);
  const trendingItems = React.useMemo(() => trendingShelfItems(battles), [battles]);
  const vaultItems = React.useMemo(() => vaultShelfItems(vault), [vault]);

  if (!shelfIsVisible(liveItems) && !shelfIsVisible(trendingItems) && !shelfIsVisible(vaultItems)) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <ExploreShelf
        title="Live now"
        items={liveItems}
        onOpen={open}
        accessory={
          <Pressable
            onPress={() => {
              hapticTap();
              onSeeAllLive();
            }}
            accessibilityRole="button"
            accessibilityLabel="See all live activity"
            style={styles.action}
          >
            <Text allowFontScaling={false} style={[styles.actionText, { color: t.textMuted }]}>
              SEE ALL
            </Text>
          </Pressable>
        }
      />
      <ExploreShelf title="Trending in Arena" items={trendingItems} onOpen={open} />
      <ExploreShelf title="Vault picks" items={vaultItems} onOpen={open} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, paddingBottom: space.sm },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  actionText: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
