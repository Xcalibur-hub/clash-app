import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { space, typeScale, useThemeColors } from '../../theme';

export interface ArenaStackProgressProps {
  index: number;
  total: number;
}

/** Elegant stack position — active segment widens. */
export function ArenaStackProgress({ index, total }: ArenaStackProgressProps): React.JSX.Element {
  const t = useThemeColors();
  if (total <= 1) return <View style={styles.spacer} />;

  if (total <= 10) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Card ${index + 1} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <ProgressSegment key={i} active={i === index} activeColor={t.textPrimary} idleColor={t.borderStrong} />
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

function ProgressSegment({
  active,
  activeColor,
  idleColor,
}: {
  active: boolean;
  activeColor: string;
  idleColor: string;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const width = useSharedValue(active ? 22 : 8);

  React.useEffect(() => {
    width.value = reduced
      ? active
        ? 22
        : 8
      : withSpring(active ? 22 : 8, { damping: 18, stiffness: 260 });
  }, [active, reduced, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor: active ? activeColor : idleColor,
  }));

  return <Animated.View style={[styles.seg, style]} />;
}

const styles = StyleSheet.create({
  spacer: { height: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  seg: {
    height: 3,
    borderRadius: 2,
  },
  count: {
    ...typeScale.meta,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: space.xs,
  },
});
