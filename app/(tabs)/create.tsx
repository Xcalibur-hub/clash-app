import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
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
import { analytics } from '../../services/analytics';
import { postTake, type NewTakeMedia } from '../../services/apiService';
import { createQuestion } from '../../services/arenaQuestionService';
import { currentUserId } from '../../services/supabaseClient';
import { validQuestionChoices } from '../../utils/arenaQuestions';
import { SegmentedTabs } from '../../components/shared/SegmentedTabs';
import {
  completeUpload,
  createUpload,
  failUpload,
  getPublicMediaUrl,
  readPickedBytes,
  uploadFile,
  uploadVideoPoster,
} from '../../services/mediaService';
import { generateVideoPosterUri } from '../../services/videoPoster';
import { logger } from '../../services/logger';
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
  const [kind,setKind]=React.useState<'take'|'question'>('take');
  const [sideA,setSideA]=React.useState(''),[sideB,setSideB]=React.useState('');
  const working=React.useRef(false),uploaded=React.useRef<{picked:PickedMedia;ready:NewTakeMedia}|null>(null);
  const [hood, setHood] = React.useState<DbHood>(toDbHood(viewer.hood));
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [posting, setPosting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const placeholder = React.useMemo(suggestPrompt, []);

  const charsLeft = MAX_CHARS - text.length;
  const overLimit = charsLeft < 0;
  const hasDraft = text.trim().length > 0 || media !== null || (kind==='question' && Boolean(sideA||sideB));
  const canDrop = text.trim().length > 0 && !overLimit && !posting && (kind==='take'||validQuestionChoices(sideA,sideB));

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

      let posterUrl: string | undefined;
      if (picked.kind === 'video') {
        const localPoster = await generateVideoPosterUri(picked.uri, picked.durationMs);
        if (localPoster) {
          try {
            const posterBytes = await readPickedBytes(localPoster);
            posterUrl = await uploadVideoPoster(plan, posterBytes);
          } catch (error) {
            logger.warn('video poster upload failed; take will use gradient fallback', {
              source: 'create.uploadMedia',
              message: error instanceof Error ? error.message : 'unknown',
            });
          }
        }
      }

      return {
        mediaObjectId: plan.id,
        url: getPublicMediaUrl(plan.bucket, plan.path),
        kind: picked.kind,
        ...(posterUrl ? { posterUrl } : {}),
      };
    } catch (error) {
      void failUpload(plan.id).catch(() => undefined);
      throw error;
    }
  };

  async function drop(): Promise<void> {
    if (!canDrop || working.current) return;
    if (!requireAuth()) return;
    working.current=true;
    const account=await currentUserId();
    if(!account){working.current=false;return;}
    hapticPress();
    setPosting(true);
    try {
      let newMedia: NewTakeMedia | undefined;
      if (media) {
        setUploading(true);
        newMedia = uploaded.current?.picked===media ? uploaded.current.ready : await uploadMedia(media);
        uploaded.current={picked:media,ready:newMedia};
      }
      // create_take derives the author and stamps expiry/counters server-side.
      if(await currentUserId()!==account)throw new Error('Account changed. Reopen the composer.');
      const take = kind==='question' ? await createQuestion(text.trim(),hood,sideA.trim(),sideB.trim(),account,newMedia) : await postTake(text.trim(), hood, newMedia);
      if(await currentUserId()!==account)return;
      analytics.track('take_created', {
        realm: 'arena',
        hood_id: hood,
        take_has_media: Boolean(newMedia),
        media_type: newMedia ? (media?.kind === 'video' ? 'video' : 'image') : 'none',
      });
      dispatch(createTake(take));
      router.replace('/(tabs)');
    } catch (error) {
      // The draft stays put — a failed drop never loses the take.
      dispatch(showNotice(errorText(error)));
    } finally {
      setUploading(false);
      setPosting(false);
      working.current=false;
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
            title={kind==='question'?'Ask the Arena':"What's your take?"}
            marked
            accessory={
              <IconButton icon={CloseIcon} onPress={dismiss} label="Close take creation" />
            }
          />

          <SegmentedTabs value={kind} items={[{key:'take',label:'Take'},{key:'question',label:'A/B question'}]} onChange={next=>{if(!posting)setKind(next);}} label="Post type" />
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

          {kind==='question'?<View style={{gap:space.sm,marginTop:space.md}}>
            <Text style={{color:theme.textSecondary}}>Two clear choices · Separate from Clash judging</Text>
            {([{side:'A',value:sideA,set:setSideA},{side:'B',value:sideB,set:setSideB}]).map(option=><View key={option.side} style={{gap:space.xs}}><Text style={{color:theme.textMuted}}>OPTION {option.side} · {option.value.length}/60</Text><TextInput
              accessibilityLabel={`Side ${option.side} label`} placeholder={`Side ${option.side}`} placeholderTextColor={theme.textMuted}
              value={option.value} onChangeText={option.set} maxLength={60} editable={!posting}
              accessibilityHint="Use a short, distinct and fairly worded choice"
              style={{color:theme.textPrimary,borderColor:theme.border,borderWidth:1,borderRadius:12,padding:space.md,minHeight:52}} /></View>)}
            {sideA.trim()&&sideB.trim()&&!validQuestionChoices(sideA,sideB)?<Text accessibilityRole="alert" style={{color:theme.textSecondary}}>Give each option a different, meaningful label.</Text>:null}
          </View>:null}

          {media ? <TakeMediaPreview media={media} onRemove={removeMedia} /> : null}

          <View style={{ height: space.xxl }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <GlowButton
            label={uploading ? 'Uploading…' : posting ? 'Publishing…' : kind==='question'?'Publish question':'Drop It'}
            onPress={() => {
              void drop();
            }}
            tone="ink"
            pill
            disabled={!canDrop}
            style={styles.cta}
            accessibilityLabel={kind==='question'?'Publish your A/B question':'Drop your take into the Arena'}
            accessibilityHint={kind==='question'?'Publishes a question with two choices':'Publishes your take'}
          />
          <Text allowFontScaling={false} style={[styles.disclaimer, { color: theme.textMuted }]}>
            {kind==='question' ? (canDrop?'Voting closes after 24 hours.':'Add a question and two distinct choices.') : canDrop ? 'Your take self-destructs after 24 hours.' : 'Write something first.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </AuroraBackground>
  );
}
