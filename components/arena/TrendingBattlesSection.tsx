/**
 * Arena Home — TRENDING NOW live ranking race.
 * Server snapshots + 45s client refresh while focused. Hides on hard failure.
 */
import React from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
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

/** Trending topics live on the graph — never a duplicate numbered list underneath. */

export interface TrendingBattlesSectionProps {
  onEnter: (battle: ArenaTrendingBattle) => void;
  refreshToken?: number;
  serverOnly?: boolean;
}

const CLIENT_REFRESH_MS = 45_000;

export function TrendingBattlesSection({
  onEnter,
  refreshToken = 0,
  serverOnly = false,
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
  const demo = !serverOnly && trendingDemoActive();
  const request = React.useRef(0);

  const load = React.useCallback(async (): Promise<void> => {
    const generation = ++request.current;
    try {
      const next = await fetchTrendingBattles(10, serverOnly);
      if (generation !== request.current) return;
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
      if (generation !== request.current) return;
      setBattles([]);
      setFailed(true);
    } finally {
      if (generation === request.current) setLoaded(true);
    }
  }, [demo, serverOnly]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      setActive(status === 'active');
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load, refreshToken]);

  React.useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      void load();
    }, CLIENT_REFRESH_MS);
    return () => clearInterval(id);
  }, [active, load]);

  if (failed || !loaded) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>Trending</Text>
        <Text style={[styles.emptyBody, { color: t.textMuted }]}>
          {failed ? "Couldn't load trends. Pull down to retry." : 'Loading trends…'}
        </Text>
      </View>
    );
  }

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

      {/* Selected topic detail — graph labels are the ranking UI; no duplicate Top 10 list. */}
      <View
        style={styles.preview}
        accessibilityLabel={`Selected topic rank ${selected.rank}. ${selected.title}`}
      >
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
            {selected.participantCount > 0 ? ` · ${selected.participantCount} joined` : ''}
          </Text>
        </View>
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
});
