import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { space } from '../../theme';
import type { ExploreShelfItem } from '../../utils/exploreShelf';
import { shelfIsVisible } from '../../utils/exploreShelf';
import { ExploreDiscoveryCard } from './ExploreDiscoveryCard';
import { ExploreHeading } from './ExploreHeading';

export interface ExploreShelfProps {
  title: string;
  items: readonly ExploreShelfItem[];
  onOpen: (item: ExploreShelfItem) => void;
  accessory?: React.ReactNode;
}

/**
 * Compact cross-surface rail for For You.
 * Ranking is already resolved upstream — this only lays cards out.
 */
export function ExploreShelf({
  title,
  items,
  onOpen,
  accessory,
}: ExploreShelfProps): React.JSX.Element | null {
  if (!shelfIsVisible(items)) return null;

  return (
    <View style={styles.wrap}>
      <ExploreHeading title={title} accessory={accessory} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        accessibilityLabel={`${title} shelf`}
      >
        {items.map((item) => (
          <ExploreDiscoveryCard
            key={`${item.kind}:${item.id}`}
            kind={item.kind}
            title={item.title}
            subtitle={item.subtitle}
            meta={item.meta}
            mediaUrl={item.mediaUrl}
            width={172}
            height={216}
            onPress={() => onOpen(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  rail: { gap: space.sm, flexDirection: 'row', paddingRight: space.xs },
});
