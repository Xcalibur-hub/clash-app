import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { setThemeMode, useClash, type ThemeMode } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';

const MODES: readonly { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

/** Appearance row (Profile / Settings): System · Light · Dark — persisted locally. */
export function AppearanceRow(): React.JSX.Element {
  const { state, dispatch } = useClash();
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
        APPEARANCE
      </Text>
      <SegmentedTabs<ThemeMode>
        value={state.themeMode}
        items={MODES}
        onChange={(next) => dispatch(setThemeMode(next))}
        label="Appearance"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  label: { ...typeScale.caption },
});
