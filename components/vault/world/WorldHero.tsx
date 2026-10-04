import React from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackIcon } from '../../shared/icons';
import { layout, space, useThemeColors } from '../../../theme';
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

/** Near-full-screen world entrance: cinematic media with a slow parallax + poster. */
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
  const height = Math.round(Math.min(width * 1.18, 560));
  const fallback = accent || (t.scheme === 'light' ? '#2C3340' : '#141418');
  const parallax = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scale: 1 }] };
    const offset = Math.max(0, Math.min(y.value, height)) * 0.28;
    return { transform: [{ translateY: offset }, { scale: 1.12 }] };
  });

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.bleed,
          {
            height,
            marginHorizontal: -layout.screenX,
            backgroundColor: fallback,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 18,
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
        <LinearGradient colors={['rgba(0,0,0,0.30)', 'transparent', 'rgba(0,0,0,0.86)']} style={StyleSheet.absoluteFill} />

        <Pressable
          onPress={() => {
            hapticTap();
            onBack();
          }}
          style={[styles.back, { top: insets.top + space.xs, left: layout.screenX }]}
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
          <WorldHeroPoster mediaUrl={posterUrl} label={posterLabel} accent={fallback} onPress={onPosterPress} />
        ) : null}
      </View>

      <WorldHeroMeta secondary={secondary} description={description} />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { gap: 0 },
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
});