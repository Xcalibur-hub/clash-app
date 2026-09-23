import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { HOOD_LABEL } from '../../data/hoods';
import { ink, space, typeScale } from '../../theme';
import { compact, timeLeftLabel } from '../../utils/format';
import { Chip } from '../shared/Chip';
import { GlassCard } from '../shared/GlassCard';
import { ChevronIcon, ClockIcon, FlameIcon, HashIcon } from '../shared/icons';

export interface TakeMiniCardProps {
  take: Take;
  now: number;
  onPress: () => void;
}

/** A viewer's own take in the Profile feed. */
export function TakeMiniCard({ take, now, onPress }: TakeMiniCardProps): React.JSX.Element {
  return (
    <GlassCard
      level="soft"
      corner={20}
      onPress={onPress}
      contentStyle={styles.content}
      accessibilityLabel={`Your take: ${take.text}`}
      accessibilityHint="Opens the clash on this take"
    >
      <View style={styles.chips}>
        <Chip label={HOOD_LABEL[take.hood].toUpperCase()} icon={HashIcon} tone="violet" />
        <Chip label={timeLeftLabel(take.expiresAt, now).toUpperCase()} icon={ClockIcon} tone="neutral" data />
      </View>
      <Text allowFontScaling={false} style={styles.text} numberOfLines={2}>
        {take.text}
      </Text>
      <View style={styles.footer}>
        <View style={styles.stat}>
          <FlameIcon size={13} color={ink.tertiary} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={styles.statText}>
            {`${compact(take.clashes)} CLASHES · ${compact(take.reactions)} REACTIONS`}
          </Text>
        </View>
        <ChevronIcon size={16} color={ink.quaternary} strokeWidth={2.4} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, padding: space.lg },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  text: { ...typeScale.cardTitle, color: ink.primary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  statText: { ...typeScale.data, fontSize: 11, color: ink.tertiary },
});
