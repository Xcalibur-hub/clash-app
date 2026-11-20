import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { useClock } from '../../hooks/useClock';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { fetchClashViewForTake, type ClashView } from '../../services/clashEngineService';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { useThemeColors } from '../../theme';

type Read = { scope: string; status: 'loading' | 'ready' | 'error'; view: ClashView | null };

/** Existing visible relationship only. Opening this section never admits or settles anyone. */
export function TakeArenaJourney({ takeId }: { takeId: string }): React.JSX.Element {
  const t = useThemeColors(), router = useRouter(), requireAuth = useRequireAuth();
  const { user, signedIn, loading } = useAuth(), now = useClock(1000);
  const scope = `${user?.id ?? 'guest'}:${takeId}`;
  const [retry, setRetry] = React.useState(0);
  const [read, setRead] = React.useState<Read>({ scope, status: 'loading', view: null });
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setRead({ scope, status: 'loading', view: null });
    if (!loading) {
      if (!isSupabaseConfigured) setRead({ scope, status: 'error', view: null });
      else void fetchClashViewForTake(takeId).then(view => {
        if (view && view.takeId !== takeId) throw new Error('Unrelated Clash');
        if (active) setRead({ scope, status: 'ready', view });
      }).catch(() => { if (active) setRead({ scope, status: 'error', view: null }); });
    }
    return () => { active = false; };
  }, [scope, takeId, loading, retry]));
  const current = read.scope === scope && !loading ? read : { status: 'loading' as const, view: null };
  const view = current.view;
  const canonical = view?.battleMode === 'DUEL' && Boolean(view.roomId);
  const terminal = view?.status === 'settled' || view?.status === 'cancelled';
  const status = view?.status === 'cancelled' ? 'Cancelled'
    : view?.status === 'settled' ? view.verdict ? 'Settled · community result' : 'Settled · result unavailable'
    : view && now >= view.closesAt ? 'Awaiting settlement'
    : view && now < view.opensAt ? 'Scheduled' : 'In progress';
  const label = canonical ? terminal ? 'Review Arena Room' : 'Open Arena Room' : 'View Clash history';
  const action = (title: string, onPress: () => void) => <Pressable accessibilityRole="button"
    accessibilityLabel={title} onPress={onPress} style={[styles.action, { borderColor: t.border }]}>
    <Text style={[styles.label, { color: t.textPrimary }]}>{title}</Text>
  </Pressable>;
  return <View style={[styles.section, { borderColor: t.border }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: t.textPrimary }]}>Related Arena</Text>
    {current.status === 'loading' ? <View accessibilityLabel="Loading related Arena" style={styles.loading}>
      <ActivityIndicator color={t.textMuted} /><Text style={[styles.body, { color: t.textSecondary }]}>Checking this Take’s Clash…</Text>
    </View> : current.status === 'error' ? <>
      <Text accessibilityRole="alert" style={[styles.body, { color: t.textSecondary }]}>Related Arena could not be loaded. Its availability is unverified.</Text>
      {action('Retry related Arena', () => setRetry(n => n + 1))}
    </> : view ? <>
      <Text accessibilityLiveRegion="polite" style={[styles.label, { color: t.textPrimary }]}>{status}</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>{canonical
        ? terminal ? 'Review this Take’s canonical duel, visible arguments and official outcome.'
          : signedIn ? view.isParticipant ? 'You are a fighter in this Take’s duel. The Room determines which actions are available.'
            : 'Inspect this Take’s duel. Spectator participation depends on the Room’s permissions and phase.'
          : 'Sign in to open the Arena Room. Viewing a link does not join the duel.'
        : terminal ? 'This is a historical Clash without a canonical Arena Room.'
          : 'This legacy Clash has no canonical Arena Room. Continue discovering; no settlement is requested here.'}</Text>
      {canonical || terminal ? action(label, () => {
        if (canonical) { if (requireAuth()) router.push(`/arena/room/${view.roomId}`); }
        else router.push(`/clash/${takeId}`);
      }) : null}
    </> : <Text style={[styles.body, { color: t.textSecondary }]}>No linked Clash is available to you for this Take. Pending challenges, if visible below, are not active duels.</Text>}
    {action('Discover Arena', () => router.push('/arena/topics'))}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 18, lineHeight: 25, fontWeight: '600' },
  label: { fontSize: 15, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 22 },
  action: { minHeight: 44, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, justifyContent: 'center' },
  loading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
});
