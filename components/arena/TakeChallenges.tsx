import React from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useClock } from '../../hooks/useClock';
import { useOperationScope } from '../../hooks/useOperationScope';
import { takeChallengeIneligibility, challengeIneligibilityMessage, type ChallengeIneligibility } from '../../utils/takeChallengeEligibility';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useAuth } from '../../store/AuthProvider';
import { showNotice, useClash, type Take } from '../../store';
import { createArenaChallenge, listArenaChallenges, resolveArenaChallenge, fetchEligibleChallengeTake, ChallengeEligibilityError } from '../../services/arenaChallengeService';
import { errorText } from '../../services/supabaseClient';
import { challengeCanAct, validCounterPosition, type ArenaChallenge } from '../../utils/arenaChallengePayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { arena, arenaColors } from '../../theme/arena';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ChallengeTakeButton({ takeId, take }: { takeId: string; take?: Take }): React.JSX.Element {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const { user } = useAuth();
  const { state, dispatch } = useClash();
  const isCurrent = useOperationScope(`${user?.id ?? 'guest'}:${takeId}`);
  const now = useClock(1000);
  const t = useThemeColors();
  const [checking, setChecking] = React.useState(false);
  const busy = React.useRef(false);
  const focus = React.useRef({ active: false, epoch: 0 });
  useFocusEffect(React.useCallback(() => {
    focus.current = { active: true, epoch: focus.current.epoch + 1 };
    return () => { focus.current = { active: false, epoch: focus.current.epoch + 1 }; };
  }, []));
  React.useEffect(() => { busy.current = false; setChecking(false); }, [user?.id, takeId]);
  const source = take ?? state.takes.find(item => item.id === takeId);
  const reason = source ? takeChallengeIneligibility(source, now) : null;
  const ownTake = source?.authorId === state.viewer.id;
  const disabled = checking || (!ownTake && Boolean(reason));
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={source?.authorId === state.viewer.id ? "Review challenges" : "Challenge this take"}
      disabled={disabled} accessibilityState={{ disabled, busy: checking }}
      onPress={async () => {
        if (!isCurrent() || !focus.current.active || busy.current || !requireAuth()) return;
        if (ownTake) { router.push('/arena/challenges'); return; }
        if (source && takeChallengeIneligibility(source)) return;
        busy.current = true; setChecking(true);
        const epoch = focus.current.epoch;
        try {
          const fresh = await fetchEligibleChallengeTake(takeId);
          if (!isCurrent() || !focus.current.active || epoch !== focus.current.epoch) return;
          if (fresh.authorId === state.viewer.id) { router.push('/arena/challenges'); return; }
          hapticPress();
          router.push({ pathname: '/take/[takeId]', params: { takeId, challenge: '1' } });
        } catch (error) {
          if (isCurrent()) dispatch(showNotice(errorText(error)));
        } finally { if (isCurrent()) { busy.current = false; setChecking(false); } }
      }} style={styles.button}>
      <Text style={[styles.label, { color: reason ? t.textMuted : t.textPrimary }]}>
        {source?.authorId === state.viewer.id ? 'Review challenges' : reason === 'archived' ? 'Archived' : reason ? 'Challenges closed' : checking ? 'Checking…' : '⚔ Challenge'}
      </Text>
    </PressableScale>
  );
}

export function TakeChallenges({ take, openComposer, readOnly = false, compact = false, onTakeRefreshed, composerRequest }: { take: Take; openComposer: boolean; composerRequest?: { id: number; text: string }; readOnly?: boolean; compact?: boolean; onTakeRefreshed?: (take: Take | null) => void }): React.JSX.Element | null {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const colors = arenaColors(t);
  const [detailsExpanded, setDetailsExpanded] = React.useState(false);
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const reduced = useReducedMotion();
  const { signedIn, user } = useAuth();
  const { state } = useClash();
  const viewerId = state.viewer.id;
  const scope = `${user?.id ?? 'guest'}:${viewerId}:${take.id}`;
  const isCurrent = useOperationScope(scope);
  const now = useClock(1000);
  const [checkedTake, setCheckedTake] = React.useState<{ scope: string; take: Take } | null>(null);
  const [rejection, setRejection] = React.useState<ChallengeIneligibility | null>(null);
  const [checking, setChecking] = React.useState(false);
  const checkingRef = React.useRef(false);
  const source = checkedTake?.scope === scope ? checkedTake.take : take;
  const reason = takeChallengeIneligibility(take, now) ?? takeChallengeIneligibility(source, now) ?? rejection;
  const closed = readOnly || Boolean(reason);
  const isAuthor = viewerId === take.authorId;
  const [items, setItems] = React.useState<ArenaChallenge[]>([]);
  const [composer, setComposer] = React.useState(false);
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const working = React.useRef(false);
  const generation = React.useRef(0);
  const focused = React.useRef(false);
  const focusEpoch = React.useRef(0);
  const actionScope = React.useRef(scope);
  if (actionScope.current !== scope) {
    actionScope.current = scope; generation.current++; working.current = false; checkingRef.current = false;
  }
  const [, tick] = React.useState(0);

  const load = React.useCallback(async () => {
    const gen = ++generation.current;
    try {
      const page = await listArenaChallenges(take.id);
      if (!isCurrent() || gen !== generation.current) return;
      setItems(page);
      setMore(page.length === 20);
      setLoaded(true);
      setError(null);
    } catch (e) {
      if (isCurrent() && gen === generation.current) {
        setLoaded(false);
        setError(errorText(e));
      }
    }
  }, [take.id, isCurrent]);

  useFocusEffect(
    React.useCallback(() => {
      if (!signedIn) return;
      focused.current = true;
      focusEpoch.current++;
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
        focusEpoch.current++;
        clearInterval(interval);
        subscription.remove();
        generation.current++;
      };
    }, [signedIn, viewerId, load]),
  );

  React.useEffect(() => {
    setItems([]);
    setLoaded(false);
    setCheckedTake(null); setRejection(null); setChecking(false); checkingRef.current = false;
    setComposer(false);
    setText('');
    setBusy(false); setError(null); setNotice(null);
  }, [take.id, viewerId, user?.id]);
  React.useEffect(() => { setDetailsExpanded(false); }, [scope]);

  const refreshSource = (fresh: Take | null): void => {
    if (fresh) setCheckedTake({ scope, take: fresh });
    onTakeRefreshed?.(fresh);
  };
  const handleEligibilityError = (error: unknown): void => {
    if (error instanceof ChallengeEligibilityError) {
      refreshSource(error.take); setRejection(error.reason); setComposer(false);
      setError(null); // The eligibility reason below owns this message; this is not a list refresh failure.
      return;
    }
    setError(errorText(error));
  };
  const openChallenge = async (draft?: string): Promise<void> => {
    if (!isCurrent() || !focused.current || checkingRef.current || working.current || readOnly || takeChallengeIneligibility(take) || takeChallengeIneligibility(source) || isAuthor || !requireAuth()) return;
    checkingRef.current = true; setChecking(true); setError(null);
    const epoch = focusEpoch.current;
    try {
      const fresh = await fetchEligibleChallengeTake(take.id);
      if (!isCurrent() || !focused.current || focusEpoch.current !== epoch) return;
      refreshSource(fresh); setRejection(null);
      if (fresh.authorId !== viewerId) { if (draft !== undefined) setText(Array.from(draft).slice(0, 500).join('')); setComposer(true); }
    } catch (error) { if (isCurrent()) handleEligibilityError(error); }
    finally { if (isCurrent()) { checkingRef.current = false; setChecking(false); } }
  };
  React.useEffect(() => {
    if ((openComposer || composerRequest) && !isAuthor && signedIn && !closed) void openChallenge(composerRequest?.text);
  }, [openComposer, composerRequest?.id, isAuthor, signedIn, scope, readOnly]);

  React.useEffect(() => { if (closed) { setComposer(false); } }, [closed]);

  const pending = React.useMemo(
    () => items.filter((ch) => challengeCanAct(ch)),
    [items, now],
  );
  const history = React.useMemo(
    () => items.filter((ch) => closed || !challengeCanAct(ch)),
    [items, closed, now],
  );

  const run = async (operation: () => Promise<ArenaChallenge>): Promise<void> => {
    if (!isCurrent() || !focused.current || working.current || !requireAuth()) return;
    working.current = true;
    const gen = ++generation.current;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await operation();
      if (!isCurrent() || !focused.current || gen !== generation.current) return;
      setComposer(false); setText('');
      setNotice(result.status === 'PENDING'
        ? 'Invitation sent. Waiting for the author. View or cancel it in Challenge Inbox.'
        : 'Invitation ' + result.status.toLowerCase() + '. Check Challenge Inbox for its current state.');
      await load();
    } catch (e) {
      if (isCurrent() && focused.current && gen === generation.current) handleEligibilityError(e);
    } finally {
      if (isCurrent()) { working.current = false; setBusy(false); }
    }
  };

  const sendChallenge = (): void => {
    if (!isCurrent() || !focused.current || isAuthor || !validCounterPosition(text)) return;
    const currentReason = takeChallengeIneligibility(take) ?? takeChallengeIneligibility(source);
    if (readOnly || currentReason) {
      setRejection(currentReason ?? 'unavailable'); setComposer(false); return;
    }
    const gen = generation.current + 1;
    void run(() => createArenaChallenge(take.id, text, user?.id,
      () => isCurrent() && focused.current && gen === generation.current));
  };

  const ownPending = items.some((ch) => ch.challengerId === viewerId && challengeCanAct(ch));
  const button = (label: string, action: () => void, disabled = busy) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={action}
      style={[styles.button, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.label, { color: t.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  if (!signedIn || (readOnly && loaded && items.length === 0)) return null;

  return (
    <Animated.View layout={reduced ? undefined : LinearTransition.duration(arena.motion.duration)} style={[styles.section, compact && styles.compactSection, { borderColor: t.border }]}>
      {compact ? <View style={styles.summary}>
        <Pressable accessibilityRole="button" accessibilityLabel="Challenge history" accessibilityState={{ expanded: detailsExpanded }}
          onPress={() => setDetailsExpanded(value => !value)} style={styles.summaryToggle}>
          <Text style={[arena.type.label, { color: colors.ink }]}>{closed ? 'Challenge history' : 'Challenges'}</Text>
          <Text style={[arena.type.meta, { color: colors.muted }]}>{error ? 'Couldn’t refresh' : !loaded ? 'Loading…' : items.length ? 'View available challenges' : 'No challenges yet'} {detailsExpanded ? '−' : '+'}</Text>
        </Pressable>
        {!isAuthor && !closed && !ownPending ? button(checking ? 'Checking…' : 'Challenge', () => void openChallenge(), checking || busy || !loaded) : null}
        {isAuthor && !closed && pending.length > 0 ? button('Review', () => router.push('/arena/challenges'), busy || !loaded) : null}
      </View> : null}
      {reason ? <Text accessibilityRole="alert" style={[styles.body, compact && arena.type.meta, { color: colors.muted }]}>{challengeIneligibilityMessage(reason)}</Text> : null}
      {error && !composer ? <Text accessibilityRole="alert" style={[arena.type.meta, { color: colors.secondary }]}>{error}</Text> : null}
      {rejection && !takeChallengeIneligibility(source, now) && !readOnly && !isAuthor
        ? button('Check challenge eligibility', () => void openChallenge(), checking || busy) : null}
      {notice ? <Text accessibilityRole="alert" style={[styles.body, { color: t.textSecondary }]}>{notice}</Text> : null}
      {notice || ownPending ? button('Open Challenge Inbox', () => router.push('/arena/challenges')) : null}

      {!compact || detailsExpanded ? <>
      {isAuthor ? (
        <>
          <Text style={[styles.heading, { color: t.textPrimary }]}>{closed ? 'Challenge history' : 'Incoming Challenges'}</Text>
          {!loaded ? (
            button('Reload Challenges', () => void load())
          ) : pending.length > 0 && !closed ? (
            <View style={styles.reviewBlock}>
              <Text style={[styles.body, { color: t.textSecondary, paddingHorizontal: space.md }]}>
                {pending.length} pending Challenge{pending.length === 1 ? '' : 's'} waiting for you.
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Review ${pending.length} pending challenges`}
                onPress={() => {
                  hapticPress();
                  router.push('/arena/challenges');
                }}
                style={[styles.reviewBtn, { borderColor: t.borderStrong, backgroundColor: t.surfaceElevated }]}
              >
                <Text style={[styles.reviewLabel, { color: t.textPrimary }]}>Review Challenges</Text>
              </PressableScale>
            </View>
          ) : !closed ? (
            <Text style={[styles.body, { color: t.textMuted, paddingHorizontal: space.md }]}>
              No pending Challenges.
            </Text>
          ) : null}
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
          {!compact && !closed && !ownPending && button(checking ? 'Checking…' : '⚔ CHALLENGE', () => void openChallenge(), busy || checking || !loaded)}
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
                  ? button('CANCEL', () => void run(() => resolveArenaChallenge(ch.id, 'CANCEL', user?.id)))
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
                if (!isCurrent() || gen !== generation.current) return;
                setItems((prev) => [...prev, ...page]);
                setMore(page.length === 20);
              })
              .catch((e) => {
                if (isCurrent() && gen === generation.current) setError(errorText(e));
              })
              .finally(() => {
                if (isCurrent()) { working.current = false; setBusy(false); }
              });
          })
        : null}
      </> : null}

      <Modal
        visible={composer && !closed}
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
            contentContainerStyle={[styles.section, { paddingBottom: insets.bottom + space.lg }]}
          >
            <Text style={[styles.label, { color: t.textPrimary }]}>Challenge this Take</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>{take.text}</Text>
            <TextInput
              autoFocus
              multiline
              editable={!busy}
              value={text}
              onChangeText={setText}
              maxLength={500}
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
              sendChallenge,
              busy || checking || closed || !validCounterPosition(text) || ownPending,
            )}
            {button('Close', () => setComposer(false))}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  compactSection: { gap: 6, paddingVertical: 6, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  summary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  summaryToggle: { flex: 1, minWidth: 150, minHeight: arena.hit, justifyContent: 'center', gap: 1 },
  section: { gap: space.sm, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  reviewBlock: { gap: space.sm, paddingBottom: space.sm },
  reviewBtn: {
    marginHorizontal: space.md,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewLabel: { ...typeScale.label, fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
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
  body: { ...arena.type.body },
  actions: { flexDirection: 'row', gap: space.md },
  button: { paddingVertical: space.sm, minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { ...arena.sheet, flexGrow: 0, maxHeight: '85%' },
  input: { ...arena.input, ...arena.type.body, minHeight: 112, padding: space.sm, textAlignVertical: 'top' },
});
