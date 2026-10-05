import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CreatorLiveSession } from '../../../services/creatorLiveMappers';
import type { LiveInteractionState } from '../../../utils/creatorLiveEvents';
import {
  interactionTypeLabel,
  liveActionLabel,
  liveStatusLabel,
  thresholdProgress,
} from '../../../utils/creatorLiveState';
import { space, typeScale, useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';
import {
  LiveInteractionFormSheet,
  type LiveInteractionDraft,
} from './LiveInteractionFormSheet';

export interface LiveControlPanelProps {
  session: CreatorLiveSession;
  interactions: readonly LiveInteractionState[];
  busy: boolean;
  onStart: () => void;
  onEnd: () => void;
  onOpenInteraction: (draft: LiveInteractionDraft) => void;
  onCloseInteraction: (interactionId: string) => void;
}

/**
 * The creator's own controls. Deliberately small: start, end, open one
 * interaction, close one interaction. This is not a broadcast studio.
 */
export function LiveControlPanel({
  session,
  interactions,
  busy,
  onStart,
  onEnd,
  onOpenInteraction,
  onCloseInteraction,
}: LiveControlPanelProps): React.JSX.Element {
  const t = useThemeColors();
  const [formOpen, setFormOpen] = React.useState(false);
  const isLive = session.status === 'LIVE';
  const open = interactions.filter((item) => item.status === 'OPEN');
  const fired = interactions.filter((item) => item.status === 'TRIGGERED');

  return (
    <View style={[styles.wrap, { borderColor: t.border, backgroundColor: t.surfaceElevated }]}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        {`YOUR SESSION · ${liveStatusLabel(session.status)}`}
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {session.title}
      </Text>

      <View style={styles.row}>
        {session.status === 'SCHEDULED' ? (
          <VaultActionButton label={busy ? 'Starting…' : 'START LIVE'} onPress={onStart} />
        ) : null}
        {isLive ? (
          <>
            <VaultActionButton label="Open an interaction" onPress={() => setFormOpen(true)} />
            <VaultActionButton label={busy ? 'Ending…' : 'END LIVE'} tone="quiet" onPress={onEnd} />
          </>
        ) : null}
      </View>

      {fired.length > 0 ? (
        <View style={styles.fired}>
          {fired.slice(0, 3).map((item) => (
            <Text key={item.id} allowFontScaling={false} style={[styles.firedLine, { color: t.textPrimary }]}>
              {`${item.actionKind ? liveActionLabel(item.actionKind) : 'Action'} — triggered by the crowd (${item.totalVotes}/${item.threshold ?? 0})`}
            </Text>
          ))}
          <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
            {`Verifying the adapter: the server emitted ${
              fired[0]?.actionKind ?? 'an approved action'
            } and nothing else.`}
          </Text>
        </View>
      ) : null}

      {open.length > 0 ? (
        <View style={styles.list}>
          {open.map((item) => (
            <View key={item.id} style={[styles.item, { borderColor: t.border }]}>
              <Text allowFontScaling={false} style={[styles.itemTitle, { color: t.textPrimary }]} numberOfLines={1}>
                {`${interactionTypeLabel(item.type)} · ${item.prompt}`}
              </Text>
              <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
                {item.threshold != null
                  ? `${item.totalVotes}/${item.threshold} · ${Math.round(
                      thresholdProgress(item.totalVotes, item.threshold) * 100,
                    )}%`
                  : `${item.totalVotes} ${item.totalVotes === 1 ? 'vote' : 'votes'}`}
              </Text>
              <VaultActionButton
                label="Close"
                tone="quiet"
                compact
                onPress={() => onCloseInteraction(item.id)}
              />
            </View>
          ))}
        </View>
      ) : null}

      <LiveInteractionFormSheet
        visible={formOpen}
        busy={busy}
        permissions={session.permissions}
        onClose={() => setFormOpen(false)}
        onSubmit={(draft) => {
          setFormOpen(false);
          onOpenInteraction(draft);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, padding: space.lg, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { ...typeScale.section, fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fired: { gap: 2 },
  firedLine: { ...typeScale.body, fontSize: 14, fontWeight: '700' },
  note: { ...typeScale.meta },
  list: { gap: space.sm, marginTop: space.xs },
  item: {
    gap: 4,
    padding: space.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemTitle: { ...typeScale.body, fontWeight: '700' },
});
