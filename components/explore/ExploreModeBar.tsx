import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { EXPLORE_MODES, type ExploreMode } from '../../utils/exploreForYouRank';
import { tap as hapticTap } from '../../utils/haptics';

export function ExploreModeBar({
  mode,
  onChange,
}: {
  mode: ExploreMode;
  onChange: (mode: ExploreMode) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {EXPLORE_MODES.map((item) => {
        const on = item.id === mode;
        return (
          <Pressable
            key={item.id}
            onPress={() => {
              hapticTap();
              onChange(item.id);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: on ? t.textPrimary : t.surfaceElevated,
                borderColor: t.borderStrong,
              },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={item.label}
          >
            <Text
              allowFontScaling={false}
              style={[styles.text, { color: on ? t.background : t.textPrimary }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: space.md },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...typeScale.label, fontSize: 13, fontWeight: '800' },
});
