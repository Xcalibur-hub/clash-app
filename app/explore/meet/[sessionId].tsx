import { releaseAllows } from '../../../utils/releaseScope';
/**
 * 1:1 pseudonymous text Meet chat.
 * Lifecycle (terminal absorbing, request ordering, AppState pausing) lives in
 * `useMeetChat`; this screen is presentation plus moderation actions.
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
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
import { MeetButton } from '../../../components/meet/MeetButton';
import { MeetReportSheet } from '../../../components/meet/MeetReportSheet';
import { useMeetChat } from '../../../hooks/useMeetChat';
import { analytics } from '../../../services/analytics';
import {
  blockMeetPeer,
  leaveMeetQueue,
  nextMeet,
  reportMeetMessage,
  reportMeetSession,
  type MeetMessage,
  type MeetReportReason,
} from '../../../services/meetService';
import { layout, radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { meetQueueOutcome } from '../../../utils/meetLifecycle';
import { meetReportNotice } from '../../../utils/meetSafety';

export default function MeetChatScreen(): React.JSX.Element {
  const { sessionId: raw } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = typeof raw === 'string' ? raw : '';
  const t = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const chat = useMeetChat(sessionId);
  const session = chat.session;
  const [draft, setDraft] = React.useState('');
  // Android KAV `height` can retain a post-IME bottom offset when hide
  // coordinates do not match the restored frame (E3.6.5: 209px). Gate
  // avoidance to IME-visible windows and remount after hide so the next
  // open does not compound sticky `state.bottom`.
  const [androidImeOpen, setAndroidImeOpen] = React.useState(
    () => Platform.OS === 'android' && Keyboard.isVisible(),
  );
  const [androidKavEpoch, setAndroidKavEpoch] = React.useState(0);
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setAndroidImeOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidImeOpen(false);
      setAndroidKavEpoch((epoch) => epoch + 1);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  /** null = report the whole conversation; a message id = report that bubble. */
  const [reportMessage, setReportMessage] = React.useState<string | null>(null);

  const statusLine = React.useMemo(() => {
    if (chat.status === 'expired') return 'Conversation expired';
    if (chat.status === 'ended') return 'Conversation ended';
    if (chat.status === 'disconnected') return 'Stranger disconnected';
    if (chat.peerTyping) return 'Typing...';
    return session?.sharedInterest ? `Connected - ${session.sharedInterest}` : 'Connected';
  }, [chat.peerTyping, chat.status, session?.sharedInterest]);

  const footerNote = React.useMemo(() => {
    if (chat.status === 'expired') return 'This conversation expired. Nothing else can be sent.';
    if (chat.status === 'ended') return 'This conversation has ended.';
    if (chat.status === 'disconnected') return 'Stranger disconnected.';
    return 'Reconnecting...';
  }, [chat.status]);

  const error = actionError ?? chat.error;

  const onSend = async (): Promise<void> => {
    const body = draft.trim();
    if (!body || chat.sending) return;
    setDraft('');
    const sent = await chat.send(body);
    // Keep the words if the send failed, so a blip never eats a message.
    if (!sent) setDraft((current) => (current.length > 0 ? current : body));
  };

  const onLeave = async (): Promise<void> => {
    analytics.track('meet_left', { realm: 'explore', source: 'explore' });
    await chat.leave();
    router.replace('/(tabs)/explore' as never);
  };

  const onNext = async (): Promise<void> => {
    if (!session) return;
    setActionError(null);
    setNotice(null);
    try {
      analytics.track('meet_next', { realm: 'explore', source: 'explore' });
      const state = await nextMeet(session.sessionId, {
        mode: session.mode,
        channel: 'TEXT',
        countryCode: session.countryCode,
        hood: session.hood,
        interests: session.sharedInterest ? [session.sharedInterest] : [],
      });
      chat.markEnded();
      if (state.matched && state.session && meetQueueOutcome(state, Date.now()) === 'matched') {
        router.replace(`/explore/meet/${state.session.sessionId}` as never);
        return;
      }
      // next_meet leaves us queued when nobody is waiting. Dropping the row
      // avoids a phantom search the user is no longer looking at.
      await leaveMeetQueue().catch(() => undefined);
      router.replace('/(tabs)/explore' as never);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not find someone else.');
    }
  };

  const onBlock = async (): Promise<void> => {
    if (!session) return;
    setMenuOpen(false);
    setActionError(null);
    setNotice(null);
    hapticTap();
    try {
      analytics.track('meet_blocked', { realm: 'explore', source: 'explore' });
      await blockMeetPeer(session.sessionId);
      chat.markEnded();
      router.replace('/(tabs)/explore' as never);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Block failed.');
    }
  };

  // Reporting is two steps: pick a reason here, then one RPC in submitReport.
  // A reason-less report is what E3.2 replaces, so no default is pre-selected.
  const openReport = (messageId: string | null): void => {
    setMenuOpen(false);
    setActionError(null);
    setNotice(null);
    setReportMessage(messageId);
    setReportOpen(true);
    hapticTap();
  };

  const submitReport = async (reason: MeetReportReason): Promise<void> => {
    if (!session) return;
    const messageId = reportMessage;
    setReportOpen(false);
    setReportMessage(null);
    setActionError(null);
    setNotice(null);
    try {
      analytics.track('meet_reported', { realm: 'explore', source: 'explore' });
      if (messageId) await reportMeetMessage(session.sessionId, messageId, reason);
      else await reportMeetSession(session.sessionId, reason);
      setNotice(meetReportNotice(reason, messageId ? 'message' : 'session'));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Report failed.');
    }
  };


  if (chat.loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textSecondary} />
        <Text style={[styles.dim, { color: t.textSecondary }]}>Opening conversation...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: t.background, gap: space.md }]}>
        <Text style={[styles.unavailable, { color: t.textPrimary }]}>
          {error ?? 'This conversation is no longer available.'}
        </Text>
        <MeetButton label="Try again" tone="light" onPress={() => void chat.refresh()} />
        <MeetButton
          label="Back to Explore"
          tone="glass"
          onPress={() => router.replace('/(tabs)/explore' as never)}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      key={Platform.OS === 'android' ? `meet-kav-${androidKavEpoch}` : 'meet-kav'}
      style={[styles.screen, { backgroundColor: t.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={Platform.OS !== 'android' || androidImeOpen}
    >
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.backHit}
        >
          <Text style={[styles.chevron, { color: t.textPrimary }]}>Back</Text>
        </Pressable>
        <View style={styles.headerMeta}>
          <Text style={[styles.alias, { color: t.textPrimary }]} numberOfLines={1}>
            {session.peerAlias}
          </Text>
          <Text style={[styles.status, { color: t.textSecondary }]} numberOfLines={1}>
            {statusLine}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversation actions"
          hitSlop={12}
          onPress={() => {
            hapticTap();
            setMenuOpen((open) => !open);
          }}
          style={styles.backHit}
        >
          <Text style={[styles.chevron, { color: t.textPrimary }]}>...</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
          <MeetButton label="New Meet sessions unavailable" disabled={!releaseAllows('meet', 'admit')} tone="glass" onPress={() => void onNext()} />
          <MeetButton label="Report stranger" tone="glass" onPress={() => openReport(null)} />
          <MeetButton label="Block stranger" tone="glass" onPress={() => void onBlock()} />
          <MeetButton label="Leave chat" tone="glass" onPress={() => void onLeave()} />
        </View>
      ) : null}


      <FlatList
        style={styles.messageViewport}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        data={chat.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }: { item: MeetMessage }) => (
          <View style={[styles.bubbleRow, item.mine ? styles.bubbleRowMine : null]}>
            <Pressable
              // Long-press on a peer bubble reports that message (E3.2). Own
              // messages are not reportable server-side, so the gesture is off.
              onLongPress={item.mine ? undefined : () => openReport(item.id)}
              delayLongPress={400}
              accessibilityHint={item.mine ? undefined : 'Long press to report this message'}
              style={[
                styles.bubble,
                item.mine
                  ? { backgroundColor: t.accent }
                  : { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.bubbleText, { color: item.mine ? t.textInverse : t.textPrimary }]}>
                {item.body}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.dim, { color: t.textSecondary }]}>
            Say hello, keep it kind. Nothing here lasts forever.
          </Text>
        }
        ListFooterComponent={
          chat.peerTyping ? (
            <Text style={[styles.dim, { color: t.textSecondary }]}>Typing...</Text>
          ) : (
            <View style={styles.spacer} />
          )
        }
      />

      {notice ? (
        <Text style={[styles.error, { color: t.textSecondary }]} numberOfLines={3}>
          {notice}
        </Text>
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: t.danger }]} numberOfLines={3}>
          {error}
        </Text>
      ) : null}

      {chat.canSend ? (
        <View
          style={[
            styles.composer,
            { borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, space.sm) },
          ]}
        >
          <TextInput
            accessibilityLabel="Message"
            value={draft}
            onChangeText={(next) => {
              setDraft(next);
              chat.notifyTyping(next.trim().length > 0);
            }}
            placeholder="Message..."
            placeholderTextColor={t.textSecondary}
            style={[
              styles.input,
              { color: t.textPrimary, backgroundColor: t.surface, borderColor: t.border },
            ]}
            multiline
            maxLength={1000}
            editable={!chat.sending}
            onSubmitEditing={() => void onSend()}
            blurOnSubmit={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={draft.trim().length === 0 || chat.sending}
            onPress={() => void onSend()}
            style={[
              styles.send,
              {
                backgroundColor: t.accent,
                opacity: draft.trim().length === 0 || chat.sending ? 0.4 : 1,
              },
            ]}
          >
            <Text style={[styles.sendLabel, { color: t.textInverse }]}>Send</Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.footer,
            { borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, space.sm) },
          ]}
        >
          <Text style={[styles.dim, { color: t.textSecondary }]}>{footerNote}</Text>
          <MeetButton label="New Meet sessions unavailable" disabled={!releaseAllows('meet', 'admit')} tone="light" onPress={() => void onNext()} />
          <MeetButton label="Leave" tone="glass" onPress={() => void onLeave()} />
        </View>
      )}

      <MeetReportSheet
        visible={reportOpen}
        title={reportMessage ? 'Report this message' : `Report ${session.peerAlias}`}
        subtitle="Only the reason is sent. Moderators can read this conversation; the stranger is not told."
        onPick={(reason) => void submitReport(reason)}
        onCancel={() => {
          setReportOpen(false);
          setReportMessage(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  unavailable: {
    ...typeScale.bodyStrong,
    textAlign: 'center',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backHit: {
    minWidth: layout.hit,
    minHeight: layout.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: { ...typeScale.label },
  headerMeta: { flex: 1, alignItems: 'center' },
  alias: { ...typeScale.bodyStrong },
  status: { ...typeScale.meta },
  menu: {
    marginHorizontal: layout.screenX,
    marginTop: space.sm,
    padding: space.sm,
    gap: space.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageViewport: { flex: 1, minHeight: 0 },
  list: {
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
    gap: space.xs,
    flexGrow: 1,
  },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
  },
  bubbleText: { ...typeScale.body },
  dim: { ...typeScale.meta },
  spacer: { height: space.xs },
  error: {
    ...typeScale.meta,
    paddingHorizontal: layout.screenX,
    paddingBottom: space.xs,
  },
  composer: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: layout.hit,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    ...typeScale.body,
  },
  send: {
    flexShrink: 0,
    minWidth: layout.hit,
    minHeight: layout.hit,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { ...typeScale.button },
  footer: {
    flexShrink: 0,
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
    gap: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

