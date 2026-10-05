import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CreatorLiveSession } from '../../../services/creatorLiveMappers';
import { liveCoverUrl } from '../../../services/creatorLiveService';
import { liveStatusLabel, scheduledLine } from '../../../utils/creatorLiveState';
import { personalityRadius, type WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { space, typeScale, useThemeColors } from '../../../theme';
import { VaultActionButton } from '../VaultActionButton';
import { LiveStage } from './LiveStage';

export interface LiveChapterProps {
  sessions: readonly CreatorLiveSession[];
  personality: WorldPersonality;
  isSelf: boolean;
  onOpen: (sessionId: string) => void;
  onManage: () => void;
}

/** LIVE first, then the soonest scheduled session. Nothing else qualifies. */
function featuredSession(sessions: readonly CreatorLiveSession[]): CreatorLiveSession | null {
  const live = sessions.find((session) => session.status === 'LIVE');
  if (live) return live;
  const scheduled = sessions
    .filter((session) => session.status === 'SCHEDULED')
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  return scheduled[0] ?? null;
}

/**
 * The Creator World live chapter: a broadcast plate, not another card. Hides
 * itself entirely when the creator has neither a live nor a scheduled session.
 */
export function LiveChapter({
  sessions,
  personality,
  isSelf,
  onOpen,
  onManage,
}: LiveChapterProps): React.JSX.Element | null {
  const t = useThemeColors();
  const session = featuredSession(sessions);
  if (!session) return null;

  const isLive = session.status === 'LIVE';
  const who = (session.creatorName ?? 'This creator').split(' ')[0].toUpperCase();
  const when = scheduledLine(session.scheduledAt, Date.now());
  const radius = personalityRadius(personality);

  return (
    <View style={[styles.wrap, { borderColor: t.border, borderRadius: radius }]}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: isLive ? '#E5484D' : t.textMuted }]}>
          {liveStatusLabel(session.status)}
        </Text>
        <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
          {isLive ? `${who} IS LIVE` : when ? `NEXT LIVE · ${when}` : 'NEXT LIVE'}
        </Text>
        {session.title ? (
          <Text allowFontScaling={false} style={[styles.subline, { color: t.textSecondary }]}>
            {session.title}
          </Text>
        ) : null}
      </View>

      <LiveStage
        session={session}
        personality={personality}
        watching={session.watching}
        posterUrl={liveCoverUrl(session.coverMedia)}
      />

      <View style={styles.actions}>
        {isLive ? (
          <VaultActionButton
            label={isSelf ? 'Open your live room' : 'ENTER LIVE →'}
            onPress={() => onOpen(session.id)}
          />
        ) : null}
        {isSelf ? (
          <VaultActionButton
            label={isLive ? 'Run the show' : 'Manage in Studio'}
            tone="quiet"
            onPress={isLive ? () => onOpen(session.id) : onManage}
          />
        ) : !isLive ? (
          <VaultActionButton label="See the session" tone="quiet" onPress={() => onOpen(session.id)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  head: { gap: 2 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  headline: { ...typeScale.display, fontSize: 26, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8 },
  subline: { ...typeScale.body, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
