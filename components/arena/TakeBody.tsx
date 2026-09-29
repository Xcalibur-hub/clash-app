import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { TakeMedia } from './TakeMedia';

export interface TakeBodyProps {
  take: Take;
  onOpen: () => void;
  /** When true, media bleeds edge-to-edge past the feed's horizontal padding. */
  edgeMedia?: boolean;
}

/** Take content — typography-first for text, image-forward for media. */
export function TakeBody({ take, onOpen, edgeMedia = false }: TakeBodyProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open take"
        style={styles.textHit}
      >
        <Text
          allowFontScaling
          style={[
            take.media ? styles.textWithMedia : styles.textSolo,
            { color: t.textPrimary },
          ]}
        >
          {take.text}
        </Text>
      </Pressable>
      {take.media ? (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open take media"
          style={edgeMedia ? styles.mediaBleed : styles.mediaInset}
        >
          <TakeMedia media={take.media} edge={edgeMedia} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  textHit: { paddingVertical: 2 },
  textSolo: {
    ...typeScale.takeText,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '600',
  },
  textWithMedia: {
    ...typeScale.takeText,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  mediaInset: { borderRadius: 16, overflow: 'hidden' },
  mediaBleed: {
    marginHorizontal: -layout.screenX,
    overflow: 'hidden',
  },
});
