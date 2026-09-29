import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { card, ink, radius, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { GlassCard } from '../shared/GlassCard';
import { Chip } from '../shared/Chip';
import { ClockIcon, LockIcon, PlayIcon, VaultIcon } from '../shared/icons';

export interface VaultDropCardProps {
  drop: StorefrontDrop;
  onOpen: () => void;
  /** A locked subscriber Drop shows a subscribe affordance. */
  onSubscribe?: () => void;
}

/**
 * One Drop on the storefront. Three shapes:
 *   · a free Drop shows its public media directly;
 *   · an accessible subscriber Drop shows a members-only card (its private media
 *     loads on demand in the reader, never here);
 *   · a locked subscriber Drop shows a lock + caption and a subscribe CTA, with no
 *     media and no URL of any kind.
 * An archived (expired-but-collected) Drop carries an explicit badge.
 */
export function VaultDropCard({ drop, onOpen, onSubscribe }: VaultDropCardProps): React.JSX.Element {
  const isSubscriber = drop.accessLevel === 'subscriber';
  const locked = isSubscriber && !drop.accessible;
  const archived = drop.status === 'expired';

  const mediaUrl =
    !isSubscriber && drop.publicMedia
      ? getPublicMediaUrl(drop.publicMedia.bucket, drop.publicMedia.path)
      : null;

  const open = (): void => {
    hapticTap();
    onOpen();
  };

  return (
    <GlassCard
      corner={radius.lg}
      onPress={open}
      contentStyle={styles.card}
      accessibilityLabel={`${isSubscriber ? 'Subscriber drop' : 'Drop'}: ${drop.caption}`}
      accessibilityHint={locked ? 'Subscription required' : 'Opens this drop'}
    >
      {mediaUrl ? (
        <View style={styles.media} accessible accessibilityRole="image" accessibilityLabel={drop.caption}>
          <Image source={{ uri: mediaUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.metaRow}>
          {isSubscriber ? (
            <Chip
              label={locked ? 'SUBSCRIBER DROP' : 'MEMBERS'}
              icon={locked ? LockIcon : VaultIcon}
              tone={locked ? 'violet' : 'mint'}
            />
          ) : null}
          {archived ? <Chip label="ARCHIVED" tone="neutral" /> : null}
          {!isSubscriber && drop.expiresAt ? (
            <Chip label={timeLeftLabel(drop.expiresAt)} icon={ClockIcon} tone="neutral" data />
          ) : null}
        </View>

        <Text allowFontScaling={false} style={styles.caption} numberOfLines={3}>
          {drop.caption}
        </Text>

        {locked ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onSubscribe?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Subscription options"
            style={styles.subscribe}
          >
            <Text allowFontScaling={false} style={styles.subscribeText}>Subscribe to unlock</Text>
          </Pressable>
        ) : null}

        {isSubscriber && !locked ? (
          <View style={styles.openHint}>
            <PlayIcon size={13} color={ink.tertiary} strokeWidth={2.4} />
            <Text allowFontScaling={false} style={styles.openHintText}>Tap to watch</Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0 },
  media: { aspectRatio: 16 / 9, width: '100%', backgroundColor: card.elevated },
  body: { padding: space.md, gap: space.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  caption: { ...typeScale.takeText, color: ink.primary },
  subscribe: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(165,128,255,0.4)',
    backgroundColor: 'rgba(165,128,255,0.12)',
  },
  subscribeText: { ...typeScale.label, color: '#C4B5FD' },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  openHintText: { ...typeScale.meta, color: ink.tertiary },
});
