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
import type { TenorGif } from '../../services/tenorService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { GifPickerSheet } from '../arena/GifPickerSheet';
import { TakeMediaPreview } from '../arena/TakeMediaPreview';
import { CloseIcon, ImageIcon, StickerIcon, VideoIcon } from '../shared/icons';

export interface ComposedArgument {
  body: string;
  media?: ArenaMediaAttachment;
  gif?: ArenaGifAttachment;
}

export interface LiveRoomComposerProps {
  /** The room stopped accepting arguments (JUDGING / SETTLED / CANCELLED). */
  disabled?: boolean;
  disabledReason?: string;
  /** Name of the author being answered, when a reply is staged. */
  replyingTo?: string | null;
  sending?: boolean;
  onCancelReply?: () => void;
  /** Resolve false to keep the draft — the hook already surfaced the reason. */
  onSend: (argument: ComposedArgument) => Promise<boolean>;
  onAddProof: () => void;
  onError?: (message: string) => void;
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
  disabled = false,
  disabledReason,
  replyingTo = null,
  sending = false,
  onCancelReply,
  onSend,
  onAddProof,
  onError,
}: LiveRoomComposerProps): React.JSX.Element {
  const t = useThemeColors();
  const { pickImage, pickVideo } = useMediaPicker();
  const [draft, setDraft] = React.useState('');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [gif, setGif] = React.useState<TenorGif | null>(null);
  const [gifOpen, setGifOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const hasAttachment = Boolean(media) || Boolean(gif);
  const busy = sending || uploading;
  const canSend = (draft.trim().length > 0 || hasAttachment) && !busy && !disabled;
  const remaining = ARENA_MESSAGE_MAX - draft.length;

  const clearAttachments = (): void => {
    setMedia(null);
    setGif(null);
  };

  const attach = async (kind: 'image' | 'video'): Promise<void> => {
    if (disabled || busy) return;
    hapticTap();
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideo();
      if (picked) {
        setGif(null);
        setMedia(picked);
      }
    } catch (error) {
      onError?.(errorText(error));
    }
  };

  const submit = async (): Promise<void> => {
    if (!canSend) return;
    hapticPress();
    let attachment: ArenaMediaAttachment | undefined;
    if (media) {
      setUploading(true);
      try {
        attachment = await uploadArenaMedia(media);
      } catch (error) {
        setUploading(false);
        onError?.(errorText(error));
        return;
      }
      setUploading(false);
    }
    const sent = await onSend({
      body: draft.trim().slice(0, ARENA_MESSAGE_MAX),
      ...(attachment ? { media: attachment } : {}),
      ...(gif ? { gif: { provider: 'tenor', externalId: gif.id, url: gif.previewUrl } } : {}),
    });
    if (sent) {
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
    <View style={styles.wrap}>
      {replyingTo ? (
        <View style={styles.replyRow}>
          <Text allowFontScaling={false} style={[styles.replyLabel, { color: t.textMuted }]}>
            Replying to {replyingTo}
          </Text>
          <Pressable
            onPress={() => {
              hapticTap();
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
          {
            backgroundColor: t.surfaceElevated,
            borderColor: t.border,
            shadowColor: t.shadowColor,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={(next) => setDraft(next.slice(0, ARENA_MESSAGE_MAX))}
          placeholder="Add your argument…"
          placeholderTextColor={t.textMuted}
          multiline
          style={[styles.input, { color: t.textPrimary }]}
          accessibilityLabel="Write an argument"
        />

        {media ? (
          <View style={styles.preview}>
            <TakeMediaPreview media={media} onRemove={clearAttachments} />
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
              label="Attach GIF"
              onPress={() => {
                hapticTap();
                setGifOpen(true);
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

      <GifPickerSheet
        visible={gifOpen}
        source="comment"
        onClose={() => setGifOpen(false)}
        onSelect={(selected) => {
          setMedia(null);
          setGif(selected);
        }}
      />
    </View>
  );
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
  input: { ...typeScale.body, fontSize: 15, paddingVertical: 6, minHeight: 40, maxHeight: 132 },
  preview: { borderRadius: radius.md, overflow: 'hidden' },
  gif: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  gifImage: { width: 140, height: 104 },
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
