import React from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon } from '../../shared/icons';
import { duration, layout, space, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { WorldHeroCopy } from './WorldHeroCopy';
import { WorldHeroMeta } from './WorldHeroMeta';
import { WorldHeroPoster } from './WorldHeroPoster';

const AnimatedImage = Animated.createAnimatedComponent(Image);

export interface WorldHeroProps {
  creatorName: string;
  identity: string;
  accent: string | null;
  heroUrl?: string | null;
  posterUrl?: string | null;
  posterLabel?: string | null;
  onPosterPress?: () => void;
  eyebrow?: string;
  secondary?: string | null;
  description?: string | null;
  following: boolean;
  isSelf: boolean;
  subscribed: boolean;
  onToggleFollow?: () => void;
  onSubscribe?: () => void;
  onManage?: () => void;
  onBack: () => void;
  topInset: number;
  scrollY?: SharedValue<number>;
}

/** Near-full-bleed album/film opener — parallax media + overlapping poster. */
export function WorldHero({
  creatorName,
  identity,
  accent,
  heroUrl,
  posterUrl,
  posterLabel,
  onPosterPress,
  eyebrow = 'CREATOR WORLD',
  secondary,
  description,
  following,
  isSelf,
  subscribed,
  onToggleFollow,
  onSubscribe,
  onManage,
  onBack,
  topInset,
  scrollY,
}: WorldHeroProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const fallbackScroll = useSharedValue(0);
  const y = scrollY ?? fallbackScroll;
  const height = Math.round(Math.min(width * 1.22, 580));
  const fallback = accent || (t.scheme === 'light' ? '#2C3340' : '#141418');
  const parallax = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scale: 1 }] };
    const offset = Math.max(0, Math.min(y.value, height)) * 0.28;
    return { transform: [{ translateY: offset }, { scale: 1.14 }] };
  });
  const posterEnter = reduced ? undefined : FadeInUp.delay(90).duration(duration.base);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.bleed,
          {
            height,
            marginHorizontal: -layout.screenX,
            backgroundColor: fallback,
          },
        ]}
      >
        {heroUrl ? (
          <AnimatedImage source={{ uri: heroUrl }} style={[StyleSheet.absoluteFill, parallax]} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[fallback, t.scheme === 'light' ? '#D8D2C8' : '#0E0E12']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.88)']}
          style={StyleSheet.absoluteFill}
        />

        <Pressable
          onPress={() => {
            hapticTap();
            onBack();
          }}
          style={[styles.back, { top: Math.max(insets.top, topInset) + space.xs, left: layout.screenX }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackIcon size={18} color="#FAFAF8" strokeWidth={2.2} />
        </Pressable>

        <WorldHeroCopy
          eyebrow={eyebrow}
          creatorName={creatorName}
          identity={identity}
          following={following}
          isSelf={isSelf}
          subscribed={subscribed}
          onToggleFollow={onToggleFollow}
          onSubscribe={onSubscribe}
          onManage={onManage}
        />

        {posterUrl ? (
          <Animated.View entering={posterEnter} style={styles.posterSlot}>
            <WorldHeroPoster mediaUrl={posterUrl} label={posterLabel} accent={fallback} onPress={onPosterPress} />
          </Animated.View>
        ) : null}
      </View>

      <WorldHeroMeta secondary={secondary} description={description} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0, marginBottom: space.sm },
  bleed: { justifyContent: 'flex-end', overflow: 'hidden' },
  back: {
    position: 'absolute',
    zIndex: 3,
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.42)',
  },
  posterSlot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
  },
});
