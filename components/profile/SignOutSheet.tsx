import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { color, ink, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface SignOutSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Restrained self menu — a single, clearly labelled Sign out. */
export function SignOutSheet({ visible, onClose }: SignOutSheetProps): React.JSX.Element {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = React.useState(false);

  const run = async (): Promise<void> => {
    setPending(true);
    try {
      await signOut();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <Text allowFontScaling={false} style={styles.title}>
          Account
        </Text>
        <Pressable
          onPress={() => {
            hapticTap();
            void run();
          }}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={styles.row}
        >
          <Text allowFontScaling={false} style={styles.signOut}>
            Sign out
          </Text>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.row}>
          <Text allowFontScaling={false} style={styles.cancel}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: color.scrim },
  sheet: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.xs,
  },
  title: { ...typeScale.caption, color: ink.tertiary, paddingBottom: space.xs },
  row: { paddingVertical: space.md },
  signOut: { ...typeScale.body, color: '#E5484D' },
  cancel: { ...typeScale.body, color: ink.primary },
});
