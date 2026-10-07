import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import type { ArenaEvidence, ArenaMessage, Stance } from '../../services/liveArenaService';
import type { TakeMedia } from '../../store/types';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { timeAgo } from '../../utils/format';
import { duelTimestamp } from '../../utils/duelPresentation';
import { tap as hapticTap } from '../../utils/haptics';
import { ClashNativeStickerCard } from '../arena/ClashNativeStickerCard';
import { CommentMedia } from '../arena/CommentMedia';
import { MessageExpressiveSheet } from '../arena/MessageExpressiveSheet';
import { Avatar } from '../shared/Avatar';
import { MoreIcon } from '../shared/icons';
import { parseClashStickerBody } from '../../utils/clashNativeStickers';
import { ArenaReactionPicker } from './ArenaReactionPicker';
import { clashStampForEmoji } from './ClashSticker';
import { LiveEvidenceCard } from './LiveEvidenceCard';
import { softFill, STANCE_LABEL } from './liveArenaStyles';

const DEFAULT_REACTION = '🔥';

export interface LiveRoomMessageProps {
  duelFighter?: { side: 'A' | 'B'; name: string; handle: string };
  message: ArenaMessage;
  now: number;
  parent?: ArenaMessage | null;
  /** Parent id exists but the parent row is hidden/unavailable. */
  parentUnavailable?: boolean;
  evidence?: readonly ArenaEvidence[];
  canReply?: boolean;
  canReact?: boolean;
  canMarkEvidence?: boolean;
  /** Real highlight only — best argument or top reaction signal. */
  highlighted?: boolean;
  highlightLabel?: string | null;
  /** Entertainment highlight (crowd moment) — different tone from best argument. */
  entertainmentHighlight?: boolean;
  /** Own stance cue only (privacy — never other members' stances). */
  ownStance?: Stance | null;
  /** Ranked reply preview nested under a root argument. */
  nestedReplies?: readonly ArenaMessage[];
  hiddenReplyCount?: number;
  onExpandReplies?: () => void;
  onReply?: (message: ArenaMessage) => void;
  onExpressiveReply?: (message: ArenaMessage, mode: 'meme' | 'gif' | 'sticker') => void;
  /** When false, GIF previews in this row stay static. */
  mediaVisible?: boolean;
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

function isMemeLead(message: ArenaMessage, media: TakeMedia | null): boolean {
  if (!media) return false;
  if (message.kind === 'gif' || media.kind === 'gif') return true;
  return !message.body?.trim() && media.kind === 'image';
}

/** Argument card — event conversation, not generic chat. */
export function LiveRoomMessage({
  duelFighter,
  message,
  now,
  parent = null,
  parentUnavailable = false,
  evidence = [],
  canReply = true,
  canReact = true,
  canMarkEvidence = false,
  highlighted = false,
  highlightLabel = null,
  entertainmentHighlight = false,
  ownStance = null,
  nestedReplies = [],
  hiddenReplyCount = 0,
  onExpandReplies,
  onReply,
  onExpressiveReply,
  mediaVisible = true,
  onReact,
  onOpenProfile,
  onReport,
  onMarkEvidence,
  onChallengeEvidence,
  onReportEvidence,
}: LiveRoomMessageProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [expressiveOpen, setExpressiveOpen] = React.useState(false);

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
  const stickerParsed = parseClashStickerBody(message.body);
  const memeLead = Boolean(stickerParsed) || isMemeLead(message, media);
  const own = message.isOwn;
  const pending = message.pending === true;
  const isReply = Boolean(parent) || parentUnavailable || Boolean(message.parentMessageId);
  const replyTotal = Math.max(message.replyCount ?? 0, nestedReplies.length + hiddenReplyCount);
  const showReactButton = canReact && Boolean(onReact) && !pending;
  const reactionTotal = message.reactions.reduce((sum, r) => sum + r.count, 0);
  const viewerActive = message.reactions.filter((r) => r.viewerReacted).map((r) => r.emoji);
  const cooked = message.reactions.find((r) => r.emoji === DEFAULT_REACTION);

  const stickerBlock = stickerParsed ? (
    <View style={[styles.sticker, memeLead && styles.mediaLead]}>
      <ClashNativeStickerCard sticker={stickerParsed.sticker} size={isReply ? 'sm' : 'md'} />
    </View>
  ) : null;

  const mediaBlock =
    media != null ? (
      <View style={[styles.media, memeLead && styles.mediaLead]}>
        <CommentMedia media={media} compact={isReply && !memeLead} animateGif={mediaVisible} />
      </View>
    ) : null;

  const displayText = stickerParsed ? stickerParsed.text : (message.body ?? '').trim();
  const textBlock =
    displayText.length > 0 ? (
      <Text
        allowFontScaling={Boolean(duelFighter)}
        selectable={Boolean(duelFighter)}
        style={[
          styles.text,
          { color: t.textPrimary },
          isReply && styles.textCompact,
          highlighted && styles.textStrong,
          memeLead && styles.textUnderMeme,
          duelFighter && styles.duelText,
        ]}
      >
        {displayText}
      </Text>
    ) : null;

  return (
    <Animated.View
      entering={duelFighter || reduced || pending ? undefined : FadeInDown.duration(200)}
      style={[
        styles.row,
        pending && styles.pending,
        isReply && styles.rowReply,
        highlighted && styles.rowHighlight,
        entertainmentHighlight && styles.rowCrowd,
        duelFighter && styles.duelRow,
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
        hitSlop={6}
      >
        <Avatar
          name={author?.name ?? 'Someone'}
          tint={author?.avatarTint ?? '#71717A'}
          size={duelFighter ? 34 : isReply ? 26 : 34}
        />
      </Pressable>

      <Pressable
        onLongPress={() => {
          if (pending) return;
          hapticTap();
          setExpressiveOpen(true);
        }}
        delayLongPress={280}
        style={[
          styles.plate,
          {
            backgroundColor: highlighted ? softFill(t) : own ? softFill(t) : t.surfaceElevated,
            borderColor: entertainmentHighlight
              ? t.borderStrong
              : highlighted
                ? t.borderStrong
                : t.border,
          },
          isReply && styles.plateReply,
          own && styles.plateOwn,
          memeLead && styles.plateMeme,
          duelFighter && styles.duelPlate,
          duelFighter && { backgroundColor: 'transparent', borderColor: t.border },
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
            style={[styles.nameHit, duelFighter && { minHeight: 44, justifyContent: 'center' }]}
            accessibilityRole={duelFighter ? 'button' : undefined}
            accessibilityLabel={duelFighter ? `Open ${duelFighter.name}, Fighter ${duelFighter.side}'s profile` : undefined}
          >
            {duelFighter ? (
              <Text allowFontScaling style={[styles.name, styles.duelName, { color: t.textPrimary }]}>
                {duelFighter.name}
                <Text style={[styles.duelSideCue, { color: t.textMuted }]}>
                  {` · FIGHTER ${duelFighter.side}`}
                </Text>
              </Text>
            ) : (
              <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]}>
                {author?.handle ? `@${author.handle}` : author?.name ?? 'Someone'}
              </Text>
            )}
          </Pressable>
          {own && ownStance ? (
            <Text allowFontScaling={false} style={[styles.stanceCue, { color: t.textMuted }]}>
              · {STANCE_LABEL[ownStance]}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {pending ? 'sending…' : duelFighter ? duelTimestamp(message.createdAt) : timeAgo(message.createdAt, now)}
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
              style={[styles.more, duelFighter && { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }]}
            >
              <MoreIcon size={16} color={t.textMuted} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {parent || parentUnavailable ? (
          <View style={styles.replyAttach}>
            <View style={[styles.connector, { backgroundColor: t.borderStrong }]} />
            <View style={[styles.quote, { backgroundColor: softFill(t), borderColor: t.border }]}>
              <Text
                allowFontScaling={false}
                numberOfLines={2}
                style={[styles.quoteText, { color: t.textMuted }]}
              >
                {parentUnavailable || !parent
                  ? '[argument unavailable]'
                  : `${parent.author ? `@${parent.author.handle ?? parent.author.name}: ` : ''}${
                      parent.body || (parent.mediaUrl ? 'GIF / media' : 'attachment')
                    }`}
              </Text>
            </View>
          </View>
        ) : null}

        {memeLead ? (
          <>
            {stickerBlock}
            {mediaBlock}
            {textBlock}
          </>
        ) : (
          <>
            {textBlock}
            {stickerBlock}
            {mediaBlock}
          </>
        )}

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
            <Pressable
              onPress={() => {
                hapticTap();
                onReact(message, DEFAULT_REACTION);
              }}
              onLongPress={() => {
                hapticTap();
                setPickerOpen(true);
              }}
              delayLongPress={220}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="React — long press for more"
              style={[
                styles.chip,
                duelFighter && styles.duelChip,
                {
                  backgroundColor: cooked?.viewerReacted ? t.surfaceMuted : 'transparent',
                  borderColor: cooked?.viewerReacted ? t.borderStrong : t.border,
                },
              ]}
            >
              <Text allowFontScaling={false} style={styles.chipEmoji}>
                {DEFAULT_REACTION}
              </Text>
              {cooked && cooked.count > 0 ? (
                <Text allowFontScaling={false} style={[styles.chipCount, { color: t.textSecondary }]}>
                  {cooked.count}
                </Text>
              ) : null}
            </Pressable>
          ) : null}

          {message.reactions
            .filter((reaction) => reaction.emoji !== DEFAULT_REACTION || !showReactButton)
            .map((reaction) => (
              <Pressable
                key={reaction.emoji}
                disabled={!showReactButton || !onReact}
                onPress={() => {
                  if (!onReact) return;
                  hapticTap();
                  onReact(message, reaction.emoji);
                }}
                accessibilityRole={showReactButton ? 'button' : undefined}
                accessibilityLabel={`${clashStampForEmoji(reaction.emoji)} ${reaction.count}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: reaction.viewerReacted ? t.surfaceMuted : softFill(t),
                    borderColor: reaction.viewerReacted ? t.borderStrong : t.border,
                  },
                ]}
              >
                <Text allowFontScaling={false} style={styles.chipEmoji}>
                  {reaction.emoji}
                </Text>
                <Text allowFontScaling={false} style={[styles.chipCount, { color: t.textMuted }]}>
                  {reaction.count}
                </Text>
              </Pressable>
            ))}

          {showReactButton && onReact ? (
            <Pressable
              onPress={() => {
                hapticTap();
                setPickerOpen(true);
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Open reaction picker"
            >
              <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
                + React
              </Text>
            </Pressable>
          ) : null}

          {!showReactButton && reactionTotal > 0 && message.reactions.length === 0 ? (
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
              style={duelFighter ? { minHeight: 44, justifyContent: 'center' } : undefined}
            >
              <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
                Reply
              </Text>
            </Pressable>
          ) : null}
          {replyTotal > 0 && !message.parentMessageId ? (
            <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
              ↩ {replyTotal} response{replyTotal === 1 ? '' : 's'}
            </Text>
          ) : null}
          {message.argumentVotes !== null && message.argumentVotes > 0 ? (
            <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
              {message.argumentVotes} best-argument
              {message.argumentVotes === 1 ? ' vote' : ' votes'}
            </Text>
          ) : null}
        </View>

        {nestedReplies.length > 0 ? (
          <View style={styles.nested}>
            {nestedReplies.map((reply) => (
              <View
                key={reply.id}
                style={[styles.nestedRow, { borderColor: t.border, backgroundColor: softFill(t) }]}
              >
                <Text allowFontScaling={false} style={[styles.nestedName, { color: t.textPrimary }]}>
                  {reply.author?.name ?? 'Someone'}
                </Text>
                <Text
                  allowFontScaling={false}
                  numberOfLines={3}
                  style={[styles.nestedBody, { color: t.textSecondary }]}
                >
                  {(() => {
                    const nestedSticker = parseClashStickerBody(reply.body);
                    if (nestedSticker) {
                      return nestedSticker.text || nestedSticker.sticker.label;
                    }
                    return reply.body || (reply.mediaUrl ? 'GIF / media' : '');
                  })()}
                </Text>
              </View>
            ))}
            {hiddenReplyCount > 0 && onExpandReplies ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onExpandReplies();
                }}
                accessibilityRole="button"
                accessibilityLabel={`View ${hiddenReplyCount} more responses`}
              >
                <Text allowFontScaling={false} style={[styles.moreReplies, { color: t.textPrimary }]}>
                  View {hiddenReplyCount} more response{hiddenReplyCount === 1 ? '' : 's'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      <MessageExpressiveSheet
        canReply={duelFighter ? canReply : true}
        visible={expressiveOpen}
        onClose={() => setExpressiveOpen(false)}
        onReply={() => onReply?.(message)}
        onExpressive={(mode) => onExpressiveReply?.(message, mode)}
        onReport={onReport ? () => onReport(message) : undefined}
      />

      {showReactButton && onReact ? (
        <ArenaReactionPicker
          visible={pickerOpen}
          activeEmojis={viewerActive}
          onClose={() => setPickerOpen(false)}
          onPick={(emoji) => onReact(message, emoji)}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  duelRow: { marginLeft: 0, paddingVertical: space.lg },
  duelText: { fontSize: 17, lineHeight: 26, fontWeight: '400', letterSpacing: 0.1 },
  duelPlate: {
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingVertical: space.md,
    maxWidth: '100%',
    gap: space.md,
  },
  duelName: { fontSize: 14, fontWeight: '700' },
  duelSideCue: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  duelChip: {
    minHeight: 36,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
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
  rowCrowd: { marginVertical: 6 },
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
  plateMeme: { paddingTop: space.sm },
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
  textUnderMeme: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  media: { marginTop: 2, alignSelf: 'stretch', maxWidth: '100%' },
  sticker: { marginTop: 2, width: 148, maxWidth: '70%' },
  mediaLead: { marginTop: 0, marginBottom: 2 },
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
  nested: { gap: 6, marginTop: 4 },
  nestedRow: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    gap: 2,
  },
  nestedName: { ...typeScale.label, fontSize: 12, fontWeight: '800' },
  nestedBody: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  moreReplies: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 4,
  },
});
