/**
 * Compact rolling For You filter selector — camera-mode style, not a second nav bar.
 */
import React from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import {
  FOR_YOU_FILTERS,
  forYouFilterAccessibilityLabel,
  type ForYouFilterId,
} from '../../utils/exploreNav';
import { tap as hapticTap } from '../../utils/haptics';

const CHIP_GAP = 6;

export function ExploreFilterWheel({
  value,
  onChange,
}: {
  value: ForYouFilterId;
  onChange: (next: ForYouFilterId) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const ref = React.useRef<ScrollView>(null);
  const widths = React.useRef<Record<string, number>>({});

  const scrollToSelected = React.useCallback(
    (id: ForYouFilterId, animated: boolean) => {
      let x = 0;
      for (const item of FOR_YOU_FILTERS) {
        if (item.id === id) break;
        x += (widths.current[item.id] ?? 64) + CHIP_GAP;
      }
      ref.current?.scrollTo({ x: Math.max(0, x - 36), animated });
    },
    [],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => scrollToSelected(value, true), 40);
    return () => clearTimeout(timer);
  }, [value, scrollToSelected]);

  return (
    <View style={styles.wrap} accessibilityRole="tablist" accessibilityLabel="For You filters">
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        onScrollEndDrag={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          // Lightweight snap assist toward nearest chip.
          const x = e.nativeEvent.contentOffset.x;
          let cursor = 0;
          let best = FOR_YOU_FILTERS[0]!.id;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const item of FOR_YOU_FILTERS) {
            const w = widths.current[item.id] ?? 64;
            const center = cursor + w / 2;
            const dist = Math.abs(center - (x + 48));
            if (dist < bestDist) {
              bestDist = dist;
              best = item.id;
            }
            cursor += w + CHIP_GAP;
          }
          if (best !== value) onChange(best);
        }}
      >
        {FOR_YOU_FILTERS.map((item) => {
          const on = item.id === value;
          return (
            <Pressable
              key={item.id}
              onLayout={(e) => {
                widths.current[item.id] = e.nativeEvent.layout.width;
              }}
              onPress={() => {
                hapticTap();
                onChange(item.id);
              }}
              style={[
                styles.chip,
                on
                  ? { backgroundColor: t.textPrimary }
                  : { backgroundColor: 'transparent' },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={forYouFilterAccessibilityLabel(item.label, on)}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.label,
                  {
                    color: on ? t.background : t.textMuted,
                    fontWeight: on ? '800' : '600',
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 34 },
  row: {
    gap: CHIP_GAP,
    alignItems: 'center',
    paddingRight: space.xl,
  },
  chip: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typeScale.caption,
    fontSize: 11,
    letterSpacing: 0.8,
  },
});
