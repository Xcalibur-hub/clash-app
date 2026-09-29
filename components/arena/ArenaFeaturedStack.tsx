import React from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import type { Take, User } from '../../store';
import { duration, ease, layout, space, spring, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaStackCard } from './ArenaStackCard';
import { ArenaStackProgress } from './ArenaStackProgress';

const CARD_ASPECT = 0.78;
const MAX_VISIBLE = 3;
const SWIPE_RATIO = 0.22;
const VELOCITY = 780;
const MAX_ROTATE_DEG = 2.6;

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
 * Premium featured Take stack above the Arena feed.
 * Swipe navigates (not dismisses). Only the active card + two behind stay mounted.
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
  const cardWidth = Math.min(windowWidth - layout.screenX * 2, 420);
  const cardHeight = Math.round(cardWidth / CARD_ASPECT);
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
      dragX.value = withTiming(fly, { duration: reduced ? 1 : duration.base, easing: ease.out }, (done) => {
        if (done) {
          runOnJS(goTo)(next);
          dragX.value = 0;
          animating.value = 0;
        }
      });
    },
    [animating, cardWidth, dragX, goTo, indexSV, itemCount, reduced],
  );

  const cancelSwipe = React.useCallback((): void => {
    dragX.value = withSpring(0, spring.settle);
    animating.value = 0;
  }, [animating, dragX]);

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

  const onPrev = React.useCallback((): void => {
    if (index <= 0) return;
    goTo(index - 1);
    announce(`Previous featured take, ${index} of ${items.length}`);
  }, [announce, goTo, index, items.length]);

  const onNext = React.useCallback((): void => {
    if (index >= items.length - 1) return;
    goTo(index + 1);
    announce(`Next featured take, ${index + 2} of ${items.length}`);
  }, [announce, goTo, index, items.length]);

  if (loading) {
    return (
      <View style={styles.section}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary, alignSelf: 'flex-start', paddingHorizontal: layout.screenX }]}>
          Trending now
        </Text>
        <StackSkeleton width={cardWidth} height={cardHeight} muted={t.surfaceMuted} border={t.border} />
      </View>
    );
  }

  if (items.length === 0) return null;

  const visibleSlots = Math.min(MAX_VISIBLE, items.length - index);
  const slots = Array.from({ length: visibleSlots }, (_, offset) => index + offset).reverse();

  return (
    <View style={styles.section} accessibilityLabel="Trending Takes stack">
      <View style={styles.titleRow}>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
          Trending now
        </Text>
        {items.length > 1 ? (
          <View style={styles.nav}>
            <Pressable
              onPress={onPrev}
              disabled={index === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous featured take"
              hitSlop={8}
              style={[
                styles.navBtn,
                { borderColor: t.border, backgroundColor: t.surfaceMuted },
                index === 0 && styles.navDisabled,
              ]}
            >
              <Text allowFontScaling={false} style={[styles.navText, { color: t.textSecondary }]}>
                Prev
              </Text>
            </Pressable>
            <Pressable
              onPress={onNext}
              disabled={index >= items.length - 1}
              accessibilityRole="button"
              accessibilityLabel="Next featured take"
              hitSlop={8}
              style={[
                styles.navBtn,
                { borderColor: t.border, backgroundColor: t.surfaceMuted },
                index >= items.length - 1 && styles.navDisabled,
              ]}
            >
              <Text allowFontScaling={false} style={[styles.navText, { color: t.textSecondary }]}>
                Next
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.stage, { width: cardWidth, height: cardHeight + 8 }]}>
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
  single,
}: {
  children: React.ReactNode;
  depth: number;
  dragX: SharedValue<number>;
  reduced: boolean;
  cardWidth: number;
  cardHeight: number;
  single: boolean;
}): React.JSX.Element {
  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(dragX.value) / (cardWidth * SWIPE_RATIO));
    if (depth === 0) {
      const rotate = reduced ? 0 : (dragX.value / cardWidth) * MAX_ROTATE_DEG;
      return {
        zIndex: 30,
        transform: [
          { translateX: dragX.value },
          { rotate: `${rotate}deg` },
          { scale: 1 },
        ],
      };
    }

    const restScale = depth === 1 ? 0.94 : 0.88;
    const restY = depth === 1 ? 14 : 26;
    const restX = depth === 1 ? 10 : 18;
    const scale = single ? 1 : interpolate(progress, [0, 1], [restScale, depth === 1 ? 1 : 0.94], Extrapolation.CLAMP);
    const translateY = single ? 0 : interpolate(progress, [0, 1], [restY, depth === 1 ? 0 : 14], Extrapolation.CLAMP);
    const translateX = single ? 0 : interpolate(progress, [0, 1], [restX, depth === 1 ? 0 : 10], Extrapolation.CLAMP);
    return {
      zIndex: 30 - depth,
      opacity: depth > 2 ? 0 : 1,
      transform: [{ translateX }, { translateY }, { scale }],
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
  width,
  height,
  muted,
  border,
}: {
  width: number;
  height: number;
  muted: string;
  border: string;
}): React.JSX.Element {
  return (
    <View style={[styles.stage, { width, height: height + 8 }]}>
      <View
        style={[
          styles.skelBack,
          { width, height, backgroundColor: muted, borderColor: border, transform: [{ scale: 0.92 }, { translateY: 18 }] },
        ]}
      />
      <View style={[styles.skelFront, { width, height, backgroundColor: muted, borderColor: border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
    alignItems: 'center',
  },
  titleRow: {
    width: '100%',
    paddingHorizontal: layout.screenX,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typeScale.section,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  nav: { flexDirection: 'row', gap: space.sm },
  navBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  navDisabled: { opacity: 0.35 },
  navText: { ...typeScale.meta, fontSize: 12, fontWeight: '600' },
  stage: {
    alignSelf: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  skelBack: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skelFront: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
