import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { VaultCreatorWorldCard } from '../../services/vaultHomeService';
import { space, typeScale, useThemeColors } from '../../theme';
import { Avatar } from '../shared/Avatar';
import { PressableScale } from '../shared/PressableScale';
import { tap as hapticTap } from '../../utils/haptics';

export interface WorldRailProps {
  creators: readonly VaultCreatorWorldCard[];
  onEnter: (creatorId: string) => void;
}

/** Intimate Following rail — small identities, peeks the next world. */
export const WorldRail = React.memo(function WorldRail({
  creators,
  onEnter,
}: WorldRailProps): React.JSX.Element {
  const t = useThemeColors();

  return (
    <FlatList
      horizontal
      data={creators}
      keyExtractor={(c) => c.creatorId}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <PressableScale
          onPress={() => {
            hapticTap();
            onEnter(item.creatorId);
          }}
          style={styles.item}
          accessibilityLabel={`Open ${item.name}'s world`}
        >
          <View style={[styles.ring, { borderColor: item.tint }]}>
            <Avatar name={item.name} tint={item.tint} size={52} />
          </View>
          <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
        </PressableScale>
      )}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    gap: space.md,
    paddingRight: space.xl,
    paddingVertical: space.xs,
  },
  item: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  ring: {
    borderRadius: 999,
    borderWidth: 1.5,
    padding: 2,
  },
  name: {
    ...typeScale.caption,
    textAlign: 'center',
    width: '100%',
  },
});
