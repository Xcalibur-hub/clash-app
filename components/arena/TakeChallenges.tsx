import React from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useAuth } from '../../store/AuthProvider';
import { selectAuthor, useClash, type Take } from '../../store';
import { createArenaChallenge, listArenaChallenges, resolveArenaChallenge } from '../../services/arenaChallengeService';
import { errorText } from '../../services/supabaseClient';
import { challengeCanAct, validCounterPosition, type ArenaChallenge } from '../../utils/arenaChallengePayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { ChallengeSwipeDeck } from './ChallengeSwipeDeck';
import { ClashConfirmedOverlay, type ClashConfirmedFighter } from './ClashConfirmedOverlay';

export function ChallengeTakeButton({ takeId }: { takeId: string }): React.JSX.Element {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const t = useThemeColors();
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
  const t = useThemeColors();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const reduced = useReducedMotion();
  const { signedIn } = useAuth();
  const { state } = useClash();
  const viewerId = state.viewer.id;
  const isAuthor = viewerId === take.authorId;
  const takeAuthor = selectAuthor(state, take.authorId);
  const [items, setItems] = React.useState<ArenaChallenge[]>([]);
  const [composer, setComposer] = React.useState(false);
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState<{
    roomId: string;
    fighterA: ClashConfirmedFighter;
    fighterB: ClashConfirmedFighter;
  } | null>(null);
  const working = React.useRef(false);
  const generation = React.useRef(0);
  const focused = React.useRef(false);
  const [, tick] = React.useState(0);

  const load = React.useCallback(async () => {
    const gen = ++generation.current;
    try {
      const page = await listArenaChallenges(take.id);
      if (gen !== generation.current) return;
      setItems(page);
      setMore(page.length === 20);
      setLoaded(true);
      setError(null);
    } catch (e) {
      if (gen === generation.current) {
        setLoaded(false);
        setError(errorText(e));
      }
    }
  }, [take.id]);

  useFocusEffect(
    React.useCallback(() => {
      if (!signedIn) return;
      focused.current = true;
      void load();
      const refresh = () => {
        if (AppState.currentState !== 'active') return;
        tick((n) => n + 1);
        if (!working.current) void load();
      };
      const interval = setInterval(refresh, 30000);
      const subscription = AppState.addEventListener('change', (status) => {
        if (status === 'active') refresh();
      });
      return () => {
        focused.current = false;
        clearInterval(interval);
        subscription.remove();
        generation.current++;
      };
    }, [signedIn, viewerId, load]),
  );

  React.useEffect(() => {
    setItems([]);
    setLoaded(false);
    setComposer(false);
    setText('');
    setConfirmed(null);
  }, [take.id, viewerId]);

  React.useEffect(() => {
    if (openComposer && !isAuthor && signedIn) setComposer(true);
  }, [openComposer, isAuthor, signedIn, take.id]);

  React.useEffect(() => {
    if (!confirmed) return undefined;
    const delay = reduced ? 120 : 900;
    const id = setTimeout(() => {
      const roomId = confirmed.roomId;
      setConfirmed(null);
      router.push(`/arena/room/${roomId}`);
    }, delay);
    return () => clearTimeout(id);
  }, [confirmed, reduced, router]);

  const pending = React.useMemo(
    () => items.filter((ch) => challengeCanAct(ch)),
    [items],
  );
  const history = React.useMemo(
    () => items.filter((ch) => !challengeCanAct(ch)),
    [items],
  );

  const removeLocal = (id: string): void => {
    setItems((prev) => prev.filter((ch) => ch.id !== id));
  };

  const onAccept = async (ch: ArenaChallenge): Promise<void> => {
    if (working.current || !requireAuth()) throw new Error('Busy');
    working.current = true;
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      const result = await resolveArenaChallenge(ch.id, 'ACCEPT');
      if (!focused.current) return;
      removeLocal(ch.id);
      if (result.status === 'ACCEPTED' && result.roomId) {
        setConfirmed({
          roomId: result.roomId,
          fighterA: {
            name: takeAuthor?.name ?? 'Fighter A',
            handle: takeAuthor?.handle ?? 'fighter_a',
            tint: takeAuthor?.tint,
          },
          fighterB: {
            name: ch.challenger.name,
            handle: ch.challenger.handle,
          },
        });
      } else {
        await load();
        throw new Error('Challenge could not be accepted.');
      }
    } catch (e) {
      setError(typeof e === 'object' && e && 'message' in e ? String((e as Error).message) : errorText(e));
      await load();
      throw e;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const onPass = async (ch: ArenaChallenge): Promise<void> => {
    if (working.current || !requireAuth()) throw new Error('Busy');
    working.current = true;
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      await resolveArenaChallenge(ch.id, 'PASS');
      if (!focused.current) return;
      removeLocal(ch.id);
    } catch (e) {
      setError(errorText(e));
      await load();
      throw e;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const run = async (operation: () => Promise<ArenaChallenge>): Promise<void> => {
    if (working.current || !requireAuth()) return;
    working.current = true;
    generation.current++;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!focused.current) return;
      setComposer(false);
      setText('');
      await load();
      if (result.status === 'ACCEPTED' && result.roomId) {
        setConfirmed({
          roomId: result.roomId,
          fighterA: {
            name: takeAuthor?.name ?? 'Fighter A',
            handle: takeAuthor?.handle ?? 'fighter_a',
            tint: takeAuthor?.tint,
          },
          fighterB: {
            name: result.challenger.name,
            handle: result.challenger.handle,
          },
        });
      } else if (result.status === 'EXPIRED' || result.status === 'CANCELLED') {
        setError(`Challenge ${result.status.toLowerCase()}.`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const ownPending = items.some((ch) => ch.challengerId === viewerId && challengeCanAct(ch));
  const button = (label: string, action: () => void, disabled = busy) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={action}
      style={[styles.button, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.label, { color: t.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  if (!signedIn) return null;

  return (
    <View style={[styles.section, { borderColor: t.border }]}>
      <ClashConfirmedOverlay
        visible={Boolean(confirmed)}
        fighterA={confirmed?.fighterA ?? { name: '', handle: '' }}
        fighterB={confirmed?.fighterB ?? { name: '', handle: '' }}
      />

      {isAuthor ? (
        <>
          <Text style={[styles.heading, { color: t.textPrimary }]}>Incoming Challenges</Text>
          {!loaded ? (
            button('Reload Challenges', () => void load())
          ) : (
            <ChallengeSwipeDeck
              challenges={pending}
              takeText={take.text}
              busy={busy}
              error={error}
              onAccept={onAccept}
              onPass={onPass}
            />
          )}
          {history.length > 0 ? (
            <View style={styles.history}>
              <Text style={[styles.subhead, { color: t.textMuted }]}>Earlier</Text>
              {history.map((ch) => (
                <View key={ch.id} style={[styles.entry, { borderColor: t.border }]}>
                  <Text style={[styles.label, { color: t.textPrimary }]}>@{ch.challenger.handle}</Text>
                  <Text style={[styles.body, { color: t.textPrimary }]}>{ch.counterPosition}</Text>
                  <Text style={{ color: t.textMuted }}>
                    {ch.status === 'PENDING' && !challengeCanAct(ch) ? 'EXPIRED' : ch.status}
                  </Text>
                  <View style={styles.actions}>
                    {ch.status === 'ACCEPTED' && ch.roomId
                      ? button('OPEN DUEL', () => router.push(`/arena/room/${ch.roomId}`))
                      : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: t.textPrimary }]}>Your Challenges</Text>
          {!ownPending && button('⚔ CHALLENGE', () => setComposer(true), busy || !loaded)}
          {error ? (
            <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>
              {error}
            </Text>
          ) : null}
          {!loaded && button('Reload Challenges', () => void load())}
          {loaded && items.length === 0 ? (
            <Text style={{ color: t.textMuted }}>No Challenges yet.</Text>
          ) : null}
          {items.map((ch) => (
            <View key={ch.id} style={[styles.entry, { borderColor: t.border }]}>
              <Text style={[styles.label, { color: t.textPrimary }]}>@{ch.challenger.handle}</Text>
              <Text style={[styles.body, { color: t.textPrimary }]}>{ch.counterPosition}</Text>
              <Text style={{ color: t.textMuted }}>
                {ch.status === 'PENDING' && !challengeCanAct(ch) ? 'EXPIRED' : ch.status}
              </Text>
              <View style={styles.actions}>
                {challengeCanAct(ch) && ch.challengerId === viewerId
                  ? button('CANCEL', () => void run(() => resolveArenaChallenge(ch.id, 'CANCEL')))
                  : null}
                {ch.status === 'ACCEPTED' && ch.roomId
                  ? button('OPEN DUEL', () => router.push(`/arena/room/${ch.roomId}`))
                  : null}
              </View>
            </View>
          ))}
        </>
      )}

      {more
        ? button('More Challenges', () => {
            if (working.current) return;
            const gen = ++generation.current;
            working.current = true;
            setBusy(true);
            void listArenaChallenges(take.id, items[items.length - 1])
              .then((page) => {
                if (gen !== generation.current) return;
                setItems((prev) => [...prev, ...page]);
                setMore(page.length === 20);
              })
              .catch((e) => {
                if (gen === generation.current) setError(errorText(e));
              })
              .finally(() => {
                working.current = false;
                setBusy(false);
              });
          })
        : null}

      <Modal
        visible={composer}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (!busy) setComposer(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.backdrop}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={[styles.sheet, { backgroundColor: t.background }]}
            contentContainerStyle={styles.section}
          >
            <Text style={[styles.label, { color: t.textPrimary }]}>Challenge this Take</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>{take.text}</Text>
            <TextInput
              autoFocus
              multiline
              editable={!busy}
              value={text}
              onChangeText={setText}
              maxLength={1000}
              accessibilityLabel="Your counter-position"
              placeholder="Explain your counter-position (20–500 characters)"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { color: t.textPrimary, borderColor: t.border }]}
            />
            <Text style={{ color: t.textMuted }}>
              {Array.from(text.trim()).length}/500 · The author chooses whether to accept.
            </Text>
            {error ? (
              <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>
                {error}
              </Text>
            ) : null}
            {button(
              busy ? 'Sending…' : 'SEND CHALLENGE',
              () => void run(() => createArenaChallenge(take.id, text)),
              busy || !validCounterPosition(text) || ownPending,
            )}
            {button('Close', () => setComposer(false))}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  heading: {
    ...typeScale.title,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: space.md,
  },
  subhead: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: space.md,
  },
  history: { gap: space.sm, paddingTop: space.md },
  entry: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { ...typeScale.label },
  body: { ...typeScale.body },
  actions: { flexDirection: 'row', gap: space.md },
  button: { paddingVertical: space.sm, minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  backdrop: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { flexGrow: 0, maxHeight: '85%', borderRadius: 12 },
  input: { minHeight: 120, borderWidth: 1, padding: space.sm, textAlignVertical: 'top' },
});
