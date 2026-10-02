import React from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
import { HOOD_LABEL } from '../../data/hoods';
import type { LiveArenaTopic, Stance } from '../../services/liveArenaService';
import type { HoodId } from '../../store/types';
import { layout, radius, space, spring, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaTopicDeckCard } from './ArenaTopicDeckCard';
import { ArenaTopicDeckPagination } from './ArenaTopicDeckPagination';

const FRONT_WIDTH_RATIO = 0.9;
const CARD_HEIGHT = 348;
const MAX_VISIBLE = 3;
const SWIPE_RATIO = 0.2;
const VELOCITY = 640;
const MAX_ROTATE_DEG = 3.2;
const FOR_YOU = 'for-you';

export interface ArenaTopicDeckProps {
  topics: LiveArenaTopic[];
  onOpen: (topicId: string) => void;
  onChoose: (topicId: string, stance: Stance) => void;
  onWatch: (topicId: string) => void;
  onEnter: (topicId: string, roomId: string | null) => void;
  onJoinDebate: (topicId: string, roomId: string | null) => void;
}

/**
 * Signature Arena home deck — layered editorial cards for live Topics.
 * Filters appear only when topics carry at least two real hood values.
 */
export function ArenaTopicDeck({
  topics,
  onOpen,
  onChoose,
  onWatch,
  onEnter,
  onJoinDebate,
}: ArenaTopicDeckProps): React.JSX.Element | null {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.round(windowWidth * FRONT_WIDTH_RATIO);
  const stageWidth = windowWidth;
  const stageHeight = CARD_HEIGHT + 28;
  const reduced = useReducedMotion();
  const t = useThemeColors();

  const hoods = React.useMemo(() => uniqueHoods(topics), [topics]);
  const showFilters = hoods.length >= 2;
  const [filter, setFilter] = React.useState<string>(FOR_YOU);

  React.useEffect(() => {
    if (!showFilters || filter === FOR_YOU) return;
    if (!hoods.includes(filter)) setFilter(FOR_YOU);
  }, [filter, hoods, showFilters]);

  const filtered = React.useMemo(() => {
    if (!showFilters || filter === FOR_YOU) return topics;
    return topics.filter((topic) => topic.hood === filter);
  }, [filter, showFilters, topics]);

  const [index, setIndex] = React.useState(0);
  const indexSV = useSharedValue(0);
  const dragX = useSharedValue(0);
  const animating = useSharedValue(0);
  const itemCount = filtered.length;
  const itemKey = React.useMemo(() => filtered.map((topic) => topic.id).join('|'), [filtered]);

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
      const fly = direction * (cardWidth * 1.08);
      dragX.value = withSpring(fly, { damping: 24, stiffness: 190, mass: 0.85 }, (done) => {
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
        .activeOffsetX([-12, 12])
        .failOffsetY([-24, 24])
        .onBegin(() => {
          animating.value = 0;
        })
        .onUpdate((event) => {
          if (animating.value === 1) return;
          const atStart = indexSV.value === 0 && event.translationX > 0;
          const atEnd = indexSV.value === itemCount - 1 && event.translationX < 0;
          const damp = atStart || atEnd ? 0.26 : 1;
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

  const onFilter = React.useCallback(
    (next: string): void => {
      if (next === filter) return;
      hapticTap();
      setFilter(next);
    },
    [filter],
  );

  if (topics.length === 0) return null;

  const visibleSlots = Math.min(MAX_VISIBLE, Math.max(0, filtered.length - index));
  const slots = Array.from({ length: visibleSlots }, (_, offset) => index + offset).reverse();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
          TODAY'S ARENA
        </Text>
        {showFilters ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipScroll}
          >
            <FilterChip
              label="For You"
              active={filter === FOR_YOU}
              onPress={() => onFilter(FOR_YOU)}
            />
            {hoods.map((hood) => (
              <FilterChip
                key={hood}
                label={hoodDisplayName(hood)}
                active={filter === hood}
                onPress={() => onFilter(hood)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {filtered.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: t.surfaceMuted }]}>
          <Text allowFontScaling={false} style={[styles.emptyText, { color: t.textMuted }]}>
            No live topics in this category.
          </Text>
        </View>
      ) : (
        <View
          accessibilityLabel={`Today's Arena, card ${index + 1} of ${filtered.length}`}
          accessibilityActions={[
            ...(index > 0 ? [{ name: 'decrement' as const, label: 'Previous arena topic' }] : []),
            ...(index < filtered.length - 1
              ? [{ name: 'increment' as const, label: 'Next arena topic' }]
              : []),
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'decrement' && index > 0) {
              goTo(index - 1);
              announce(`Previous arena topic, ${index} of ${filtered.length}`);
            }
            if (event.nativeEvent.actionName === 'increment' && index < filtered.length - 1) {
              goTo(index + 1);
              announce(`Next arena topic, ${index + 2} of ${filtered.length}`);
            }
          }}
        >
          <GestureDetector gesture={pan}>
            <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
              {slots.map((slotIndex) => {
                const depth = slotIndex - index;
                const topic = filtered[slotIndex];
                if (!topic) return null;
                return (
                  <DeckLayer
                    key={topic.id}
                    depth={depth}
                    dragX={dragX}
                    reduced={Boolean(reduced)}
                    cardWidth={cardWidth}
                    stageWidth={stageWidth}
                    single={filtered.length === 1}
                  >
                    <ArenaTopicDeckCard
                      topic={topic}
                      active={depth === 0}
                      onOpen={() => onOpen(topic.id)}
                      onChoose={(stance) => onChoose(topic.id, stance)}
                      onWatch={() => onWatch(topic.id)}
                      onEnter={() => onEnter(topic.id, topic.viewerRoomId)}
                      onJoinDebate={() => onJoinDebate(topic.id, topic.viewerRoomId)}
                    />
                  </DeckLayer>
                );
              })}
            </View>
          </GestureDetector>

          <ArenaTopicDeckPagination index={index} total={filtered.length} onSelect={goTo} />

          {filtered.length > 1 && reduced ? (
            <View style={styles.tapNav}>
              <Pressable
                disabled={index <= 0}
                onPress={() => goTo(index - 1)}
                accessibilityRole="button"
                accessibilityLabel="Previous arena topic"
                style={[styles.tapHit, { opacity: index <= 0 ? 0.35 : 1 }]}
              >
                <Text allowFontScaling={false} style={[styles.tapLabel, { color: t.textSecondary }]}>
                  Previous
                </Text>
              </Pressable>
              <Pressable
                disabled={index >= filtered.length - 1}
                onPress={() => goTo(index + 1)}
                accessibilityRole="button"
                accessibilityLabel="Next arena topic"
                style={[styles.tapHit, { opacity: index >= filtered.length - 1 ? 0.35 : 1 }]}
              >
                <Text allowFontScaling={false} style={[styles.tapLabel, { color: t.textSecondary }]}>
                  Next
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function DeckLayer({
  children,
  depth,
  dragX,
  reduced,
  cardWidth,
  stageWidth,
  single,
}: {
  children: React.ReactNode;
  depth: number;
  dragX: SharedValue<number>;
  reduced: boolean;
  cardWidth: number;
  stageWidth: number;
  single: boolean;
}): React.JSX.Element {
  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(dragX.value) / (cardWidth * SWIPE_RATIO));
    const centerX = (stageWidth - cardWidth) / 2;

    if (depth === 0) {
      const rotate = reduced ? 0 : (dragX.value / cardWidth) * MAX_ROTATE_DEG;
      return {
        zIndex: 40,
        left: centerX,
        transform: [{ translateX: dragX.value }, { rotate: `${rotate}deg` }, { scale: 1 }],
      };
    }

    // Wallet-like stack: back cards peek above, slightly smaller, tiny X offset.
    const restScale = depth === 1 ? 0.965 : 0.93;
    const restY = depth === 1 ? -12 : -22;
    const restX = depth === 1 ? 6 : -4;

    const scale = single
      ? 1
      : interpolate(progress, [0, 1], [restScale, depth === 1 ? 1 : 0.965], Extrapolation.CLAMP);
    const translateY = single
      ? 0
      : interpolate(progress, [0, 1], [restY, depth === 1 ? 0 : -12], Extrapolation.CLAMP);
    const translateX = single
      ? 0
      : interpolate(progress, [0, 1], [restX, depth === 1 ? 0 : 6], Extrapolation.CLAMP);

    return {
      zIndex: 40 - depth,
      left: centerX,
      opacity: depth > 2 ? 0 : depth === 1 ? 0.92 : 0.78,
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  return (
    <Animated.View
      pointerEvents={depth === 0 ? 'auto' : 'none'}
      style={[styles.layer, { width: cardWidth, height: CARD_HEIGHT }, style]}
    >
      {children}
    </Animated.View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: active ? t.pill : t.surfaceMuted,
          borderColor: active ? t.pill : t.border,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.chipText, { color: active ? t.pillText : t.textSecondary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function uniqueHoods(topics: LiveArenaTopic[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const topic of topics) {
    const hood = topic.hood?.trim();
    if (!hood || seen.has(hood)) continue;
    seen.add(hood);
    out.push(hood);
  }
  return out;
}

function hoodDisplayName(hood: string): string {
  if (hood in HOOD_LABEL) return HOOD_LABEL[hood as HoodId];
  return hood.charAt(0).toUpperCase() + hood.slice(1);
}

const styles = StyleSheet.create({
  section: {
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  header: {
    paddingHorizontal: layout.screenX,
    gap: space.sm,
  },
  sectionTitle: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  chipScroll: {
    marginHorizontal: -layout.screenX,
  },
  chips: {
    paddingHorizontal: layout.screenX,
    gap: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  stage: {
    alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  layer: {
    position: 'absolute',
    bottom: 0,
  },
  empty: {
    marginHorizontal: layout.screenX,
    borderRadius: radius.lg,
    paddingVertical: space.xl,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  emptyText: {
    ...typeScale.meta,
    fontSize: 13,
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
