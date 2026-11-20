import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import {
  ARENA_MESSAGE_MAX,
  uploadArenaMedia,
  type ArenaGifAttachment,
  type ArenaMediaAttachment,
} from '../../services/liveArenaService';
import { errorText } from '../../services/supabaseClient';
import { getGifProviderStatus, type NormalizedGifMedia } from '../../services/gif';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import {
  encodeClashStickerBody,
  type ClashNativeSticker,
} from '../../utils/clashNativeStickers';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { ClashNativeStickerCard } from '../arena/ClashNativeStickerCard';
import {
  ExpressiveMediaTray,
  type ExpressiveMainTab,
  type ExpressiveMediaPick,
} from '../arena/ExpressiveMediaTray';
import { TakeMediaPreview } from '../arena/TakeMediaPreview';
import { CloseIcon, ImageIcon, StickerIcon, VideoIcon } from '../shared/icons';

export interface ComposedArgument {
  body: string;
  media?: ArenaMediaAttachment;
  gif?: ArenaGifAttachment;
  reshareSourceMessageId?: string;
}

export interface LiveRoomComposerProps {
  /** Flatter, feed-native chrome for canonical DUEL Rooms. */
  variant?: 'default' | 'duel';
  /** The room stopped accepting arguments (JUDGING / SETTLED / CANCELLED). */
  disabled?: boolean;
  disabledReason?: string;
  /** Name of the author being answered, when a reply is staged. */
  replyingTo?: string | null;
  sending?: boolean;
  /** Bump to focus the argument field (empty-floor CTA). */
  focusToken?: number;
  /** Parent message id when staging a reply — for targeted typing presence. */
  replyingToMessageId?: string | null;
  onCancelReply?: () => void;
  /** Ephemeral typing signal — never receives draft text. */
  onTypingActivity?: (replyingToMessageId: string | null, hasInput: boolean) => void;
  onTypingClear?: () => void;
  /** Resolve false to keep the draft — the hook already surfaced the reason. */
  onSend: (argument: ComposedArgument) => Promise<boolean>;
  onAddProof: () => void;
  onError?: (message: string) => void;
  /** Opens tray on Meme / GIF / Sticker from message long-press. */
  expressiveTab?: ExpressiveMainTab | null;
  onExpressiveTabConsumed?: () => void;
}

/**
 * The room composer: text, one owned upload or one Tenor GIF, and a shortcut to
 * the evidence sheet.
 *
 * The upload runs here (same create → upload → complete → attach flow as the
 * rebuttal composer) so the argument only reaches the server once the media is
 * `ready` and public. A failed post keeps the draft and the attachment intact.
 */
export function LiveRoomComposer({
  variant = 'default',
  disabled = false,
  disabledReason,
  replyingTo = null,
  sending = false,
  focusToken = 0,
  replyingToMessageId = null,
  onCancelReply,
  onTypingActivity,
  onTypingClear,
  onSend,
  onAddProof,
  onError,
  expressiveTab = null,
  onExpressiveTabConsumed,
}: LiveRoomComposerProps): React.JSX.Element {
  const duelChrome = variant === 'duel';
  const t = useThemeColors();
  const { pickImage, pickVideo } = useMediaPicker();
  const inputRef = React.useRef<TextInput>(null);
  const [draft, setDraft] = React.useState('');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [gif, setGif] = React.useState<NormalizedGifMedia | null>(null);
  const [clashSticker, setClashSticker] = React.useState<ClashNativeSticker | null>(null);
  const [reshareId, setReshareId] = React.useState<string | null>(null);
  const [resharePreview, setResharePreview] = React.useState<string | null>(null);
  const [readyMedia, setReadyMedia] = React.useState<ArenaMediaAttachment | null>(null);
  const [trayOpen, setTrayOpen] = React.useState(false);
  const [trayTab, setTrayTab] = React.useState<ExpressiveMainTab>(() =>
    getGifProviderStatus().configured ? 'gifs' : 'stickers',
  );
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    if (focusToken > 0 && !disabled) {
      const id = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [disabled, focusToken]);

  const hasAttachment =
    Boolean(media) ||
    Boolean(gif) ||
    Boolean(clashSticker) ||
    Boolean(reshareId) ||
    Boolean(readyMedia);
  const busy = sending || uploading;
  const canSend = (draft.trim().length > 0 || hasAttachment) && !busy && !disabled;
  const remaining = ARENA_MESSAGE_MAX - draft.length;

  React.useEffect(() => {
    if (expressiveTab) {
      setTrayTab(expressiveTab);
      setTrayOpen(true);
      onExpressiveTabConsumed?.();
    }
  }, [expressiveTab, onExpressiveTabConsumed]);

  const clearAttachments = (): void => {
    setMedia(null);
    setGif(null);
    setClashSticker(null);
    setReshareId(null);
    setResharePreview(null);
    setReadyMedia(null);
  };

  const attach = async (kind: 'image' | 'video'): Promise<void> => {
    if (disabled || busy) return;
    hapticTap();
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideo();
      if (picked) {
        setGif(null);
        setClashSticker(null);
        setReadyMedia(null);
        setMedia(picked);
      }
    } catch (error) {
      onError?.(errorText(error));
    }
  };

  const submit = async (): Promise<void> => {
    if (!canSend) return;
    hapticPress();
    onTypingClear?.();
    let attachment: ArenaMediaAttachment | undefined = readyMedia ?? undefined;
    if (!attachment && media) {
      setUploading(true);
      try {
        attachment = await uploadArenaMedia(media);
        setReadyMedia(attachment);
      } catch (error) {
        setUploading(false);
        onError?.(errorText(error));
        return;
      }
      setUploading(false);
    }
    const body = clashSticker
      ? encodeClashStickerBody(clashSticker.slug, draft).slice(0, ARENA_MESSAGE_MAX)
      : draft.trim().slice(0, ARENA_MESSAGE_MAX);
    const sent = await onSend({
      body,
      ...(attachment && !clashSticker ? { media: attachment } : {}),
      ...(gif && !clashSticker
        ? { gif: { provider: 'tenor', externalId: gif.id, url: gif.previewUrl } }
        : {}),
      ...(reshareId && !clashSticker ? { reshareSourceMessageId: reshareId } : {}),
    });
    if (sent) {
      onTypingClear?.();
      setDraft('');
      clearAttachments();
    }
  };

  if (disabled) {
    return (
      <View style={[styles.closed, { backgroundColor: t.surfaceElevated, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Text allowFontScaling={false} style={[styles.closedText, { color: t.textMuted }]}>
          {disabledReason ?? 'This room is no longer accepting arguments.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, duelChrome && styles.wrapDuel]}>
      {replyingTo ? (
        <View style={styles.replyRow}>
          <Text allowFontScaling={false} style={[styles.replyLabel, { color: t.textMuted }]}>
            Replying to {replyingTo}
          </Text>
          <Pressable
            onPress={() => {
              hapticTap();
              onTypingClear?.();
              onCancelReply?.();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
          >
            <Text allowFontScaling={false} style={[styles.cancel, { color: t.textSecondary }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.box,
          duelChrome && styles.boxDuel,
          {
            backgroundColor: duelChrome ? t.surfaceMuted : t.surfaceElevated,
            borderColor: t.border,
            shadowColor: t.shadowColor,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={(next) => {
            const value = next.slice(0, ARENA_MESSAGE_MAX);
            setDraft(value);
            onTypingActivity?.(
              replyingToMessageId,
              value.trim().length > 0 || hasAttachment,
            );
          }}
          placeholder={duelChrome ? 'Make your case…' : 'Add your argument…'}
          placeholderTextColor={t.textMuted}
          multiline
          style={[styles.input, duelChrome && styles.inputDuel, { color: t.textPrimary }]}
          accessibilityLabel="Write an argument"
        />

        {media ? (
          <View style={styles.preview}>
            <TakeMediaPreview media={media} onRemove={clearAttachments} />
          </View>
        ) : null}

        {readyMedia || resharePreview ? (
          <View style={[styles.gif, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
            <Image
              source={{ uri: (readyMedia?.url ?? resharePreview) as string }}
              style={styles.gifImage}
              resizeMode="cover"
            />
            <Pressable
              onPress={clearAttachments}
              style={styles.gifRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove meme"
            >
              <CloseIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
            </Pressable>
          </View>
        ) : null}

        {clashSticker ? (
          <View style={styles.stickerPreview}>
            <View style={styles.stickerCard}>
              <ClashNativeStickerCard sticker={clashSticker} size="sm" />
            </View>
            <Pressable
              onPress={clearAttachments}
              style={styles.gifRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove sticker"
            >
              <CloseIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
            </Pressable>
          </View>
        ) : null}

        {gif ? (
          <View style={[styles.gif, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
            <Image source={{ uri: gif.previewUrl }} style={styles.gifImage} resizeMode="cover" />
            <Pressable
              onPress={clearAttachments}
              style={styles.gifRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove GIF"
            >
              <CloseIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.toolbar}>
          <View style={styles.tools}>
            <ToolButton label="Attach photo" onPress={() => void attach('image')} disabled={busy}>
              <ImageIcon size={18} color={t.textSecondary} strokeWidth={2} />
            </ToolButton>
            <ToolButton label="Attach video" onPress={() => void attach('video')} disabled={busy}>
              <VideoIcon size={18} color={t.textSecondary} strokeWidth={2} />
            </ToolButton>
            <ToolButton
              label="Memes, GIFs, and stickers"
              onPress={() => {
                hapticTap();
                setTrayTab(getGifProviderStatus().configured ? 'gifs' : 'stickers');
                setTrayOpen(true);
              }}
              disabled={busy}
            >
              <StickerIcon size={18} color={t.textSecondary} strokeWidth={2} />
            </ToolButton>
            <Pressable
              onPress={() => {
                hapticTap();
                onAddProof();
              }}
              disabled={busy}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Add proof"
              style={[styles.proof, { borderColor: t.border }]}
            >
              <Text allowFontScaling={false} style={[styles.proofText, { color: t.textSecondary }]}>
                Add Proof
              </Text>
            </Pressable>
          </View>

          <View style={styles.sendRow}>
            {busy ? (
              <ActivityIndicator size="small" color={t.textMuted} />
            ) : (
              <Text
                allowFontScaling={false}
                style={[styles.count, { color: remaining <= 40 ? t.accent : t.textMuted }]}
              >
                {remaining}
              </Text>
            )}
            <Pressable
              onPress={() => void submit()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send argument"
              style={[styles.send, { backgroundColor: t.pill }, !canSend && styles.off]}
            >
              <Text allowFontScaling={false} style={[styles.sendText, { color: t.pillText }]}>
                ↑
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ExpressiveMediaTray
        visible={trayOpen}
        source="room"
        initialMainTab={trayTab}
        onClose={() => setTrayOpen(false)}
        onSelect={(pick) => void applyExpressivePick(pick)}
      />
    </View>
  );

  async function applyExpressivePick(pick: ExpressiveMediaPick): Promise<void> {
    setMedia(null);
    setGif(null);
    setClashSticker(null);
    setReshareId(null);
    setResharePreview(null);
    setReadyMedia(null);
    if (pick.channel === 'meme' && 'upload' in pick) {
      await attach('image');
      return;
    }
    if (pick.channel === 'sticker' && 'clash' in pick && pick.clash) {
      setClashSticker(pick.clash);
      return;
    }
    if (pick.channel === 'gif' && pick.media) {
      setGif(pick.media);
      return;
    }
    if (pick.channel === 'sticker' && 'media' in pick && pick.media) {
      setGif(pick.media);
      return;
    }
    if (pick.channel !== 'meme') return;
    if (pick.trending) {
      setReshareId(pick.trending.messageId);
      setResharePreview(pick.trending.previewUrl);
      return;
    }
    if (pick.saved?.sourceMessageId) {
      setReshareId(pick.saved.sourceMessageId);
      setResharePreview(pick.saved.previewUrl);
      return;
    }
    if (pick.saved?.mediaObjectId) {
      setReadyMedia({
        mediaObjectId: pick.saved.mediaObjectId,
        url: pick.saved.mediaUrl,
        kind: 'image',
      });
      return;
    }
    if (pick.media) {
      setGif(pick.media);
    }
  }
}

function ToolButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.tool}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: 8,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  wrapDuel: {
    paddingHorizontal: 0,
    paddingTop: space.sm,
  },
  closed: {
    marginHorizontal: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: 20,
  },
  closedText: { ...typeScale.meta, fontSize: 13, textAlign: 'center' },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  replyLabel: { ...typeScale.caption, fontSize: 11, flexShrink: 1 },
  cancel: { ...typeScale.caption, fontSize: 11, fontWeight: '700' },
  box: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm + 2,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  boxDuel: {
    borderRadius: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    paddingTop: 10,
    paddingBottom: 10,
  },
  input: { ...typeScale.body, fontSize: 15, paddingVertical: 6, minHeight: 40, maxHeight: 132 },
  inputDuel: { fontSize: 16, lineHeight: 22, minHeight: 44, maxHeight: 140 },
  preview: { borderRadius: radius.md, overflow: 'hidden' },
  gif: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  gifImage: { width: 140, height: 104 },
  stickerPreview: { alignSelf: 'flex-start', width: 112, position: 'relative' },
  stickerCard: { width: 112 },
  gifRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.72)',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  tool: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  proof: {
    marginLeft: 2,
    paddingHorizontal: 10,
    height: 28,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  proofText: { ...typeScale.caption, fontSize: 11, fontWeight: '700' },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { ...typeScale.data, fontSize: 10 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  sendText: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
});
