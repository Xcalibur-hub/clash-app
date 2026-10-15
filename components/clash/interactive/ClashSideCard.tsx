/**
 * Physical opposing Side Card — selectable, depth, restrained rotation.
 * Opinion typography is the hero; side tint is a quiet edge cue.
 */
import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
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
import { PlayIcon } from '../../shared/icons';
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
  const { tone } = useDuelSurface(side);
  const dark = t.scheme === 'dark';
  const soft = side === 'A'
    ? (dark ? '#47345E' : '#E7D7FF')
    : (dark ? '#623F47' : '#FFD1B8');
  const selectedFill = side === 'A'
    ? (dark ? '#624580' : '#D5B8FF')
    : (dark ? '#7A4B4B' : '#FFB996');
  const editorialInk = dark ? '#FFF7F1' : '#251D2A';
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  const weight = useSharedValue(emphasized ? 1 : diminished ? -1 : 0);
  const reveal = useSharedValue(author ? 1 : 0);
  const pressPulse = useSharedValue(1);
  const hidden = author === null;
  const hasImage = Boolean(
    (media?.kind === 'image' || media?.kind === 'gif') && media.url,
  );
  const hasVideo = Boolean(media?.kind === 'video' && media.url);
  const mediaFirst = hasImage || hasVideo || Boolean(media && !media.url);

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
  const bodyColor = onMedia ? '#FAFAF8' : editorialInk;
  const metaColor = onMedia ? 'rgba(245,242,236,0.62)' : (dark ? '#E3D1E7' : '#675466');

  const head = (
    <View style={styles.head}>
      <Text allowFontScaling={false} style={[styles.sideLabel, { color: labelColor }]}>
        {side === 'A' ? '01  ·  SIDE A' : '02  ·  SIDE B'}
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
          TAP TO VOTE ↗
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
          borderColor: winner || emphasized ? tone : 'transparent',
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
          ) : hasVideo ? (
            <View style={[StyleSheet.absoluteFill, styles.videoPlate]}>
              <PlayIcon size={28} color="#FAFAF8" strokeWidth={2.4} />
            </View>
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
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderRadius: 26,
    borderWidth: 2,
    borderLeftWidth: 5,
    minHeight: 206,
  },
  cardMedia: {
    minHeight: 228,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  videoPlate: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121214',
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
    letterSpacing: 1.3,
    fontWeight: '900',
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
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 26,
    lineHeight: 33,
    letterSpacing: -0.8,
    fontWeight: '800',
  },
  textOnMedia: {
    ...typeScale.takeText,
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: -0.2,
    fontWeight: '600',
  },
});
