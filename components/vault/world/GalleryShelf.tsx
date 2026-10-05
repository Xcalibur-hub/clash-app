import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { EditorialMedia } from './EditorialMedia';

export interface ShelfItem {
  id: string;
  title: string;
  mediaUrl?: string | null;
  tint?: string | null;
  meta?: string | null;
}

export interface GalleryShelfProps {
  items: readonly ShelfItem[];
  radius?: number;
  onOpen: (id: string) => void;
}

/**
 * Creator artifact shelf — large artwork, labels outside, asymmetric rhythm.
 */
export const GalleryShelf = React.memo(function GalleryShelf({
  items,
  radius = 4,
  onOpen,
}: GalleryShelfProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => {
        const right = index % 2 === 1;
        const large = index % 3 === 0;
        const bleed = index % 4 === 0;
        return (
          <View key={item.id} style={[styles.row, right && styles.rowRight]}>
            <View style={bleed ? styles.bleed : undefined}>
              <EditorialMedia
                mediaUrl={item.mediaUrl}
                accent={item.tint}
                height={large ? 320 : 230}
                width={right ? '90%' : '100%'}
                radius={radius}
                onPress={() => onOpen(item.id)}
              />
            </View>
            <View style={[styles.label, right && styles.labelRight]}>
              <Text allowFontScaling={false} style={[styles.index, { color: t.textMuted }]}>
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
                {item.title}
              </Text>
              {item.meta ? (
                <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                  {item.meta}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xxl },
  row: { gap: space.sm },
  rowRight: { alignItems: 'flex-end' },
  bleed: { marginHorizontal: -layout.screenX * 0.35 },
  label: { gap: 2, maxWidth: '92%' },
  labelRight: { alignItems: 'flex-end' },
  index: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typeScale.title, fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.5 },
  meta: { ...typeScale.caption, letterSpacing: 0.4 },
});
