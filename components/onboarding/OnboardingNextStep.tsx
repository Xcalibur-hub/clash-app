import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPersonalizedArenaTakes } from '../../services/arenaInterestService';
import { useOperationScope } from '../../hooks/useOperationScope';
import { useAuth } from '../../store/AuthProvider';
import type { Take } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export type OnboardingDestination = '/arena/challenges' | `/take/${string}`;

/** A confirmed preference save leads to real public reading, never invented activity or admission. */
export function OnboardingNextStep({ safeArea = true, onDone }: { safeArea?: boolean; onDone: (destination?: OnboardingDestination) => void }): React.JSX.Element {
  const { user } = useAuth(), t = useThemeColors(), insets = useSafeAreaInsets();
  const isCurrent = useOperationScope(user?.id ?? 'guest');
  const [snapshot, setSnapshot] = React.useState<{ scope: () => boolean; take: Take | null; status: 'loading' | 'ready' | 'error' } | null>(null);
  const [retry, setRetry] = React.useState(0);
  const action = React.useRef<{ scope: () => boolean; done: boolean }>({ scope: isCurrent, done: false });
  if (action.current.scope !== isCurrent) action.current = { scope: isCurrent, done: false };
  const current = snapshot?.scope === isCurrent ? snapshot : null;
  React.useEffect(() => {
    let active = true;
    setSnapshot({ scope: isCurrent, take: null, status: 'loading' });
    void fetchPersonalizedArenaTakes().then(takes => {
      if (active && isCurrent() && !action.current.done) setSnapshot({ scope: isCurrent, take: takes[0] ?? null, status: 'ready' });
    }).catch(() => {
      if (active && isCurrent() && !action.current.done) setSnapshot({ scope: isCurrent, take: null, status: 'error' });
    });
    return () => { active = false; };
  }, [isCurrent, retry]);
  const finish = (destination?: OnboardingDestination): void => {
    if (!isCurrent() || action.current.done) return;
    action.current.done = true; onDone(destination);
  };
  const button = (label: string, onPress: () => void): React.JSX.Element =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.button, { backgroundColor: t.surface }]}>
      <Text style={[typeScale.cardTitle, { color: t.textPrimary }]}>{label}</Text>
    </Pressable>;
  return <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentContainerStyle={[styles.content, { paddingTop: (safeArea ? insets.top : 0) + space.lg, paddingBottom: (safeArea ? insets.bottom : 0) + space.lg }]}>
    <Text accessibilityRole="header" style={[typeScale.display, { color: t.textPrimary }]}>Your Arena starts here</Text>
    <Text style={[typeScale.body, { color: t.textSecondary }]}>Your preference was saved. Read a Take or check invitations already sent to you.</Text>
    {!current || current.status === 'loading' ? <><ActivityIndicator color={t.textMuted} /><Text style={{ color: t.textMuted }}>Finding public Takes…</Text></> :
      current.status === 'error' ? <><Text accessibilityRole="alert" style={{ color: t.textSecondary }}>Could not load Takes. You can retry or choose another destination.</Text>
        {button('Retry Takes', () => { if (isCurrent() && !action.current.done) setRetry(value => value + 1); })}</> :
        current.take ? <View style={styles.preview}><Text style={[typeScale.body, { color: t.textPrimary }]}>{current.take.text}</Text>
          {button('Read this Take', () => finish(`/take/${current.take!.id}`))}</View> :
          <Text style={[typeScale.body, { color: t.textSecondary }]}>No public Takes right now. Check your invitations or continue browsing; nothing needs to be created.</Text>}
    {button('View Challenge Inbox', () => finish('/arena/challenges'))}
    {button('Continue where I was', () => finish())}
    <Text style={[typeScale.caption, { color: t.textMuted }]}>Change your interests anytime from your profile.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.screenX, gap: space.md },
  button: { minHeight: 48, padding: space.md, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  preview: { gap: space.md },
});
