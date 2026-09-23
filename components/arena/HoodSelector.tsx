import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { FEED_SCOPES, HOOD_LABEL } from '../../data/hoods';
import type { HoodId } from '../../store';
import { ink, layout, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface HoodSelectorProps {
  value: HoodId;
  onChange: (hood: HoodId) => void;
}

/** Horizontal hood switcher. The active hood inverts to a solid pill. */
export function HoodSelector({ value, onChange }: HoodSelectorProps): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {FEED_SCOPES.map((hood) => {
        const active = hood === value;
        return (
          <Pressable
            key={hood}
            onPress={() => {
              if (active) return;
              hapticTap();
              onChange(hood);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${HOOD_LABEL[hood]} feed`}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text allowFontScaling={false} style={[styles.label, active && styles.labelActive]}>
              {HOOD_LABEL[hood]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    paddingHorizontal: space.lg,
    height: layout.hit - 8,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  chipActive: { backgroundColor: ink.primary, borderColor: ink.primary },
  label: { ...typeScale.label, color: ink.secondary },
  labelActive: { color: '#08080B', fontWeight: '800' },
});
