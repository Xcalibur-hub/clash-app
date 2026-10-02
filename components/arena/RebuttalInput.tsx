import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createComment, showNotice, useClash } from '../../store';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { analytics } from '../../services/analytics';
import { postComment, type NewCommentMedia } from '../../services/apiService';
import {
  completeUpload,
  createUpload,
  failUpload,
  getPublicMediaUrl,
  readPickedBytes,
  uploadFile,
} from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { CloseIcon, ImageIcon, VideoIcon } from '../shared/icons';
import { TakeMediaPreview } from './TakeMediaPreview';

const MAX = 180;

/** Best-effort mime for a picked asset; the picker usually provides it. */
function mimeFor(media: PickedMedia): string {
  if (media.mimeType) return media.mimeType;
  const ext = media.uri.split('.').pop()?.toLowerCase();
  const known: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  if (ext && known[ext]) return known[ext];
  return media.kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

export interface RebuttalInputProps {
  takeId: string;
  parentId?: string;
  /** Nesting depth of the reply target (0 = top-level on the Take). */
  replyDepth?: number;
  replyingTo?: string;
  onDone?: () => void;
}

/**
 * Compact conversation composer with optional image/video attachment.
 * Flow: pick → preview → upload → create_comment → appear in thread.
 */
export function RebuttalInput({
  takeId,
  parentId,
  replyDepth = 0,
  replyingTo,
  onDone,
}: RebuttalInputProps): React.JSX.Element {
  const { state, dispatch } = useClash();
  const requireAuth = useRequireAuth();
  const { pickImage, pickVideo } = useMediaPicker();
  const t = useThemeColors();
  const [draft, setDraft] = React.useState('');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<TextInput>(null);

  const expanded = focused || Boolean(draft.trim()) || Boolean(media) || pending;
  const canSend = (Boolean(draft.trim()) || Boolean(media)) && !pending;

  const attach = async (kind: 'image' | 'video'): Promise<void> => {
    if (!requireAuth()) return;
    hapticTap();
    analytics.track('media_reply_picker_opened', {
      source: parentId ? 'comment' : 'take',
      media_type: kind,
      reply_depth: replyDepth,
      realm: 'arena',
    });
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideo();
      if (picked) {
        setMedia(picked);
        setFocused(true);
      }
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const uploadMedia = async (picked: PickedMedia): Promise<NewCommentMedia> => {
    const mime = mimeFor(picked);
    const plan = await createUpload(picked.kind, mime, 'public');
    try {
      const bytes = await readPickedBytes(picked.uri);
      await uploadFile(plan, bytes, mime);
      await completeUpload(plan.id, bytes.byteLength, {
        width: picked.width,
        height: picked.height,
        ...(picked.durationMs ? { durationMs: picked.durationMs } : {}),
      });
      return {
        mediaObjectId: plan.id,
        url: getPublicMediaUrl(plan.bucket, plan.path),
        kind: picked.kind,
      };
    } catch (error) {
      void failUpload(plan.id).catch(() => undefined);
      throw error;
    }
  };

  async function submit(): Promise<void> {
    const text = draft.trim();
    if ((!text && !media) || pending) return;
    if (!requireAuth()) return;
    hapticPress();
    setPending(true);
    try {
      let attached: NewCommentMedia | undefined;
      if (media) {
        setUploading(true);
        attached = await uploadMedia(media);
      }
      const comment = await postComment(takeId, text.slice(0, MAX), parentId, attached);
      if (attached) {
        analytics.track('media_reply_created', {
          source: parentId ? 'comment' : 'take',
          media_type: attached.kind === 'video' ? 'video' : 'image',
          reply_depth: replyDepth,
          realm: 'arena',
        });
      }
      dispatch(createComment(comment));
      setDraft('');
      setMedia(null);
      setFocused(false);
      onDone?.();
    } catch (error) {
      // Keep draft + picked media so the user can retry.
      dispatch(showNotice(errorText(error)));
    } finally {
      setUploading(false);
      setPending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {replyingTo ? (
        <View style={styles.replyRow}>
          <Text allowFontScaling={false} style={[styles.replyLabel, { color: t.textMuted }]}>
            Replying to @{replyingTo}
          </Text>
          <Pressable
            onPress={() => {
              setDraft('');
              setMedia(null);
              setFocused(false);
              onDone?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            hitSlop={8}
          >
            <Text allowFontScaling={false} style={[styles.cancel, { color: t.textSecondary }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.composerRow}>
        <Avatar name={state.viewer.name} tint={state.viewer.tint} size={expanded ? 28 : 26} />
        <View
          style={[
            styles.box,
            {
              backgroundColor: t.inputBackground,
              borderColor: expanded ? t.borderStrong : t.border,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={(next) => setDraft(next.slice(0, MAX))}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              if (!draft.trim() && !media && !pending) setFocused(false);
            }}
            placeholder={parentId ? 'Write a reply…' : 'Write a reply…'}
            placeholderTextColor={t.textMuted}
            multiline={expanded}
            style={[
              styles.input,
              { color: t.textPrimary, minHeight: expanded ? 44 : 36 },
            ]}
            accessibilityLabel={parentId ? 'Reply to rebuttal' : 'Add to the conversation'}
          />

          {media ? (
            <View style={styles.preview}>
              <TakeMediaPreview media={media} onRemove={() => setMedia(null)} />
            </View>
          ) : null}

          {expanded ? (
            <View style={styles.toolbar}>
              <View style={styles.attachRow}>
                <Pressable
                  onPress={() => {
                    void attach('image');
                  }}
                  disabled={pending}
                  accessibilityRole="button"
                  accessibilityLabel="Attach photo"
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <ImageIcon size={18} color={t.textSecondary} strokeWidth={2} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void attach('video');
                  }}
                  disabled={pending}
                  accessibilityRole="button"
                  accessibilityLabel="Attach video"
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <VideoIcon size={18} color={t.textSecondary} strokeWidth={2} />
                </Pressable>
                {media ? (
                  <Pressable
                    onPress={() => setMedia(null)}
                    disabled={pending}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attachment"
                    hitSlop={6}
                    style={styles.iconBtn}
                  >
                    <CloseIcon size={16} color={t.textMuted} strokeWidth={2.2} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.sendRow}>
                {uploading || pending ? (
                  <ActivityIndicator size="small" color={t.textMuted} />
                ) : (
                  <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
                    {MAX - draft.length}
                  </Text>
                )}
                <Pressable
                  onPress={() => {
                    void submit();
                  }}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel={parentId ? 'Send reply' : 'Send'}
                  style={[styles.send, { backgroundColor: t.clashFill }, !canSend && styles.off]}
                >
                  <Text allowFontScaling={false} style={[styles.sendText, { color: t.clashText }]}>
                    {uploading ? '…' : 'Send'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.compactActions}>
              <Pressable
                onPress={() => {
                  void attach('image');
                }}
                accessibilityRole="button"
                accessibilityLabel="Attach photo"
                hitSlop={6}
                style={styles.iconBtn}
              >
                <ImageIcon size={17} color={t.textMuted} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setFocused(true);
                  inputRef.current?.focus();
                }}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send"
                style={[styles.sendCompact, { backgroundColor: t.clashFill }, !canSend && styles.off]}
              >
                <Text allowFontScaling={false} style={[styles.sendText, { color: t.clashText }]}>
                  ↑
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  replyLabel: { ...typeScale.meta, fontSize: 12 },
  cancel: { ...typeScale.meta, fontSize: 12, fontWeight: '600' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  box: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
  input: {
    ...typeScale.body,
    fontSize: 15,
    paddingVertical: 6,
    maxHeight: 120,
  },
  preview: { borderRadius: radius.md, overflow: 'hidden' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { ...typeScale.data, fontSize: 10 },
  send: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.35 },
  sendText: { fontSize: 13, fontWeight: '800', lineHeight: 16 },
});
