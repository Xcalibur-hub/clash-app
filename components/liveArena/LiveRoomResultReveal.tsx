import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
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
import { notify as hapticNotify, tap as hapticTap } from '../../utils/haptics';
import { StanceChoiceRow } from '../arena/StanceChoiceRow';
import { Avatar } from '../shared/Avatar';
import { GlowButton } from '../shared/GlowButton';
import { ClashMatchupBar } from './ClashMatchupBar';
import { softFill, STANCE_LABEL, winningSideLabel } from './liveArenaStyles';
import { arenaSidesForTheme } from '../../theme/arenaSides';

export interface LiveRoomResultRevealProps {
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
}

/**
 * The verdict, as the server settled it.
 *
 * Every number here comes from `arena_room_results` — the share bar is a
 * rendering of `agreeVotes` / `disagreeVotes`, not a client recount. The
 * Mindshift line stays hidden while `mindshiftChangedPercent` is null: nobody
 * finishing is not the same claim as nobody moving.
 */
export function LiveRoomResultReveal({
  result,
  stats,
  viewer,
  topicTitle = null,
  roomIndex = null,
  crowdMoment = null,
  busy = false,
  onRecordFinal,
  onNextClash,
}: LiveRoomResultRevealProps): React.JSX.Element {
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
    const mind =
      changedPercent != null ? `\nMindshift ${changedPercent}%` : '';
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
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: t.surface, borderColor: t.border },
          revealed,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          {roomIndex != null ? `ROOM ${roomIndex} DECIDED` : '◆ ROOM DECIDED'}
        </Text>
        {topicTitle ? (
          <Text allowFontScaling={false} style={[styles.topic, { color: t.textSecondary }]} numberOfLines={2}>
            {topicTitle}
          </Text>
        ) : null}

        <View style={styles.headline}>
          <Text
            allowFontScaling={false}
            style={[styles.side, { color: winnerTone?.ink ?? t.textPrimary }]}
          >
            {isDraw
              ? 'DRAW'
              : result.winningSide === 'AGREE'
                ? 'SIDE A WON'
                : 'SIDE B WON'}
          </Text>
          {!isDraw && winnerPercent !== null ? (
            <Text allowFontScaling={false} style={[styles.percent, { color: winnerTone?.ink ?? t.textSecondary }]}>
              {winnerPercent}%
            </Text>
          ) : null}
        </View>

        <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]}>
          {isDraw
            ? totalVotes === 0
              ? 'Nobody cast a side vote.'
              : 'The room split evenly.'
            : `${winnerVotes} of ${totalVotes} judgements · ${winningSideLabel(result.winningSide)}`}
        </Text>

        <ClashMatchupBar size="room" agreeShare={agreeShare} />

        <Text allowFontScaling={false} style={[styles.sub, { color: t.textMuted }]}>
          {result.participantCount.toLocaleString()} participants
        </Text>
        <GlowButton label="Share result" onPress={() => void onShare()} compact tone="glass" />
        {onNextClash ? (
          <GlowButton label="NEXT CLASH →" onPress={onNextClash} compact />
        ) : null}
      </Animated.View>

      {result.bestArgumentBody || result.bestArgumentAuthor ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(220).duration(260)}
          style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            BEST ARGUMENT
          </Text>
          {result.bestArgumentAuthor ? (
            <View style={styles.authorRow}>
              <Avatar
                name={result.bestArgumentAuthor.name}
                tint={result.bestArgumentAuthor.avatarTint}
                size={24}
              />
              <Text allowFontScaling={false} style={[styles.authorName, { color: t.textPrimary }]}>
                {result.bestArgumentAuthor.name}
              </Text>
            </View>
          ) : null}
          {result.bestArgumentBody ? (
            <Text allowFontScaling={false} style={[styles.quote, { color: t.textPrimary }]}>
              {result.bestArgumentBody}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      {changedPercent !== null ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(320).duration(260)}
          style={[styles.card, { backgroundColor: softFill(t), borderColor: t.border }]}
        >
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            BIGGEST MINDSHIFT
          </Text>
          <Text allowFontScaling={false} style={[styles.mindshift, { color: t.textPrimary }]}>
            {changedPercent}%
          </Text>
          <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]}>
            changed their mind in this room
          </Text>
        </Animated.View>
      ) : null}

      {crowdMoment?.preview ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.delay(360).duration(260)}
          style={[styles.card, { backgroundColor: softFill(t), borderColor: t.borderStrong }]}
        >
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            💀 CROWD MOMENT
          </Text>
          {crowdMoment.author ? (
            <Text allowFontScaling={false} style={[styles.authorName, { color: t.textPrimary }]}>
              {crowdMoment.author}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={[styles.quote, { color: t.textPrimary }]}>
            {crowdMoment.preview}
          </Text>
        </Animated.View>
      ) : null}

      {needsFinalStance ? (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <StanceChoiceRow
            prompt="Where do you stand now?"
            disabled={busy}
            onChoose={onRecordFinal}
          />
          <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
            Recorded once, and only as an aggregate. Nobody sees your answer.
          </Text>
        </View>
      ) : viewer?.finalStance && viewer.stance ? (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
            YOUR JOURNEY
          </Text>
          <Text allowFontScaling={false} style={[styles.journey, { color: t.textPrimary }]}>
            {STANCE_LABEL[viewer.stance]} → {STANCE_LABEL[viewer.finalStance]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenX, paddingVertical: space.md, gap: space.sm },
  card: {
    padding: space.md,
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  topic: { ...typeScale.meta, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  side: {
    ...typeScale.display,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1,
  },
  percent: { ...typeScale.dataLg, fontSize: 18, fontWeight: '700' },
  sub: { ...typeScale.meta, fontSize: 13 },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    marginTop: space.xs,
  },
  barFill: { borderRadius: 3 },
  tally: { flexDirection: 'row', gap: space.md, marginTop: 2 },
  tallyText: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  authorName: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  quote: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
  mindshift: {
    ...typeScale.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  note: { ...typeScale.caption, fontSize: 11, lineHeight: 16 },
  journey: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
});
