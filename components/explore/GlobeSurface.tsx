/**
 * Explore E2.9 — the GLOBE surface.
 *
 * A read-only orthographic Earth: it paints the current angle and nothing else.
 * There is deliberately no gesture handler and no press handler on any land
 * path — countries are chosen from search, the picker, the activity rail or
 * Surprise me, and the globe then rotates itself to the winner.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { geometryCountryList } from '../../data/loadExploreGeometry';
import { useThemeColors } from '../../theme';
import { globePathForCountry, wrapRotation } from '../../utils/exploreGeo';

export interface GlobeSurfaceProps {
  size: number;
  /** Longitude the front of the globe faces, in degrees. */
  rotation: number;
  /** Country codes that currently report activity. */
  activityCodes: ReadonlySet<string>;
  selectedCode: string | null;
  selectedName: string | null;
}

/** Quantize the angle so the SVG path cache keeps hitting while it animates. */
function quantizeRotation(deg: number, step = 3): number {
  return Math.round(wrapRotation(deg) / step) * step;
}

export function GlobeSurface({
  size,
  rotation,
  activityCodes,
  selectedCode,
  selectedName,
}: GlobeSurfaceProps): React.JSX.Element {
  const t = useThemeColors();
  const countries = React.useMemo(() => geometryCountryList(), []);
  const cache = React.useRef(new Map<string, string>());
  const R = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const light = t.scheme === 'light';
  const qRot = quantizeRotation(rotation);

  const paths = React.useMemo(() => {
    const memo = cache.current;
    const out: { code: string; d: string }[] = [];
    for (const country of countries) {
      const key = `${country.code}:${qRot}:${Math.round(R)}`;
      let d = memo.get(key);
      if (d === undefined) {
        d = globePathForCountry(country, qRot, R, cx, cy, 2);
        memo.set(key, d);
        if (memo.size > 800) {
          for (const stale of [...memo.keys()].slice(0, 400)) memo.delete(stale);
        }
      }
      if (d) out.push({ code: country.code, d });
    }
    return out;
  }, [countries, cx, cy, qRot, R]);

  const oceanDeep = light ? '#1B4F72' : '#0B2438';
  const oceanMid = light ? '#2E86AB' : '#123A55';
  const land = light ? '#C9BEA8' : '#5C5346';
  const landActive = light ? '#A89472' : '#7A6A52';
  const landSelected = light ? '#111113' : '#F5F5F5';

  return (
    <View
      style={{ width: size, height: size, alignSelf: 'center' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        selectedName
          ? `World globe centered on ${selectedName}`
          : 'World globe, rotates to the country you pick'
      }
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="oceanG" cx="38%" cy="32%" rx="70%" ry="70%">
            <Stop offset="0" stopColor={light ? '#5DADE2' : '#1B5678'} />
            <Stop offset="0.55" stopColor={oceanMid} />
            <Stop offset="1" stopColor={oceanDeep} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={cx}
          cy={cy + R * 0.98}
          rx={R * 0.78}
          ry={R * 0.13}
          fill={t.textPrimary}
          opacity={light ? 0.1 : 0.22}
        />
        <Circle cx={cx} cy={cy} r={R} fill="url(#oceanG)" />
        <G>
          {paths.map((row) => {
            const selected = row.code === selectedCode;
            const active = activityCodes.has(row.code);
            return (
              <Path
                key={row.code}
                d={row.d}
                fill={selected ? landSelected : active ? landActive : land}
                opacity={selected ? 0.95 : active ? 0.85 : 0.55}
                stroke={light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'}
                strokeWidth={0.4}
              />
            );
          })}
        </G>
        <Circle
          cx={cx}
          cy={cy}
          r={R}
          stroke={light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.16)'}
          strokeWidth={1.2}
          fill="transparent"
        />
      </Svg>
    </View>
  );
}
