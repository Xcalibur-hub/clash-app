/**
 * Asymmetric Explore discovery mosaic.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '../../theme';
import { mosaicSpanForIndex, rankMosaicItems } from '../../utils/exploreMosaic';
import { ExploreMediaTile, type ExploreTileKind } from './ExploreMediaTile';

export interface ExploreMosaicItem {
  id: string;
  kind: ExploreTileKind;
  title: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
  accent?: string | null;
  onPress: () => void;
}

export function ExploreMosaic({
  items,
  max = 10,
}: {
  items: readonly ExploreMosaicItem[];
  max?: number;
}): React.JSX.Element | null {
  const ranked = React.useMemo(
    () => rankMosaicItems(items).slice(0, max),
    [items, max],
  );
  if (ranked.length === 0) return null;

  return (
    <View style={styles.grid}>
      {ranked.map((item, index) => (
        <ExploreMediaTile
          key={`${item.kind}-${item.id}`}
          kind={item.kind}
          title={item.title}
          subtitle={item.subtitle}
          mediaUrl={item.mediaUrl}
          accent={item.accent}
          span={mosaicSpanForIndex(index)}
          onPress={item.onPress}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
