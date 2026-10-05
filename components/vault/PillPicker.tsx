import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface PillOption<T extends string | number> {
  value: T;
  label: string;
}

export interface PillPickerProps<T extends string | number> {
  label: string;
  options: readonly PillOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/** A wrapped row of selectable pills — used by the World Drop composer. */
export function PillPicker<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: PillPickerProps<T>): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.row}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                hapticTap();
                onChange(option.value);
              }}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              style={[
                styles.pill,
                {
                  borderColor: active ? t.textPrimary : t.border,
                  backgroundColor: active ? t.surfaceMuted : 'transparent',
                },
              ]}
            >
              <Text allowFontScaling={false} style={[styles.pillLabel, { color: t.textPrimary }]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...typeScale.caption, fontWeight: '800', letterSpacing: 0.8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLabel: { ...typeScale.label, fontWeight: '700' },
});
