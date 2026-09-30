import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take, User } from '../../store';
import type { ProfileClash, ProfileReply } from '../../services/profileService';
import { HOOD_LABEL } from '../../data/hoods';
import { space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { timeAgo } from '../../utils/format';

/** Compact authored Take — flatter, profile-oriented. */
export function ProfileTakeItem({ take, onOpen }: { take: Take; onOpen: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Take: ${take.text}`}
      style={[styles.row, { borderBottomColor: t.border }]}
    >
      <Text style={[styles.body, { color: t.textPrimary }]} numberOfLines={4}>
        {take.text}
      </Text>
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {[
          HOOD_LABEL[take.hood],
          timeAgo(take.createdAt),
          take.clashes > 0 ? `${take.clashes} clashes` : null,
          take.reactions > 0 ? `${take.reactions} reactions` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

/** A reply the profile left, with the Take it was left on for context. */
export function ProfileReplyItem({ reply, onOpen }: { reply: ProfileReply; onOpen: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Reply: ${reply.comment.text}`}
      style={[styles.row, { borderBottomColor: t.border }]}
    >
      <Text style={[styles.body, { color: t.textPrimary }]} numberOfLines={4}>
        {reply.comment.text}
      </Text>
      {reply.take ? (
        <Text allowFontScaling={false} style={[styles.context, { color: t.textSecondary }]} numberOfLines={1}>
          on “{reply.take.text}”
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {[
          reply.comment.upvotes > 0 ? `${reply.comment.upvotes} upvotes` : null,
          timeAgo(reply.comment.createdAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

function winShareLabel(clash: ProfileClash): string | null {
  const verdict = clash.verdict;
  if (!verdict || clash.outcome !== 'won') return null;
  const total = verdict.sideAScore + verdict.sideBScore;
  if (total <= 0) return null;
  const winning =
    verdict.winnerSide === 'A'
      ? verdict.sideAScore
      : verdict.winnerSide === 'B'
        ? verdict.sideBScore
        : Math.max(verdict.sideAScore, verdict.sideBScore);
  const pct = Math.round((winning / total) * 100);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return `${pct}% judged your side stronger`;
}

/** Clash history row — receipt of an argument, not a trophy. */
export function ProfileClashRow({
  clash,
  opponent,
  onOpen,
}: {
  clash: ProfileClash;
  opponent: User | undefined;
  onOpen: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const result = clash.verdict
    ? clash.outcome === 'won'
      ? 'Clash won'
      : clash.outcome === 'draw'
        ? 'Draw'
        : 'Clash lost'
    : clash.clash.status === 'open'
      ? 'Open'
      : clash.clash.status === 'settled'
        ? 'No verdict'
        : 'Cancelled';

  const share = winShareLabel(clash);
  const isWin = clash.outcome === 'won';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${result}${opponent ? ` against ${opponent.name}` : ''}`}
      style={[styles.row, { borderBottomColor: t.border }]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.clashKicker,
          { color: isWin ? t.textPrimary : t.textMuted },
        ]}
      >
        {result.toUpperCase()}
      </Text>

      {clash.takeText ? (
        <Text allowFontScaling={false} style={[styles.clashQuote, { color: t.textPrimary }]} numberOfLines={3}>
          “{clash.takeText}”
        </Text>
      ) : null}

      {share ? (
        <Text allowFontScaling={false} style={[styles.share, { color: t.textSecondary }]}>
          {share}
        </Text>
      ) : clash.verdict ? (
        <Text allowFontScaling={false} style={[styles.share, { color: t.textSecondary }]}>
          {clash.verdict.sideAScore}–{clash.verdict.sideBScore} · {clash.verdict.verdictLabel}
        </Text>
      ) : null}

      <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
        {[
          opponent ? `vs @${opponent.handle}` : 'hidden opponent',
          timeAgo(clash.clash.createdAt),
        ].join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  body: {
    ...typeScale.bodyStrong,
    fontSize: 15,
    lineHeight: 22,
  },
  context: { ...typeScale.meta },
  meta: { ...typeScale.meta, fontSize: 12 },
  clashKicker: {
    ...typeScale.caption,
    letterSpacing: 0.7,
  },
  clashQuote: {
    ...typeScale.takeText,
    fontSize: 16,
    lineHeight: 22,
  },
  share: {
    ...typeScale.meta,
  },
});
