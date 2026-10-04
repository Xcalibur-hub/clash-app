import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';

export function ClueProgressDots({
  solved,
  total,
}: {
  solved: number;
  total: number;
}): React.JSX.Element {
  const t = useThemeColors();
  const count = Math.max(0, total);
  return (
    <View style={styles.wrap} accessibilityLabel={`${solved} of ${total} clues solved`}>
      <View style={styles.row}>
        {Array.from({ length: count }).map((_, i) => {
          const on = i < solved;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: on ? '#F2E6C8' : 'transparent',
                  borderColor: on ? '#F2E6C8' : t.borderStrong ?? t.border,
                },
              ]}
            />
          );
        })}
      </View>
      <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
        {solved} / {total} clues solved
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', gap: 10 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  label: {
    fontFamily: typeScale.caption.fontFamily,
    fontSize: typeScale.caption.fontSize,
    letterSpacing: 0.3,
  },
});
