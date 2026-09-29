import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedScope } from '../../store';
import { ink, layout, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

const SCOPES: readonly { key: FeedScope; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'following', label: 'Following' },
  { key: 'popular', label: 'Popular' },
  { key: 'new', label: 'New' },
];

export interface FeedScopeTabsProps {
  value: FeedScope;
  onChange: (scope: FeedScope) => void;
}

/** The Arena's primary sort/scope selector — one feed, four scopes. */
export function FeedScopeTabs({ value, onChange }: FeedScopeTabsProps): React.JSX.Element {
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="Feed scope">
      {SCOPES.map((scope) => {
        const active = scope.key === value;
        return (
          <Pressable
            key={scope.key}
            onPress={() => {
              hapticTap();
              onChange(scope.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.tab}
          >
            <Text
              allowFontScaling={false}
              style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
            >
              {scope.label}
            </Text>
            {active ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenX,
    gap: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tab: { paddingVertical: space.sm, paddingHorizontal: 2 },
  label: { ...typeScale.label, fontSize: 15 },
  labelActive: { color: ink.primary, fontWeight: '700' },
  labelInactive: { color: ink.tertiary, fontWeight: '500' },
  underline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: ink.primary,
  },
});
