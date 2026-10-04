import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { VaultHomeDropCard } from '../../services/vaultHomeService';
import { vaultAccessMeta } from '../../utils/vaultPresentation';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { PlayIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

export interface TodaysDropCardProps {
  drop: VaultHomeDropCard;
  onOpen: () => void;
  large?: boolean;
}

/** Cinematic Drop — media dominates, tiny access meta, no bordered marketplace card. */
export const TodaysDropCard = React.memo(function TodaysDropCard({
  drop,
  onOpen,
  large = true,
}: TodaysDropCardProps): React.JSX.Element {
  const t = useThemeColors();
  const isVideo = drop.mediaKind === 'video';
  const accessLabel = vaultAccessMeta(drop.accessLevel);

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[styles.wrap, large ? styles.large : styles.compact, !large && { marginRight: space.md }]}
      accessibilityLabel={`${accessLabel}: ${drop.caption} by @${drop.authorHandle}`}
    >
      <View
        style={[
          styles.media,
          large ? styles.mediaLarge : styles.mediaCompact,
          { backgroundColor: t.surfaceMuted },
          large && { marginHorizontal: -layout.screenX },
        ]}
      >
        {drop.mediaUrl ? (
          <Image source={{ uri: drop.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.scrim} />
        {isVideo ? (
          <View style={styles.play}>
            <PlayIcon size={14} color="#FAFAF8" strokeWidth={2.4} />
          </View>
        ) : null}
        <View style={[styles.overlay, large && styles.overlayLarge]}>
          <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
            @{drop.authorHandle}
          </Text>
          <Text allowFontScaling={false} style={[styles.caption, !large && styles.captionCompact]} numberOfLines={2}>
            {drop.caption}
          </Text>
          <Text allowFontScaling={false} style={styles.access}>
            {accessLabel}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  large: { width: '100%' },
  compact: { width: 240 },
  media: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  mediaLarge: { aspectRatio: 4 / 5 },
  mediaCompact: { aspectRatio: 3 / 4, borderRadius: 2 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.28)',
  },
  overlay: {
    gap: 4,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.xxl,
  },
  overlayLarge: {
    paddingHorizontal: layout.screenX + 4,
    paddingBottom: space.xl,
  },
  handle: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.72)',
    letterSpacing: 0.4,
  },
  caption: {
    fontFamily: typeScale.title.fontFamily,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: '#FAFAF8',
  },
  captionCompact: { fontSize: 18, lineHeight: 22 },
  access: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.7)',
    letterSpacing: 0.9,
    marginTop: 4,
    fontSize: 10,
  },
  play: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
