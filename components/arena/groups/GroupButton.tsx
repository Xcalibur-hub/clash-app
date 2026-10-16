import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColors } from '../../../theme';
export function GroupButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  secondary = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}): React.JSX.Element {
  const t = useThemeColors();
  return <Pressable accessibilityRole="button" accessibilityState={{
    disabled: disabled || busy,
    busy
  }} disabled={disabled || busy} onPress={onPress} style={({
    pressed
  }) => [styles.button, {
    backgroundColor: secondary ? t.surfaceElevated : t.textPrimary,
    borderColor: t.border,
    opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1
  }]}>
    {busy ? <ActivityIndicator color={secondary ? t.textPrimary : t.background} /> : <Text style={[styles.label, {
      color: secondary ? t.textPrimary : t.background
    }]}>{label}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center'
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center'
  }
});
