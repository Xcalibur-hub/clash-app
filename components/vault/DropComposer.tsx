import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showNotice, useClash } from '../../store';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { fetchMyVault, createDrop, publishDrop } from '../../services/vaultService';
import type { CreatorVault } from '../../services/vaultMappers';
import { completeUpload, createUpload, failUpload, readPickedBytes, uploadFile } from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import type { MediaVisibility } from '../../supabase/types';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { GlowButton } from '../shared/GlowButton';
import { BackIcon, ImageIcon, LockIcon, VideoIcon, VaultIcon } from '../shared/icons';

const MAX_CAPTION = 280;

function mimeFor(media: PickedMedia): string {
  if (media.mimeType) return media.mimeType;
  const ext = media.uri.split('.').pop()?.toLowerCase();
  const known: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  };
  if (ext && known[ext]) return known[ext];
  return media.kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

/**
 * Drop composer — access level decides public vs private media.
 * 7-day window stamped by server on publish.
 */
export function DropComposer(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dispatch } = useClash();
  const { pickImage, pickVideo } = useMediaPicker();
  const requireAuth = useRequireAuth();
  const t = useThemeColors();

  const [vault, setVault] = React.useState<CreatorVault | null | 'loading'>('loading');
  const [caption, setCaption] = React.useState('');
  const [accessLevel, setAccessLevel] = React.useState<'free' | 'subscriber'>('free');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      try {
        setVault(await fetchMyVault());
      } catch (error) {
        dispatch(showNotice(errorText(error)));
        setVault(null);
      }
    })();
  }, [dispatch]);

  const attach = async (kind: 'image' | 'video'): Promise<void> => {
    const picked = kind === 'image' ? await pickImage() : await pickVideo();
    if (picked) setMedia(picked);
  };

  const uploadMedia = async (picked: PickedMedia, visibility: MediaVisibility): Promise<string> => {
    const mime = mimeFor(picked);
    const plan = await createUpload(picked.kind, mime, visibility);
    try {
      const bytes = await readPickedBytes(picked.uri);
      await uploadFile(plan, bytes, mime);
      await completeUpload(plan.id, bytes.byteLength, {
        width: picked.width,
        height: picked.height,
        ...(picked.durationMs ? { durationMs: picked.durationMs } : {}),
      });
      return plan.id;
    } catch (error) {
      void failUpload(plan.id).catch(() => undefined);
      throw error;
    }
  };

  const submit = async (publish: boolean): Promise<void> => {
    if (vault === 'loading' || !vault) return;
    if (!requireAuth()) return;
    if (caption.trim().length === 0) {
      dispatch(showNotice('Add a caption first.'));
      return;
    }
    setBusy(true);
    try {
      const visibility: MediaVisibility = accessLevel === 'subscriber' ? 'private' : 'public';
      const mediaObjectId = media ? await uploadMedia(media, visibility) : undefined;
      const drop = await createDrop(vault.id, caption.trim(), accessLevel, mediaObjectId);
      if (publish) await publishDrop(drop.id);
      analytics.track('vault_drop_created', {
        realm: 'vault',
        vault_access_type: accessLevel,
        media_type: media ? (media.kind === 'video' ? 'video' : 'image') : 'none',
        take_has_media: Boolean(media),
      });
      dispatch(showNotice(publish ? 'Drop published.' : 'Draft saved.'));
      router.back();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = caption.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: t.background }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: space.xxl,
          },
        ]}
      >
        <GlowButton label="Back" icon={BackIcon} tone="ink" compact onPress={() => router.back()} style={styles.back} />
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          YOUR VAULT
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          New Drop
        </Text>

        <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
          Access
        </Text>
        <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Drop access level">
          {(['free', 'subscriber'] as const).map((level) => {
            const active = accessLevel === level;
            const Icon = level === 'free' ? VaultIcon : LockIcon;
            return (
              <Pressable
                key={level}
                onPress={() => setAccessLevel(level)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${level === 'free' ? 'Free' : 'Subscriber'} drop`}
                style={[
                  styles.segmentItem,
                  {
                    borderColor: t.border,
                    backgroundColor: active
                      ? t.scheme === 'light'
                        ? t.textPrimary
                        : 'rgba(255,255,255,0.10)'
                      : t.surfaceMuted,
                  },
                ]}
              >
                <Icon
                  size={15}
                  color={active ? (t.scheme === 'light' ? t.textInverse : t.textPrimary) : t.textMuted}
                  strokeWidth={2.4}
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.segmentLabel,
                    {
                      color: active
                        ? t.scheme === 'light'
                          ? t.textInverse
                          : t.textPrimary
                        : t.textMuted,
                    },
                  ]}
                >
                  {level === 'free' ? 'Free' : 'Subscriber'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
          {accessLevel === 'free'
            ? 'Anyone can open this Drop. It disappears after 7 days.'
            : 'Only entitled subscribers can open this. Private media stays private.'}
        </Text>

        <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
          Caption
        </Text>
        <TextInput
          value={caption}
          onChangeText={(next) => setCaption(next.slice(0, MAX_CAPTION))}
          multiline
          maxLength={MAX_CAPTION}
          placeholder="What is this Drop?"
          placeholderTextColor={t.textMuted}
          accessibilityLabel="Drop caption"
          style={[
            styles.input,
            {
              color: t.textPrimary,
              borderColor: t.border,
              backgroundColor: t.inputBackground,
            },
          ]}
        />
        <Text allowFontScaling={false} style={[styles.counter, { color: t.textMuted }]}>
          {caption.length}/{MAX_CAPTION}
        </Text>

        <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
          Media
        </Text>
        {media ? (
          <View style={[styles.preview, { backgroundColor: t.surfaceMuted }]}>
            <Image source={{ uri: media.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
            <Pressable
              onPress={() => setMedia(null)}
              accessibilityRole="button"
              accessibilityLabel="Remove media"
              style={[styles.removeMedia, { backgroundColor: 'rgba(9,9,11,0.7)' }]}
            >
              <Text allowFontScaling={false} style={styles.removeMediaText}>
                Remove
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.pickRow}>
            <GlowButton label="Image" icon={ImageIcon} tone="ink" compact onPress={() => void attach('image')} />
            <GlowButton label="Video" icon={VideoIcon} tone="ink" compact onPress={() => void attach('video')} />
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + space.md,
            borderTopColor: t.border,
            backgroundColor: t.background,
          },
        ]}
      >
        <GlowButton
          label={busy ? 'Working…' : 'Save draft'}
          onPress={() => void submit(false)}
          tone="ink"
          disabled={!canSubmit}
          style={styles.footerBtn}
        />
        <GlowButton
          label={busy ? 'Working…' : 'Publish'}
          onPress={() => void submit(true)}
          tone="light"
          disabled={!canSubmit}
          style={styles.footerBtn}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, gap: space.md },
  back: { alignSelf: 'flex-start' },
  kicker: { ...typeScale.caption, letterSpacing: 0.8 },
  title: { ...typeScale.title },
  label: { ...typeScale.caption, letterSpacing: 0.4 },
  hint: { ...typeScale.meta },
  segment: { flexDirection: 'row', gap: space.xs },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentLabel: { ...typeScale.label },
  input: {
    ...typeScale.body,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  counter: { ...typeScale.meta, alignSelf: 'flex-end' },
  pickRow: { flexDirection: 'row', gap: space.sm },
  preview: {
    aspectRatio: 16 / 9,
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  removeMedia: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  removeMediaText: { ...typeScale.caption, color: '#FAFAF8' },
  footer: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flex: 1 },
});
