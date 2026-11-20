import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VaultHomeScope } from '../../services/vaultHomeService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const ITEMS: readonly { key: VaultHomeScope; label: string }[] = [
  { key: 'following', label: 'Following' },
  { key: 'discover', label: 'Discover' },
];

export interface VaultScopeControlProps {
  value: VaultHomeScope;
  onChange: (next: VaultHomeScope) => void;
}

/** Compact pill selector — Explore filter density, not a chunky tab bar. */
export function VaultScopeControl({ value, onChange }: VaultScopeControlProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Vault scope"
    >
      {ITEMS.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (item.key === value) return;
              hapticTap();
              onChange(item.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              styles.pill,
              active && {
                backgroundColor: t.scheme === 'light' ? t.surface : 'rgba(255,255,255,0.12)',
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.label,
                { color: active ? t.textPrimary : t.textMuted },
                active && styles.labelActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  label: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    fontWeight: '800',
  },
});
