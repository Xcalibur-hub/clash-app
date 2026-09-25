import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Chip } from '../shared/Chip';
import { SIMULATED_LABEL } from '../../data/mockCampaigns';
import type { CityShare } from '../../store/types';
import { attribution as a } from './analyticsStyles';
import { press as hapticPress } from '../../utils/haptics';

export interface AttributionPanelProps {
  unlocked: boolean;
  cities: readonly CityShare[];
  topCity: string;
  onUnlock: () => void;
}

/**
 * Advanced geo attribution (§22): order-weighted city bars behind the mock
 * paywall — quiet, chart-first, no decorative chrome.
 */
export function AttributionPanel({ unlocked, cities, topCity, onUnlock }: AttributionPanelProps): React.JSX.Element {
  if (!unlocked) {
    return (
      <View style={a.locked}>
        <Text allowFontScaling={false} style={a.heading}>Advanced geo attribution</Text>
        <Text allowFontScaling={false} style={a.lockedBody}>
          City-level attribution, regional performance and exportable reports.
        </Text>
        <Pressable
          onPress={() => {
            hapticPress();
            onUnlock();
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock analytics"
          style={a.unlockButton}
        >
          <Text allowFontScaling={false} style={a.unlockText}>Unlock analytics</Text>
        </Pressable>
        <Chip label={SIMULATED_LABEL} tone="neutral" />
      </View>
    );
  }
  return (
    <>
      <Text allowFontScaling={false} style={a.heading}>Advanced geo attribution</Text>
      <View style={a.citySection}>
        {cities.slice(0, 5).map((city) => (
          <View key={city.city} style={a.cityRow}>
            <Text allowFontScaling={false} style={a.cityName}>{city.city}</Text>
            <View style={a.cityBarContainer}>
              <View style={[a.cityBar, { width: `${city.share}%` }]} />
            </View>
            <Text allowFontScaling={false} style={a.cityPercentage}>{city.share}%</Text>
          </View>
        ))}
      </View>
      <Text allowFontScaling={false} style={a.sim}>
        {`${SIMULATED_LABEL} · TOP CITY ${topCity.toUpperCase()}`}
      </Text>
    </>
  );
}