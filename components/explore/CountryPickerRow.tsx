/**
 * One country row inside the picker sheet (Explore E2.8).
 * Rows keep a 48dp minimum touch target on every screen.
 */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { typeScale, useThemeColors } from '../../theme';
import { EXPLORE_PICKER_ROW_MIN } from '../../utils/explorePickerLayout';

export interface CountryPickerRowProps {
  name: string;
  meta: string | null;
  onPress: () => void;
  accessibilityLabel: string;
}

export function CountryPickerRow({
  name,
  meta,
  onPress,
  accessibilityLabel,
}: CountryPickerRowProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
        {name}
      </Text>
      {meta ? (
        <Text allowFontScaling={false} style={[styles.code, { color: t.textMuted }]}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: EXPLORE_PICKER_ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: { ...typeScale.label, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  code: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
});
