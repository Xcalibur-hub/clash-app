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
import { createComment, showNotice, useClash } from '../../store';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useOperationScope } from '../../hooks/useOperationScope';
import { analytics } from '../../services/analytics';
import { postComment, type NewCommentGif, type NewCommentMedia } from '../../services/apiService';
import {
  completeUpload,
  createUpload,
  failUpload,
  getPublicMediaUrl,
  readPickedBytes,
  uploadFile,
} from '../../services/mediaService';
import type { TenorGif } from '../../services/tenorService';
import { currentUserId,errorText } from '../../services/supabaseClient';
import { useAuth } from '../../store/AuthProvider';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { CloseIcon, ImageIcon, StickerIcon, VideoIcon } from '../shared/icons';
import { GifPickerSheet } from './GifPickerSheet';
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
 * Conversation composer: text + image/video upload + Tenor GIF.
 * Upload flow unchanged; GIFs skip storage and post via create_comment.
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
  const [gif, setGif] = React.useState<TenorGif | null>(null);
  const [gifOpen, setGifOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [sendError,setSendError]=React.useState<string|null>(null);
  const inputRef = React.useRef<TextInput>(null);
  const {user}=useAuth();
  const scope=`${user?.id??'guest'}:${takeId}:${parentId??''}`;
  const isCurrent=useOperationScope(scope),busy=React.useRef(false);
  const uploaded=React.useRef<{scope:string;picked:PickedMedia;ready:NewCommentMedia}|null>(null);
  React.useEffect(()=>{setDraft('');clearAttachments();setGifOpen(false);setPending(false);setUploading(false);setSendError(null);busy.current=false;uploaded.current=null;
  },[scope]);

  const hasAttachment = Boolean(media) || Boolean(gif);
  const expanded = focused || Boolean(draft.trim()) || hasAttachment || pending;
  const canSend = (Boolean(draft.trim()) || hasAttachment) && !pending;

  const clearAttachments = (): void => {
    setMedia(null);
    setGif(null);
  };

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
      if(!isCurrent())return;
      if (picked) {
        setGif(null);
        setMedia(picked);
        setFocused(true);
      }
    } catch (error) {
      if(isCurrent())dispatch(showNotice(errorText(error)));
    }
  };

  const openGifPicker = (): void => {
    if (!requireAuth()) return;
    hapticTap();
    setGifOpen(true);
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
    if ((!text && !media && !gif) || busy.current) return;
    if (!requireAuth()) return;
    busy.current=true;
    setSendError(null);
    hapticPress();
    setPending(true);
    try {
      if(!user?.id||await currentUserId()!==user.id||!isCurrent())throw new Error('Account changed. Reopen the reply.');
      let attached: NewCommentMedia | undefined;
      let attachedGif: NewCommentGif | undefined;
      if (media) {
        setUploading(true);
        attached = uploaded.current?.scope===scope&&uploaded.current.picked===media?uploaded.current.ready:await uploadMedia(media);
        if(!isCurrent())return;
        uploaded.current={scope,picked:media,ready:attached};
      } else if (gif) {
        attachedGif = {
          provider: 'tenor',
          externalId: gif.id,
          url: gif.previewUrl,
        };
      }
      if(!isCurrent()||await currentUserId()!==user.id)return;
      const comment = await postComment(
        takeId,
        text.slice(0, MAX),
        parentId,
        attached,
        attachedGif,
      );
      if(!isCurrent()||await currentUserId()!==user.id)return;
      if (attached) {
        analytics.track('media_reply_created', {
          source: parentId ? 'comment' : 'take',
          media_type: attached.kind === 'video' ? 'video' : 'image',
          reply_depth: replyDepth,
          realm: 'arena',
        });
      } else if (attachedGif) {
        analytics.track('gif_reply_created', {
          source: parentId ? 'comment' : 'take',
          media_type: 'gif',
          reply_depth: replyDepth,
          realm: 'arena',
        });
      }
      dispatch(createComment(comment));
      setDraft('');
      clearAttachments();
      uploaded.current=null;
      setFocused(false);
      onDone?.();
    } catch (error) {
      if(isCurrent()){setSendError('Your reply was not confirmed. Your draft is kept; check your connection before sending again.');dispatch(showNotice(errorText(error)));}
    } finally {
      if(isCurrent()){busy.current=false;setUploading(false);setPending(false);}
    }
  }

  const attachButtons = (
    <>
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
      <Pressable
        onPress={openGifPicker}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel="Attach GIF"
        hitSlop={6}
        style={styles.iconBtn}
      >
        <StickerIcon size={18} color={t.textSecondary} strokeWidth={2} />
      </Pressable>
      {hasAttachment ? (
        <Pressable
          onPress={clearAttachments}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          hitSlop={6}
          style={styles.iconBtn}
        >
          <CloseIcon size={16} color={t.textMuted} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </>
  );

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
              clearAttachments();
              setFocused(false);
              onDone?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            disabled={pending}
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
              if (!draft.trim() && !hasAttachment && !pending) setFocused(false);
            }}
            placeholder="Write a reply…"
            placeholderTextColor={t.textMuted}
            multiline={expanded}
            editable={!pending}
            style={[styles.input, { color: t.textPrimary, minHeight: expanded ? 44 : 36 }]}
            accessibilityLabel={parentId ? 'Reply to rebuttal' : 'Add to the conversation'}
          />

          {media ? (
            <View style={styles.preview}>
              <TakeMediaPreview media={media} onRemove={()=>{if(!pending)clearAttachments();}} />
            </View>
          ) : null}
          {gif ? (
            <View style={[styles.gifPreview, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
              <Image source={{ uri: gif.previewUrl }} style={styles.gifImage} resizeMode="cover" />
              <Pressable
                onPress={clearAttachments}
                style={styles.gifRemove}
                accessibilityRole="button"
                accessibilityLabel="Remove GIF"
                disabled={pending}
              >
                <CloseIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : null}

          {expanded ? (
            <View style={styles.toolbar}>
              <View style={styles.attachRow}>{attachButtons}</View>
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
                onPress={openGifPicker}
                accessibilityRole="button"
                accessibilityLabel="Attach GIF"
                hitSlop={6}
                style={styles.iconBtn}
              >
                <StickerIcon size={17} color={t.textMuted} strokeWidth={2} />
              </Pressable>
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
      {sendError?<Text accessibilityRole="alert" style={{color:t.textSecondary,padding:space.sm}}>{sendError}</Text>:null}

      <GifPickerSheet
        visible={gifOpen}
        source={parentId ? 'comment' : 'take'}
        onClose={() => setGifOpen(false)}
        onSelect={(selected) => {
          setMedia(null);
          setGif(selected);
          setFocused(true);
        }}
      />
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
  gifPreview: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  gifImage: { width: 160, height: 120 },
  gifRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.72)',
  },
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
