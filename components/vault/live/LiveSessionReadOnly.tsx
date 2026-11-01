import React from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../store/AuthProvider';
import { useRetryableRead } from '../../../hooks/useRetryableRead';
import { fetchCreatorLiveReadSnapshot } from '../../../services/creatorLiveService';
import { liveStatusLabel, liveResultLabel } from '../../../utils/creatorLiveState';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { ReadFeedback } from '../../shared/ReadFeedback';

/** Snapshot inspection, not viewer admission, playback or a connected-room claim. */
export function LiveSessionReadOnly({ sessionId }: { sessionId: string | undefined }): React.JSX.Element {
  const t = useThemeColors(), insets = useSafeAreaInsets(), router = useRouter();
  const { user, session: authSession, loading: authLoading } = useAuth();
  const [focused, setFocused] = React.useState(false);
  const account = user?.id ?? null;
  const cancel = React.useRef<(() => void) | null>(null);
  const load = React.useCallback(() => {
    cancel.current?.();
    if (!sessionId) return Promise.resolve(null);
    return new Promise<Awaited<ReturnType<typeof fetchCreatorLiveReadSnapshot>>>((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); reject(new Error('Live read timed out. Refresh to try again.')); }, 10_000);
      const stop = () => { clearTimeout(timer); controller.abort(); reject(new Error('Live read cancelled.')); };
      cancel.current = stop;
      void fetchCreatorLiveReadSnapshot(sessionId, account, controller.signal).then(resolve, reject).finally(() => {
        clearTimeout(timer); if (cancel.current === stop) cancel.current = null;
      });
    });
  }, [sessionId, account, user, authSession]);
  const read = useRetryableRead(load, focused && !authLoading && sessionId ? `${account ?? 'guest'}:${sessionId}` : null);
  React.useEffect(() => () => cancel.current?.(), [load, focused, authLoading]);
  useFocusEffect(React.useCallback(() => {
    read.retry();
    setFocused(true);
    return () => setFocused(false);
  }, [read.retry]));
  React.useEffect(() => {
    if (!focused) return;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') read.retry();
    });
    return () => listener.remove();
  }, [focused, read.retry]);
  const button = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label}
    onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: 1, borderColor: t.border, borderRadius: 12 }}>
    <Text style={[typeScale.label, { color: t.textPrimary }]}>{label}</Text>
  </Pressable>;
  const data = read.data;
  return <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentContainerStyle={{
    paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl, paddingHorizontal: layout.screenX, gap: space.md,
  }}>
    {button('Back', () => router.canGoBack() ? router.back() : router.replace('/'))}
    <Text accessibilityRole="header" style={[typeScale.title, { color: t.textPrimary }]}>Live session</Text>
    <Text style={[typeScale.body, { color: t.textSecondary }]}>Read-only snapshot. Joining and participation are not available from this view. Refresh to check for changes.</Text>
    <ReadFeedback status={!focused || authLoading ? 'loading' : read.status} subject="Live session" retry={read.retry} />
    {data ? <>
      <Text accessibilityRole="header" style={[typeScale.section, { color: t.textPrimary }]}>{data.session.title}</Text>
      <Text style={[typeScale.body, { color: t.textSecondary }]}>{data.session.creatorName ?? 'Creator'} · {liveStatusLabel(data.session.status)}</Text>
      {data.session.description ? <Text style={[typeScale.body, { color: t.textSecondary }]}>{data.session.description}</Text> : null}
      {button('Refresh Live session', read.retry)}
      <Text style={[typeScale.body, { color: t.textMuted }]}>{data.source === 'snapshot'
        ? 'Server snapshot read. Shared-event delivery is not verified.'
        : 'Legacy get/list reads. The proposed snapshot is unavailable; these reads are not atomic.'}</Text>
      {data.interactions.length === 0 ? <Text style={[typeScale.body, { color: t.textMuted }]}>No interactions in this snapshot.</Text> : null}
      {data.interactions.map(item => <View key={item.id} style={{ padding: space.md, gap: space.sm, borderWidth: 1, borderColor: t.border, borderRadius: 12 }}>
        <Text style={[typeScale.section, { color: t.textPrimary }]}>{item.prompt}</Text>
        <Text style={[typeScale.body, { color: t.textSecondary }]}>{item.status} · {item.totalVotes} recorded votes</Text>
        {(item.options ?? []).map(option => <Text key={option.id} style={[typeScale.body, { color: t.textSecondary }]}>{option.label}: {item.tallies[option.id] ?? 0}</Text>)}
        {item.result ? <Text style={[typeScale.body, { color: t.textSecondary }]}>
          {liveResultLabel(item.result, item.totalVotes, item.options ?? [])}
        </Text> : item.status !== 'OPEN' ? <Text style={[typeScale.body, { color: t.textMuted }]}>No result is available in this snapshot.</Text> : null}
      </View>)}
    </> : null}
  </ScrollView>;
}
