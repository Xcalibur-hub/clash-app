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

/** The overlapping "latest" poster that breaks the hero's bottom edge. */
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
        height={150}
        width={112}
        radius={6}
        hairline
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
  poster: { position: 'absolute', right: layout.screenX, bottom: -26, zIndex: 3 },
});
