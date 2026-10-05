import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  createCreatorLiveSession,
  endCreatorLiveSession,
  fetchMyCreatorLiveSessions,
  startCreatorLiveSession,
} from '../../services/creatorLiveService';
import type { CreatorLiveSession } from '../../services/creatorLiveMappers';
import { liveStatusLabel } from '../../utils/creatorLiveState';
import { errorText } from '../../services/supabaseClient';
import { showNotice, useClash } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { WorldIcon } from '../shared/icons';
import { VaultActionButton } from './VaultActionButton';
import { LiveSessionFormSheet } from './live/LiveSessionFormSheet';

type Phase = 'loading' | 'ready';

function permissionSummary(session: CreatorLiveSession): string {
  const allowed: string[] = [];
  if (session.permissions.polls) allowed.push('Polls');
  if (session.permissions.choices) allowed.push('Choices');
  if (session.permissions.crowdActions) allowed.push('Crowd');
  if (session.permissions.gameActions) allowed.push('Game');
  return allowed.length > 0 ? allowed.join(' · ') : 'Watch only';
}

/** Creator Studio → Live: a short list, one composer, honest controls. */
export function LiveStudio(): React.JSX.Element {
  const { dispatch } = useClash();
  const router = useRouter();
  const t = useThemeColors();

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [sessions, setSessions] = React.useState<CreatorLiveSession[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      setSessions(await fetchMyCreatorLiveSessions());
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setPhase('ready');
    }
  }, [dispatch]);

  React.useEffect(() => {
    setPhase('loading');
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, notice?: string): Promise<void> => {
    setBusy(true);
    try {
      await work();
      if (notice) dispatch(showNotice(notice));
      await load();
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.textMuted} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textMuted }]}>
        LIVE
      </Text>
      <Text allowFontScaling={false} style={[styles.blurb, { color: t.textSecondary }]}>
        Go live, then open polls, choices and crowd actions. Viewers can only affect what you
        allow — the server counts every vote.
      </Text>
      <VaultActionButton label="Go live" onPress={() => setFormOpen(true)} />

      {sessions.length === 0 ? (
        <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
          No sessions yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {sessions.map((session) => (
            <View
              key={session.id}
              style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
            >
              <View style={styles.rowHead}>
                <WorldIcon size={15} color={t.textSecondary} strokeWidth={2.2} />
                <Text
                  allowFontScaling={false}
                  style={[styles.rowTitle, { color: t.textPrimary }]}
                  numberOfLines={1}
                >
                  {session.title}
                </Text>
              </View>
              <Text
                allowFontScaling={false}
                style={[styles.rowMeta, { color: t.textMuted }]}
                numberOfLines={1}
              >
                {[
                  liveStatusLabel(session.status),
                  session.access === 'SUBSCRIBER' ? 'Members' : 'Everyone',
                  permissionSummary(session),
                  session.status === 'LIVE' ? `${session.watching} watching` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <View style={styles.rowActions}>
                {session.status === 'SCHEDULED' ? (
                  <VaultActionButton
                    label="Start live"
                    compact
                    onPress={() =>
                      void run(() => startCreatorLiveSession(session.id), 'You are live.')
                    }
                  />
                ) : null}
                <VaultActionButton
                  label="Open room"
                  tone="quiet"
                  compact
                  onPress={() => router.push(`/vault/live/${session.id}`)}
                />
                {session.status === 'LIVE' ? (
                  <VaultActionButton
                    label="End live"
                    tone="quiet"
                    compact
                    onPress={() => void run(() => endCreatorLiveSession(session.id), 'Session ended.')}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <LiveSessionFormSheet
        visible={formOpen}
        busy={busy}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => {
          setFormOpen(false);
          void run(async () => {
            const id = await createCreatorLiveSession(input);
            router.push(`/vault/live/${id}`);
          }, 'Session created.');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  center: { paddingVertical: space.xl, alignItems: 'center' },
  section: { ...typeScale.caption, letterSpacing: 0.8 },
  blurb: { ...typeScale.meta, fontSize: 13, lineHeight: 18 },
  empty: { ...typeScale.meta, marginTop: space.sm },
  list: { gap: space.sm, marginTop: space.sm },
  row: {
    gap: space.sm,
    padding: space.md,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowTitle: { ...typeScale.cardTitle, flex: 1 },
  rowMeta: { ...typeScale.meta },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

