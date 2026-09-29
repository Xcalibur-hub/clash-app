import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '../../store';
import { showNotice, useClash } from '../../store';
import { blockProfile, muteUser, reportContent } from '../../services/safetyService';
import { followUser, unfollowUser } from '../../services/socialService';
import { errorText } from '../../services/supabaseClient';
import type { ReportReason, ReportTarget } from '../../supabase/types';
import { color, ink, space, typeScale } from '../../theme';
import { useRequireAuth } from '../../hooks/useRequireAuth';

const REASONS: readonly { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'misinformation', label: 'Misinformation' },
  { key: 'impersonation', label: 'Impersonation' },
  { key: 'other', label: 'Other' },
];

export interface PostActionsSheetProps {
  visible: boolean;
  target: User | null;
  isSelf: boolean;
  following: boolean;
  reportTarget: { kind: ReportTarget; id: string } | null;
  onClose: () => void;
  onMutated?: () => void;
}

/** Bottom sheet: follow / mute / block / report for a Take or comment author. */
export function PostActionsSheet({
  visible,
  target,
  isSelf,
  following,
  reportTarget,
  onClose,
  onMutated,
}: PostActionsSheetProps): React.JSX.Element | null {
  const { dispatch, reloadArena } = useClash();
  const requireAuth = useRequireAuth();
  const insets = useSafeAreaInsets();
  const [reporting, setReporting] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (visible) setReporting(false);
  }, [visible]);

  if (!target) return null;

  // Every action here is an authenticated write, so it routes through the one
  // shared auth gate: a guest is sent to sign in instead of hitting a raw RLS error.
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    if (!requireAuth()) {
      onClose();
      return;
    }
    setPending(true);
    try {
      await fn();
      onMutated?.();
      onClose();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPending(false);
    }
  };

  // Block/mute change feed visibility, so re-hydrate the Arena after the sheet
  // closes (the blocked/muted author's content disappears without a restart).
  const block = (): void => {
    void run(() => blockProfile(target.id)).then(() => void reloadArena());
  };
  const mute = (): void => {
    void run(() => muteUser(target.id)).then(() => void reloadArena());
  };

  const submitReport = (reason: ReportReason): void => {
    if (!reportTarget) return;
    // Reporting leaves the content in place — the sheet closes with a restrained
    // confirmation; moderation reviews it out of band.
    void run(async () => {
      await reportContent(reportTarget.kind, reportTarget.id, reason);
      dispatch(showNotice('Report submitted.'));
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <Text allowFontScaling={false} style={styles.title}>
          {reporting ? 'Report' : target.name}
        </Text>
        {reporting ? (
          <View>
            {REASONS.map((reason) => (
              <Pressable
                key={reason.key}
                onPress={() => submitReport(reason.key)}
                disabled={pending}
                accessibilityRole="button"
                accessibilityLabel={`Report: ${reason.label}`}
                style={styles.row}
              >
                <Text allowFontScaling={false} style={styles.rowText}>
                  {reason.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View>
            {!isSelf ? (
              <>
                <Row
                  label={following ? `Unfollow @${target.handle}` : `Follow @${target.handle}`}
                  onPress={() => void run(() => (following ? unfollowUser(target.id) : followUser(target.id)))}
                  disabled={pending}
                />
                <Row
                  label={`Mute @${target.handle}`}
                  onPress={mute}
                  disabled={pending}
                />
                <Row
                  label={`Block @${target.handle}`}
                  danger
                  onPress={block}
                  disabled={pending}
                />
              </>
            ) : null}
            <Row label="Report" danger onPress={() => setReporting(true)} disabled={pending} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function Row({ label, onPress, danger = false, disabled = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.row}
    >
      <Text allowFontScaling={false} style={[styles.rowText, danger && styles.danger]}>
        {label}
      </Text>
    </Pressable>
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
  rowText: { ...typeScale.body, color: ink.primary },
  danger: { color: '#E5484D' },
});
