import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '../../../theme';
import { arena, arenaColors } from '../../../theme/arena';
import { arenaSideTone, type ArenaSideKey } from '../../../theme/arenaSides';
import { PressableScale } from '../../shared/PressableScale';

export function ArenaButton({ label, onPress, variant = 'secondary', disabled = false, selected, style, accessibilityLabel }: {
  accessibilityLabel?: string; label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'tertiary';
  disabled?: boolean; selected?: boolean; style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <PressableScale accessibilityRole={selected === undefined ? 'button' : 'tab'} accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, selected }} aria-selected={selected} disabled={disabled} onPress={onPress}
    style={[styles.button, { backgroundColor: variant === 'primary' ? c.fill : variant === 'secondary' ? c.inset : 'transparent', opacity: disabled ? 0.45 : 1 }, style]}>
    <Text style={[arena.type.label, { color: variant === 'primary' ? c.onFill : c.ink, textAlign: 'center' }]}>{label}</Text>
  </PressableScale>;
}

export function ArenaBadge({ children }: { children: React.ReactNode }): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <View style={[styles.badge, { backgroundColor: c.inset, borderColor: c.line }]}>
    <Text style={[arena.type.meta, { color: c.secondary }]}>{children}</Text>
  </View>;
}

export function ArenaSurface({ children, variant = 'plain', style }: {
  children: React.ReactNode; variant?: 'plain' | 'inset' | 'raised'; style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <View style={[styles.surface, { backgroundColor: variant === 'plain' ? c.surface : variant === 'inset' ? c.inset : c.raised, borderColor: c.line }, style]}>{children}</View>;
}

/** Neutral community identity; side tint is reserved for actual fighters. */
export function ArenaIdentity({ name, detail, side }: { name: string; detail?: string; side?: ArenaSideKey }): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <View style={styles.identity}>
    <ArenaAvatar name={name} side={side} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[arena.type.label, { color: c.ink, fontWeight: '600' }]}>{name}</Text>
      {detail ? <Text style={[arena.type.meta, { color: c.muted }]}>{detail}</Text> : null}
    </View>
  </View>;
}

export function ArenaAvatar({ name, side, size = 36 }: { name: string; side?: ArenaSideKey; size?: number }): React.JSX.Element {
  const t = useThemeColors(), c = arenaColors(t), tone = side ? arenaSideTone(side, t.scheme) : null;
  return <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.inset, borderColor: tone?.ink ?? c.strongLine }]}>
    <Text allowFontScaling={false} style={[arena.type.label, { fontSize: Math.round(size * 0.34), color: c.ink }]}>{name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</Text>
  </View>;
}

export function ArenaSectionHeading({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <View style={styles.section}>
    <View style={{ flex: 1, minWidth: 100, gap: 2 }}>
      <Text accessibilityRole="header" style={[arena.type.heading, { color: c.ink }]}>{title}</Text>
      {detail ? <Text style={[arena.type.meta, { color: c.muted }]}>{detail}</Text> : null}
    </View>{children}
  </View>;
}

export function ArenaDivider(): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: arena.hit,
    minWidth: arena.hit,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: arena.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: { alignSelf: 'flex-start', borderRadius: arena.radius.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  surface: { borderRadius: arena.radius.lg, borderWidth: 1, padding: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  section: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 14 },
});
