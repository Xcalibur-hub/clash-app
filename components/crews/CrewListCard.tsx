import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ArenaCrew } from '../../services/arenaCrewService';
import { crewCrestInitials, crewJoinModeLabel, formatCrewMembers } from '../../utils/arenaCrewIdentity';
import { radius, space, typeScale, useThemeColors } from '../../theme';

export interface CrewListCardProps {
  crew: ArenaCrew;
  onPress: () => void;
}

/** Compact discovery/membership row — server fields only, no invented metrics. */
export function CrewListCard({ crew, onPress }: CrewListCardProps): React.JSX.Element {
  const t = useThemeColors();
  const status = crew.viewer.isMember
    ? 'Your Crew'
    : crew.viewer.isFollowing
      ? 'Following'
      : crewJoinModeLabel(crew.joinMode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${crew.name}, ${formatCrewMembers(crew.memberCount)}`}
      onPress={onPress}
      style={[styles.card, { borderColor: t.border, backgroundColor: t.surface }]}
    >
      <View style={[styles.crest, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
        <Text style={[styles.crestText, { color: t.textPrimary }]}>{crewCrestInitials(crew.name)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
          {crew.name}
        </Text>
        <Text style={[styles.meta, { color: t.textSecondary }]} numberOfLines={1}>
          @{crew.slug} · {formatCrewMembers(crew.memberCount)} · {status}
        </Text>
        {crew.bio.trim() ? (
          <Text style={[styles.bio, { color: t.textMuted }]} numberOfLines={2}>
            {crew.bio.trim()}
          </Text>
        ) : null}
        {crew.specialties.length ? (
          <Text style={[styles.bio, { color: t.textMuted }]} numberOfLines={1}>
            {crew.specialties.join(' · ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.sm,
  },
  crest: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestText: { ...typeScale.label, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  name: { ...typeScale.body, fontWeight: '700' },
  meta: { ...typeScale.caption },
  bio: { ...typeScale.caption, marginTop: 2 },
});
