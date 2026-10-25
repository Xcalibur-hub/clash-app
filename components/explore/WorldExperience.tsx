/**
 * World discovery body under the globe: activity rail plus either the selected
 * country panel or the "Surprise me" card. Server data only — no local ranking.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReadStatus } from '../../hooks/useRetryableRead';
import { ReadFeedback } from '../shared/ReadFeedback';
import { countryByCode } from '../../data/exploreCountries';
import type { ExploreChallenge, ExploreTreasure } from '../../services/exploreService';
import { space, typeScale, useThemeColors } from '../../theme';
import {
  worldCountryContent,
  WORLD_ACTIVITY_LIMIT,
  type WorldCountryActivity,
} from '../../utils/exploreWorldModel';
import { worldPanelRailInset } from '../../utils/exploreWorldLayout';
import { WorldActiveRail } from './WorldActiveRail';
import { WorldCountryPanel } from './WorldCountryPanel';
import { WorldSurpriseCard } from './WorldSurpriseCard';

export interface WorldExperienceProps {
  activityStatus: ReadStatus;
  onRetry: () => void;
  countries: readonly WorldCountryActivity[];
  challenges: readonly ExploreChallenge[];
  treasures: readonly ExploreTreasure[];
  selectedCode: string | null;
  onSelectCountry: (code: string) => void;
  onOpenCountry: (code: string) => void;
  onOpenChallenge: (id: string) => void;
  onOpenTreasure: (id: string) => void;
  onSurprise: () => void;
  onClear: () => void;
}

export function WorldExperience({
  activityStatus,
  onRetry,
  countries,
  challenges,
  treasures,
  selectedCode,
  onSelectCountry,
  onOpenCountry,
  onOpenChallenge,
  onOpenTreasure,
  onSurprise,
  onClear,
}: WorldExperienceProps): React.JSX.Element {
  const t = useThemeColors();
  const rail = countries.slice(0, WORLD_ACTIVITY_LIMIT);
  const empty = countries.length === 0 && !selectedCode;
  const selected = selectedCode
    ? countries.find((country) => country.code === selectedCode) ?? null
    : null;
  const name =
    selected?.name ??
    (selectedCode ? countryByCode(selectedCode)?.name : null) ??
    selectedCode ??
    '';
  const activityCount = selected ? selected.activityCount : null;

  return (
    <View style={styles.wrap}>
      <WorldActiveRail
        countries={rail}
        selectedCode={selectedCode}
        onSelect={onSelectCountry}
      />
      <ReadFeedback status={activityStatus} subject="World activity" retry={onRetry} />
      {activityStatus !== 'ready' ? selectedCode ? (
        <View>
          <Pressable onPress={() => onOpenCountry(selectedCode)} accessibilityRole="button" accessibilityLabel={`Explore ${name}`} style={styles.countryAction}>
            <Text style={{ color: t.textPrimary }}>Explore {name}</Text>
          </Pressable>
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`Clear ${name}`} style={styles.countryAction}>
            <Text style={{ color: t.textSecondary }}>Clear {name}</Text>
          </Pressable>
        </View>
      ) : null : empty ? (
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          No public activity to map yet. Pick any country to look around.
        </Text>
      ) : selectedCode ? (
        <View style={styles.panelShell}>
          <WorldCountryPanel
            code={selectedCode}
            name={name}
            activityCount={activityCount}
            content={worldCountryContent(challenges, treasures, selectedCode)}
            onOpenCountry={onOpenCountry}
            onOpenChallenge={onOpenChallenge}
            onOpenTreasure={onOpenTreasure}
            onClear={onClear}
          />
        </View>
      ) : (
        <WorldSurpriseCard onPress={onSurprise} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  empty: { ...typeScale.caption, fontSize: 12, paddingVertical: space.xs },
  countryAction: { minHeight: 44, justifyContent: 'center' },
  /** Reserves the floating modes-rail footprint so dismiss + CTA stay reachable. */
  panelShell: { marginRight: worldPanelRailInset() },
});
