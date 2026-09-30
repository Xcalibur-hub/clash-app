import React from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowButton } from '../../components/shared/GlowButton';
import { Notice } from '../../components/shared/Notice';
import { BackIcon, ImageIcon, VideoIcon } from '../../components/shared/icons';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import {
  getForegroundPermission,
  getOneShotLocation,
  requestForegroundPermission,
} from '../../services/locationService';
import {
  completeUpload,
  createUpload,
  failUpload,
  readPickedBytes,
  uploadFile,
} from '../../services/mediaService';
import { errorText } from '../../services/supabaseClient';
import { analytics } from '../../services/analytics';
import { createWorldDrop, fetchMission, type WorldMission } from '../../services/worldService';
import { showNotice, useClash } from '../../store';
import { card, color, ink, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

function mimeFor(picked: PickedMedia): string {
  if (picked.mimeType) return picked.mimeType;
  return picked.kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

/**
 * Mission → Participate publish flow.
 * Foreground location only; copy states approximate storage up front.
 */
export default function WorldComposeScreen(): React.JSX.Element {
  const { missionId: missionParam } = useLocalSearchParams<{ missionId?: string | string[] }>();
  const missionId = Array.isArray(missionParam) ? missionParam[0] : missionParam;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const { dispatch } = useClash();
  const { pickImage, pickVideo } = useMediaPicker();

  const [mission, setMission] = React.useState<WorldMission | null>(null);
  const [caption, setCaption] = React.useState('');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<'explain' | 'compose'>('explain');

  React.useEffect(() => {
    if (!missionId) return;
    void fetchMission(missionId)
      .then(setMission)
      .catch((error) => dispatch(showNotice(errorText(error))));
  }, [missionId, dispatch]);

  const continueAfterExplain = async (): Promise<void> => {
    if (!requireAuth()) return;
    hapticTap();
    let permission = await getForegroundPermission();
    if (permission !== 'granted') {
      permission = await requestForegroundPermission();
    }
    if (permission !== 'granted') {
      Alert.alert(
        'Location needed',
        'World uses a one-shot foreground location when you publish. CLASH never tracks you in the background.',
      );
      return;
    }
    setStep('compose');
  };

  const attach = async (kind: 'image' | 'video'): Promise<void> => {
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideo();
      if (picked) setMedia(picked);
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    }
  };

  const publish = async (): Promise<void> => {
    if (!requireAuth() || !missionId || !media || busy) return;
    setBusy(true);
    let mediaId: string | null = null;
    try {
      const point = await getOneShotLocation();
      const mime = mimeFor(media);
      const plan = await createUpload(media.kind, mime, 'public');
      mediaId = plan.id;
      const bytes = await readPickedBytes(media.uri);
      await uploadFile(plan, bytes, mime);
      await completeUpload(plan.id, bytes.byteLength, {
        width: media.width,
        height: media.height,
        ...(media.durationMs ? { durationMs: media.durationMs } : {}),
      });
      await createWorldDrop({
        missionId,
        mediaObjectId: plan.id,
        caption: caption.trim(),
        latitude: point.latitude,
        longitude: point.longitude,
      });
      analytics.track('world_drop_created', {
        realm: 'world',
        media_type: media.kind === 'video' ? 'video' : 'image',
      });
      dispatch(showNotice('World Drop published'));
      router.replace('/world');
    } catch (error) {
      if (mediaId) void failUpload(mediaId).catch(() => undefined);
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => {
              hapticTap();
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.backBtn}
          >
            <BackIcon size={20} color={ink.primary} />
          </Pressable>
          <Text allowFontScaling={false} style={styles.eyebrow}>PARTICIPATE</Text>
          <View style={styles.slot} />
        </View>

        {mission ? (
          <View style={styles.mission}>
            <Text allowFontScaling={false} style={styles.missionTitle}>{mission.title}</Text>
            <Text allowFontScaling={false} style={styles.missionPrompt}>{mission.prompt}</Text>
          </View>
        ) : (
          <ActivityIndicator color={ink.primary} />
        )}

        {step === 'explain' ? (
          <View style={styles.explain}>
            <Text allowFontScaling={false} style={styles.explainTitle}>How location works</Text>
            <Text allowFontScaling={false} style={styles.explainBody}>
              When you publish, CLASH takes a one-shot foreground location and stores an approximate area — not your exact coordinates.
            </Text>
            <Text allowFontScaling={false} style={styles.explainBody}>
              CLASH stores an approximate area, not your exact location. There is no background tracking and no live “you are here” marker.
            </Text>
            <GlowButton label="Continue" tone="light" onPress={() => void continueAfterExplain()} />
          </View>
        ) : (
          <View style={styles.compose}>
            <Text allowFontScaling={false} style={styles.label}>Media</Text>
            <View style={styles.mediaRow}>
              <Pressable
                onPress={() => void attach('image')}
                style={styles.mediaBtn}
                accessibilityRole="button"
                accessibilityLabel="Choose photo"
              >
                <ImageIcon size={18} color={ink.primary} />
                <Text allowFontScaling={false} style={styles.mediaLabel}>Photo</Text>
              </Pressable>
              <Pressable
                onPress={() => void attach('video')}
                style={styles.mediaBtn}
                accessibilityRole="button"
                accessibilityLabel="Choose video"
              >
                <VideoIcon size={18} color={ink.primary} />
                <Text allowFontScaling={false} style={styles.mediaLabel}>Video</Text>
              </Pressable>
            </View>
            {media ? (
              <View style={styles.preview}>
                {media.kind === 'image' ? (
                  <Image source={{ uri: media.uri }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <Text allowFontScaling={false} style={styles.meta}>Video selected</Text>
                )}
              </View>
            ) : null}

            <Text allowFontScaling={false} style={styles.label}>Caption</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="What did you find?"
              placeholderTextColor={ink.tertiary}
              maxLength={180}
              multiline
              style={styles.input}
              accessibilityLabel="Caption"
            />
            <Text allowFontScaling={false} style={styles.meta}>
              Publishing uses a one-shot foreground location. Approximate area only.
            </Text>
            <GlowButton
              label={busy ? 'Publishing…' : 'Publish World Drop'}
              tone="light"
              disabled={!media || busy || !missionId}
              onPress={() => void publish()}
            />
          </View>
        )}
      </ScrollView>
      <Notice offset={0} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.md, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  slot: { width: 44, height: 44 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 0.6 },
  mission: { gap: 6 },
  missionTitle: { ...typeScale.cardTitle, color: ink.primary },
  missionPrompt: { ...typeScale.body, color: ink.secondary },
  explain: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  explainTitle: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  explainBody: { ...typeScale.body, color: ink.secondary },
  compose: { gap: space.sm },
  label: { ...typeScale.caption, color: ink.tertiary },
  mediaRow: { flexDirection: 'row', gap: space.sm },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
  },
  mediaLabel: { ...typeScale.meta, color: ink.primary },
  preview: {
    height: 180,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  input: {
    ...typeScale.body,
    color: ink.primary,
    minHeight: 88,
    textAlignVertical: 'top',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  meta: { ...typeScale.meta, color: ink.tertiary },
});
