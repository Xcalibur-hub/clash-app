import React from 'react';
import {
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
import type { HoodId, User } from '../../store';
import { updateProfile } from '../../services/profileService';
import { errorText } from '../../services/supabaseClient';
import { showNotice, useClash } from '../../store';
import { HOODS } from '../../data/hoods';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { GlowButton } from '../shared/GlowButton';

const MAX_NAME = 30;
const MAX_BIO = 160;

export interface EditProfileSheetProps {
  visible: boolean;
  profile: User;
  onClose: () => void;
  onSaved: () => void;
}

function cleanHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

/** Minimal self-edit flow — only the fields the profile grant allows. */
export function EditProfileSheet({ visible, profile, onClose, onSaved }: EditProfileSheetProps): React.JSX.Element {
  const { dispatch } = useClash();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const [name, setName] = React.useState(profile.name);
  const [handle, setHandle] = React.useState(profile.handle);
  const [bio, setBio] = React.useState(profile.bio ?? '');
  const [hood, setHood] = React.useState<Exclude<HoodId, 'for-you'>>(
    profile.hood === 'for-you' ? 'techtakes' : profile.hood,
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setName(profile.name);
      setHandle(profile.handle);
      setBio(profile.bio ?? '');
      setHood(profile.hood === 'for-you' ? 'techtakes' : profile.hood);
    }
  }, [visible, profile]);

  const nameValid = name.trim().length > 0 && name.trim().length <= MAX_NAME;
  const handleValid = /^[a-z0-9_]{3,20}$/.test(cleanHandle(handle));
  const bioValid = bio.length <= MAX_BIO;

  const save = async (): Promise<void> => {
    if (!nameValid || !handleValid || !bioValid) return;
    setSaving(true);
    try {
      await updateProfile(profile.id, {
        name: name.trim(),
        handle: cleanHandle(handle),
        bio: bio.trim(),
        homeHood: hood,
      });
      onSaved();
      onClose();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={[styles.scrim, { backgroundColor: t.overlay }]} onPress={onClose} accessibilityLabel="Close editor" />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + space.md,
              backgroundColor: t.surfaceElevated,
              borderColor: t.border,
            },
          ]}
        >
          <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
            Edit profile
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Field label="Name" muted={t.textMuted}>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={MAX_NAME}
                autoCapitalize="words"
                placeholder="Your name"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Name"
                style={[
                  styles.input,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                  !nameValid && name.length > 0 && { borderColor: t.danger },
                ]}
              />
            </Field>
            <Field label="Handle" muted={t.textMuted}>
              <TextInput
                value={handle}
                onChangeText={setHandle}
                maxLength={21}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="handle"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Handle"
                style={[
                  styles.input,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                  !handleValid && handle.length > 0 && { borderColor: t.danger },
                ]}
              />
            </Field>
            <Field label="Bio" muted={t.textMuted}>
              <TextInput
                value={bio}
                onChangeText={setBio}
                maxLength={MAX_BIO}
                multiline
                placeholder="A line about you"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Bio"
                style={[
                  styles.input,
                  styles.multiline,
                  {
                    color: t.textPrimary,
                    borderColor: t.border,
                    backgroundColor: t.inputBackground,
                  },
                  !bioValid && { borderColor: t.danger },
                ]}
              />
            </Field>
            <Field label="Home Hood" muted={t.textMuted}>
              <View style={styles.hoods}>
                {HOODS.map((hoodItem) => {
                  const active = hoodItem.id === hood;
                  return (
                    <Pressable
                      key={hoodItem.id}
                      onPress={() => setHood(hoodItem.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={hoodItem.name}
                      style={[
                        styles.hood,
                        {
                          borderColor: active ? t.textPrimary : t.border,
                          backgroundColor: active
                            ? t.scheme === 'light'
                              ? t.textPrimary
                              : 'rgba(255,255,255,0.12)'
                            : t.surfaceMuted,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.hoodText,
                          {
                            color: active
                              ? t.scheme === 'light'
                                ? t.textInverse
                                : t.textPrimary
                              : t.textMuted,
                          },
                        ]}
                      >
                        {hoodItem.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          </ScrollView>
          <GlowButton
            label={saving ? 'Saving…' : 'Save'}
            onPress={() => void save()}
            disabled={saving || !nameValid || !handleValid || !bioValid}
            accessibilityLabel="Save profile"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  muted,
  children,
}: {
  label: string;
  muted: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text allowFontScaling={false} style={[styles.label, { color: muted }]}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.md,
    maxHeight: '88%',
  },
  title: { ...typeScale.title },
  field: { gap: space.xs, marginBottom: space.md },
  label: { ...typeScale.caption, letterSpacing: 0.8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
    ...typeScale.body,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  hoods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  hood: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  hoodText: { ...typeScale.meta },
});
