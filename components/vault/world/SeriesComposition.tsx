import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WorldCollectionItem } from '../../../utils/vaultWorldRows';
import { space, typeScale, useThemeColors } from '../../../theme';
import { PosterStrip } from './PosterStrip';

export interface SeriesCompositionProps {
  collections: readonly WorldCollectionItem[];
  radius: number;
  scatter: readonly number[];
  onOpen: (id: string) => void;
}

/** The Collections chapter: named series, each a numbered film strip. */
export const SeriesComposition = React.memo(function SeriesComposition({
  collections,
  radius,
  scatter,
  onOpen,
}: SeriesCompositionProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <View style={styles.stack}>
      {collections.map((collection) => (
        <View key={collection.id} style={styles.series}>
          <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
            SERIES
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: t.textPrimary }]}
            numberOfLines={2}
          >
            {collection.title}
          </Text>
          <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]}>
            {`${collection.count} episode${collection.count === 1 ? '' : 's'}`}
          </Text>
          <PosterStrip
            items={collection.drops.map((drop) => ({
              id: drop.id,
              title: drop.title,
              mediaUrl: drop.mediaUrl,
              tint: drop.tint,
            }))}
            radius={radius}
            scatter={scatter}
            onOpen={onOpen}
          />
          {collection.description ? (
            <Text
              allowFontScaling={false}
              style={[styles.desc, { color: t.textSecondary }]}
              numberOfLines={2}
            >
              {collection.description}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  series: { gap: 4 },
  kicker: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typeScale.title, fontSize: 24, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6 },
  meta: { ...typeScale.caption, letterSpacing: 0.3, marginBottom: space.sm },
  desc: { ...typeScale.meta, fontSize: 13, lineHeight: 18, marginTop: 2, maxWidth: 320 },
});
