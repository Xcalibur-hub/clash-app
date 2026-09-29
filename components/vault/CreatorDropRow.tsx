import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { ink, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { GlassCard } from '../shared/GlassCard';
import { Chip, type ChipTone } from '../shared/Chip';
import { LockIcon } from '../shared/icons';

export interface CreatorDropRowProps {
  drop: StorefrontDrop;
  onOpen: () => void;
  onPublish?: () => void;
  onRemove?: () => void;
}

const STATUS_TONE: Record<StorefrontDrop['status'], ChipTone> = {
  draft: 'neutral',
  published: 'mint',
  expired: 'gold',
  removed: 'danger',
};

/**
 * A Drop in the creator's management list: its status, access level, caption and
 * lifetime, plus publish/remove actions. Drafts are the only thing publishable;
 * removal is a tombstone and the backend stays authoritative throughout.
 */
export function CreatorDropRow({ drop, onOpen, onPublish, onRemove }: CreatorDropRowProps): React.JSX.Element {
  const isSubscriber = drop.accessLevel === 'subscriber';
  return (
    <GlassCard corner={radius.lg} onPress={onOpen} contentStyle={styles.card} accessibilityLabel={`${drop.status} drop: ${drop.caption}`}>
      <View style={styles.metaRow}>
        <Chip label={drop.status.toUpperCase()} tone={STATUS_TONE[drop.status]} />
        <Chip label={isSubscriber ? 'SUBSCRIBER' : 'FREE'} icon={isSubscriber ? LockIcon : undefined} tone={isSubscriber ? 'violet' : 'neutral'} />
        {drop.status === 'published' && drop.expiresAt ? (
          <Chip label={timeLeftLabel(drop.expiresAt)} tone="neutral" data />
        ) : null}
      </View>

      <Text allowFontScaling={false} style={styles.caption} numberOfLines={2}>
        {drop.caption}
      </Text>

      <View style={styles.actions}>
        {drop.status === 'draft' && onPublish ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onPublish();
            }}
            accessibilityRole="button"
            accessibilityLabel="Publish drop"
            style={[styles.action, styles.publish]}
          >
            <Text allowFontScaling={false} style={styles.publishText}>Publish</Text>
          </Pressable>
        ) : null}
        {onRemove ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onRemove();
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove drop"
            style={[styles.action, styles.remove]}
          >
            <Text allowFontScaling={false} style={styles.removeText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  caption: { ...typeScale.takeText, color: ink.primary },
  actions: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  action: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  publish: { backgroundColor: 'rgba(63,191,143,0.12)', borderColor: 'rgba(63,191,143,0.4)' },
  publishText: { ...typeScale.label, color: '#7BE3B8' },
  remove: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,77,94,0.35)' },
  removeText: { ...typeScale.label, color: '#F18A92' },
});
