import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SegmentedTabs } from '../shared/SegmentedTabs';
import { setThemeMode, useClash, type ThemeMode } from '../../store';
import { ink, space, typeScale } from '../../theme';

const MODES: readonly { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Auto' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

/** Appearance row (Profile): follow the OS, or force Light / Dark. */
export function AppearanceRow(): React.JSX.Element {
  const { state, dispatch } = useClash();
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.label}>APPEARANCE</Text>
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
  label: { ...typeScale.caption, color: ink.tertiary },
});
