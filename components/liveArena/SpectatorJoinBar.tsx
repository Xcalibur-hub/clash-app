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

/** Bottom strip for spectators — same conversation, one quiet CTA. */
export function SpectatorJoinBar({
  busy = false,
  roomFull = false,
  onJoinPress,
}: SpectatorJoinBarProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: t.surface, borderTopColor: t.border },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.watching, { color: t.textMuted }]}>
        {roomFull ? 'This room filled up while you were watching.' : 'Watching this debate'}
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
          style={[styles.cta, { backgroundColor: t.pill }]}
        >
          {busy ? (
            <ActivityIndicator color={t.pillText} />
          ) : (
            <Text allowFontScaling={false} style={[styles.ctaText, { color: t.pillText }]}>
              Join the debate
            </Text>
          )}
        </Pressable>
      ) : null}
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <View style={[styles.handle, { backgroundColor: t.borderStrong }]} />
          <View style={[styles.gate, { backgroundColor: softFill(t) }]}>
            <StanceChoiceRow
              prompt="What do you think?"
              disabled={busy}
              onChoose={(stance) => {
                hapticTap();
                onChoose(stance);
              }}
            />
          </View>
          <Text allowFontScaling={false} style={[styles.sheetNote, { color: t.textMuted }]}>
            Your stance stays private. You stay in this room.
          </Text>
          {busy ? <ActivityIndicator color={t.textMuted} style={styles.busy} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  watching: { ...typeScale.meta, flex: 1, fontSize: 13 },
  cta: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...typeScale.button, fontSize: 14, fontWeight: '700' },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8,8,11,0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space.xs,
  },
  sheetTitle: { ...typeScale.section, fontSize: 18, fontWeight: '700' },
  sheetNote: { ...typeScale.caption, fontSize: 12, lineHeight: 17 },
  gate: { borderRadius: radius.lg, padding: space.sm },
  busy: { marginTop: space.xs },
});
