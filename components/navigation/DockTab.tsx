import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { accent, ink, radius } from '../../theme';

export interface DockTabProps {
  label: string;
  icon: LucideIcon;
  focused: boolean;
  onPress: () => void;
}

/** One icon slot in the dock — the active tab carries a gold glow. */
export function DockTab({ label, icon: Icon, focused, onPress }: DockTabProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={`${label} tab`}
      style={styles.tab}
    >
      {focused ? <View style={styles.glow} pointerEvents="none" /> : null}
      <Icon size={22} color={focused ? accent.gold : ink.tertiary} strokeWidth={2.4} />
      {focused ? <View style={styles.dot} pointerEvents="none" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 46,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,200,97,0.16)',
    shadowColor: accent.gold,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: {
    position: 'absolute',
    bottom: 8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: accent.gold,
  },
});