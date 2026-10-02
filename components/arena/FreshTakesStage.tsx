import React from 'react';
import {
  AccessibilityInfo,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import {
  arenaAccentForHood,
  layout,
  pulseAccent,
  space,
  spring,
  typeScale,
  useThemeColors,
} from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { pulseLabel, takePulse } from '../../utils/takePulse';
import { ArenaStackProgress } from './ArenaStackProgress';
import { FreshTakeCard, type FreshTakeVariant } from './FreshTakeCard';

export interface FreshTakeEntry {
  take: Take;
  author: User;
  commentCount: number;
  hasReacted: boolean;
  isSaved: boolean;
}

/** Editorial horizontal stage — distinct from Today's Arena physical stack. */
const ACTIVE_W = 0.86;
const PEEK_W = 0.68;
const STAGE_H = 392;
const SWIPE_RATIO = 0.2;
const VELOCITY = 620;
const MAX_ROTATE = 2.8;

export interface FreshTakesStageProps {
  items: FreshTakeEntry[];
  now: number;
  onOpen: (takeId: string) => void;
  onClash: (takeId: string) => void;
  onReact: (take: Take) => void;
  onSave: (takeId: string) => void;
  onShare: (take: Take, handle: string) => void;
  onMore: (take: Take) => void;
}

/**
 * Browse Fresh Takes left/right — magazine story shift, not discard voting.
 * Reuses FreshTakeCard for the active surface; peeks stay light summaries.
 */
export function FreshTakesStage({
  items,
  now,
  onOpen,
  onClash,
  onReact,
  onSave,
  onShare,
  onMore,
}: FreshTakesStageProps): React.JSX.Element | null {
  const { width: windowWidth } = useWindowDimensions();
  const activeW = Math.round(windowWidth * ACTIVE_W);
  const peekW = Math.round(windowWidth * PEEK_W);
  const stageWidth = windowWidth;
  const reduced = useReducedMotion();
  const t = useThemeColors();

  const [index, setIndex] = React.useState(0);
  const indexSV = useSharedValue(0);
  const dragX = useSharedValue(0);
  const animating = useSharedValue(0);
  const itemCount = items.length;
  const itemKey = React.useMemo(() => items.map((item) => item.take.id).join('|'), [items]);

  React.useEffect(() => {
    setIndex(0);
    indexSV.value = 0;
    dragX.value = 0;
  }, [itemKey, dragX, indexSV]);

  React.useEffect(() => {
    if (index >= itemCount && itemCount > 0) {
      const next = itemCount - 1;
      setIndex(next);
      indexSV.value = next;
    }
  }, [index, indexSV, itemCount]);

  const goTo = React.useCallback(
    (next: number): void => {
      if (itemCount === 0) return;
      const clamped = Math.max(0, Math.min(itemCount - 1, next));
      indexSV.value = clamped;
      setIndex(clamped);
      hapticTap();
    },
    [indexSV, itemCount],
  );

  const finishSwipe = React.useCallback(
    (direction: 1 | -1): void => {
      const next = indexSV.value + direction;
      if (next < 0 || next >= itemCount) {
        dragX.value = withSpring(0, spring.settle);
        animating.value = 0;
        return;
      }
      const fly = direction * (activeW * 1.08);
      dragX.value = withSpring(fly, { damping: 24, stiffness: 185, mass: 0.85 }, (done) => {
        if (done) {
          runOnJS(goTo)(next);
          dragX.value = 0;
          animating.value = 0;
        }
      });
    },
    [activeW, animating, dragX, goTo, indexSV, itemCount],
  );

  const cancelSwipe = React.useCallback((): void => {
    dragX.value = withSpring(0, spring.settle);
    animating.value = 0;
  }, [animating, dragX]);

  // Fail vertical early so Arena FlatList keeps scrolling reliably.
  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduced && itemCount > 1)
        .activeOffsetX([-14, 14])
        .failOffsetY([-18, 18])
        .onBegin(() => {
          animating.value = 0;
        })
        .onUpdate((event) => {
          if (animating.value === 1) return;
          const atStart = indexSV.value === 0 && event.translationX > 0;
          const atEnd = indexSV.value === itemCount - 1 && event.translationX < 0;
          const damp = atStart || atEnd ? 0.28 : 1;
          dragX.value = event.translationX * damp;
        })
        .onEnd((event) => {
          if (animating.value === 1) return;
          const threshold = activeW * SWIPE_RATIO;
          const shouldNext = event.translationX < -threshold || event.velocityX < -VELOCITY;
          const shouldPrev = event.translationX > threshold || event.velocityX > VELOCITY;
          if (shouldNext && indexSV.value < itemCount - 1) {
            animating.value = 1;
            runOnJS(finishSwipe)(1);
          } else if (shouldPrev && indexSV.value > 0) {
            animating.value = 1;
            runOnJS(finishSwipe)(-1);
          } else {
            runOnJS(cancelSwipe)();
          }
        }),
    [activeW, animating, cancelSwipe, dragX, finishSwipe, indexSV, itemCount, reduced],
  );

  const announce = React.useCallback((label: string): void => {
    AccessibilityInfo.announceForAccessibility(label);
  }, []);

  if (items.length === 0) return null;

  const single = items.length === 1;
  // Mount only prev / active / next for media cost.
  const slots: number[] = [];
  if (index > 0) slots.push(index - 1);
  slots.push(index);
  if (index < items.length - 1) slots.push(index + 1);
  // Paint back-to-front: prev, next, then active on top.
  const paintOrder = [...slots].sort((a, b) => {
    const da = Math.abs(a - index);
    const db = Math.abs(b - index);
    if (da !== db) return db - da;
    return a - b;
  });

  return (
    <View
      accessibilityLabel={`Fresh Takes, card ${index + 1} of ${items.length}`}
      accessibilityActions={[
        ...(index > 0 ? [{ name: 'decrement' as const, label: 'Previous fresh take' }] : []),
        ...(index < items.length - 1
          ? [{ name: 'increment' as const, label: 'Next fresh take' }]
          : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'decrement' && index > 0) {
          goTo(index - 1);
          announce(`Previous fresh take, ${index} of ${items.length}`);
        }
        if (event.nativeEvent.actionName === 'increment' && index < items.length - 1) {
          goTo(index + 1);
          announce(`Next fresh take, ${index + 2} of ${items.length}`);
        }
      }}
    >
      <GestureDetector gesture={pan}>
        <View style={[styles.stage, { width: stageWidth, height: STAGE_H }]}>
          {paintOrder.map((slotIndex) => {
            const offset = slotIndex - index;
            const entry = items[slotIndex];
            if (!entry) return null;
            const active = offset === 0;
            return (
              <StageLayer
                key={entry.take.id}
                offset={offset}
                dragX={dragX}
                reduced={Boolean(reduced)}
                activeW={activeW}
                peekW={peekW}
                stageWidth={stageWidth}
                single={single}
              >
                {active ? (
                  <FreshTakeCard
                    take={entry.take}
                    author={entry.author}
                    commentCount={entry.commentCount}
                    hasReacted={entry.hasReacted}
                    isSaved={entry.isSaved}
                    variant={activeVariant(entry.take)}
                    index={slotIndex}
                    now={now}
                    embedded
                    onOpen={() => onOpen(entry.take.id)}
                    onClash={() => onClash(entry.take.id)}
                    onReact={() => onReact(entry.take)}
                    onSave={() => onSave(entry.take.id)}
                    onShare={() => onShare(entry.take, entry.author.handle)}
                    onMore={() => onMore(entry.take)}
                  />
                ) : (
                  <FreshTakePeek
                    entry={entry}
                    now={now}
                    onPress={() => goTo(slotIndex)}
                  />
                )}
              </StageLayer>
            );
          })}
        </View>
      </GestureDetector>

      <ArenaStackProgress index={index} total={items.length} />

      {items.length > 1 && reduced ? (
        <View style={styles.tapNav}>
          <Pressable
            disabled={index <= 0}
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous fresh take"
            style={[styles.tapHit, { opacity: index <= 0 ? 0.35 : 1 }]}
          >
            <Text allowFontScaling={false} style={[styles.tapLabel, { color: t.textSecondary }]}>
              Previous
            </Text>
          </Pressable>
          <Pressable
            disabled={index >= items.length - 1}
            onPress={() => goTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Next fresh take"
            style={[styles.tapHit, { opacity: index >= items.length - 1 ? 0.35 : 1 }]}
          >
            <Text allowFontScaling={false} style={[styles.tapLabel, { color: t.textSecondary }]}>
              Next
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function activeVariant(take: Take): FreshTakeVariant {
  if (take.clashes > 0) return 'clash';
  if (take.media?.url) return 'lead';
  return 'lead';
}

function StageLayer({
  children,
  offset,
  dragX,
  reduced,
  activeW,
  peekW,
  stageWidth,
  single,
}: {
  children: React.ReactNode;
  offset: number;
  dragX: SharedValue<number>;
  reduced: boolean;
  activeW: number;
  peekW: number;
  stageWidth: number;
  single: boolean;
}): React.JSX.Element {
  const idle = useSharedValue(0);

  React.useEffect(() => {
    if (reduced || single || offset === 0) {
      idle.value = 0;
      return;
    }
    idle.value = withRepeat(
      withTiming(offset > 0 ? 1 : -1, {
        duration: 3600,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [idle, offset, reduced, single]);

  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(dragX.value) / (activeW * SWIPE_RATIO));
    const goingNext = dragX.value < 0;
    const goingPrev = dragX.value > 0;
    const idleX = reduced || Math.abs(dragX.value) > 2 ? 0 : idle.value * 2;

    const activeLeft = (stageWidth - activeW) / 2;
    // Next peeks from the right; previous peeks from the left.
    const nextLeft = stageWidth - peekW * 0.55;
    const prevLeft = -peekW * 0.45;
    const peekH = STAGE_H * 0.78;
    const activeH = STAGE_H;
    const peekTop = (STAGE_H - peekH) / 2;

    if (single || offset === 0) {
      const rotate = reduced ? 0 : (dragX.value / activeW) * MAX_ROTATE;
      const scale = reduced
        ? 1
        : interpolate(Math.abs(dragX.value), [0, activeW * 0.5], [1, 0.96], Extrapolation.CLAMP);
      return {
        zIndex: 40,
        left: activeLeft,
        top: 0,
        width: activeW,
        height: activeH,
        transform: [{ translateX: dragX.value }, { rotate: `${rotate}deg` }, { scale }],
      };
    }

    if (offset === 1) {
      // Next → morph into active when swiping forward.
      const p = goingNext ? progress : 0;
      return {
        zIndex: 20,
        left: interpolate(p, [0, 1], [nextLeft, activeLeft], Extrapolation.CLAMP) + idleX,
        top: interpolate(p, [0, 1], [peekTop, 0], Extrapolation.CLAMP),
        width: interpolate(p, [0, 1], [peekW, activeW], Extrapolation.CLAMP),
        height: interpolate(p, [0, 1], [peekH, activeH], Extrapolation.CLAMP),
        opacity: interpolate(p, [0, 1], [0.9, 1], Extrapolation.CLAMP),
        transform: [
          {
            scale: interpolate(p, [0, 1], [0.94, 1], Extrapolation.CLAMP),
          },
        ],
      };
    }

    if (offset === -1) {
      // Previous → morph into active when swiping backward.
      const p = goingPrev ? progress : 0;
      return {
        zIndex: 20,
        left: interpolate(p, [0, 1], [prevLeft, activeLeft], Extrapolation.CLAMP) + idleX,
        top: interpolate(p, [0, 1], [peekTop, 0], Extrapolation.CLAMP),
        width: interpolate(p, [0, 1], [peekW, activeW], Extrapolation.CLAMP),
        height: interpolate(p, [0, 1], [peekH, activeH], Extrapolation.CLAMP),
        opacity: interpolate(p, [0, 1], [0.88, 1], Extrapolation.CLAMP),
        transform: [
          {
            scale: interpolate(p, [0, 1], [0.94, 1], Extrapolation.CLAMP),
          },
        ],
      };
    }

    return { zIndex: 1, opacity: 0, width: 0, height: 0 };
  });

  return (
    <Animated.View
      pointerEvents={offset === 0 ? 'auto' : 'box-none'}
      style={[styles.layer, style]}
    >
      {children}
    </Animated.View>
  );
}

/** Lightweight peek — static poster strip only, no video player. */
function FreshTakePeek({
  entry,
  now,
  onPress,
}: {
  entry: FreshTakeEntry;
  now: number;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  const accent = arenaAccentForHood(entry.take.hood, t.scheme, entry.take.id);
  const pulse = takePulse(entry.take, now);
  const pulseTone = pulseAccent(pulse, t.scheme);
  const hood = HOOD_LABEL[entry.take.hood] ?? entry.take.hood;
  const mediaUrl = entry.take.media?.url;
  const isVideo = entry.take.media?.kind === 'video';

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Show ${entry.take.text}`}
      style={[
        styles.peek,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          shadowColor: t.shadowColor,
        },
      ]}
    >
      {mediaUrl ? (
        <View style={[styles.peekMedia, { backgroundColor: t.surfaceMuted }]}>
          <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(8,8,11,0.55)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {isVideo ? (
            <View style={styles.peekPlay} pointerEvents="none">
              <Text allowFontScaling={false} style={styles.peekPlayText}>
                ▶
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={[styles.peekBlob, { backgroundColor: accent.soft }]} />
      )}
      <View style={styles.peekBody}>
        {pulse && pulseTone ? (
          <Text allowFontScaling={false} style={[styles.peekPulse, { color: pulseTone.ink }]}>
            {pulseLabel(pulse)}
          </Text>
        ) : (
          <Text allowFontScaling={false} style={[styles.peekPulse, { color: accent.ink }]}>
            {hood}
          </Text>
        )}
        <Text
          allowFontScaling={false}
          numberOfLines={3}
          style={[styles.peekTitle, { color: t.textPrimary }]}
        >
          {entry.take.text}
        </Text>
        <Text allowFontScaling={false} style={[styles.peekMeta, { color: t.textMuted }]}>
          @{entry.author.handle} · {compact(entry.take.reactions)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'center',
    position: 'relative',
  },
  layer: {
    position: 'absolute',
  },
  peek: {
    flex: 1,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  peekBlob: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    top: -28,
    right: -20,
  },
  peekMedia: {
    height: 118,
    width: '100%',
  },
  peekPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peekPlayText: {
    color: '#FAFAF8',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 6,
  },
  peekBody: {
    flex: 1,
    padding: space.md,
    gap: 6,
    justifyContent: 'center',
  },
  peekPulse: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  peekTitle: {
    ...typeScale.editorial,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  peekMeta: {
    ...typeScale.caption,
    fontSize: 11,
  },
  tapNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenX,
    paddingTop: space.xs,
  },
  tapHit: {
    minHeight: layout.hit,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  tapLabel: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '600',
  },
});
