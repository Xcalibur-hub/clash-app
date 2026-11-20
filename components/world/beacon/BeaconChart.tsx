import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useThemeColors } from '../../../theme';
import { CLUES, STOPS, type BeaconState } from './model';

/** An invented diagram, not a geographic map. Stop buttons below provide accessible navigation. */
export function BeaconChart({ state }: { state: BeaconState }): React.JSX.Element {
  const t = useThemeColors(), points = [[64, 142], [152, 94], [242, 56]];
  return <View style={[styles.chart, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
    <Text style={[styles.caption, { color: t.textSecondary }]}>ASTER REACH / FICTIONAL ISLAND</Text>
    <View accessible accessibilityLabel={`Fictional island diagram, not GPS. ${state.stop ? `At ${STOPS.find(p => p.id === state.stop)?.name}.` : 'Island overview.'} Beam toward ${state.beam}, ${state.band} band.`}>
      <Svg width="100%" height={180} viewBox="0 0 320 190" accessible={false} importantForAccessibility="no-hide-descendants">
        <Path d="M30 158 Q12 110 72 62 Q98 10 170 25 Q240 0 285 44 Q323 85 279 143 Q254 185 184 166 Q82 194 30 158 Z" fill={t.surface} stroke={t.border} strokeWidth={2} />
        <Path d="M64 142 Q85 105 152 94 Q191 96 242 56" fill="none" stroke={t.textMuted} strokeWidth={2} strokeDasharray="4 6" />
        <Line x1={242} y1={56} x2={state.beam === 'sea' ? 305 : 181} y2={state.beam === 'sea' ? 14 : 134} stroke={t.textPrimary} strokeWidth={3} />
        <Circle cx={181} cy={134} r={8} stroke={t.textMuted} fill={t.surfaceElevated} />
        {points.map(([cx, cy], i) => {
          const stop = STOPS[i], found = CLUES.some(c => c.stop === stop.id && state.found.includes(c.id));
          return <Circle key={stop.id} cx={cx} cy={cy} r={state.stop === stop.id ? 12 : 8} stroke={t.textPrimary} strokeWidth={2} fill={found || state.stop === stop.id ? t.textPrimary : t.surface} />;
        })}
      </Svg>
    </View>
    <Text style={[styles.caption, { color: t.textSecondary }]}>1 Tide Steps → 2 Lens House → 3 Relay Loft</Text>
    <Text style={[styles.caption, { color: t.textMuted }]}>Explore in any order. No real location or distance.</Text>
  </View>;
}
const styles = StyleSheet.create({
  chart: { padding: 18, borderRadius: 24, borderWidth: 1, gap: 10 },
  caption: { fontSize: 12, lineHeight: 20 },
});
