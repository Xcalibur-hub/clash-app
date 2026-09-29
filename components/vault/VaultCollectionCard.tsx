import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { ink, radius, space, typeScale } from '../../theme';
import { GlassCard } from '../shared/GlassCard';
import { Chip } from '../shared/Chip';
import { LockIcon, VaultIcon } from '../shared/icons';

export interface VaultCollectionCardProps {
  title: string;
  description: string;
  drops: readonly StorefrontDrop[];
}

/**
 * A permanent Collection with its contents. Expired drops stay here on purpose —
 * a Collection outlives the 7-day feed — so an archived Drop renders with its
 * badge rather than disappearing.
 */
export function VaultCollectionCard({ title, description, drops }: VaultCollectionCardProps): React.JSX.Element {
  return (
    <GlassCard corner={radius.lg} contentStyle={styles.card} accessibilityLabel={`Collection: ${title}`}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text allowFontScaling={false} style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text allowFontScaling={false} style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
        <Chip label={`${drops.length}`} icon={VaultIcon} tone="neutral" data />
      </View>

      {drops.length > 0 ? (
        <View style={styles.items}>
          {drops.map((drop) => {
            const locked = drop.accessLevel === 'subscriber' && !drop.accessible;
            return (
              <View key={drop.id} style={styles.item}>
                {locked ? <LockIcon size={13} color={ink.tertiary} strokeWidth={2.4} /> : null}
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[styles.itemText, locked && styles.itemLocked]}
                >
                  {drop.caption}
                </Text>
                {drop.status === 'expired' ? <Chip label="ARCHIVED" tone="neutral" /> : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text allowFontScaling={false} style={styles.empty}>Nothing saved yet.</Text>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  headText: { flex: 1, gap: 2 },
  title: { ...typeScale.cardTitle, color: ink.primary },
  description: { ...typeScale.meta, color: ink.tertiary },
  items: { gap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  itemText: { ...typeScale.meta, color: ink.secondary, flex: 1 },
  itemLocked: { color: ink.tertiary },
  empty: { ...typeScale.meta, color: ink.quaternary },
});
