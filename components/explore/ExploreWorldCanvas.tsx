/**
 * Accurate Explore WORLD canvas — MAP (equirectangular) + GLOBE (orthographic).
 * Geometry: Natural Earth 110m ISO A2. Never GPS / Google Maps.
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
import { geometryByCode, geometryCountryList } from '../../data/loadExploreGeometry';
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
import { tap as hapticTap } from '../../utils/haptics';

export type WorldVisualMode = 'globe' | 'map';

export interface ExploreWorldCanvasProps {
  activity: readonly ExploreCountrySummary[];
  selectedCode?: string | null;
  visualMode: WorldVisualMode;
  onVisualModeChange: (mode: WorldVisualMode) => void;
  onSelectCountry: (code: string) => void;
  spinToken?: number;
  spinTargetLng?: number | null;
  spinning?: boolean;
}

export function ExploreWorldCanvas({
  activity,
  selectedCode = null,
  visualMode,
  onVisualModeChange,
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

  const mapW = Math.min(screenW - 32, 420);
  const mapH = mapW * 0.52;
  const globeSize = Math.min(340, Math.max(280, screenW - 40));
  const R = globeSize * 0.42;
  const cx = globeSize / 2;
  const cy = globeSize / 2;
  const light = t.scheme === 'light';

  React.useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  const clearCoast = React.useCallback(() => {
    if (coastRef.current) {
      clearInterval(coastRef.current);
      coastRef.current = null;
    }
  }, []);

  React.useEffect(() => () => clearCoast(), [clearCoast]);

  React.useEffect(() => {
    if (spinToken <= 0) return;
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
      const p = Math.min(1, frames / 18);
      const eased = 1 - (1 - p) ** 3;
      setRotation(wrapRotation(start + delta * eased));
      if (p >= 1) clearCoast();
    }, 16);
  }, [clearCoast, reduced, spinTargetLng, spinToken]);

  React.useEffect(() => {
    if (!selectedCode || spinning) return;
    const c = countryByCode(selectedCode);
    if (!c) return;
    setRotation(wrapRotation(rotationToward(c.lng)));
  }, [selectedCode, spinning]);

  const focus = React.useMemo(
    () => selectedCode ?? focusCountryByCentroid(rotation, countries),
    [countries, rotation, selectedCode],
  );
  const focusName =
    geometryByCode(focus)?.name ?? countryByCode(focus)?.name ?? focus ?? 'Earth';
  const focusMeta = activity.find((a) => a.countryCode === focus) ?? null;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      clearCoast();
      dragOrigin.current = rotation;
    })
    .onUpdate((e) => {
      if (visualMode !== 'globe') return;
      setRotation(wrapRotation(dragOrigin.current - e.translationX * 0.42));
    })
    .onEnd((e) => {
      if (visualMode !== 'globe' || reduced) return;
      clearCoast();
      let velocity = -e.velocityX * 0.018;
      coastRef.current = setInterval(() => {
        velocity *= 0.9;
        setRotation((prev) => wrapRotation(prev + velocity));
        if (Math.abs(velocity) < 0.15) clearCoast();
      }, 16);
    });

  const activitySet = React.useMemo(() => {
    const s = new Set<string>();
    for (const a of activity) s.add(a.countryCode);
    return s;
  }, [activity]);

  const oceanDeep = light ? '#1B4F72' : '#0B2438';
  const oceanMid = light ? '#2E86AB' : '#123A55';
  const land = light ? '#C9BEA8' : '#5C5346';
  const landActive = light ? '#A89472' : '#7A6A52';
  const landSelected = light ? '#111113' : '#F5F5F5';

  return (
    <View style={styles.wrap}>
      <View style={styles.modeRow}>
        {(['globe', 'map'] as const).map((mode) => {
          const on = visualMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => {
                hapticTap();
                onVisualModeChange(mode);
              }}
              style={[
                styles.modeChip,
                {
                  backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                  borderColor: t.borderStrong,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={mode === 'globe' ? 'Globe view' : 'Map view'}
            >
              <Text
                allowFontScaling={false}
                style={[styles.modeChipText, { color: on ? t.background : t.textPrimary }]}
              >
                {mode === 'globe' ? 'Globe' : 'Map'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visualMode === 'globe' ? (
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
                {countries.map((country) => {
                  const d = globePathForCountry(country, rotation, R, cx, cy);
                  if (!d) return null;
                  const selected = country.code === focus;
                  const active = activitySet.has(country.code);
                  return (
                    <Path
                      key={country.code}
                      d={d}
                      fill={selected ? landSelected : active ? landActive : land}
                      opacity={selected ? 0.95 : active ? 0.85 : 0.55}
                      stroke={light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'}
                      strokeWidth={0.4}
                      onPress={() => {
                        hapticTap();
                        onSelectCountry(country.code);
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
          style={[styles.mapFrame, { width: mapW, height: mapH, backgroundColor: light ? '#F3EFE7' : '#0E1218' }]}
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
            {countries.map((country) => {
              const d = mapPathForCountry(country, mapW, mapH);
              if (!d) return null;
              const selected = country.code === focus;
              const active = activitySet.has(country.code);
              return (
                <Path
                  key={country.code}
                  d={d}
                  fill={selected ? (light ? '#111113' : '#F5F5F5') : active ? (light ? '#2A2A2E' : '#3A3A42') : light ? '#D9D2C6' : '#2A2E36'}
                  stroke={light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}
                  strokeWidth={0.5}
                />
              );
            })}
          </Svg>
        </Pressable>
      )}

      <View style={styles.caption}>
        <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
          {spinning ? 'Teleporting…' : visualMode === 'globe' ? 'Drag to explore' : 'Tap a country'}
        </Text>
        <Text allowFontScaling={false} style={[styles.focusName, { color: t.textPrimary }]}>
          {focusName}
        </Text>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]}>
          {focusMeta?.activityCount != null
            ? `${focusMeta.activityCount.toLocaleString()} exploring`
            : 'Quiet right now'}
        </Text>
        {focus ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onSelectCountry(focus);
            }}
            style={[styles.cta, { backgroundColor: t.textPrimary }]}
            accessibilityRole="button"
            accessibilityLabel={`Explore ${focusName}`}
          >
            <Text allowFontScaling={false} style={[styles.ctaText, { color: t.background }]}>
              Explore {focusName}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, alignItems: 'center' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipText: { ...typeScale.label, fontSize: 12, fontWeight: '800' },
  mapFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  caption: { alignItems: 'center', gap: 4, minHeight: 110 },
  hint: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  focusName: {
    ...typeScale.editorial,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    textTransform: 'uppercase',
  },
  meta: { ...typeScale.meta, fontSize: 14 },
  cta: {
    marginTop: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
});
