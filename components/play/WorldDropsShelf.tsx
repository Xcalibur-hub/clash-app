import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ExploreDiscoveryCard } from '../explore/ExploreDiscoveryCard';
import { fetchExploreWorldDrops } from '../../services/creatorWorldDropService';
import type { CreatorWorldDrop } from '../../services/creatorWorldDropMappers';
import { dropDiscoveryHint, dropDiscoveryLine } from '../../utils/creatorWorldDrops';
import { creatorDropMediaUrl } from '../../services/creatorWorldDropService';
import { space, typeScale, useThemeColors } from '../../theme';

/** Hidden Creator World Drops, surfaced through the existing Explore Play panel. */
export function WorldDropsShelf(): React.JSX.Element | null {
  const t = useThemeColors();
  const router = useRouter();
  const [drops, setDrops] = React.useState<CreatorWorldDrop[]>([]);

  React.useEffect(() => {
    let alive = true;
    void fetchExploreWorldDrops(12)
      .then((next) => {
        if (alive) setDrops(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (drops.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text allowFontScaling={false} style={[styles.section, { color: t.textPrimary }]}>
        Hidden in the world
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {drops.map((drop) => (
          <ExploreDiscoveryCard
            key={drop.id}
            kind="DROP"
            title={dropDiscoveryLine({ creatorName: drop.creatorName, dropType: drop.dropType })}
            subtitle={drop.clue ?? drop.caption}
            meta={dropDiscoveryHint({ dropType: drop.dropType, locationLabel: drop.locationLabel })}
            mediaUrl={creatorDropMediaUrl(drop.media)}
            accent={drop.creatorTint ?? '#1B1B1E'}
            width={230}
            height={264}
            onPress={() => router.push(`/world/drop/${drop.id}` as never)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  section: { fontFamily: typeScale.section.fontFamily, fontSize: 15, fontWeight: '700' },
  rail: { gap: 8, paddingRight: space.md },
});