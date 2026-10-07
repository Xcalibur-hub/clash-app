import React from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useAuth } from '../../store/AuthProvider';
import { useClash, type Take } from '../../store';
import { createArenaChallenge, listArenaChallenges, resolveArenaChallenge } from '../../services/arenaChallengeService';
import { errorText } from '../../services/supabaseClient';
import { challengeCanAct, validCounterPosition, type ArenaChallenge } from '../../utils/arenaChallengePayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';

export function ChallengeTakeButton({ takeId }: { takeId: string }): React.JSX.Element {
  const router = useRouter(); const requireAuth = useRequireAuth(); const t = useThemeColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Challenge this take"
      onPress={() => {
        if (!requireAuth()) return;
        hapticPress();
        router.push({ pathname: '/take/[takeId]', params: { takeId, challenge: '1' } });
      }}
      style={styles.button}
    >
      <Text style={[styles.label, { color: t.textPrimary }]}>{'⚔ Challenge'}</Text>
    </PressableScale>
  );
}

export function TakeChallenges({ take, openComposer }: { take: Take; openComposer: boolean }): React.JSX.Element | null {
  const t = useThemeColors(); const router = useRouter(); const requireAuth = useRequireAuth();
  const { signedIn } = useAuth(); const { state } = useClash(); const viewerId = state.viewer.id;
  const isAuthor = viewerId === take.authorId;
  const [items, setItems] = React.useState<ArenaChallenge[]>([]);
  const [composer, setComposer] = React.useState(false); const [text, setText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false); const [more, setMore] = React.useState(false);
  const working = React.useRef(false); const generation = React.useRef(0);
  const focused = React.useRef(false);
  const [, tick] = React.useState(0);
  const load = React.useCallback(async () => {
    const gen = ++generation.current;
    try {
      const page = await listArenaChallenges(take.id);
      if (gen !== generation.current) return;
      setItems(page); setMore(page.length === 20); setLoaded(true); setError(null);
    } catch (e) { if (gen === generation.current) { setLoaded(false); setError(errorText(e)); } }
  }, [take.id]);
  useFocusEffect(React.useCallback(() => {
    if (!signedIn) return;
    focused.current = true;
    void load();
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      tick(n => n + 1);
      if (!working.current) void load();
    };
    const interval = setInterval(refresh, 30000);
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') refresh(); });
    return () => { focused.current = false; clearInterval(interval); subscription.remove(); generation.current++; };
  }, [signedIn, viewerId, load]));
  React.useEffect(() => { setItems([]); setLoaded(false); setComposer(false); setText(''); }, [take.id, viewerId]);
  React.useEffect(() => { if (openComposer && !isAuthor && signedIn) setComposer(true); }, [openComposer, isAuthor, signedIn, take.id]);
  const run = async (operation: () => Promise<ArenaChallenge>): Promise<void> => {
    if (working.current || !requireAuth()) return;
    working.current = true; generation.current++; setBusy(true); setError(null);
    try {
      const result = await operation();
      if (!focused.current) return;
      setComposer(false); setText('');
      await load();
      if (result.status === 'ACCEPTED' && result.roomId) router.push(`/arena/room/${result.roomId}`);
      else if (result.status === 'EXPIRED' || result.status === 'CANCELLED') setError(`Challenge ${result.status.toLowerCase()}.`);
    } catch (e) { setError(errorText(e)); }
    finally { working.current = false; setBusy(false); }
  };
  const ownPending = items.some(ch => ch.challengerId === viewerId && challengeCanAct(ch));
  const button = (label: string, action: () => void, disabled = busy) => <Pressable key={label} accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button, { opacity: disabled ? 0.5 : 1 }]}><Text style={[styles.label, { color: t.textPrimary }]}>{label}</Text></Pressable>;
  if (!signedIn) return null;
  return <View style={[styles.section, { borderColor: t.border }]}>
    <Text style={[styles.label, { color: t.textPrimary }]}>{isAuthor ? 'Challenges to this Take' : 'Your Challenges'}</Text>
    {!isAuthor && !ownPending && button('⚔ CHALLENGE', () => setComposer(true), busy || !loaded)}
    {error && <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>{error}</Text>}
    {!loaded && button('Reload Challenges', () => void load())}
    {loaded && items.length === 0 && <Text style={{ color: t.textMuted }}>No Challenges yet.</Text>}
    {items.map(ch => <View key={ch.id} style={[styles.entry, { borderColor: t.border }]}>
      <Text style={[styles.label, { color: t.textPrimary }]}>@{ch.challenger.handle}</Text>
      <Text style={[styles.body, { color: t.textPrimary }]}>{ch.counterPosition}</Text>
      <Text style={{ color: t.textMuted }}>{ch.status === 'PENDING' && !challengeCanAct(ch) ? 'EXPIRED' : ch.status}</Text>
      <View style={styles.actions}>
        {challengeCanAct(ch) && isAuthor && button('ACCEPT', () => void run(() => resolveArenaChallenge(ch.id, 'ACCEPT')))}
        {challengeCanAct(ch) && isAuthor && button('PASS', () => void run(() => resolveArenaChallenge(ch.id, 'PASS')))}
        {challengeCanAct(ch) && ch.challengerId === viewerId && button('CANCEL', () => void run(() => resolveArenaChallenge(ch.id, 'CANCEL')))}
        {ch.status === 'ACCEPTED' && ch.roomId && button('OPEN DUEL', () => router.push(`/arena/room/${ch.roomId}`))}
      </View>
    </View>)}
    {more && button('More Challenges', () => {
      if (working.current) return;
      const gen = ++generation.current;
      working.current = true; setBusy(true);
      void listArenaChallenges(take.id, items[items.length - 1]).then(page => {
        if (gen !== generation.current) return;
        setItems(prev => [...prev, ...page]); setMore(page.length === 20);
      }).catch(e => { if (gen === generation.current) setError(errorText(e)); })
        .finally(() => { working.current = false; setBusy(false); });
    })}
    <Modal visible={composer} transparent animationType="none" onRequestClose={() => { if (!busy) setComposer(false); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={[styles.sheet, { backgroundColor: t.background }]} contentContainerStyle={styles.section}>
        <Text style={[styles.label, { color: t.textPrimary }]}>Challenge this Take</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>{take.text}</Text>
        <TextInput autoFocus multiline editable={!busy} value={text} onChangeText={setText} maxLength={1000}
          accessibilityLabel="Your counter-position" placeholder="Explain your counter-position (20–500 characters)" placeholderTextColor={t.textMuted}
          style={[styles.input, { color: t.textPrimary, borderColor: t.border }]} />
        <Text style={{ color: t.textMuted }}>{Array.from(text.trim()).length}/500 · The author chooses whether to accept.</Text>
        {error && <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>{error}</Text>}
        {button(busy ? 'Sending…' : 'SEND CHALLENGE', () => void run(() => createArenaChallenge(take.id, text)), busy || !validCounterPosition(text) || ownPending)}
        {button('Close', () => setComposer(false))}
      </ScrollView></KeyboardAvoidingView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  entry: { paddingVertical: space.sm, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { ...typeScale.label }, body: { ...typeScale.body }, actions: { flexDirection: 'row', gap: space.md },
  button: { paddingVertical: space.sm, minHeight: 44, justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { flexGrow: 0, maxHeight: '85%', borderRadius: 12 }, input: { minHeight: 120, borderWidth: 1, padding: space.sm, textAlignVertical: 'top' },
});
