import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowButton } from '../../../components/shared/GlowButton';
import { analytics } from '../../../services/analytics';
import {
  blockMeetPeer,
  fetchMeetSession,
  leaveMeetSession,
  listMeetMessages,
  nextMeet,
  pollMeetMessages,
  reportMeetSession,
  sendMeetMessage,
  subscribeMeetTyping,
  type MeetMessage,
  type MeetSession,
} from '../../../services/meetService';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export default function MeetChatScreen(): React.JSX.Element {
  const { sessionId: raw } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = typeof raw === 'string' ? raw : '';
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [session, setSession] = React.useState<MeetSession | null>(null);
  const [messages, setMessages] = React.useState<MeetMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [peerTyping, setPeerTyping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const seen = React.useRef(new Set<string>());
  const typingRef = React.useRef<ReturnType<typeof subscribeMeetTyping> | null>(null);

  const upsert = React.useCallback((msg: MeetMessage) => {
    if (seen.current.has(msg.id)) return;
    seen.current.add(msg.id);
    setMessages((prev) => [...prev, msg].sort((a, b) => a.createdAt - b.createdAt));
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, list] = await Promise.all([
          fetchMeetSession(sessionId),
          listMeetMessages(sessionId, 60),
        ]);
        if (!alive) return;
        setSession(s);
        for (const m of list) seen.current.add(m.id);
        setMessages(list);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Chat unavailable');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const unsubMessages = pollMeetMessages(sessionId, (batch) => {
      for (const m of batch) upsert(m);
    });

    typingRef.current = subscribeMeetTyping(sessionId, setPeerTyping);

    const poll = setInterval(() => {
      void fetchMeetSession(sessionId)
        .then((s) => {
          if (alive) setSession(s);
        })
        .catch(() => undefined);
    }, 4000);

    return () => {
      alive = false;
      unsubMessages();
      typingRef.current?.unsubscribe();
      clearInterval(poll);
    };
  }, [sessionId, upsert]);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMeetMessage(sessionId, body);
      upsert(msg);
      setDraft('');
      typingRef.current?.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const onLeave = async () => {
    try {
      await leaveMeetSession(sessionId, 'leave');
      analytics.track('meet_left', { realm: 'explore', source: 'explore' });
      router.replace('/(tabs)/explore' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Leave failed');
    }
  };

  const onNext = async () => {
    if (!session) return;
    try {
      analytics.track('meet_next', { realm: 'explore', source: 'explore' });
      const state = await nextMeet(sessionId, {
        mode: session.mode,
        countryCode: session.countryCode,
        hood: session.hood,
        interests: session.sharedInterest ? [session.sharedInterest] : [],
      });
      if (state.matched && state.session) {
        router.replace(`/explore/meet/${state.session.sessionId}` as never);
      } else {
        router.replace('/(tabs)/explore' as never);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Next failed');
    }
  };

  const onBlock = async () => {
    try {
      await blockMeetPeer(sessionId);
      analytics.track('meet_blocked', { realm: 'explore', source: 'explore' });
      router.replace('/(tabs)/explore' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Block failed');
    }
  };

  const onReport = async () => {
    try {
      await reportMeetSession(sessionId, 'harassment');
      analytics.track('meet_reported', { realm: 'explore', source: 'explore' });
      setMenuOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report failed');
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  const disconnected = session?.status === 'ended' || session?.peerConnected === false;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: t.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ color: t.textPrimary, fontWeight: '700', fontSize: 18 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text allowFontScaling={false} style={[styles.peer, { color: t.textPrimary }]}>
            {session?.peerAlias ?? 'Stranger'}
          </Text>
          <Text allowFontScaling={false} style={{ color: t.textMuted, fontSize: 12 }}>
            {disconnected
              ? 'Stranger disconnected'
              : peerTyping
                ? 'Typing…'
                : `● Connected${session?.sharedInterest ? ` · ${session.sharedInterest}` : ''}`}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            hapticTap();
            setMenuOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel="Chat actions"
        >
          <Text style={{ color: t.textPrimary, fontWeight: '800' }}>···</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={[styles.menu, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
          <GlowButton label="Next" onPress={() => void onNext()} tone="light" compact />
          <GlowButton label="Report" onPress={() => void onReport()} tone="glass" compact />
          <GlowButton label="Block" onPress={() => void onBlock()} tone="glass" compact />
          <GlowButton label="Leave" onPress={() => void onLeave()} tone="glass" compact />
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingVertical: space.md,
          gap: 8,
          flexGrow: 1,
        }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.mine
                ? { alignSelf: 'flex-end', backgroundColor: t.textPrimary }
                : { alignSelf: 'flex-start', backgroundColor: t.surfaceElevated, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={{ color: item.mine ? t.background : t.textPrimary, fontSize: 15, lineHeight: 21 }}
            >
              {item.body}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text allowFontScaling={false} style={{ color: t.textMuted, textAlign: 'center' }}>
            Say hello — keep it kind.
          </Text>
        }
      />

      {disconnected ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
          <Text allowFontScaling={false} style={{ color: t.textMuted, marginBottom: 8 }}>
            Stranger disconnected.
          </Text>
          <GlowButton label="Find someone else" onPress={() => void onNext()} tone="light" />
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8, borderColor: t.border }]}>
          {error ? (
            <Text allowFontScaling={false} style={{ color: t.danger, marginBottom: 6 }}>
              {error}
            </Text>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                typingRef.current?.broadcast();
              }}
              placeholder="Message…"
              placeholderTextColor={t.textMuted}
              maxLength={280}
              style={[
                styles.input,
                { color: t.textPrimary, backgroundColor: t.inputBackground, borderColor: t.border },
              ]}
            />
            <Pressable
              onPress={() => void onSend()}
              disabled={sending || !draft.trim()}
              style={[
                styles.send,
                {
                  backgroundColor: t.textPrimary,
                  opacity: sending || !draft.trim() ? 0.45 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Text style={{ color: t.background, fontWeight: '800' }}>Send</Text>
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.screenX,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  peer: { ...typeScale.section, fontSize: 18, fontWeight: '800' },
  menu: {
    marginHorizontal: layout.screenX,
    marginTop: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    gap: 8,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  footer: {
    paddingHorizontal: layout.screenX,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    paddingHorizontal: layout.screenX,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  send: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
