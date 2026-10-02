/**
 * Subtle LOCAL badge — only when the JS bundle points at local Supabase
 * AND this is a development app variant / __DEV__ session.
 * Never shown in preview/production store builds (those never ship local URLs).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLocalSupabase } from '../../services/supabaseClient';
import { typeScale } from '../../theme';

function isDevVariant(): boolean {
  const variant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant;
  if (variant === 'development') return true;
  if (variant === 'preview' || variant === 'production') return false;
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function LocalSupabaseBadge(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  if (!isLocalSupabase || !isDevVariant()) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 6 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text allowFontScaling={false} style={styles.label}>
        LOCAL
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    zIndex: 50,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(20, 20, 24, 0.72)',
  },
  label: {
    ...typeScale.caption,
    color: 'rgba(250, 250, 248, 0.85)',
    fontWeight: '700',
    letterSpacing: 1,
  },
});
