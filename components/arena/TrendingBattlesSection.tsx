/**
 * Arena Home — TRENDING BATTLES discovery module.
 * Server snapshots only. Hides cleanly when unavailable.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import {
  fetchTrendingBattles,
  type ArenaTrendingBattle,
} from '../../services/arenaTrendService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { momentumGlyph, momentumLabel } from '../../utils/arenaTrendScore';
import { tap as hapticTap } from '../../utils/haptics';
import { VaultActionButton } from '../vault/VaultActionButton';
import { TrendingBattlesChart } from './TrendingBattlesChart';
import { softFill } from '../liveArena/liveArenaStyles';

export interface TrendingBattlesSectionProps {
  onEnter: (battle: ArenaTrendingBattle) => void;
  /** Bump to refetch (pull-to-refresh). */
  refreshToken?: number;
}

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

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchTrendingBattles(10);
        if (cancelled) return;
        setBattles(next);
        setFailed(false);
        setSelectedId((prev) => {
          if (prev && next.some((b) => b.topicId === prev)) return prev;
          return next[0]?.topicId ?? null;
        });
      } catch {
        if (!cancelled) {
          setBattles([]);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (failed || battles.length === 0) return null;

  const selected = battles.find((b) => b.topicId === selectedId) ?? battles[0];

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(240)}
      style={[styles.wrap, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        TRENDING BATTLES
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        What the internet is fighting about today
      </Text>

      <TrendingBattlesChart
        battles={battles}
        selectedId={selected.topicId}
        scrubIndex={scrubIndex}
        onScrubIndex={setScrubIndex}
      />

      <View style={styles.list}>
        {battles.map((battle) => {
          const active = battle.topicId === selected.topicId;
          return (
            <Pressable
              key={battle.topicId}
              onPress={() => {
                hapticTap();
                setSelectedId(battle.topicId);
                setScrubIndex(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Rank ${battle.rank}. ${battle.title}. ${momentumLabel(battle.momentum)}`}
              style={[
                styles.row,
                {
                  backgroundColor: active ? softFill(t) : 'transparent',
                  borderColor: active ? t.borderStrong : 'transparent',
                },
              ]}
            >
              <Text allowFontScaling={false} style={[styles.rank, { color: t.textMuted }]}>
                {battle.rank}
              </Text>
              <View style={styles.rowCopy}>
                <Text
                  allowFontScaling={false}
                  style={[styles.rowTitle, { color: t.textPrimary }]}
                  numberOfLines={2}
                >
                  {battle.title}
                </Text>
                <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
                  {battle.hood ? `${battle.hood} · ` : ''}
                  {battle.participantCount} here
                  {battle.activeRoomCount > 0 ? ` · ${battle.activeRoomCount} rooms` : ''}
                </Text>
              </View>
              <Text
                allowFontScaling={false}
                style={[styles.momentum, { color: t.textSecondary }]}
                accessibilityLabel={momentumLabel(battle.momentum)}
              >
                {momentumGlyph(battle.momentum)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <VaultActionButton
        label="ENTER BATTLE"
        onPress={() => {
          hapticTap();
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
  list: { gap: 4, marginTop: space.xs },
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
  rowCopy: { flex: 1, gap: 1 },
  rowTitle: { ...typeScale.label, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  rowMeta: { ...typeScale.caption, fontSize: 11 },
  momentum: { ...typeScale.label, fontSize: 16, fontWeight: '700', width: 20, textAlign: 'center' },
});
