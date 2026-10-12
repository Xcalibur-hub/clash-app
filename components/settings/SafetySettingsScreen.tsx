import React from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthProvider';
import { useClash } from '../../store';
import { fetchSafetyPage, unblockProfile, unmuteUser, type SafetyAccount, type SafetyListKind } from '../../services/safetyService';
import { BackIcon } from '../shared/icons';
import { GlowButton } from '../shared/GlowButton';
import { layout, space, typeScale, useThemeColors } from '../../theme';

/** Exported section is also exercised by the controlled lifecycle harness. */
export function SafetySection({ kind, accountId }: { kind: SafetyListKind; accountId: string }): React.JSX.Element {
  const t = useThemeColors();
  const { reloadArena } = useClash();
  const [items, setItems] = React.useState<SafetyAccount[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const scope = React.useRef({ generation: 0, active: false });
  const busy = React.useRef(false);
  const reading = React.useRef(false);
  const action = kind === 'blocked' ? 'Unblock' : 'Unmute';

  const load = React.useCallback(async (after?: string): Promise<void> => {
    if (!scope.current.active || busy.current || reading.current) return;
    reading.current = true;
    const generation = scope.current.generation;
    setLoading(true);
    setError(null);
    if (!after) { setItems([]); setCursor(null); }
    try {
      const page = await fetchSafetyPage(kind, accountId, after);
      if (!scope.current.active || generation !== scope.current.generation) return;
      setItems(previous => [...new Map([...(after ? previous : []), ...page.items].map(row => [row.id, row])).values()]);
      setCursor(page.nextCursor && page.nextCursor !== after ? page.nextCursor : null);
    } catch {
      if (scope.current.active && generation === scope.current.generation) setError('Could not load accounts. Please retry.');
    } finally {
      if (generation === scope.current.generation) { reading.current = false; setLoading(false); }
    }
  }, [kind, accountId]);

  useFocusEffect(React.useCallback(() => {
    scope.current = { active: true, generation: scope.current.generation + 1 };
    busy.current = false;
    reading.current = false;
    setPending(null);
    setNotice(null);
    void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      scope.current = { active: false, generation: scope.current.generation + 1 };
      subscription.remove();
    };
  }, [load]));

  const remove = (row: SafetyAccount): void => {
    if (!scope.current.active || busy.current || reading.current) return;
    busy.current = true; // synchronous guard, including the confirmation dialog
    setPending(row.id);
    const generation = scope.current.generation;
    const current = (): boolean => scope.current.active && generation === scope.current.generation;
    const release = (): void => { if (current()) { busy.current = false; setPending(null); } };
    const perform = async (): Promise<void> => {
      if (!current()) return;
      setNotice(null);
      setError(null);
      try {
        if (kind === 'blocked') await unblockProfile(row.id, accountId);
        else await unmuteUser(row.id, accountId);
        if (!current()) return;
        setItems(previous => previous.filter(item => item.id !== row.id));
        setNotice(kind === 'blocked' ? 'Account unblocked.' : 'Account unmuted.');
        await reloadArena();
      } catch {
        if (current()) setError('Could not confirm the change. Refresh or try again.');
      } finally { release(); }
    };
    if (kind === 'blocked') {
      let submitted = false;
      Alert.alert('Unblock account?', 'Their content may appear again. Following is not restored.', [
        { text: 'Cancel', style: 'cancel', onPress: release },
        { text: 'Unblock', onPress: () => { if (submitted) return; submitted = true; void perform(); } },
      ], { cancelable: true, onDismiss: () => { if (!submitted) release(); } });
    } else void perform();
  };

  return <View style={{ gap: space.md, paddingVertical: space.lg }}>
    <Text accessibilityRole="header" style={{ ...typeScale.cardTitle, color: t.textPrimary }}>{kind === 'blocked' ? 'Blocked accounts' : 'Muted accounts'}</Text>
    {notice ? <Text accessibilityLiveRegion="polite" style={{ ...typeScale.body, color: t.textPrimary }}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ ...typeScale.body, color: t.textSecondary }}>{error}</Text> : null}
    {loading ? <View style={{ flexDirection: 'row', gap: space.sm }}><ActivityIndicator color={t.textSecondary} /><Text style={{ color: t.textSecondary }}>Loading accounts...</Text></View> : null}
    {!loading && !error && items.length === 0 ? <Text style={{ ...typeScale.body, color: t.textSecondary }}>No {kind} accounts.</Text> : null}
    {items.map(row => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: t.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ ...typeScale.body, color: t.textPrimary }}>{row.name ?? 'Unavailable account'}</Text>
        {row.handle ? <Text style={{ color: t.textSecondary }}>@{row.handle}</Text> : null}
      </View>
      <GlowButton compact tone="glass" label={pending === row.id ? 'Please wait...' : action}
        accessibilityLabel={`${action} ${row.handle ? '@' + row.handle : 'unavailable account'}`}
        disabled={pending !== null || loading} onPress={() => remove(row)} />
    </View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      <GlowButton compact tone="glass" label={error ? 'Retry' : 'Refresh'} accessibilityLabel={`Refresh ${kind} accounts`}
        disabled={loading || pending !== null} onPress={() => void load()} />
      {cursor ? <GlowButton compact tone="glass" label="More accounts" accessibilityLabel={`More ${kind} accounts`}
        disabled={loading || pending !== null} onPress={() => void load(cursor)} /> : null}
    </View>
  </View>;
}

export default function SafetySettingsScreen(): React.JSX.Element {
  const { user, loading } = useAuth();
  const t = useThemeColors(), insets = useSafeAreaInsets(), router = useRouter();
  return <View style={{ flex: 1, backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}
      style={{ minHeight: 48, paddingHorizontal: layout.screenX, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <BackIcon size={20} color={t.textPrimary} /><Text style={{ color: t.textPrimary }}>Back</Text>
    </Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenX, paddingBottom: space.xl }}>
      <Text accessibilityRole="header" style={{ ...typeScale.title, color: t.textPrimary }}>Safety settings</Text>
      {loading ? <ActivityIndicator color={t.textSecondary} /> : user ? <View key={user.id}>
        <SafetySection kind="blocked" accountId={user.id} />
        <SafetySection kind="muted" accountId={user.id} />
      </View> : <View style={{ gap: space.md, paddingVertical: space.lg }}>
        <Text style={{ ...typeScale.body, color: t.textSecondary }}>Sign in to manage blocked and muted accounts.</Text>
        <GlowButton label="Sign in" onPress={() => router.push('/auth')} />
      </View>}
    </ScrollView>
  </View>;
}
