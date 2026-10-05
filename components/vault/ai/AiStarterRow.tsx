import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface AiStarterRowProps {
  starters: readonly string[];
  disabled?: boolean;
  onPick: (starter: string) => void;
}

/** Creator-authored conversation starters. They only fill the composer. */
export function AiStarterRow({
  starters,
  disabled = false,
  onPick,
}: AiStarterRowProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (starters.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {starters.map((starter) => (
        <Pressable
          key={starter}
          disabled={disabled}
          onPress={() => {
            hapticTap();
            onPick(starter);
          }}
          accessibilityRole="button"
          accessibilityLabel={starter}
          style={[
            styles.chip,
            { borderColor: t.border, backgroundColor: t.surface, opacity: disabled ? 0.5 : 1 },
          ]}
        >
          <Text allowFontScaling={false} style={[styles.label, { color: t.textPrimary }]}>
            {starter}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs, paddingRight: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 260,
  },
  label: { ...typeScale.label, fontSize: 12, fontWeight: '600' },
});
