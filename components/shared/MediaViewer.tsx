/**
 * Full-screen media viewer — contain on black, no crop.
 */
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface MediaViewerProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

export function MediaViewer({ visible, uri, onClose }: MediaViewerProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          onPress={() => {
            hapticTap();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close media"
          style={[styles.close, { top: insets.top + 12 }]}
          hitSlop={12}
        >
          <Text allowFontScaling={false} style={styles.closeLabel}>
            Close
          </Text>
        </Pressable>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Full screen media"
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    right: 16,
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  closeLabel: { ...typeScale.label, color: '#FFFFFF', fontWeight: '600' },
  image: { width: '100%', height: '100%' },
});
