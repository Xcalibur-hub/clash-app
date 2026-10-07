import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { duelPresentation, duelResultTitle } from '../../utils/duelPresentation';
import type { ArenaPhase } from '../../services/liveArenaService';

function ballotShare(score: number, jurySize: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(jurySize) || jurySize <= 0) return null;
  return Math.round((score / jurySize) * 100);
}

/** Uses the canonical Clash ballot and verdict; no group Room tally. */
export function DuelRoomOutcome({ duel, phase, onJudge, onReview, onReturn }: {
  duel: ArenaDuel; phase: ArenaPhase; onJudge: (side: 'A' | 'B') => Promise<void>;
  onReview?: () => void; onReturn?: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recorded, setRecorded] = React.useState(false);
  const inFlight = React.useRef(false);
  const verdict = duel.verdict;
  const presentation = duelPresentation(duel, phase);
  const resultTitle = duelResultTitle(duel);
  const judgingOpen = presentation.canJudge && !recorded;
  const awaiting = !verdict && (duel.hasJudged || recorded || phase === 'closed');

  const headline = resultTitle
    ?? (duel.hasJudged || recorded
      ? 'Your ballot is recorded'
      : phase === 'judging'
        ? 'Who made the stronger case?'
        : phase === 'closed'
          ? 'Awaiting the verdict'
          : 'Judging opens after final arguments');

  const aPct = verdict?.sideAScore !== undefined && verdict.sideBScore !== undefined
    ? ballotShare(verdict.sideAScore, verdict.jurySize)
    : null;
  const bPct = verdict?.sideAScore !== undefined && verdict.sideBScore !== undefined
    ? ballotShare(verdict.sideBScore, verdict.jurySize)
    : null;

  const body = (
    <View style={[styles.wrap, { borderTopColor: t.border }]}>
      {verdict ? (
        <Text
          allowFontScaling={false}
          style={[styles.eyebrow, { color: t.textMuted }]}
          accessibilityRole="header"
        >
          VERDICT
        </Text>
      ) : judgingOpen ? (
        <Text
          allowFontScaling={false}
          style={[styles.eyebrow, { color: t.textMuted }]}
          accessibilityLiveRegion="polite"
        >
          JUDGING OPEN
        </Text>
      ) : null}

      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[styles.headline, { color: t.textPrimary }]}
      >
        {headline}
      </Text>

      {verdict ? (
        <View style={styles.scoreBlock}>
          {([
            { fighter: duel.fighterA, side: 'A' as const, score: verdict.sideAScore, pct: aPct },
            { fighter: duel.fighterB, side: 'B' as const, score: verdict.sideBScore, pct: bPct },
          ]).map(({ fighter, side, score, pct }) => (
            <View key={side} style={styles.scoreRow}>
              <View style={styles.scoreIdentity}>
                <Text numberOfLines={1} style={[styles.scoreName, { color: t.textPrimary }]}>
                  {fighter.name}
                </Text>
                <Text allowFontScaling={false} style={[styles.scoreSide, { color: t.textMuted }]}>
                  FIGHTER {side}
                </Text>
              </View>
              {pct !== null && score !== undefined ? (
                <Text allowFontScaling={false} style={[styles.scorePct, { color: t.textPrimary }]}>
                  {pct}%
                </Text>
              ) : null}
            </View>
          ))}
          <Text style={[styles.jury, { color: t.textMuted }]}>
            {verdict.jurySize} judgment{verdict.jurySize === 1 ? '' : 's'}
            {verdict.verdictLabel ? ` · ${verdict.verdictLabel}` : ''}
          </Text>
        </View>
      ) : (
        <Text style={[styles.support, { color: t.textSecondary }]}>
          {duel.status === 'cancelled'
            ? 'This Clash ended without an official verdict.'
            : duel.hasJudged || recorded
              ? 'Your judgement was submitted. Results appear after voting closes.'
              : presentation.side
                ? 'Fighters cannot judge their own Clash.'
                : phase === 'closed'
                  ? 'Voting has closed. The official verdict is being settled.'
                  : 'Official judgements decide the verdict. Reactions do not count as ballots.'}
        </Text>
      )}

      {judgingOpen ? (
        <View style={styles.choices}>
          {([
            { side: 'A' as const, fighter: duel.fighterA, position: duel.sourceText },
            { side: 'B' as const, fighter: duel.fighterB, position: duel.counterPosition },
          ]).map(({ side, fighter, position }) => (
            <Pressable
              key={side}
              accessibilityRole="button"
              accessibilityLabel={`Judge ${fighter.name}, Fighter ${side}, made the stronger case`}
              disabled={busy}
              accessibilityState={{ disabled: busy, busy }}
              style={({ pressed }) => [
                styles.choice,
                {
                  borderColor: t.borderStrong,
                  backgroundColor: pressed ? t.surfaceMuted : 'transparent',
                  opacity: busy ? 0.5 : 1,
                },
              ]}
              onPress={() => {
                if (inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                setError(null);
                void onJudge(side)
                  .then(() => setRecorded(true))
                  .catch(() => setError('Your ballot could not be confirmed. Please retry.'))
                  .finally(() => {
                    inFlight.current = false;
                    setBusy(false);
                  });
              }}
            >
              <Text numberOfLines={1} style={[styles.choiceName, { color: t.textPrimary }]}>
                {fighter.name}
              </Text>
              <Text numberOfLines={2} style={[styles.choicePosition, { color: t.textSecondary }]}>
                {position?.trim() || (side === 'A' ? 'Source Take' : 'Counter-position')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {(resultTitle || awaiting) && (onReview || onReturn) ? (
        <View style={styles.row}>
          {onReview ? (
            <Pressable style={styles.followUp} accessibilityRole="button" onPress={onReview}>
              <Text style={[styles.followUpText, { color: t.textPrimary }]}>Review transcript</Text>
            </Pressable>
          ) : null}
          {onReturn ? (
            <Pressable style={styles.followUp} accessibilityRole="button" onPress={onReturn}>
              <Text style={[styles.followUpText, { color: t.textPrimary }]}>Return to Arena</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={[styles.support, { color: t.textSecondary }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );

  if (verdict && !reduceMotion) {
    return <Animated.View entering={FadeIn.duration(280)}>{body}</Animated.View>;
  }
  return body;
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: space.lg,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headline: {
    ...typeScale.title,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  support: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 20,
  },
  scoreBlock: { gap: space.sm },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 44,
  },
  scoreIdentity: { flex: 1, minWidth: 0, gap: 2 },
  scoreName: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
  scoreSide: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  scorePct: {
    ...typeScale.data,
    fontSize: 22,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'right',
  },
  jury: {
    ...typeScale.caption,
    fontSize: 12,
    marginTop: space.xs,
  },
  choices: { gap: space.sm },
  choice: {
    minHeight: 56,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    gap: 4,
  },
  choiceName: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
  choicePosition: { ...typeScale.body, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  followUp: {
    minHeight: 44,
    paddingVertical: space.sm,
    paddingRight: space.md,
    justifyContent: 'center',
  },
  followUpText: { ...typeScale.label, fontSize: 14, fontWeight: '600' },
});
