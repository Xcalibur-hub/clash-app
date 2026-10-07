import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';

/** Uses the canonical Clash ballot and verdict; no group Room tally. */
export function DuelRoomOutcome({ duel, phase, onJudge }: {
  duel: ArenaDuel; phase: string; onJudge: (side: 'A' | 'B') => Promise<void>;
}): React.JSX.Element {
  const t = useThemeColors();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const verdict = duel.verdict;
  const line = verdict
    ? `${verdict.winnerSide === 'DRAW' ? 'Draw' : `${verdict.winnerSide === 'A' ? duel.fighterA.name : duel.fighterB.name} wins`} · ${verdict.verdictLabel} · ${verdict.jurySize} ballots`
    : duel.status === 'cancelled' ? 'Duel cancelled — no verdict'
    : duel.hasJudged ? 'Your ballot is recorded'
    : duel.mayJudge ? 'Who made the stronger case?'
    : phase === 'closed' ? 'Awaiting the verdict'
    : phase === 'judging' ? 'Public judging in progress'
    : 'Public judging opens after final arguments.';
  return <View style={styles.wrap}>
    <Text accessibilityLiveRegion="polite" style={[typeScale.label, { color: t.textPrimary }]}>{line}</Text>
    {duel.mayJudge ? <View style={styles.row}>
      {(['A', 'B'] as const).map(side => <Pressable key={side} accessibilityRole="button"
        accessibilityLabel={`Judge Fighter ${side}`} disabled={busy}
        style={[styles.button, { borderColor: t.borderStrong, opacity: busy ? 0.5 : 1 }]}
        onPress={() => {
          setBusy(true); setError(null);
          void onJudge(side).catch(e => setError(e instanceof Error ? e.message : 'Ballot could not be recorded'))
            .finally(() => setBusy(false));
        }}>
        <Text style={[typeScale.label, { color: t.textPrimary }]}>
          {side === 'A' ? duel.fighterA.name : duel.fighterB.name}
        </Text>
      </Pressable>)}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  button: { flex: 1, minHeight: 44, padding: space.sm, borderWidth: 1, borderRadius: 8, justifyContent: 'center' },
});
