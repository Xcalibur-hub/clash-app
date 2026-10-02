import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMediaPicker, type PickedMedia } from '../../hooks/useMediaPicker';
import {
  ARENA_EVIDENCE_TITLE_MAX,
  uploadArenaMedia,
  type ArenaEvidenceKind,
  type SubmitArenaEvidenceInput,
} from '../../services/liveArenaService';
import { errorText } from '../../services/supabaseClient';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { isAllowedHttpUrl } from '../../utils/liveArenaUrl';
import { tap as hapticTap } from '../../utils/haptics';
import { TakeMediaPreview } from '../arena/TakeMediaPreview';
import { CloseIcon } from '../shared/icons';

type Mode = 'link' | 'upload';

export interface EvidenceComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Resolve false to keep the sheet open — the caller already showed why. */
  onSubmit: (input: Omit<SubmitArenaEvidenceInput, 'roomId'>) => Promise<boolean>;
  onError?: (message: string) => void;
}

/**
 * Attach a citation to the room: a public HTTPS link, or an owned image/video.
 *
 * The link is pre-checked against `utils/liveArenaUrl` so an obviously-doomed
 * citation never costs a round trip — but `submit_arena_evidence` re-validates
 * with `is_allowed_http_url`, and that refusal is the one that decides.
 */
export function EvidenceComposerSheet({
  visible,
  onClose,
  onSubmit,
  onError,
}: EvidenceComposerSheetProps): React.JSX.Element | null {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const { pickImage, pickVideo } = useMediaPicker();
  const [mode, setMode] = React.useState<Mode>('link');
  const [title, setTitle] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [media, setMedia] = React.useState<PickedMedia | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (visible) return;
    setMode('link');
    setTitle('');
    setUrl('');
    setMedia(null);
    setBusy(false);
  }, [visible]);

  if (!visible) return null;

  const trimmedTitle = title.trim();
  const trimmedUrl = url.trim();
  const urlLooksValid = isAllowedHttpUrl(trimmedUrl);
  const canSubmit =
    !busy &&
    trimmedTitle.length > 0 &&
    (mode === 'link' ? urlLooksValid : media !== null);

  const pick = async (kind: 'image' | 'video'): Promise<void> => {
    hapticTap();
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideo();
      if (picked) setMedia(picked);
    } catch (error) {
      onError?.(errorText(error));
    }
  };

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      let input: Omit<SubmitArenaEvidenceInput, 'roomId'>;
      if (mode === 'link') {
        input = { kind: 'link', title: trimmedTitle, sourceUrl: trimmedUrl };
      } else {
        const picked = media as PickedMedia;
        const attachment = await uploadArenaMedia(picked);
        input = {
          kind: attachment.kind as ArenaEvidenceKind,
          title: trimmedTitle,
          media: attachment,
        };
      }
      const ok = await onSubmit(input);
      if (ok) onClose();
    } catch (error) {
      onError?.(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.scrim, { backgroundColor: t.overlay }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="Close evidence composer"
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: t.surfaceElevated,
                borderColor: t.border,
                paddingBottom: Math.max(insets.bottom, space.md),
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.handleRow}>
              <View style={[styles.handle, { backgroundColor: t.borderStrong }]} />
            </View>

            <View style={styles.titleRow}>
              <Text allowFontScaling={false} style={[styles.heading, { color: t.textPrimary }]}>
                Add proof
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <CloseIcon size={20} color={t.textMuted} strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modes}>
                <ModeChip
                  label="Link"
                  active={mode === 'link'}
                  onPress={() => {
                    hapticTap();
                    setMode('link');
                  }}
                />
                <ModeChip
                  label="Photo or video"
                  active={mode === 'upload'}
                  onPress={() => {
                    hapticTap();
                    setMode('upload');
                  }}
                />
              </View>

              <TextInput
                value={title}
                onChangeText={(next) => setTitle(next.slice(0, ARENA_EVIDENCE_TITLE_MAX))}
                placeholder="What does this prove?"
                placeholderTextColor={t.textMuted}
                style={[
                  styles.input,
                  { color: t.textPrimary, borderColor: t.border, backgroundColor: t.inputBackground },
                ]}
                accessibilityLabel="Evidence title"
              />

              {mode === 'link' ? (
                <>
                  <TextInput
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://"
                    placeholderTextColor={t.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[
                      styles.input,
                      {
                        color: t.textPrimary,
                        borderColor: trimmedUrl && !urlLooksValid ? t.danger : t.border,
                        backgroundColor: t.inputBackground,
                      },
                    ]}
                    accessibilityLabel="Evidence link"
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.hint,
                      { color: trimmedUrl && !urlLooksValid ? t.danger : t.textMuted },
                    ]}
                  >
                    {trimmedUrl && !urlLooksValid
                      ? 'Use a public https link to a real site.'
                      : 'Public https links only. Private and local addresses are refused.'}
                  </Text>
                </>
              ) : (
                <>
                  {media ? (
                    <View style={styles.preview}>
                      <TakeMediaPreview media={media} onRemove={() => setMedia(null)} />
                    </View>
                  ) : (
                    <View style={styles.pickRow}>
                      <PickButton label="Choose photo" onPress={() => void pick('image')} />
                      <PickButton label="Choose video" onPress={() => void pick('video')} />
                    </View>
                  )}
                  <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                    Uploads are public to the room and stay attached to your name.
                  </Text>
                </>
              )}

              <Pressable
                onPress={() => void submit()}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Submit evidence"
                style={[styles.submit, { backgroundColor: t.pill }, !canSubmit && styles.off]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={t.pillText} />
                ) : (
                  <Text allowFontScaling={false} style={[styles.submitText, { color: t.pillText }]}>
                    Add evidence
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.modeChip,
        {
          backgroundColor: active ? t.surfaceMuted : 'transparent',
          borderColor: active ? t.borderStrong : t.border,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.modeText, { color: active ? t.textPrimary : t.textMuted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PickButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.pick, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}
    >
      <Text allowFontScaling={false} style={[styles.pickText, { color: t.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  heading: { ...typeScale.title, fontSize: 19, fontWeight: '700' },
  body: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  modes: { flexDirection: 'row', gap: space.xs },
  modeChip: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xs,
  },
  modeText: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  input: {
    ...typeScale.body,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 46,
  },
  hint: { ...typeScale.caption, fontSize: 11, lineHeight: 16 },
  preview: { borderRadius: radius.md, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', gap: space.xs },
  pick: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickText: { ...typeScale.label, fontSize: 13, fontWeight: '600' },
  submit: {
    marginTop: space.xs,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  submitText: { ...typeScale.button, fontSize: 15, fontWeight: '700' },
  off: { opacity: 0.4 },
});
