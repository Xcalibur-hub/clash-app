import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { TakeMedia } from './TakeMedia';

export interface TakeBodyProps {
  take: Take;
  onOpen: () => void;
}

/**
 * Take content — typography-first for text, bounded media plate when present.
 * Media stays inside feed margins with rounded clipping (never edge bleed).
 */
export function TakeBody({ take, onOpen }: TakeBodyProps): React.JSX.Element {
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
          style={styles.mediaFrame}
        >
          <TakeMedia media={take.media} />
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
  mediaFrame: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});
