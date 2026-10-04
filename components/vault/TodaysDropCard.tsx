import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { VaultHomeDropCard } from '../../services/vaultHomeService';
import { space, typeScale, useThemeColors } from '../../theme';
import { PressableScale } from '../shared/PressableScale';
import { PlayIcon } from '../shared/icons';
import { tap as hapticTap } from '../../utils/haptics';

export interface TodaysDropCardProps {
  drop: VaultHomeDropCard;
  onOpen: () => void;
  large?: boolean;
}

/** Cinematic Today's Drop card — poster-first, no autoplay. */
export const TodaysDropCard = React.memo(function TodaysDropCard({
  drop,
  onOpen,
  large = true,
}: TodaysDropCardProps): React.JSX.Element {
  const t = useThemeColors();
  const isVideo = drop.mediaKind === 'video';
  const accessLabel = drop.accessLevel === 'preview' ? 'PREVIEW AVAILABLE' : 'FREE DROP';

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      style={[
        styles.card,
        large ? styles.large : styles.compact,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
          shadowOpacity: t.scheme === 'light' ? 0.1 : 0,
        },
      ]}
      accessibilityLabel={`${accessLabel}: ${drop.caption} by @${drop.authorHandle}`}
    >
      <View style={[styles.media, { backgroundColor: t.surfaceMuted }]}>
        {drop.mediaUrl ? (
          <Image source={{ uri: drop.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.scrim} />
        {isVideo ? (
          <View style={styles.play}>
            <PlayIcon size={16} color="#FAFAF8" strokeWidth={2.4} />
          </View>
        ) : null}
        <View style={styles.overlay}>
          <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
            @{drop.authorHandle}
          </Text>
          <Text allowFontScaling={false} style={styles.caption} numberOfLines={2}>
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
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  large: { width: '100%' },
  compact: { width: 260 },
  media: {
    aspectRatio: 4 / 5,
    width: '100%',
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.28)',
  },
  overlay: {
    gap: 6,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    paddingTop: space.xxl,
  },
  handle: {
    ...typeScale.meta,
    color: 'rgba(250,250,248,0.82)',
  },
  caption: {
    ...typeScale.title,
    color: '#FAFAF8',
  },
  access: {
    ...typeScale.caption,
    color: 'rgba(250,250,248,0.78)',
    letterSpacing: 0.7,
    marginTop: 4,
  },
  play: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});
