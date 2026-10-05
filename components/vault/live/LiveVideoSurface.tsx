import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface LiveVideoSurfaceProps {
  /** A real, playable stream URL (never a poster pretending to be video). */
  url: string;
  accessibilityLabel: string;
}

/**
 * Muted-by-default live surface.
 *
 * Lifecycle follows the repo's expo-video contract: `useVideoPlayer` owns
 * release on unmount, so cleanup never pauses or releases the shared object.
 */
export function LiveVideoSurface({
  url,
  accessibilityLabel,
}: LiveVideoSurfaceProps): React.JSX.Element {
  const t = useThemeColors();
  const [muted, setMuted] = React.useState(true);
  const mounted = React.useRef(true);

  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!mounted.current) return;
    player.muted = muted;
  }, [muted, player]);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !mounted.current) return;
      player.play();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // No player.pause() here: unmount releases the player first.
    };
  }, [player]);

  return (
    <View style={styles.wrap}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        accessibilityLabel={accessibilityLabel}
      />
      <Pressable
        onPress={() => {
          hapticTap();
          if (mounted.current) setMuted((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute live sound' : 'Mute live sound'}
        style={[styles.chip, { backgroundColor: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,255,255,0.25)' }]}
      >
        <Text allowFontScaling={false} style={[styles.chipLabel, { color: t.textInverse }]}>
          {muted ? 'UNMUTE' : 'MUTE'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  video: { width: '100%', height: '100%', backgroundColor: '#000' },
  chip: {
    position: 'absolute',
    right: layout.screenX,
    bottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
