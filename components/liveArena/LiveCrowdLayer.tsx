/** Public Crowd presentation. Only server-authorized rows; no layout fixtures. */
import React from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import type { useArenaCrowd } from '../../hooks/useArenaCrowd';
import { validCrowdText, type CrowdMessage } from '../../utils/arenaCrowd';
import { crowdAtLiveEdge, crowdTimeLabel } from '../../utils/crowdPresentation';
import { createCrowdArrivalTracker } from '../../utils/crowdArrivals';
import { duelCrowdChrome } from '../../utils/duelStageMotion';
import { spectatorCrowdEmptyCopy } from '../../utils/spectatorPresentation';
import { crowdRowLabel } from './liveArenaStyles';
import { layout, space, typeScale, useThemeColors } from '../../theme';

export type CrowdModel = ReturnType<typeof useArenaCrowd>;
export interface LiveCrowdLayerProps {
  subdued?: boolean;
  paddingBottom?: number;
  crowd?: CrowdModel;
  unavailableReason?: string;
  onReport?: (message: CrowdMessage) => void;
  readOnly?: boolean;
}

// This UUID is an idempotency nonce, never an identity or authorization token.
function requestKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}

export function LiveCrowdLayer({
  subdued = false,
  paddingBottom = 0,
  crowd,
  onReport,
  unavailableReason,
  readOnly = false,
}: LiveCrowdLayerProps): React.JSX.Element {
  const t = useThemeColors();
  const [draft, setDraft] = React.useState('');
  const [unseen, setUnseen] = React.useState(false);
  const pending = React.useRef<{ body: string; key: string } | null>(null);
  const list = React.useRef<FlatList<CrowdMessage>>(null);
  const atLatest = React.useRef(true);
  const userScrolled = React.useRef(false);
  const canSend = !readOnly && Boolean(crowd?.context?.canSend);
  const chrome = duelCrowdChrome(readOnly);
  const arrivals = React.useRef(createCrowdArrivalTracker());
  const crowdScope = crowd?.context?.roomId ?? null;

  React.useEffect(() => {
    arrivals.current.reset();
  }, [crowdScope]);

  React.useEffect(() => {
    const alert = arrivals.current.observe(crowd?.messages ?? [], { atLiveEdge: atLatest.current });
    if (alert) setUnseen(true);
    else if (atLatest.current) setUnseen(false);
    if (!atLatest.current) return;
    const timer = setTimeout(() => {
      if (atLatest.current) list.current?.scrollToEnd({ animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, [crowd?.messages]);

  const send = async () => {
    const body = draft.trim();
    if (!crowd || !canSend || !validCrowdText(body) || crowd.sending) return;
    if (!pending.current || pending.current.body !== body) pending.current = { body, key: requestKey() };
    if (await crowd.send(body, pending.current.key)) {
      setDraft('');
      pending.current = null;
      atLatest.current = true;
    }
  };

  const connectionState = readOnly
    ? chrome.idleState
    : crowd?.connected
      ? chrome.idleState
      : crowd?.context
        ? 'Reconnecting…'
        : '';

  const emptyCopy = spectatorCrowdEmptyCopy({
    readOnly,
    loading: Boolean(crowd?.loading),
    hasContext: Boolean(crowd?.context),
    hasCrowdModel: Boolean(crowd),
    unavailableReason,
  });

  return (
    <View style={[styles.wrap, { paddingBottom }]} accessibilityLabel={readOnly ? 'Crowd' : 'Live crowd'}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={[styles.label, { color: t.textSecondary }]}>{chrome.label}</Text>
          <Text style={[styles.headingSub, { color: t.textMuted }]}>
            {readOnly ? 'Spectator conversation · closed' : 'Spectator conversation'}
          </Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.state, { color: t.textMuted }]}>
          {connectionState}
        </Text>
      </View>

      {crowd?.error ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: t.textSecondary }}>
            {crowd.error}
          </Text>
          <Pressable onPress={() => void crowd.refresh()} accessibilityRole="button" style={styles.hit}>
            <Text style={{ color: t.textPrimary }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={list}
        style={styles.stream}
        data={crowd?.messages ?? []}
        keyExtractor={(row) => row.id}
        initialNumToRender={15}
        maxToRenderPerBatch={12}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScrollBeginDrag={() => {
          userScrolled.current = true;
        }}
        onScroll={(event) => {
          if (!userScrolled.current) return;
          const e = event.nativeEvent;
          const edge = crowdAtLiveEdge({
            offsetY: e.contentOffset.y,
            layoutHeight: e.layoutMeasurement.height,
            contentHeight: e.contentSize.height,
          });
          atLatest.current = edge;
          if (edge) setUnseen(false);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atLatest.current) list.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={
          crowd?.hasOlder ? (
            <Pressable
              disabled={crowd.olderBusy}
              accessibilityRole="button"
              style={styles.hit}
              onPress={() => {
                atLatest.current = false;
                void crowd.loadOlder();
              }}
            >
              <Text style={{ color: t.textMuted }}>{crowd.olderBusy ? 'Loading…' : 'Load earlier chat'}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: t.textSecondary }]}>
              {readOnly ? 'Crowd quiet' : 'Start the conversation'}
            </Text>
            <Text style={[styles.empty, { color: t.textMuted }]}>{emptyCopy}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[styles.row, { borderBottomColor: t.border }]}
            accessibilityRole="text"
            accessibilityLabel={crowdRowLabel(item.author.handle, item.body)}
          >
            <View
              style={[styles.avatar, { backgroundColor: t.surfaceElevated }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.avatarGlyph}>{item.author.handle.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.metaRow}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.handle,
                    { color: t.textSecondary, flexShrink: 1 },
                    Platform.OS === 'web' ? ({ overflowWrap: 'anywhere' } as TextStyle) : null,
                  ]}
                >
                  @{item.author.handle}
                </Text>
                <Text numberOfLines={1} style={[styles.time, { color: t.textMuted }]}>
                  {crowdTimeLabel(item.createdAt, Date.now())}
                </Text>
              </View>
              <Text
                style={[
                  styles.line,
                  { color: subdued ? t.textSecondary : t.textPrimary },
                  Platform.OS === 'web' ? ({ overflowWrap: 'anywhere' } as TextStyle) : null,
                ]}
              >
                {item.body}
              </Text>
            </View>
            {onReport ? (
              <Pressable
                onPress={() => onReport(item)}
                accessibilityRole="button"
                accessibilityLabel={`Report or block @${item.author.handle}`}
                style={styles.menu}
              >
                <Text style={{ color: t.textMuted }}>···</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />

      {unseen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="New Crowd messages are available. Scrolls to the newest message"
          style={[styles.latestButton, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}
          onPress={() => {
            atLatest.current = true;
            setUnseen(false);
            list.current?.scrollToEnd({ animated: false });
          }}
        >
          <Text style={[styles.latestLabel, { color: t.textPrimary }]}>New messages ↓</Text>
        </Pressable>
      ) : null}

      {crowd?.context ? (
        canSend ? (
          <View style={[styles.composer, { borderColor: t.border, backgroundColor: t.surface }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the Crowd"
              placeholderTextColor={t.textMuted}
              accessibilityLabel="Public Crowd message"
              accessibilityHint="Public message, visible to everyone in this Clash"
              multiline
              maxLength={500}
              editable={!crowd.sending}
              blurOnSubmit={false}
              returnKeyType="default"
              style={[styles.input, { color: t.textPrimary }]}
            />
            <Pressable
              disabled={crowd.sending || !validCrowdText(draft.trim())}
              accessibilityRole="button"
              accessibilityLabel="Send public Crowd message"
              onPress={() => void send()}
              style={[styles.sendButton, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}
            >
              <Text style={{ color: t.textPrimary, opacity: validCrowdText(draft.trim()) ? 1 : 0.4 }}>
                {crowd.sending ? 'Sending…' : 'Send'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.readOnlyNote, { color: t.textMuted }]}>
            {readOnly ? 'Crowd chat is read-only for this Clash.' : 'Crowd chat is read-only.'}
          </Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, paddingHorizontal: layout.screenX, paddingTop: space.xs },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 6,
  },
  headingCopy: { flex: 1, minWidth: 0, gap: 1 },
  label: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 0.9 },
  headingSub: { ...typeScale.caption, fontSize: 11, fontWeight: '500' },
  state: { ...typeScale.caption, fontSize: 11, fontWeight: '600', paddingTop: 1 },
  stream: { flex: 1, minHeight: 0 },
  content: { paddingVertical: 4, gap: 0, flexGrow: 1 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  avatarGlyph: { fontSize: 11, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 },
  handle: { fontWeight: '700', fontSize: 12, letterSpacing: 0.1 },
  time: { fontSize: 11, fontWeight: '500', flexShrink: 0 },
  line: { ...typeScale.body, fontSize: 14, lineHeight: 20, minWidth: 0 },
  menu: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { paddingVertical: 18, gap: 4, alignItems: 'flex-start' },
  emptyTitle: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  empty: { ...typeScale.caption, lineHeight: 18, maxWidth: 320 },
  notice: { gap: 4 },
  hit: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8 },
  latestButton: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginVertical: 4,
  },
  latestLabel: { fontSize: 13, fontWeight: '700' },
  sendButton: {
    minHeight: 44,
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: space.sm,
    paddingBottom: 2,
    marginTop: 2,
  },
  input: { flex: 1, minHeight: 44, maxHeight: 92, fontSize: 15, paddingVertical: 10, lineHeight: 20 },
  readOnlyNote: { ...typeScale.caption, paddingVertical: 12, lineHeight: 18 },
});
