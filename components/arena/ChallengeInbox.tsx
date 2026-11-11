import React from 'react';
import { Alert, AppState, Pressable, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { fetchChallengeInbox, resolveArenaChallenge } from '../../services/arenaChallengeService';
import { challengeCanAct } from '../../utils/arenaChallengePayload';
import { linkedRoomAfterAccept } from '../../utils/arenaAcceptNavigation';
import {
  challengeDestination,
  challengeInboxError,
  type InboxChallenge,
  type InboxDirection,
} from '../../utils/challengeInbox';
import {
  challengeActionAccessibility,
  challengeInboxActorRole,
  challengeStatusPresentation,
} from '../../utils/challengePresentation';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';

export function ChallengeInbox(): React.JSX.Element {
  const t = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();
  const [direction, setDirection] = React.useState<InboxDirection>('INCOMING');
  const [items, setItems] = React.useState<InboxChallenge[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(user));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [, tick] = React.useState(0);
  const generation = React.useRef(0);
  const focused = React.useRef(false);
  const focusEpoch = React.useRef(0);
  const working = React.useRef(false);
  const loadingRef = React.useRef(false);
  const scope = `${user?.id ?? 'guest'}:${direction}`;
  const currentScope = React.useRef({ key: scope });
  const displayedScope = React.useRef(currentScope.current);
  if (currentScope.current.key !== scope) {
    currentScope.current = { key: scope };
    generation.current += 1;
    working.current = false;
    loadingRef.current = false;
  }
  const actionScope = currentScope.current;
  const isCurrent = (): boolean => focused.current && currentScope.current === actionScope;

  const load = React.useCallback(async (before?: InboxChallenge): Promise<void> => {
    if (!user || currentScope.current !== actionScope || (before && loadingRef.current)) return;
    const request = ++generation.current;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchChallengeInbox(direction, user.id, before);
      if (!isCurrent() || request !== generation.current) return;
      setItems((previous) =>
        before
          ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))]
          : page.items,
      );
      setHasMore(page.hasMore);
    } catch (e) {
      if (isCurrent() && request === generation.current) setError(challengeInboxError(e));
    } finally {
      if (isCurrent() && request === generation.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [direction, user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      focused.current = true;
      focusEpoch.current++;
      displayedScope.current = actionScope;
      working.current = false;
      setBusy(null);
      setItems([]);
      setHasMore(false);
      setError(null);
      setNotice(null);
      void load();
      const refresh = () => {
        if (AppState.currentState !== 'active') return;
        tick((n) => n + 1);
        if (!working.current && !loadingRef.current) void load();
      };
      const timer = setInterval(refresh, 30_000);
      const subscription = AppState.addEventListener('change', (status) => {
        if (status === 'active') refresh();
      });
      return () => {
        focused.current = false;
        focusEpoch.current++;
        generation.current += 1;
        loadingRef.current = false;
        clearInterval(timer);
        subscription.remove();
      };
    }, [load]),
  );

  const act = async (item: InboxChallenge, action: 'ACCEPT' | 'PASS' | 'CANCEL'): Promise<void> => {
    const allowed = direction === 'INCOMING' ? action !== 'CANCEL' : action === 'CANCEL';
    if (!user || !isCurrent() || !allowed || working.current || loadingRef.current || !challengeCanAct(item)) {
      return;
    }
    working.current = true;
    const epoch = focusEpoch.current;
    const request = ++generation.current;
    setBusy(item.id);
    setError(null);
    setNotice(null);
    tap();
    let enteringRoom = false;
    try {
      const result = await resolveArenaChallenge(item.id, action, user.id);
      if (!isCurrent() || request !== generation.current) return;
      if (result.id !== item.id || result.takeId !== item.takeId) throw new Error('Invitation response did not match. Refresh to verify its state.');
      const roomId = action === 'ACCEPT' ? linkedRoomAfterAccept(result) : null;
      if (roomId) {
        router.push(`/arena/room/${roomId}`);
        enteringRoom = true;
        return;
      }
      const status = challengeStatusPresentation(result.status);
      setNotice(
        result.status === 'ACCEPTED' && !result.roomId
          ? 'Accepted. The Room is not ready yet. Refresh to check again.'
          : `Invitation ${status.label.toLowerCase()}.`,
      );
      await load();
    } catch (e) {
      if (!isCurrent() || request !== generation.current) return;
      await load();
      if (isCurrent()) setError(challengeInboxError(e));
    } finally {
      // Preserve navigation reservation; an old focus must not unlock a newer action.
      if (currentScope.current === actionScope && epoch === focusEpoch.current && !enteringRoom) {
        working.current = false;
        if (focused.current) setBusy(null);
      }
    }
  };

  const cancel = (item: InboxChallenge): void => {
    Alert.alert('Cancel invitation?', 'The recipient will no longer be able to accept this invitation.', [
      { text: 'Keep invitation', style: 'cancel' },
      {
        text: 'Cancel invitation',
        style: 'destructive',
        onPress: () => {
          void act(item, 'CANCEL');
        },
      },
    ]);
  };

  const button = (
    label: string,
    onPress: () => void,
    disabled = false,
    accessibilityLabel?: string,
    accessibilityHint?: string,
  ): React.JSX.Element => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { borderColor: t.border, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: t.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  const renderCard = (item: InboxChallenge): React.JSX.Element => {
    const actor = direction === 'INCOMING' ? item.challenger : item.recipient;
    const status = challengeStatusPresentation(item.status);
    const actionable = challengeCanAct(item);
    const disabled = loading || busy !== null;
    const acceptA11y = challengeActionAccessibility('accept');
    const passA11y = challengeActionAccessibility('pass');
    return (
      <View key={item.id} style={[styles.card, { borderColor: t.border, backgroundColor: t.surface }]}>
        <View style={styles.cardHead}>
          <Avatar name={actor.name} tint="#73849A" size={40} />
          <View style={styles.cardIdentity}>
            <Text style={[styles.role, { color: t.textMuted }]}>
              {challengeInboxActorRole(direction)}
            </Text>
            <Text numberOfLines={2} style={[styles.name, { color: t.textPrimary }]}>
              {actor.name}
            </Text>
            <Text numberOfLines={1} style={[styles.handle, { color: t.textSecondary }]}>
              @{actor.handle}
            </Text>
          </View>
          <View style={[styles.statusChip, { borderColor: t.border }]}>
            <Text style={[styles.status, { color: t.textSecondary }]}>{status.label}</Text>
          </View>
        </View>

        <Text style={[styles.summary, { color: t.textMuted }]}>
          {item.status === 'ACCEPTED'
            ? 'Acceptance confirmed. Open the Room for its current phase, arguments and result.'
            : status.summary}
        </Text>

        <View style={[styles.source, { borderColor: t.border }]}>
          <Text style={[styles.role, { color: t.textMuted }]}>SOURCE TAKE</Text>
          <Text numberOfLines={3} style={[styles.name, { color: t.textPrimary }]}>
            {item.source.title}
          </Text>
        </View>

        <Text style={[styles.role, { color: t.textMuted }]}>COUNTERPOSITION</Text>
        <Text numberOfLines={5} style={[styles.body, { color: t.textSecondary }]}>
          {item.counterPosition}
        </Text>

        <Text style={[styles.time, { color: t.textMuted }]}>
          Created {new Date(item.createdAt).toLocaleString()}
        </Text>
        <Text style={[styles.time, { color: t.textMuted }]}>
          Invitation expires {new Date(item.expiresAt).toLocaleString()}
        </Text>

        {item.status === 'PENDING' && !actionable ? (
          <Text style={[styles.body, { color: t.textMuted }]}>
            Deadline passed. Refresh to confirm the server status.
          </Text>
        ) : null}
        {item.status === 'ACCEPTED' && (!item.clashId || !item.roomId) ? (
          <Text style={[styles.body, { color: t.textMuted }]}>Accepted · Room not ready yet.</Text>
        ) : null}
        {busy === item.id ? (
          <Text accessibilityLiveRegion="polite" style={{ color: t.textMuted }}>
            Updating invitation…
          </Text>
        ) : null}

        <View style={styles.actions}>
          {button('View Take', () => router.push(`/take/${item.takeId}`), busy !== null)}
          {item.status === 'ACCEPTED' && item.clashId && item.roomId
            ? button('Open Room', () => router.push(challengeDestination(item)), busy !== null)
            : null}
          {actionable && direction === 'INCOMING' ? (
            <>
              {button(
                'Accept',
                () => {
                  void act(item, 'ACCEPT');
                },
                disabled,
                acceptA11y.label,
                acceptA11y.hint,
              )}
              {button(
                'Decline',
                () => {
                  void act(item, 'PASS');
                },
                disabled,
                passA11y.label,
                passA11y.hint,
              )}
            </>
          ) : null}
          {actionable && direction === 'OUTGOING'
            ? button('Cancel invitation', () => cancel(item), disabled)
            : null}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={displayedScope.current === actionScope ? items : []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderCard(item)}
      contentContainerStyle={styles.content}
      accessibilityLabel="Challenge Inbox"
      refreshing={loading && items.length === 0}
      onRefresh={() => {
        if (!working.current) void load();
      }}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <Text style={[styles.title, { color: t.textPrimary }]}>Challenge Inbox</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            Review the source Take and counterposition. Accept opens the confirmed Room; only its two fighters can publish official arguments.
          </Text>
          <View style={styles.actions} accessibilityRole="tablist">
            {(['INCOMING', 'OUTGOING'] as InboxDirection[]).map((section) => (
              <Pressable
                key={section}
                accessibilityRole="tab"
                accessibilityState={{ selected: direction === section, disabled: busy !== null }}
                accessibilityLabel={
                  section === 'INCOMING' ? 'Incoming challenges' : 'Outgoing challenges'
                }
                disabled={busy !== null}
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
                style={[
                  styles.segment,
                  {
                    borderColor: direction === section ? t.textPrimary : t.border,
                    backgroundColor: direction === section ? t.surfaceMuted : t.background,
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: t.textPrimary }]}>
                  {section === 'INCOMING' ? 'Incoming' : 'Outgoing'}
                </Text>
              </Pressable>
            ))}
          </View>
          {!user
            ? button('Sign in', () => router.push('/auth'))
            : button(
                loading ? 'Refreshing…' : 'Refresh',
                () => {
                  void load();
                },
                loading || busy !== null,
              )}
          {error ? (
            <Text accessibilityRole="alert" style={[styles.body, { color: t.textSecondary }]}>
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: t.textSecondary }]}>
              {notice}
            </Text>
          ) : null}
          {user && !loading && !error && items.length === 0 ? (
            <Text style={[styles.body, { color: t.textMuted }]}>
              No {direction.toLowerCase()} invitations.
            </Text>
          ) : null}
        </View>
      }
      ListFooterComponent={
        hasMore
          ? button(
              loading ? 'Loading…' : 'Load more',
              () => {
                void load(items[items.length - 1]);
              },
              loading || busy !== null,
            )
          : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  title: { ...typeScale.section, fontSize: 26, fontWeight: '800' },
  name: { ...typeScale.label, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  handle: { ...typeScale.caption, fontSize: 13, lineHeight: 18 },
  body: { ...typeScale.body, fontSize: 14, lineHeight: 21 },
  summary: { ...typeScale.caption, fontSize: 13, lineHeight: 18 },
  role: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  status: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
  time: { ...typeScale.caption, fontSize: 12, lineHeight: 18 },
  card: {
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    gap: space.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardIdentity: { flex: 1, minWidth: 0, gap: 2 },
  statusChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  source: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    gap: 4,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  buttonText: { ...typeScale.label, fontSize: 14, fontWeight: '700' },
});
