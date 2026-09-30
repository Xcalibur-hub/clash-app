import React from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import type { Take, User } from '../../store';
import { spring, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaStackCard } from './ArenaStackCard';
import { ArenaStackProgress } from './ArenaStackProgress';

/** Front card width — leaves clear side peeks for the fan. */
const FRONT_WIDTH_RATIO = 0.82;
const CARD_ASPECT = 0.74;
const MAX_VISIBLE = 3;
const SWIPE_RATIO = 0.18;
const VELOCITY = 680;
const MAX_ROTATE_DEG = 4.5;

export interface ArenaFeaturedItem {
  take: Take;
  author: User;
  commentCount: number;
  isSaved: boolean;
  hasReacted: boolean;
}

export interface ArenaFeaturedStackProps {
  items: ArenaFeaturedItem[];
  loading?: boolean;
  onOpen: (takeId: string) => void;
  onReact: (take: Take) => void;
  onComment: (takeId: string) => void;
  onClash: (takeId: string) => void;
  onSave: (takeId: string) => void;
}

/**
 * Signature CLASH featured deck — tactile fan + continuous gesture progress.
 * Data/navigation contracts unchanged.
 */
export function ArenaFeaturedStack({
  items,
  loading = false,
  onOpen,
  onReact,
  onComment,
  onClash,
  onSave,
}: ArenaFeaturedStackProps): React.JSX.Element | null {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.round(windowWidth * FRONT_WIDTH_RATIO);
  const cardHeight = Math.round(cardWidth / CARD_ASPECT);
  const stageWidth = windowWidth;
  const stageHeight = cardHeight + 58;
  const screenFocused = useIsFocused();
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
      const fly = direction * (cardWidth * 1.15);
      dragX.value = withSpring(fly, { damping: 22, stiffness: 180, mass: 0.85 }, (done) => {
        if (done) {
          runOnJS(goTo)(next);
          dragX.value = 0;
          animating.value = 0;
        }
      });
    },
    [animating, cardWidth, dragX, goTo, indexSV, itemCount],
  );

  const cancelSwipe = React.useCallback((): void => {
    dragX.value = withSpring(0, spring.settle);
    animating.value = 0;
  }, [animating, dragX]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduced && itemCount > 1)
        .activeOffsetX([-10, 10])
        .failOffsetY([-22, 22])
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
          const threshold = cardWidth * SWIPE_RATIO;
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
    [animating, cancelSwipe, cardWidth, dragX, finishSwipe, indexSV, itemCount, reduced],
  );

  const announce = React.useCallback((label: string): void => {
    AccessibilityInfo.announceForAccessibility(label);
  }, []);

  if (loading) {
    return (
      <View style={styles.section}>
        <StackSkeleton
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          width={cardWidth}
          height={cardHeight}
          muted={t.surfaceMuted}
        />
      </View>
    );
  }

  if (items.length === 0) return null;

  const visibleSlots = Math.min(MAX_VISIBLE, items.length - index);
  const slots = Array.from({ length: visibleSlots }, (_, offset) => index + offset).reverse();

  return (
    <View
      style={styles.section}
      accessibilityLabel={`Trending Takes, card ${index + 1} of ${items.length}`}
      accessibilityActions={[
        ...(index > 0 ? [{ name: 'decrement' as const, label: 'Previous featured take' }] : []),
        ...(index < items.length - 1 ? [{ name: 'increment' as const, label: 'Next featured take' }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'decrement' && index > 0) {
          goTo(index - 1);
          announce(`Previous featured take, ${index} of ${items.length}`);
        }
        if (event.nativeEvent.actionName === 'increment' && index < items.length - 1) {
          goTo(index + 1);
          announce(`Next featured take, ${index + 2} of ${items.length}`);
        }
      }}
    >
      <GestureDetector gesture={pan}>
        <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
          {slots.map((slotIndex) => {
            const depth = slotIndex - index;
            const item = items[slotIndex];
            return (
              <StackLayer
                key={item.take.id}
                depth={depth}
                dragX={dragX}
                reduced={Boolean(reduced)}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                stageWidth={stageWidth}
                single={items.length === 1}
              >
                <ArenaStackCard
                  take={item.take}
                  author={item.author}
                  commentCount={item.commentCount}
                  isSaved={item.isSaved}
                  hasReacted={item.hasReacted}
                  active={depth === 0 && screenFocused}
                  screenFocused={screenFocused}
                  depth={depth}
                  onOpen={() => onOpen(item.take.id)}
                  onReact={() => onReact(item.take)}
                  onComment={() => onComment(item.take.id)}
                  onClash={() => onClash(item.take.id)}
                  onSave={() => onSave(item.take.id)}
                />
              </StackLayer>
            );
          })}
        </View>
      </GestureDetector>

      <ArenaStackProgress index={index} total={items.length} />
    </View>
  );
}

function StackLayer({
  children,
  depth,
  dragX,
  reduced,
  cardWidth,
  cardHeight,
  stageWidth,
  single,
}: {
  children: React.ReactNode;
  depth: number;
  dragX: SharedValue<number>;
  reduced: boolean;
  cardWidth: number;
  cardHeight: number;
  stageWidth: number;
  single: boolean;
}): React.JSX.Element {
  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(dragX.value) / (cardWidth * SWIPE_RATIO));
    const centerX = (stageWidth - cardWidth) / 2;

    if (depth === 0) {
      const rotate = reduced ? 0 : (dragX.value / cardWidth) * MAX_ROTATE_DEG;
      const lift = reduced ? 1 : 1 + Math.min(0.025, Math.abs(dragX.value) / cardWidth) * 0.035;
      return {
        zIndex: 40,
        left: centerX,
        transform: [
          { translateX: dragX.value },
          { rotate: `${rotate}deg` },
          { scale: lift },
        ],
      };
    }

    // Fan: second peeks right+down, third peeks left+further — media edges must read.
    const restScale = depth === 1 ? 0.93 : 0.87;
    const restY = depth === 1 ? 22 : 44;
    const restX = depth === 1 ? 32 : -28;
    const restRotate = depth === 1 ? 2 : -2.2;

    const scale = single
      ? 1
      : interpolate(progress, [0, 1], [restScale, depth === 1 ? 1 : 0.93], Extrapolation.CLAMP);
    const translateY = single
      ? 0
      : interpolate(progress, [0, 1], [restY, depth === 1 ? 0 : 22], Extrapolation.CLAMP);
    const translateX = single
      ? 0
      : interpolate(progress, [0, 1], [restX, depth === 1 ? 0 : 32], Extrapolation.CLAMP);
    const rotate = single
      ? 0
      : interpolate(progress, [0, 1], [restRotate, depth === 1 ? 0 : 2], Extrapolation.CLAMP);

    return {
      zIndex: 40 - depth,
      left: centerX,
      opacity: depth > 2 ? 0 : 1,
      transform: [{ translateX }, { translateY }, { rotate: `${rotate}deg` }, { scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents={depth === 0 ? 'auto' : 'none'}
      style={[styles.layer, { width: cardWidth, height: cardHeight }, style]}
    >
      {children}
    </Animated.View>
  );
}

function StackSkeleton({
  stageWidth,
  stageHeight,
  width,
  height,
  muted,
}: {
  stageWidth: number;
  stageHeight: number;
  width: number;
  height: number;
  muted: string;
}): React.JSX.Element {
  const left = (stageWidth - width) / 2;
  return (
    <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
      <View
        style={[
          styles.skel,
          {
            left: left - 20,
            width,
            height,
            backgroundColor: muted,
            transform: [{ scale: 0.88 }, { translateY: 38 }, { rotate: '-1.8deg' }],
            opacity: 0.55,
          },
        ]}
      />
      <View
        style={[
          styles.skel,
          {
            left: left + 22,
            width,
            height,
            backgroundColor: muted,
            transform: [{ scale: 0.94 }, { translateY: 18 }, { rotate: '1.6deg' }],
            opacity: 0.78,
          },
        ]}
      />
      <View style={[styles.skel, { left, width, height, backgroundColor: muted }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 2,
    paddingBottom: 2,
    gap: 8,
    alignItems: 'center',
  },
  stage: {
    alignSelf: 'center',
    justifyContent: 'flex-start',
  },
  layer: {
    position: 'absolute',
    top: 0,
  },
  skel: {
    position: 'absolute',
    top: 0,
    borderRadius: 30,
  },
});
