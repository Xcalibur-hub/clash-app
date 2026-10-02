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
import type { LiveArenaTopic, Stance } from '../../services/liveArenaService';
import type { HoodId } from '../../store/types';
import { layout, radius, space, spring, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { ArenaTopicDeckCard, type DeckCardTone } from './ArenaTopicDeckCard';
import { ArenaTopicDeckPagination } from './ArenaTopicDeckPagination';

/** Designed stage — tall enough for asymmetric peeks without crowding Fresh Takes. */
const STAGE_HEIGHT = 412;
const MAX_VISIBLE = 3;
const SWIPE_RATIO = 0.18;
const VELOCITY = 620;
const MAX_ROTATE_DEG = 3.6;
const FOR_YOU = 'for-you';

type SlotLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
  rotate: number;
};

export interface ArenaTopicDeckProps {
  topics: LiveArenaTopic[];
  onOpen: (topicId: string) => void;
  onChoose: (topicId: string, stance: Stance) => void;
  onWatch: (topicId: string) => void;
  onEnter: (topicId: string, roomId: string | null) => void;
  onJoinDebate: (topicId: string, roomId: string | null) => void;
}

/**
 * Signature Arena home deck — asymmetric editorial stage for live Topics.
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
  const stageWidth = windowWidth;
  const layouts = React.useMemo(() => slotLayouts(stageWidth), [stageWidth]);
  const activeW = layouts[0].width;
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
  const single = filtered.length === 1;
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
      const fly = direction * (activeW * 1.12);
      dragX.value = withSpring(fly, { damping: 22, stiffness: 175, mass: 0.85 }, (done) => {
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

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduced && itemCount > 1)
        .activeOffsetX([-12, 12])
        .failOffsetY([-28, 28])
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
        <Text allowFontScaling={false} style={[styles.sectionSub, { color: t.textMuted }]}>
          Debates happening right now
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
            <View style={[styles.stage, { width: stageWidth, height: STAGE_HEIGHT }]}>
              {slots.map((slotIndex) => {
                const depth = slotIndex - index;
                const topic = filtered[slotIndex];
                if (!topic) return null;
                const tone = ((slotIndex + topic.id.length) % 3) as DeckCardTone;
                return (
                  <DeckLayer
                    key={topic.id}
                    depth={depth}
                    dragX={dragX}
                    reduced={Boolean(reduced)}
                    layouts={layouts}
                    single={single}
                    activeWidth={activeW}
                    stageWidth={stageWidth}
                  >
                    <ArenaTopicDeckCard
                      topic={topic}
                      active={depth === 0}
                      tone={depth === 0 ? 0 : tone === 0 ? 1 : tone}
                      onOpen={() => onOpen(topic.id)}
                      onChoose={(stance) => onChoose(topic.id, stance)}
                      onWatch={() => onWatch(topic.id)}
                      onEnter={() => onEnter(topic.id, topic.viewerRoomId)}
                      onJoinDebate={() => onJoinDebate(topic.id, topic.viewerRoomId)}
                      onBringForward={depth > 0 ? () => goTo(slotIndex) : undefined}
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

/**
 * Rest poses for the asymmetric stage.
 * Depth 0 = hero, 1 = upper-right peek, 2 = lower accent peek.
 * Single-topic uses a centered hero (layouts[0] overridden in DeckLayer).
 */
function slotLayouts(stageWidth: number): [SlotLayout, SlotLayout, SlotLayout] {
  const activeW = Math.round(stageWidth * 0.8);
  const nextW = Math.round(stageWidth * 0.62);
  const thirdW = Math.round(stageWidth * 0.54);

  return [
    {
      width: activeW,
      height: 308,
      left: Math.round(stageWidth * 0.05),
      top: 78,
      rotate: -0.6,
    },
    {
      width: nextW,
      height: 168,
      left: Math.round(stageWidth * 0.34),
      top: 6,
      rotate: 3.2,
    },
    {
      width: thirdW,
      height: 142,
      left: Math.round(stageWidth * 0.08),
      top: 268,
      rotate: -2.4,
    },
  ];
}

function DeckLayer({
  children,
  depth,
  dragX,
  reduced,
  layouts,
  single,
  activeWidth,
  stageWidth,
}: {
  children: React.ReactNode;
  depth: number;
  dragX: SharedValue<number>;
  reduced: boolean;
  layouts: [SlotLayout, SlotLayout, SlotLayout];
  single: boolean;
  activeWidth: number;
  stageWidth: number;
}): React.JSX.Element {
  const idle = useSharedValue(0);

  React.useEffect(() => {
    if (reduced || single || depth === 0) {
      idle.value = 0;
      return;
    }
    const amp = depth === 1 ? 1 : -1;
    idle.value = withRepeat(
      withTiming(amp, { duration: 3400 + depth * 400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [depth, idle, reduced, single]);

  const style = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(dragX.value) / (activeWidth * SWIPE_RATIO));
    const goingNext = dragX.value < 0;
    const idleY = reduced || Math.abs(dragX.value) > 2 ? 0 : idle.value * 2.5;
    const idleX = reduced || Math.abs(dragX.value) > 2 ? 0 : idle.value * 1.5;

    // Single topic: one centered hero — never invent background cards.
    if (single) {
      const hero = layouts[0];
      return {
        zIndex: 40,
        left: Math.round((stageWidth - hero.width) / 2),
        top: 48,
        width: hero.width,
        height: hero.height + 28,
        transform: [{ rotate: '0deg' }, { scale: 1 }],
      };
    }

    if (depth === 0) {
      const rest = layouts[0];
      const rotate = reduced
        ? rest.rotate
        : rest.rotate + (dragX.value / activeWidth) * MAX_ROTATE_DEG;
      const scale = reduced
        ? 1
        : interpolate(Math.abs(dragX.value), [0, activeWidth * 0.55], [1, 0.94], Extrapolation.CLAMP);
      return {
        zIndex: 40,
        left: rest.left,
        top: rest.top,
        width: rest.width,
        height: rest.height,
        transform: [{ translateX: dragX.value }, { rotate: `${rotate}deg` }, { scale }],
      };
    }

    if (depth === 1) {
      const from = layouts[1];
      const to = layouts[0];
      const p = goingNext ? progress : 0;
      return {
        zIndex: 30,
        left: interpolate(p, [0, 1], [from.left, to.left], Extrapolation.CLAMP) + idleX,
        top: interpolate(p, [0, 1], [from.top, to.top], Extrapolation.CLAMP) + idleY,
        width: interpolate(p, [0, 1], [from.width, to.width], Extrapolation.CLAMP),
        height: interpolate(p, [0, 1], [from.height, to.height], Extrapolation.CLAMP),
        opacity: interpolate(p, [0, 1], [0.96, 1], Extrapolation.CLAMP),
        transform: [
          {
            rotate: `${interpolate(p, [0, 1], [from.rotate, to.rotate], Extrapolation.CLAMP)}deg`,
          },
        ],
      };
    }

    const from = layouts[2];
    const to = layouts[1];
    const p = goingNext ? progress : 0;
    return {
      zIndex: 20,
      left: interpolate(p, [0, 1], [from.left, to.left], Extrapolation.CLAMP) + idleX,
      top: interpolate(p, [0, 1], [from.top, to.top], Extrapolation.CLAMP) + idleY,
      width: interpolate(p, [0, 1], [from.width, to.width], Extrapolation.CLAMP),
      height: interpolate(p, [0, 1], [from.height, to.height], Extrapolation.CLAMP),
      opacity: interpolate(p, [0, 1], [0.88, 0.96], Extrapolation.CLAMP),
      transform: [
        {
          rotate: `${interpolate(p, [0, 1], [from.rotate, to.rotate], Extrapolation.CLAMP)}deg`,
        },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="auto" style={[styles.layer, style]}>
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
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  header: {
    paddingHorizontal: layout.screenX,
    gap: 4,
  },
  sectionTitle: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionSub: {
    ...typeScale.meta,
    fontSize: 13,
    marginBottom: space.xs,
  },
  chipScroll: {
    marginHorizontal: -layout.screenX,
    marginTop: space.xs,
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
    position: 'relative',
  },
  layer: {
    position: 'absolute',
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
