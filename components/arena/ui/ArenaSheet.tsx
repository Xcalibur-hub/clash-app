import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../theme';
import { arena } from '../../../theme/arena';
import { arenaSheetBottomPadding } from '../../../utils/arenaUiConsistency';
import { ArenaButton } from './ArenaPrimitives';

export function ArenaSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const bottomPad = arenaSheetBottomPadding(insets.bottom);
  return <Modal visible transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + 12, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <View accessibilityViewIsModal style={[arena.sheet, { backgroundColor: t.background, maxHeight: '92%', paddingBottom: bottomPad, gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text accessibilityRole="header" style={[arena.type.heading, { color: t.textPrimary, flex: 1 }]}>{title}</Text><ArenaButton label="Close" onPress={onClose} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ gap: 12, paddingBottom: bottomPad }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
