import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { WorldDrop, WorldMission } from '../../services/worldService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { WorldDropCard } from './WorldDropCard';
import { WorldMissionCard } from './WorldMissionCard';
import { ReadFeedback } from '../shared/ReadFeedback';
import type { ReadStatus } from '../../hooks/useRetryableRead';

export interface WorldMapUnavailableProps {
  missions: WorldMission[];
  drops: WorldDrop[];
  missionStatus: ReadStatus;
  dropStatus: ReadStatus;
  onRetryMissions: () => void;
  onRetryDrops: () => void;
  now: number;
  onOpenDrop: (drop: WorldDrop) => void;
  onParticipate: () => void;
}

/**
 * Non-crashing World entry when the installed Android binary cannot host Google Maps.
 * Preserves mission/drop discovery contracts without pretending the street map works.
 */
export function WorldMapUnavailable({
  missions,
  drops,
  missionStatus,
  dropStatus,
  onRetryMissions,
  onRetryDrops,
  now,
  onOpenDrop,
  onParticipate,
}: WorldMapUnavailableProps): React.JSX.Element {
  const t = useThemeColors();
  const primary = missions[0] ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      accessibilityLabel="World missions and drops without street map"
    >
      <View
        style={[styles.banner, { backgroundColor: t.surface, borderColor: t.border }]}
        accessibilityRole="summary"
      >
        <Text style={[styles.bannerTitle, { color: t.textPrimary }]}>
          Street map unavailable in this build
        </Text>
        <Text style={[styles.bannerBody, { color: t.textSecondary }]}>
          The interactive World map needs a Maps-configured Android rebuild. Missions and
          drops below still work. Explore World country map is unchanged.
        </Text>
      </View>

      <ReadFeedback status={missionStatus} subject="World missions" retry={onRetryMissions} />
      {primary ? (
        <WorldMissionCard mission={primary} now={now} onParticipate={onParticipate} />
      ) : missionStatus === 'ready' ? (
        <Text style={[styles.empty, { color: t.textSecondary }]}>No active Mission this week.</Text>
      ) : null}

      <Text style={[styles.section, { color: t.textPrimary }]}>Recent drops</Text>
      <ReadFeedback status={dropStatus} subject="World drops" retry={onRetryDrops} />
      {dropStatus === 'ready' && drops.length === 0 ? (
        <Text style={[styles.empty, { color: t.textSecondary }]}>No recent Drops yet.</Text>
      ) : null}
      {drops.map((drop) => (
        <Pressable
          key={drop.id}
          onPress={() => onOpenDrop(drop)}
          accessibilityRole="button"
          accessibilityLabel={`Open World Drop by ${drop.author ? `@${drop.author.handle}` : 'someone'}`}
          style={styles.dropPress}
        >
          <WorldDropCard drop={drop} now={now} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  banner: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.xs,
  },
  bannerTitle: { ...typeScale.label, fontWeight: '600' },
  bannerBody: { ...typeScale.meta },
  section: { ...typeScale.section, marginTop: space.xs },
  empty: { ...typeScale.meta },
  dropPress: { borderRadius: radius.card },
});
