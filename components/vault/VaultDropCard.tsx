import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { PlayIcon } from '../shared/icons';

export interface VaultDropCardProps {
  drop: StorefrontDrop;
  onOpen: () => void;
  /** A locked subscriber Drop shows a subscribe affordance. */
  onSubscribe?: () => void;
}

/**
 * Storefront Drop — media-first when public; elegant locked surface when not entitled.
 * Never fetches or renders private media. Entitlement stays `drop.accessible`.
 */
export function VaultDropCard({ drop, onOpen, onSubscribe }: VaultDropCardProps): React.JSX.Element {
  const t = useThemeColors();
  const isSubscriber = drop.accessLevel === 'subscriber';
  const locked = isSubscriber && !drop.accessible;
  const archived = drop.status === 'expired';
  const isVideo = drop.publicMedia?.kind === 'video';

  const mediaUrl =
    !isSubscriber && drop.publicMedia
      ? getPublicMediaUrl(drop.publicMedia.bucket, drop.publicMedia.path)
      : null;

  const open = (): void => {
    hapticTap();
    onOpen();
  };

  const expiry =
    drop.expiresAt && drop.status === 'published' ? timeLeftLabel(drop.expiresAt) : null;

  return (
    <PressableScale
      onPress={open}
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
        },
      ]}
      accessibilityLabel={`${isSubscriber ? 'Subscriber drop' : 'Drop'}: ${drop.caption}`}
      accessibilityHint={locked ? 'Subscription required' : 'Opens this drop'}
    >
      {mediaUrl ? (
        <View style={[styles.media, { backgroundColor: t.surfaceMuted }]}>
          <Image source={{ uri: mediaUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          {isVideo ? (
            <View style={styles.playBadge}>
              <PlayIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
            </View>
          ) : null}
          {!isSubscriber ? (
            <View style={[styles.freeTag, { backgroundColor: 'rgba(9,9,11,0.55)' }]}>
              <Text allowFontScaling={false} style={styles.freeTagText}>
                Free
              </Text>
            </View>
          ) : null}
        </View>
      ) : locked ? (
        <View style={[styles.lockedMedia, { backgroundColor: t.surfaceMuted }]}>
          <Text allowFontScaling={false} style={[styles.lockedKicker, { color: t.textMuted }]}>
            SUBSCRIBERS
          </Text>
          <Text allowFontScaling={false} style={[styles.lockedHint, { color: t.textSecondary }]}>
            Unlock with this Vault
          </Text>
        </View>
      ) : isSubscriber ? (
        <View style={[styles.lockedMedia, { backgroundColor: t.surfaceMuted }]}>
          <PlayIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
          <Text allowFontScaling={false} style={[styles.membersHint, { color: t.textMuted }]}>
            Members
          </Text>
        </View>
      ) : (
        <View style={[styles.textDrop, { backgroundColor: t.surfaceMuted }]}>
          <Text allowFontScaling={false} style={[styles.textDropMark, { color: t.textMuted }]}>
            DROP
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <Text allowFontScaling={false} style={[styles.caption, { color: t.textPrimary }]} numberOfLines={3}>
          {drop.caption}
        </Text>

        <View style={styles.metaRow}>
          {isSubscriber && !locked ? (
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              Subscriber
            </Text>
          ) : null}
          {archived ? (
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              Archived
            </Text>
          ) : null}
          {expiry && !locked ? (
            <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
              {expiry}
            </Text>
          ) : null}
        </View>

        {locked ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onSubscribe?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Subscription options"
            style={[
              styles.subscribe,
              {
                backgroundColor: t.scheme === 'light' ? t.textPrimary : t.surfaceElevated,
                borderColor: t.border,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.subscribeText,
                { color: t.scheme === 'light' ? t.textInverse : t.textPrimary },
              ]}
            >
              Subscriber Drop
            </Text>
          </Pressable>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  media: {
    aspectRatio: 4 / 5,
    width: '100%',
  },
  playBadge: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  freeTag: {
    position: 'absolute',
    left: space.sm,
    top: space.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  freeTagText: {
    ...typeScale.caption,
    color: '#FAFAF8',
    fontSize: 10,
  },
  lockedMedia: {
    aspectRatio: 16 / 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
  },
  lockedKicker: {
    ...typeScale.caption,
    letterSpacing: 0.8,
  },
  lockedHint: {
    ...typeScale.meta,
    textAlign: 'center',
  },
  membersHint: {
    ...typeScale.caption,
    letterSpacing: 0.4,
  },
  textDrop: {
    aspectRatio: 16 / 9,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textDropMark: {
    ...typeScale.caption,
    letterSpacing: 1,
  },
  body: {
    gap: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  caption: {
    ...typeScale.takeText,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  meta: {
    ...typeScale.meta,
  },
  subscribe: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  subscribeText: {
    ...typeScale.label,
    fontWeight: '600',
  },
});
