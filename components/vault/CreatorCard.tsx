import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import { Chip } from '../shared/Chip';
import { GlassCard } from '../shared/GlassCard';
import { CreatorMeta } from './VaultHeader';
import { VerifiedIcon } from '../shared/icons';
import { accent, ink, radius, space, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import type { Creator } from '../../store/types';

export interface CreatorCardProps {
  creator: Creator;
  publicCount: number;
  exclusiveCount: number;
  rating?: number;
  onOpen: () => void;
}

export function CreatorCard({ creator, publicCount, exclusiveCount, rating = 4.8, onOpen }: CreatorCardProps): React.JSX.Element {
  return (
    <GlassCard
      onPress={() => {
        hapticPress();
        onOpen();
      }}
      corner={radius.xl}
      accessibilityLabel={`Open ${creator.handle}`}
    >
      <View style={styles.row}>
        <Avatar name={creator.name} tint={creator.tint} size={52} />
        <View style={styles.main}>
          <View style={styles.nameRow}>
            <Text allowFontScaling={false} style={styles.handle}>
              @{creator.handle}
            </Text>
            <VerifiedIcon size={14} color={accent.mint} strokeWidth={2.6} />
          </View>
          <Text allowFontScaling={false} style={styles.tagline} numberOfLines={1}>
            {creator.tagline}
          </Text>
          <CreatorMeta creator={creator} rating={rating} />
          <Text allowFontScaling={false} style={styles.drops}>
            {publicCount} public · {exclusiveCount} exclusive
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  main: { flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  handle: { ...typeScale.cardTitle, color: ink.primary },
  tagline: { ...typeScale.body, color: ink.secondary, fontSize: 13.5 },
  drops: { ...typeScale.meta, color: ink.tertiary },
});

