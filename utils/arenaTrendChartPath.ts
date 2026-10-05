/**
 * Pure geometry for the Arena ranking-race SVG.
 * Kept out of the React component so unit tests can verify Path strings
 * without importing react-native / .tsx.
 */

export const TREND_RACE_CHART_HEIGHT = 240;

export const TREND_RACE_PAD = { top: 14, right: 116, bottom: 24, left: 36 } as const;

const MAX_RANK = 10;

export function trendRaceRankY(rank: number, height: number = TREND_RACE_CHART_HEIGHT): number {
  const innerH = Math.max(1, height - TREND_RACE_PAD.top - TREND_RACE_PAD.bottom);
  const clamped = Math.min(MAX_RANK, Math.max(1, rank));
  return TREND_RACE_PAD.top + ((clamped - 1) / (MAX_RANK - 1)) * innerH;
}

export function buildRankPath(
  points: readonly { t: number; v: number }[],
  xFor: (t: number) => number,
  height: number = TREND_RACE_CHART_HEIGHT,
): string {
  if (points.length < 2) return '';
  return points
    .map((p, i) => {
      const x = xFor(p.t);
      const y = trendRaceRankY(p.v, height);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

/** Build an x mapper for a measured chart width and time span. */
export function trendRaceXFor(
  width: number,
  minT: number,
  maxT: number,
  bucketCount: number,
): (t: number) => number {
  const innerW = Math.max(1, width - TREND_RACE_PAD.left - TREND_RACE_PAD.right);
  const spanT = Math.max(1, maxT - minT);
  return (value: number): number => {
    if (bucketCount <= 1) return width - TREND_RACE_PAD.right;
    return TREND_RACE_PAD.left + ((value - minT) / spanT) * innerW;
  };
}
