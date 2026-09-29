import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Take } from '../../store';
import { ink, space } from '../../theme';
import { TakeMedia } from './TakeMedia';

export interface TakeBodyProps {
  take: Take;
  onOpen: () => void;
}

/** The Take's core content: readable post text + optional media. */
export function TakeBody({ take, onOpen }: TakeBodyProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open take"
        style={styles.textHit}
      >
        <Text allowFontScaling style={styles.text}>
          {take.text}
        </Text>
      </Pressable>
      {take.media ? (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Open take media"
          style={styles.media}
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
  text: { fontSize: 16, lineHeight: 23, fontWeight: '500', color: ink.primary },
  media: { borderRadius: 14, overflow: 'hidden' },
});
