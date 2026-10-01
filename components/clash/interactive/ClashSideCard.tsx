/**
 * Physical opposing Side Card — selectable, depth, restrained rotation.
 * Media dominates when present; typography is the hero for text-only.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Side, TakeMedia, User } from '../../../store';
import { radius, space, spring, typeScale, useThemeColors } from '../../../theme';
import { Avatar } from '../../shared/Avatar';
import { PressableScale } from '../../shared/PressableScale';
import { useDuelSurface } from './clashTheme';

export interface ClashSideCardProps {
  side: Side;
  author: User | null;
  text: string;
  media?: TakeMedia | null;
  emphasized?: boolean;
  diminished?: boolean;
  winner?: boolean;
  enterDelay?: number;
  rotationDeg?: number;
  /** Horizontal offset for asymmetric layout (px). */
  offsetX?: number;
  selectable?: boolean;
  onSelect?: () => void;
  pending?: boolean;
}

export function ClashSideCard({
  side,
  author,
  text,
  media = null,
  emphasized = false,
  diminished = false,
  winner = false,
  enterDelay = 0,
  rotationDeg = 0,
  offsetX = 0,
  selectable = false,
  onSelect,
  pending = false,
}: ClashSideCardProps): React.JSX.Element {
  const t = useThemeColors();
  const { tone, soft, line, selectedFill } = useDuelSurface(side);
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const weight = useSharedValue(emphasized ? 1 : diminished ? -1 : 0);
  const reveal = useSharedValue(author ? 1 : 0);
  const hidden = author === null;
  const hasImage = Boolean(media?.kind === 'image' && media.url);
  const mediaFirst = hasImage || Boolean(media && !media.url);

  React.useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    const id = setTimeout(() => {
      progress.value = withTiming(1, { duration: 480 });
    }, enterDelay);
    return () => clearTimeout(id);
  }, [enterDelay, progress, reduced]);

  React.useEffect(() => {
    weight.value = withSpring(emphasized ? 1 : diminished ? -1 : 0, spring.settle);
  }, [diminished, emphasized, weight]);

  React.useEffect(() => {
    if (reduced) {
      reveal.value = author ? 1 : 0;
      return;
    }
    reveal.value = withTiming(author ? 1 : 0, { duration: 420 });
  }, [author, reduced, reveal]);

  const cardStyle = useAnimatedStyle(() => {
    const w = weight.value;
    return {
      opacity: progress.value * (1 - Math.max(0, -w) * 0.42),
      transform: [
        { translateY: (1 - progress.value) * 18 + (diminished ? 6 : 0) - (emphasized ? 4 : 0) },
        { translateX: offsetX + w * (side === 'A' ? -8 : 8) },
        { scale: 1 + w * 0.035 - Math.max(0, -w) * 0.045 },
        { rotate: `${rotationDeg + w * (side === 'A' ? -0.8 : 0.8)}deg` },
      ],
    };
  });

  const identityStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + reveal.value * 0.6,
  }));

  const head = (
    <View style={styles.head}>
      <Text
        allowFontScaling={false}
        style={[styles.sideLabel, { color: mediaFirst ? '#F5F2EC' : tone }]}
      >
        Side {side}
      </Text>
      {winner ? (
        <Text allowFontScaling={false} style={[styles.winner, { color: mediaFirst ? '#F5F2EC' : tone }]}>
          Wins
        </Text>
      ) : pending ? (
        <Text
          allowFontScaling={false}
          style={[styles.pending, { color: mediaFirst ? 'rgba(245,242,236,0.7)' : t.textMuted }]}
        >
          Submitting…
        </Text>
      ) : selectable ? (
        <Text
          allowFontScaling={false}
          style={[styles.hint, { color: mediaFirst ? 'rgba(245,242,236,0.65)' : t.textMuted }]}
        >
          Tap to judge
        </Text>
      ) : null}
    </View>
  );

  const identity = (
    <Animated.View style={identityStyle}>
      {hidden ? (
        <Text
          allowFontScaling={false}
          style={[
            styles.hiddenName,
            { color: mediaFirst ? 'rgba(245,242,236,0.85)' : t.textSecondary },
          ]}
        >
          Participant {side}
        </Text>
      ) : (
        <View style={styles.identity}>
          <Avatar name={author.name} tint={author.tint} size={34} />
          <Text
            allowFontScaling={false}
            style={[styles.handle, { color: mediaFirst ? '#FAFAF8' : t.textPrimary }]}
            numberOfLines={1}
          >
            @{author.handle}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  const statement = (
    <Text
      allowFontScaling
      style={[
        mediaFirst ? styles.textOnMedia : styles.text,
        { color: mediaFirst ? '#FAFAF8' : t.textPrimary },
      ]}
    >
      {text}
    </Text>
  );

  const body = (
    <Animated.View
      style={[
        styles.card,
        mediaFirst ? styles.cardMedia : null,
        {
          borderColor: winner || emphasized ? tone : line,
          backgroundColor: emphasized ? selectedFill : soft,
          borderLeftColor: tone,
          shadowColor: t.shadowColor,
          shadowOpacity: emphasized || selectable ? t.shadowOpacity * 1.2 : t.shadowOpacity * 0.5,
          shadowRadius: emphasized ? 16 : 10,
          shadowOffset: { width: 0, height: emphasized ? 10 : 6 },
          elevation: emphasized ? 6 : 2,
          opacity: pending ? 0.85 : 1,
          overflow: 'hidden',
        },
        cardStyle,
      ]}
    >
      {mediaFirst ? (
        <>
          {hasImage ? (
            <Image
              source={{ uri: media!.url as string }}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : media ? (
            <LinearGradient
              colors={media.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <LinearGradient
            colors={['rgba(8,8,11,0.15)', 'rgba(8,8,11,0.78)']}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.mediaContent}>
            {head}
            {identity}
            {statement}
          </View>
        </>
      ) : (
        <>
          {head}
          {identity}
          {statement}
        </>
      )}
    </Animated.View>
  );

  if (selectable && onSelect) {
    return (
      <PressableScale
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel={
          hidden
            ? `Judge Side ${side}. Participant identities hidden. ${text}`
            : `Judge Side ${side}${author ? `, ${author.handle}` : ''}. ${text}`
        }
      >
        {body}
      </PressableScale>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    minHeight: 148,
  },
  cardMedia: {
    minHeight: 220,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  mediaContent: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: space.sm,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    minHeight: 220,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sideLabel: { ...typeScale.caption, letterSpacing: 0.8, fontWeight: '700', fontSize: 11 },
  winner: { ...typeScale.caption, letterSpacing: 0.4, fontWeight: '700', fontSize: 11 },
  hint: { ...typeScale.caption },
  pending: { ...typeScale.caption, fontWeight: '600' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  handle: { ...typeScale.label, flexShrink: 1, fontWeight: '600' },
  hiddenName: { ...typeScale.label },
  text: { ...typeScale.takeText, fontSize: 19, lineHeight: 28, letterSpacing: -0.2 },
  textOnMedia: {
    ...typeScale.takeText,
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: -0.2,
    fontWeight: '600',
  },
});
