import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaMessage } from '../../services/liveArenaService';
import type { TakeMedia } from '../../store/types';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { CommentMedia } from '../arena/CommentMedia';
import { Avatar } from '../shared/Avatar';
import { MoreIcon } from '../shared/icons';
import { softFill } from './liveArenaStyles';

const DEFAULT_REACTION = '🔥';

export interface LiveRoomMessageProps {
  message: ArenaMessage;
  now: number;
  /** One line of the argument being answered, when this message is a reply. */
  parent?: ArenaMessage | null;
  /** Hidden once the room stops accepting arguments. */
  canReply?: boolean;
  canReact?: boolean;
  onReply?: (message: ArenaMessage) => void;
  onReact?: (message: ArenaMessage, emoji: string) => void;
  onOpenProfile?: (profileId: string) => void;
  onReport?: (message: ArenaMessage) => void;
}

/** Media messages carry a real URL; the gradient plate is a Take-only fallback. */
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

/**
 * One argument in the thread. Four shapes — text, owned upload, Tenor GIF and a
 * server-authored `system` notice — rendered from the same payload.
 *
 * Reporting is a callback: the room screen owns the safety sheet so blocks and
 * mutes route through the one shared surface instead of a second code path.
 */
export function LiveRoomMessage({
  message,
  now,
  parent = null,
  canReply = true,
  canReact = true,
  onReply,
  onReact,
  onOpenProfile,
  onReport,
}: LiveRoomMessageProps): React.JSX.Element {
  const t = useThemeColors();

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
  const showReactButton = canReact && Boolean(onReact) && !pending;
  // The default emoji lives on the button when it is there; once the room
  // closes the button goes away, so its count has to fall back to a static chip.
  const staticReactions = showReactButton
    ? message.reactions.filter((reaction) => reaction.emoji !== DEFAULT_REACTION)
    : message.reactions;

  return (
    <View style={[styles.row, pending && styles.pending]}>
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
        <Avatar name={author?.name ?? 'Someone'} tint={author?.avatarTint ?? '#71717A'} size={30} />
      </Pressable>

      <View style={styles.body}>
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
              {author?.name ?? 'Someone'}
            </Text>
          </Pressable>
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
          <View style={[styles.quote, { borderLeftColor: t.borderStrong }]}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.quoteText, { color: t.textMuted }]}
            >
              {parent.author ? `${parent.author.name}: ` : ''}
              {parent.body || 'attachment'}
            </Text>
          </View>
        ) : null}

        {message.body ? (
          <Text allowFontScaling={false} style={[styles.text, { color: t.textPrimary }]}>
            {message.body}
          </Text>
        ) : null}

        {media ? (
          <View style={styles.media}>
            <CommentMedia media={media} compact />
          </View>
        ) : null}

        <View style={styles.actions}>
          {showReactButton && onReact ? (
            <ReactionButton
              message={message}
              onReact={() => onReact(message, DEFAULT_REACTION)}
            />
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
          {own && message.argumentVotes !== null ? (
            <Text allowFontScaling={false} style={[styles.action, { color: t.textMuted }]}>
              {message.argumentVotes} best-argument{message.argumentVotes === 1 ? ' vote' : ' votes'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
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
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  pending: { opacity: 0.55 },
  body: { flex: 1, gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  nameHit: { flexShrink: 1 },
  name: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
  meta: { ...typeScale.caption, fontSize: 11 },
  more: { marginLeft: 'auto', paddingLeft: space.xs },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: space.xs,
    paddingVertical: 1,
  },
  quoteText: { ...typeScale.caption, fontSize: 11 },
  text: { ...typeScale.body, fontSize: 15, lineHeight: 21 },
  media: { marginTop: 2, maxWidth: 260 },
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
  systemWrap: { paddingVertical: space.xs, alignItems: 'center' },
  system: { ...typeScale.caption, fontSize: 11, textAlign: 'center' },
});
