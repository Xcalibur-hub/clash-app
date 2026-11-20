import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ArenaRoomText as Text } from './ArenaRoomText';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { duelPresentation, duelResultTitle } from '../../utils/duelPresentation';
import type { ArenaPhase } from '../../services/liveArenaService';
import { judge as hapticJudge } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { VerdictReveal } from './VerdictReveal';
import { NextClashAction, type NextClashSuggestion } from './NextClashAction';
import { nextClashActionVisible } from '../../utils/nextClashNotice';
import { VERDICT_IS_NOT_SUPPORT } from '../../utils/verdictPresentation';
import { useDuelBallot } from './useDuelBallot';
import { ResultRefresh } from './ResultRefresh';

/** Uses the canonical Clash ballot and verdict; no group Room tally. */
export function DuelRoomOutcome({ duel, phase, roomId, topicTitle, onJudge, onRefreshResult, onReview, onReturn, nextClash = null, nextBusy = false, nextNotice = null, onOpenNext, revealMotion = false }: {
  duel: ArenaDuel; phase: ArenaPhase; roomId?: string; topicTitle?: string; onJudge: (side: 'A' | 'B') => Promise<void>;
  onReview?: () => void; onReturn?: () => void;
  onRefreshResult?: () => Promise<void>;
  revealMotion?: boolean;
  /** One live Clash from existing discovery, or null when none is eligible. */
  nextClash?: NextClashSuggestion | null; nextBusy?: boolean; nextNotice?: string | null; onOpenNext?: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const ballot = useDuelBallot(duel.clashId, onJudge);
  const busy = ballot.busy, recorded = ballot.status === 'confirmed';
  const error = ballot.status === 'unknown' ? 'Your ballot outcome is unknown. Verify it before submitting again.'
    : ballot.status === 'rejected' ? 'The server rejected your request. You may try again if judging is still open.' : null;
  const verdict = duel.verdict;
  const presentation = duelPresentation(duel, phase);
  const resultTitle = duelResultTitle(duel);
  const judgingOpen = presentation.canJudge && !recorded;
  const awaiting = !verdict && (duel.hasJudged || recorded || phase === 'closed');

  if (verdict || duel.status === 'cancelled') {
    return (
      <View
        style={[styles.wrap, { borderTopColor: t.border }]}
        collapsable={false}
        testID={`arena-outcome:${duel.clashId}:${roomId ?? 'unknown'}:${duel.status}:${phase}`}
      >
        <VerdictReveal duel={duel} visible={revealMotion} roomId={roomId} topicTitle={topicTitle} />
        {nextClashActionVisible({ hasVerdict: Boolean(verdict), hasSuggestion: Boolean(nextClash), notice: nextNotice }) ? (
          <NextClashAction clash={nextClash} busy={nextBusy} notice={nextNotice} onOpen={onOpenNext ?? (() => undefined)} />
        ) : null}
        {(resultTitle || duel.status === 'cancelled') && (onReview || onReturn) ? (
          <View style={styles.row}>
            {onReview ? (
              <PressableScale style={styles.followUp} accessibilityRole="button" accessibilityLabel="Review transcript" onPress={onReview}>
                <Text style={[styles.followUpText, { color: t.textPrimary }]}>Review transcript</Text>
              </PressableScale>
            ) : null}
            {onReturn ? (
              <PressableScale style={styles.followUp} accessibilityRole="button" accessibilityLabel="Return to Arena" onPress={onReturn}>
                <Text style={[styles.followUpText, { color: t.textPrimary }]}>Return to Arena</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const resultUnavailable = duel.status === 'settled' && !verdict;
  const headline = resultUnavailable ? 'Official result unavailable' : phase === 'closed'
    ? 'Settlement pending'
    : duel.hasJudged || recorded
    ? 'Your ballot is recorded'
    : phase === 'judging'
      ? 'Who made the stronger case?'
      : 'Judging opens after final arguments';

  return (
    <View
      style={[styles.wrap, { borderTopColor: t.border }]}
      collapsable={false}
      testID={`arena-outcome:${duel.clashId}:${roomId ?? 'unknown'}:${duel.status}:${phase}`}
    >
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
        key={`outcome-heading:${fontScale}`}
        entering={reduceMotion || !judgingOpen ? undefined : FadeInDown.delay(40).springify().damping(16)}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[styles.headline, { color: t.textPrimary }]}
      >
        {headline}
      </Animated.Text>

      <Text style={[styles.support, { color: t.textSecondary }]}>
        {resultUnavailable ? 'The official result is unavailable. You can review the visible transcript.' : phase === 'closed'
          ? presentation.hint
          : duel.hasJudged || recorded
          ? 'Your judgement was submitted. Results appear after voting closes.'
          : presentation.side
            ? 'Fighters cannot judge their own Clash.'
            : VERDICT_IS_NOT_SUPPORT}
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
              disabled={ballot.locked}
              accessibilityState={{ disabled: ballot.locked, busy }}
              style={[
                styles.choice,
                {
                  borderColor: t.borderStrong,
                  opacity: ballot.locked ? 0.5 : 1,
                },
              ]}
              onPress={() => {
                if (ballot.locked) return;
                hapticJudge();
                void ballot.submit(side);
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
            <PressableScale style={styles.followUp} accessibilityRole="button" accessibilityLabel="Review transcript" onPress={onReview}>
              <Text style={[styles.followUpText, { color: t.textPrimary }]}>Review transcript</Text>
            </PressableScale>
          ) : null}
          {onReturn ? (
            <PressableScale style={styles.followUp} accessibilityRole="button" accessibilityLabel="Return to Arena" onPress={onReturn}>
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
      {recorded ? <Text style={[styles.support, { color: t.textPrimary }]}>Your recorded ballot: Side {ballot.side}</Text> : null}
      {ballot.status === 'unknown' ? <PressableScale accessibilityRole="button" accessibilityLabel="Verify recorded ballot"
        disabled={busy} accessibilityState={{ disabled: busy, busy }} style={styles.followUp}
        onPress={() => void ballot.reconcile()}><Text style={[styles.followUpText, { color: t.textPrimary }]}>Verify recorded ballot</Text></PressableScale> : null}
      {(phase === 'closed' || resultUnavailable) && onRefreshResult ? <ResultRefresh onRefresh={onRefreshResult} /> : null}
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
