import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { DigitalStageCopy } from '../../../utils/digitalCreatorState';
import { personalityRadius, type WorldPersonality } from '../../../utils/vaultWorldPersonality';
import { radius, space, typeScale, useThemeColors } from '../../../theme';

export interface DigitalCreatorStageProps {
  copy: DigitalStageCopy;
  artworkUrl: string | null;
  tint: string | null;
  /** Rendered by the authorized provider — never a fixture dressed as video. */
  videoUrl: string | null;
  audioUrl: string | null;
  busy: boolean;
  personality: WorldPersonality;
}

/**
 * The digital stage: it dominates the room on purpose.
 *
 * A provider clip is only mounted while a clip actually exists; otherwise the
 * creator's own portrait stands in as a placeholder that says so. Nothing here
 * ever renders a poster as if it were generated video.
 */
function StageClip({ url }: { url: string }): React.JSX.Element {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="cover"
      nativeControls={false}
      accessibilityLabel="Rendered digital version clip"
    />
  );
}

export function DigitalCreatorStage({
  copy,
  artworkUrl,
  tint,
  videoUrl,
  audioUrl,
  busy,
  personality,
}: DigitalCreatorStageProps): React.JSX.Element {
  const t = useThemeColors();
  const corner = personalityRadius(personality);

  return (
    <View
      style={[styles.stage, { borderColor: t.border, borderRadius: corner }]}
      accessibilityRole="image"
      accessibilityLabel={`${copy.kicker}. ${copy.note}`}
    >
      {videoUrl ? (
        <StageClip url={videoUrl} />
      ) : artworkUrl ? (
        <Image source={{ uri: artworkUrl }} style={styles.media} />
      ) : (
        <View style={[styles.media, { backgroundColor: tint ?? t.surfaceMuted }]} />
      )}

      <View style={styles.overlayTop}>
        <View style={[styles.plate, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text allowFontScaling={false} style={[styles.plateText, { color: t.textPrimary }]}>
            {copy.kicker}
          </Text>
        </View>
      </View>

      <View style={styles.overlayBottom}>
        <Text allowFontScaling={false} style={[styles.headline, { color: t.textPrimary }]}>
          {copy.headline.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={[styles.note, { color: t.textSecondary }]}>
          {copy.note}
        </Text>
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={t.textPrimary} />
          </View>
        ) : null}
        {audioUrl ? (
          <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
            Speaking now.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    aspectRatio: 3 / 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
  },
  media: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  overlayTop: { position: 'absolute', top: space.sm, left: space.sm, right: space.sm },
  plate: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  plateText: { ...typeScale.caption, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  overlayBottom: { padding: space.md, gap: 3 },
  headline: { ...typeScale.display, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  note: { ...typeScale.meta, fontSize: 12, lineHeight: 17 },
  busy: { paddingTop: space.xs, alignSelf: 'flex-start' },
});
