import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ArenaMessage, ArenaRoom } from '../../services/liveArenaService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { judge as hapticJudge, tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { secondsLabel, softFill } from './liveArenaStyles';

/** How many recent arguments the best-argument picker offers. */
const CANDIDATE_LIMIT = 12;

export interface LiveRoomJudgingPanelProps {
  room: ArenaRoom;
  /** Newest-first thread; the panel picks its own candidates out of it. */
  messages: readonly ArenaMessage[];
  busy?: boolean;
  onVoteSide: (side: 'AGREE' | 'DISAGREE') => void;
  onVoteArgument: (messageId: string) => void;
}

/**
 * Judging: one side vote and one best-argument vote, each cast once.
 *
 * Both ballots stay private until the room settles — there is no running tally
 * here, by design. Own arguments and system notices are filtered out of the
 * picker because the server refuses those votes anyway.
 */
export function LiveRoomJudgingPanel({
  room,
  messages,
  busy = false,
  onVoteSide,
  onVoteArgument,
}: LiveRoomJudgingPanelProps): React.JSX.Element {
  const t = useThemeColors();
  const [picked, setPicked] = React.useState<string | null>(null);
  const viewer = room.viewer;
  const hasSideVote = viewer?.hasSideVote === true;
  const hasArgumentVote = viewer?.hasArgumentVote === true;
  const isDebater = viewer?.role === 'debater';

  const candidates = React.useMemo(
    () =>
      messages
        .filter((message) => message.kind !== 'system' && !message.isOwn && !message.pending)
        .slice(0, CANDIDATE_LIMIT),
    [messages],
  );

  if (!viewer) {
    return (
      <View style={[styles.panel, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          JUDGING
        </Text>
        <Text allowFontScaling={false} style={[styles.note, { color: t.textSecondary }]}>
          This room is being judged by the people who argued in it.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: t.surfaceElevated,
          borderColor: t.border,
          shadowColor: t.shadowColor,
        },
      ]}
    >
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          JUDGE THIS CLASH
        </Text>
        {room.secondsRemaining > 0 ? (
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textPrimary }]}>
            {secondsLabel(room.secondsRemaining)} left
          </Text>
        ) : null}
      </View>

      <Text allowFontScaling={false} style={[styles.ceremony, { color: t.textPrimary }]}>
        Who made the better case?
      </Text>
      <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
        This is judgement — not a reaction. Ballots stay private until the room settles.
      </Text>

      {!isDebater ? (
        <Text allowFontScaling={false} style={[styles.note, { color: t.textSecondary }]}>
          Only fighters vote in this room. Keep watching the ceremony.
        </Text>
      ) : (
        <>
          <Text allowFontScaling={false} style={[styles.question, { color: t.textPrimary }]}>
            WHO COOKED?
          </Text>
          {hasSideVote ? (
            <Text allowFontScaling={false} style={[styles.recorded, { color: t.textMuted }]}>
              Your judgement is in. Results open when the room settles.
            </Text>
          ) : (
            <View style={styles.sides}>
              <SideButton
                label="Side A · Agree"
                disabled={busy}
                onPress={() => {
                  hapticJudge();
                  onVoteSide('AGREE');
                }}
              />
              <SideButton
                label="Side B · Disagree"
                disabled={busy}
                onPress={() => {
                  hapticJudge();
                  onVoteSide('DISAGREE');
                }}
              />
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <Text allowFontScaling={false} style={[styles.question, { color: t.textPrimary }]}>
            Best argument
          </Text>
          {hasArgumentVote ? (
            <Text allowFontScaling={false} style={[styles.recorded, { color: t.textMuted }]}>
              Your best-argument vote is in.
            </Text>
          ) : candidates.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.recorded, { color: t.textMuted }]}>
              Nothing to pick yet — you cannot vote for your own argument.
            </Text>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {candidates.map((message) => {
                  const selected = picked === message.id;
                  return (
                    <Pressable
                      key={message.id}
                      onPress={() => {
                        hapticTap();
                        setPicked(selected ? null : message.id);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Argument by ${message.author?.name ?? 'someone'}`}
                      style={[
                        styles.candidate,
                        {
                          backgroundColor: selected ? softFill(t) : 'transparent',
                          borderColor: selected ? t.borderStrong : t.border,
                        },
                      ]}
                    >
                      <View style={styles.candidateHead}>
                        <Avatar
                          name={message.author?.name ?? 'Someone'}
                          tint={message.author?.avatarTint ?? '#71717A'}
                          size={20}
                        />
                        <Text
                          allowFontScaling={false}
                          numberOfLines={1}
                          style={[styles.candidateName, { color: t.textSecondary }]}
                        >
                          {message.author?.name ?? 'Someone'}
                        </Text>
                      </View>
                      <Text
                        allowFontScaling={false}
                        numberOfLines={4}
                        style={[styles.candidateBody, { color: t.textPrimary }]}
                      >
                        {message.body || 'Attachment'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                onPress={() => {
                  if (!picked) return;
                  hapticJudge();
                  onVoteArgument(picked);
                }}
                disabled={!picked || busy}
                accessibilityRole="button"
                accessibilityLabel="Submit best argument vote"
                style={[
                  styles.submit,
                  { backgroundColor: t.pill },
                  (!picked || busy) && styles.off,
                ]}
              >
                <Text allowFontScaling={false} style={[styles.submitText, { color: t.pillText }]}>
                  Lock in best argument
                </Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}

function SideButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Vote ${label}`}
      style={[
        styles.side,
        { backgroundColor: t.surfaceMuted, borderColor: t.borderStrong },
        disabled && styles.off,
      ]}
    >
      <Text allowFontScaling={false} style={[styles.sideText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: layout.screenX,
    marginTop: space.sm,
    padding: space.lg,
    gap: space.sm,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  ceremony: { ...typeScale.meta, fontSize: 12, lineHeight: 17, marginBottom: 2 },
  meta: { ...typeScale.caption, fontSize: 11, fontWeight: '700' },
  question: { ...typeScale.label, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  note: { ...typeScale.meta, fontSize: 13 },
  recorded: { ...typeScale.caption, fontSize: 11, lineHeight: 16 },
  sides: { flexDirection: 'row', gap: space.sm },
  side: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sideText: {
    ...typeScale.button,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  rail: { gap: space.xs, paddingVertical: 2, paddingRight: space.xs },
  candidate: {
    width: 190,
    gap: 6,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  candidateHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  candidateName: { ...typeScale.caption, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  candidateBody: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  submit: {
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    marginTop: 2,
  },
  submitText: { ...typeScale.button, fontSize: 15, fontWeight: '700' },
  off: { opacity: 0.4 },
});
