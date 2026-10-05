import React from 'react';
import { StyleSheet, View } from 'react-native';
import { layout } from '../../../theme';
import { EditorialMedia } from './EditorialMedia';

export interface WorldHeroPosterProps {
  mediaUrl: string;
  label?: string | null;
  accent: string | null;
  onPress?: () => void;
}

/** Overlapping latest poster — breaks the hero's bottom edge like a film print. */
export function WorldHeroPoster({
  mediaUrl,
  label,
  accent,
  onPress,
}: WorldHeroPosterProps): React.JSX.Element {
  return (
    <View style={styles.poster}>
      <EditorialMedia
        mediaUrl={mediaUrl}
        accent={accent}
        height={156}
        width={116}
        radius={3}
        shape="film"
        hairline
        badge="01"
        kicker="LATEST"
        title={label ?? null}
        onPress={() => {
          if (onPress) onPress();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    position: 'absolute',
    right: layout.screenX,
    bottom: -32,
    zIndex: 3,
    transform: [{ rotate: '2.5deg' }],
  },
});
