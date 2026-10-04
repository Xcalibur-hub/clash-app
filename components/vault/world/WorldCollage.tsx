import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { VaultCreatorWorldCard } from '../../../services/vaultHomeService';
import { creatorIdentityLine, worldHappeningLine } from '../../../utils/vaultPresentation';
import {
  personalityCollageOrder,
  personalityRadius,
  personalityScatter,
  worldPersonality,
} from '../../../utils/vaultWorldPersonality';
import { space } from '../../../theme';
import { EditorialMedia } from './EditorialMedia';

export interface WorldCollageProps {
  worlds: readonly VaultCreatorWorldCard[];
  onEnter: (creatorId: string) => void;
}

const SIZES = {
  lead: { height: 300, width: '100%', align: 'flex-start' },
  wide: { height: 184, width: '100%', align: 'flex-start' },
  portrait: { height: 250, width: '64%', align: 'flex-end' },
  square: { height: 168, width: '54%', align: 'flex-start' },
} as const;

/**
 * Discover worlds as an asymmetric editorial collage: each creator takes a shape
 * derived from their personality, so the page never repeats one rectangle.
 */
export const WorldCollage = React.memo(function WorldCollage({
  worlds,
  onEnter,
}: WorldCollageProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {worlds.map((world, index) => {
        const personality = worldPersonality({
          creatorId: world.creatorId,
          handle: world.handle,
          name: world.name,
        });
        const shape = personalityCollageOrder(personality, index);
        const size = SIZES[shape];
        const scatter = personalityScatter(personality, index);
        const meta = worldHappeningLine(world) ?? creatorIdentityLine(world.bio);
        return (
          <View
            key={world.creatorId}
            style={{
              alignSelf: size.align === 'flex-end' ? 'flex-end' : 'flex-start',
              width: size.width,
              marginTop: Math.max(0, scatter),
            }}
          >
            <EditorialMedia
              mediaUrl={world.mediaUrl}
              accent={world.tint}
              height={size.height}
              width="100%"
              radius={personalityRadius(personality)}
              hairline={shape !== 'lead'}
              kicker="WORLD"
              title={world.name}
              meta={meta}
              onPress={() => onEnter(world.creatorId)}
            />
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
});
