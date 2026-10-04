/**
 * Floating vertical Explore mode rail — premium control, not a second tab bar.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  CompassIcon,
  CreatorsIcon,
  PlayIcon,
  WorldIcon,
  ZapIcon,
} from '../shared/icons';
import { radius, typeScale, useThemeColors } from '../../theme';
import {
  EXPLORE_MODES,
  type ExploreMode,
} from '../../utils/exploreForYouRank';
import { exploreModeAccessibilityLabel } from '../../utils/exploreNav';
import { tap as hapticTap } from '../../utils/haptics';

const ITEM = 44;
const COLLAPSED_W = 52;
const EXPANDED_W = 128;
const RAIL_RIGHT = 16;
const SPRING = { damping: 18, stiffness: 240, mass: 0.7 };

const ICONS: Record<
  ExploreMode,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  for_you: CompassIcon,
  world: WorldIcon,
  live: ZapIcon,
  play: PlayIcon,
  meet: CreatorsIcon,
};

export function ExploreModeRail({
  mode,
  onChange,
  bottomOffset = 120,
}: {
  mode: ExploreMode;
  onChange: (mode: ExploreMode) => void;
  bottomOffset?: number;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = React.useState(false);
  const expand = useSharedValue(0);
  const index = Math.max(
    0,
    EXPLORE_MODES.findIndex((m) => m.id === mode),
  );
  const indicator = useSharedValue(index * ITEM);
  const collapseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    indicator.value = reduced
      ? index * ITEM
      : withSpring(index * ITEM, SPRING);
  }, [index, indicator, reduced]);

  React.useEffect(() => {
    expand.value = reduced
      ? expanded
        ? 1
        : 0
      : withTiming(expanded ? 1 : 0, { duration: 220 });
  }, [expanded, expand, reduced]);

  React.useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  const scheduleCollapse = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 2200);
  };

  const shellStyle = useAnimatedStyle(() => ({
    width: interpolate(expand.value, [0, 1], [COLLAPSED_W, EXPANDED_W]),
  }));

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: indicator.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: expand.value,
    maxWidth: interpolate(expand.value, [0, 1], [0, 72]),
  }));

  return (
    <Animated.View
      style={[
        styles.shell,
        shellStyle,
        {
          bottom: bottomOffset,
          backgroundColor: t.scheme === 'light' ? 'rgba(255,255,255,0.94)' : 'rgba(18,18,20,0.92)',
          borderColor: t.borderStrong,
          shadowColor: t.shadowColor,
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Explore modes"
    >
      <Animated.View
        style={[
          styles.indicator,
          indicatorStyle,
          { backgroundColor: t.textPrimary },
        ]}
      />
      {EXPLORE_MODES.map((item) => {
        const on = item.id === mode;
        const Icon = ICONS[item.id];
        const color = on ? t.background : t.textPrimary;
        return (
          <Pressable
            key={item.id}
            onPress={() => {
              hapticTap();
              if (!expanded) setExpanded(true);
              onChange(item.id);
              scheduleCollapse();
            }}
            onLongPress={() => {
              setExpanded(true);
              scheduleCollapse();
            }}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={exploreModeAccessibilityLabel(item.label, on)}
          >
            <View style={[styles.iconWrap, on && styles.iconSelected]}>
              <Icon size={18} color={color} strokeWidth={on ? 2.6 : 2.2} />
            </View>
            <Animated.Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.label,
                labelStyle,
                { color: on ? t.background : t.textPrimary },
              ]}
            >
              {item.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
        right: RAIL_RIGHT,
    zIndex: 30,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 4,
    overflow: 'hidden',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    elevation: 8,
  },
  indicator: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 6,
    height: ITEM,
    borderRadius: radius.xl,
  },
  item: {
    height: ITEM,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
    zIndex: 1,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: {
    transform: [{ scale: 1.06 }],
  },
  label: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
});
