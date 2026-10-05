import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ArenaBackupCandidate } from '../../services/arenaGameService';
import {
  backupPolicyLabel,
  candidateSubtitle,
  type ArenaBackupPolicy,
} from '../../utils/arenaGameState';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { VaultActionButton } from '../vault/VaultActionButton';

export interface CallBackupSheetProps {
  visible: boolean;
  busy: boolean;
  candidates: ArenaBackupCandidate[];
  loading: boolean;
  policy: ArenaBackupPolicy;
  /** Optional confirmation after a successful call. */
  signalSent?: boolean;
  onClose: () => void;
  onCall: (recipientId: string) => void;
  onPolicy: (policy: ArenaBackupPolicy) => void;
}

const POLICIES: ArenaBackupPolicy[] = ['EVERYONE', 'FOLLOWING', 'NOBODY'];

/**
 * CALL BACKUP — bring someone into the fight.
 * Shortlist + real reasons from the server. Preferences stay secondary.
 */
export function CallBackupSheet({
  visible,
  busy,
  candidates,
  loading,
  policy,
  signalSent = false,
  onClose,
  onCall,
  onPolicy,
}: CallBackupSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const [prefsOpen, setPrefsOpen] = React.useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.background, borderColor: t.border }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              CALL BACKUP
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              Bring someone into the fight
            </Text>
            {signalSent ? (
              <Text allowFontScaling={false} style={[styles.signal, { color: t.textPrimary }]}>
                Backup signal sent
              </Text>
            ) : (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
                Call a respected voice. They choose whether to join — and which side.
              </Text>
            )}

            {loading ? (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
                Finding the right person…
              </Text>
            ) : candidates.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
                Nobody is available to call right now.
              </Text>
            ) : (
              <View style={styles.list}>
                {candidates.map((candidate) => {
                  const name = candidate.author?.name ?? 'Someone';
                  const handle = candidate.author?.handle;
                  const tint = candidate.author?.avatarTint ?? '#71717A';
                  return (
                    <View
                      key={candidate.profileId}
                      style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
                    >
                      <Avatar name={name} tint={tint} size={40} />
                      <View style={styles.rowCopy}>
                        <Text
                          allowFontScaling={false}
                          style={[styles.rowName, { color: t.textPrimary }]}
                          numberOfLines={1}
                        >
                          {handle ? `@${handle}` : name}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[styles.rowMeta, { color: t.textMuted }]}
                          numberOfLines={2}
                        >
                          {candidateSubtitle({
                            standing: candidate.standing,
                            reasons: candidate.reasons,
                          })}
                        </Text>
                      </View>
                      <VaultActionButton
                        label={busy ? 'Calling…' : 'CALL'}
                        compact
                        onPress={() => onCall(candidate.profileId)}
                      />
                    </View>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={() => setPrefsOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Who can call you"
            >
              <Text allowFontScaling={false} style={[styles.prefsToggle, { color: t.textMuted }]}>
                {prefsOpen ? 'Hide who can call you' : 'Who can call you'}
              </Text>
            </Pressable>

            {prefsOpen ? (
              <View style={styles.policies}>
                {POLICIES.map((entry) => {
                  const active = entry === policy;
                  return (
                    <Pressable
                      key={entry}
                      onPress={() => onPolicy(entry)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Allow backup requests from ${backupPolicyLabel(entry)}`}
                      style={[
                        styles.policy,
                        {
                          borderColor: active ? t.borderStrong : t.border,
                          backgroundColor: active ? t.surfaceMuted : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.policyText,
                          { color: active ? t.textPrimary : t.textMuted },
                        ]}
                      >
                        {backupPolicyLabel(entry)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <VaultActionButton label="Close" tone="quiet" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: { padding: space.lg, gap: space.sm },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { ...typeScale.display, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  body: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  signal: { ...typeScale.label, fontSize: 15, fontWeight: '800' },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowName: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  rowMeta: { ...typeScale.meta, fontSize: 12, lineHeight: 16 },
  prefsToggle: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingVertical: 4,
  },
  policies: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  policy: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  policyText: { ...typeScale.caption, fontSize: 11, fontWeight: '700' },
});
