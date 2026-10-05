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

const TILT = [-2.2, 1.6, -1.3, 2.4, -1.8, 1.1];
const OFFSET_Y = [0, 10, -8, 14, -6, 8];

/**
 * Photographer's proof sheet — paper-matted prints, slight rotations, captions under.
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
            const i = rowIndex * columns + colIndex;
            const tilt = TILT[i % TILT.length];
            const lift = OFFSET_Y[i % OFFSET_Y.length];
            return (
              <View
                key={item.id}
                style={[
                  styles.print,
                  {
                    marginTop: lift,
                    transform: [{ rotate: `${tilt}deg` }],
                  },
                ]}
              >
                <EditorialMedia
                  mediaUrl={item.mediaUrl}
                  accent={item.tint}
                  height={158}
                  width="100%"
                  radius={3}
                  paper
                  hairline
                  badge={String(i + 1).padStart(2, '0')}
                  onPress={() => onOpen(item.id)}
                />
                <Text allowFontScaling={false} style={[styles.caption, { color: t.textMuted }]} numberOfLines={2}>
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
  sheet: { gap: space.lg, paddingVertical: space.xs },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  print: { flex: 1, gap: 6 },
  caption: {
    ...typeScale.caption,
    fontSize: 11,
    letterSpacing: 0.2,
    fontStyle: 'italic',
  },
});
