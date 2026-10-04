import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typeScale, useThemeColors } from '../../../theme';
import { EditorialMedia } from './EditorialMedia';
import type { PosterStripItem } from './PosterStrip';

export interface ContactSheetProps {
  items: readonly PosterStripItem[];
  columns?: number;
  onOpen: (id: string) => void;
}

const TILT = [-1.6, 1.2, -0.9, 1.8, -1.2, 0.8];

/**
 * Contact sheet — prints laid out like a photographer's proof sheet, each with a
 * small rotation. Used by the tactile "contact" worlds (Leo).
 */
export const ContactSheet = React.memo(function ContactSheet({
  items,
  columns = 2,
  onOpen,
}: ContactSheetProps): React.JSX.Element {
  const t = useThemeColors();
  const rows: PosterStripItem[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  return (
    <View style={styles.sheet}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((item, colIndex) => {
            const tilt = TILT[(rowIndex * columns + colIndex) % TILT.length];
            return (
              <View
                key={item.id}
                style={[styles.print, { transform: [{ rotate: `${tilt}deg` }] }]}
              >
                <EditorialMedia
                  mediaUrl={item.mediaUrl}
                  accent={item.tint}
                  height={150}
                  width="100%"
                  radius={4}
                  hairline
                  badge={String(rowIndex * columns + colIndex + 1).padStart(2, '0')}
                  onPress={() => onOpen(item.id)}
                />
                <Text allowFontScaling={false} style={[styles.caption, { color: t.textMuted }]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
            );
          })}
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, i) => (
                <View key={`spacer-${i}`} style={styles.print} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  sheet: { gap: space.lg },
  row: { flexDirection: 'row', gap: space.md },
  print: { flex: 1, gap: 4 },
  caption: { ...typeScale.caption, fontSize: 10, letterSpacing: 0.4 },
});
