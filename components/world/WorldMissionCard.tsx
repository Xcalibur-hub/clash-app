import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorldMission } from '../../services/worldService';
import { card, ink, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { GlowButton } from '../shared/GlowButton';

export interface WorldMissionCardProps {
  mission: WorldMission;
  now?: number;
  onParticipate?: () => void;
}

/** This Week mission card — prompt + time remaining + Participate. */
export function WorldMissionCard({
  mission,
  now = Date.now(),
  onParticipate,
}: WorldMissionCardProps): React.JSX.Element {
  return (
    <View style={styles.card} accessibilityLabel={`Mission. ${mission.title}`}>
      <Text allowFontScaling={false} style={styles.eyebrow}>THIS WEEK</Text>
      <Text allowFontScaling={false} style={styles.title}>{mission.title}</Text>
      <Text allowFontScaling={false} style={styles.prompt}>{mission.prompt}</Text>
      <Text allowFontScaling={false} style={styles.meta}>
        {timeLeftLabel(mission.endsAt, now).replace(' left', '')} remaining
      </Text>
      {onParticipate ? (
        <GlowButton
          label="Participate"
          tone="light"
          compact
          onPress={onParticipate}
          style={styles.cta}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  eyebrow: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 0.6 },
  title: { ...typeScale.cardTitle, color: ink.primary },
  prompt: { ...typeScale.body, color: ink.secondary },
  meta: { ...typeScale.meta, color: ink.tertiary },
  cta: { alignSelf: 'flex-start', marginTop: space.xs },
});
