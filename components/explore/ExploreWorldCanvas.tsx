/**
 * Explore WORLD canvas — MAP (default) or GLOBE (optional).
 * Renders exactly one visualization. Geometry: Natural Earth 110m ISO A2.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { geometryCountryList } from '../../data/loadExploreGeometry';
import { countryByCode } from '../../data/exploreCountries';
import type { ExploreCountrySummary } from '../../services/exploreService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import {
  countryCodeFromMapPoint,
  focusCountryByCentroid,
  globePathForCountry,
  mapPathForCountry,
  rotationToward,
  wrapRotation,
} from '../../utils/exploreGeo';
import {
  type WorldVisualMode,
} from '../../utils/exploreWorldPerf';
import { tap as hapticTap } from '../../utils/haptics';

export type { WorldVisualMode };

export interface ExploreWorldCanvasProps {
  activity: readonly ExploreCountrySummary[];
  selectedCode?: string | null;
  visualMode: WorldVisualMode;
  onSelectCountry: (code: string) => void;
  spinToken?: number;
  spinTargetLng?: number | null;
  spinning?: boolean;
}

/** Quantize rotation so path cache hits during drag. */
function quantizeRotation(deg: number, step = 3): number {
  return Math.round(wrapRotation(deg) / step) * step;
}

export function ExploreWorldCanvas({
  activity,
  selectedCode = null,
  visualMode,
  onSelectCountry,
  spinToken = 0,
  spinTargetLng = null,
  spinning = false,
}: ExploreWorldCanvasProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const countries = React.useMemo(() => geometryCountryList(), []);
  const [rotation, setRotation] = React.useState(20);
  const rotationRef = React.useRef(20);
  const dragOrigin = React.useRef(20);
  const coastRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const pendingRotation = React.useRef<number | null>(null);
  const pathCache = React.useRef(new Map<string, string>());

  const mapW = Math.min(screenW - 32, 420);
  const mapH = mapW * 0.52;
  const globeSize = Math.min(300, Math.max(240, screenW - 56));
  const R = globeSize * 0.42;
  const cx = globeSize / 2;
  const cy = globeSize / 2;
  const light = t.scheme === 'light';
  const isGlobe = visualMode === 'globe';

  React.useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  const clearCoast = React.useCallback(() => {
    if (coastRef.current) {
      clearInterval(coastRef.current);
      coastRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      clearCoast();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [clearCoast],
  );

  // Clear globe path cache when leaving globe mode.
  React.useEffect(() => {
    if (!isGlobe) {
      clearCoast();
      pathCache.current.clear();
    }
  }, [clearCoast, isGlobe]);

  React.useEffect(() => {
    if (!isGlobe || spinToken <= 0) return;
    clearCoast();
    const target = spinTargetLng ?? Math.random() * 360 - 180;
    if (reduced) {
      setRotation(wrapRotation(rotationToward(target)));
      return;
    }
    let frames = 0;
    const start = rotationRef.current;
    const delta = wrapRotation(rotationToward(target) - start) + 360;
    coastRef.current = setInterval(() => {
      frames += 1;
      const p = Math.min(1, frames / 14);
      const eased = 1 - (1 - p) ** 3;
      setRotation(wrapRotation(start + delta * eased));
      if (p >= 1) clearCoast();
    }, 32);
  }, [clearCoast, isGlobe, reduced, spinTargetLng, spinToken]);

  React.useEffect(() => {
    if (!isGlobe || !selectedCode || spinning) return;
    const c = countryByCode(selectedCode);
    if (!c) return;
    setRotation(wrapRotation(rotationToward(c.lng)));
  }, [isGlobe, selectedCode, spinning]);

  const scheduleRotation = React.useCallback((next: number) => {
    pendingRotation.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRotation.current == null) return;
      setRotation(pendingRotation.current);
      pendingRotation.current = null;
    });
  }, []);

  const focus = React.useMemo(() => {
    if (selectedCode) return selectedCode;
    if (!isGlobe) return null;
    return focusCountryByCentroid(rotation, countries);
  }, [countries, isGlobe, rotation, selectedCode]);

  const activitySet = React.useMemo(() => {
    const s = new Set<string>();
    for (const a of activity) s.add(a.countryCode);
    return s;
  }, [activity]);

  const mapPaths = React.useMemo(() => {
    if (isGlobe) return [] as { code: string; d: string }[];
    return countries
      .map((country) => ({
        code: country.code,
        d: mapPathForCountry(country, mapW, mapH),
      }))
      .filter((row) => row.d.length > 0);
  }, [countries, isGlobe, mapH, mapW]);

  const qRot = quantizeRotation(rotation);
  const globePaths = React.useMemo(() => {
    if (!isGlobe) return [] as { code: string; d: string }[];
    const cache = pathCache.current;
    const out: { code: string; d: string }[] = [];
    for (const country of countries) {
      const key = `${country.code}:${qRot}:${Math.round(R)}`;
      let d = cache.get(key);
      if (d === undefined) {
        d = globePathForCountry(country, qRot, R, cx, cy, 2);
        cache.set(key, d);
        if (cache.size > 800) {
          // Bound memory: drop oldest half.
          const keys = [...cache.keys()].slice(0, 400);
          for (const k of keys) cache.delete(k);
        }
      }
      if (d) out.push({ code: country.code, d });
    }
    return out;
  }, [countries, cx, cy, isGlobe, qRot, R]);

  const pan = Gesture.Pan()
    .enabled(isGlobe)
    .runOnJS(true)
    .onBegin(() => {
      clearCoast();
      dragOrigin.current = rotationRef.current;
    })
    .onUpdate((e) => {
      scheduleRotation(wrapRotation(dragOrigin.current - e.translationX * 0.42));
    })
    .onEnd((e) => {
      if (reduced) return;
      clearCoast();
      let velocity = -e.velocityX * 0.014;
      coastRef.current = setInterval(() => {
        velocity *= 0.88;
        setRotation((prev) => wrapRotation(prev + velocity));
        if (Math.abs(velocity) < 0.2) clearCoast();
      }, 32);
    });

  const oceanDeep = light ? '#1B4F72' : '#0B2438';
  const oceanMid = light ? '#2E86AB' : '#123A55';
  const land = light ? '#C9BEA8' : '#5C5346';
  const landActive = light ? '#A89472' : '#7A6A52';
  const landSelected = light ? '#111113' : '#F5F5F5';

  return (
    <View style={styles.wrap} accessibilityLabel={isGlobe ? 'World globe' : 'World map'}>
      {isGlobe ? (
        <GestureDetector gesture={pan}>
          <View style={{ width: globeSize, height: globeSize, alignSelf: 'center' }}>
            <Svg width={globeSize} height={globeSize}>
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
                {globePaths.map((row) => {
                  const selected = row.code === focus;
                  const active = activitySet.has(row.code);
                  return (
                    <Path
                      key={row.code}
                      d={row.d}
                      fill={selected ? landSelected : active ? landActive : land}
                      opacity={selected ? 0.95 : active ? 0.85 : 0.55}
                      stroke={light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'}
                      strokeWidth={0.4}
                      onPress={() => {
                        hapticTap();
                        onSelectCountry(row.code);
                      }}
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
        </GestureDetector>
      ) : (
        <Pressable
          style={[
            styles.mapFrame,
            { width: mapW, height: mapH, backgroundColor: light ? '#F3EFE7' : '#0E1218' },
          ]}
          onPress={(e) => {
            const x = e.nativeEvent.locationX;
            const y = e.nativeEvent.locationY;
            const code = countryCodeFromMapPoint(x, y, countries, mapW, mapH);
            if (code) {
              hapticTap();
              onSelectCountry(code);
            }
          }}
          accessibilityLabel="World map. Tap a country to explore."
        >
          <Svg width={mapW} height={mapH}>
            {mapPaths.map((row) => {
              const selected = row.code === selectedCode;
              const active = activitySet.has(row.code);
              return (
                <Path
                  key={row.code}
                  d={row.d}
                  fill={
                    selected
                      ? light
                        ? '#111113'
                        : '#F5F5F5'
                      : active
                        ? light
                          ? '#2A2A2E'
                          : '#3A3A42'
                        : light
                          ? '#D9D2C6'
                          : '#2A2E36'
                  }
                  stroke={light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}
                  strokeWidth={0.5}
                />
              );
            })}
          </Svg>
        </Pressable>
      )}

      <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
        {spinning ? 'Teleporting…' : isGlobe ? 'Drag to explore' : 'Tap a country'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, alignItems: 'center' },
  mapFrame: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  hint: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
});
