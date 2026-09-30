import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { space, typeScale, useThemeColors } from '../../theme';

export interface VaultCollectionCardProps {
  title: string;
  description: string;
  drops: readonly StorefrontDrop[];
}

/**
 * Permanent Collection — chapter / album feel, distinct from ephemeral Drops.
 * Cover derived only from accessible public free media; never private URLs.
 */
export function VaultCollectionCard({ title, description, drops }: VaultCollectionCardProps): React.JSX.Element {
  const t = useThemeColors();
  const coverDrop = drops.find(
    (drop) => drop.accessLevel === 'free' && drop.publicMedia?.kind === 'image' && drop.accessible,
  );
  const coverUrl = coverDrop?.publicMedia
    ? getPublicMediaUrl(coverDrop.publicMedia.bucket, coverDrop.publicMedia.path)
    : null;
  const countLabel = drops.length === 1 ? '1 moment' : `${drops.length} moments`;

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
      <View style={[styles.cover, { backgroundColor: t.surfaceMuted }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text allowFontScaling={false} style={[styles.coverMark, { color: t.textMuted }]}>
            COLLECTION
          </Text>
        )}
      </View>

      <View style={styles.body}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          COLLECTION
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
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
    </View>
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
  cover: {
    aspectRatio: 16 / 9,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverMark: {
    ...typeScale.caption,
    letterSpacing: 1.2,
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
  title: {
    ...typeScale.section,
  },
  description: {
    ...typeScale.meta,
  },
  meta: {
    ...typeScale.meta,
    marginTop: 2,
  },
});
