/**
 * Live Top-10 ranking race chart.
 * Y = rank (#1 at top). Lines cross when topics overtake each other.
 * Real snapshot ranks only — no decorative paths.
 */
import React from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { ArenaTrendPoint, ArenaTrendingBattle } from '../../services/arenaTrendService';
import { shortTitle } from '../../utils/arenaTrendRank';
import { space, typeScale, useThemeColors } from '../../theme';

export interface TrendingBattlesChartProps {
  battles: readonly ArenaTrendingBattle[];
  selectedId: string | null;
  scrubIndex?: number | null;
  onScrubIndex?: (index: number | null) => void;
  onSelectTopic?: (topicId: string) => void;
}

const H = 176;
const PAD = { top: 10, right: 108, bottom: 20, left: 28 };
const MAX_RANK = 10;

function rankY(rank: number, height: number): number {
  const innerH = Math.max(1, height - PAD.top - PAD.bottom);
  const clamped = Math.min(MAX_RANK, Math.max(1, rank));
  // #1 at top, #10 at bottom
  return PAD.top + ((clamped - 1) / (MAX_RANK - 1)) * innerH;
}

function buildRankPath(
  points: readonly ArenaTrendPoint[],
  width: number,
  height: number,
  minT: number,
  maxT: number,
): string {
  if (points.length === 0) return '';
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const spanT = Math.max(1, maxT - minT);
  return points
    .map((p, i) => {
      const x = PAD.left + ((p.t - minT) / spanT) * innerW;
      const y = rankY(p.v, height);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function TrendingBattlesChart({
  battles,
  selectedId,
  scrubIndex = null,
  onScrubIndex,
  onSelectTopic,
}: TrendingBattlesChartProps): React.JSX.Element {
  const t = useThemeColors();
  const [width, setWidth] = React.useState(320);

  const raceReady = battles.some((b) => b.historyReady && b.series.length >= 2);

  const allTimes = React.useMemo(() => {
    const ts: number[] = [];
    for (const b of battles) {
      for (const p of b.series) ts.push(p.t);
    }
    return ts;
  }, [battles]);

  const minT = allTimes.length ? Math.min(...allTimes) : 0;
  const maxT = allTimes.length ? Math.max(...allTimes) : 1;

  const scrubBucketT = React.useMemo(() => {
    if (!raceReady || allTimes.length === 0) return null;
    const unique = [...new Set(allTimes)].sort((a, b) => a - b);
    if (scrubIndex == null) return unique[unique.length - 1] ?? null;
    return unique[Math.min(unique.length - 1, Math.max(0, scrubIndex))] ?? null;
  }, [allTimes, raceReady, scrubIndex]);

  const scrubLeaders = React.useMemo(() => {
    if (scrubBucketT == null) return [];
    const at: { rank: number; title: string; topicId: string }[] = [];
    for (const battle of battles) {
      const hit = battle.series.find((p) => p.t === scrubBucketT);
      if (hit) at.push({ rank: hit.v, title: battle.title, topicId: battle.topicId });
    }
    return at.sort((a, b) => a.rank - b.rank).slice(0, 3);
  }, [battles, scrubBucketT]);

  const onLayout = (e: LayoutChangeEvent): void => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const onTouch = (x: number): void => {
    if (!onScrubIndex || allTimes.length === 0) return;
    const unique = [...new Set(allTimes)].sort((a, b) => a - b);
    const innerW = Math.max(1, width - PAD.left - PAD.right);
    const spanT = Math.max(1, maxT - minT);
    const tAt = minT + ((x - PAD.left) / innerW) * spanT;
    let best = 0;
    let bestDist = Infinity;
    unique.forEach((pt, i) => {
      const d = Math.abs(pt - tAt);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    onScrubIndex(best);
  };

  if (!raceReady) {
    return (
      <View style={[styles.empty, { borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.emptyTitle, { color: t.textPrimary }]}>
          Today's battles are just getting started.
        </Text>
        <Text allowFontScaling={false} style={[styles.emptyBody, { color: t.textMuted }]}>
          The ranking race appears as enough activity accumulates.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.meta}>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          rank
        </Text>
        {scrubBucketT != null ? (
          <Text allowFontScaling={false} style={[styles.value, { color: t.textPrimary }]}>
            {formatClock(scrubBucketT)}
          </Text>
        ) : null}
      </View>

      <View
        style={styles.chartHit}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        accessibilityLabel="Live topic ranking race chart"
      >
        <Svg width={width} height={H}>
          {[1, 4, 7, 10].map((rank) => (
            <Line
              key={rank}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={rankY(rank, H)}
              y2={rankY(rank, H)}
              stroke={t.border}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          ))}
          <SvgText
            x={4}
            y={rankY(1, H) + 3}
            fill={t.textMuted}
            fontSize={9}
            fontWeight="700"
          >
            #1
          </SvgText>
          <SvgText
            x={4}
            y={rankY(10, H) + 3}
            fill={t.textMuted}
            fontSize={9}
            fontWeight="700"
          >
            #10
          </SvgText>

          {battles.map((battle) => {
            const path = buildRankPath(battle.series, width, H, minT, maxT);
            if (!path) return null;
            const selected = battle.topicId === selectedId;
            const top3 = battle.rank <= 3;
            const opacity = selected ? 1 : top3 ? 0.72 : 0.28;
            const strokeW = selected ? 2.6 : top3 ? 1.8 : 1.1;
            const last = battle.series[battle.series.length - 1];
            const endY = last ? rankY(last.v, H) : rankY(battle.rank, H);
            const endX = width - PAD.right;
            return (
              <React.Fragment key={battle.topicId}>
                <Path
                  d={path}
                  stroke={selected || top3 ? t.textPrimary : t.textMuted}
                  strokeWidth={strokeW}
                  strokeOpacity={opacity}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onPress={() => onSelectTopic?.(battle.topicId)}
                />
                {(selected || top3) && last ? (
                  <>
                    <Circle
                      cx={endX}
                      cy={endY}
                      r={selected ? 4.5 : 3.2}
                      fill={t.surfaceElevated}
                      stroke={t.textPrimary}
                      strokeWidth={selected ? 2 : 1.4}
                      opacity={opacity}
                      onPress={() => onSelectTopic?.(battle.topicId)}
                    />
                    <SvgText
                      x={endX + 8}
                      y={endY + 3}
                      fill={selected ? t.textPrimary : t.textSecondary}
                      fontSize={10}
                      fontWeight="700"
                      onPress={() => onSelectTopic?.(battle.topicId)}
                    >
                      {`#${battle.rank} ${shortTitle(battle.title, selected ? 18 : 14)}`}
                    </SvgText>
                  </>
                ) : null}
              </React.Fragment>
            );
          })}

          {scrubBucketT != null && scrubIndex != null ? (
            <Line
              x1={
                PAD.left +
                ((scrubBucketT - minT) / Math.max(1, maxT - minT)) *
                  Math.max(1, width - PAD.left - PAD.right)
              }
              x2={
                PAD.left +
                ((scrubBucketT - minT) / Math.max(1, maxT - minT)) *
                  Math.max(1, width - PAD.left - PAD.right)
              }
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke={t.borderStrong}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          ) : null}
        </Svg>
      </View>

      {scrubIndex != null && scrubLeaders.length > 0 ? (
        <View style={styles.scrubBoard}>
          {scrubLeaders.map((row) => (
            <Text
              key={row.topicId}
              allowFontScaling={false}
              style={[styles.scrubRow, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {`#${row.rank} ${row.title}`}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.timeRow}>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          earlier
        </Text>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          now
        </Text>
      </View>
    </View>
  );
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  meta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  axis: { ...typeScale.caption, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  value: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  chartHit: { height: H },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: -space.xs,
  },
  scrubBoard: { gap: 2, paddingHorizontal: 2, paddingTop: 2 },
  scrubRow: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: space.md,
    gap: 4,
    minHeight: 88,
    justifyContent: 'center',
  },
  emptyTitle: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
  emptyBody: { ...typeScale.meta, fontSize: 12, lineHeight: 17 },
});
