import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { TakeMedia as TakeMediaModel } from '../../store';
import { ink } from '../../theme';
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
  const imageUrl = media.kind === 'image' && media.url ? media.url : undefined;
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

  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  React.useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  React.useEffect(() => {
    if (!shouldPlay) {
      player.pause();
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      try {
        player.play();
        setPlaying(true);
        setReady(true);
      } catch {
        /* playback is best-effort on slow networks */
      }
    }, 380);
    return () => {
      clearTimeout(timer);
      player.pause();
      setPlaying(false);
    };
  }, [shouldPlay, player]);

  const togglePlay = (): void => {
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
          <VolumeXIcon size={16} color={ink.primary} strokeWidth={2.2} />
        ) : (
          <Volume2Icon size={16} color={ink.primary} strokeWidth={2.2} />
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
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  muteBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
