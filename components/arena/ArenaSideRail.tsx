/** Arena V2 compact destination selector — retains all four existing modes. */
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { ArenaIcon, CreatorsIcon, HashIcon, SparklesIcon } from '../shared/icons';
import { layout, useThemeColors } from '../../theme';
import { ARENA_MODES, arenaModeAccessibilityLabel, type ArenaMode } from '../../utils/arenaNav';
import { tap } from '../../utils/haptics';

const ICONS = {
  for_you: SparklesIcon,
  clashes: ArenaIcon,
  community: CreatorsIcon,
  topics: HashIcon,
};

export function ArenaSideRail({
  mode,
  onChange,
}: {
  mode: ArenaMode;
  onChange: (mode: ArenaMode) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.shell}
      accessibilityRole="tablist"
      accessibilityLabel="Arena destinations"
    >
      {ARENA_MODES.map((item) => {
        const selected = item.id === mode;
        const Icon = ICONS[item.id];
        const textColor = selected ? t.textPrimary : t.textSecondary;
        return (
          <Pressable
            key={item.id}
            collapsable={false}
            onPress={() => {
              if (!selected) {
                tap();
                onChange(item.id);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={arenaModeAccessibilityLabel(item.label, selected)}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: selected ? t.surfaceElevated : 'transparent',
                borderColor: selected ? t.borderStrong : 'transparent',
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Icon size={15} color={textColor} />
            <Text style={[styles.label, { color: textColor }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Above Arena list/header layers so destination taps are never stolen.
  scroll: { flexGrow: 0, zIndex: 2, elevation: 2 },
  shell: {
    paddingHorizontal: layout.screenX,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  item: {
    // 48dp avoids 420dpi rounding of 44→43.8dp on A50 (Phase 6.6).
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 13,
    fontWeight: '600',
  },
});
