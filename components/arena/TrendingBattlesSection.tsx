/**
 * Arena Home — TRENDING NOW live ranking race.
 * Server snapshots + 45s client refresh while focused. Hides on hard failure.
 */
import React from 'react';
import { AppState, type AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { analytics } from '../../services/analytics';
import {
  fetchTrendingBattles,
  type ArenaTrendingBattle,
} from '../../services/arenaTrendService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { formatRankDelta } from '../../utils/arenaTrendRank';
import { momentumLabel } from '../../utils/arenaTrendScore';
import { tap as hapticTap } from '../../utils/haptics';
import { VaultActionButton } from '../vault/VaultActionButton';
import { TrendingBattlesChart } from './TrendingBattlesChart';
import { softFill } from '../liveArena/liveArenaStyles';

export interface TrendingBattlesSectionProps {
  onEnter: (battle: ArenaTrendingBattle) => void;
  refreshToken?: number;
}

const CLIENT_REFRESH_MS = 45_000;

export function TrendingBattlesSection({
  onEnter,
  refreshToken = 0,
}: TrendingBattlesSectionProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [battles, setBattles] = React.useState<ArenaTrendingBattle[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [scrubIndex, setScrubIndex] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [active, setActive] = React.useState(AppState.currentState === 'active');
  const viewed = React.useRef(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const next = await fetchTrendingBattles(10);
      setBattles(next);
      setFailed(false);
      setSelectedId((prev) => {
        if (prev && next.some((b) => b.topicId === prev)) return prev;
        return next[0]?.topicId ?? null;
      });
      if (next.length > 0 && !viewed.current) {
        viewed.current = true;
        analytics.track('arena_trending_viewed', { realm: 'arena' });
      }
    } catch {
      setBattles([]);
      setFailed(true);
    }
  }, []);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      setActive(status === 'active');
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, refreshToken]);

  React.useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      void load();
    }, CLIENT_REFRESH_MS);
    return () => clearInterval(id);
  }, [active, load]);

  if (failed) return null;
  if (battles.length === 0) return null;

  const selected = battles.find((b) => b.topicId === selectedId) ?? battles[0];

  const selectTopic = (topicId: string): void => {
    hapticTap();
    setSelectedId(topicId);
    setScrubIndex(null);
    analytics.track('arena_trending_topic_selected', { realm: 'arena' });
  };

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(240)}
      style={[styles.wrap, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        TRENDING NOW
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        What the internet is fighting about
      </Text>

      <TrendingBattlesChart
        battles={battles}
        selectedId={selected.topicId}
        scrubIndex={scrubIndex}
        onScrubIndex={setScrubIndex}
        onSelectTopic={selectTopic}
      />

      <View
        style={[
          styles.preview,
          { backgroundColor: softFill(t), borderColor: t.border },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.previewRank, { color: t.textMuted }]}>
          {`#${selected.rank}`}
        </Text>
        <View style={styles.previewCopy}>
          <Text
            allowFontScaling={false}
            style={[styles.previewTitle, { color: t.textPrimary }]}
            numberOfLines={2}
          >
            {selected.title}
          </Text>
          <Text allowFontScaling={false} style={[styles.previewMeta, { color: t.textMuted }]}>
            {formatRankDelta(selected.rankDeltaKind, selected.rankDelta)}
            {` · ${momentumLabel(selected.momentum)}`}
            {selected.participantCount > 0 ? ` · ${selected.participantCount} here` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {battles.map((battle) => {
          const activeRow = battle.topicId === selected.topicId;
          return (
            <Pressable
              key={battle.topicId}
              onPress={() => selectTopic(battle.topicId)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeRow }}
              accessibilityLabel={`Rank ${battle.rank}. ${battle.title}. ${formatRankDelta(battle.rankDeltaKind, battle.rankDelta)}. ${momentumLabel(battle.momentum)}`}
              style={[
                styles.row,
                {
                  backgroundColor: activeRow ? softFill(t) : 'transparent',
                  borderColor: activeRow ? t.borderStrong : 'transparent',
                },
              ]}
            >
              <Text allowFontScaling={false} style={[styles.rank, { color: t.textMuted }]}>
                {battle.rank}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.rowTitle, { color: t.textPrimary }]}
                numberOfLines={2}
              >
                {battle.title}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.delta, { color: t.textSecondary }]}
              >
                {formatRankDelta(battle.rankDeltaKind, battle.rankDelta)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <VaultActionButton
        label="ENTER BATTLE"
        onPress={() => {
          hapticTap();
          analytics.track('arena_trending_enter_battle', { realm: 'arena' });
          onEnter(selected);
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: layout.screenX,
    marginBottom: space.lg,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    ...typeScale.section,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: space.xs,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewRank: {
    ...typeScale.dataLg,
    fontSize: 18,
    fontWeight: '800',
    width: 36,
    textAlign: 'center',
  },
  previewCopy: { flex: 1, gap: 2 },
  previewTitle: { ...typeScale.label, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  previewMeta: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  list: { gap: 2, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 8,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    ...typeScale.dataLg,
    fontSize: 14,
    fontWeight: '800',
    width: 22,
    textAlign: 'center',
  },
  rowTitle: { ...typeScale.label, fontSize: 14, fontWeight: '700', lineHeight: 18, flex: 1 },
  delta: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'right',
  },
});
