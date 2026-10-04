import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import {
  isVaultDropFeedExpired,
  vaultDropAccessBadge,
  vaultDropDisplayAccess,
  vaultExpiryLabel,
  vaultPublicVisualMedia,
} from '../../utils/vaultAccess';
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
  const badge = vaultDropAccessBadge(display);
  const expiry =
    drop.expiresAt && drop.status === 'published' && !locked
      ? vaultExpiryLabel(drop.expiresAt)
      : drop.expiresAt && drop.status === 'published' && locked
        ? vaultExpiryLabel(drop.expiresAt)
        : null;

  const open = (): void => {
    hapticTap();
    onOpen();
  };

  return (
    <PressableScale
      onPress={open}
      style={[
        styles.card,
        cinematic && styles.cinematic,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
        },
      ]}
      accessibilityLabel={`${badge}: ${drop.caption}`}
      accessibilityHint={locked ? 'Subscription required to unlock full Drop' : 'Opens this drop'}
    >
      {mediaUrl ? (
        <View style={[styles.media, cinematic && styles.mediaCinema, { backgroundColor: t.surfaceMuted }]}>
          <Image source={{ uri: mediaUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          {cinematic ? <View style={styles.scrim} /> : null}
          {isVideo ? (
            <View style={styles.playBadge}>
              <PlayIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
            </View>
          ) : null}
          {cinematic ? (
            <View style={styles.cinemaCopy}>
              {creatorHandle ? (
                <Text allowFontScaling={false} style={styles.cinemaHandle} numberOfLines={1}>
                  @{creatorHandle}
                </Text>
              ) : null}
              <Text allowFontScaling={false} style={styles.cinemaCaption} numberOfLines={2}>
                {drop.caption}
              </Text>
              <View style={styles.cinemaMeta}>
                <Text allowFontScaling={false} style={styles.cinemaBadge}>
                  {badge}
                </Text>
                {expiry ? (
                  <Text allowFontScaling={false} style={styles.cinemaBadge}>
                    {expiry}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={[styles.freeTag, { backgroundColor: 'rgba(9,9,11,0.55)' }]}>
              <Text allowFontScaling={false} style={styles.freeTagText}>
                {badge}
              </Text>
            </View>
          )}
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
      ) : drop.accessLevel === 'subscriber' ? (
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

      {!cinematic ? (
        <View style={styles.body}>
          <Text allowFontScaling={false} style={[styles.caption, { color: t.textPrimary }]} numberOfLines={3}>
            {drop.caption}
          </Text>

          <View style={styles.metaRow}>
            {display === 'SUBSCRIBER' ? (
              <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
                Subscriber
              </Text>
            ) : null}
            {archived ? (
              <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
                Archived
              </Text>
            ) : null}
            {expiry ? (
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
              accessibilityLabel="Unlock"
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
                Unlock
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : locked ? (
        <View style={styles.unlockBar}>
          <Pressable
            onPress={() => {
              hapticTap();
              onSubscribe?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Unlock"
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
              Unlock
            </Text>
          </Pressable>
        </View>
      ) : null}
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
  cinematic: { borderRadius: 28 },
  media: {
    aspectRatio: 4 / 5,
    width: '100%',
  },
  mediaCinema: {
    aspectRatio: 4 / 5,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.28)',
  },
  cinemaCopy: {
    gap: 6,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.xxl,
  },
  cinemaHandle: { ...typeScale.meta, color: 'rgba(250,250,248,0.82)' },
  cinemaCaption: { ...typeScale.title, color: '#FAFAF8' },
  cinemaMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 4 },
  cinemaBadge: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.8)',
    letterSpacing: 0.6,
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
  unlockBar: {
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
