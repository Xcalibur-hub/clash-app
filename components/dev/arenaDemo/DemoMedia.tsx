import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useThemeColors } from '../../../theme';
import type { DemoMediaKind } from './model';

/** Locally drawn illustrations: no remote URLs, uploads, picker permissions or codecs. */
export function DemoMedia({ kind, compact = false, passive = false, onOpen }: { kind: DemoMediaKind; compact?: boolean; passive?: boolean; onOpen?: () => void }): React.JSX.Element {
  const t = useThemeColors(), reduced = useReducedMotion(), progress = useSharedValue(0);
  const [playing, setPlaying] = React.useState(false);
  const animate = !reduced && process.env.EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION !== '1';
  React.useEffect(() => {
    if (animate && (kind === 'gif' || playing)) progress.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
    else progress.value = 0;
    return () => cancelAnimation(progress);
  }, [animate, kind, playing, progress]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 28 }] }));
  return <View style={[styles.frame, { height: compact ? 116 : 184, backgroundColor: t.scheme === 'dark' ? '#202A32' : '#DFE9EB' }]}>
    <Svg width="100%" height="100%" viewBox="0 0 360 184" accessibilityLabel={`DEMO ${kind} illustration`}>
      <Rect width="360" height="184" fill={t.scheme === 'dark' ? '#202A32' : '#DFE9EB'} />
      <Circle cx="277" cy="44" r="24" fill="#C8B894" />
      <Path d="M0 152L80 52L154 145L223 83L360 177V184H0Z" fill="#6C8989" />
      <Path d="M0 172L122 122L224 170L360 123V184H0Z" fill="#3C626A" />
      <Path d="M142 184L202 142L235 153L210 184Z" fill="#B0CED4" />
    </Svg>
    {kind !== 'image' ? <Animated.View pointerEvents="none" style={[styles.spark, motion]}><Text style={{ fontSize: 28 }}>{kind === 'gif' ? '✦' : '◉'}</Text></Animated.View> : null}
    {passive ? <View style={styles.caption}><Text style={styles.label}>{kind.toUpperCase()} preview · DEMO · Open Take to explore</Text></View> : <Pressable accessibilityRole="button" accessibilityLabel={onOpen ? `Open demo ${kind} preview` : kind === 'video' ? 'Toggle simulated demo clip' : 'Demo media information'}
      onPress={event => { event.stopPropagation(); if (onOpen) onOpen(); else setPlaying(value => !value); }} style={styles.caption}>
      <Text style={styles.label}>{kind === 'video' ? playing ? 'Ⅱ Pause simulated clip' : '▶ Simulated clip' : kind === 'gif' ? 'GIF · Local animation' : 'Local illustration'} · DEMO</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({ frame: { overflow: 'hidden', borderRadius: 12, justifyContent: 'center' }, caption: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.7)' }, label: { color: '#fff', fontSize: 12 }, spark: { position: 'absolute', left: '38%', top: '30%' } });
