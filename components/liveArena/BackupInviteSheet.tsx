import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ArenaBackupInvite } from '../../services/arenaGameService';
import {
  callSecondsLeft,
  incomingCallBody,
  incomingCallHeadline,
  roomFullCopy,
} from '../../utils/arenaGameState';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { VaultActionButton } from '../vault/VaultActionButton';

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
 * itself never decided that for anyone. A saturated room is reported as
 * saturated rather than quietly letting someone in.
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
  stances: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
