import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { GlowButton } from '../shared/GlowButton';
import { CloseIcon } from '../shared/icons';
import { duration, radius, space, typeScale, useThemeColors } from '../../theme';

export interface VaultFormSheetProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialTitle: string;
  initialDescription: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}

/** Create / edit Vault title and description. */
export function VaultFormSheet({
  visible,
  mode,
  initialTitle,
  initialDescription,
  busy,
  onClose,
  onSubmit,
}: VaultFormSheetProps): React.JSX.Element | null {
  const t = useThemeColors();
  const [title, setTitle] = React.useState(initialTitle);
  const [description, setDescription] = React.useState(initialDescription);

  React.useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription(initialDescription);
    }
  }, [visible, initialTitle, initialDescription]);

  if (!visible) return null;

  const canSubmit = title.trim().length > 0 && !busy;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(duration.fast)} style={[styles.scrim, { backgroundColor: t.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View entering={FadeInUp.duration(duration.base)} style={styles.box}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: t.surfaceElevated,
                  borderColor: t.border,
                },
              ]}
            >
              <View style={styles.head}>
                <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
                  {mode === 'create' ? 'Open your Vault' : 'Edit Vault'}
                </Text>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                  <CloseIcon size={20} color={t.textMuted} strokeWidth={2.2} />
                </Pressable>
              </View>

              <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
                Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={60}
                placeholder="A name for your Vault"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Vault title"
                style={[
                  styles.input,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                ]}
              />

              <Text allowFontScaling={false} style={[styles.label, { color: t.textMuted }]}>
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={280}
                multiline
                placeholder="What belongs in this space"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Vault description"
                style={[
                  styles.input,
                  styles.textarea,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                ]}
              />

              <GlowButton
                label={busy ? 'Saving…' : mode === 'create' ? 'Create Vault' : 'Save'}
                onPress={() => onSubmit(title.trim(), description.trim())}
                disabled={!canSubmit}
                style={styles.cta}
              />
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  box: { paddingHorizontal: space.md, paddingBottom: space.md },
  card: {
    gap: space.sm,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...typeScale.section, flex: 1 },
  label: { ...typeScale.caption, letterSpacing: 0.4 },
  input: {
    ...typeScale.body,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
  },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  cta: { marginTop: space.xs },
});
