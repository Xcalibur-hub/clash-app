import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { duelPresentation, duelResultTitle } from '../../utils/duelPresentation';
import type { ArenaPhase } from '../../services/liveArenaService';

/** Uses the canonical Clash ballot and verdict; no group Room tally. */
export function DuelRoomOutcome({ duel, phase, onJudge, onReview, onReturn }: {
  duel: ArenaDuel; phase: ArenaPhase; onJudge: (side: 'A' | 'B') => Promise<void>;
  onReview?: () => void; onReturn?: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recorded, setRecorded] = React.useState(false);
  const inFlight = React.useRef(false);
  const verdict = duel.verdict;
  const presentation = duelPresentation(duel, phase);
  const resultTitle = duelResultTitle(duel);
  const line = resultTitle ?? (duel.hasJudged || recorded ? 'Your ballot is recorded'
    : phase === 'judging' ? 'Who made the stronger case?'
    : phase === 'closed' ? 'Awaiting the verdict' : 'Judging opens after final arguments');
  return <View style={styles.wrap}>
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[typeScale.title, { color: t.textPrimary }]}>{line}</Text>
    {verdict ? <>
      <Text style={[typeScale.body, { color: t.textSecondary }]}>{duel.fighterA.name} · Fighter A / {duel.fighterB.name} · Fighter B</Text>
      <Text style={[typeScale.caption, { color: t.textSecondary }]}>Official verdict · {verdict.verdictLabel} · {verdict.jurySize} ballots</Text>
      {verdict.sideAScore !== undefined && verdict.sideBScore !== undefined && <Text style={[typeScale.body, { color: t.textPrimary }]}>
        {duel.fighterA.name}: {verdict.sideAScore} · {duel.fighterB.name}: {verdict.sideBScore}
      </Text>}
    </> : <Text style={[typeScale.caption, { color: t.textSecondary }]}>
      {duel.status === 'cancelled' ? 'This Clash ended without an official verdict.'
        : duel.hasJudged || recorded ? 'Your judgement was submitted. Results appear after voting closes.'
        : presentation.side ? 'Fighters cannot judge their own Clash.'
        : phase === 'closed' ? 'Voting has closed. The official verdict is being settled.'
        : 'Official judgements decide the verdict. Reactions do not count as ballots.'}
    </Text>}
    {presentation.canJudge && !recorded ? <View style={styles.row}>
      {(['A', 'B'] as const).map(side => <Pressable key={side} accessibilityRole="button"
        accessibilityLabel={`Judge ${side === 'A' ? duel.fighterA.name : duel.fighterB.name}, Fighter ${side}, made the stronger case`} disabled={busy}
        accessibilityState={{ disabled: busy, busy }}
        style={[styles.button, { borderColor: t.borderStrong, opacity: busy ? 0.5 : 1 }]}
        onPress={() => {
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(true); setError(null);
          void onJudge(side).then(() => setRecorded(true))
            .catch(() => setError('Your ballot could not be confirmed. Please retry.'))
            .finally(() => { inFlight.current = false; setBusy(false); });
        }}>
        <Text style={[typeScale.label, { color: t.textPrimary }]}>
          {side === 'A' ? duel.fighterA.name : duel.fighterB.name}
        </Text>
      </Pressable>)}
    </View> : null}
    {resultTitle && <View style={styles.row}>
      {onReview && <Pressable style={styles.followUp} accessibilityRole="button" onPress={onReview}><Text style={{ color: t.textPrimary }}>Review transcript</Text></Pressable>}
      {onReturn && <Pressable style={styles.followUp} accessibilityRole="button" onPress={onReturn}><Text style={{ color: t.textPrimary }}>Return to Arena</Text></Pressable>}
    </View>}
    {error ? <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { paddingVertical: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  followUp: { minHeight: 44, paddingVertical: space.sm, paddingRight: space.md, justifyContent: 'center' },
  button: { flex: 1, minHeight: 44, padding: space.sm, borderWidth: 1, borderRadius: 8, justifyContent: 'center' },
});
