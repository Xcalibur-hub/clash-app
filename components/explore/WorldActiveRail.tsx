/**
 * "Happening now" — country chips in the server's activity order.
 * The rail never re-ranks; it only trims and labels what the summary returned.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import type { WorldCountryActivity } from '../../utils/exploreWorldModel';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldActiveRailProps {
  countries: readonly WorldCountryActivity[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export function WorldActiveRail({
  countries,
  selectedCode,
  onSelect,
}: WorldActiveRailProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (countries.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
          Happening now
        </Text>
        <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
          Public profiles
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {countries.map((country) => {
          const on = country.code === selectedCode;
          return (
            <Pressable
              key={country.code}
              onPress={() => {
                hapticTap();
                onSelect(country.code);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? t.textPrimary : t.surface,
                  borderColor: on ? t.textPrimary : t.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                country.activityCount == null
                  ? country.name
                  : `${country.name}, ${country.activityCount} public profiles`
              }
            >
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.name, { color: on ? t.background : t.textPrimary }]}
              >
                {country.name}
              </Text>
              {country.activityCount != null ? (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.count,
                    { color: on ? t.background : t.textMuted },
                    on ? styles.countOn : null,
                  ]}
                >
                  {country.activityCount.toLocaleString()}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  rail: { gap: space.xs, paddingRight: space.md },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  count: { ...typeScale.caption, fontSize: 11, fontWeight: '700' },
  countOn: { opacity: 0.62 },
});
