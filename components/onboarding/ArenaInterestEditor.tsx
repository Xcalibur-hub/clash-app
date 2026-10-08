import React from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchInterestCatalogue, fetchMyArenaInterests, saveMyArenaInterests } from '../../services/arenaInterestService';
import { useAuth } from '../../store/AuthProvider';
import { useClash } from '../../store';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { validInterestSelection, type ArenaInterest, type ArenaInterestPreferences } from '../../utils/arenaInterests';
import { notify, tap } from '../../utils/haptics';
import { TopicSelection } from './TopicSelection';

export function ArenaInterestEditor({ onboarding = false, onSaved, onBack }: {
  onboarding?: boolean; onSaved: (preferences: ArenaInterestPreferences) => void; onBack?: () => void;
}): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { reloadArena } = useClash();
  const [catalogue, setCatalogue] = React.useState<ArenaInterest[]>([]);
  const [preferences, setPreferences] = React.useState<ArenaInterestPreferences | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true), [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null), [conflict, setConflict] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const live = React.useRef(false), busy = React.useRef(false);
  React.useEffect(() => {
    live.current = true; let active = true;
    setLoading(true); setPreferences(null); setSelected([]); setCatalogue([]); setError(null); setConflict(false);
    if (!user) { setLoading(false); return () => { live.current = false; }; }
    void Promise.all([fetchInterestCatalogue(), fetchMyArenaInterests()]).then(([topics, prefs]) => {
      if (!active) return; setCatalogue(topics); setPreferences(prefs); setSelected(prefs.topicIds);
    }).catch(() => { if (active) setError('Couldn’t load your interests. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; live.current = false; };
  }, [user?.id, retry]);
  React.useEffect(() => {
    if (!onboarding) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [onboarding]);
  const save = async (skip: boolean): Promise<void> => {
    if (busy.current || !preferences || !user || conflict) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      const result = await saveMyArenaInterests(skip ? [] : selected, skip, preferences.revision, user.id);
      if (!live.current) return;
      setPreferences(result); notify('success');
      void reloadArena(); onSaved(result);
    } catch (err) {
      if (!live.current) return;
      const changed = (err as { code?: string }).code === 'PT409'; setConflict(changed);
      setError(changed ? 'Your interests changed on another device. Reload them before saving.' : 'Couldn’t save. Your selection is still here; please retry.');
    } finally { busy.current = false; if (live.current) setSaving(false); }
  };
  const action = (label: string, run: () => void, disabled = false, primary = false): React.JSX.Element =>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={run}
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? t.textPrimary : t.surface,
        opacity: disabled ? 0.35 : pressed ? 0.75 : 1 }]}>
      <Text style={[styles.buttonText, { color: primary ? t.textInverse : t.textPrimary }]}>{label}</Text>
    </Pressable>;
  return <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.sm }]}>
    <View style={styles.heading}>
      {!onboarding && onBack ? action('Back', onBack, saving) : <Text style={[styles.brand, { color: t.textMuted }]}>CLASH · YOUR ARENA</Text>}
      <Text style={[styles.title, { color: t.textPrimary }]}>{onboarding ? 'What gets you talking?' : 'Your interests'}</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>Choose 3–5 interests. We’ll bring more of these conversations into For You, with room to discover something new.</Text>
    </View>
    {!user ? <Text style={[styles.message, { color: t.textSecondary }]}>Sign in to manage your interests.</Text> : loading ?
      <View style={styles.loading}><ActivityIndicator color={t.textMuted} /><Text style={{ color: t.textSecondary }}>Loading your interests…</Text></View> :
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {preferences ? <><Text accessibilityLiveRegion="polite" style={[styles.count, { color: t.textMuted }]}>{selected.length} of 5 selected · choose at least 3</Text>
          <TopicSelection catalogue={catalogue} selected={selected} disabled={saving || conflict} onChange={setSelected} /></> : null}
        {error && !preferences ? <Text accessibilityRole="alert" style={[styles.body, { color: t.danger }]}>{error}</Text> : null}
        {error && !preferences ? action('Retry', () => setRetry(n => n + 1)) : null}
      </ScrollView>}
    {preferences && !loading ? <View style={styles.footer}>
      {error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger }]}>{error}</Text> : null}
      {conflict ? action('Reload saved interests', () => setRetry(n => n + 1), saving) : null}
      {action(saving ? 'Saving…' : onboarding ? 'Continue' : 'Save interests', () => void save(false), saving || conflict || !validInterestSelection(selected), true)}
      {action(onboarding ? 'Skip for now' : 'Use the general feed', () => { tap(); void save(true); }, saving || conflict)}
      <Text style={[styles.note, { color: t.textMuted }]}>Private to your account. You can change this anytime.</Text>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, heading: { paddingHorizontal: layout.screenX, gap: space.sm, paddingBottom: space.md },
  brand: { ...typeScale.caption }, title: { ...typeScale.display, fontSize: 30, lineHeight: 36 }, body: { ...typeScale.body },
  count: { ...typeScale.caption, marginBottom: space.md }, content: { paddingHorizontal: layout.screenX, paddingBottom: space.lg, gap: space.sm },
  footer: { paddingHorizontal: layout.screenX, paddingTop: space.sm, gap: space.xs },
  button: { minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...typeScale.cardTitle }, note: { ...typeScale.caption, textAlign: 'center', paddingVertical: space.xs },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md }, message: { padding: layout.screenX },
});
