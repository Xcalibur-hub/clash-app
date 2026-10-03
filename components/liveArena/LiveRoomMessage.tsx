import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import type { ArenaEvidence, ArenaMessage, Stance } from '../../services/liveArenaService';
import type { TakeMedia } from '../../store/types';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { CommentMedia } from '../arena/CommentMedia';
import { Avatar } from '../shared/Avatar';
import { MoreIcon } from '../shared/icons';
import { LiveEvidenceCard } from './LiveEvidenceCard';
import { softFill, STANCE_LABEL } from './liveArenaStyles';

const DEFAULT_REACTION = '🔥';

export interface LiveRoomMessageProps {
  message: ArenaMessage;
  now: number;
  parent?: ArenaMessage | null;
  evidence?: readonly ArenaEvidence[];
  canReply?: boolean;
  canReact?: boolean;
  canMarkEvidence?: boolean;
  /** Real highlight only — best argument or top reaction signal. */
  highlighted?: boolean;
  highlightLabel?: string | null;
  /** Own stance cue only (privacy — never other members' stances). */
  ownStance?: Stance | null;
  onReply?: (message: ArenaMessage) => void;
  onReact?: (message: ArenaMessage, emoji: string) => void;
  onOpenProfile?: (profileId: string) => void;
  onReport?: (message: ArenaMessage) => void;
  onMarkEvidence?: (evidence: ArenaEvidence) => void;
  onChallengeEvidence?: (evidence: ArenaEvidence) => void;
  onReportEvidence?: (evidence: ArenaEvidence) => void;
}

function toTakeMedia(message: ArenaMessage): TakeMedia | null {
  if (!message.mediaUrl || !message.mediaKind) return null;
  return {
    kind: message.mediaKind,
    caption: '',
    colors: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)'],
    url: message.mediaUrl,
    ...(message.gifProvider === 'tenor'
      ? { gifProvider: 'tenor' as const, gifExternalId: message.gifExternalId ?? undefined }
      : {}),
  };
}

/** Argument card — event conversation, not generic chat. */
export function LiveRoomMessage({
  message,
  now,
  parent = null,
  evidence = [],
  canReply = true,
  canReact = true,
  canMarkEvidence = false,
  highlighted = false,
  highlightLabel = null,
  ownStance = null,
  onReply,
  onReact,
  onOpenProfile,
  onReport,
  onMarkEvidence,
  onChallengeEvidence,
  onReportEvidence,
}: LiveRoomMessageProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();

  if (message.kind === 'system') {
    return (
      <View style={styles.systemWrap}>
        <Text allowFontScaling={false} style={[styles.system, { color: t.textMuted }]}>
          {message.body}
        </Text>
      </View>
    );
  }

  const author = message.author;
  const media = toTakeMedia(message);
  const own = message.isOwn;
  const pending = message.pending === true;
  const isReply = Boolean(parent);
  const showReactButton = canReact && Boolean(onReact) && !pending;
  const staticReactions = showReactButton
    ? message.reactions.filter((reaction) => reaction.emoji !== DEFAULT_REACTION)
    : message.reactions;
  const reactionTotal = message.reactions.reduce((sum, r) => sum + r.count, 0);

  return (
    <Animated.View
      entering={reduced || pending ? undefined : FadeInDown.duration(200)}
      style={[
        styles.row,
        pending && styles.pending,
        isReply && styles.rowReply,
        highlighted && styles.rowHighlight,
      ]}
    >
      <Pressable
        onPress={() => {
          if (!author || !onOpenProfile) return;
          hapticTap();
          onOpenProfile(author.id);
        }}
        disabled={!author || !onOpenProfile}
        accessibilityRole={author && onOpenProfile ? 'button' : undefined}
        accessibilityLabel={author ? `Open ${author.name}'s profile` : undefined}
        hitSlop={4}
      >
        <Avatar
          name={author?.name ?? 'Someone'}
          tint={author?.avatarTint ?? '#71717A'}
          size={isReply ? 26 : 34}
        />
      </Pressable>

      <View
        style={[
          styles.plate,
          {
            backgroundColor: highlighted
              ? softFill(t)
              : own
                ? softFill(t)
                : t.surfaceElevated,
            borderColor: highlighted ? t.borderStrong : t.border,
          },
          isReply && styles.plateReply,
          own && styles.plateOwn,
        ]}
      >
        {highlighted && highlightLabel ? (
          <Text allowFontScaling={false} style={[styles.topLabel, { color: t.textMuted }]}>
            {highlightLabel}
          </Text>
        ) : null}

        <View style={styles.headRow}>
          <Pressable
            onPress={() => {
              if (!author || !onOpenProfile) return;
              hapticTap();
              onOpenProfile(author.id);
            }}
            disabled={!author || !onOpenProfile}
            hitSlop={4}
            style={styles.nameHit}
          >
            <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
              {author?.handle ? `@${author.handle}` : author?.name ?? 'Someone'}
            </Text>
          </Pressable>
          {own && ownStance ? (
            <Text allowFontScaling={false} style={[styles.stanceCue, { color: t.textMuted }]}>
              · {STANCE_LABEL[ownStance]}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {pending ? 'sending…' : timeAgo(message.createdAt, now)}
          </Text>
          {onReport ? (
            <Pressable
              onPress={() => {
                hapticTap();
                onReport(message);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="More options"
              style={styles.more}
            >
              <MoreIcon size={16} color={t.textMuted} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {parent ? (
          <View style={styles.replyAttach}>
            <View style={[styles.connector, { backgroundColor: t.borderStrong }]} />
            <View style={[styles.quote, { backgroundColor: softFill(t), borderColor: t.border }]}>
              <Text
                allowFontScaling={false}
                numberOfLines={2}
                style={[styles.quoteText, { color: t.textMuted }]}
              >
                {parent.author ? `@${parent.author.handle ?? parent.author.name}: ` : ''}
                {parent.body || 'attachment'}
              </Text>
            </View>
          </View>
        ) : null}

        {message.body ? (
          <Text
            allowFontScaling={false}
            style={[
              styles.text,
              { color: t.textPrimary },
              isReply && styles.textCompact,
              highlighted && styles.textStrong,
            ]}
          >
            {message.body}
          </Text>
        ) : null}

        {media ? (
          <View style={styles.media}>
            <CommentMedia media={media} compact={isReply} />
          </View>
        ) : null}

        {evidence.length > 0 ? (
          <View style={styles.evidenceStack}>
            {evidence.map((item) => (
              <LiveEvidenceCard
                key={item.id}
                evidence={item}
                inline
                canMark={canMarkEvidence}
                onMarkUseful={onMarkEvidence}
                onChallenge={onChallengeEvidence}
                onReport={onReportEvidence}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          {showReactButton && onReact ? (
            <ReactionButton message={message} onReact={() => onReact(message, DEFAULT_REACTION)} />
          ) : null}
          {staticReactions.map((reaction) => (
            <View
              key={reaction.emoji}
              style={[styles.chip, { backgroundColor: softFill(t), borderColor: t.border }]}
            >
              <Text allowFontScaling={false} style={styles.chipEmoji}>
                {reaction.emoji}
              </Text>
              <Text allowFontScaling={false} style={[styles.chipCount, { color: t.textMuted }]}>
                {reaction.count}
              </Text>
            </View>
          ))}
          {!showReactButton && reactionTotal > 0 && staticReactions.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
              {DEFAULT_REACTION} {reactionTotal}
            </Text>
          ) : null}
          {canReply && onReply && !pending ? (
            <Pressable
              onPress={() => {
                hapticTap();
                onReply(message);
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Reply to this argument"
            >
              <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
                Reply
              </Text>
            </Pressable>
          ) : null}
          {message.argumentVotes !== null && message.argumentVotes > 0 ? (
            <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
              {message.argumentVotes} best-argument
              {message.argumentVotes === 1 ? ' vote' : ' votes'}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

function ReactionButton({
  message,
  onReact,
}: {
  message: ArenaMessage;
  onReact: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const mine = message.reactions.find((reaction) => reaction.emoji === DEFAULT_REACTION);
  const active = mine?.viewerReacted === true;

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onReact();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? 'Remove reaction' : 'React to this argument'}
      style={[
        styles.chip,
        {
          backgroundColor: active ? t.surfaceMuted : 'transparent',
          borderColor: active ? t.borderStrong : t.border,
        },
      ]}
    >
      <Text allowFontScaling={false} style={styles.chipEmoji}>
        {DEFAULT_REACTION}
      </Text>
      {mine && mine.count > 0 ? (
        <Text allowFontScaling={false} style={[styles.chipCount, { color: t.textSecondary }]}>
          {mine.count}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  rowReply: {
    marginLeft: space.md,
    paddingVertical: 4,
  },
  rowHighlight: { marginVertical: 4 },
  pending: { opacity: 0.55 },
  plate: {
    flex: 1,
    gap: 6,
    minWidth: 0,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  plateReply: {
    borderRadius: 16,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    maxWidth: '92%',
  },
  plateOwn: { borderBottomRightRadius: 8 },
  topLabel: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  nameHit: { flexShrink: 1 },
  name: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  stanceCue: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  meta: { ...typeScale.caption, fontSize: 11 },
  more: { marginLeft: 'auto', paddingLeft: space.xs },
  replyAttach: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  connector: { width: 2, borderRadius: 1, marginVertical: 2 },
  quote: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  quoteText: { ...typeScale.caption, fontSize: 11, lineHeight: 15 },
  text: { ...typeScale.body, fontSize: 16, lineHeight: 23 },
  textCompact: { fontSize: 14, lineHeight: 20 },
  textStrong: { fontWeight: '600' },
  media: { marginTop: 2, alignSelf: 'stretch', maxWidth: '100%' },
  evidenceStack: { gap: 6, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipEmoji: { fontSize: 12 },
  chipCount: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  action: { ...typeScale.caption, fontSize: 11, fontWeight: '600' },
  systemWrap: { paddingVertical: space.sm, alignItems: 'center' },
  system: { ...typeScale.caption, fontSize: 11, textAlign: 'center' },
});
