import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { WorldDropItem } from '../../../utils/vaultWorldRows';
import type { WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { personalityScatter } from '../../../utils/vaultWorldPersonality';
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
 * The Drops chapter. Tactile worlds lay prints on a contact sheet; the others
 * open with one cinematic lead still and finish with a numbered film strip.
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

  return (
    <View style={styles.stack}>
      <EditorialMedia
        mediaUrl={lead.mediaUrl}
        accent={accent}
        height={360}
        radius={radius}
        kicker={`DROP · ${lead.access}`}
        title={lead.title}
        onPress={() => onOpen(lead.id)}
      />
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
        onOpen={onOpen}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { gap: space.lg },
});
