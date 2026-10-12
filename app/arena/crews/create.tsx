import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import {
  createArenaCrew,
  type ArenaCrewJoinMode,
} from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { ARENA_CREW_SPECIALTIES } from '../../../utils/arenaCrewSpecialties';
import { suggestCrewSlug } from '../../../utils/arenaCrewIdentity';
import { arenaCrewUserMessage } from '../../../utils/arenaCrewPayload';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';

const JOIN_MODES: readonly { id: ArenaCrewJoinMode; label: string }[] = [
  { id: 'OPEN', label: 'Open' },
  { id: 'REQUEST', label: 'Request' },
  { id: 'INVITE_ONLY', label: 'Invite only' },
];

/** Create Crew — fields mirror create_arena_crew RPC only. */
export default function CreateArenaCrewScreen(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requireAuth = useRequireAuth();

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [bio, setBio] = React.useState('');
  const [joinMode, setJoinMode] = React.useState<ArenaCrewJoinMode>('OPEN');
  const [specialties, setSpecialties] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef(false);

  const onName = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(suggestCrewSlug(value));
  };

  const toggleSpecialty = (tag: string) => {
    setSpecialties((prev) => {
      if (prev.includes(tag)) return prev.filter((s) => s !== tag);
      if (prev.length >= 4) return prev;
      return [...prev, tag];
    });
  };

  const submit = async () => {
    if (!requireAuth()) return;
    if (inFlight.current || busy) return;
    inFlight.current = true;
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
    } catch (err) {
      setError(arenaCrewUserMessage(errorText(err)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/arena/crews'))}
        style={[styles.back, { paddingHorizontal: layout.screenX }]}
      >
        <BackIcon size={20} color={t.textPrimary} />
        <Text style={{ color: t.textPrimary }}>Back</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingBottom: insets.bottom + space.xl,
          gap: space.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: t.textPrimary }]}>Create a Crew</Text>
        <Text style={[styles.sub, { color: t.textSecondary }]}>
          One active membership per account. Name, slug, bio, join mode, and up to four specialties.
        </Text>

        <Text style={[styles.label, { color: t.textMuted }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={onName}
          placeholder="Crew name"
          placeholderTextColor={t.textMuted}
          maxLength={40}
          style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.textMuted }]}>Slug</Text>
        <TextInput
          value={slug}
          onChangeText={(v) => {
            setSlugTouched(true);
            setSlug(v.toLowerCase());
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="crew-url"
          placeholderTextColor={t.textMuted}
          maxLength={32}
          style={[styles.input, { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.textMuted }]}>Bio (optional)</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="What is this Crew about?"
          placeholderTextColor={t.textMuted}
          maxLength={280}
          multiline
          style={[
            styles.input,
            styles.bio,
            { color: t.textPrimary, borderColor: t.border, backgroundColor: t.surface },
          ]}
        />

        <Text style={[styles.label, { color: t.textMuted }]}>Join mode</Text>
        <View style={styles.row}>
          {JOIN_MODES.map((mode) => {
            const selected = joinMode === mode.id;
            return (
              <Pressable
                key={mode.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setJoinMode(mode.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: t.border,
                    backgroundColor: selected ? t.textPrimary : t.surface,
                  },
                ]}
              >
                <Text style={{ color: selected ? t.background : t.textPrimary }}>{mode.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: t.textMuted }]}>Specialties (max 4)</Text>
        <View style={styles.row}>
          {ARENA_CREW_SPECIALTIES.map((tag) => {
            const selected = specialties.includes(tag);
            return (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleSpecialty(tag)}
                style={[
                  styles.chip,
                  {
                    borderColor: t.border,
                    backgroundColor: selected ? t.textPrimary : t.surface,
                  },
                ]}
              >
                <Text style={{ color: selected ? t.background : t.textPrimary }}>{tag}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={[styles.error, { color: t.textSecondary }]}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Crew"
          disabled={busy || name.trim().length < 2 || slug.trim().length < 2}
          onPress={() => void submit()}
          style={[
            styles.submit,
            {
              backgroundColor: t.textPrimary,
              opacity: busy || name.trim().length < 2 || slug.trim().length < 2 ? 0.5 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={t.background} />
          ) : (
            <Text style={[styles.submitText, { color: t.background }]}>Create Crew</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  title: { ...typeScale.title },
  sub: { ...typeScale.body },
  label: { ...typeScale.caption, fontWeight: '600', marginTop: space.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    ...typeScale.body,
  },
  bio: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  error: { ...typeScale.caption },
  submit: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  submitText: { ...typeScale.label, fontWeight: '700' },
});
