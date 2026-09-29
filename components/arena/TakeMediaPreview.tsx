import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PickedMedia } from '../../hooks/useMediaPicker';
import { card, ink, radius, space, typeScale } from '../../theme';
import { CloseIcon, PlayIcon } from '../shared/icons';

/** Formats a millisecond duration as m:ss. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface TakeMediaPreviewProps {
  media: PickedMedia;
  onRemove: () => void;
}

/**
 * The selected attachment in the composer. An image shows its real preview; a
 * video shows a plate with a play affordance (playback is not wired yet). Both
 * carry a remove control so the draft never traps a bad pick.
 */
export function TakeMediaPreview({ media, onRemove }: TakeMediaPreviewProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {media.kind === 'video' ? (
        <View style={styles.video}>
          <View style={styles.play}>
            <PlayIcon size={22} color={ink.primary} strokeWidth={2.4} />
          </View>
          {media.durationMs ? (
            <Text allowFontScaling={false} style={styles.duration}>
              {formatDuration(media.durationMs)}
            </Text>
          ) : null}
        </View>
      ) : (
        <Image source={{ uri: media.uri }} resizeMode="cover" style={styles.image} />
      )}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        style={styles.remove}
      >
        <CloseIcon size={16} color={ink.primary} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    aspectRatio: 16 / 9,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  image: { width: '100%', height: '100%' },
  video: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: '#0C0C10',
  },
  play: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  duration: { ...typeScale.data, color: ink.primary },
  remove: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
