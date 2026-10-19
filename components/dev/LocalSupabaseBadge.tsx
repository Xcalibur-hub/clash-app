/**
 * Dev-only local-Supabase marker.
 *
 * Rendered as an 8dp dot in the left gutter. The previous text chip was pinned
 * at `insets.top + 6` inside the content safe area and therefore sat on top of
 * the first line of any screen without its own top bar (Activity's return
 * history heading, which starts `insets.top + space.md` down). A dot in the
 * 16dp gutter cannot overlap a title, an action or a status-bar icon on any
 * width, and stays visible in both schemes.
 *
 * Never shown in preview/production store builds (those never ship local URLs).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLocalSupabase } from '../../services/supabaseClient';

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
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityLabel="Local Supabase session"
      style={[styles.dot, { top: insets.top + 4 }]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    left: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(250, 250, 248, 0.55)',
    backgroundColor: 'rgba(120, 120, 128, 0.95)',
    zIndex: 50,
  },
});

