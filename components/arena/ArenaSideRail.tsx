/** Persistent, labelled navigation within the existing Arena screen. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArenaIcon, CreatorsIcon, HashIcon, SparklesIcon } from '../shared/icons';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { ARENA_MODES, arenaModeAccessibilityLabel, type ArenaMode } from '../../utils/arenaNav';
import { tap } from '../../utils/haptics';
const ICONS = {
  for_you: SparklesIcon,
  clashes: ArenaIcon,
  community: CreatorsIcon,
  topics: HashIcon
};
export function ArenaSideRail({
  mode,
  onChange
}: {
  mode: ArenaMode;
  onChange: (mode: ArenaMode) => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return <View style={styles.shell} accessibilityRole="tablist" accessibilityLabel="Arena destinations">
  {ARENA_MODES.map(item => {
      const selected = item.id === mode,
        Icon = ICONS[item.id];
      return <Pressable key={item.id} onPress={() => {
        if (!selected) {
          tap();
          onChange(item.id);
        }
      }} accessibilityRole="tab" accessibilityState={{
        selected
      }} accessibilityLabel={arenaModeAccessibilityLabel(item.label, selected)} style={({
        pressed
      }) => [styles.item, {
        borderColor: selected ? t.textPrimary : t.border,
        backgroundColor: selected ? t.surfaceMuted : t.background,
        opacity: pressed ? 0.7 : 1
      }]}>
   <Icon size={17} color={selected ? t.textPrimary : t.textMuted} /><Text style={[styles.label, {
          color: selected ? t.textPrimary : t.textSecondary
        }]}>{item.label}</Text>
  </Pressable>;
    })}
 </View>;
}
const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: layout.screenX,
    paddingVertical: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs
  },
  item: {
    width: '48%',
    flexGrow: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md
  },
  label: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1
  }
});
