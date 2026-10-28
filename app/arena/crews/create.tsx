import { withReleaseAdmission } from '../../../components/shared/ReleaseUnavailable';
/**
 * Focused Crew creation — name, slug, bio, specialties, join mode.
 * Deterministic crest until avatar upload fits the media architecture.
 */
import React from 'react';
import {
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
import { CrewCrest } from '../../../components/crews/CrewCrest';
import { GroupButton } from '../../../components/arena/groups/GroupButton';
import { BackIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import {
  createArenaCrew,
  type ArenaCrewJoinMode,
} from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { ARENA_CREW_SPECIALTIES } from '../../../utils/arenaCrewSpecialties';
import { suggestCrewSlug } from '../../../utils/arenaCrewIdentity';
import { arenaCrewErrorKey } from '../../../utils/arenaCrewPayload';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

const JOIN_MODES: readonly { key: ArenaCrewJoinMode; label: string; hint: string }[] = [
  { key: 'OPEN', label: 'Open', hint: 'Anyone can join' },
  { key: 'REQUEST', label: 'Request', hint: 'You approve members' },
  { key: 'INVITE_ONLY', label: 'Invite', hint: 'Invite only' },
];

function CreateCrewScreen(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requireAuth = useRequireAuth();

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [bio, setBio] = React.useState('');
  const [specialties, setSpecialties] = React.useState<string[]>([]);
  const [joinMode, setJoinMode] = React.useState<ArenaCrewJoinMode>('OPEN');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const previewId = `preview_${slug || 'crew'}`;

  const toggleSpecialty = (s: string): void => {
    hapticTap();
    setSpecialties((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      if (prev.length >= 4) return prev;
      return [...prev, s];
    });
  };

  const submit = async (): Promise<void> => {
    if (!requireAuth()) return;
    setBusy(true);
    setError(null);
    try {
      const crew = await createArenaCrew({
        name: name.trim(),
        slug: slug.trim(),
        bio: bio.trim(),
        joinMode,
        specialties,
      });
      router.replace(`/arena/crews/${crew.slug}`);
    } catch (e) {
      const key = arenaCrewErrorKey(errorText(e));
      if (key === 'already_in_crew') {
        setError('You already belong to a Crew. Leave it before creating another.');
      } else if (key === 'slug_taken') {
        setError('That handle is taken. Try another.');
      } else {
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: t.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.back}>
          <BackIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>
        <Text allowFontScaling={false} style={[styles.barTitle, { color: t.textPrimary }]}>
          Create group
        </Text>
      </View>

      {error ? (
        <Text allowFontScaling={false} style={[styles.errorBanner, { color: t.textMuted }]}>
          {error}
        </Text>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.preview}>
          <CrewCrest
            id={previewId}
            name={name.trim() || 'New Crew'}
            slug={slug.trim() || 'new-crew'}
            specialties={specialties}
            size={72}
          />
          <Text allowFontScaling={false} style={[styles.previewHint, { color: t.textMuted }]}>
            Crest is automatic for now — your name is the identity.
          </Text>
        </View>

        <Field label="Name">
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (!slugTouched) setSlug(suggestCrewSlug(v));
            }}
            placeholder="ByteClub"
            placeholderTextColor={t.textMuted}
            maxLength={40}
            style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface }]}
            accessibilityLabel="Crew name"
          />
        </Field>

        <Field label="Handle">
          <TextInput
            value={slug}
            onChangeText={(v) => {
              setSlugTouched(true);
              setSlug(suggestCrewSlug(v));
            }}
            placeholder="byteclub"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface }]}
            accessibilityLabel="Crew handle"
          />
        </Field>

        <Field label="Bio">
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="What does this Crew fight for?"
            placeholderTextColor={t.textMuted}
            maxLength={280}
            multiline
            style={[
              styles.input,
              styles.bio,
              { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface },
            ]}
            accessibilityLabel="Crew bio"
          />
        </Field>

        <Text allowFontScaling={false} style={[styles.label, { color: t.textSecondary }]}>
          Specialties · up to 4
        </Text>
        <View style={styles.specialtyRow}>
          {ARENA_CREW_SPECIALTIES.map((s) => {
            const on = specialties.includes(s);
            return (
              <Pressable
                key={s}
                onPress={() => toggleSpecialty(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.specialty,
                  {
                    backgroundColor: on ? t.pill : 'transparent',
                    borderColor: t.border,
                  },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={{
                    ...typeScale.label,
                    fontSize: 13,
                    fontWeight: on ? '700' : '500',
                    color: on ? t.pillText : t.textMuted,
                  }}
                >
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text allowFontScaling={false} style={[styles.label, { color: t.textSecondary, marginTop: space.md }]}>
          Who can join
        </Text>
        <View style={styles.modeRow}>
          {JOIN_MODES.map((m) => {
            const on = joinMode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  hapticTap();
                  setJoinMode(m.key);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.mode,
                  {
                    borderColor: on ? t.textPrimary : t.border,
                    backgroundColor: t.surface,
                  },
                ]}
              >
                <Text allowFontScaling={false} style={[styles.modeLabel, { color: t.textPrimary }]}>
                  {m.label}
                </Text>
                <Text allowFontScaling={false} style={[styles.modeHint, { color: t.textMuted }]}>
                  {m.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <GroupButton
          label={busy ? 'CREATING…' : 'CREATE CREW'}
          onPress={() => {
            void submit();
          }}
          disabled={busy || name.trim().length < 2 || slug.trim().length < 2}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.field}>
      <Text allowFontScaling={false} style={[styles.label, { color: t.textSecondary }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  barTitle: { ...typeScale.title, fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: layout.screenX, gap: space.md },
  errorBanner: {
    ...typeScale.meta,
    fontSize: 13,
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
  },
  preview: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  previewHint: { ...typeScale.meta, fontSize: 12, textAlign: 'center' },
  field: { gap: 8 },
  label: { ...typeScale.meta, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  input: {
    ...typeScale.body,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  bio: { minHeight: 96, textAlignVertical: 'top' },
  specialtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specialty: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeRow: { gap: space.sm },
  mode: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 2,
  },
  modeLabel: { ...typeScale.cardTitle, fontSize: 15 },
  modeHint: { ...typeScale.meta, fontSize: 12 },
});

export default withReleaseAdmission(CreateCrewScreen, 'groups');
