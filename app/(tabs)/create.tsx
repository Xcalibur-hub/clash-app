import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TakeComposerFields } from '../../components/arena/TakeComposerFields';
import { TakeMediaPreview } from '../../components/arena/TakeMediaPreview';
import { createTakeStyles as styles } from '../../components/arena/createTakeStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { GlowButton } from '../../components/shared/GlowButton';
import { IconButton } from '../../components/shared/IconButton';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { CloseIcon } from '../../components/shared/icons';
import { HOOD_IDS, toDbHood } from '../../data/hoods';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { postTake, type NewTakeMedia } from '../../services/apiService';
import {
  completeUpload,
  createUpload,
  failUpload,
  getPublicMediaUrl,
  readPickedBytes,
  uploadFile,
} from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { createTake, showNotice, useClash } from '../../store';
import type { DbHood } from '../../supabase/types';
import { space, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

const MAX_CHARS = 180;

const CURATED_TITLES = [
  'AI-generated videos are already better than most Hollywood trailers.',
  'The campus degree is becoming obsolete.',
  'iPhone users pay too much for the same experience.',
  'Pixel takes better photos than the iPhone.',
  'Ranked matchmaking ruined casual gaming.',
];

function suggestPrompt(): string {
  const pick = CURATED_TITLES[Math.floor(Math.random() * CURATED_TITLES.length)];
  return `"${pick}"`;
}

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

/**
 * TAKE CREATION (spec §7): identity, a Hood picker, one multiline field with a
 * live 180-character counter, and a real media flow — pick → createUpload →
 * uploadFile → completeUpload → create_take RPC. No direct Storage calls here.
 */
export default function CreateTakeScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useClash();
  const viewer = state.viewer;
  const { pickImage, pickVideo } = useMediaPicker();
  const requireAuth = useRequireAuth();
  const theme = useThemeColors();

  const [text, setText] = React.useState('');
  const [hood, setHood] = React.useState<DbHood>(toDbHood(viewer.hood));
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [posting, setPosting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const placeholder = React.useMemo(suggestPrompt, []);

  const charsLeft = MAX_CHARS - text.length;
  const overLimit = charsLeft < 0;
  const hasDraft = text.trim().length > 0 || media !== null;
  const canDrop = text.trim().length > 0 && !overLimit && !posting;

  const doDismiss = (): void => {
    hapticTap();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  };

  const dismiss = (): void => {
    if (!hasDraft) {
      doDismiss();
      return;
    }
    hapticTap();
    Alert.alert('Discard your take?', 'Your draft will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: doDismiss },
    ]);
  };

  const attach = async (kind: 'image' | 'video'): Promise<void> => {
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideo();
      if (picked) setMedia(picked);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const removeMedia = (): void => setMedia(null);

  const uploadMedia = async (picked: PickedMedia): Promise<NewTakeMedia> => {
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
      return { mediaObjectId: plan.id, url: getPublicMediaUrl(plan.bucket, plan.path), kind: picked.kind };
    } catch (error) {
      void failUpload(plan.id).catch(() => undefined);
      throw error;
    }
  };

  async function drop(): Promise<void> {
    if (!canDrop) return;
    if (!requireAuth()) return;
    hapticPress();
    setPosting(true);
    try {
      let newMedia: NewTakeMedia | undefined;
      if (media) {
        setUploading(true);
        newMedia = await uploadMedia(media);
      }
      // create_take derives the author and stamps expiry/counters server-side.
      const take = await postTake(text.trim(), hood, newMedia);
      dispatch(createTake(take));
      router.replace('/(tabs)');
    } catch (error) {
      // The draft stays put — a failed drop never loses the take.
      dispatch(showNotice(errorText(error)));
    } finally {
      setUploading(false);
      setPosting(false);
    }
  }

  return (
    <AuroraBackground tone="arena">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeading
            eyebrow="YOUR VOICE"
            title="What's your take?"
            marked
            accessory={
              <IconButton icon={CloseIcon} onPress={dismiss} label="Close take creation" />
            }
          />

          <TakeComposerFields
            text={text}
            onChangeText={(next) => setText(next.slice(0, MAX_CHARS))}
            placeholder={placeholder}
            charsLeft={charsLeft}
            maxChars={MAX_CHARS}
            overLimit={overLimit}
            hood={hood}
            onChangeHood={(next) => setHood(toDbHood(next))}
            onAttach={(kind) => {
              void attach(kind);
            }}
            hoods={HOOD_IDS}
          />

          {media ? <TakeMediaPreview media={media} onRemove={removeMedia} /> : null}

          <View style={{ height: space.xxl }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <GlowButton
            label={uploading ? 'Uploading…' : posting ? 'Dropping…' : 'Drop It'}
            onPress={() => {
              void drop();
            }}
            tone="ink"
            pill
            disabled={!canDrop}
            style={styles.cta}
            accessibilityLabel="Drop your take into the Arena"
            accessibilityHint="Publishes your take and awards 30 XP"
          />
          <Text allowFontScaling={false} style={[styles.disclaimer, { color: theme.textMuted }]}>
            {canDrop ? 'Your take self-destructs after 24 hours.' : 'Write something first.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </AuroraBackground>
  );
}
