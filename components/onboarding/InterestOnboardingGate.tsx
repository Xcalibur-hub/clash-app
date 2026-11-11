import React from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { fetchMyArenaInterests } from '../../services/arenaInterestService';
import { useOperationScope } from '../../hooks/useOperationScope';
import { useAuth } from '../../store/AuthProvider';
import { markOnboarded, useClash } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { ArenaInterestEditor } from './ArenaInterestEditor';
import { OnboardingNextStep, type OnboardingDestination } from './OnboardingNextStep';

/** Session-only dismissal never changes server preferences or the introduction-complete flag. */
export function InterestOnboardingGate(): React.JSX.Element | null {
  const { user, loading: authLoading } = useAuth(), { dispatch } = useClash(), t = useThemeColors(), insets = useSafeAreaInsets();
  const router = useRouter(), path = usePathname();
  const heading = React.useRef<Text>(null), focusTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCurrent = useOperationScope(user?.id ?? 'guest');
  const control = React.useRef({ scope: isCurrent, dismissed: false, reading: false, loaded: false });
  if (control.current.scope !== isCurrent) control.current = { scope: isCurrent, dismissed: false, reading: false, loaded: false };
  const ticket = control.current;
  const [snapshot, setSnapshot] = React.useState<{ scope: () => boolean; status: 'loading' | 'error' | 'editor' | 'done' | 'next' } | null>(null);
  const [, renderDismissal] = React.useState(0), [retry, setRetry] = React.useState(0);
  const current = snapshot?.scope === isCurrent ? snapshot : null;
  const clearFocusTimer = React.useCallback((): void => {
    if (focusTimer.current !== null) { clearTimeout(focusTimer.current); focusTimer.current = null; }
  }, []);
  const active = (): boolean => isCurrent() && control.current === ticket && !ticket.dismissed;
  const exit = React.useCallback((destination?: OnboardingDestination): void => {
    if (!isCurrent() || control.current !== ticket || ticket.dismissed) return;
    clearFocusTimer();
    ticket.dismissed = true; renderDismissal(value => value + 1);
    if (destination) router.push(destination);
  }, [clearFocusTimer, isCurrent, router]);
  React.useEffect(() => () => clearFocusTimer(), [clearFocusTimer]);
  React.useEffect(() => {
    // The existing Interests route stays reachable after dismissal, including via a deep link.
    if (path === '/interests') { clearFocusTimer(); ticket.dismissed = true; renderDismissal(value => value + 1); return; }
    if (!user || authLoading || ticket.dismissed || ticket.loaded) return;
    let live = true; ticket.reading = true;
    setSnapshot({ scope: isCurrent, status: 'loading' });
    void fetchMyArenaInterests(user.id).then(prefs => {
      if (!live || !active()) return;
      ticket.loaded = true;
      setSnapshot({ scope: isCurrent, status: prefs.version >= 1 ? 'done' : 'editor' });
      if (prefs.version >= 1) dispatch(markOnboarded());
    }).catch(() => { if (live && active()) setSnapshot({ scope: isCurrent, status: 'error' }); })
      .finally(() => { if (live && isCurrent()) ticket.reading = false; });
    return () => { live = false; ticket.reading = false; clearFocusTimer(); };
  }, [isCurrent, authLoading, dispatch, retry, path, clearFocusTimer]);
  const visible = Boolean(user && !authLoading && path !== '/interests' && !ticket.dismissed && current?.status !== 'done');
  if (!visible) return null;
  const focusHeading = (): void => {
    if (!active()) return;
    const handle = findNodeHandle(heading.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  // Android Modal owns a separate Dialog window: background accessibility/touch
  // is isolated, then restored by native window dismissal. BackHandler does not
  // receive events while a Modal is open; onRequestClose owns that path.
  return <Modal key={user!.id} visible transparent={false} statusBarTranslucent animationType="none" onRequestClose={() => exit()}
    onShow={() => {
      if (!active()) return;
      focusHeading();
      clearFocusTimer();
      // Android Dialog clears FLAG_NOT_FOCUSABLE after Dialog.show() starts onShow; follow up once settled.
      focusTimer.current = setTimeout(() => { focusTimer.current = null; focusHeading(); }, 150);
    }}>
    <View
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={{
        flex: 1,
        backgroundColor: t.background,
        paddingTop: insets.top + space.sm,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left ?? 0,
        paddingRight: insets.right ?? 0,
      }}
    >
    <Text ref={heading} accessible accessibilityRole="header" style={[typeScale.label, { color: t.textPrimary, paddingHorizontal: layout.screenX, paddingVertical: space.xxs }]}>Arena preferences</Text>
    {current?.status === 'next' ? <OnboardingNextStep safeArea={false} onDone={exit} /> : current?.status === 'editor' ?
      <ArenaInterestEditor key={user!.id} onboarding safeArea={false} onBack={exit} onSaved={prefs => {
        if (!active() || prefs.version < 1) return;
        setSnapshot({ scope: isCurrent, status: 'next' }); dispatch(markOnboarded());
      }} /> : <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.status}>
        {current?.status === 'error' ? <><Text accessibilityRole="alert" style={[typeScale.body, { color: t.textPrimary }]}>Could not load your Arena preferences.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry preferences" onPress={() => {
            if (!active() || ticket.reading) return;
            ticket.reading = true; setSnapshot({ scope: isCurrent, status: 'loading' }); setRetry(n => n + 1);
          }} style={styles.button}><Text style={{ color: t.textPrimary }}>Retry</Text></Pressable></> :
          <><ActivityIndicator color={t.textMuted} /><Text style={{ color: t.textSecondary }}>Checking your preferences…</Text></>}
        <Pressable accessibilityRole="button" accessibilityLabel="Continue without saving" onPress={() => exit()} style={styles.button}>
          <Text style={[typeScale.body, { color: t.textPrimary }]}>Continue without saving</Text>
        </Pressable>
        <Text style={[typeScale.caption, { color: t.textSecondary }]}>This does not mark preferences as saved. Finish later from Profile → Edit your interests.</Text>
      </ScrollView>}
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ status: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  button: { minHeight: 48, minWidth: 100, paddingVertical: space.xs, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' } });
