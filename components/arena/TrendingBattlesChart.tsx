/**
 * Live Top-10 ranking race chart.
 * Y = rank (#1 at top). Lines cross when topics overtake each other.
 * Real snapshot ranks only — no decorative paths.
 */
import React from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { ArenaTrendPoint, ArenaTrendingBattle } from '../../services/arenaTrendService';
import {
  isEarlyHistory,
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
  xFor: (t: number) => number,
  height: number,
): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.t).toFixed(1)},${rankY(p.v, height).toFixed(1)}`)
    .join(' ');
}

export function TrendingBattlesChart({
  battles,
  selectedId,
  scrubIndex = null,
  onScrubIndex,
  onSelectTopic,
}: TrendingBattlesChartProps): React.JSX.Element | null {
  const t = useThemeColors();
  const [width, setWidth] = React.useState(320);

  const stage: TrendRaceStage = trendRaceStage({
    topicCount: battles.length,
    pointCounts: battles.map((b) => b.series.length),
  });
  // A line needs two real points. One snapshot is a marker, not a history.
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
  const minT = bucketTimes.length ? bucketTimes[0] : 0;
  const maxT = bucketTimes.length ? bucketTimes[bucketTimes.length - 1] : 1;
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const spanT = Math.max(1, maxT - minT);
  // With a single snapshot there is no time axis yet, so the marker sits at
  // "now" — the current ranking — rather than pretending to be a line start.
  const xFor = React.useCallback(
    (value: number): number => {
      if (bucketTimes.length <= 1) return width - PAD.right;
      return PAD.left + ((value - minT) / spanT) * innerW;
    },
    [bucketTimes.length, innerW, minT, spanT, width],
  );

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

  // Nothing to rank at all: the section owns that state, not the chart.
  if (stage === 'EMPTY') return null;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.meta}>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          {caption ? caption.kicker : 'rank'}
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
            const selected = battle.topicId === selectedId;
            const top3 = battle.rank <= 3;
            const opacity = selected ? 1 : top3 ? 0.72 : 0.28;
            const strokeW = selected ? 2.6 : top3 ? 1.8 : 1.1;
            const last = battle.series[battle.series.length - 1];
            // A line needs two real points; the last real point — or the current
            // rank when history has not started — is the endpoint marker.
            const canDrawLine = hasLines && battle.series.length >= 2;
            const markerRank = last ? last.v : battle.rank;
            const endX = last ? xFor(last.t) : width - PAD.right;
            const endY = rankY(markerRank, H);
            const showLabel = selected || top3;
            return (
              <React.Fragment key={battle.topicId}>
                {canDrawLine ? (
                  <Path
                    d={buildRankPath(battle.series, xFor, H)}
                    stroke={selected || top3 ? t.textPrimary : t.textMuted}
                    strokeWidth={strokeW}
                    strokeOpacity={opacity}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onPress={() => onSelectTopic?.(battle.topicId)}
                  />
                ) : null}

                {/* Early history: every ranked topic gets its marker, so the
                    current ranking is visible without a fabricated line. */}
                {!canDrawLine ? (
                  <Circle
                    cx={endX}
                    cy={endY}
                    r={selected ? 4.5 : top3 ? 3.4 : 2.4}
                    fill={t.surfaceElevated}
                    stroke={selected || top3 ? t.textPrimary : t.textMuted}
                    strokeWidth={selected ? 2 : 1.2}
                    opacity={opacity}
                    onPress={() => onSelectTopic?.(battle.topicId)}
                  />
                ) : null}

                {showLabel ? (
                  <>
                    {canDrawLine ? (
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
                    ) : null}
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
  earlyNote: { ...typeScale.meta, fontSize: 11, paddingHorizontal: 2, marginTop: -2 },
  chartHit: { height: H },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: -space.xs,
  },
  scrubBoard: { gap: 2, paddingHorizontal: 2, paddingTop: 2 },
  scrubRow: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
