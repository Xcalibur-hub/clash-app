import React from 'react';
import { Pressable } from 'react-native';
import { useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';
import { useRouter } from 'expo-router';

export function VaultBackButton({ onPress, fallback = '/(vault)' }: { onPress?: () => void; fallback?: string }): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel="Back"
    onPress={() => { hapticTap(); if (onPress) onPress(); else if (router.canGoBack()) router.back(); else router.replace(fallback as never); }}
    style={{ alignSelf: 'flex-start', width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1,
      backgroundColor: t.surface, borderColor: t.border }}>
    <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
  </Pressable>;
}
