import React from 'react';
import { Pressable } from 'react-native';
import { useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { BackIcon } from '../shared/icons';

export function VaultBackButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return <Pressable accessibilityRole="button" accessibilityLabel="Back"
    onPress={() => { hapticTap(); onPress(); }}
    style={{ alignSelf: 'flex-start', width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1,
      backgroundColor: t.surface, borderColor: t.border }}>
    <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
  </Pressable>;
}
