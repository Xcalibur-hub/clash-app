/**
 * Contextual Clash overflow — history / rules / share / report.
 * Keeps secondary actions off the permanent Stage chrome.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export interface ClashMoreSheetProps {
  visible: boolean;
  onClose: () => void;
  onArgumentHistory?: () => void;
  onShare?: () => void;
  onReport?: () => void;
}

export function ClashMoreSheet({
  visible,
  onClose,
  onArgumentHistory,
  onShare,
  onReport,
}: ClashMoreSheetProps): React.JSX.Element {
  const t = useThemeColors();

  const rows: { label: string; onPress?: () => void; hint?: string }[] = [
    {
      label: 'Argument history',
      onPress: onArgumentHistory
        ? () => {
            onClose();
            onArgumentHistory();
          }
        : undefined,
    },
    {
      label: 'Rules',
      hint: 'Exactly two active speakers. Crowd never decides the verdict. Backing is not judgement.',
    },
    { label: 'Share', onPress: onShare },
    { label: 'Report', onPress: onReport },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <View style={[styles.sheet, { backgroundColor: t.background, borderColor: t.border }]}>
          {rows.map((row) => (
            <Pressable
              key={row.label}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              disabled={!row.onPress && !row.hint}
              onPress={() => {
                if (row.onPress) row.onPress();
                else onClose();
              }}
              style={styles.row}
            >
              <Text style={[styles.label, { color: t.textPrimary }]}>{row.label}</Text>
              {row.hint ? (
                <Text style={[styles.hint, { color: t.textMuted }]}>{row.hint}</Text>
              ) : null}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.row}
          >
            <Text style={[styles.label, { color: t.textMuted }]}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: layout.screenX,
    paddingBottom: space.xl,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'center',
    gap: 4,
  },
  label: { ...typeScale.label, fontSize: 15, fontWeight: '700' },
  hint: { ...typeScale.caption, fontSize: 12, lineHeight: 16 },
});
