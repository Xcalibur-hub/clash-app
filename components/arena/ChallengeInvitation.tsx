import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { arena, arenaColors } from '../../theme/arena';
import { useThemeColors } from '../../theme';
import type { ArenaChallenge } from '../../utils/arenaChallengePayload';
import {
  challengeActionAccessibility,
  challengeEligibilityCopy,
  challengeInvitationHeadline,
  challengeRemainingCopy,
  challengeStatusPresentation,
} from '../../utils/challengePresentation';
import { ArenaBadge, ArenaButton } from './ui/ArenaPrimitives';
import { Avatar } from '../shared/Avatar';

export interface ChallengeInvitationProps {
  challenge: ArenaChallenge | null;
  takeText: string;
  remaining: number;
  busy: boolean;
  eligible: boolean;
  error?: string | null;
  onAccept: () => void;
  onPass: () => void;
}

/** Shared by the real full-screen deck and the development-only local demo. */
export function ChallengeInvitation({
  challenge,
  takeText,
  remaining,
  busy,
  eligible,
  error,
  onAccept,
  onPass,
}: ChallengeInvitationProps): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  const status = challenge ? challengeStatusPresentation(challenge.status) : null;
  const acceptA11y = challengeActionAccessibility('accept');
  const passA11y = challengeActionAccessibility('pass');
  const actionsEnabled = Boolean(challenge) && eligible && !busy;

  return (
    <View style={styles.root} accessibilityLabel="Challenge invitation">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[arena.type.eyebrow, { color: c.muted }]}>A DIFFERENT PERSPECTIVE</Text>
        <Text
          accessibilityRole="header"
          style={[arena.type.heading, styles.headline, { color: c.ink }]}
        >
          {challengeInvitationHeadline(Boolean(challenge))}
        </Text>

        {challenge && status ? (
          <>
            <View style={[styles.identity, { borderColor: c.line }]}>
              <Avatar name={challenge.challenger.name} tint="#73849A" size={48} />
              <View style={styles.identityCopy}>
                <Text style={[arena.type.eyebrow, { color: c.muted }]}>CHALLENGER</Text>
                <Text numberOfLines={2} style={[arena.type.heading, styles.name, { color: c.ink }]}>
                  {challenge.challenger.name}
                </Text>
                <Text numberOfLines={1} style={[arena.type.meta, { color: c.secondary }]}>
                  @{challenge.challenger.handle}
                </Text>
              </View>
              <ArenaBadge>{status.label}</ArenaBadge>
            </View>

            <Text style={[arena.type.meta, { color: c.muted }]}>{status.summary}</Text>

            <View style={[styles.source, { borderColor: c.line }]}>
              <Text style={[arena.type.eyebrow, { color: c.muted }]}>YOUR TAKE</Text>
              <Text style={[arena.type.body, { color: c.secondary }]}>{takeText}</Text>
            </View>

            <View style={styles.counter}>
              <Text style={[arena.type.eyebrow, { color: '#A95F57' }]}>THE COUNTERPOSITION</Text>
              <Text
                selectable
                style={[arena.type.body, styles.counterBody, { color: c.ink }]}
              >
                {challenge.counterPosition}
              </Text>
              <Text style={[arena.type.meta, { color: c.muted }]}>
                Opposing fighter · @{challenge.challenger.handle}
              </Text>
            </View>

            <Text style={[arena.type.meta, { color: c.muted }]}>
              {challengeEligibilityCopy(eligible)}
            </Text>
          </>
        ) : (
          <Text style={[arena.type.body, { color: c.secondary }]}>
            New invitations will appear here. Nothing has been accepted.
          </Text>
        )}
      </ScrollView>

      <View style={[styles.actions, { borderTopColor: c.line, backgroundColor: c.page }]}>
        {error ? (
          <Text accessibilityRole="alert" style={[arena.type.label, { color: c.ink }]}>
            {error}
          </Text>
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          style={[arena.type.meta, { color: c.secondary }]}
        >
          {challengeRemainingCopy(remaining, busy)}
        </Text>
        <View style={styles.actionRow}>
          <ArenaButton
            label="Pass"
            accessibilityLabel={passA11y.label}
            disabled={!actionsEnabled}
            onPress={onPass}
            style={styles.actionBtn}
          />
          <ArenaButton
            label={busy ? 'Confirming…' : 'Accept challenge'}
            accessibilityLabel={acceptA11y.label}
            variant="primary"
            disabled={!actionsEnabled}
            onPress={onAccept}
            style={styles.actionBtn}
          />
        </View>
        <Text style={[arena.type.meta, { color: c.muted }]}>
          Swipe right to accept · swipe left to pass · or use the buttons above.
        </Text>
        <Text style={[arena.type.meta, { color: c.muted }]}>
          Your Room opens once acceptance is confirmed.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  content: {
    padding: 16,
    gap: 12,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 24,
  },
  headline: { fontSize: 20, lineHeight: 26 },
  identity: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16 },
  source: { borderLeftWidth: 2, paddingLeft: 14, gap: 8 },
  counter: { gap: 8 },
  counterBody: { fontSize: 17, lineHeight: 25 },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, minHeight: 48 },
});
