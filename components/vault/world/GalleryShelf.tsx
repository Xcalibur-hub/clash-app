import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
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
 * The store as a creator's shelf: large artwork, minimal labels, asymmetric
 * left/right rhythm. Deliberately not an ecommerce product grid.
 */
export const GalleryShelf = React.memo(function GalleryShelf({
  items,
  radius = 10,
  onOpen,
}: GalleryShelfProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => {
        const right = index % 2 === 1;
        const large = index % 3 === 0;
        return (
          <View key={item.id} style={[styles.row, right && styles.rowRight]}>
            <EditorialMedia
              mediaUrl={item.mediaUrl}
              accent={item.tint}
              height={large ? 300 : 220}
              width={right ? '88%' : '100%'}
              radius={radius}
              hairline
              onPress={() => onOpen(item.id)}
            />
            <View style={[styles.label, right && styles.labelRight]}>
              <Text allowFontScaling={false} style={[styles.index, { color: t.textMuted }]}>
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.title, { color: t.textPrimary }]}
                numberOfLines={2}
              >
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
  wrap: { gap: space.xl },
  row: { gap: space.sm },
  rowRight: { alignItems: 'flex-end' },
  label: { gap: 2, maxWidth: '92%' },
  labelRight: { alignItems: 'flex-end' },
  index: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typeScale.title, fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: -0.4 },
  meta: { ...typeScale.caption, letterSpacing: 0.4 },
});
