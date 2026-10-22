/**
 * Meet report reason sheet (E3.2).
 *
 * Presentation only: it lists the server's reasons and hands one back. It never
 * calls the API, so the same sheet serves session reports and message reports.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MeetButton } from './MeetButton';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { MEET_REPORT_REASONS } from '../../utils/meetSafety';
import type { MeetReportReason } from '../../services/meetService';

export function MeetReportSheet({
  visible,
  title,
  subtitle,
  onPick,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onPick: (reason: MeetReportReason) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const t = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onCancel}
        />
        <View style={[styles.card, { backgroundColor: t.background, borderColor: t.border }]}>
          <Text style={[styles.title, { color: t.textPrimary }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>{subtitle}</Text>
          ) : null}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {MEET_REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason.value}
                accessibilityRole="button"
                accessibilityLabel={reason.label}
                onPress={() => onPick(reason.value)}
                style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
              >
                <Text style={[styles.rowLabel, { color: t.textPrimary }]}>{reason.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <MeetButton label="Cancel" tone="glass" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: space.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.sm,
    maxHeight: '80%',
  },
  title: { ...typeScale.bodyStrong },
  subtitle: { ...typeScale.meta },
  list: { flexGrow: 0 },
  listContent: { gap: space.xs },
  row: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  rowLabel: { ...typeScale.body },
});
