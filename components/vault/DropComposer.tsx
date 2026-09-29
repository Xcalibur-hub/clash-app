import React from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showNotice, useClash } from '../../store';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { fetchMyVault, createDrop, publishDrop } from '../../services/vaultService';
import type { CreatorVault } from '../../services/vaultMappers';
import { completeUpload, createUpload, failUpload, readPickedBytes, uploadFile } from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import type { MediaVisibility } from '../../supabase/types';
import { color, ink, layout, radius, space, typeScale } from '../../theme';
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
 * The Drop composer. Access level decides the bucket: Free → public media,
 * Subscriber → private media, and the backend re-checks it anyway. A Drop is
 * created as a draft and published explicitly — the 7-day window is stamped by
 * the server on publish, never chosen here.
 */
export function DropComposer(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dispatch } = useClash();
  const { pickImage, pickVideo } = useMediaPicker();
  const requireAuth = useRequireAuth();

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
      style={styles.screen}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      >
        <BackButton onPress={() => router.back()} />
        <Text allowFontScaling={false} style={styles.kicker}>YOUR VAULT</Text>
        <Text allowFontScaling={false} style={styles.title}>New Drop</Text>

        <Text allowFontScaling={false} style={styles.label}>Access</Text>
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
                style={[styles.segmentItem, active && styles.segmentItemOn]}
              >
                <Icon size={15} color={active ? ink.primary : ink.tertiary} strokeWidth={2.4} />
                <Text allowFontScaling={false} style={[styles.segmentLabel, active && styles.segmentLabelOn]}>
                  {level === 'free' ? 'Free' : 'Subscriber'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text allowFontScaling={false} style={styles.hint}>
          {accessLevel === 'free'
            ? 'A free Drop uses public media — anyone can open it.'
            : 'A subscriber Drop uses private media — only entitled subscribers can open it.'}
        </Text>

        <Text allowFontScaling={false} style={styles.label}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={(next) => setCaption(next.slice(0, MAX_CAPTION))}
          multiline
          maxLength={MAX_CAPTION}
          placeholder="What is this Drop?"
          placeholderTextColor={ink.quaternary}
          accessibilityLabel="Drop caption"
          style={styles.input}
        />
        <Text allowFontScaling={false} style={styles.counter}>{caption.length}/{MAX_CAPTION}</Text>

        <Text allowFontScaling={false} style={styles.label}>Media</Text>
        {media ? (
          <View style={styles.preview}>
            <Image source={{ uri: media.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
            <Pressable
              onPress={() => setMedia(null)}
              accessibilityRole="button"
              accessibilityLabel="Remove media"
              style={styles.removeMedia}
            >
              <Text allowFontScaling={false} style={styles.removeMediaText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.pickRow}>
            <GlowButton label="Image" icon={ImageIcon} tone="ink" compact onPress={() => void attach('image')} />
            <GlowButton label="Video" icon={VideoIcon} tone="ink" compact onPress={() => void attach('video')} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <GlowButton label={busy ? 'Working…' : 'Save draft'} onPress={() => void submit(false)} tone="ink" disabled={!canSubmit} style={styles.footerBtn} />
        <GlowButton label={busy ? 'Working…' : 'Publish'} onPress={() => void submit(true)} tone="light" disabled={!canSubmit} style={styles.footerBtn} />
      </View>
    </KeyboardAvoidingView>
  );
}

function BackButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return <GlowButton label="Back" icon={BackIcon} tone="ink" compact onPress={onPress} style={styles.back} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: layout.screenX, gap: space.md, paddingBottom: space.xxl },
  back: { alignSelf: 'flex-start' },
  kicker: { ...typeScale.eyebrow, color: ink.tertiary },
  title: { ...typeScale.title, color: ink.primary },
  label: { ...typeScale.eyebrow, color: ink.tertiary },
  hint: { ...typeScale.meta, color: ink.tertiary },
  segment: { flexDirection: 'row', gap: space.xs },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  segmentItemOn: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)' },
  segmentLabel: { ...typeScale.label, color: ink.tertiary },
  segmentLabelOn: { color: ink.primary },
  input: {
    ...typeScale.body,
    color: ink.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  counter: { ...typeScale.meta, color: ink.quaternary, alignSelf: 'flex-end' },
  pickRow: { flexDirection: 'row', gap: space.sm },
  preview: { aspectRatio: 16 / 9, width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#18181B' },
  removeMedia: { position: 'absolute', top: space.sm, right: space.sm, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: 'rgba(9,9,11,0.7)' },
  removeMediaText: { ...typeScale.caption, color: ink.primary },
  footer: { flexDirection: 'row', gap: space.sm, paddingHorizontal: layout.screenX, paddingTop: space.sm },
  footerBtn: { flex: 1 },
});

