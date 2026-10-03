/**
 * Compact spectator CTA + stance sheet for upgrading into the debate.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Stance } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { StanceChoiceRow } from '../arena/StanceChoiceRow';
import { softFill } from './liveArenaStyles';

export interface SpectatorJoinBarProps {
  busy?: boolean;
  roomFull?: boolean;
  onJoinPress: () => void;
}

/** Floating spectator tray — Watching + Join the debate. */
export function SpectatorJoinBar({
  busy = false,
  roomFull = false,
  onJoinPress,
}: SpectatorJoinBarProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: t.surfaceElevated,
            borderColor: t.border,
            shadowColor: t.shadowColor,
          },
        ]}
      >
        <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
          {roomFull ? 'This room filled up while you were watching.' : 'Watching'}
        </Text>
        {!roomFull ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onJoinPress();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Join the debate"
            style={[styles.cta, { backgroundColor: t.clashFill }]}
          >
            {busy ? (
              <ActivityIndicator color={t.clashText} />
            ) : (
              <Text allowFontScaling={false} style={[styles.ctaText, { color: t.clashText }]}>
                Join the debate
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export interface JoinDebateSheetProps {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onChoose: (stance: Stance) => void;
}

/** Small stance picker — anti-anchoring, no aggregates. */
export function JoinDebateSheet({
  visible,
  busy = false,
  onClose,
  onChoose,
}: JoinDebateSheetProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
          onPress={() => undefined}
        >
          <Text allowFontScaling={false} style={[styles.sheetTitle, { color: t.textPrimary }]}>
            Join the debate
          </Text>
          <Text allowFontScaling={false} style={[styles.sheetBody, { color: t.textMuted }]}>
            Your stance stays private.
          </Text>
          <View style={[styles.sheetPanel, { backgroundColor: softFill(t) }]}>
            <StanceChoiceRow prompt="What do you believe?" disabled={busy} onChoose={onChoose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  bar: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    gap: space.sm,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  watching: { ...typeScale.meta, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  cta: {
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typeScale.label, fontSize: 14, fontWeight: '800' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,11,0.45)',
    justifyContent: 'flex-end',
    padding: layout.screenX,
    paddingBottom: space.xxl,
  },
  sheet: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
  sheetTitle: { ...typeScale.section, fontSize: 18, fontWeight: '800' },
  sheetBody: { ...typeScale.meta, fontSize: 13 },
  sheetPanel: { borderRadius: 16, padding: space.sm },
});
