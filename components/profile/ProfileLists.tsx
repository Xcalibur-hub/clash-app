import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take, User } from '../../store';
import type { ProfileClash, ProfileReply } from '../../services/profileService';
import { HOOD_LABEL } from '../../data/hoods';
import { accent, ink, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { timeAgo } from '../../utils/format';

/** Compact authored Take — flat Arena language, no giant cards. */
export function ProfileTakeItem({ take, onOpen }: { take: Take; onOpen: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Take: ${take.text}`}
      style={styles.row}
    >
      <Text style={styles.body} numberOfLines={3}>
        {take.text}
      </Text>
      <Text allowFontScaling={false} style={styles.meta}>
        {HOOD_LABEL[take.hood]} · {timeAgo(take.createdAt)} · {take.clashes} clashes · {take.reactions} reactions
      </Text>
    </Pressable>
  );
}

/** A reply the profile left, with the Take it was left on for context. */
export function ProfileReplyItem({ reply, onOpen }: { reply: ProfileReply; onOpen: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Reply: ${reply.comment.text}`}
      style={styles.row}
    >
      <Text style={styles.body} numberOfLines={3}>
        {reply.comment.text}
      </Text>
      {reply.take ? (
        <Text allowFontScaling={false} style={styles.context} numberOfLines={1}>
          on “{reply.take.text}”
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={styles.meta}>
        {reply.comment.upvotes} upvotes · {timeAgo(reply.comment.createdAt)}
      </Text>
    </Pressable>
  );
}

/** One Clash from the profile's history: opponent, result and date. */
export function ProfileClashRow({
  clash,
  opponent,
  onOpen,
}: {
  clash: ProfileClash;
  opponent: User | undefined;
  onOpen: () => void;
}): React.JSX.Element {
  const result = clash.verdict
    ? clash.outcome === 'won'
      ? 'Won'
      : clash.outcome === 'draw'
        ? 'Draw'
        : 'Lost'
    : clash.clash.status === 'open'
      ? 'Open'
      : clash.clash.status === 'settled'
        ? 'No verdict'
        : 'Cancelled';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Clash ${result}${opponent ? ` against ${opponent.name}` : ''}`}
      style={styles.row}
    >
      <View style={styles.clashHead}>
        <Text allowFontScaling={false} style={styles.clashOpponent} numberOfLines={1}>
          vs {opponent ? `@${opponent.handle}` : 'hidden opponent'}
        </Text>
        <Text
          allowFontScaling={false}
          style={[
            styles.result,
            result === 'Won' && styles.won,
            result === 'Lost' && styles.lost,
          ]}
        >
          {result}
        </Text>
      </View>
      {clash.takeText ? (
        <Text allowFontScaling={false} style={styles.context} numberOfLines={1}>
          “{clash.takeText}”
        </Text>
      ) : null}
      <Text allowFontScaling={false} style={styles.meta}>
        {clash.verdict
          ? `${clash.verdict.sideAScore}–${clash.verdict.sideBScore} · ${clash.verdict.verdictLabel} · `
          : ''}
        {timeAgo(clash.clash.createdAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    gap: space.xs,
  },
  body: { ...typeScale.body, color: ink.primary },
  context: { ...typeScale.meta, color: ink.tertiary },
  meta: { ...typeScale.meta, fontSize: 12, color: ink.quaternary },
  clashHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  clashOpponent: { ...typeScale.label, color: ink.primary, flex: 1 },
  result: { ...typeScale.meta, color: ink.secondary },
  won: { color: accent.mint },
  lost: { color: accent.danger },
});
