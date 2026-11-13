/**
 * Spectator admission — the confirm sheet for `watch_arena_room`.
 *
 * ## Why this exists next to `JoinDebateSheet`
 *
 * They are different operations and the app used to pretend otherwise:
 *
 *   · `JoinDebateSheet` collects a **stance** and calls `upgrade_arena_spectator`,
 *     which requires an existing spectator row. A non-member reaching it is
 *     refused with `join the room first` (42501).
 *   · This sheet collects **nothing** and calls `watch_arena_room(p_room_id)`.
 *     That RPC takes no stance — spectators carry a null stance by design — and
 *     consumes no capacity, because admission is an INSERT, not a role change.
 *
 * Sharing one sheet between them is what produced the integration blocker: the
 * stance control was soliciting input the RPC would never read, and the handler
 * behind it was the wrong call. Two operations, two sheets, two RPCs.
 *
 * ## What it shows
 *
 * A single confirm. The copy states what admission does *not* grant — the viewer
 * becomes a spectator, not a debater — because the previous flow was silent about
 * that and the resulting error was surprising.
 */
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export interface WatchRoomSheetProps {
  visible: boolean;
  busy?: boolean;
  roomIndex?: number | null;
  /**
   * Why admission became unavailable, if it did.
   *
   * The room can settle or be cancelled while this sheet is open — the phase is
   * realtime and the viewer may take a while to tap. When that happens the
   * confirm control must disappear rather than fire a call the server now
   * rejects, and the sheet must say why. A silent close would be worse: the
   * viewer tapped "Watch", and something needs to explain that the option is
   * gone.
   *
   * Non-null disables confirmation; the sheet stays mounted so the reason is
   * visible.
   */
  blockedReason?: string | null;
  onClose: () => void;
  /** Performs `watch_arena_room`. Resolves true once the row exists. */
  onConfirm: () => void;
}

export function WatchRoomSheet({
  visible,
  busy = false,
  roomIndex = null,
  blockedReason = null,
  onClose,
  onConfirm,
}: WatchRoomSheetProps): React.JSX.Element {
  const t = useThemeColors();
  // One predicate for "can this be confirmed". The button, its accessibility
  // state and the handler all read it, so a stale tap cannot slip through.
  const blocked = blockedReason !== null;
  const disabled = busy || blocked;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[styles.sheet, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
          onPress={() => undefined}
        >
          <Text style={[styles.kicker, { color: t.textMuted }]}>
            {roomIndex != null ? `WATCH · Room ${roomIndex}` : 'WATCH'}
          </Text>

          <Text style={[styles.title, { color: t.textPrimary }]}>Watch this clash</Text>

          <Text style={[styles.body, { color: t.textSecondary }]}>
            You will be admitted as a spectator. You can read every argument and react as
            the room moves.
          </Text>
          <Text style={[styles.body, { color: t.textMuted }]}>
            Spectators do not pick a side, and do not vote. If you want to argue, you can
            join the debate once you are in — while the room is still open.
          </Text>

          {blocked ? (
            /*
             * No control at all. A disabled button still reads as an invitation,
             * and the whole point of this state is that the invitation expired.
             */
            <Text
              style={[styles.blocked, { color: t.textMuted }]}
              accessibilityLiveRegion="polite"
            >
              {blockedReason}
            </Text>
          ) : (
            <Pressable
              onPress={() => {
                if (disabled) return;
                hapticTap();
                onConfirm();
              }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Watch this clash"
              accessibilityState={{ disabled, busy }}
              style={({ pressed }) => [
                styles.confirm,
                {
                  backgroundColor: busy ? t.surfaceMuted : t.textPrimary,
                  opacity: pressed && !busy ? 0.92 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={t.textMuted} />
              ) : (
                <Text style={[typeScale.button, { color: t.background }]}>WATCH THIS CLASH</Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            style={styles.cancel}
          >
            <Text style={[typeScale.meta, { color: t.textMuted }]}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.screenX,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  kicker: { ...typeScale.kicker, letterSpacing: 1.4 },
  title: { ...typeScale.section },
  body: { ...typeScale.meta, lineHeight: 20 },
  confirm: {
    marginTop: space.sm,
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocked: { ...typeScale.meta, lineHeight: 20, paddingVertical: space.sm },
  // 48dp minimum touch target. The label is small text, so padding alone left it
  // around 40dp — below the platform minimum and hard to hit one-handed.
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingVertical: space.sm },
});
