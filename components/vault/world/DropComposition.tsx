import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { WorldDropItem } from '../../../utils/vaultWorldRows';
import type { WorldPersonality } from '../../../utils/vaultWorldPersonality';
import {
  personalityHasTexture,
  personalityMediaShape,
  personalityScatter,
} from '../../../utils/vaultWorldPersonality';
import { space } from '../../../theme';
import { ContactSheet } from './ContactSheet';
import { EditorialMedia } from './EditorialMedia';
import { PosterStrip } from './PosterStrip';

export interface DropCompositionProps {
  drops: readonly WorldDropItem[];
  personality: WorldPersonality;
  radius: number;
  accent: string | null;
  onOpen: (id: string) => void;
}

/**
 * Drops chapter — personality decides contact sheet vs film strip vs studio circle.
 */
export const DropComposition = React.memo(function DropComposition({
  drops,
  personality,
  radius,
  accent,
  onOpen,
}: DropCompositionProps): React.JSX.Element | null {
  if (drops.length === 0) return null;

  if (personality === 'contact') {
    return (
      <ContactSheet
        items={drops.map((drop) => ({
          id: drop.id,
          title: drop.title,
          mediaUrl: drop.mediaUrl,
          tint: drop.tint,
        }))}
        onOpen={onOpen}
      />
    );
  }

  const [lead, ...rest] = drops;
  const scatter = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => personalityScatter(personality, index));
  const shape = personalityMediaShape(personality);
  const texture = personalityHasTexture(personality)
    ? personality === 'blueprint'
      ? 'grid'
      : 'grain'
    : null;

  return (
    <View style={styles.stack}>
      <EditorialMedia
        mediaUrl={lead.mediaUrl}
        accent={accent}
        height={shape === 'circle' ? 280 : 360}
        width={shape === 'circle' ? 280 : '100%'}
        radius={radius}
        shape={shape === 'circle' ? 'circle' : shape === 'film' ? 'film' : 'rect'}
        texture={texture}
        style={shape === 'circle' ? styles.circleLead : undefined}
        kicker={`DROP · ${lead.access}`}
        title={lead.title}
        onPress={() => onOpen(lead.id)}
      />
      {rest.length > 0 ? (
        <PosterStrip
          items={rest.map((drop) => ({
            id: drop.id,
            title: drop.title,
            mediaUrl: drop.mediaUrl,
            tint: drop.tint,
            meta: drop.access,
          }))}
          radius={radius}
          scatter={scatter}
          shape={shape === 'film' ? 'film' : 'rect'}
          onOpen={onOpen}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  circleLead: { alignSelf: 'center' },
});
