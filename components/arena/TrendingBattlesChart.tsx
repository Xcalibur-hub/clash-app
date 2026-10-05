/**
 * Editorial attention chart — market-chart language without finance semantics.
 * SVG paths only; no continuous animation. Respects reduced motion.
 */
import React from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { ArenaTrendPoint, ArenaTrendingBattle } from '../../services/arenaTrendService';
import { space, typeScale, useThemeColors } from '../../theme';

export interface TrendingBattlesChartProps {
  battles: readonly ArenaTrendingBattle[];
  selectedId: string | null;
  /** Scrub index into the selected series, or null. */
  scrubIndex?: number | null;
  onScrubIndex?: (index: number | null) => void;
}

const H = 148;
const PAD = { top: 12, right: 12, bottom: 22, left: 8 };

function buildPath(
  points: readonly ArenaTrendPoint[],
  width: number,
  height: number,
  minT: number,
  maxT: number,
  maxV: number,
): string {
  if (points.length === 0) return '';
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const innerH = Math.max(1, height - PAD.top - PAD.bottom);
  const spanT = Math.max(1, maxT - minT);
  const spanV = Math.max(1, maxV);

  return points
    .map((p, i) => {
      const x = PAD.left + ((p.t - minT) / spanT) * innerW;
      const y = PAD.top + innerH - (p.v / spanV) * innerH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function TrendingBattlesChart({
  battles,
  selectedId,
  scrubIndex = null,
  onScrubIndex,
}: TrendingBattlesChartProps): React.JSX.Element {
  const t = useThemeColors();
  const [width, setWidth] = React.useState(320);

  const selected = battles.find((b) => b.topicId === selectedId) ?? battles[0] ?? null;
  const comparisons = battles
    .filter((b) => selected && b.topicId !== selected.topicId)
    .slice(0, 2);

  const allPoints = React.useMemo(() => {
    const pts: ArenaTrendPoint[] = [];
    if (selected) pts.push(...selected.series);
    for (const c of comparisons) pts.push(...c.series);
    return pts;
  }, [comparisons, selected]);

  const minT = allPoints.length ? Math.min(...allPoints.map((p) => p.t)) : 0;
  const maxT = allPoints.length ? Math.max(...allPoints.map((p) => p.t)) : 1;
  const maxV = Math.max(1, ...allPoints.map((p) => p.v), selected?.attentionScore ?? 1);

  const selectedPath = selected
    ? buildPath(selected.series, width, H, minT, maxT, maxV)
    : '';

  const scrubPoint =
    selected && scrubIndex != null && selected.series[scrubIndex]
      ? selected.series[scrubIndex]
      : selected?.series.length
        ? selected.series[selected.series.length - 1]
        : null;

  const scrubXY = scrubPoint
    ? (() => {
        const innerW = Math.max(1, width - PAD.left - PAD.right);
        const innerH = Math.max(1, H - PAD.top - PAD.bottom);
        const spanT = Math.max(1, maxT - minT);
        return {
          x: PAD.left + ((scrubPoint.t - minT) / spanT) * innerW,
          y: PAD.top + innerH - (scrubPoint.v / maxV) * innerH,
        };
      })()
    : null;

  const onLayout = (e: LayoutChangeEvent): void => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const onTouch = (x: number): void => {
    if (!selected || !onScrubIndex || selected.series.length === 0) return;
    const innerW = Math.max(1, width - PAD.left - PAD.right);
    const spanT = Math.max(1, maxT - minT);
    const tAt = minT + ((x - PAD.left) / innerW) * spanT;
    let best = 0;
    let bestDist = Infinity;
    selected.series.forEach((p, i) => {
      const d = Math.abs(p.t - tAt);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    onScrubIndex(best);
  };

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.meta}>
        <Text allowFontScaling={false} style={[styles.axis, { color: t.textMuted }]}>
          attention
        </Text>
        {scrubPoint ? (
          <Text allowFontScaling={false} style={[styles.value, { color: t.textPrimary }]}>
            {scrubPoint.v}
            {scrubPoint.t ? ` · ${formatClock(scrubPoint.t)}` : ''}
          </Text>
        ) : null}
      </View>

      <View
        style={styles.chartHit}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderRelease={() => onScrubIndex?.(null)}
        accessibilityLabel={
          selected
            ? `Attention chart for ${selected.title}`
            : 'Attention chart — no battles yet'
        }
      >
        <Svg width={width} height={H}>
          {[0.25, 0.5, 0.75].map((g) => {
            const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - g);
            return (
              <Line
                key={g}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                stroke={t.border}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            );
          })}

          {comparisons.map((battle, i) => {
            const path = buildPath(battle.series, width, H, minT, maxT, maxV);
            if (!path) return null;
            return (
              <Path
                key={battle.topicId}
                d={path}
                stroke={t.textMuted}
                strokeWidth={1.2}
                strokeOpacity={0.35 - i * 0.08}
                fill="none"
              />
            );
          })}

          {selectedPath ? (
            <Path
              d={selectedPath}
              stroke={t.textPrimary}
              strokeWidth={2.2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {scrubXY ? (
            <>
              <Line
                x1={scrubXY.x}
                x2={scrubXY.x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke={t.borderStrong}
                strokeWidth={StyleSheet.hairlineWidth}
              />
              <Circle
                cx={scrubXY.x}
                cy={scrubXY.y}
                r={4.5}
                fill={t.surfaceElevated}
                stroke={t.textPrimary}
                strokeWidth={2}
              />
            </>
          ) : null}
        </Svg>
      </View>

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
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
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
});
