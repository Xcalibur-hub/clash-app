import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { ARENA_CREW_SPECIALTIES } from '../../utils/arenaCrewSpecialties';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export type CrewSpecialtyFilter = (typeof ARENA_CREW_SPECIALTIES)[number] | 'All';

export interface CrewSpecialtyRailProps {
  selected: CrewSpecialtyFilter;
  onChange: (value: CrewSpecialtyFilter) => void;
}

const OPTIONS: readonly CrewSpecialtyFilter[] = ['All', ...ARENA_CREW_SPECIALTIES];

/** Compact tactile specialty selector — Arena-native, not a form. */
export function CrewSpecialtyRail({ selected, onChange }: CrewSpecialtyRailProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
        accessibilityLabel="Crew specialties"
      >
        {OPTIONS.map((item) => (
          <SpecialtyChip
            key={item}
            label={item}
            active={item === selected}
            onPress={() => onChange(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SpecialtyChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        if (!reduced) {
          scale.value = withSequence(
            withSpring(0.94, { damping: 16, stiffness: 400 }),
            withSpring(1, { damping: 14, stiffness: 280 }),
          );
        }
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label === 'All' ? 'All specialties' : label}
    >
      <Animated.View
        style={[
          styles.pill,
          anim,
          { backgroundColor: active ? t.pill : 'transparent' },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.label,
            {
              color: active ? t.pillText : t.textMuted,
              fontWeight: active ? '700' : '500',
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 4 },
  row: {
    paddingHorizontal: layout.screenX,
    gap: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  label: { ...typeScale.label, fontSize: 13, letterSpacing: -0.15 },
});
