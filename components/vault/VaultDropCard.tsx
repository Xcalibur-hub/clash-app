import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import {
  isVaultDropFeedExpired,
  vaultDropDisplayAccess,
  vaultExpiryLabel,
  vaultPublicVisualMedia,
} from '../../utils/vaultAccess';
import { vaultAccessMeta } from '../../utils/vaultPresentation';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';
import { PlayIcon } from '../shared/icons';

export interface VaultDropCardProps {
  drop: StorefrontDrop;
  onOpen: () => void;
  /** A locked subscriber Drop shows a subscribe affordance. */
  onSubscribe?: () => void;
  creatorHandle?: string;
  cinematic?: boolean;
}

/**
 * Storefront Drop — media-first when public/preview; elegant locked surface when not.
 * Never fetches or renders private media. Entitlement stays `drop.accessible`.
 */
export function VaultDropCard({
  drop,
  onOpen,
  onSubscribe,
  creatorHandle,
  cinematic = false,
}: VaultDropCardProps): React.JSX.Element {
  const t = useThemeColors();
  const feedExpired = isVaultDropFeedExpired(drop.expiresAt) && drop.status === 'published';
  const display = vaultDropDisplayAccess({
    accessLevel: drop.accessLevel,
    accessible: drop.accessible && !feedExpired,
    hasPreviewMedia: Boolean(drop.previewMedia),
  });
  const locked = display === 'PREVIEW' || display === 'SUBSCRIBER_LOCKED';
  const archived = drop.status === 'expired';
  const visual = vaultPublicVisualMedia({
    accessLevel: drop.accessLevel,
    accessible: drop.accessible,
    publicMedia: drop.publicMedia,
    previewMedia: drop.previewMedia,
  });
  const mediaUrl = visual ? getPublicMediaUrl(visual.bucket, visual.path) : null;
  const isVideo = visual?.kind === 'video';
  const badge = vaultAccessMeta(display);
  const expiry =
    drop.expiresAt && drop.status === 'published' ? vaultExpiryLabel(drop.expiresAt) : null;

  const open = (): void => {
    hapticTap();
    onOpen();
  };

  return (
    <PressableScale
      onPress={open}
      style={[styles.wrap, cinematic && { marginHorizontal: -layout.screenX }]}
      accessibilityLabel={`${badge}: ${drop.caption}`}
      accessibilityHint={locked ? 'Subscription required to unlock full Drop' : 'Opens this drop'}
    >
      {mediaUrl ? (
        <View
          style={[
            styles.media,
            cinematic ? styles.mediaCinema : styles.mediaDefault,
            { backgroundColor: t.surfaceMuted },
          ]}
        >
          <Image source={{ uri: mediaUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <View style={styles.scrim} />
          {isVideo ? (
            <View style={styles.playBadge}>
              <PlayIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
            </View>
          ) : null}
          <View style={[styles.cinemaCopy, cinematic && styles.cinemaCopyPad]}>
            {creatorHandle ? (
              <Text allowFontScaling={false} style={styles.cinemaHandle} numberOfLines={1}>
                @{creatorHandle}
              </Text>
            ) : null}
            <Text
              allowFontScaling={false}
              style={[styles.cinemaCaption, !cinematic && styles.cinemaCaptionSmall]}
              numberOfLines={2}
            >
              {drop.caption}
            </Text>
            <Text allowFontScaling={false} style={styles.cinemaBadge}>
              {badge}
              {expiry ? ` · ${expiry}` : ''}
            </Text>
          </View>
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
      ) : (
        <View style={[styles.textDrop, { backgroundColor: t.surfaceMuted }]}>
          <Text allowFontScaling={false} style={[styles.captionBare, { color: t.textPrimary }]} numberOfLines={3}>
            {drop.caption}
          </Text>
        </View>
      )}

      {locked ? (
        <View style={[styles.unlockBar, cinematic && styles.unlockBarPad]}>
          <Pressable
            onPress={() => {
              hapticTap();
              onSubscribe?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Unlock"
            hitSlop={8}
          >
            <Text allowFontScaling={false} style={[styles.unlockText, { color: t.textPrimary }]}>
              Unlock →
            </Text>
          </Pressable>
        </View>
      ) : !cinematic && (archived || expiry) ? (
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {archived ? 'Archived' : expiry}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  media: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  mediaDefault: {
    aspectRatio: 4 / 5,
    borderRadius: 2,
  },
  mediaCinema: {
    aspectRatio: 4 / 5,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.28)',
  },
  cinemaCopy: {
    gap: 4,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.xxl,
  },
  cinemaCopyPad: {
    paddingHorizontal: layout.screenX + 4,
    paddingBottom: space.xl,
  },
  cinemaHandle: { ...typeScale.caption, color: 'rgba(250,250,248,0.72)', letterSpacing: 0.3 },
  cinemaCaption: {
    fontFamily: typeScale.title.fontFamily,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: '#FAFAF8',
  },
  cinemaCaptionSmall: { fontSize: 20, lineHeight: 24 },
  cinemaBadge: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.7)',
    letterSpacing: 0.8,
    fontSize: 10,
    marginTop: 2,
  },
  playBadge: {
    position: 'absolute',
    right: space.sm,
    top: space.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  lockedMedia: {
    aspectRatio: 16 / 10,
    width: '100%',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 4,
    padding: space.lg,
    borderRadius: 2,
  },
  lockedKicker: { ...typeScale.caption, letterSpacing: 1 },
  lockedHint: { ...typeScale.meta },
  textDrop: {
    aspectRatio: 16 / 9,
    width: '100%',
    justifyContent: 'flex-end',
    padding: space.lg,
    borderRadius: 2,
  },
  captionBare: { ...typeScale.takeText },
  unlockBar: { paddingTop: 2 },
  unlockBarPad: { paddingHorizontal: layout.screenX },
  unlockText: { ...typeScale.label, fontWeight: '600' },
  meta: { ...typeScale.caption, letterSpacing: 0.3 },
});
