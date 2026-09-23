/** One Vault list row: rank/title + sub + trailing value (spec §22). */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronIcon } from '../shared/icons';
import { ink, radius, space, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

export interface CreatorRowProps {
  title: string;
  sub: string;
  value: string;
  onPress: () => void;
}

export function CreatorRow({ title, sub, value, onPress }: CreatorRowProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => { hapticPress(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>{title}</Text>
        <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>{sub}</Text>
      </View>
      <Text allowFontScaling={false} style={styles.value}>{value}</Text>
      <ChevronIcon size={15} color={ink.tertiary} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  pressed: { opacity: 0.72 },
  main: { flex: 1, gap: 2 },
  title: { ...typeScale.bodyStrong, color: ink.primary, fontSize: 14 },
  sub: { ...typeScale.meta, color: ink.tertiary, fontWeight: '400' },
  value: { ...typeScale.data, color: ink.primary },
});