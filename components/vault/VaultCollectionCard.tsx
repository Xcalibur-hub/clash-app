import React from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import type { StorefrontDrop } from '../../services/vaultMappers';
import { getPublicMediaUrl } from '../../services/mediaService';
import { vaultPublicVisualMedia } from '../../utils/vaultAccess';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface VaultCollectionCardProps {
  title: string;
  description: string;
  drops: readonly StorefrontDrop[];
  onOpen?: () => void;
}

function episodeThumb(drop: StorefrontDrop): string | null {
  const visual = vaultPublicVisualMedia({
    accessLevel: drop.accessLevel,
    accessible: drop.accessible,
    publicMedia: drop.publicMedia,
    previewMedia: drop.previewMedia,
  });
  return visual ? getPublicMediaUrl(visual.bucket, visual.path) : null;
}

/**
 * Collection as SERIES — streaming-strip episodes, Explore media language.
 */
export function VaultCollectionCard({
  title,
  description,
  drops,
  onOpen,
}: VaultCollectionCardProps): React.JSX.Element {
  const t = useThemeColors();
  const countLabel = `${drops.length} episode${drops.length === 1 ? '' : 's'}`;

  const body = (
    <>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
          SERIES
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={[styles.count, { color: t.textMuted }]}>
          {drops.length === 0 ? 'Nothing saved yet' : countLabel}
        </Text>
        {description ? (
          <Text allowFontScaling={false} style={[styles.description, { color: t.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>

      {drops.length > 0 ? (
        <FlatList
          horizontal
          data={drops.slice(0, 8)}
          keyExtractor={(d) => d.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          renderItem={({ item, index }) => {
            const url = episodeThumb(item);
            return (
              <View style={styles.episode}>
                <View
                  style={[
                    styles.frame,
                    {
                      backgroundColor: t.surfaceMuted,
                      borderColor: t.scheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                    },
                  ]}
                >
                  {url ? (
                    <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : null}
                  <View style={styles.epBadge}>
                    <Text allowFontScaling={false} style={styles.epIndex}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                </View>
                <Text
                  allowFontScaling={false}
                  style={[styles.epCaption, { color: t.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.caption}
                </Text>
              </View>
            );
          }}
        />
      ) : null}
    </>
  );

  if (!onOpen) {
    return (
      <View style={styles.wrap} accessibilityLabel={`Series: ${title}`}>
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
      style={styles.wrap}
      accessibilityLabel={`Series: ${title}`}
      accessibilityHint="Opens this series"
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingVertical: space.xs },
  header: { gap: 2 },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    fontFamily: typeScale.display.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  count: {
    ...typeScale.caption,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  description: { ...typeScale.meta, marginTop: 2, maxWidth: 320 },
  strip: {
    gap: space.xs,
    paddingRight: space.xl,
  },
  episode: { width: 120, gap: 6 },
  frame: {
    width: 120,
    aspectRatio: 3 / 4,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  epBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  epIndex: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#FAFAF8',
  },
  epCaption: {
    ...typeScale.meta,
    fontSize: 12,
    lineHeight: 15,
  },
});
