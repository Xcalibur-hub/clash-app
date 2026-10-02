import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { ink } from '../../theme';
import { resolveStillUrl } from '../../utils/mediaStill';
import { tap as hapticTap } from '../../utils/haptics';
import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from '../shared/icons';

export interface ArenaStackMediaProps {
  media: TakeMediaModel;
  /** Only the front card may play video. */
  active: boolean;
  /** Screen-level focus gate (pause when Arena is not focused). */
  screenFocused: boolean;
}

/**
 * Featured-stack media plane.
 * Images load immediately; videos stay on poster until the card is active,
 * then muted autoplay after a short delay. At most one player is mounted.
 *
 * Player lifecycle: `useVideoPlayer` owns release on unmount. Never call
 * pause/play/release from an effect cleanup that can run after that release
 * (React runs the hook's release cleanup before later sibling cleanups).
 */
export function ArenaStackMedia({
  media,
  active,
  screenFocused,
}: ArenaStackMediaProps): React.JSX.Element {
  const isVideo = media.kind === 'video';
  const hasUrl = Boolean(media.url);
  const canPlay = isVideo && hasUrl && active;
  const showPlayer = canPlay;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {showPlayer ? (
        <ActiveVideo
          url={media.url as string}
          colors={media.colors}
          screenFocused={screenFocused}
        />
      ) : (
        <Poster media={media} showPlay={isVideo} />
      )}
    </View>
  );
}

function Poster({
  media,
  showPlay,
}: {
  media: TakeMediaModel;
  showPlay: boolean;
}): React.JSX.Element {
  const imageUrl = resolveStillUrl(media);
  return (
    <View style={StyleSheet.absoluteFill}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={media.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {showPlay ? (
        <View style={styles.playCenter} pointerEvents="none">
          <View style={styles.playChip}>
            <PlayIcon size={22} color={ink.primary} strokeWidth={2.4} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActiveVideo({
  url,
  colors,
  screenFocused,
}: {
  url: string;
  colors: TakeMediaModel['colors'];
  screenFocused: boolean;
}): React.JSX.Element {
  const focused = useIsFocused();
  const shouldPlay = screenFocused && focused;
  const [muted, setMuted] = React.useState(true);
  const [playing, setPlaying] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  /** False only after this instance's unmount path has begun. */
  const mountedRef = React.useRef(true);

  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!mountedRef.current) return;
    player.muted = muted;
  }, [muted, player]);

  React.useEffect(() => {
    if (!shouldPlay) {
      // Still mounted — safe. Pause here instead of in cleanup so unmount
      // never touches a player that useVideoPlayer already released.
      player.pause();
      setPlaying(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !mountedRef.current) return;
      player.play();
      setPlaying(true);
      setReady(true);
    }, 380);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Intentionally no player.pause() — on unmount useVideoPlayer releases
      // first; pausing here throws "shared object already released".
    };
  }, [shouldPlay, player]);

  const togglePlay = (): void => {
    if (!mountedRef.current) return;
    hapticTap();
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
      setReady(true);
    }
  };

  const toggleMute = (): void => {
    hapticTap();
    setMuted((m) => !m);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <Pressable
        onPress={togglePlay}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause video' : 'Play video'}
        style={StyleSheet.absoluteFill}
      />
      {!ready || !playing ? (
        <View style={styles.playCenter} pointerEvents="none">
          <View style={styles.playChip}>
            {playing ? (
              <PauseIcon size={22} color={ink.primary} strokeWidth={2.4} />
            ) : (
              <PlayIcon size={22} color={ink.primary} strokeWidth={2.4} />
            )}
          </View>
        </View>
      ) : null}
      <Pressable
        onPress={toggleMute}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
        hitSlop={8}
        style={styles.muteBtn}
      >
        {muted ? (
          <VolumeXIcon size={14} color={ink.primary} strokeWidth={2.2} />
        ) : (
          <Volume2Icon size={14} color={ink.primary} strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C0C10',
  },
  playCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  muteBtn: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
