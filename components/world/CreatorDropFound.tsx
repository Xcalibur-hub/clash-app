import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import type { CreatorWorldDrop } from '../../services/creatorWorldDropMappers';
import { creatorDropMediaUrl } from '../../services/creatorWorldDropService';
import { dropTypeLabel } from '../../utils/creatorWorldDrops';
import { duration, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { copyTextToClipboard } from '../../utils/clipboard';
import { EditorialMedia } from '../vault/world/EditorialMedia';
import { VaultActionButton } from '../vault/VaultActionButton';

export interface CreatorDropFoundProps {
  drop: CreatorWorldDrop;
  rewardLabel: string;
  onViewReward?: () => void;
  onViewCreator?: () => void;
  onDone: () => void;
}

/** The tasteful result moment after a discovery. Nothing is posted automatically. */
export function CreatorDropFound({
  drop,
  rewardLabel,
  onViewReward,
  onViewCreator,
  onDone,
}: CreatorDropFoundProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const who = (drop.creatorName ?? 'A creator').split(' ')[0].toUpperCase();
  const mediaUrl = creatorDropMediaUrl(drop.media);

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)} style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.found, { color: t.textMuted }]}>
        FOUND
      </Text>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        {`${who}’S ${dropTypeLabel(drop.dropType).toUpperCase()}`}
      </Text>
      <Animated.View entering={reduced ? undefined : FadeInUp.duration(duration.slow)}>
        <EditorialMedia
          mediaUrl={mediaUrl}
          accent={drop.creatorTint}
          height={280}
          radius={8}
          kicker={rewardLabel.toUpperCase()}
          title={drop.caption}
        />
      </Animated.View>
      <Text allowFontScaling={false} style={[styles.note, { color: t.textSecondary }]}>
        Added to your collection.
      </Text>
      <View style={styles.actions}>
        {onViewReward ? <VaultActionButton label="Open the reward" onPress={onViewReward} /> : null}
        {onViewCreator ? (
          <VaultActionButton label="Back to their world" tone="quiet" onPress={onViewCreator} />
        ) : null}
        <VaultActionButton label="Done" tone="quiet" onPress={onDone} />
      </View>
      <Pressable
        onPress={() => {
          hapticTap();
          void copyTextToClipboard(`I found ${who}’s ${dropTypeLabel(drop.dropType)} on CLASH.`);
        }}
        accessibilityRole="button"
        accessibilityLabel="Share your find"
        hitSlop={8}
      >
        <Text allowFontScaling={false} style={[styles.share, { color: t.textMuted }]}>
          Share your find
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  found: { ...typeScale.caption, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { ...typeScale.display, fontSize: 30, lineHeight: 33, fontWeight: '800', letterSpacing: -1 },
  note: { ...typeScale.body, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  share: { ...typeScale.meta, textDecorationLine: 'underline' },
});