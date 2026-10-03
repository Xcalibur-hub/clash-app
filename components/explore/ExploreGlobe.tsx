/**
 * Pseudo-3D Explore globe — SVG orthographic sphere + country markers.
 * Chosen over Three/Skia: already installed, stable on Expo, mid-range Android friendly.
 */
import React from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Stop } from 'react-native-svg';
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

export interface ExploreGlobeProps {
  size?: number;
  activity: readonly ExploreCountrySummary[];
  selectedCode?: string | null;
  onFocusChange?: (code: string | null) => void;
  onSelectCountry?: (code: string) => void;
  spinToken?: number;
  spinTargetLng?: number | null;
}

export function ExploreGlobe({
  size = 280,
  activity,
  selectedCode = null,
  onFocusChange,
  onSelectCountry,
  spinToken = 0,
  spinTargetLng = null,
}: ExploreGlobeProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [rotation, setRotation] = React.useState(20);
  const dragOrigin = React.useRef(20);
  const radius = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;

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

  React.useEffect(() => {
    if (spinToken <= 0) return;
    const target = spinTargetLng ?? Math.random() * 360 - 180;
    setRotation(wrapRotation(rotationToward(target)));
  }, [spinTargetLng, spinToken]);

  React.useEffect(() => {
    if (!selectedCode) return;
    const country = EXPLORE_COUNTRIES.find((c) => c.code === selectedCode);
    if (!country) return;
    setRotation(wrapRotation(rotationToward(country.lng)));
  }, [selectedCode]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      dragOrigin.current = rotation;
    })
    .onUpdate((e) => {
      const next = wrapRotation(dragOrigin.current - e.translationX * 0.4);
      setRotation(next);
    })
    .onEnd((e) => {
      if (reduced) return;
      const coast = wrapRotation(rotation - e.velocityX * 0.02);
      setRotation(coast);
    });

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

  return (
    <View style={styles.wrap} accessibilityLabel={`Explore globe. Focused on ${focusName}`}>
      <GestureDetector gesture={pan}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="globeShade" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={t.scheme === 'light' ? '#E8E4DC' : '#1F1F24'} />
                <Stop offset="1" stopColor={t.scheme === 'light' ? '#C9C2B4' : '#0C0C10'} />
              </LinearGradient>
            </Defs>
            <Ellipse
              cx={cx}
              cy={cy + radius * 0.92}
              rx={radius * 0.72}
              ry={radius * 0.12}
              fill={t.textPrimary}
              opacity={0.06}
            />
            <Circle cx={cx} cy={cy} r={radius} fill="url(#globeShade)" />
            <Circle
              cx={cx - radius * 0.28}
              cy={cy - radius * 0.3}
              r={radius * 0.9}
              fill="#FFFFFF"
              opacity={t.scheme === 'light' ? 0.14 : 0.05}
            />
            <Circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={t.borderStrong}
              strokeWidth={1}
              fill="transparent"
              opacity={0.5}
            />
            {markers.map((marker) => {
              const active = Boolean(marker.pulse);
              const selected = marker.country.code === focus;
              const r = selected ? 5.5 : active ? 4 : 2.2;
              return (
                <Circle
                  key={marker.country.code}
                  cx={cx + marker.x}
                  cy={cy + marker.y}
                  r={r}
                  fill={selected ? t.textPrimary : active ? t.accent : t.textMuted}
                  opacity={selected ? 1 : active ? 0.85 : 0.35}
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
          Drag to explore
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
        {focus ? (
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
  caption: { alignItems: 'center', gap: 4, minHeight: 120 },
  hint: { ...typeScale.caption, fontSize: 12, fontWeight: '600' },
  focusName: {
    ...typeScale.editorial,
    fontSize: 28,
    lineHeight: 32,
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
