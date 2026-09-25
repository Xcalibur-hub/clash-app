import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ink, space, typeScale } from '../../theme';

export interface UtilityActionProps {
  icon: LucideIcon;
  label: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}

/** One quiet utility target in the card's secondary row (React / Save / Share / More). */
export function UtilityAction({
  icon: Icon,
  label,
  color,
  selected,
  onPress,
}: UtilityActionProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={styles.utility}
      accessibilityRole="button"
      accessibilityLabel={label || 'More take actions'}
      accessibilityState={{ selected }}
    >
      <Icon size={19} color={color} strokeWidth={2.1} />
      {label ? <Text style={styles.utilityText}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  utility: {
    minWidth: 48,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  utilityText: { ...typeScale.meta, color: ink.secondary },
});