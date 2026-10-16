/** Arena V2 compact destination selector — retains all four existing modes. */
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { ArenaIcon, CreatorsIcon, HashIcon, SparklesIcon } from '../shared/icons';
import { layout, useTheme, useThemeColors } from '../../theme';
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
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
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
        const fill = selected ? t.textPrimary : dark ? '#23242A' : '#EDEAE2';
        const textColor = selected ? t.background : t.textSecondary;
        return (
          <Pressable
            key={item.id}
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
              { backgroundColor: fill, opacity: pressed ? 0.78 : 1 },
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
  scroll: { flexGrow: 0 },
  shell: {
    paddingHorizontal: layout.screenX,
    paddingTop: 7,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  item: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
  },
  label: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 13,
    fontWeight: '700',
  },
});
