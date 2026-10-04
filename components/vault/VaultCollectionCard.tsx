import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { vaultPublicVisualMedia } from '../../utils/vaultAccess';
import { space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface VaultCollectionCardProps {
  title: string;
  description: string;
  drops: readonly StorefrontDrop[];
  onOpen?: () => void;
}

/**
 * Collection as series / world chapter — cover from public free or preview media only.
 */
export function VaultCollectionCard({
  title,
  description,
  drops,
  onOpen,
}: VaultCollectionCardProps): React.JSX.Element {
  const t = useThemeColors();
  const coverDrop = drops.find((drop) => {
    const visual = vaultPublicVisualMedia({
      accessLevel: drop.accessLevel,
      accessible: drop.accessible,
      publicMedia: drop.publicMedia,
      previewMedia: drop.previewMedia,
    });
    return Boolean(visual);
  });
  const visual = coverDrop
    ? vaultPublicVisualMedia({
        accessLevel: coverDrop.accessLevel,
        accessible: coverDrop.accessible,
        publicMedia: coverDrop.publicMedia,
        previewMedia: coverDrop.previewMedia,
      })
    : null;
  const coverUrl = visual ? getPublicMediaUrl(visual.bucket, visual.path) : null;
  const countLabel = drops.length === 1 ? '1 episode' : `${drops.length} episodes`;

  const body = (
    <>
      <View style={[styles.cover, { backgroundColor: t.surfaceMuted }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text allowFontScaling={false} style={[styles.coverMark, { color: t.textMuted }]}>
            COLLECTION
          </Text>
        )}
        <View style={styles.coverScrim} />
        <Text allowFontScaling={false} style={styles.coverTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>

      <View style={styles.body}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          SERIES
        </Text>
        {description ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
          {drops.length === 0 ? 'Nothing saved yet' : `${countLabel} · permanent`}
        </Text>
      </View>
    </>
  );

  if (!onOpen) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            shadowColor: t.shadowColor,
            shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
          },
        ]}
        accessibilityLabel={`Collection: ${title}`}
      >
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.08 : 0,
        },
      ]}
      accessibilityLabel={`Collection: ${title}`}
      accessibilityHint="Opens this series"
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cover: {
    aspectRatio: 16 / 10,
    width: '100%',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: space.lg,
  },
  coverScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.28)',
  },
  coverMark: {
    ...typeScale.caption,
    letterSpacing: 1.2,
  },
  coverTitle: {
    ...typeScale.title,
    color: '#FAFAF8',
    zIndex: 1,
  },
  body: {
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  kicker: {
    ...typeScale.caption,
    letterSpacing: 0.8,
  },
  description: {
    ...typeScale.meta,
  },
  meta: {
    ...typeScale.meta,
    marginTop: 2,
  },
});
