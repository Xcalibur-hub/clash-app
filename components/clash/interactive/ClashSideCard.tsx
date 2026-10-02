/**
 * Physical opposing Side Card — selectable, depth, restrained rotation.
 * Opinion typography is the hero; side tint is a quiet edge cue.
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
import { duration, radius, space, spring, typeScale, useThemeColors } from '../../../theme';
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
  const pressPulse = useSharedValue(1);
  const hidden = author === null;
  const hasImage = Boolean(media?.kind === 'image' && media.url);
  const mediaFirst = hasImage || Boolean(media && !media.url);

  React.useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    const id = setTimeout(() => {
      progress.value = withTiming(1, { duration: duration.cinematic });
    }, enterDelay);
    return () => clearTimeout(id);
  }, [enterDelay, progress, reduced]);

  React.useEffect(() => {
    weight.value = withSpring(emphasized ? 1 : diminished ? -1 : 0, {
      ...spring.settle,
      stiffness: 240,
      damping: 20,
    });
    if (emphasized && !reduced) {
      pressPulse.value = withSpring(1, spring.press);
    }
  }, [diminished, emphasized, pressPulse, reduced, weight]);

  React.useEffect(() => {
    if (reduced) {
      reveal.value = author ? 1 : 0;
      return;
    }
    reveal.value = withTiming(author ? 1 : 0, { duration: duration.cinematic });
  }, [author, reduced, reveal]);

  const cardStyle = useAnimatedStyle(() => {
    const w = weight.value;
    return {
      opacity: progress.value * (1 - Math.max(0, -w) * 0.38),
      transform: [
        { translateY: (1 - progress.value) * 16 + (diminished ? 8 : 0) - w * 6 },
        { translateX: offsetX + w * (side === 'A' ? -6 : 6) },
        { scale: (1 + w * 0.04 - Math.max(0, -w) * 0.05) * pressPulse.value },
        {
          rotate: `${rotationDeg * (1 - Math.max(0, w) * 0.55) + w * (side === 'A' ? -0.4 : 0.4)}deg`,
        },
      ],
    };
  });

  const identityStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + reveal.value * 0.55,
  }));

  const onMedia = mediaFirst;
  const labelColor = onMedia ? 'rgba(245,242,236,0.78)' : tone;
  const bodyColor = onMedia ? '#FAFAF8' : t.textPrimary;
  const metaColor = onMedia ? 'rgba(245,242,236,0.62)' : t.textMuted;

  const head = (
    <View style={styles.head}>
      <Text allowFontScaling={false} style={[styles.sideLabel, { color: labelColor }]}>
        Side {side}
      </Text>
      {winner ? (
        <Text allowFontScaling={false} style={[styles.winner, { color: labelColor }]}>
          Wins
        </Text>
      ) : pending ? (
        <Text allowFontScaling={false} style={[styles.pending, { color: metaColor }]}>
          Locking…
        </Text>
      ) : selectable ? (
        <Text allowFontScaling={false} style={[styles.hint, { color: metaColor }]}>
          Tap to judge
        </Text>
      ) : null}
    </View>
  );

  const identity = (
    <Animated.View style={identityStyle}>
      {hidden ? (
        <Text allowFontScaling={false} style={[styles.hiddenName, { color: onMedia ? 'rgba(245,242,236,0.8)' : t.textSecondary }]}>
          Participant {side}
        </Text>
      ) : (
        <View style={styles.identity}>
          <Avatar name={author.name} tint={author.tint} size={32} />
          <Text
            allowFontScaling={false}
            style={[styles.handle, { color: bodyColor }]}
            numberOfLines={1}
          >
            @{author.handle}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  const statement = (
    <Text allowFontScaling style={[onMedia ? styles.textOnMedia : styles.text, { color: bodyColor }]}>
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
          shadowOpacity:
            emphasized || selectable ? Math.min(0.28, t.shadowOpacity * 1.35) : t.shadowOpacity * 0.45,
          shadowRadius: emphasized ? 18 : 12,
          shadowOffset: { width: 0, height: emphasized ? 12 : 7 },
          elevation: emphasized ? 7 : selectable ? 3 : 2,
          opacity: pending ? 0.88 : 1,
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
            colors={['rgba(8,8,11,0.12)', 'rgba(8,8,11,0.82)']}
            locations={[0.32, 1]}
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
    paddingVertical: space.lg + 2,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    minHeight: 156,
  },
  cardMedia: {
    minHeight: 228,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  mediaContent: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: space.sm,
    paddingVertical: space.lg + 2,
    paddingHorizontal: space.md + 2,
    minHeight: 228,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sideLabel: {
    ...typeScale.caption,
    letterSpacing: 0.6,
    fontWeight: '600',
    fontSize: 11,
  },
  winner: { ...typeScale.caption, letterSpacing: 0.3, fontWeight: '700', fontSize: 11 },
  hint: { ...typeScale.caption, fontSize: 12 },
  pending: { ...typeScale.caption, fontWeight: '600' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  handle: { ...typeScale.label, flexShrink: 1, fontWeight: '600' },
  hiddenName: { ...typeScale.label },
  text: {
    ...typeScale.takeText,
    fontSize: 20,
    lineHeight: 29,
    letterSpacing: -0.25,
    fontWeight: '600',
  },
  textOnMedia: {
    ...typeScale.takeText,
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: -0.2,
    fontWeight: '600',
  },
});
