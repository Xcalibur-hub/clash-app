import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../theme';

export interface ArenaStackProgressProps {
  index: number;
  total: number;
}

/** Understated position cue for the featured stack. */
export function ArenaStackProgress({ index, total }: ArenaStackProgressProps): React.JSX.Element {
  const t = useThemeColors();
  if (total <= 1) return <View style={styles.spacer} />;

  if (total <= 8) {
    return (
      <View
        style={styles.dots}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Card ${index + 1} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === index
                ? { backgroundColor: t.textPrimary, width: 16, borderRadius: 3 }
                : { backgroundColor: t.borderStrong },
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <Text
      allowFontScaling={false}
      style={[styles.count, { color: t.textMuted }]}
      accessibilityLabel={`Card ${index + 1} of ${total}`}
    >
      {index + 1} / {total}
    </Text>
  );
}

const styles = StyleSheet.create({
  spacer: { height: 8 },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.xs,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  count: {
    ...typeScale.meta,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: space.xs,
  },
});
