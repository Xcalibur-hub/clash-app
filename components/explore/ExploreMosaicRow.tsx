/**
 * One virtualized For You mosaic row — feature (large + stack) or portrait pair.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '../../theme';
import type { ExploreMosaicRow as MosaicRow } from '../../utils/exploreNav';
import { ExploreMediaTile, type ExploreTileKind } from './ExploreMediaTile';

export interface ExploreFeedTile {
  id: string;
  kind: ExploreTileKind;
  title: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
  accent?: string | null;
  onPress: () => void;
}

export function ExploreMosaicRowView({
  row,
}: {
  row: MosaicRow<ExploreFeedTile>;
}): React.JSX.Element {
  if (row.type === 'feature') {
    return (
      <View style={styles.feature}>
        <ExploreMediaTile
          kind={row.large.kind}
          title={row.large.title}
          subtitle={row.large.subtitle}
          mediaUrl={row.large.mediaUrl}
          accent={row.large.accent}
          span="hero"
          fill
          style={styles.featureLarge}
          onPress={row.large.onPress}
        />
        <View style={styles.featureStack}>
          <ExploreMediaTile
            kind={row.smallTop.kind}
            title={row.smallTop.title}
            subtitle={row.smallTop.subtitle}
            mediaUrl={row.smallTop.mediaUrl}
            accent={row.smallTop.accent}
            span="half"
            fill
            onPress={row.smallTop.onPress}
          />
          <ExploreMediaTile
            kind={row.smallBottom.kind}
            title={row.smallBottom.title}
            subtitle={row.smallBottom.subtitle}
            mediaUrl={row.smallBottom.mediaUrl}
            accent={row.smallBottom.accent}
            span="half"
            fill
            onPress={row.smallBottom.onPress}
          />
        </View>
      </View>
    );
  }

  if (row.type === 'pair') {
    return (
      <View style={styles.pair}>
        <ExploreMediaTile
          kind={row.left.kind}
          title={row.left.title}
          subtitle={row.left.subtitle}
          mediaUrl={row.left.mediaUrl}
          accent={row.left.accent}
          span="portrait"
          fill
          onPress={row.left.onPress}
        />
        <ExploreMediaTile
          kind={row.right.kind}
          title={row.right.title}
          subtitle={row.right.subtitle}
          mediaUrl={row.right.mediaUrl}
          accent={row.right.accent}
          span="portrait"
          fill
          onPress={row.right.onPress}
        />
      </View>
    );
  }

  return (
    <ExploreMediaTile
      kind={row.item.kind}
      title={row.item.title}
      subtitle={row.item.subtitle}
      mediaUrl={row.item.mediaUrl}
      accent={row.item.accent}
      span="wide"
      onPress={row.item.onPress}
    />
  );
}

const styles = StyleSheet.create({
  feature: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.xs,
    minHeight: 248,
  },
  featureLarge: {
    flex: 1.2,
  },
  featureStack: {
    flex: 0.8,
    gap: space.xs,
  },
  pair: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.xs,
  },
});
