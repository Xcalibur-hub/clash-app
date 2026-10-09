import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { duelPresentation, duelResultTitle } from '../../utils/duelPresentation';
import type { ArenaPhase } from '../../services/liveArenaService';
import { judge as hapticJudge } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { VerdictReveal } from './VerdictReveal';

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

  if (verdict || duel.status === 'cancelled') {
    return (
      <View style={[styles.wrap, { borderTopColor: t.border }]}>
        <VerdictReveal duel={duel} />
        {(resultTitle || duel.status === 'cancelled') && (onReview || onReturn) ? (
          <View style={styles.row}>
            {onReview ? (
              <PressableScale style={styles.followUp} accessibilityRole="button" onPress={onReview}>
                <Text style={[styles.followUpText, { color: t.textPrimary }]}>Review transcript</Text>
              </PressableScale>
            ) : null}
            {onReturn ? (
              <PressableScale style={styles.followUp} accessibilityRole="button" onPress={onReturn}>
                <Text style={[styles.followUpText, { color: t.textPrimary }]}>Return to Arena</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const headline = phase === 'closed'
    ? 'Settlement pending'
    : duel.hasJudged || recorded
    ? 'Your ballot is recorded'
    : phase === 'judging'
      ? 'Who made the stronger case?'
      : 'Judging opens after final arguments';

  return (
    <View style={[styles.wrap, { borderTopColor: t.border }]}>
      {judgingOpen ? (
        <Animated.Text
          entering={reduceMotion ? undefined : FadeInDown.duration(260)}
          allowFontScaling={false}
          style={[styles.eyebrow, { color: t.textMuted }]}
          accessibilityLiveRegion="polite"
        >
          JUDGING OPEN
        </Animated.Text>
      ) : null}

      <Animated.Text
        entering={reduceMotion || !judgingOpen ? undefined : FadeInDown.delay(40).springify().damping(16)}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[styles.headline, { color: t.textPrimary }]}
      >
        {headline}
      </Animated.Text>

      <Text style={[styles.support, { color: t.textSecondary }]}>
        {phase === 'closed'
          ? presentation.hint
          : duel.hasJudged || recorded
          ? 'Your judgement was submitted. Results appear after voting closes.'
          : presentation.side
            ? 'Fighters cannot judge their own Clash.'
            : 'Official judgements decide the verdict. Reactions do not count as ballots.'}
      </Text>

      {judgingOpen ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.delay(100).springify().damping(18)}
          style={styles.choices}
        >
          {([
            { side: 'A' as const, fighter: duel.fighterA, position: duel.sourceText },
            { side: 'B' as const, fighter: duel.fighterB, position: duel.counterPosition },
          ]).map(({ side, fighter, position }) => (
            <PressableScale
              key={side}
              accessibilityRole="button"
              accessibilityLabel={`Judge ${fighter.name}, Fighter ${side}, made the stronger case`}
              disabled={busy}
              accessibilityState={{ disabled: busy, busy }}
              style={[
                styles.choice,
                {
                  borderColor: t.borderStrong,
                  opacity: busy ? 0.5 : 1,
                },
              ]}
              onPress={() => {
                if (inFlight.current) return;
                inFlight.current = true;
                hapticJudge();
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
            </PressableScale>
          ))}
        </Animated.View>
      ) : null}

      {awaiting && (onReview || onReturn) ? (
        <View style={styles.row}>
          {onReview ? (
            <PressableScale style={styles.followUp} accessibilityRole="button" onPress={onReview}>
              <Text style={[styles.followUpText, { color: t.textPrimary }]}>Review transcript</Text>
            </PressableScale>
          ) : null}
          {onReturn ? (
            <PressableScale style={styles.followUp} accessibilityRole="button" onPress={onReturn}>
              <Text style={[styles.followUpText, { color: t.textPrimary }]}>Return to Arena</Text>
            </PressableScale>
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  support: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 20,
  },
  choices: { gap: space.sm },
  choice: {
    minHeight: 64,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    gap: 4,
  },
  choiceName: { ...typeScale.label, fontSize: 17, fontWeight: '700' },
  choicePosition: { ...typeScale.body, fontSize: 14, lineHeight: 19 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  followUp: {
    minHeight: 44,
    paddingVertical: space.sm,
    paddingRight: space.md,
    justifyContent: 'center',
  },
  followUpText: { ...typeScale.label, fontSize: 14, fontWeight: '600' },
});
