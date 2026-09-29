import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HoodId, User } from '../../store';
import { updateProfile } from '../../services/profileService';
import { errorText } from '../../services/supabaseClient';
import { showNotice, useClash } from '../../store';
import { HOODS } from '../../data/hoods';
import { color, ink, radius, space, typeScale } from '../../theme';
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
      await updateProfile(profile.id, { name: name.trim(), handle: cleanHandle(handle), bio: bio.trim(), homeHood: hood });
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
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close editor" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <Text allowFontScaling={false} style={styles.title}>
          Edit profile
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Field label="Name">
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={MAX_NAME}
              autoCapitalize="words"
              placeholder="Your name"
              placeholderTextColor={ink.quaternary}
              style={[styles.input, !nameValid && name.length > 0 && styles.inputError]}
            />
          </Field>
          <Field label="Handle">
            <TextInput
              value={handle}
              onChangeText={setHandle}
              maxLength={21}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="handle"
              placeholderTextColor={ink.quaternary}
              style={[styles.input, !handleValid && handle.length > 0 && styles.inputError]}
            />
          </Field>
          <Field label="Bio">
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={MAX_BIO}
              multiline
              placeholder="A line about you"
              placeholderTextColor={ink.quaternary}
              style={[styles.input, styles.multiline, !bioValid && styles.inputError]}
            />
          </Field>
          <Field label="Home Hood">
            <View style={styles.hoods}>
              {HOODS.map((hoodItem) => {
                const active = hoodItem.id === hood;
                return (
                  <Pressable
                    key={hoodItem.id}
                    onPress={() => setHood(hoodItem.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.hood, active && styles.hoodOn]}
                  >
                    <Text allowFontScaling={false} style={[styles.hoodText, active && styles.hoodTextOn]}>
                      {hoodItem.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </ScrollView>
        <GlowButton
          label="Save"
          onPress={() => void save()}
          disabled={saving || !nameValid || !handleValid || !bioValid}
          accessibilityLabel="Save profile"
        />
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text allowFontScaling={false} style={styles.label}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}


const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: color.scrim },
  sheet: {
    backgroundColor: '#18181B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.md,
    maxHeight: '85%',
  },
  title: { ...typeScale.title, color: ink.primary },
  field: { gap: space.xs, marginBottom: space.md },
  label: { ...typeScale.caption, fontSize: 10, letterSpacing: 1.2, color: ink.quaternary },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: ink.primary,
    ...typeScale.body,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  inputError: { borderColor: '#E5484D' },
  hoods: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  hood: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  hoodOn: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: ink.primary },
  hoodText: { ...typeScale.meta, color: ink.tertiary },
  hoodTextOn: { color: ink.primary },
});
