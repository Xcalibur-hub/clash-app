import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import type { VaultCreatorWorldCard } from '../../../services/vaultHomeService';
import { creatorIdentityLine, worldHappeningLine } from '../../../utils/vaultPresentation';
import {
  personalityHasTexture,
  personalityMediaShape,
  personalityNameOutside,
  personalityRadius,
  personalityScatter,
  personalityTilt,
  worldPersonality,
} from '../../../utils/vaultWorldPersonality';
import { duration, layout, space, typeScale, useThemeColors } from '../../../theme';
import { EditorialMedia } from './EditorialMedia';

export interface WorldCollageProps {
  worlds: readonly VaultCreatorWorldCard[];
  onEnter: (creatorId: string) => void;
}

/**
 * Discover worlds as a curated exhibition collage — overlapping photography,
 * independent typography, irregular crops. Never a feed of identical cards.
 */
export const WorldCollage = React.memo(function WorldCollage({
  worlds,
  onEnter,
}: WorldCollageProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();

  return (
    <View style={styles.wrap}>
      {worlds.map((world, index) => {
        const personality = worldPersonality({
          creatorId: world.creatorId,
          handle: world.handle,
          name: world.name,
        });
        const radius = personalityRadius(personality);
        const shape = personalityMediaShape(personality);
        const outside = personalityNameOutside(personality);
        const scatter = personalityScatter(personality, index);
        const tilt = personalityTilt(personality, index);
        const texture = personalityHasTexture(personality)
          ? personality === 'blueprint'
            ? 'grid'
            : 'grain'
          : null;
        const meta = worldHappeningLine(world) ?? creatorIdentityLine(world.bio);
        const pair = index % 3;
        const delay = Math.min(index * 40, 200);

        // Rhythm: full cinematic → overlapping pair → floating portrait/circle
        if (pair === 0) {
          return (
            <Animated.View
              key={world.creatorId}
              entering={reduced ? undefined : FadeInUp.delay(delay).duration(duration.base)}
              style={[styles.lead, { marginTop: scatter }]}
            >
              <View style={styles.leadBleed}>
                <EditorialMedia
                  mediaUrl={world.mediaUrl}
                  accent={world.tint}
                  height={310}
                  width="100%"
                  radius={personality === 'blueprint' ? 2 : 6}
                  shape={shape === 'film' ? 'film' : 'rect'}
                  texture={texture}
                  onPress={() => onEnter(world.creatorId)}
                />
              </View>
              <View style={styles.leadCopy}>
                <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
                  WORLD
                </Text>
                <Text allowFontScaling={false} style={[styles.leadName, { color: t.textPrimary }]} numberOfLines={1}>
                  {world.name}
                </Text>
                {meta ? (
                  <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]} numberOfLines={2}>
                    {meta}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          );
        }

        if (pair === 1) {
          // Landscape base + overlapping portrait fragment
          return (
            <Animated.View
              key={world.creatorId}
              entering={reduced ? undefined : FadeInUp.delay(delay).duration(duration.base)}
              style={[styles.cluster, { marginTop: Math.max(8, scatter) }]}
            >
              <EditorialMedia
                mediaUrl={world.mediaUrl}
                accent={world.tint}
                height={200}
                width="78%"
                radius={radius}
                shape="rect"
                texture={texture}
                hairline={personality === 'contact'}
                paper={personality === 'contact'}
                onPress={() => onEnter(world.creatorId)}
                style={{ alignSelf: 'flex-start' }}
              />
              <View
                style={[
                  styles.overlapPortrait,
                  {
                    transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined,
                  },
                ]}
              >
                <EditorialMedia
                  mediaUrl={world.mediaUrl}
                  accent={world.tint}
                  height={shape === 'circle' ? 148 : 176}
                  width={shape === 'circle' ? 148 : 132}
                  radius={radius}
                  shape={shape === 'circle' ? 'circle' : 'rect'}
                  texture={texture}
                  paper={personality === 'contact'}
                  onPress={() => onEnter(world.creatorId)}
                />
              </View>
              <View style={[styles.clusterCopy, { alignItems: 'flex-start' }]}>
                <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
                  {world.name}
                </Text>
                {meta ? (
                  <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          );
        }

        // Floating portrait / circular artifact, flush right or left
        const right = index % 2 === 0;
        return (
          <Animated.View
            key={world.creatorId}
            entering={reduced ? undefined : FadeInUp.delay(delay).duration(duration.base)}
            style={[
              styles.float,
              {
                alignSelf: right ? 'flex-end' : 'flex-start',
                marginTop: scatter,
                marginRight: right ? -layout.screenX * 0.35 : 0,
                marginLeft: right ? 0 : -layout.screenX * 0.2,
                transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined,
              },
            ]}
          >
            <EditorialMedia
              mediaUrl={world.mediaUrl}
              accent={world.tint}
              height={shape === 'circle' ? 200 : 240}
              width={shape === 'circle' ? 200 : '72%'}
              radius={radius}
              shape={shape === 'circle' ? 'circle' : shape === 'film' ? 'film' : 'rect'}
              texture={texture}
              paper={personality === 'contact'}
              kicker={outside ? null : 'WORLD'}
              title={outside ? null : world.name}
              meta={outside ? null : meta}
              onPress={() => onEnter(world.creatorId)}
            />
            {outside ? (
              <View style={[styles.floatCopy, right ? styles.floatCopyRight : null]}>
                <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
                  {world.name}
                </Text>
                {meta ? (
                  <Text allowFontScaling={false} style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xl, paddingBottom: space.sm },
  lead: { gap: space.sm },
  leadBleed: {
    marginHorizontal: -layout.screenX,
  },
  leadCopy: { gap: 2, paddingHorizontal: 2 },
  kicker: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  leadName: {
    ...typeScale.display,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  cluster: {
    minHeight: 260,
    paddingBottom: space.md,
  },
  overlapPortrait: {
    position: 'absolute',
    right: 0,
    top: 72,
    zIndex: 2,
  },
  clusterCopy: {
    marginTop: space.md,
    gap: 2,
    maxWidth: '70%',
  },
  float: { gap: space.sm, maxWidth: '100%' },
  floatCopy: { gap: 2, paddingHorizontal: 2 },
  floatCopyRight: { alignItems: 'flex-end' },
  name: {
    ...typeScale.title,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  meta: { ...typeScale.meta, fontSize: 13, lineHeight: 17 },
});
