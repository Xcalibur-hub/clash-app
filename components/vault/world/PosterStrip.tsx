import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
import { EditorialMedia, type EditorialMediaShape } from './EditorialMedia';

export interface PosterStripItem {
  id: string;
  title: string;
  mediaUrl?: string | null;
  tint?: string | null;
  meta?: string | null;
}

export interface PosterStripProps {
  items: readonly PosterStripItem[];
  radius?: number;
  frameHeight?: number;
  frameWidth?: number;
  /** Per-index vertical offsets — gives the tactile worlds a scattered feel. */
  scatter?: readonly number[];
  shape?: EditorialMediaShape;
  paper?: boolean;
  onOpen: (id: string) => void;
}

/**
 * Horizontal film / poster strip. Captions sit beneath the image, not inside a card.
 */
export const PosterStrip = React.memo(function PosterStrip({
  items,
  radius = 4,
  frameHeight = 176,
  frameWidth = 128,
  scatter,
  shape = 'rect',
  paper = false,
  onOpen,
}: PosterStripProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      renderItem={({ item, index }) => {
        const offset = scatter ? (scatter[index % scatter.length] ?? 0) : 0;
        return (
          <View style={[styles.frame, { width: frameWidth, marginTop: Math.max(0, offset) }]}>
            <EditorialMedia
              mediaUrl={item.mediaUrl}
              accent={item.tint}
              height={frameHeight}
              width={frameWidth}
              radius={radius}
              shape={shape}
              paper={paper}
              hairline={!paper}
              badge={String(index + 1).padStart(2, '0')}
              onPress={() => onOpen(item.id)}
            />
            <Text allowFontScaling={false} style={[styles.caption, { color: t.textSecondary }]} numberOfLines={2}>
              {item.title}
            </Text>
            {item.meta ? (
              <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                {item.meta}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
});

const styles = StyleSheet.create({
  strip: { gap: space.md, paddingRight: space.xl, paddingBottom: 6, paddingTop: 4 },
  frame: { gap: 6 },
  caption: { ...typeScale.meta, fontSize: 12, lineHeight: 15 },
  meta: { ...typeScale.caption, fontSize: 10, letterSpacing: 0.6 },
});
