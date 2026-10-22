/**
 * Explore E2.9 — the MAP surface.
 *
 * Deliberately unchanged: the flat map is the explicit "tap a country" surface.
 * The globe beside it is the passive one, so tap-to-find stays reachable without
 * reintroducing an interactive globe.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { geometryCountryList } from '../../data/loadExploreGeometry';
import { radius, useThemeColors } from '../../theme';
import { countryCodeFromMapPoint, mapPathForCountry } from '../../utils/exploreGeo';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldMapSurfaceProps {
  width: number;
  height: number;
  activityCodes: ReadonlySet<string>;
  selectedCode: string | null;
  onSelectCountry: (code: string) => void;
}

export function WorldMapSurface({
  width,
  height,
  activityCodes,
  selectedCode,
  onSelectCountry,
}: WorldMapSurfaceProps): React.JSX.Element {
  const t = useThemeColors();
  const countries = React.useMemo(() => geometryCountryList(), []);
  const light = t.scheme === 'light';

  const paths = React.useMemo(
    () =>
      countries
        .map((country) => ({ code: country.code, d: mapPathForCountry(country, width, height) }))
        .filter((row) => row.d.length > 0),
    [countries, height, width],
  );

  return (
    <Pressable
      style={[
        styles.mapFrame,
        { width, height, backgroundColor: light ? '#F3EFE7' : '#0E1218' },
      ]}
      onPress={(e) => {
        const code = countryCodeFromMapPoint(
          e.nativeEvent.locationX,
          e.nativeEvent.locationY,
          countries,
          width,
          height,
        );
        if (!code) return;
        hapticTap();
        onSelectCountry(code);
      }}
      accessibilityLabel="World map. Tap a country to explore."
    >
      <Svg width={width} height={height}>
        {paths.map((row) => {
          const selected = row.code === selectedCode;
          const active = activityCodes.has(row.code);
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
  );
}

const styles = StyleSheet.create({
  mapFrame: { borderRadius: radius.xxl, overflow: 'hidden', alignSelf: 'center' },
});
