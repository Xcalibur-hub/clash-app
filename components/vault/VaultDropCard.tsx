import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { space, typeScale, useThemeColors } from '../../theme';
import {
  isVaultDropFeedExpired,
  vaultDropDisplayAccess,
  vaultExpiryLabel,
  vaultPublicVisualMedia,
} from '../../utils/vaultAccess';
import { vaultAccessMeta } from '../../utils/vaultPresentation';
import { tap as hapticTap } from '../../utils/haptics';
import { VaultMediaTile } from './VaultMediaTile';

export interface VaultDropCardProps {
  drop: StorefrontDrop;
  onOpen: () => void;
  onSubscribe?: () => void;
  creatorHandle?: string;
  cinematic?: boolean;
}

/**
 * Storefront Drop — Explore media tile language; never renders private media.
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
  const visual = vaultPublicVisualMedia({
    accessLevel: drop.accessLevel,
    accessible: drop.accessible,
    publicMedia: drop.publicMedia,
    previewMedia: drop.previewMedia,
  });
  const mediaUrl = visual ? getPublicMediaUrl(visual.bucket, visual.path) : null;
  const badge = vaultAccessMeta(display);
  const expiry =
    drop.expiresAt && drop.status === 'published' ? vaultExpiryLabel(drop.expiresAt) : null;

  return (
    <View style={styles.wrap}>
      <VaultMediaTile
        kind={badge}
        title={drop.caption}
        subtitle={creatorHandle ? `@${creatorHandle}` : null}
        meta={expiry}
        mediaUrl={mediaUrl}
        span={cinematic ? 'hero' : 'wide'}
        height={cinematic ? 340 : 168}
        onPress={() => {
          hapticTap();
          onOpen();
        }}
      />
      {locked ? (
        <Pressable
          onPress={() => {
            hapticTap();
            onSubscribe?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock"
          hitSlop={8}
          style={styles.unlock}
        >
          <Text allowFontScaling={false} style={[styles.unlockText, { color: t.textPrimary }]}>
            Unlock →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  unlock: { paddingLeft: 2 },
  unlockText: { ...typeScale.label, fontWeight: '700' },
});
