import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import {
  ArenaIcon,
  ArrowBigUpIcon,
  BookmarkIcon,
  CommentIcon,
} from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { ScribbleCircle, Squiggle } from '../shared/Doodles';
import { ArenaStackMedia } from './ArenaStackMedia';

export interface ArenaStackCardProps {
  take: Take;
  author: User;
  commentCount: number;
  isSaved: boolean;
  hasReacted: boolean;
  active: boolean;
  screenFocused: boolean;
  /** Stack depth — rear cards keep media visible, hide chrome. */
  depth?: number;
  onOpen: () => void;
  onReact: () => void;
  onComment: () => void;
  onClash: () => void;
  onSave: () => void;
}

/** Cinematic featured surface — media-first, text-first when no media. */
function ArenaStackCardBase({
  take,
  author,
  commentCount,
  isSaved,
  hasReacted,
  active,
  screenFocused,
  depth = 0,
  onOpen,
  onReact,
  onComment,
  onClash,
  onSave,
}: ArenaStackCardProps): React.JSX.Element {
  const t = useThemeColors();
  const media = take.media;
  const headline = take.text.trim();
  const front = depth === 0;
  const reduced = useReducedMotion();
  const saveScale = useSharedValue(1);
  const saveAnim = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: media ? '#0C0C10' : t.scheme === 'light' ? '#1A1714' : '#141418',
          shadowColor: t.shadowColor,
          shadowOpacity: front ? (t.scheme === 'light' ? 0.2 : 0.45) : 0.1,
          elevation: front ? 12 : 4,
        },
      ]}
      accessible={front}
      accessibilityRole="summary"
      accessibilityLabel={`Featured take by ${author.name} in ${HOOD_LABEL[take.hood]}. ${headline}`}
      accessibilityActions={front ? [{ name: 'activate', label: 'Open take' }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') onOpen();
      }}
    >
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open take" style={styles.fill}>
        {media ? (
          <ArenaStackMedia media={media} active={active && front} screenFocused={screenFocused} />
        ) : (
          <TextFirstSurface light={t.scheme === 'light'} />
        )}
        <LinearGradient
          colors={
            front
              ? ['transparent', 'rgba(8,8,11,0.28)', 'rgba(8,8,11,0.9)']
              : ['transparent', 'transparent', 'rgba(8,8,11,0.3)']
          }
          locations={[0.36, 0.6, 1]}
          style={styles.veil}
          pointerEvents="none"
        />
      </Pressable>

      {front ? (
        <>
          <Pressable
            onPress={() => {
              hapticTap();
              if (!reduced) {
                saveScale.value = withSequence(
                  withSpring(1.22, { damping: 10, stiffness: 420 }),
                  withSpring(1, { damping: 14, stiffness: 280 }),
                );
              }
              onSave();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSaved }}
            accessibilityLabel={isSaved ? 'Remove from saved' : 'Save take'}
            hitSlop={8}
            style={styles.saveBtn}
          >
            <Animated.View style={saveAnim}>
              <BookmarkIcon size={15} color="#FFFFFF" strokeWidth={isSaved ? 2.6 : 2} />
            </Animated.View>
          </Pressable>

          <View style={styles.meta} pointerEvents="box-none">
            <Text allowFontScaling={false} style={styles.hood} numberOfLines={1}>
              {HOOD_LABEL[take.hood]}
            </Text>
            <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open take">
              <Text allowFontScaling style={[styles.headline, !media && styles.headlineTextOnly]} numberOfLines={media ? 3 : 5}>
                {headline}
              </Text>
            </Pressable>
            <Text allowFontScaling={false} style={styles.byline} numberOfLines={1}>
              @{author.handle} · {timeAgo(take.createdAt)}
            </Text>

            <View style={styles.bottomRow}>
              <View style={styles.stats}>
                <Pressable
                  onPress={() => {
                    hapticTap();
                    onReact();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: hasReacted }}
                  accessibilityLabel="React"
                  style={styles.statBtn}
                >
                  <ArrowBigUpIcon size={15} color="#FFFFFF" strokeWidth={hasReacted ? 2.6 : 2.1} />
                  <Text allowFontScaling={false} style={styles.statText}>
                    {compact(take.reactions)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    hapticTap();
                    onComment();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open comments"
                  style={styles.statBtn}
                >
                  <CommentIcon size={14} color="#FFFFFF" strokeWidth={2.1} />
                  <Text allowFontScaling={false} style={styles.statText}>
                    {compact(commentCount)}
                  </Text>
                </Pressable>
              </View>

              <PressableScale
                onPress={() => {
                  hapticTap();
                  onClash();
                }}
                accessibilityRole="button"
                accessibilityLabel="Clash on this take"
                style={[styles.clash, { backgroundColor: t.clashFill }]}
              >
                <ArenaIcon size={12} color={t.clashText} strokeWidth={2.6} />
                <Text allowFontScaling={false} style={[styles.clashText, { color: t.clashText }]}>
                  CLASH
                </Text>
              </PressableScale>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Editorial text-only featured surface — abstract, no empty placeholder. */
function TextFirstSurface({ light }: { light: boolean }): React.JSX.Element {
  return (
    <View style={[styles.textSurface, { backgroundColor: light ? '#1C1916' : '#16161A' }]}>
      <LinearGradient
        colors={
          light
            ? ['rgba(201,169,106,0.22)', 'transparent', 'rgba(8,8,11,0.5)']
            : ['rgba(201,169,106,0.14)', 'transparent', 'rgba(0,0,0,0.45)']
        }
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScribbleCircle size={130} color="#C9A96A" opacity={0.22} style={styles.doodleCircle} />
      <Squiggle size={150} color="#FFFFFF" opacity={0.14} style={styles.doodleSquiggle} />
    </View>
  );
}

export const ArenaStackCard = React.memo(ArenaStackCardBase);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  fill: { ...StyleSheet.absoluteFillObject },
  veil: { ...StyleSheet.absoluteFillObject },
  saveBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,11,0.36)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  meta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    paddingBottom: space.md + 2,
    gap: 5,
  },
  hood: {
    ...typeScale.caption,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.88)',
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.55,
    color: '#FFFFFF',
  },
  headlineTextOnly: {
    fontSize: 26,
    lineHeight: 31,
  },
  byline: {
    ...typeScale.meta,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: 2,
  },
  stats: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexShrink: 1 },
  statBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  statText: { ...typeScale.meta, fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  clash: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  clashText: {
    ...typeScale.label,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  textSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  doodleCircle: { position: 'absolute', top: 36, right: 18 },
  doodleSquiggle: { position: 'absolute', top: '38%', left: 20 },
});
