import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VaultHomeScope } from '../../services/vaultHomeService';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const ITEMS: readonly { key: VaultHomeScope; label: string }[] = [
  { key: 'following', label: 'Following' },
  { key: 'discover', label: 'Discover' },
];

export interface VaultScopeControlProps {
  value: VaultHomeScope;
  onChange: (next: VaultHomeScope) => void;
}

/** Compact Following / Discover control — navigation, not the visual centerpiece. */
export function VaultScopeControl({ value, onChange }: VaultScopeControlProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="Vault scope">
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
            style={styles.item}
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
            <View
              style={[
                styles.underline,
                { backgroundColor: active ? t.textPrimary : 'transparent' },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.lg,
    paddingBottom: 2,
  },
  item: { gap: 6, paddingBottom: 2 },
  label: {
    ...typeScale.meta,
    letterSpacing: 0.2,
  },
  labelActive: {
    fontWeight: '600',
  },
  underline: {
    height: 2,
    borderRadius: 1,
    width: '100%',
  },
});
