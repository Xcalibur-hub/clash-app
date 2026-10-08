import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchMyArenaInterests } from '../../services/arenaInterestService';
import { useAuth } from '../../store/AuthProvider';
import { markOnboarded, useClash } from '../../store';
import { typeScale, useThemeColors } from '../../theme';
import { ArenaInterestEditor } from './ArenaInterestEditor';

/** Keep the navigation stack mounted underneath this account-scoped gate. */
export function InterestOnboardingGate(): React.JSX.Element | null {
  const { user, loading: authLoading } = useAuth(), { dispatch } = useClash(), t = useThemeColors();
  const [version, setVersion] = React.useState<number | null>(null), [error, setError] = React.useState(false), [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let active = true; setVersion(null); setError(false);
    if (!user || authLoading) return;
    void fetchMyArenaInterests().then(prefs => {
      if (!active) return; setVersion(prefs.version);
      if (prefs.version >= 1) dispatch(markOnboarded());
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user?.id, authLoading, dispatch, retry]);
  if (!user || authLoading || (version !== null && version >= 1)) return null;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: t.background }]} accessibilityViewIsModal importantForAccessibility="yes">
    {version === 0 ? <ArenaInterestEditor onboarding onSaved={p => { setVersion(p.version); dispatch(markOnboarded()); }} /> :
      <View style={styles.status}>{error ? <><Text style={[typeScale.body, { color: t.textPrimary }]}>Couldn’t load your Arena preferences.</Text>
        <Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={styles.retry}><Text style={{ color: t.textPrimary }}>Retry</Text></Pressable></> : <ActivityIndicator color={t.textMuted} />}</View>}
  </View>;
}
const styles = StyleSheet.create({ status: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }, retry: { minHeight: 48, minWidth: 100, alignItems: 'center', justifyContent: 'center' } });
