import React from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type {
  ArenaMindshiftStats,
  ArenaResult,
  ArenaRoomViewer,
  Stance,
} from '../../services/liveArenaService';
import { analytics } from '../../services/analytics';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { arenaSidesForTheme } from '../../theme/arenaSides';
import { notify as hapticNotify, tap as hapticTap } from '../../utils/haptics';
import { AppText } from '../shared/AppText';
import { Avatar } from '../shared/Avatar';
import { GlowButton } from '../shared/GlowButton';
import { StanceChoiceRow } from './StanceChoiceRow';
import { STANCE_LABEL, winningSideLabel } from '../liveArena/liveArenaStyles';

/**
 * The verdict — the single, authoritative result experience.
 *
 * ## Why this is one component and not two
 *
 * Phase 2 shipped `VerdictRegion` *alongside* the existing
 * `LiveRoomResultReveal`, and the room rendered both. The settled screen opened
 * with a large "Side A" headline, and then, immediately below it, the same
 * outcome again as "Side A 62% / Agree took it — 62 of 100 judgements". Two
 * headlines for one result reads as a bug, because it is one: a new artifact was
 * stacked next to the old one instead of replacing it. That is the same failure
 * the Phase 1 review named.
 *
 * This component is the consolidation. It keeps **every** behaviour the old card
 * owned — share, Mindshift, best argument, the fighter's own recorded journey,
 * the final-stance prompt, the crowd moment, next-clash — and it adopts the
 * editorial result voice the region introduced. Nothing is duplicated because
 * there is now only one thing rendering a result.
 *
 * ## Data honesty
 *
 * Every number comes from `arena_room_results` via `ArenaResult`. The split is a
 * rendering of `agreeVotes` / `disagreeVotes`, never a client recount. The
 * Mindshift percentage stays hidden while it is null: "nobody finished" is not
 * the same claim as "0% moved", and the RPC enforces that distinction.
 *
 * ## What it will not do
 *
 * It does not invent a reward. Reputation is written by the settlement function
 * (`arena_participation` +10, `arena_winning_side` +25, `arena_best_argument`
 * +40), and the only authenticated read of that ledger is
 * `fetchReputationEvents` — a global, 100-row, profile-scoped list that cannot be
 * filtered to one room. Rather than guess what this room paid you, the result
 * states the best-argument award, which is a fact on the result row.
 */
export interface VerdictRegionProps {
  result: ArenaResult;
  /** Null until the room's Mindshift aggregate is readable. */
  stats: ArenaMindshiftStats | null;
  /** Null for a non-member reading a public result. */
  viewer: ArenaRoomViewer | null;
  topicTitle?: string | null;
  roomIndex?: number | null;
  /** Optional crowd moment from real pulse leaders. */
  crowdMoment?: { author: string | null; preview: string | null } | null;
  busy?: boolean;
  onRecordFinal: (stance: Stance) => void;
  /** Next Clash loop — Arena home / next battle. */
  onNextClash?: () => void;
  /**
   * True when the caller suppresses the share action (e.g. a nested surface that
   * already offers it). Defaults to false so the action is never silently lost.
   */
  hideShare?: boolean;
}

export function VerdictRegion({
  result,
  stats,
  viewer,
  topicTitle = null,
  roomIndex = null,
  crowdMoment = null,
  busy = false,
  onRecordFinal,
  onNextClash,
  hideShare = false,
}: VerdictRegionProps): React.JSX.Element {
  const t = useThemeColors();
  const sides = arenaSidesForTheme(t);
  const reduced = useReducedMotion();
  const phase = useSharedValue(reduced ? 1 : 0);
  const isDraw = result.winningSide === 'DRAW';

  const totalVotes = result.agreeVotes + result.disagreeVotes;
  const winnerVotes =
    result.winningSide === 'AGREE'
      ? result.agreeVotes
      : result.winningSide === 'DISAGREE'
        ? result.disagreeVotes
        : Math.max(result.agreeVotes, result.disagreeVotes);
  const winnerPercent = totalVotes > 0 ? Math.round((winnerVotes / totalVotes) * 100) : null;
  const agreeShare = totalVotes > 0 ? result.agreeVotes / totalVotes : null;
  const winnerTone =
    result.winningSide === 'AGREE' ? sides.a : result.winningSide === 'DISAGREE' ? sides.b : null;
  /** The winning SIDE's letter, so "Side A takes it" and the kicker cannot disagree. */
  const winnerKey = winnerTone?.key ?? null;

  // Mindshift: the stats RPC wins when readable, otherwise the result row's own
  // counter. Both are server values; neither is derived here.
  const changedPercent = stats?.changedPercent ?? result.mindshiftChangedPercent;
  const needsFinalStance =
    viewer !== null && viewer.role === 'debater' && viewer.stance !== null && viewer.finalStance === null;

  React.useEffect(() => {
    if (reduced) return;
    phase.value = withDelay(140, withTiming(1, { duration: 460 }));
    const timer = setTimeout(() => hapticNotify(isDraw ? 'warning' : 'success'), 560);
    return () => clearTimeout(timer);
  }, [isDraw, phase, reduced]);

  const revealed = useAnimatedStyle(() => ({
    opacity: phase.value,
    transform: [{ translateY: (1 - phase.value) * 10 }],
  }));

  const onShare = async (): Promise<void> => {
    hapticTap();
    const title = topicTitle?.trim() || 'Arena battle';
    const room = roomIndex != null ? `Room ${roomIndex}` : 'Room';
    const headline = isDraw ? 'DRAW' : `${winningSideLabel(result.winningSide).toUpperCase()} WON`;
    const pct = winnerPercent != null ? ` · ${winnerPercent}%` : '';
    const mind = changedPercent != null ? `\nMindshift ${changedPercent}%` : '';
    const best = result.bestArgumentBody
      ? `\nBest argument: "${result.bestArgumentBody.slice(0, 120)}"`
      : '';
    const message = `CLASH — ${title}\n${room} decided\n${headline}${pct}\n${result.participantCount.toLocaleString()} participated${mind}${best}\n\nWatch on CLASH.`;
    try {
      await Share.share({ message });
      analytics.track('arena_result_shared', { realm: 'arena' });
    } catch {
      /* dismissed */
    }
  };

  return (
    <Animated.View style={[styles.wrap, revealed]} testID="arena-verdict-region">
      {/* ── The outcome, stated once ─────────────────────────────────────── */}
      <View style={[styles.rule, { backgroundColor: winnerTone?.ink ?? t.textPrimary }]} />

      <AppText style={[typeScale.kicker, { color: t.textMuted }]}>
        {isDraw
          ? 'THE ROOM SPLIT'
          : winnerKey
            ? `SIDE ${winnerKey} TAKES IT${roomIndex != null ? ` · ROOM ${roomIndex}` : ''}`
            : 'VERDICT'}
      </AppText>

      {topicTitle ? (
        <AppText style={[typeScale.meta, { color: t.textSecondary }]} numberOfLines={2}>
          {topicTitle}
        </AppText>
      ) : null}

      <View style={styles.headline}>
        <AppText
          style={[
            typeScale.displayLg,
            styles.sideName,
            { color: winnerTone?.ink ?? t.textPrimary },
          ]}
          accessibilityRole="header"
        >
          {isDraw ? 'A draw' : winnerTone?.stanceLabel ?? winningSideLabel(result.winningSide)}
        </AppText>
        {!isDraw && winnerPercent !== null ? (
          <AppText fixed style={[typeScale.numeral, { color: winnerTone?.ink ?? t.textSecondary }]}>
            {`${winnerPercent}%`}
          </AppText>
        ) : null}
      </View>

      <AppText style={[typeScale.body, { color: t.textSecondary }]}>
        {isDraw
          ? totalVotes === 0
            ? 'Nobody cast a side vote.'
            : 'The room split evenly.'
          : `${winningSideLabel(result.winningSide)} took it — ${winnerVotes} of ${totalVotes} judgements.`}
      </AppText>

      {/*
        The split, as one bar. A 54/46 and a 90/10 are different stories and a bare
        percentage hides that. Hidden entirely when nobody voted, so the screen does
        not render an empty 50/50 that never happened.
      */}
      {agreeShare != null ? (
        <View
          style={styles.split}
          accessibilityRole="text"
          accessibilityLabel={`Ballot split: ${Math.round(agreeShare * 100)} percent ${sides.a.stanceLabel}, ${Math.round(
            (1 - agreeShare) * 100,
          )} percent ${sides.b.stanceLabel}`}
        >
          <View style={styles.splitBar}>
            <View style={{ flex: Math.max(agreeShare, 0.04), backgroundColor: sides.a.ink }} />
            <View style={{ flex: Math.max(1 - agreeShare, 0.04), backgroundColor: sides.b.ink }} />
          </View>
          <View style={styles.splitLegend}>
            <AppText style={[typeScale.meta, { color: sides.a.ink }]}>
              {`${Math.round(agreeShare * 100)}% ${sides.a.stanceLabel}`}
            </AppText>
            <AppText style={[typeScale.meta, { color: sides.b.ink }]}>
              {`${Math.round((1 - agreeShare) * 100)}% ${sides.b.stanceLabel}`}
            </AppText>
          </View>
        </View>
      ) : null}

      <AppText style={[typeScale.meta, { color: t.textMuted }]}>
        {`${result.participantCount.toLocaleString()} participants · ${totalVotes.toLocaleString()} judgements`}
      </AppText>

      {!hideShare || onNextClash ? (
        <View style={styles.actions}>
          {!hideShare ? (
            <GlowButton label="Share result" onPress={() => void onShare()} compact tone="glass" />
          ) : null}
          {onNextClash ? <GlowButton label="NEXT CLASH →" onPress={onNextClash} compact /> : null}
        </View>
      ) : null}

      {/* ── Best argument ─────────────────────────────────────────────────── */}
      {result.bestArgumentBody || result.bestArgumentAuthor ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(220).duration(260)}
          style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <View style={styles.cardHead}>
            <AppText style={[typeScale.kicker, { color: t.textMuted }]}>BEST ARGUMENT</AppText>
            {/* The award is a fact on the result row: +40 reputation at settlement. */}
            <AppText style={[typeScale.kicker, { color: t.gold }]}>+40 REP</AppText>
          </View>
          {result.bestArgumentAuthor ? (
            <View style={styles.authorRow}>
              <Avatar
                name={result.bestArgumentAuthor.name}
                tint={result.bestArgumentAuthor.avatarTint}
                size={24}
              />
              <AppText style={[typeScale.label, { color: t.textPrimary }]}>
                {result.bestArgumentAuthor.name}
              </AppText>
            </View>
          ) : null}
          {result.bestArgumentBody ? (
            <AppText style={[typeScale.body, { color: t.textPrimary }]}>
              {`“${result.bestArgumentBody}”`}
            </AppText>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ── Mindshift, aggregate only ─────────────────────────────────────── */}
      {changedPercent !== null ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(320).duration(260)}
          style={[styles.card, { backgroundColor: t.surfaceSunken, borderColor: t.border }]}
        >
          <AppText style={[typeScale.kicker, { color: t.textMuted }]}>BIGGEST MINDSHIFT</AppText>
          <AppText style={[typeScale.numeral, { color: t.textPrimary }]}>{`${changedPercent}%`}</AppText>
          <AppText style={[typeScale.meta, { color: t.textSecondary }]}>
            changed their mind in this room
          </AppText>
        </Animated.View>
      ) : null}

      {/* ── The crowd's moment ────────────────────────────────────────────── */}
      {crowdMoment?.preview ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(360).duration(260)}
          style={[styles.card, { backgroundColor: t.surfaceSunken, borderColor: t.borderStrong }]}
        >
          <AppText style={[typeScale.kicker, { color: t.textMuted }]}>CROWD MOMENT</AppText>
          {crowdMoment.author ? (
            <AppText style={[typeScale.label, { color: t.textPrimary }]}>{crowdMoment.author}</AppText>
          ) : null}
          {crowdMoment.preview ? (
            <AppText style={[typeScale.body, { color: t.textPrimary }]}>
              {`“${crowdMoment.preview}”`}
            </AppText>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ── The viewer's own record ───────────────────────────────────────── */}
      {needsFinalStance ? (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <StanceChoiceRow
            prompt="Where do you stand now?"
            disabled={busy}
            onChoose={onRecordFinal}
          />
          <AppText style={[typeScale.meta, { color: t.textMuted }]}>
            Recorded once, and only as an aggregate. Nobody sees your answer.
          </AppText>
        </View>
      ) : viewer?.finalStance && viewer.stance ? (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <AppText style={[typeScale.kicker, { color: t.textMuted }]}>YOUR JOURNEY</AppText>
          <AppText style={[typeScale.section, { color: t.textPrimary }]}>
            {STANCE_LABEL[viewer.stance]} → {STANCE_LABEL[viewer.finalStance]}
          </AppText>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  rule: { width: 32, height: 3, borderRadius: 2, marginBottom: space.sm },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  sideName: { textTransform: 'none' },
  split: { gap: 6, marginTop: space.xxs },
  splitBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  splitLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  actions: { marginTop: space.sm, gap: space.xs },
  card: {
    marginTop: space.sm,
    padding: space.md,
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
