import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { GlassCard } from '../shared/GlassCard';
import { GlowButton } from '../shared/GlowButton';
import { CloseIcon, VaultIcon } from '../shared/icons';
import { color, duration, ink, radius, space, typeScale } from '../../theme';

export interface VaultFormSheetProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialTitle: string;
  initialDescription: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}

/** A single modal that both creates and edits a Vault's title and description. */
export function VaultFormSheet({
  visible,
  mode,
  initialTitle,
  initialDescription,
  busy,
  onClose,
  onSubmit,
}: VaultFormSheetProps): React.JSX.Element | null {
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
      <Animated.View entering={FadeIn.duration(duration.fast)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View entering={FadeInUp.duration(duration.base)} style={styles.box}>
          <GlassCard corner={radius.xxl} contentStyle={styles.card}>
            <View style={styles.head}>
              <View style={styles.badge}>
                <VaultIcon size={20} color={ink.secondary} strokeWidth={2} />
              </View>
              <Text allowFontScaling={false} style={styles.title}>
                {mode === 'create' ? 'Open your Vault' : 'Edit Vault'}
              </Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                <CloseIcon size={20} color={ink.tertiary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <Text allowFontScaling={false} style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={60}
              placeholder="A name for your Vault"
              placeholderTextColor={ink.quaternary}
              accessibilityLabel="Vault title"
              style={styles.input}
            />

            <Text allowFontScaling={false} style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={280}
              multiline
              placeholder="What subscribers get"
              placeholderTextColor={ink.quaternary}
              accessibilityLabel="Vault description"
              style={[styles.input, styles.textarea]}
            />

            <GlowButton
              label={busy ? 'Saving…' : mode === 'create' ? 'Create Vault' : 'Save'}
              onPress={() => onSubmit(title.trim(), description.trim())}
              disabled={!canSubmit}
              style={styles.cta}
            />
          </GlassCard>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  box: { paddingHorizontal: space.md, paddingBottom: space.md },
  card: { gap: space.sm, padding: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  title: { ...typeScale.cardTitle, color: ink.primary, flex: 1 },
  label: { ...typeScale.eyebrow, color: ink.tertiary },
  input: {
    ...typeScale.body,
    color: ink.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  cta: { marginTop: space.xs },
});
