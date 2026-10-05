/**
 * Live Top-10 ranking race chart.
 * Y = rank (#1 at top). Lines cross when topics overtake each other.
 * Real snapshot ranks only — no decorative paths.
 *
 * IMPORTANT (native): never put React.Fragment inside <Svg>.
 * react-native-svg silently drops Fragment children on Android/iOS —
 * wrap sibling SVG nodes in <G> instead (see CityDonut / ExploreGlobe).
 */
import React from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { ArenaTrendingBattle } from '../../services/arenaTrendService';
import {
  buildRankPath,
  TREND_RACE_CHART_HEIGHT,
  TREND_RACE_PAD,
  trendRaceRankY,
  trendRaceXFor,
} from '../../utils/arenaTrendChartPath';
import {
  shortTitle,
  trendRaceCaption,
  trendRaceStage,
  type TrendRaceStage,
} from '../../utils/arenaTrendRank';
import { space, typeScale, useThemeColors } from '../../theme';

export interface TrendingBattlesChartProps {
  battles: readonly ArenaTrendingBattle[];
  selectedId: string | null;
  scrubIndex?: number | null;
  onScrubIndex?: (index: number | null) => void;
  onSelectTopic?: (topicId: string) => void;
}

export { TREND_RACE_CHART_HEIGHT, buildRankPath };

const H = TREND_RACE_CHART_HEIGHT;
const PAD = TREND_RACE_PAD;
const LABEL_GAP = 15;
const Y_TICKS = [1, 2, 3, 5, 7, 10] as const;

function spreadLabelYs(items: readonly { id: string; y: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const ys = sorted.map((item) => item.y);
  for (let i = 1; i < ys.length; i += 1) {
    if (ys[i] - ys[i - 1] < LABEL_GAP) ys[i] = ys[i - 1] + LABEL_GAP;
  }
  const maxY = H - PAD.bottom + 4;
  for (let i = ys.length - 2; i >= 0; i -= 1) {
    if (ys[i + 1] > maxY) ys[i + 1] = maxY;
    if (ys[i + 1] - ys[i] < LABEL_GAP) ys[i] = ys[i + 1] - LABEL_GAP;
  }
  if (ys[0] < PAD.top) {
    const shift = PAD.top - ys[0];
    for (let i = 0; i < ys.length; i += 1) ys[i] += shift;
  }
  const out = new Map<string, number>();
  sorted.forEach((item, i) => out.set(item.id, ys[i]));
  return out;
}

export function TrendingBattlesChart({
  battles,
  selectedId,
  scrubIndex = null,
  onScrubIndex,
  onSelectTopic,
}: TrendingBattlesChartProps): React.JSX.Element | null {
  const t = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  // Seed with a real phone width so the first paint already has non-zero SVG geometry.
  const [width, setWidth] = React.useState(() => Math.max(280, windowWidth - 48));

  const stage: TrendRaceStage = trendRaceStage({
    topicCount: battles.length,
    pointCounts: battles.map((b) => b.series.length),
  });
  const hasLines = stage === 'FIRST_LINES' || stage === 'RACE';
  const caption = trendRaceCaption(stage);

  const allTimes = React.useMemo(() => {
    const ts: number[] = [];
    for (const b of battles) {
      for (const p of b.series) ts.push(p.t);
    }
    return ts;
  }, [battles]);

  const bucketTimes = React.useMemo(
    () => [...new Set(allTimes)].sort((a, b) => a - b),
    [allTimes],
  );
  const minT = bucketTimes.length ? bucketTimes[0]! : 0;
  const maxT = bucketTimes.length ? bucketTimes[bucketTimes.length - 1]! : 1;
  const xFor = React.useMemo(
    () => trendRaceXFor(width, minT, maxT, bucketTimes.length),
    [bucketTimes.length, maxT, minT, width],
  );

  const pathsById = React.useMemo(() => {
    const map = new Map<string, string>();
    if (!hasLines) return map;
    for (const battle of battles) {
      if (battle.series.length < 2) continue;
      const d = buildRankPath(battle.series, xFor, H);
      if (d) map.set(battle.topicId, d);
    }
    return map;
  }, [battles, hasLines, xFor]);

  const labelYs = React.useMemo(() => {
    const seeds: { id: string; y: number }[] = [];
    for (const battle of battles) {
      const selected = battle.topicId === selectedId;
      const top3 = battle.rank <= 3;
      if (!selected && !top3) continue;
      const last = battle.series[battle.series.length - 1];
      const markerRank = last ? last.v : battle.rank;
      seeds.push({ id: battle.topicId, y: trendRaceRankY(markerRank, H) });
    }
    return spreadLabelYs(seeds);
  }, [battles, selectedId]);

  const scrubBucketT = React.useMemo(() => {
    if (!hasLines || bucketTimes.length === 0) return null;
    if (scrubIndex == null) return bucketTimes[bucketTimes.length - 1] ?? null;
    return bucketTimes[Math.min(bucketTimes.length - 1, Math.max(0, scrubIndex))] ?? null;
  }, [bucketTimes, hasLines, scrubIndex]);

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
    if (!onScrubIndex || bucketTimes.length < 2) return;
    const innerW = Math.max(1, width - PAD.left - PAD.right);
    const spanT = Math.max(1, maxT - minT);
    const tAt = minT + ((x - PAD.left) / innerW) * spanT;
    let best = 0;
    let bestDist = Infinity;
    bucketTimes.forEach((pt, i) => {
      const d = Math.abs(pt - tAt);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    onScrubIndex(best);
  };

  if (stage === 'EMPTY') return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.meta}>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          {caption ? caption.kicker : 'RANK'}
        </Text>
        {scrubBucketT != null ? (
          <Text allowFontScaling={false} style={[styles.value, { color: t.textPrimary }]}>
            {formatClock(scrubBucketT)}
          </Text>
        ) : null}
      </View>

      {caption ? (
        <Text
          allowFontScaling={false}
          style={[styles.earlyNote, { color: t.textMuted }]}
          accessibilityLiveRegion="polite"
        >
          {caption.note}
        </Text>
      ) : null}

      <View
        style={[styles.chartFrame, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        accessibilityLabel="Live topic ranking race chart"
      >
        <Svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          style={{ width, height: H }}
        >
          {Y_TICKS.map((rank) => (
            <G key={`tick-${rank}`}>
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={trendRaceRankY(rank, H)}
                y2={trendRaceRankY(rank, H)}
                stroke={t.borderStrong}
                strokeWidth={1}
                strokeOpacity={rank <= 3 ? 0.85 : 0.45}
              />
              <SvgText
                x={6}
                y={trendRaceRankY(rank, H) + 3}
                fill={rank <= 3 ? t.textSecondary : t.textMuted}
                fontSize={rank <= 3 ? 11 : 9}
                fontWeight="700"
              >
                {`#${rank}`}
              </SvgText>
            </G>
          ))}

          {battles.map((battle) => {
            const selected = battle.topicId === selectedId;
            const top3 = battle.rank <= 3;
            const pathD = pathsById.get(battle.topicId) ?? '';
            const canDrawLine = pathD.length > 0;
            const opacity = selected ? 1 : top3 ? 0.85 : 0.35;
            const strokeW = selected ? 3 : top3 ? 2.25 : 1.25;
            const last = battle.series[battle.series.length - 1];
            const markerRank = last ? last.v : battle.rank;
            const endX = last ? xFor(last.t) : width - PAD.right;
            const endY = trendRaceRankY(markerRank, H);
            const labelY = labelYs.get(battle.topicId) ?? endY;
            const showLabel = selected || top3;
            const stroke = selected || top3 ? t.textPrimary : t.textMuted;

            return (
              <G key={battle.topicId}>
                {canDrawLine ? (
                  <Path
                    d={pathD}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    strokeOpacity={opacity}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onPress={() => onSelectTopic?.(battle.topicId)}
                  />
                ) : (
                  <Circle
                    cx={endX}
                    cy={endY}
                    r={selected ? 4.5 : top3 ? 3.4 : 2.4}
                    fill={t.surfaceElevated}
                    stroke={stroke}
                    strokeWidth={selected ? 2 : 1.2}
                    opacity={opacity}
                    onPress={() => onSelectTopic?.(battle.topicId)}
                  />
                )}

                {showLabel ? (
                  <G>
                    {canDrawLine ? (
                      <Circle
                        cx={endX}
                        cy={endY}
                        r={selected ? 5 : 3.6}
                        fill={t.surfaceElevated}
                        stroke={t.textPrimary}
                        strokeWidth={selected ? 2.2 : 1.6}
                        opacity={1}
                        onPress={() => onSelectTopic?.(battle.topicId)}
                      />
                    ) : null}
                    <SvgText
                      x={endX + 8}
                      y={labelY + 3}
                      fill={selected ? t.textPrimary : t.textSecondary}
                      fontSize={selected ? 11 : 10}
                      fontWeight="700"
                      onPress={() => onSelectTopic?.(battle.topicId)}
                    >
                      {shortTitle(battle.title, selected ? 16 : 13)}
                    </SvgText>
                  </G>
                ) : null}
              </G>
            );
          })}

          {scrubBucketT != null && scrubIndex != null ? (
            <Line
              x1={xFor(scrubBucketT)}
              x2={xFor(scrubBucketT)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke={t.borderStrong}
              strokeWidth={1}
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

      <View style={[styles.timeRow, { paddingLeft: PAD.left, paddingRight: PAD.right }]}>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          EARLIER
        </Text>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          NOW
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
  wrap: { gap: 8, width: '100%' },
  meta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  axis: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  value: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
  earlyNote: { ...typeScale.meta, fontSize: 11, paddingHorizontal: 2, marginTop: -2 },
  chartFrame: {
    width: '100%',
    height: H,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -space.xs,
  },
  scrubBoard: { gap: 2, paddingHorizontal: 2, paddingTop: 2 },
  scrubRow: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
