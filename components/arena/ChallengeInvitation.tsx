import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { arena, arenaColors } from '../../theme/arena';
import { useThemeColors } from '../../theme';
import type { ArenaChallenge } from '../../utils/arenaChallengePayload';
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
export function ChallengeInvitation({ challenge, takeText, remaining, busy, eligible, error, onAccept, onPass }: ChallengeInvitationProps): React.JSX.Element {
  const c = arenaColors(useThemeColors());
  return <View style={{ flex: 1, minHeight: 0 }} accessibilityLabel="Challenge invitation">
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[arena.type.eyebrow, { color: c.muted }]}>A DIFFERENT PERSPECTIVE</Text>
      <Text accessibilityRole="header" style={[arena.type.heading, { color: c.ink, fontSize: 20, lineHeight: 26 }]}>{challenge ? 'Your Take started a conversation.' : 'You’re all caught up.'}</Text>
      {challenge ? <>
        <View style={[styles.identity, { borderColor: c.line }]}><Avatar name={challenge.challenger.name} tint="#73849A" size={44} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={[arena.type.heading, { color: c.ink, fontSize: 16 }]}>{challenge.challenger.name}</Text><Text numberOfLines={1} style={[arena.type.meta, { color: c.secondary }]}>@{challenge.challenger.handle}</Text></View><ArenaBadge>{challenge.status}</ArenaBadge></View>
        <View style={[styles.source, { borderColor: c.line }]}><Text style={[arena.type.eyebrow, { color: c.muted }]}>YOUR TAKE</Text><Text style={[arena.type.body, { color: c.secondary }]}>{takeText}</Text></View>
        <Text style={[arena.type.eyebrow, { color: '#A95F57' }]}>THE COUNTERPOSITION</Text><Text selectable style={[arena.type.body, { color: c.ink, fontSize: 17, lineHeight: 25 }]}>{challenge.counterPosition}</Text>
        <Text style={[arena.type.meta, { color: c.muted }]}>{eligible ? 'Accept to enter a live 1v1. Only you two can publish official arguments.' : 'This invitation is no longer actionable. Discussion and history remain available.'}</Text>
      </> : <Text style={[arena.type.body, { color: c.secondary }]}>New invitations will appear here. Nothing has been accepted.</Text>}
    </ScrollView>
    <View style={[styles.actions, { borderTopColor: c.line, backgroundColor: c.page }]}>
      {error ? <Text accessibilityRole="alert" style={[arena.type.label, { color: c.ink }]}>{error}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={[arena.type.meta, { color: c.secondary }]}>{busy ? 'Waiting for confirmation…' : remaining ? `${remaining} invitation${remaining === 1 ? '' : 's'} · One decision at a time` : 'No pending invitations'}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}><ArenaButton label="Pass" accessibilityLabel="Pass on this challenge" disabled={busy || !challenge || !eligible} onPress={onPass} style={{ flex: 1 }} /><ArenaButton label={busy ? 'Confirming…' : 'Accept challenge'} accessibilityLabel="Accept this challenge" variant="primary" disabled={busy || !challenge || !eligible} onPress={onAccept} style={{ flex: 1 }} /></View>
      <Text style={[arena.type.meta, { color: c.muted }]}>Your Room opens once acceptance is confirmed.</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center', paddingBottom: 24 }, identity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth }, source: { borderLeftWidth: 2, paddingLeft: 14, gap: 8 }, actions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 } });
