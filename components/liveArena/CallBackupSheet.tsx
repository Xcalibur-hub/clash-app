import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  ArenaBackupCandidate,
  ArenaBackupInvite,
} from '../../services/arenaGameService';
import {
  backupPolicyLabel,
  callSecondsLeft,
  candidateSubtitle,
  incomingCallBody,
  incomingCallHeadline,
  reputationIsNotKarmaCopy,
  roomFullCopy,
  type ArenaBackupPolicy,
} from '../../utils/arenaGameState';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from '../vault/VaultActionButton';

export interface CallBackupSheetProps {
  visible: boolean;
  busy: boolean;
  roomIndex: number;
  candidates: ArenaBackupCandidate[];
  loading: boolean;
  policy: ArenaBackupPolicy;
  onClose: () => void;
  onCall: (recipientId: string) => void;
  onPolicy: (policy: ArenaBackupPolicy) => void;
}

const POLICIES: ArenaBackupPolicy[] = ['EVERYONE', 'FOLLOWING', 'NOBODY'];

/**
 * CALL BACKUP — bring someone into the fight.
 *
 * The shortlist is whatever the server ranked, with its real reasons attached.
 * A member can also decide here who is allowed to call them, which is the one
 * preference that makes the feature survivable at scale.
 */
export function CallBackupSheet({
  visible,
  busy,
  roomIndex,
  candidates,
  loading,
  policy,
  onClose,
  onCall,
  onPolicy,
}: CallBackupSheetProps): React.JSX.Element {
  const t = useThemeColors();
  void roomIndex;

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
            <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
              {reputationIsNotKarmaCopy()}
            </Text>

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
                {candidates.map((candidate) => (
                  <View
                    key={candidate.profileId}
                    style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
                  >
                    <View style={styles.rowCopy}>
                      <Text
                        allowFontScaling={false}
                        style={[styles.rowName, { color: t.textPrimary }]}
                        numberOfLines={1}
                      >
                        {candidate.author ? `@${candidate.author.handle}` : candidate.profileId}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[styles.rowMeta, { color: t.textMuted }]}
                        numberOfLines={1}
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
                ))}
              </View>
            )}

            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              WHO CAN CALL YOU
            </Text>
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
                      style={[styles.policyText, { color: active ? t.textPrimary : t.textMuted }]}
                    >
                      {backupPolicyLabel(entry)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <VaultActionButton label="Close" tone="quiet" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface BackupInviteSheetProps {
  visible: boolean;
  busy: boolean;
  invite: ArenaBackupInvite | null;
  roomIndex: number;
  now: number;
  onClose: () => void;
  onJoin: (inviteId: string, stance: 'AGREE' | 'UNSURE' | 'DISAGREE') => void;
}

/**
 * "ROOM 7 NEEDS YOU" — an incoming call.
 *
 * The stance is chosen here because a debater always argues a side; the call
 * itself never decided that for anyone.
 */
export function BackupInviteSheet({
  visible,
  busy,
  invite,
  roomIndex,
  now,
  onClose,
  onJoin,
}: BackupInviteSheetProps): React.JSX.Element | null {
  const t = useThemeColors();
  if (!invite) return null;
  const seconds = invite.expiresAt !== null ? callSecondsLeft(invite.expiresAt, now) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.background, borderColor: t.border }]}>
          <View style={styles.content}>
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              {incomingCallHeadline(roomIndex)}
            </Text>
            <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
              {incomingCallBody(invite.topicTitle, invite.caller?.name ?? 'Someone')}
            </Text>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
              {invite.acceptingDebaters
                ? seconds !== null
                  ? `${seconds}s left to answer.`
                  : 'You were called into the battle.'
                : roomFullCopy()}
            </Text>

            <View style={styles.stances}>
              {(['AGREE', 'UNSURE', 'DISAGREE'] as const).map((stance) => (
                <VaultActionButton
                  key={stance}
                  label={stance}
                  tone="quiet"
                  compact
                  onPress={() => onJoin(invite.inviteId, stance)}
                />
              ))}
            </View>
            <VaultActionButton
              label={busy ? 'Working…' : 'NOT NOW'}
              tone="quiet"
              compact
              onPress={onClose}
            />
          </View>
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
  rowMeta: { ...typeScale.meta, fontSize: 12 },
  policies: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  policy: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  policyText: { ...typeScale.caption, fontSize: 11, fontWeight: '700' },
  stances: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

