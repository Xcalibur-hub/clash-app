/**
 * Scrollable head of the country list: Recent + Happening now, then the
 * "All countries" label. Lives inside the list so it scrolls with the results
 * and cannot push the last row out of the sheet (Explore E2.8 D4).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ExploreCountry } from '../../data/exploreCountries';
import { space, typeScale, useThemeColors } from '../../theme';
import type { WorldCountryActivity } from '../../utils/exploreWorldModel';
import { CountryPickerRow } from './CountryPickerRow';

export interface CountryPickerListHeaderProps {
  recent: readonly ExploreCountry[];
  activeList: readonly WorldCountryActivity[];
  onSelect: (code: string) => void;
}

function SectionHead({ label, hint }: { label: string; hint: string | null }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.sectionHead}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        {label}
      </Text>
      {hint ? (
        <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function CountryPickerListHeader({
  recent,
  activeList,
  onSelect,
}: CountryPickerListHeaderProps): React.JSX.Element {
  return (
    <View style={styles.headerBlock}>
      {recent.length > 0 ? (
        <View>
          <SectionHead label="Recent" hint={null} />
          {recent.map((country) => (
            <CountryPickerRow
              key={`r-${country.code}`}
              name={country.name}
              meta={null}
              onPress={() => onSelect(country.code)}
              accessibilityLabel={country.name}
            />
          ))}
        </View>
      ) : null}
      {activeList.length > 0 ? (
        <View>
          <SectionHead label="Happening now" hint="Public profiles" />
          {activeList.map((country) => (
            <CountryPickerRow
              key={`a-${country.code}`}
              name={country.name}
              meta={
                country.activityCount == null ? null : country.activityCount.toLocaleString()
              }
              onPress={() => onSelect(country.code)}
              accessibilityLabel={
                country.activityCount == null
                  ? `${country.name}, quiet right now`
                  : `${country.name}, ${country.activityCount.toLocaleString()} public profiles`
              }
            />
          ))}
        </View>
      ) : null}
      <SectionHead label="All countries" hint={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { gap: space.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  section: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
});
