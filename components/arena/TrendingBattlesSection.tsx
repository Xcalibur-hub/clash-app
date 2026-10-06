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
  trendingDemoActive,
  type ArenaTrendingBattle,
} from '../../services/arenaTrendService';
import { layout, radius, space, trendRaceLineAccent, typeScale, useThemeColors } from '../../theme';
import { formatRankDelta, trendRaceStage } from '../../utils/arenaTrendRank';
import { ARENA_TREND_DEMO_LABEL } from '../../utils/arenaTrendDevFixture';
import { momentumLabel } from '../../utils/arenaTrendScore';
import { tap as hapticTap } from '../../utils/haptics';
import { VaultActionButton } from '../vault/VaultActionButton';
import { TrendingBattlesChart } from './TrendingBattlesChart';

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
  const [loaded, setLoaded] = React.useState(false);
  const [active, setActive] = React.useState(AppState.currentState === 'active');
  const viewed = React.useRef(false);
  const demo = trendingDemoActive();

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const next = await fetchTrendingBattles(10);
      setBattles(next);
      setFailed(false);
      setSelectedId((prev) => {
        if (prev && next.some((b) => b.topicId === prev)) return prev;
        return next[0]?.topicId ?? null;
      });
      // Demo data must never appear in analytics as real Arena activity.
      if (next.length > 0 && !viewed.current && !demo) {
        viewed.current = true;
        analytics.track('arena_trending_viewed', { realm: 'arena' });
      }
    } catch {
      setBattles([]);
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [demo]);

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
  if (!loaded) return null;

  if (battles.length === 0) {
    return (
      <Animated.View
        entering={reduced ? undefined : FadeIn.duration(240)}
        style={[styles.wrap, { borderColor: t.border, backgroundColor: t.background }]}
      >
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          WHAT THE INTERNET IS FIGHTING ABOUT
        </Text>
        <Text allowFontScaling={false} style={[styles.emptyTitle, { color: t.textPrimary }]}>
          No live battles right now
        </Text>
        <Text allowFontScaling={false} style={[styles.emptyBody, { color: t.textMuted }]}>
          The ranking race starts the moment an Arena topic opens.
        </Text>
      </Animated.View>
    );
  }

  const selected = battles.find((b) => b.topicId === selectedId) ?? battles[0]!;
  const stage = trendRaceStage({
    topicCount: battles.length,
    pointCounts: battles.map((b) => b.series.length),
  });
  const snapshotCount = battles.reduce((best, b) => Math.max(best, b.series.length), 0);

  const selectTopic = (topicId: string): void => {
    hapticTap();
    setSelectedId(topicId);
    setScrubIndex(null);
    if (!demo) analytics.track('arena_trending_topic_selected', { realm: 'arena' });
  };

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(240)}
      style={[styles.wrap, { borderColor: t.border, backgroundColor: t.background }]}
    >
      <View style={styles.headRow}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          WHAT THE INTERNET IS FIGHTING ABOUT
        </Text>
        {demo ? (
          <Text
            allowFontScaling={false}
            style={[styles.demoBadge, { color: t.textMuted, borderColor: t.border }]}
            accessibilityLabel="Development preview using demo data"
          >
            {ARENA_TREND_DEMO_LABEL}
          </Text>
        ) : null}
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        What the internet is fighting about
      </Text>

      {/* Graph first — hero discovery, not buried under a selected-topic card. */}
      <TrendingBattlesChart
        battles={battles}
        selectedId={selected.topicId}
        scrubIndex={scrubIndex}
        onScrubIndex={setScrubIndex}
        onSelectTopic={selectTopic}
      />

      {__DEV__ && demo ? (
        <Text
          allowFontScaling={false}
          style={[styles.devDiag, { color: t.textMuted }]}
          accessibilityLabel={`Demo diagnostic: ${battles.length} topics, ${snapshotCount} snapshots, ${stage}`}
        >
          {`DEMO: ${battles.length} topics · ${snapshotCount} snapshots · ${stage}`}
        </Text>
      ) : null}

      <View style={styles.preview}>
        <Text
          allowFontScaling={false}
          style={[
            styles.previewRank,
            {
              color:
                trendRaceLineAccent({
                  rank: selected.rank,
                  selected: true,
                  topicId: selected.topicId,
                  scheme: t.scheme,
                })?.ink ?? t.textMuted,
            },
          ]}
        >
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
          const rowAccent = trendRaceLineAccent({
            rank: battle.rank,
            selected: activeRow,
            topicId: battle.topicId,
            scheme: t.scheme,
          });
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
                  backgroundColor: activeRow
                    ? (rowAccent?.soft ?? t.surfaceMuted)
                    : 'transparent',
                  borderColor: activeRow ? (rowAccent?.ink ?? t.border) : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.rowMark,
                  {
                    backgroundColor: activeRow
                      ? (rowAccent?.ink ?? t.textMuted)
                      : battle.rank <= 3
                        ? (rowAccent?.ink ?? t.textMuted)
                        : 'transparent',
                  },
                ]}
              />
              <Text
                allowFontScaling={false}
                style={[
                  styles.rank,
                  {
                    color:
                      battle.rank <= 3 || activeRow
                        ? (rowAccent?.ink ?? t.textMuted)
                        : t.textMuted,
                  },
                ]}
              >
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
                style={[
                  styles.delta,
                  {
                    color:
                      activeRow || battle.rank <= 3
                        ? (rowAccent?.ink ?? t.textSecondary)
                        : t.textSecondary,
                  },
                ]}
              >
                {formatRankDelta(battle.rankDeltaKind, battle.rankDelta)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <VaultActionButton
        label="WATCH CLASH"
        onPress={() => {
          hapticTap();
          if (!demo) analytics.track('arena_trending_enter_battle', { realm: 'arena' });
          onEnter(selected);
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: layout.screenX,
    marginTop: space.sm,
    marginBottom: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    paddingHorizontal: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kicker: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  demoBadge: {
    ...typeScale.caption,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  emptyTitle: { ...typeScale.label, fontSize: 15, fontWeight: '800' },
  emptyBody: { ...typeScale.meta, fontSize: 12, lineHeight: 17 },
  title: {
    ...typeScale.section,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: space.xs,
  },
  devDiag: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingHorizontal: 2,
    marginTop: -2,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: 2,
  },
  previewRank: {
    ...typeScale.dataLg,
    fontSize: 20,
    fontWeight: '800',
    width: 40,
    textAlign: 'center',
  },
  previewCopy: { flex: 1, gap: 2 },
  previewTitle: { ...typeScale.label, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  previewMeta: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  list: { gap: 0, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 9,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowMark: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginVertical: 2,
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
