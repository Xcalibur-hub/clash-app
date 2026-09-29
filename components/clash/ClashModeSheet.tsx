import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClashMode } from '../../services/clashEngineService';
import { card, color, ink, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface ClashModeSheetProps {
  visible: boolean;
  onClose: () => void;
  onChoose: (mode: ClashMode) => void;
}

/** Compact Standard vs Blind picker — Blind is never the default. */
export function ClashModeSheet({ visible, onClose, onChoose }: ClashModeSheetProps): React.JSX.Element | null {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text allowFontScaling={false} style={styles.title}>Start a Clash</Text>
        <Pressable
          onPress={() => {
            hapticTap();
            onChoose('STANDARD');
          }}
          accessibilityRole="button"
          accessibilityLabel="Standard Clash"
          style={styles.option}
        >
          <Text allowFontScaling={false} style={styles.optionTitle}>Standard Clash</Text>
          <Text allowFontScaling={false} style={styles.optionBody}>Identities are visible while judging.</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            hapticTap();
            onChoose('BLIND');
          }}
          accessibilityRole="button"
          accessibilityLabel="Blind Clash. Participants stay hidden until you judge."
          style={styles.option}
        >
          <Text allowFontScaling={false} style={styles.optionTitle}>Blind Clash</Text>
          <Text allowFontScaling={false} style={styles.optionBody}>Participants stay hidden until you judge.</Text>
        </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: color.scrim,
  },
  sheet: {
    marginHorizontal: space.md,
    marginBottom: space.lg,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.elevated,
  },
  title: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  option: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
    gap: 4,
  },
  optionTitle: { ...typeScale.label, color: ink.primary, fontWeight: '600' },
  optionBody: { ...typeScale.meta, color: ink.tertiary },
});
