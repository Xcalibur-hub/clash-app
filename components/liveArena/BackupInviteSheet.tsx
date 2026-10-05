import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { ArenaBackupInvite } from '../../services/arenaGameService';
import {
  callSecondsLeft,
  incomingCallBody,
  incomingCallHeadline,
  incomingCallTopic,
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
 * Stance is chosen here; the call never decides a side for anyone.
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
  const caller = invite.caller?.handle
    ? `@${invite.caller.handle}`
    : invite.caller?.name ?? 'Someone';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.background, borderColor: t.border }]}>
          <View style={styles.content}>
            <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
              {incomingCallHeadline(roomIndex)}
            </Text>
            <Text allowFontScaling={false} style={[styles.topic, { color: t.textPrimary }]}>
              {incomingCallTopic(invite.topicTitle)}
            </Text>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
              {incomingCallBody(invite.topicTitle, caller)}
            </Text>
            <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
              {invite.acceptingDebaters
                ? seconds !== null
                  ? `${seconds}s left to answer.`
                  : 'You were called into the battle.'
                : roomFullCopy()}
            </Text>

            {invite.acceptingDebaters ? (
              <>
                <Text allowFontScaling={false} style={[styles.stanceHint, { color: t.textMuted }]}>
                  JOIN BATTLE — pick your stance
                </Text>
                <View style={styles.stances}>
                  {(['AGREE', 'UNSURE', 'DISAGREE'] as const).map((stance) => (
                    <VaultActionButton
                      key={stance}
                      label={busy ? 'Joining…' : stance}
                      compact
                      onPress={() => onJoin(invite.inviteId, stance)}
                    />
                  ))}
                </View>
              </>
            ) : null}

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
  kicker: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  topic: {
    ...typeScale.display,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  body: { ...typeScale.meta, fontSize: 14, lineHeight: 20 },
  stanceHint: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: space.xs,
  },
  stances: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
