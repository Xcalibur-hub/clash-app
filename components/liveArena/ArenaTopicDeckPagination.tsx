import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { space, typeScale, useThemeColors } from '../../theme';

export interface ArenaTopicDeckPaginationProps {
  index: number;
  total: number;
  onSelect?: (index: number) => void;
}

/** Minimal deck position — dots for short decks, "n / m" when longer. */
export function ArenaTopicDeckPagination({
  index,
  total,
  onSelect,
}: ArenaTopicDeckPaginationProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (total <= 1) return null;

  if (total <= 8) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Topic ${index + 1} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <Dot
            key={i}
            active={i === index}
            activeColor={t.textPrimary}
            idleColor={t.borderStrong}
            onPress={onSelect ? () => onSelect(i) : undefined}
            label={`Go to topic ${i + 1}`}
          />
        ))}
      </View>
    );
  }

  return (
    <Text
      allowFontScaling={false}
      style={[styles.count, { color: t.textMuted }]}
      accessibilityLabel={`Topic ${index + 1} of ${total}`}
    >
      {index + 1} / {total}
    </Text>
  );
}

function Dot({
  active,
  activeColor,
  idleColor,
  onPress,
  label,
}: {
  active: boolean;
  activeColor: string;
  idleColor: string;
  onPress?: () => void;
  label: string;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const width = useSharedValue(active ? 18 : 6);

  React.useEffect(() => {
    width.value = reduced
      ? active
        ? 18
        : 6
      : withSpring(active ? 18 : 6, { damping: 18, stiffness: 260 });
  }, [active, reduced, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor: active ? activeColor : idleColor,
  }));

  if (!onPress) {
    return <Animated.View style={[styles.dot, style]} />;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={10}
      style={styles.dotHit}
    >
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: space.xs,
  },
  dotHit: {
    minHeight: 24,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    height: 3,
    borderRadius: 2,
  },
  count: {
    ...typeScale.meta,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: space.xs,
  },
});
