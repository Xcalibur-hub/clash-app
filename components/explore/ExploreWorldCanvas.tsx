/**
 * Explore World canvas — renders exactly one visual.
 *
 * GLOBE (E2.9): automatic navigation only. Rotation is derived from the current
 * country selection; the surface has no pan, no swipe, no momentum and no
 * per-country tap targets.
 * MAP: the explicit tap-to-find surface, unchanged.
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { countryByCode } from '../../data/exploreCountries';
import { useGlobeRotation } from '../../hooks/useGlobeRotation';
import type { ExploreCountrySummary } from '../../services/exploreService';
import { useThemeColors } from '../../theme';
import { globeHintLabel } from '../../utils/exploreGlobeRotation';
import type { WorldVisualMode } from '../../utils/exploreWorldPerf';
import { GlobeSurface } from './GlobeSurface';
import { WorldMapSurface } from './WorldMapSurface';
import { worldCanvasStyles } from './worldCanvasStyles';

export type { WorldVisualMode };

export interface ExploreWorldCanvasProps {
  activity: readonly ExploreCountrySummary[];
  selectedCode?: string | null;
  visualMode: WorldVisualMode;
  /** Map tap-to-find only; the globe never reports a country. */
  onSelectCountry: (code: string) => void;
  /** A discovery request is in flight — hold the globe steady. */
  busy?: boolean;
}

export function ExploreWorldCanvas({
  activity,
  selectedCode = null,
  visualMode,
  onSelectCountry,
  busy = false,
}: ExploreWorldCanvasProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const isGlobe = visualMode === 'globe';
  const selected = countryByCode(selectedCode);

  const { rotation } = useGlobeRotation({
    isGlobe,
    targetLng: selected?.lng ?? null,
    busy,
    reduced,
  });

  const activityCodes = React.useMemo(() => {
    const set = new Set<string>();
    for (const row of activity) set.add(row.countryCode);
    return set;
  }, [activity]);

  const mapW = Math.min(screenW - 32, 420);
  const mapH = mapW * 0.52;
  const globeSize = Math.min(300, Math.max(240, screenW - 56));

  return (
    <View style={worldCanvasStyles.wrap}>
      {isGlobe ? (
        <GlobeSurface
          size={globeSize}
          rotation={rotation}
          activityCodes={activityCodes}
          selectedCode={selectedCode}
          selectedName={selected?.name ?? null}
        />
      ) : (
        <WorldMapSurface
          width={mapW}
          height={mapH}
          activityCodes={activityCodes}
          selectedCode={selectedCode}
          onSelectCountry={onSelectCountry}
        />
      )}
      <Text allowFontScaling={false} style={[worldCanvasStyles.hint, { color: t.textMuted }]}>
        {globeHintLabel({ isGlobe, busy })}
      </Text>
    </View>
  );
}
