/**
 * Pseudo-3D Explore globe — SVG orthographic sphere + continent patches + markers.
 * Kept dependency-light for Expo / mid-range Android.
 */
import React from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { EXPLORE_COUNTRIES } from '../../data/exploreCountries';
import type { ExploreCountrySummary } from '../../services/exploreService';
import { space, typeScale, useThemeColors } from '../../theme';
import {
  focusCountryCode,
  projectCountry,
  rotationToward,
  wrapRotation,
} from '../../utils/exploreGlobeMath';
import { tap as hapticTap } from '../../utils/haptics';

/** Coarse land masses for visual Earth identity (not political borders). */
const LANDMASSES: { lat: number; lng: number; rx: number; ry: number; rot?: number }[] = [
  { lat: 45, lng: -100, rx: 0.28, ry: 0.18 }, // N America
  { lat: -12, lng: -58, rx: 0.18, ry: 0.26, rot: -20 }, // S America
  { lat: 50, lng: 15, rx: 0.2, ry: 0.14 }, // Europe
  { lat: 10, lng: 20, rx: 0.22, ry: 0.28 }, // Africa
  { lat: 55, lng: 90, rx: 0.34, ry: 0.18 }, // Asia
  { lat: 22, lng: 78, rx: 0.12, ry: 0.14 }, // India
  { lat: -25, lng: 135, rx: 0.16, ry: 0.14 }, // Australia
  { lat: 35, lng: 138, rx: 0.06, ry: 0.08 }, // Japan
];

export interface ExploreGlobeProps {
  size?: number;
  activity: readonly ExploreCountrySummary[];
  selectedCode?: string | null;
  onFocusChange?: (code: string | null) => void;
  onSelectCountry?: (code: string) => void;
  spinToken?: number;
  spinTargetLng?: number | null;
  spinning?: boolean;
}

export function ExploreGlobe({
  size = 320,
  activity,
  selectedCode = null,
  onFocusChange,
  onSelectCountry,
  spinToken = 0,
  spinTargetLng = null,
  spinning = false,
}: ExploreGlobeProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [rotation, setRotation] = React.useState(20);
  const rotationRef = React.useRef(20);
  const dragOrigin = React.useRef(20);
  const coastRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);
  const radius = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;
  const light = t.scheme === 'light';

  const activityMap = React.useMemo(() => {
    const map = new Map<string, ExploreCountrySummary>();
    for (const row of activity) map.set(row.countryCode, row);
    return map;
  }, [activity]);

  const focus = React.useMemo(
    () => focusCountryCode(rotation, EXPLORE_COUNTRIES),
    [rotation],
  );

  React.useEffect(() => {
    onFocusChange?.(focus);
  }, [focus, onFocusChange]);

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
    const delta = wrapRotation(rotationToward(target) - start) + (spinning ? 720 : 360);
    coastRef.current = setInterval(() => {
      frames += 1;
      const p = Math.min(1, frames / 18);
      const eased = 1 - (1 - p) ** 3;
      setRotation(wrapRotation(start + delta * eased));
      if (p >= 1) clearCoast();
    }, 16);
  }, [clearCoast, reduced, spinTargetLng, spinToken, spinning]);

  React.useEffect(() => {
    if (!selectedCode || spinning) return;
    const country = EXPLORE_COUNTRIES.find((c) => c.code === selectedCode);
    if (!country) return;
    setRotation(wrapRotation(rotationToward(country.lng)));
  }, [selectedCode, spinning]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      clearCoast();
      dragOrigin.current = rotation;
    })
    .onUpdate((e) => {
      setRotation(wrapRotation(dragOrigin.current - e.translationX * 0.42));
    })
    .onEnd((e) => {
      if (reduced) return;
      clearCoast();
      let velocity = -e.velocityX * 0.018;
      coastRef.current = setInterval(() => {
        velocity *= 0.9;
        setRotation((prev) => wrapRotation(prev + velocity));
        if (Math.abs(velocity) < 0.15) clearCoast();
      }, 16);
    });

  const land = React.useMemo(
    () =>
      LANDMASSES.map((mass, i) => {
        const p = projectCountry(mass.lat, mass.lng, rotation, radius);
        return { ...mass, ...p, key: `land-${i}` };
      }).filter((m) => m.visible),
    [radius, rotation],
  );

  const markers = React.useMemo(
    () =>
      EXPLORE_COUNTRIES.map((country) => {
        const p = projectCountry(country.lat, country.lng, rotation, radius);
        return { country, ...p, pulse: activityMap.get(country.code) };
      }).filter((m) => m.visible),
    [activityMap, radius, rotation],
  );

  const focusMeta = focus ? activityMap.get(focus) : null;
  const focusName =
    EXPLORE_COUNTRIES.find((c) => c.code === focus)?.name ?? focus ?? 'Earth';

  const oceanDeep = light ? '#1B4F72' : '#0B2438';
  const oceanMid = light ? '#2E86AB' : '#123A55';
  const oceanLite = light ? '#5DADE2' : '#1B5678';
  const landFill = light ? '#C8B89A' : '#6B5B45';
  const landEdge = light ? '#A89472' : '#4A3F30';

  return (
    <View style={styles.wrap} accessibilityLabel={`Explore globe. Focused on ${focusName}`}>
      <GestureDetector gesture={pan}>
        <View style={[styles.stage, { width: size, height: size }]}>
          <View
            style={[
              styles.halo,
              {
                width: radius * 2.15,
                height: radius * 2.15,
                borderRadius: radius * 1.1,
                backgroundColor: light ? 'rgba(46,134,171,0.12)' : 'rgba(27,86,120,0.22)',
              },
            ]}
          />
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="ocean" cx="38%" cy="32%" rx="70%" ry="70%">
                <Stop offset="0" stopColor={oceanLite} />
                <Stop offset="0.55" stopColor={oceanMid} />
                <Stop offset="1" stopColor={oceanDeep} />
              </RadialGradient>
              <LinearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={light ? 0.28 : 0.14} />
                <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Ellipse
              cx={cx}
              cy={cy + radius * 0.98}
              rx={radius * 0.78}
              ry={radius * 0.13}
              fill={t.textPrimary}
              opacity={light ? 0.1 : 0.22}
            />
            <Circle cx={cx} cy={cy} r={radius} fill="url(#ocean)" />
            <G>
              {land.map((mass) => (
                <Ellipse
                  key={mass.key}
                  cx={cx + mass.x}
                  cy={cy + mass.y}
                  rx={radius * mass.rx * (0.55 + mass.depth * 0.45)}
                  ry={radius * mass.ry * (0.55 + mass.depth * 0.45)}
                  fill={landFill}
                  stroke={landEdge}
                  strokeWidth={0.6}
                  opacity={0.35 + mass.depth * 0.45}
                />
              ))}
            </G>
            <Circle cx={cx} cy={cy} r={radius} fill="url(#gloss)" />
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.16)'}
              strokeWidth={1.2}
              fill="transparent"
            />
            {markers.map((marker) => {
              const active = Boolean(marker.pulse);
              const selected = marker.country.code === focus;
              const r = selected ? 6 : active ? 4.2 : 2.2;
              return (
                <Circle
                  key={marker.country.code}
                  cx={cx + marker.x}
                  cy={cy + marker.y}
                  r={r}
                  fill={selected ? '#FAFAF8' : active ? '#F0C27A' : 'rgba(255,255,255,0.45)'}
                  opacity={selected ? 1 : active ? 0.95 : 0.4}
                  onPress={() => {
                    hapticTap();
                    onSelectCountry?.(marker.country.code);
                    void AccessibilityInfo.announceForAccessibility(marker.country.name);
                  }}
                />
              );
            })}
          </Svg>
        </View>
      </GestureDetector>

      <View style={styles.caption}>
        <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
          {spinning ? 'Teleporting…' : 'Drag to explore'}
        </Text>
        <Text allowFontScaling={false} style={[styles.focusName, { color: t.textPrimary }]}>
          {focusName}
        </Text>
        {focusMeta?.activityCount != null ? (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]}>
            {focusMeta.activityCount.toLocaleString()} exploring
          </Text>
        ) : (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            Quiet right now
          </Text>
        )}
        {focus && !spinning ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onSelectCountry?.(focus);
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
  wrap: { alignItems: 'center', gap: space.md },
  stage: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  caption: { alignItems: 'center', gap: 4, minHeight: 118 },
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
