import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { validInterestSelection, type ArenaInterestPreferences } from '../../utils/arenaInterests';
import { useArenaInterestEditor } from './useArenaInterestEditor';
import { TopicSelection } from './TopicSelection';

export function ArenaInterestEditor({ onboarding = false, safeArea = true, onSaved, onBack }: {
  onboarding?: boolean; safeArea?: boolean; onSaved: (preferences: ArenaInterestPreferences, wasIncomplete?: boolean) => void; onBack?: () => void;
}): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets();
  const { user, catalogue, preferences, selected, loading, saving, error, needsReload, lastSkip, dirty, reload, change, save, exit } = useArenaInterestEditor(onSaved, onBack);
  const action = (label: string, run: () => void, disabled = false, primary = false): React.JSX.Element =>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={run}
      style={({ pressed }) => [styles.button, { backgroundColor: primary ? t.textPrimary : t.surface,
        opacity: disabled ? 0.35 : pressed ? 0.75 : 1 }]}>
      <Text style={[styles.buttonText, { color: primary ? t.textInverse : t.textPrimary }]}>{label}</Text>
    </Pressable>;
  return <View style={[styles.root, { backgroundColor: t.background, paddingTop: (safeArea ? insets.top : 0) + space.md, paddingBottom: (safeArea ? insets.bottom : 0) + space.sm }]}>
    <View style={styles.heading}>
      {!onboarding && onBack ? action('Back', exit) : <Text style={[styles.brand, { color: t.textMuted }]}>CLASH · YOUR ARENA</Text>}
      <Text style={[styles.title, { color: t.textPrimary }]}>{onboarding ? 'What gets you talking?' : 'Your interests'}</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>Choose 3–5 interests. We’ll bring more of these conversations into For You, with room to discover something new.</Text>
    </View>
    {!user ? <Text style={[styles.message, { color: t.textSecondary }]}>Sign in to manage your interests.</Text> : loading ?
      <View style={styles.loading}><ActivityIndicator color={t.textMuted} /><Text style={{ color: t.textSecondary }}>Loading your interests…</Text></View> :
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {preferences ? <><Text accessibilityLiveRegion="polite" style={[styles.count, { color: t.textMuted }]}>{selected.length} of 5 selected · choose at least 3</Text>
          <TopicSelection catalogue={catalogue} selected={selected} disabled={saving} onChange={change} /></> : null}
        {error && !preferences ? <Text accessibilityRole="alert" style={[styles.body, { color: t.danger }]}>{error}</Text> : null}
        {error && !preferences ? action('Retry', reload, loading) : null}
    {preferences ? <View style={[styles.footer, { paddingHorizontal: 0 }]}>
      {error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger }]}>{error}</Text> : null}
      {action(saving ? 'Saving…' : needsReload ? lastSkip ? 'Retry general feed preference' : 'Retry save' : onboarding ? 'Save and continue' : 'Save interests',
        () => void save(needsReload && lastSkip), saving || (!(needsReload && lastSkip) && !validInterestSelection(selected)), true)}
      {action('Save general feed preference', () => void save(true), saving)}
      <Text accessibilityLiveRegion="polite" style={[styles.note, { color: t.textMuted }]}>{saving ? 'Save pending. Leaving will not confirm or cancel it.' : needsReload ? 'Save not confirmed. Your selection is still on this screen.' : dirty || preferences.version === 0 ? 'Your selection is not saved yet.' : 'Showing your saved preferences.'}</Text>
      <Text style={[styles.note, { color: t.textMuted }]}>Private to your account. You can change this anytime.</Text>
    </View> : null}
      </ScrollView>}
    {onboarding && onBack ? <View style={styles.footer}>
      {action(saving ? 'Continue while save is pending' : 'Continue without saving', exit)}
      <Text style={[styles.note, { color: t.textMuted }]}>{saving ? 'A pending save may still finish. Check Interests later to confirm.' : 'Continue to browse. Finish later from Profile → Edit your interests.'}</Text>
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
