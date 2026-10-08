import React from 'react';
import { Alert, AppState, Pressable, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { fetchChallengeInbox, resolveArenaChallenge } from '../../services/arenaChallengeService';
import { challengeCanAct } from '../../utils/arenaChallengePayload';
import { challengeDestination, challengeInboxError, challengeStatusLabel, type InboxChallenge, type InboxDirection } from '../../utils/challengeInbox';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';

export function ChallengeInbox(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const [direction, setDirection] = React.useState<InboxDirection>('INCOMING');
  const [items, setItems] = React.useState<InboxChallenge[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [, tick] = React.useState(0);
  const generation = React.useRef(0);
  const focused = React.useRef(false);
  const working = React.useRef(false);
  const loadingRef = React.useRef(false);

  const load = React.useCallback(async (before?: InboxChallenge): Promise<void> => {
    if (!user || (before && loadingRef.current)) return;
    const request = ++generation.current;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchChallengeInbox(direction, user.id, before);
      if (!focused.current || request !== generation.current) return;
      setItems(previous => before
        ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]
        : page.items);
      setHasMore(page.hasMore);
    } catch (e) {
      if (focused.current && request === generation.current) setError(challengeInboxError(e));
    } finally {
      if (focused.current && request === generation.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [direction, user?.id]);

  useFocusEffect(React.useCallback(() => {
    focused.current = true;
    setItems([]);
    setHasMore(false);
    setError(null);
    setNotice(null);
    void load();
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      tick(n => n + 1);
      if (!working.current && !loadingRef.current) void load();
    };
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') refresh(); });
    return () => {
      focused.current = false;
      generation.current += 1;
      loadingRef.current = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [load]));

  const act = async (item: InboxChallenge, action: 'ACCEPT' | 'PASS' | 'CANCEL'): Promise<void> => {
    if (!user || !focused.current || working.current || loadingRef.current || !challengeCanAct(item)) return;
    working.current = true;
    const request = ++generation.current;
    setBusy(item.id);
    setError(null);
    setNotice(null);
    tap();
    try {
      const result = await resolveArenaChallenge(item.id, action, user.id);
      if (!focused.current || request !== generation.current) return;
      setNotice(result.status === 'ACCEPTED' && !result.roomId
        ? 'Accepted. The Room is not ready yet. Refresh to check again.'
        : `Invitation ${challengeStatusLabel(result.status).toLowerCase()}.`);
      await load();
    } catch (e) {
      if (!focused.current || request !== generation.current) return;
      await load();
      if (focused.current) setError(challengeInboxError(e));
    } finally {
      working.current = false;
      if (focused.current) setBusy(null);
    }
  };

  const cancel = (item: InboxChallenge): void => {
    Alert.alert('Cancel invitation?', 'The recipient will no longer be able to accept this invitation.', [
      { text: 'Keep invitation', style: 'cancel' },
      { text: 'Cancel invitation', style: 'destructive', onPress: () => { void act(item, 'CANCEL'); } },
    ]);
  };

  const button = (label: string, onPress: () => void, disabled = false): React.JSX.Element => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      onPress={onPress} style={[styles.button, { borderColor: t.border, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.buttonText, { color: t.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  const renderCard = (item: InboxChallenge): React.JSX.Element => {
    const actor = direction === 'INCOMING' ? item.challenger : item.recipient;
    const actionable = challengeCanAct(item);
    const disabled = loading || busy !== null;
    return (
      <View key={item.id} style={[styles.card, { borderColor: t.border }]}>
        <Text style={[styles.name, { color: t.textPrimary }]}>{actor.name} · @{actor.handle}</Text>
        <Text style={[styles.status, { color: t.textSecondary }]}>{challengeStatusLabel(item.status)}</Text>
        <Text style={[styles.name, { color: t.textPrimary }]}>{item.source.title}</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>{item.counterPosition}</Text>
        <Text style={[styles.time, { color: t.textMuted }]}>Created {new Date(item.createdAt).toLocaleString()}</Text>
        <Text style={[styles.time, { color: t.textMuted }]}>Invitation expires {new Date(item.expiresAt).toLocaleString()}</Text>
        {item.status === 'PENDING' && !actionable ? <Text style={[styles.body, {color:t.textMuted}]}>Deadline passed. Refresh to confirm the server status.</Text> : null}
        {item.status === 'ACCEPTED' && (!item.clashId || !item.roomId) ? <Text style={[styles.body, {color:t.textMuted}]}>Accepted · Room not ready yet.</Text> : null}
        {busy === item.id ? <Text accessibilityLiveRegion="polite" style={{color:t.textMuted}}>Updating invitation...</Text> : null}
        <View style={styles.actions}>
          {button('View Take', () => router.push(`/take/${item.takeId}`), busy !== null)}
          {item.status === 'ACCEPTED' && item.clashId && item.roomId ? button('Open Room', () => router.push(challengeDestination(item)), busy !== null) : null}
          {actionable && direction === 'INCOMING' ? <>{button('Accept', () => { void act(item,'ACCEPT'); }, disabled)}{button('Decline', () => { void act(item,'PASS'); }, disabled)}</> : null}
          {actionable && direction === 'OUTGOING' ? button('Cancel invitation', () => cancel(item), disabled) : null}
        </View>
      </View>
    );

  };

  return (
    <FlatList data={items} keyExtractor={item => item.id} renderItem={({item}) => renderCard(item)}
      contentContainerStyle={styles.content} accessibilityLabel="Challenge Inbox"
      refreshing={loading && items.length === 0} onRefresh={() => { if (!working.current) void load(); }}
      ListHeaderComponent={<View style={{gap:space.md}}>
      <Text style={[styles.title, { color: t.textPrimary }]}>Challenge Inbox</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>Invitations and their latest status.</Text>
      <View style={styles.actions} accessibilityRole="tablist">
        {(['INCOMING', 'OUTGOING'] as InboxDirection[]).map(section => (
          <Pressable key={section} accessibilityRole="tab" accessibilityState={{selected: direction === section, disabled: busy !== null}}
            accessibilityLabel={section === 'INCOMING' ? 'Incoming challenges' : 'Outgoing challenges'} disabled={busy !== null}
            onPress={() => {
              if (section === direction) return;
              tap();
              generation.current += 1;
              setItems([]);
              setHasMore(false);
              setLoading(true);
              setError(null);
              setNotice(null);
              setDirection(section);
            }}
            style={[styles.segment, { borderColor: direction === section ? t.textPrimary : t.border, backgroundColor: direction === section ? t.surfaceMuted : t.background }]}>
            <Text style={[styles.buttonText, { color: t.textPrimary }]}>{section === 'INCOMING' ? 'Incoming' : 'Outgoing'}</Text>
          </Pressable>
        ))}
      </View>
      {!user ? button('Sign in', () => router.push('/auth')) : button(loading ? 'Refreshing...' : 'Refresh', () => { void load(); }, loading || busy !== null)}
      {error ? <Text accessibilityRole="alert" style={[styles.body, { color: t.textSecondary }]}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: t.textSecondary }]}>{notice}</Text> : null}
      {user && !loading && !error && items.length === 0 ? <Text style={[styles.body, { color: t.textMuted }]}>No {direction.toLowerCase()} invitations.</Text> : null}

      </View>}
      ListFooterComponent={hasMore ? button(loading ? 'Loading...' : 'Load more', () => { void load(items[items.length-1]); }, loading || busy !== null) : null}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenX, paddingVertical: space.md, paddingBottom: space.xl, gap: space.md },
  title: { ...typeScale.section, fontSize: 26, fontWeight: '800' },
  name: { ...typeScale.label, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { ...typeScale.body, fontSize: 14, lineHeight: 21 },
  status: { ...typeScale.caption, fontSize: 13, fontWeight: '700' },
  time: { ...typeScale.caption, fontSize: 12, lineHeight: 18 },
  card: { padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, gap: space.sm },
  actions: { flexDirection:'row', flexWrap:'wrap', gap: space.sm },
  segment: { flex:1, minHeight:44, justifyContent:'center', alignItems:'center', borderWidth:StyleSheet.hairlineWidth, borderRadius:radius.md },
  button: { minHeight:44, justifyContent:'center', paddingHorizontal:space.md, borderWidth:StyleSheet.hairlineWidth, borderRadius:radius.md },
  buttonText: { ...typeScale.label, fontSize:14, fontWeight:'700' },
});
